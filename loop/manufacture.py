"""
manufacture.py — what would it cost, how would you make it, how long would it take?

Every number the manufacturability agents report comes from this file. The
agents choose a route and explain it; the arithmetic happens here, where it
can be read, argued with and changed. Nothing in this module calls a
language model.

THREE QUESTIONS, THREE MODELS

  route(...)  Which production route fits this structure: ordinary organic
              synthesis, a chemo-enzymatic route with a named enzyme class,
              fermentation in an engineered host, or solid-phase peptide
              synthesis? Decided from substructure, stereochemistry and
              complexity, with the matched motif reported.

  cost(...)   Cost per gram of isolated compound at a stated scale, built
              bottom-up from process mass intensity, overall yield, and
              operator time, with premiums for the operations the structure
              forces on you (chiral resolution, precious-metal coupling,
              chromatography, cryogenics). Reported as a range.

  time(...)   Weeks to first delivery of that quantity, split into route
              development, campaign execution and release testing.

HOW HONEST IS THIS

  It is a process-economics ESTIMATE, of the kind used to triage a
  candidate list — not a quotation and not a costed route. Three things
  limit it, and they are stated in the output as well as here:

    1. The step count is a heuristic from rings, stereocentres and heavy
       atoms (critics.estimate_steps). It is not a retrosynthesis. No
       reaction is proposed, so no real route is priced.
    2. The cost factors below are defaults chosen to sit inside published
       ranges for early-phase pharmaceutical manufacture. They are not
       supplier quotes, and nothing here is calibrated against real process
       data. Calibrating them is the obvious next piece of work, and until
       that happens the absolute numbers should be read as order of
       magnitude. The RANKING between candidates is the part worth trusting.
    3. Building-block availability is approximated from elements and
       halogen density, not from a supplier catalogue.

  Every assumption is a named entry in ASSUMPTIONS with a unit, a plausible
  range and where it came from. The UI shows them, and any of them can be
  overridden per call, which is the only responsible way to present a
  number like this: let the reader move it and watch what happens.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from rdkit import Chem, RDLogger

import critics

RDLogger.DisableLog("rdApp.*")


# ═════════════════════════════════════════════════════════════════════════════
# ASSUMPTIONS — the only numbers in this file
#
# provenance:
#   "rule of thumb"  typical of early-phase pharmaceutical process chemistry
#   "convention"     a definition we chose, stated so it can be changed
#   "uncalibrated"   our estimate, not validated against process data
# ═════════════════════════════════════════════════════════════════════════════
ASSUMPTIONS: dict[str, dict] = {
    "step_yield": {
        "value": 0.80, "unit": "fraction", "range": (0.65, 0.90),
        "provenance": "rule of thumb",
        "note": "Average isolated yield per step. Overall yield is this "
                "raised to the number of steps, which is why step count "
                "dominates everything downstream.",
    },
    "pmi_per_step": {
        "value": 8.0, "unit": "kg input / kg product / step", "range": (5, 15),
        "provenance": "rule of thumb",
        "note": "Process mass intensity contributed by one step at 100% "
                "yield — solvents, reagents, water, work-up. Divided by "
                "overall yield to give the route's PMI.",
    },
    "material_cost_per_kg": {
        "value": 150.0, "unit": "USD / kg input", "range": (60, 400),
        "provenance": "uncalibrated",
        "note": "Blended cost of everything that goes in, at 10 kg scale: "
                "building blocks, reagents, solvent, and its disposal. "
                "Scaled for smaller campaigns by procurement_scale_exponent.",
    },
    "operator_day_cost": {
        "value": 1800.0, "unit": "USD / operator-day", "range": (900, 3000),
        "provenance": "uncalibrated",
        "note": "Fully loaded cost of one person-day in a kilo-lab, "
                "including plant time, analytics and overhead. A CRO quote "
                "sits at the top of this range; an academic lab far below.",
    },
    "days_per_step": {
        "value": 3.0, "unit": "operator-days / step / batch", "range": (1.5, 6),
        "provenance": "rule of thumb",
        "note": "Charge, react, quench, work up, isolate. Purification is "
                "charged separately.",
    },
    "purification_days": {
        "value": 1.5, "unit": "operator-days / step / batch", "range": (0.5, 4),
        "provenance": "rule of thumb",
        "note": "Crystallisation if you are lucky. Chromatography costs "
                "more and is charged a premium on top.",
    },
    "batch_size_kg": {
        "value": 2.0, "unit": "kg product / batch", "range": (0.5, 20),
        "provenance": "convention",
        "note": "Kilo-lab batch size. More product means repeat batches, "
                "which is why cost per gram falls sub-linearly with scale.",
    },
    "batch_learning_exponent": {
        "value": 0.80, "unit": "exponent", "range": (0.6, 1.0),
        "provenance": "rule of thumb",
        "note": "Operator time for n batches goes as n^exponent: the second "
                "batch of the same step is quicker than the first.",
    },
    "procurement_scale_exponent": {
        "value": -0.12, "unit": "exponent", "range": (-0.3, 0.0),
        "provenance": "uncalibrated",
        "note": "Material cost per kg against scale. Buying 10× more "
                "material makes it modestly cheaper per kg.",
    },
    "chiral_resolution_premium": {
        "value": 1.35, "unit": "multiplier per resolved centre", "range": (1.1, 2.0),
        "provenance": "rule of thumb",
        "note": "Classical resolution throws away at least half the "
                "material and needs a separation; asymmetric catalysis "
                "trades that for catalyst cost.",
    },
    "precious_metal_premium": {
        "value": 1.18, "unit": "multiplier", "range": (1.05, 1.5),
        "provenance": "uncalibrated",
        "note": "Palladium-catalysed coupling: catalyst and ligand, plus "
                "metal scavenging and ICP-MS release testing.",
    },
    "chromatography_premium": {
        "value": 1.25, "unit": "multiplier", "range": (1.1, 1.8),
        "provenance": "rule of thumb",
        "note": "Charged when the structure gives little hope of a "
                "crystalline intermediate: silica, solvent and time.",
    },
    "specialist_building_block_premium": {
        "value": 1.30, "unit": "multiplier", "range": (1.05, 2.5),
        "provenance": "uncalibrated",
        "note": "Densely halogenated or unusual-element cores must be "
                "bought rather than made, and often cannot be bought at all.",
    },
    "enzyme_cost_per_kg_product": {
        "value": 900.0, "unit": "USD / kg product", "range": (200, 4000),
        "provenance": "uncalibrated",
        "note": "Immobilised enzyme consumed per kg of product in a "
                "biocatalytic step, assuming it is recycled a few times.",
    },
    "enzyme_development_cost": {
        "value": 80000.0, "unit": "USD, one-off", "range": (20000, 400000),
        "provenance": "uncalibrated",
        "note": "Screening a panel and, if needed, a round of directed "
                "evolution to make one step work on your substrate. Paid "
                "once, not per gram.",
    },
    "biocatalysis_step_yield": {
        "value": 0.88, "unit": "fraction", "range": (0.75, 0.96),
        "provenance": "rule of thumb",
        "note": "An enzymatic step that works tends to be high-yielding and "
                "selective, which is the point of using one.",
    },
    "fermentation_titre_g_per_l": {
        "value": 0.5, "unit": "g / L broth", "range": (0.05, 5.0),
        "provenance": "uncalibrated",
        "note": "Titre of a secondary metabolite in an engineered host "
                "after initial strain work. Orders of magnitude of headroom "
                "exist here, which is why the cost range is wide.",
    },
    "fermenter_volume_l": {
        "value": 2000.0, "unit": "L", "range": (100, 20000),
        "provenance": "convention",
        "note": "Working volume of the vessel assumed for a campaign.",
    },
    "fermentation_batch_cost": {
        "value": 45000.0, "unit": "USD / batch", "range": (15000, 150000),
        "provenance": "uncalibrated",
        "note": "Media, utilities, sterilisation, operators and QC for one "
                "fermentation, excluding recovery.",
    },
    "downstream_recovery": {
        "value": 0.45, "unit": "fraction", "range": (0.2, 0.75),
        "provenance": "rule of thumb",
        "note": "Fraction of the titre that survives extraction and "
                "purification to isolated compound.",
    },
    "downstream_cost_fraction": {
        "value": 0.7, "unit": "fraction of fermentation cost", "range": (0.3, 1.5),
        "provenance": "uncalibrated",
        "note": "Recovery and purification cost, as a fraction of the "
                "fermentation cost it follows.",
    },
    "strain_development_cost": {
        "value": 350000.0, "unit": "USD, one-off", "range": (100000, 2000000),
        "provenance": "uncalibrated",
        "note": "Pathway assembly, host engineering and titre improvement "
                "to reach the assumed titre. Paid once.",
    },
    "release_testing_weeks": {
        "value": 3.0, "unit": "weeks", "range": (2, 8),
        "provenance": "rule of thumb",
        "note": "Analytical release of the final batch: identity, assay, "
                "impurities, residual solvent and metals.",
    },
    "uncertainty_factor": {
        "value": 2.2, "unit": "multiplier", "range": (1.5, 4.0),
        "provenance": "convention",
        "note": "The quoted range is the point estimate divided and "
                "multiplied by this. It is deliberately wide: an "
                "uncalibrated model with a narrow error bar would be worse "
                "than no number at all.",
    },
}

# Scales offered in the interface. "What it is for" matters more than the
# number: a tox batch and a Phase II campaign are different questions.
SCALE_PRESETS = [
    {"grams": 10.0, "label": "10 g", "purpose": "in vivo pharmacology"},
    {"grams": 100.0, "label": "100 g", "purpose": "GLP toxicology batch"},
    {"grams": 1000.0, "label": "1 kg", "purpose": "first clinical supply"},
    {"grams": 10000.0, "label": "10 kg", "purpose": "Phase II campaign"},
]
REFERENCE_SCALE_G = 10000.0     # the scale material_cost_per_kg refers to


def A(key: str, overrides: dict | None = None) -> float:
    """An assumption's value, with any override applied."""
    if overrides and key in overrides and overrides[key] is not None:
        return float(overrides[key])
    return float(ASSUMPTIONS[key]["value"])


