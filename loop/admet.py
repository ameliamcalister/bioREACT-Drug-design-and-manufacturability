"""
admet.py — the property screen, with each rule named and attributed.

A shortlist has to survive more than docking and manufacturability: a
molecule that binds beautifully and is cheap to make is still useless if it
will not get into the body. This module applies the published rule sets that
early-stage screening actually uses, and reports which rule produced which
result.

WHAT IS COMPUTED HERE, AND WHAT IT IS WORTH

  Lipinski's rule of five (Lipinski et al. 1997) — MW, cLogP, HBD, HBA.
      An oral-absorption heuristic derived from compounds that reached
      Phase II. One violation is normal; many marketed drugs break it.
  Veber's rules (Veber et al. 2002) — rotatable bonds, TPSA.
      Added because flexibility and polar surface area predicted oral
      bioavailability in rat better than molecular weight did.
  Ghose and Egan ranges — a second opinion on the same descriptors, kept
      because they disagree with Lipinski at the edges, which is useful.
  QED (Bickerton et al. 2012) — one weighted desirability number in [0,1],
      fitted to medicinal chemists' judgements of drug-likeness.
  Structural alerts — PAINS (Baell & Holloway 2010) and the Brenk set,
      both shipped inside RDKit. These flag substructures associated with
      assay interference or with unwanted reactivity and metabolism.

  All of the above are RULES over computed descriptors. None of them is a
  trained ADMET model: there is no absorption, distribution, metabolism,
  excretion or toxicity PREDICTION in this project, and the output says so
  wherever it is shown. A molecule that passes everything here has cleared
  a filter, not an assay. The three proxies at the end (oral, CNS, solubility
  risk) are explicitly labelled as descriptor-based expectations, which is
  all a logP and a TPSA can honestly support.
"""
from __future__ import annotations

from rdkit import Chem, RDLogger
from rdkit.Chem import Crippen, Descriptors, QED, rdMolDescriptors
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams

RDLogger.DisableLog("rdApp.*")

_CATALOG: FilterCatalog | None = None


def _catalog() -> FilterCatalog:
    """PAINS and Brenk, built once (585 patterns, ~0.3 s to construct)."""
    global _CATALOG
    if _CATALOG is None:
        params = FilterCatalogParams()
        params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
        params.AddCatalog(FilterCatalogParams.FilterCatalogs.BRENK)
        _CATALOG = FilterCatalog(params)
    return _CATALOG


def descriptors(mol) -> dict:
    return {
        "mw": round(Descriptors.MolWt(mol), 1),
        "clogp": round(Crippen.MolLogP(mol), 2),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),
        "hba": rdMolDescriptors.CalcNumHBA(mol),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 1),
        "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "molar_refractivity": round(Crippen.MolMR(mol), 1),
        "fsp3": round(rdMolDescriptors.CalcFractionCSP3(mol), 3),
        "qed": round(QED.qed(mol), 3),
    }


# Each rule: (descriptor, comparison, limit, how it reads in English)
RULE_SETS = {
    "lipinski": {
        "name": "Lipinski rule of five",
        "citation": "Lipinski et al., Adv Drug Deliv Rev 1997",
        "allowed_violations": 1,
        "what_for": "oral absorption",
        "rules": [
            ("mw", "<=", 500, "molecular weight ≤ 500 Da"),
            ("clogp", "<=", 5.0, "cLogP ≤ 5"),
            ("hbd", "<=", 5, "hydrogen-bond donors ≤ 5"),
            ("hba", "<=", 10, "hydrogen-bond acceptors ≤ 10"),
        ],
    },
    "veber": {
        "name": "Veber rules",
        "citation": "Veber et al., J Med Chem 2002",
        "allowed_violations": 0,
        "what_for": "oral bioavailability",
        "rules": [
            ("rotatable_bonds", "<=", 10, "rotatable bonds ≤ 10"),
            ("tpsa", "<=", 140, "topological polar surface area ≤ 140 Å²"),
        ],
    },
    "ghose": {
        "name": "Ghose filter",
        "citation": "Ghose et al., J Comb Chem 1999",
        "allowed_violations": 1,
        "what_for": "drug-likeness, a second opinion on Lipinski",
        "rules": [
            ("mw", "range", (160, 480), "molecular weight 160–480 Da"),
            ("clogp", "range", (-0.4, 5.6), "cLogP −0.4 to 5.6"),
            ("molar_refractivity", "range", (40, 130),
             "molar refractivity 40–130"),
            ("heavy_atoms", "range", (20, 70), "20–70 heavy atoms"),
        ],
    },
    "egan": {
        "name": "Egan egg",
        "citation": "Egan et al., J Med Chem 2000",
        "allowed_violations": 0,
        "what_for": "passive intestinal absorption",
        "rules": [
            ("clogp", "<=", 5.88, "cLogP ≤ 5.88"),
            ("tpsa", "<=", 131.6, "topological polar surface area ≤ 131.6 Å²"),
        ],
    },
}


def _check(value, comparison, limit) -> bool:
    if comparison == "<=":
        return value <= limit
    if comparison == ">=":
        return value >= limit
    if comparison == "range":
        return limit[0] <= value <= limit[1]
    raise ValueError(comparison)


