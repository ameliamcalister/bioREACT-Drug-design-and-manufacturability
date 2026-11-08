"""
The two critics. Hand this file to your chem eng teammate.

Both return the same shape, which the designer agent is prompted to consume:

    {"smiles": str,
     "verdict": "pass" | "flag" | "fail",
     "reasons": [str, ...],          # plain language, fed back to the designer
     "features": [str, ...],         # motifs the designer must put in `avoid`
     "detail": {...}}                # numbers, for the evaluation table

The rubric below is a STARTING POINT to be edited, not a finished rubric. Each
rule is one line with an explicit threshold so it can go straight onto a slide
and be defended under questioning.
"""

from __future__ import annotations

from typing import Any

import pipeline_adapter as pipeline

# --------------------------------------------------------------------------
# Process-chemistry rubric. CHEM ENG: edit thresholds, add/remove rules.
# Each entry: (feature tag, SMILES substring to match, severity, reason)
# severity: "fail" = unmanufacturable at scale, "flag" = adds cost/risk
# --------------------------------------------------------------------------
PROCESS_RULES: list[tuple[str, str, str, str]] = [
    ("boronic ester", "B1OC", "flag",
     "Boronic ester implies a Suzuki step; pinacol boronates are costly and "
     "the boron waste stream complicates workup at scale."),
    ("TMS protecting group", "[Si](C)(C)C", "fail",
     "Silyl protection requires an extra protect/deprotect pair and generates "
     "a fluoride or strong-base deprotection step; avoid in a scaled route."),
    ("terminal alkyne", "C#C", "flag",
     "Terminal alkynes carry exotherm and shock-sensitivity concerns on scale "
     "and typically force a Sonogashira with Cu/Pd co-catalysis."),
    ("azide", "N=[N+]=[N-]", "fail",
     "Azide intermediates are a thermal-hazard stop at plant scale."),
    ("nitro group", "[N+](=O)[O-]", "flag",
     "Nitro reduction is exothermic and requires hydrogenation capability; "
     "acceptable but adds a hazard assessment."),
    ("aryl iodide", "I)", "flag",
     "Aryl iodides are expensive relative to bromides; swap if the coupling "
     "tolerates it."),
    ("epoxide", "C1OC1", "flag",
     "Epoxides are genotoxic-alert intermediates requiring tight control."),
]

# Physchem / complexity thresholds. CHEM ENG: tune these.
THRESHOLDS = {
    "max_stereocentres_pass": 1,   # >1 implies chiral resolution or asymmetric step
    "max_stereocentres_fail": 3,
    "max_mw": 600,
    "max_rotb": 10,
    "max_rings": 5,
}


def synthesisability_critic(smiles: str) -> dict[str, Any]:
    """Can a medicinal chemist make this at all, and from what?

    Uses rdkit's SA score when available (rdkit Contrib/SA_Score/sascorer.py),
    otherwise a heuristic on heavy-atom count and stereochemistry.
    """
    reasons: list[str] = []
    features: list[str] = []
    detail: dict[str, Any] = {}

    sa = _sa_score(smiles)
    detail["sa_score"] = sa

    props = pipeline.properties(smiles)
    detail["stereocentres"] = props.get("stereocentres")

    if sa is None:
        verdict = "flag"
        reasons.append("SA score unavailable; synthesisability unassessed.")
    elif sa >= 6.0:
        verdict = "fail"
        reasons.append(
            f"SA score {sa:.1f} (>=6) -- synthetic complexity in the range "
            "where routes typically exceed 10 steps."
        )
        features.append("high synthetic complexity")
    elif sa >= 4.5:
        verdict = "flag"
        reasons.append(f"SA score {sa:.1f} -- moderately demanding synthesis.")
    else:
        verdict = "pass"
        reasons.append(f"SA score {sa:.1f} -- routine medicinal-chemistry synthesis.")

    sc = props.get("stereocentres") or 0
    if sc >= THRESHOLDS["max_stereocentres_fail"]:
        verdict = "fail"
        reasons.append(
            f"{sc} stereocentres -- requires either asymmetric synthesis at "
            "multiple points or sequential resolution."
        )
        features.append("multiple stereocentres")
    elif sc > THRESHOLDS["max_stereocentres_pass"]:
        verdict = _worst(verdict, "flag")
        reasons.append(f"{sc} stereocentres -- adds a resolution or chiral step.")

    return {
        "smiles": smiles,
        "critic": "synthesisability",
        "verdict": verdict,
        "reasons": reasons,
        "features": features,
        "detail": detail,
    }