def assumptions_table(overrides: dict | None = None) -> list[dict]:
    """Everything in ASSUMPTIONS, flattened for display."""
    out = []
    for key, spec in ASSUMPTIONS.items():
        out.append({
            "key": key,
            "value": A(key, overrides),
            "default": spec["value"],
            "overridden": bool(overrides and overrides.get(key) is not None),
            "unit": spec["unit"],
            "min": spec["range"][0],
            "max": spec["range"][1],
            "provenance": spec["provenance"],
            "note": spec["note"],
        })
    return out


# ═════════════════════════════════════════════════════════════════════════════
# STRUCTURE READING — what does this molecule force on the process?
# ═════════════════════════════════════════════════════════════════════════════
# Each entry: SMARTS, enzyme class, the transformation it would replace, and
# what has to be true for it to be worth doing. These are the enzyme classes
# that are genuinely routine in manufacturing today; speculative chemistry is
# deliberately absent.
ENZYME_MOTIFS = [
    {
        "key": "kred",
        # a secondary alcohol on a CH with two carbon substituents: the
        # carbon a ketoreductase would have set
        "smarts": "[#6][CX4H1]([OX2H1])[#6]",
        "enzyme": "ketoreductase (KRED)",
        "replaces": "asymmetric reduction of the corresponding ketone, or "
                    "resolution of the racemic alcohol",
        "why": "a secondary alcohol is the classic ketoreductase product: "
               "reduce the ketone enantioselectively instead of resolving "
               "the racemate",
    },
    {
        "key": "transaminase",
        # a primary amine on a CH flanked by two carbons: a chiral amine,
        # which is the transformation transaminases are used for
        "smarts": "[#6][CX4H1]([NX3;H2;!$(N-C=O);!$(N-S(=O)=O)])[#6]",
        "enzyme": "ω-transaminase (ATA)",
        "replaces": "reductive amination plus chiral resolution",
        "why": "a chiral amine on a carbon skeleton is what transaminases "
               "are used for at scale; sitagliptin is the textbook case",
    },
    {
        "key": "lipase",
        "smarts": "[CX3](=O)[OX2H0][#6]",
        "enzyme": "lipase / esterase (e.g. CAL-B)",
        "replaces": "chemical hydrolysis or classical resolution of an ester",
        "why": "selective ester hydrolysis or kinetic resolution under mild "
               "conditions, with no protecting-group work",
    },
    {
        "key": "nitrilase",
        "smarts": "[NX1]#[CX2][#6]",
        "enzyme": "nitrilase / nitrile hydratase",
        "replaces": "strong-acid or strong-base nitrile hydrolysis",
        "why": "converts the nitrile to the acid or amide without the "
               "forcing conditions the chemical route needs",
    },
    {
        "key": "epoxide_hydrolase",
        "smarts": "C1OC1",
        "enzyme": "epoxide hydrolase",
        "replaces": "non-selective epoxide opening",
        "why": "enantioselective opening to the diol, and it removes a "
               "reactive group the process critic flags anyway",
    },
    {
        "key": "p450",
        "smarts": "[c][OX2H1]",
        "enzyme": "cytochrome P450 / unspecific peroxygenase",
        "replaces": "directed ortho-metalation or a protecting-group "
                    "sequence to install the phenol",
        "why": "late-stage aromatic hydroxylation avoids carrying a "
               "protected phenol through the route, though substrate scope "
               "is the limiting factor in practice",
    },
    {
        "key": "amide_synthetase",
        "smarts": "[#6][CX3](=O)[NX3;H1][#6]",
        "enzyme": "amide bond synthetase / acyltransferase",
        "replaces": "carbodiimide or acid-chloride amide coupling",
        "why": "removes a coupling reagent and its by-product from the "
               "waste stream; newer than the others, so treat as "
               "exploratory rather than routine",
    },
]

