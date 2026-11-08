"""
critics.py — the two critic agents. This is your chem eng's file to edit.

Two critics, each returning a structured verdict:

  synthesisability_critic(smiles)  -> can this be made at all?
  process_critic(smiles)           -> can this be made at kilogram scale?

Every rule has an explicit threshold and a plain-language reason, so the
rubric goes straight onto a slide. Nothing here is a vibe — each criterion
is a computed descriptor compared against a stated number.

The important output is `rejections`: a list of structured dicts

    {"criterion": "stereocentres",
     "value": 5,
     "threshold": 2,
     "reason": "5 stereocentres require asymmetric synthesis or resolution",
     "suggest": "reduce to <=2 stereocentres; prefer achiral or single-centre scaffolds"}

The orchestrator feeds those straight back to the designer. That feedback
edge is the whole point of the project, so the `suggest` field must be
actionable and specific, never "make it simpler".

VERDICTS:  "pass"  -> makeable
           "flag"  -> makeable with effort, proceed with caveat
           "fail"  -> do not progress this molecule
"""
from __future__ import annotations

import os
import sys

from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors, RDConfig, rdMolDescriptors

RDLogger.DisableLog("rdApp.*")

sys.path.append(os.path.join(RDConfig.RDContribDir, "SA_Score"))
import sascorer  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# THE RUBRIC — edit these numbers, the code reads them
# ─────────────────────────────────────────────────────────────────────────────
RUBRIC = {
    # criterion              flag_above  fail_above
    "sa_score":             (4.0,  6.0),   # Ertl & Schuffenhauer, 1 (easy) - 10 (hard)
    "stereocentres":        (2,    4),     # each one is a resolution or asymmetric step
    "fused_ring_systems":   (3,    5),     # fused/bridged polycyclics need long sequences
    "spiro_atoms":          (1,    2),     # spirocycles are specialist chemistry
    "macrocycle_size":      (0,    12),    # >12-membered rings need macrocyclisation
    "heavy_atoms":          (40,   55),    # proxy for total step count
    "rotatable_bonds":      (10,   14),    # flexibility; harder to purify
    "unusual_elements":     (0,    1),     # outside H,B,C,N,O,F,P,S,Cl,Br,I
    "halogen_density":      (0.18, 0.30),  # halogens / heavy atoms: dense
                                           # polyhalogenation means the
                                           # building block must be bought,
                                           # and usually cannot be
}