def screen(smiles: str) -> dict:
    """
    Apply every rule set, the structural alerts and the three proxies.

    Returns a dict whose `verdict` is "pass", "flag" or "fail":
        fail  — two or more rule sets broken
        flag  — one rule set broken, or any structural alert
        pass  — everything within range
    """
    mol = Chem.MolFromSmiles((smiles or "").strip())
    if mol is None:
        return {"ok": False, "smiles": smiles,
                "error": "SMILES did not parse", "verdict": "fail"}

    d = descriptors(mol)

    sets = []
    for key, spec in RULE_SETS.items():
        checks = []
        for descriptor, comparison, limit, text in spec["rules"]:
            ok = _check(d[descriptor], comparison, limit)
            checks.append({
                "descriptor": descriptor, "value": d[descriptor],
                "requirement": text, "pass": ok,
            })
        violations = [c for c in checks if not c["pass"]]
        sets.append({
            "key": key,
            "name": spec["name"],
            "citation": spec["citation"],
            "what_for": spec["what_for"],
            "violations": len(violations),
            "allowed_violations": spec["allowed_violations"],
            "pass": len(violations) <= spec["allowed_violations"],
            "checks": checks,
        })

    alerts = []
    for match in _catalog().GetMatches(mol):
        props = {k: match.GetProp(k) for k in match.GetPropList()}
        family_raw = props.get("FilterSet", "")
        is_pains = "pains" in family_raw.lower()
        alerts.append({
            "name": match.GetDescription().replace("_", " "),
            "family": "PAINS" if is_pains else "Brenk",
            "scope": props.get("Scope", ""),
            "reference": props.get("Reference", "").split(" doi:")[0],
            "means": ("associated with frequent-hitter behaviour in assays: "
                      "a hit may not be real binding"
                      if is_pains else
                      "a substructure associated with reactivity, "
                      "instability or unwanted metabolism"),
        })
    broken = [s["name"] for s in sets if not s["pass"]]
    # Two or more broken rule sets is a real property problem. A structural
    # alert on its own is not: the PAINS list in particular is deliberately
    # over-inclusive — several of its patterns match marketed drugs, and
    # aryl-piperazines and anilines trip it routinely — so an alert is
    # reported for a chemist to judge, never used to fail a molecule.
    if len(broken) >= 2:
        verdict = "fail"
    elif broken or alerts:
        verdict = "flag"
    else:
        verdict = "pass"

    # Descriptor-based expectations. Not models, and labelled as such.
    proxies = [
        {
            "property": "oral absorption",
            "expectation": ("plausible" if d["tpsa"] <= 140
                            and d["rotatable_bonds"] <= 10
                            and d["mw"] <= 500 else "doubtful"),
            "basis": f"TPSA {d['tpsa']} Å², {d['rotatable_bonds']} rotatable "
                     f"bonds, {d['mw']} Da against the Veber and Lipinski "
                     f"ranges",
        },
        {
            "property": "CNS exposure",
            "expectation": ("possible" if d["tpsa"] < 90 and 1 <= d["clogp"] <= 4
                            and d["mw"] < 450 else "unlikely"),
            "basis": f"TPSA {d['tpsa']} Å², cLogP {d['clogp']}, {d['mw']} Da "
                     f"against the ranges typical of marketed CNS drugs",
        },
        {
            "property": "aqueous solubility risk",
            "expectation": ("elevated" if (d["clogp"] > 4
                            and d["aromatic_rings"] >= 3) else "ordinary"),
            "basis": f"cLogP {d['clogp']} with {d['aromatic_rings']} aromatic "
                     f"rings — flat lipophilic molecules tend to be poorly "
                     f"soluble",
        },
    ]

    return {
        "ok": True,
        "smiles": smiles,
        "verdict": verdict,
        "descriptors": d,
        "rule_sets": sets,
        "rule_sets_broken": broken,
        "alerts": alerts,
        "qed": d["qed"],
        "proxies": proxies,
        "disclaimer": (
            "Published rule sets over computed descriptors, plus RDKit's "
            "PAINS and Brenk structural alerts. No trained ADMET model is "
            "used anywhere in this project, so nothing here is a prediction "
            "of absorption, metabolism or toxicity — passing is clearing a "
            "filter, not an assay."),
    }


def summary_line(result: dict) -> str:
    if not result.get("ok"):
        return result.get("error", "property screen failed")
    d = result["descriptors"]
    broken = result["rule_sets_broken"]
    bits = [f"MW {d['mw']:.0f}", f"cLogP {d['clogp']}", f"TPSA {d['tpsa']}",
            f"QED {d['qed']}"]
    tail = (f"breaks {', '.join(broken)}" if broken else "within all rule sets")
    if result["alerts"]:
        tail += f"; {len(result['alerts'])} structural alert(s)"
    return " · ".join(bits) + " — " + tail


if __name__ == "__main__":
    import json
    import sys

    tests = sys.argv[1:] or [
        "CC(=O)Oc1ccccc1C(=O)O",                                  # aspirin
        "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(CNC(=O)c2ccc(F)cc2)cc1",
        "CC(C)(C)c1ccc(cc1)/C=C/c1cc(ccn1)CSC(CC(=O)O)SCCc1ccccc1",  # MK-571
    ]
    for smi in tests:
        r = screen(smi)
        print(f"{r.get('verdict', '?'):<5} {summary_line(r)}")
        for a in r.get("alerts", [])[:3]:
            print(f"      alert [{a['family']}] {a['name']}")
    if len(tests) == 1:
        print(json.dumps(screen(tests[0]), indent=2))