# Operations the structure implies, each with the premium it triggers.
PROCESS_FLAGS = [
    {
        "key": "precious_metal_coupling",
        "premium": "precious_metal_premium",
        "label": "palladium-catalysed coupling",
        "detail": "A biaryl or aryl–amine bond is almost always made by "
                  "Suzuki or Buchwald coupling. That brings catalyst cost, "
                  "palladium scavenging and a metal specification on the "
                  "final compound.",
    },
    {
        "key": "chiral_resolution",
        "premium": "chiral_resolution_premium",
        "label": "stereocentre control",
        "detail": "Each stereocentre has to be set or separated. Both cost "
                  "yield; a resolution discards at least half the material.",
    },
    {
        "key": "chromatography",
        "premium": "chromatography_premium",
        "label": "chromatographic purification",
        "detail": "Flexible, greasy or highly functionalised molecules "
                  "rarely crystallise cleanly, so purification is "
                  "chromatographic — the usual bottleneck on scale-up.",
    },
    {
        "key": "specialist_building_blocks",
        "premium": "specialist_building_block_premium",
        "label": "specialist building blocks",
        "detail": "Dense halogenation or an uncommon element means the core "
                  "must be purchased, at a specialist price and sometimes "
                  "not at all.",
    },
]


def _has(mol, smarts: str) -> int:
    patt = Chem.MolFromSmarts(smarts)
    if patt is None:
        return 0
    return len(mol.GetSubstructMatches(patt))