def process_critic(smiles: str) -> dict[str, Any]:
    """Can this be made in a plant, not just in a flask?

    This is the novel critic -- the one your chem eng owns and defends.
    """
    reasons: list[str] = []
    features: list[str] = []
    verdict = "pass"
    detail: dict[str, Any] = {"rules_fired": []}

    for tag, pattern, severity, reason in PROCESS_RULES:
        if pattern in smiles:
            verdict = _worst(verdict, severity)
            reasons.append(reason)
            features.append(tag)
            detail["rules_fired"].append(tag)

    props = pipeline.properties(smiles)
    detail.update({k: props.get(k) for k in ("mw", "logp", "rotb", "rings")})

    # Amelia's validate_response_smiles already emits FLAG/WARN strings
    # (PAINS, physchem alerts). Fold them in rather than duplicating them.
    for issue in props.get("issues") or []:
        if "FLAG" in issue:
            verdict = _worst(verdict, "fail")
            reasons.append(f"Upstream validator: {issue}")
            features.append(issue.replace("FLAG", "").strip(": -"))
        elif "WARN" in issue:
            verdict = _worst(verdict, "flag")
            reasons.append(f"Upstream validator: {issue}")

    if (props.get("mw") or 0) > THRESHOLDS["max_mw"]:
        verdict = _worst(verdict, "flag")
        reasons.append(
            f"MW {props['mw']} exceeds {THRESHOLDS['max_mw']} -- step count and "
            "mass efficiency (PMI) both suffer."
        )
        features.append("high molecular weight")

    if (props.get("rings") or 0) > THRESHOLDS["max_rings"]:
        verdict = _worst(verdict, "flag")
        reasons.append(f"{props['rings']} rings -- likely a long linear route.")

    if verdict == "pass":
        reasons.append(
            "No scale-up blockers: no hazardous intermediates, no protecting-group "
            "pairs, descriptors within process-friendly ranges."
        )

    detail["cost_band"] = _cost_band(verdict, detail.get("rules_fired", []))

    return {
        "smiles": smiles,
        "critic": "process",
        "verdict": verdict,
        "reasons": reasons,
        "features": features,
        "detail": detail,
    }


def judge(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run both critics over a designer shortlist. Returns the feedback list
    you pass straight into DesignerAgent.run_round(feedback=...)."""
    out = []
    for cand in candidates:
        smi = cand["smiles"]
        syn = synthesisability_critic(smi)
        proc = process_critic(smi)
        overall = _worst(syn["verdict"], proc["verdict"])
        out.append(
            {
                "smiles": smi,
                "overall": overall,
                "features_to_avoid": sorted(set(syn["features"] + proc["features"])),
                "synthesisability": {k: syn[k] for k in ("verdict", "reasons", "detail")},
                "process": {k: proc[k] for k in ("verdict", "reasons", "detail")},
            }
        )
    return out


# --------------------------------------------------------------------------
def _worst(a: str, b: str) -> str:
    order = {"pass": 0, "flag": 1, "fail": 2}
    return a if order[a] >= order[b] else b


def _cost_band(verdict: str, rules_fired: list[str]) -> str:
    """Deliberately a band, not a number. A fake precise figure is the fastest
    way to lose a scientist judge."""
    if verdict == "fail":
        return "not costable -- route blocked"
    if len(rules_fired) >= 2 or verdict == "flag":
        return "high (>GBP 1k/g at kg scale)"
    return "moderate (GBP 100-1k/g at kg scale)"


def _sa_score(smiles: str) -> float | None:
    try:
        import sys

        from rdkit import Chem, RDConfig
        import os

        sys.path.append(os.path.join(RDConfig.RDContribDir, "SA_Score"))
        import sascorer  # type: ignore

        mol = Chem.MolFromSmiles(smiles)
        return None if mol is None else round(sascorer.calculateScore(mol), 2)
    except Exception:
        # Heuristic fallback so the loop runs with zero chemistry deps.
        props = pipeline.properties(smiles)
        if not props.get("valid"):
            return None
        est = (
            1.5
            + 0.004 * (props.get("mw") or 0)
            + 0.6 * (props.get("stereocentres") or 0)
            + 0.3 * (props.get("rings") or 0)
        )
        return round(min(est, 9.0), 2)