COMMON_ELEMENTS = {"H", "B", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"}

# Functional-group classes that complicate isolation and storage at scale.
# SMARTS -> (label, suggestion). Deliberately high-level: these flag a class
# of group for a chemist to review, they are not synthesis instructions.
GROUP_ALERTS = [
    ("[N+](=O)[O-]",            "nitro group",
     "replace nitro with an amide, nitrile or sulfone bioisostere"),
    ("[N]=[N+]=[N-]",           "azide",
     "replace azide with an amine or triazole formed by other means"),
    ("[CX3H1](=O)[#6]",         "aldehyde",
     "mask as an acetal or replace with a ketone or carboxamide"),
    ("C1OC1",                   "epoxide",
     "replace epoxide with a diol, ether or azetidine"),
    ("[SX2H]",                  "free thiol",
     "replace thiol with a thioether or sulfonamide to avoid oxidation"),
    ("[#6]I",                   "aryl/alkyl iodide",
     "switch to the bromide or chloride, or a boronate coupling partner"),
    ("N=C=O",                   "isocyanate",
     "form the urea or carbamate from a stable precursor instead"),
]


# ─────────────────────────────────────────────────────────────────────────────
# DESCRIPTORS
# ─────────────────────────────────────────────────────────────────────────────
def _largest_ring(mol) -> int:
    rings = mol.GetRingInfo().AtomRings()
    return max((len(r) for r in rings), default=0)


def _fused_ring_systems(mol) -> int:
    """Count rings that share at least two atoms with another ring."""
    rings = [set(r) for r in mol.GetRingInfo().AtomRings()]
    fused = 0
    for i, r in enumerate(rings):
        if any(len(r & other) >= 2 for j, other in enumerate(rings) if i != j):
            fused += 1
    return fused


def descriptors(smiles: str) -> dict | None:
    mol = Chem.MolFromSmiles((smiles or "").strip())
    if mol is None:
        return None
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    elements = {a.GetSymbol() for a in mol.GetAtoms()}
    largest = _largest_ring(mol)
    heavy = mol.GetNumHeavyAtoms() or 1
    n_hal = sum(1 for a in mol.GetAtoms()
                if a.GetSymbol() in ("F", "Cl", "Br", "I"))
    # extra descriptors consumed by the bioREACT handoff (see bioreact_export)
    unassigned = len([c for c in Chem.FindMolChiralCenters(
        mol, includeUnassigned=True, useLegacyImplementation=False)
        if c[1] == "?"])

    return {
        "halogen_density": round(n_hal / heavy, 3),
        "logp": round(Descriptors.MolLogP(mol), 2),
        "tpsa": round(Descriptors.TPSA(mol), 1),
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "fsp3": round(rdMolDescriptors.CalcFractionCSP3(mol), 3),
        "bridgehead_atoms": rdMolDescriptors.CalcNumBridgeheadAtoms(mol),
        "unassigned_stereo": unassigned,
        "max_ring_size": largest,
        "sa_score": round(sascorer.calculateScore(mol), 2),
        "stereocentres": len(Chem.FindMolChiralCenters(
            mol, includeUnassigned=True, useLegacyImplementation=False)),
        "fused_ring_systems": _fused_ring_systems(mol),
        "spiro_atoms": rdMolDescriptors.CalcNumSpiroAtoms(mol),
        "macrocycle_size": largest if largest > 8 else 0,
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "unusual_elements": len(elements - COMMON_ELEMENTS),
        "rings": rdMolDescriptors.CalcNumRings(mol),
        "mw": round(Descriptors.ExactMolWt(mol), 1),
        "_unusual_list": sorted(elements - COMMON_ELEMENTS),
        "_mol": mol,
    }


# How each criterion reads in English, and what to do about it.
EXPLAIN = {
    "sa_score": (
        "synthetic accessibility score {value} (threshold {threshold})",
        "simplify the scaffold: fewer rings and fewer contiguous substituents"),
    "stereocentres": (
        "{value} stereocentres require asymmetric synthesis or resolution",
        "reduce to <={threshold} stereocentres; prefer achiral or single-centre scaffolds"),
    "fused_ring_systems": (
        "{value} fused ring systems imply a long linear sequence",
        "use a single aromatic core with substituents instead of a fused polycycle"),
    "spiro_atoms": (
        "{value} spiro centres are specialist, low-availability chemistry",
        "replace the spirocycle with a monocyclic ring such as piperidine or morpholine"),
    "macrocycle_size": (
        "{value}-membered macrocycle requires a dedicated macrocyclisation",
        "open the macrocycle to a linear or biaryl linker"),
    "heavy_atoms": (
        "{value} heavy atoms, which implies a high total step count",
        "trim to <={threshold} heavy atoms by removing peripheral groups"),
    "rotatable_bonds": (
        "{value} rotatable bonds, which complicates purification",
        "rigidify the linker, for example a ring in place of a flexible chain"),
    "unusual_elements": (
        "contains uncommon element(s) {extra} with limited building-block supply",
        "restrict to H, B, C, N, O, F, P, S and halogens"),
    "halogen_density": (
        "halogen fraction {value} of heavy atoms: densely halogenated cores "
        "must be purchased and usually cannot be",
        "reduce to <={threshold} halogen fraction; keep 1-3 halogens on "
        "commercially available aryl rings"),
}


def _apply_rubric(d: dict, criteria: list[str]) -> tuple[str, list[dict], list[dict]]:
    """Returns (verdict, rejections, passes) for the named criteria."""
    rejections, passes = [], []
    worst = "pass"
    for name in criteria:
        flag_at, fail_at = RUBRIC[name]
        value = d[name]
        if value > fail_at:
            level = "fail"
        elif value > flag_at:
            level = "flag"
        else:
            level = "pass"

        template, suggest = EXPLAIN[name]
        extra = ", ".join(d.get("_unusual_list", [])) or "none"
        record = {
            "criterion": name,
            "value": value,
            "threshold": fail_at if level == "fail" else flag_at,
            "level": level,
            "reason": template.format(value=value, threshold=flag_at, extra=extra),
            "suggest": suggest.format(threshold=flag_at),
        }
        if level == "pass":
            passes.append(record)
        else:
            rejections.append(record)
            if level == "fail":
                worst = "fail"
            elif worst == "pass":
                worst = "flag"
    return worst, rejections, passes


# ─────────────────────────────────────────────────────────────────────────────
# CRITIC 1 — SYNTHESISABILITY
# ─────────────────────────────────────────────────────────────────────────────
SYNTH_CRITERIA = ["sa_score", "stereocentres", "fused_ring_systems",
                  "spiro_atoms", "macrocycle_size", "unusual_elements",
                  "halogen_density"]


def estimate_steps(d: dict) -> int:
    """Crude but defensible linear-sequence estimate. State it as an estimate."""
    steps = 2
    steps += max(0, d["rings"] - 1)
    steps += 2 * d["stereocentres"]
    steps += d["spiro_atoms"]
    steps += 1 if d["macrocycle_size"] else 0
    steps += max(0, (d["heavy_atoms"] - 20) // 8)
    return int(steps)


def synthesisability_critic(smiles: str) -> dict:
    d = descriptors(smiles)
    if d is None:
        return {
            "critic": "synthesisability", "smiles": smiles, "verdict": "fail",
            "rejections": [{
                "criterion": "validity", "value": None, "threshold": None,
                "level": "fail", "reason": "SMILES could not be parsed",
                "suggest": "emit a valid, kekulisable SMILES string",
            }],
            "passes": [], "metrics": {},
            "estimated_steps": -1, "sa_score": -1.0,
        }

    verdict, rejections, passes = _apply_rubric(d, SYNTH_CRITERIA)
    steps = estimate_steps(d)
    if steps > 14:
        verdict = "fail"
        rejections.append({
            "criterion": "estimated_steps", "value": steps, "threshold": 14,
            "level": "fail",
            "reason": f"estimated {steps}-step linear sequence is too long to be practical",
            "suggest": "target <=10 steps: simplify the core and reduce stereocentres",
        })
    elif steps > 10 and verdict == "pass":
        verdict = "flag"
        rejections.append({
            "criterion": "estimated_steps", "value": steps, "threshold": 10,
            "level": "flag",
            "reason": f"estimated {steps}-step sequence is long",
            "suggest": "look for a convergent route or a simpler core",
        })

    return {
        "critic": "synthesisability",
        "smiles": smiles,
        "verdict": verdict,
        "estimated_steps": steps,
        "sa_score": d["sa_score"],
        "rejections": rejections,
        "passes": passes,
        "metrics": {k: v for k, v in d.items() if not k.startswith("_")},
    }


# ─────────────────────────────────────────────────────────────────────────────
# CRITIC 2 — PROCESS / SCALE-UP
# ─────────────────────────────────────────────────────────────────────────────
PROCESS_CRITERIA = ["heavy_atoms", "rotatable_bonds", "stereocentres", "sa_score"]

# Cost bands, not point estimates. A fake-precise number is indefensible.
# Route complexity, NOT cost. Putting a price on a molecule is the process
# chemist's call, informed by route, scale and supplier quotes — not
# something to infer from a SMILES string. This rates how demanding the
# synthesis looks and stops there.
ROUTE_COMPLEXITY = [
    (0, "straightforward", "short route from common building blocks"),
    (1, "moderate",        "standard route, some purification work"),
    (2, "demanding",       "long route or a chiral separation needed"),
    (3, "specialist",      "research-scale chemistry only"),
]


def process_critic(smiles: str) -> dict:
    d = descriptors(smiles)
    if d is None:
        return {
            "critic": "process", "smiles": smiles, "verdict": "fail",
            "rejections": [{
                "criterion": "validity", "value": None, "threshold": None,
                "level": "fail", "reason": "SMILES could not be parsed",
                "suggest": "emit a valid SMILES string",
            }],
            "passes": [], "route_complexity": "n/a", "group_flags": [],
        }

    verdict, rejections, passes = _apply_rubric(d, PROCESS_CRITERIA)

    # Functional-group classes needing handling or stability review at scale.
    group_flags = []
    for smarts, label, suggest in GROUP_ALERTS:
        patt = Chem.MolFromSmarts(smarts)
        if patt is not None and d["_mol"].HasSubstructMatch(patt):
            group_flags.append(label)
            rejections.append({
                "criterion": "functional_group",
                "value": label, "threshold": "none",
                "level": "flag",
                "reason": f"{label} needs stability and handling review before scale-up",
                "suggest": suggest,
            })
            if verdict == "pass":
                verdict = "flag"

    # Route complexity from a composite of the things that lengthen a route.
    score = 0
    score += 1 if d["sa_score"] > 4.0 else 0
    score += 1 if d["sa_score"] > 6.0 else 0
    score += 1 if d["stereocentres"] > 2 else 0
    score += 1 if d["heavy_atoms"] > 40 else 0
    score += 1 if d["macrocycle_size"] else 0
    score += 1 if d["spiro_atoms"] > 1 else 0
    level, note = ROUTE_COMPLEXITY[min(score, 3)][1:]

    return {
        "critic": "process",
        "smiles": smiles,
        "verdict": verdict,
        "route_complexity": level,
        "route_note": note,
        "group_flags": group_flags,
        "rejections": rejections,
        "passes": passes,
        "metrics": {k: v for k, v in d.items() if not k.startswith("_")},
    }


# ─────────────────────────────────────────────────────────────────────────────
# COMBINED
# ─────────────────────────────────────────────────────────────────────────────
def assess(smiles: str) -> dict:
    """Run both critics. verdict is the worse of the two."""
    s = synthesisability_critic(smiles)
    p = process_critic(smiles)
    order = {"pass": 0, "flag": 1, "fail": 2}
    verdict = s["verdict"] if order[s["verdict"]] >= order[p["verdict"]] else p["verdict"]

    # Both critics score some of the same criteria (sa_score, stereocentres).
    # Keep one record per criterion, the more severe one, failures first — the
    # designer should never see the same complaint twice.
    merged: dict = {}
    for r in s["rejections"] + p["rejections"]:
        key = (r["criterion"], str(r["value"]))
        if key not in merged or order[r["level"]] > order[merged[key]["level"]]:
            merged[key] = r
    rejections = sorted(merged.values(),
                        key=lambda r: 0 if r["level"] == "fail" else 1)

    return {
        "smiles": smiles,
        "verdict": verdict,
        "manufacturable": verdict != "fail",
        "synthesisability": s,
        "process": p,
        # the feedback edge payload — deduped, failures first
        "rejections": rejections,
        "estimated_steps": s.get("estimated_steps"),
        "sa_score": s.get("sa_score"),
        "route_complexity": p.get("route_complexity"),
    }


def rubric_table() -> str:
    """Printable rubric, for the slide."""
    lines = [f"{'criterion':<22}{'flag above':>12}{'fail above':>12}"]
    lines.append("-" * 46)
    for k, (f, x) in RUBRIC.items():
        lines.append(f"{k:<22}{f:>12}{x:>12}")
    lines.append("-" * 46)
    lines.append("estimated_steps             10          14")
    return "\n".join(lines)


if __name__ == "__main__":
    print(rubric_table())
    print()
    tests = [
        ("aspirin", "CC(=O)Oc1ccccc1C(=O)O"),
        ("MK-571", "CC(C)(C)c1ccc(cc1)/C=C/c1cc(ccn1)CSC(CC(=O)O)SCCc1ccccc1"),
        ("paclitaxel-like", "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(c1ccccc1)NC(=O)c1ccccc1)O)O)OC(=O)c1ccccc1)(CO4)OC(C)=O)O)C)OC(C)=O"),
    ]
    for name, smi in tests:
        a = assess(smi)
        print(f"{name:<18} {a['verdict']:<5} SA={a['sa_score']:<5} "
              f"steps~{a['estimated_steps']:<3} {a['route_complexity']}")
        for r in a["rejections"][:3]:
            print(f"    [{r['level']}] {r['reason']}")