def read_structure(smiles: str) -> dict:
    """
    Everything the three models need, read once from the structure plus the
    critics' own descriptors. No cost or time logic here.
    """
    assessment = critics.assess(smiles)
    syn = assessment.get("synthesisability", {})
    metrics = dict(syn.get("metrics") or {})
    mol = Chem.MolFromSmiles((smiles or "").strip())
    if mol is None:
        return {"ok": False, "error": "SMILES did not parse"}

    # A peptide linkage: carbonyl between two sp3 carbons through an N-H.
    # Benzamides and anilides do not match (their carbonyl carbon is
    # aromatic), which is what keeps ordinary amide-containing drugs out.
    peptide_bonds = _has(mol, "[CX4][CX3](=O)[NX3;H1][CX4]")
    amides = _has(mol, "[CX3](=O)[NX3]")
    heavy = metrics.get("heavy_atoms") or mol.GetNumHeavyAtoms()

    enzyme_hits = []
    for motif in ENZYME_MOTIFS:
        n = _has(mol, motif["smarts"])
        if n:
            enzyme_hits.append({**{k: v for k, v in motif.items()
                                   if k != "smarts"},
                                "matches": n, "smarts": motif["smarts"]})

    flags = {
        # a biaryl bond, or an aryl–amine bond that is not an anilide or
        # sulfonanilide: both are normally made by palladium catalysis
        "precious_metal_coupling": bool(
            _has(mol, "c-c")
            or _has(mol, "[c][NX3;!$(N=O);!$(N-C=O);!$(N-S(=O)=O)]")),
        "chiral_resolution": (metrics.get("stereocentres") or 0) > 0,
        "chromatography": bool(
            (metrics.get("rotatable_bonds") or 0) > 7
            or (metrics.get("logp") or 0) > 4.5
            or (metrics.get("tpsa") or 0) > 120),
        # There was a "cryogenic chemistry" flag here, triggered by a
        # halogen on a di-substituted aromatic ring. It fired on almost
        # every fluoroarene, including molecules whose obvious route is an
        # amide coupling that never goes near an organolithium. Whether a
        # route needs low-temperature plant depends on the disconnection a
        # chemist picks, which this project does not model, so the flag
        # and its cost premium were removed rather than left to inflate
        # every estimate by a plausible-looking 12%.
        "specialist_building_blocks": bool(
            (metrics.get("halogen_density") or 0) > 0.18
            or (metrics.get("unusual_elements") or 0) > 0),
    }

    return {
        "ok": True,
        "smiles": smiles,
        "metrics": metrics,
        "estimated_steps": assessment.get("estimated_steps"),
        "sa_score": assessment.get("sa_score"),
        "route_complexity": assessment.get("route_complexity"),
        "critic_verdict": assessment.get("verdict"),
        "manufacturable": assessment.get("manufacturable"),
        "rejections": assessment.get("rejections", []),
        "group_flags": assessment.get("process", {}).get("group_flags", []),
        "enzyme_motifs": enzyme_hits,
        "process_flags": flags,
        "peptide_bonds": peptide_bonds,
        "amide_bonds": amides,
        "heavy_atoms": heavy,
        # Two linkages is a tripeptide. The stereocentre condition keeps a
        # simple bis-amide linker from being mistaken for a peptide.
        "is_peptide_like": peptide_bonds >= 2 and (
            (metrics.get("stereocentres") or 0) >= 1 or peptide_bonds >= 3),
        "is_natural_product_like": bool(
            (metrics.get("stereocentres") or 0) >= 4
            and (metrics.get("fsp3") or 0) >= 0.45
            and ((metrics.get("fused_ring_systems") or 0) >= 3
                 or (metrics.get("macrocycle_size") or 0) > 0)),
    }


# ═════════════════════════════════════════════════════════════════════════════
# ROUTE SELECTION
# ═════════════════════════════════════════════════════════════════════════════
ROUTES = {
    "chemical_synthesis": "Organic chemical synthesis",
    "chemo_enzymatic": "Chemo-enzymatic synthesis (biocatalytic step)",
    "fermentation": "Fermentation in an engineered host",
    "spps": "Solid-phase peptide synthesis",
}


@dataclass
class RouteOption:
    route: str
    label: str
    fit: str                      # "recommended" | "viable" | "poor"
    reasons: list[str] = field(default_factory=list)
    enzymes: list[dict] = field(default_factory=list)
    caveats: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "route": self.route, "label": self.label, "fit": self.fit,
            "reasons": self.reasons, "enzymes": self.enzymes,
            "caveats": self.caveats,
        }


def route_options(profile: dict) -> list[dict]:
    """
    Rank the production routes for one structure.

    Deliberately conservative: ordinary synthesis is the default for a
    synthetic small molecule, biocatalysis is proposed only where a named
    enzyme class has a matching motif, and fermentation only where total
    synthesis is genuinely the wrong tool.
    """
    m = profile["metrics"]
    steps = profile["estimated_steps"] or 0
    centres = m.get("stereocentres") or 0
    options: list[RouteOption] = []

    # ── 1. ordinary organic synthesis ────────────────────────────────────
    chem = RouteOption("chemical_synthesis", ROUTES["chemical_synthesis"],
                       "recommended")
    chem.reasons.append(
        f"{m.get('mw', 0):.0f} Da synthetic small molecule: made by organic "
        f"synthesis, in roughly {steps} steps on this estimate")
    if centres == 0:
        chem.reasons.append("achiral, so no stereochemical control is needed")
    if steps > 12:
        chem.fit = "poor"
        chem.caveats.append(
            f"a {steps}-step linear sequence is not a practical "
            f"manufacturing route; overall yield collapses and every step "
            f"adds an impurity to control")
    elif steps > 8:
        chem.fit = "viable"
        chem.caveats.append(f"{steps} steps is long: expect route scouting "
                            f"to look for a convergent alternative")
    if centres >= 3:
        chem.caveats.append(
            f"{centres} stereocentres need setting or separating, which is "
            f"where the cost and the yield loss sit")
    options.append(chem)

    # ── 2. chemo-enzymatic ───────────────────────────────────────────────
    hits = profile["enzyme_motifs"]
    if hits:
        routine = [h for h in hits if h["key"] != "amide_synthetase"]
        enz = RouteOption("chemo_enzymatic", ROUTES["chemo_enzymatic"],
                          "viable")
        enz.enzymes = hits
        for h in hits[:3]:
            enz.reasons.append(
                f"{h['matches']}× {h['key'].replace('_', ' ')} motif → "
                f"{h['enzyme']}: {h['why']}")
        if steps > 14:
            enz.fit = "poor"
            enz.caveats.append(
                f"an enzymatic step fixes one transformation, not a "
                f"{steps}-step sequence: the length of the route is the "
                f"problem here, and biocatalysis does not shorten it")
        elif centres >= 1 and routine:
            enz.fit = "recommended"
            enz.reasons.append(
                "the enzymatic step sets a stereocentre directly, replacing "
                "a resolution that would throw away half the material")
        enz.caveats.append(
            "an enzyme has to be screened against this exact substrate "
            "before any of this is real; the motif says the chemistry is "
            "plausible, not that an enzyme accepts the molecule")
        enz.caveats.append(
            "development is a one-off cost paid before the first gram, "
            "shown separately from cost per gram")
        options.append(enz)

    # ── 3. fermentation ──────────────────────────────────────────────────
    if profile["is_natural_product_like"] or steps > 14:
        ferm = RouteOption("fermentation", ROUTES["fermentation"],
                           "viable" if profile["is_natural_product_like"]
                           else "poor")
        if profile["is_natural_product_like"]:
            ferm.reasons.append(
                f"{centres} stereocentres, sp³ fraction "
                f"{m.get('fsp3', 0):.2f} and a polycyclic or macrocyclic "
                f"core: this is natural-product architecture, and such "
                f"compounds are usually produced biologically rather than "
                f"by total synthesis")
        else:
            ferm.reasons.append(
                f"the synthetic route is estimated at {steps} steps, so it "
                f"is worth asking whether a biosynthetic route exists at all")
        ferm.caveats.append(
            "only works if a biosynthetic pathway to this scaffold is known "
            "and can be expressed in a host — for a purely synthetic "
            "structure there is usually none, and this option is then a "
            "non-starter rather than an expensive alternative")
        ferm.caveats.append(
            "cost per gram depends on titre, which is the single number "
            "that decides whether a fermentation route is viable")
        options.append(ferm)

    # ── 4. peptide ───────────────────────────────────────────────────────
    if profile["is_peptide_like"]:
        pep = RouteOption("spps", ROUTES["spps"], "recommended")
        pep.reasons.append(
            f"{profile['peptide_bonds']} contiguous amide bonds in a "
            f"backbone: built on resin, not by solution-phase synthesis")
        pep.caveats.append("cost scales with residue count and with the "
                           "purity the final use demands")
        options.append(pep)
        for o in options:
            if o.route == "chemical_synthesis" and o.fit == "recommended":
                o.fit = "viable"

    # exactly one recommendation, picked by this order of preference
    preference = ["spps", "chemo_enzymatic", "chemical_synthesis",
                  "fermentation"]
    recommended = None
    for route in preference:
        for o in options:
            if o.route == route and o.fit == "recommended":
                recommended = o
                break
        if recommended:
            break
    if recommended is None:
        # nothing is a good fit: take the least bad, and say so
        order = {"viable": 0, "poor": 1}
        recommended = sorted(options, key=lambda o: order.get(o.fit, 2))[0]
    for o in options:
        if o is not recommended and o.fit == "recommended":
            o.fit = "viable"

    out = [o.as_dict() for o in options]
    for d in out:
        d["recommended"] = (d["route"] == recommended.route)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# COST
# ═════════════════════════════════════════════════════════════════════════════
def _band(value: float, factor: float) -> dict:
    return {
        "point": round(value, 2),
        "low": round(value / factor, 2),
        "high": round(value * factor, 2),
    }


def _chemical_cost(profile: dict, scale_g: float, route: str,
                   ov: dict | None) -> dict:
    m = profile["metrics"]
    steps = max(1, int(profile["estimated_steps"] or 1))
    centres = int(m.get("stereocentres") or 0)

    biocatalytic = route == "chemo_enzymatic"
    # Only the enzymatic step gets the better yield; the rest of the route
    # is ordinary chemistry, so blend rather than flattering the whole route.
    if biocatalytic:
        enzymatic_steps = min(steps, max(1, len(profile["enzyme_motifs"])))
        overall_yield = (A("biocatalysis_step_yield", ov) ** enzymatic_steps
                         * A("step_yield", ov) ** (steps - enzymatic_steps))
    else:
        enzymatic_steps = 0
        overall_yield = A("step_yield", ov) ** steps

    pmi = A("pmi_per_step", ov) * steps / max(overall_yield, 1e-6)
    if biocatalytic:
        # water replaces organic solvent in the enzymatic step, and a
        # resolution is avoided
        pmi *= 1 - 0.18 * (enzymatic_steps / steps)

    scale_kg = scale_g / 1000.0
    material_unit = (A("material_cost_per_kg", ov)
                     * (max(scale_g, 1.0) / REFERENCE_SCALE_G)
                     ** A("procurement_scale_exponent", ov))
    materials_per_g = pmi * material_unit / 1000.0

    batches = max(1.0, math.ceil(scale_kg / max(A("batch_size_kg", ov), 1e-6)))
    operator_days = (steps
                     * (A("days_per_step", ov) + A("purification_days", ov))
                     * batches ** A("batch_learning_exponent", ov))
    processing_total = operator_days * A("operator_day_cost", ov)
    processing_per_g = processing_total / max(scale_g, 1.0)

    enzyme_per_g = 0.0
    if biocatalytic:
        enzyme_per_g = A("enzyme_cost_per_kg_product", ov) / 1000.0

    base_per_g = materials_per_g + processing_per_g + enzyme_per_g

    premiums, multiplier = [], 1.0
    for flag in PROCESS_FLAGS:
        if not profile["process_flags"].get(flag["key"]):
            continue
        factor = A(flag["premium"], ov)
        if flag["key"] == "chiral_resolution":
            unresolved = max(0, centres - (1 if biocatalytic else 0))
            if unresolved == 0:
                premiums.append({
                    "label": flag["label"], "factor": 1.0,
                    "detail": "the enzymatic step sets the only stereocentre, "
                              "so no resolution is charged",
                })
                continue
            factor = factor ** min(unresolved, 3)
        multiplier *= factor
        premiums.append({"label": flag["label"], "factor": round(factor, 3),
                         "detail": flag["detail"]})

    per_gram = base_per_g * multiplier
    development = (A("enzyme_development_cost", ov) if biocatalytic else 0.0)

    not_viable = overall_yield < 0.03 or steps > 14
    return {
        "route": route,
        "scale_g": scale_g,
        "steps": steps,
        "overall_yield": round(overall_yield, 4),
        "pmi_kg_per_kg": round(pmi, 1),
        "cost_per_gram_usd": _band(per_gram, A("uncertainty_factor", ov)),
        "batch_total_usd": _band(per_gram * scale_g,
                                 A("uncertainty_factor", ov)),
        "one_off_development_usd": round(development),
        "breakdown": [
            {"item": "materials, solvent and waste",
             "usd_per_gram": round(materials_per_g * multiplier, 2),
             "basis": f"PMI {pmi:.0f} kg/kg × ${material_unit:.0f}/kg"},
            {"item": "processing, labour and plant",
             "usd_per_gram": round(processing_per_g * multiplier, 2),
             "basis": f"{operator_days:.0f} operator-days over "
                      f"{int(batches)} batch(es) × "
                      f"${A('operator_day_cost', ov):.0f}/day"},
        ] + ([{"item": "enzyme consumed",
               "usd_per_gram": round(enzyme_per_g * multiplier, 2),
               "basis": f"${A('enzyme_cost_per_kg_product', ov):.0f}/kg "
                        f"product"}] if biocatalytic else []),
        "premiums": premiums,
        "viable": not not_viable,
        "viability_note": (
            None if not not_viable else
            f"At {steps} estimated steps the overall yield is "
            f"{overall_yield * 100:.1f}% and the process mass intensity "
            f"{pmi:.0f} kg of input per kg of product. Treat this as 'not "
            f"manufacturable as drawn' rather than as a price: a route this "
            f"long would be redesigned, not costed."),
        "method": (
            ("A coupling cycle on resin is treated as a step here, so "
             "peptide synthesis shares the model below; it is the roughest "
             "of the four routes as a result. " if route == "spps" else "")
            + f"Cost per gram = (PMI × material cost + operator-days × day "
            f"rate{' + enzyme' if biocatalytic else ''}) ÷ {scale_g:.0f} g, "
            f"× {multiplier:.2f} for the operations this structure forces. "
            f"PMI = {A('pmi_per_step', ov):.0f} kg/kg/step × {steps} steps "
            f"÷ {overall_yield * 100:.1f}% overall yield."),
    }


def _fermentation_cost(profile: dict, scale_g: float, ov: dict | None) -> dict:
    titre = A("fermentation_titre_g_per_l", ov)
    volume = A("fermenter_volume_l", ov)
    recovery = A("downstream_recovery", ov)
    per_batch_g = titre * volume * recovery
    batches = max(1.0, math.ceil(scale_g / max(per_batch_g, 1e-6)))

    ferm_cost = A("fermentation_batch_cost", ov) * batches
    dsp_cost = ferm_cost * A("downstream_cost_fraction", ov)
    total = ferm_cost + dsp_cost
    per_gram = total / max(scale_g, 1.0)

    return {
        "route": "fermentation",
        "scale_g": scale_g,
        "titre_g_per_l": titre,
        "isolated_per_batch_g": round(per_batch_g, 1),
        "batches": int(batches),
        "cost_per_gram_usd": _band(per_gram, A("uncertainty_factor", ov)),
        "batch_total_usd": _band(total, A("uncertainty_factor", ov)),
        "one_off_development_usd": round(A("strain_development_cost", ov)),
        "breakdown": [
            {"item": "fermentation", "usd_per_gram": round(ferm_cost / scale_g, 2),
             "basis": f"{int(batches)} × {volume:.0f} L at "
                      f"${A('fermentation_batch_cost', ov):.0f}/batch"},
            {"item": "recovery and purification",
             "usd_per_gram": round(dsp_cost / scale_g, 2),
             "basis": f"{A('downstream_cost_fraction', ov):.0%} of the "
                      f"fermentation cost, {recovery:.0%} recovery"},
        ],
        "premiums": [],
        "viable": True,
        "viability_note": (
            "Conditional on a biosynthetic pathway to this scaffold existing "
            "and being expressible. The strain development cost is paid "
            "before the first gram and dominates early-phase economics."),
        "method": (
            f"{titre:.2f} g/L × {volume:.0f} L × {recovery:.0%} recovery = "
            f"{per_batch_g:.0f} g isolated per batch; cost per gram = "
            f"(fermentation + recovery) ÷ {scale_g:.0f} g."),
    }


def cost(profile: dict, scale_g: float = 1000.0,
         route: str = "chemical_synthesis", overrides: dict | None = None) -> dict:
    """Cost per gram of isolated compound at `scale_g`, by `route`."""
    if route == "fermentation":
        return _fermentation_cost(profile, scale_g, overrides)
    return _chemical_cost(profile, scale_g, route, overrides)


# ═════════════════════════════════════════════════════════════════════════════
# TIME
# ═════════════════════════════════════════════════════════════════════════════
def time_to_manufacture(profile: dict, scale_g: float = 1000.0,
                        route: str = "chemical_synthesis",
                        overrides: dict | None = None) -> dict:
    """
    Weeks to the first delivery of `scale_g` grams, in three phases.

    Development is the long pole for anything unfamiliar; execution scales
    with step count and batch count; release testing is roughly fixed.
    """
    ov = overrides
    m = profile["metrics"]
    steps = max(1, int(profile["estimated_steps"] or 1))
    centres = int(m.get("stereocentres") or 0)
    phases = []

    if route == "fermentation":
        titre = A("fermentation_titre_g_per_l", ov)
        volume = A("fermenter_volume_l", ov)
        recovery = A("downstream_recovery", ov)
        per_batch_g = max(titre * volume * recovery, 1e-6)
        batches = max(1, math.ceil(scale_g / per_batch_g))
        phases = [
            {"phase": "pathway and strain work",
             "weeks": 26.0,
             "detail": "assemble the pathway, express it in the host and "
                       "raise the titre to something workable — the long "
                       "pole, and the reason fermentation is a platform "
                       "decision rather than a campaign decision"},
            {"phase": "fermentation campaign",
             "weeks": round(batches * 1.5 + 2, 1),
             "detail": f"{batches} × {volume:.0f} L batch(es) including "
                       f"turnaround and sterilisation"},
            {"phase": "recovery and purification",
             "weeks": round(batches * 0.8 + 2, 1),
             "detail": "extraction, chromatography and isolation of the "
                       "final compound"},
            {"phase": "release testing",
             "weeks": A("release_testing_weeks", ov),
             "detail": "identity, assay, impurity profile and residual "
                       "solvents on the final batch"},
        ]
    elif route == "spps":
        residues = max(2, profile["peptide_bonds"] + 1)
        phases = [
            {"phase": "sequence and resin development",
             "weeks": round(2 + 0.4 * residues, 1),
             "detail": f"{residues}-residue assembly: resin choice, "
                       f"protecting-group strategy and a test run"},
            {"phase": "synthesis and cleavage",
             "weeks": round(1 + 0.25 * residues + 0.5 * math.log2(
                 max(scale_g, 1) / 10 + 1), 1),
             "detail": "coupling cycles on resin, then cleavage and "
                       "precipitation"},
            {"phase": "purification",
             "weeks": 3.0,
             "detail": "preparative HPLC and lyophilisation, which is where "
                       "peptide campaigns usually lose their time"},
            {"phase": "release testing",
             "weeks": A("release_testing_weeks", ov),
             "detail": "identity by MS, purity by HPLC, counter-ion and "
                       "water content"},
        ]
    else:
        biocatalytic = route == "chemo_enzymatic"
        development = 3.0 + 1.1 * steps + 2.0 * min(centres, 4)
        phases.append({
            "phase": "route development",
            "weeks": round(development, 1),
            "detail": f"find and demonstrate a workable route to a "
                      f"{steps}-step target"
                      + (f" with {centres} stereocentre(s) to control"
                         if centres else "")
                      + "; this is a route-scouting estimate, not a planned "
                        "synthesis",
        })
        if biocatalytic:
            phases.append({
                "phase": "enzyme screening and optimisation",
                "weeks": 8.0,
                "detail": "screen a commercial panel against this substrate "
                          "and, if nothing works well enough, one round of "
                          "engineering. Runs partly in parallel with route "
                          "development in practice.",
            })
        batches = max(1, math.ceil((scale_g / 1000.0)
                                   / max(A("batch_size_kg", ov), 1e-6)))
        exec_weeks = (steps * (A("days_per_step", ov)
                               + A("purification_days", ov))
                      * batches ** A("batch_learning_exponent", ov)) / 5.0
        phases.append({
            "phase": "campaign execution",
            "weeks": round(exec_weeks, 1),
            "detail": f"{steps} steps × {batches} batch(es) at five "
                      f"operator-days per week",
        })
        phases.append({
            "phase": "release testing",
            "weeks": A("release_testing_weeks", ov),
            "detail": "identity, assay, impurities, residual solvent and "
                      "metals on the final batch",
        })

    total = sum(p["weeks"] for p in phases)
    factor = min(A("uncertainty_factor", ov), 1.8)
    return {
        "route": route,
        "scale_g": scale_g,
        "phases": phases,
        "total_weeks": _band(total, factor),
        "total_months": _band(total / 4.345, factor),
        "method": ("Phase durations are heuristics keyed to step count, "
                   "stereocentre count and batch count. They assume one "
                   "campaign with no failed step and no repeat batch, which "
                   "is the optimistic case."),
    }


# ═════════════════════════════════════════════════════════════════════════════
# ONE CALL FOR EVERYTHING — used by the deterministic path and as the
# agents' submit target
# ═════════════════════════════════════════════════════════════════════════════
def assess(smiles: str, scale_g: float = 1000.0,
           overrides: dict | None = None,
           route: str | None = None) -> dict:
    """
    Full manufacturability assessment of one molecule at one scale.

    `route` forces a route; otherwise the recommended one is used.
    """
    profile = read_structure(smiles)
    if not profile.get("ok"):
        return {"ok": False, "smiles": smiles, "error": profile.get("error")}

    options = route_options(profile)
    # If nothing fits, say so at the top rather than quoting a price for a
    # route that would never be run. This is the loop's cue to redesign.
    no_viable_route = all(o["fit"] == "poor" for o in options)
    chosen = route or next(o["route"] for o in options if o["recommended"])
    chosen_option = next((o for o in options if o["route"] == chosen), None)
    if chosen_option is None:
        # An agent may ask for a route the rules did not put forward. Cost
        # it, but say plainly that the structure does not support it rather
        # than attaching another route's reasoning to the number.
        chosen_option = {
            "route": chosen,
            "label": ROUTES.get(chosen, chosen),
            "fit": "poor",
            "reasons": [f"{ROUTES.get(chosen, chosen)} was costed on "
                        f"request. Nothing in this structure suggests it: "
                        f"the rules did not offer it as an option."],
            "caveats": ["Treat this figure as a what-if, not a proposal."],
            "enzymes": [],
            "recommended": False,
        }
        options = options + [chosen_option]

    costed = cost(profile, scale_g, chosen, overrides)
    timed = time_to_manufacture(profile, scale_g, chosen, overrides)

    # The same numbers for every route, so the comparison is explicit.
    alternatives = []
    for o in options:
        if o["route"] == chosen:
            continue
        alt_cost = cost(profile, scale_g, o["route"], overrides)
        alt_time = time_to_manufacture(profile, scale_g, o["route"], overrides)
        alternatives.append({
            "route": o["route"], "label": o["label"], "fit": o["fit"],
            "cost_per_gram_usd": alt_cost["cost_per_gram_usd"],
            "total_weeks": alt_time["total_weeks"],
            "one_off_development_usd": alt_cost["one_off_development_usd"],
        })

    return {
        "ok": True,
        "smiles": smiles,
        "scale_g": scale_g,
        "scale_label": next((s["label"] for s in SCALE_PRESETS
                             if s["grams"] == scale_g), f"{scale_g:.0f} g"),
        "verdict": "redesign_required" if no_viable_route else "route_identified",
        "verdict_note": (
            "No production route fits this structure as drawn — the estimate "
            "below is what it would take if you insisted, not a plan. Send "
            "it back to design."
            if no_viable_route else
            "A production route fits this structure; the numbers below are "
            "order-of-magnitude estimates from the stated assumptions."),
        "critic_verdict": profile["critic_verdict"],
        "manufacturable": profile["manufacturable"],
        "estimated_steps": profile["estimated_steps"],
        "sa_score": profile["sa_score"],
        "route_complexity": profile["route_complexity"],
        "route": chosen,
        "route_label": ROUTES.get(chosen, chosen),
        "route_fit": chosen_option["fit"],
        "route_reasons": chosen_option["reasons"],
        "route_caveats": chosen_option["caveats"],
        "enzymes": chosen_option.get("enzymes", []),
        "route_options": options,
        "alternatives": alternatives,
        "cost": costed,
        "time": timed,
        "process_flags": [
            {"key": f["key"], "label": f["label"], "detail": f["detail"]}
            for f in PROCESS_FLAGS if profile["process_flags"].get(f["key"])
        ],
        "limitations": [
            "The model prices a one-off early-phase campaign in a kilo-lab "
            "or at a contract manufacturer. It is not steady-state "
            "commercial production: a compound made by the tonne in a "
            "dedicated plant costs orders of magnitude less per gram than "
            "this, and nothing here should be read as a market price.",
            "Step count is a heuristic from rings, stereocentres and heavy "
            "atoms, not a retrosynthesis — no reaction has been proposed.",
            "Cost factors are uncalibrated defaults inside published ranges "
            "for early-phase manufacture, not supplier quotes. Read the "
            "ranking, not the absolute number.",
            "Building-block availability is approximated from elements and "
            "halogen density, not a supplier catalogue.",
            "Biocatalysis is proposed from a substructure match: it says the "
            "chemistry is plausible, not that an enzyme accepts this "
            "substrate.",
        ],
    }


if __name__ == "__main__":
    import json
    import sys

    tests = sys.argv[1:] or [
        # the loop's own round-2 candidate: short, achiral
        "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(CNC(=O)c2ccc(F)cc2)cc1",
        # a generative round-1 candidate: docks best, cannot be made
        "CS(=O)(=O)c1cc2ccc(F)cc2cc1SC(=O)CCNc1ccc(C(C)[C@@H]2CCCC[C@H]2NC(C)"
        "c2ccc3ccccc3c2)cc1",
        # sitagliptin, where a transaminase replaced a rhodium hydrogenation
        "Fc1cc(F)c(C[C@H](N)CC(=O)N2CCn3c(C2)nnc3C(F)(F)F)c(F)c1",
    ]
    for smi in tests:
        a = assess(smi, scale_g=1000.0)
        if not a["ok"]:
            print(f"{smi[:50]}: {a['error']}")
            continue
        c = a["cost"]["cost_per_gram_usd"]
        t = a["time"]["total_weeks"]
        print(f"\n{smi[:66]}")
        print(f"  critics {a['critic_verdict']:<5} ~{a['estimated_steps']} steps"
              f"   route: {a['route_label']}")
        print(f"  cost    ${c['low']:,.0f}–{c['high']:,.0f}/g at "
              f"{a['scale_label']}   (point ${c['point']:,.0f}/g)")
        print(f"  time    {t['low']:.0f}–{t['high']:.0f} weeks")
        if a["cost"]["viability_note"]:
            print(f"  note    {a['cost']['viability_note'][:120]}")
        for r in a["route_reasons"][:2]:
            print(f"    · {r}")
    if len(tests) == 1:
        print(json.dumps(assess(tests[0]), indent=2)[:4000])
