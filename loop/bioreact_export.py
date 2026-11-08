"""
bioreact_export.py — hand our results to the bioREACT bioprocess app.

WHY THIS EXISTS

The chemical engineering side (bioREACT, a React app) already has a slot for
our output: a `small_molecule_chemical` pathway, and a hardcoded button
reading "Route A · MRP1 Small Molecule (-10.82 kcal/mol)". Those numbers
were copied by hand from one of our runs, so they go stale the moment we
run the loop again.

This writes the real thing instead, in exactly the TypeScript shape that app
already declares (`ClosedLoopRunDataset` in src/data/dissertationDockingData.ts),
so the handoff is data rather than a copied figure.

THE SCIENTIFICALLY IMPORTANT PART

Our molecules are small synthetic organics. Their bioreactor models CHO
mammalian cell culture, which makes biologics — antibodies and recombinant
proteins. **You cannot make a 500 Da sulfonamide in a CHO bioreactor.**
Their app already knows this and refuses the gate, which is correct.

So this export does not pretend the two pipelines chain together. It emits
an explicit routing decision: every molecule we produce is tagged
`route: "chemical_synthesis"` with the reason, so their gate can refuse it
for the right reason and display the right manufacturing path. That refusal
is the interesting result, not a failure of the integration.

    python3 bioreact_export.py            # writes bioreact_handoff.json
    python3 bioreact_export.py --stdout   # prints it
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import critics
import pipeline_adapter as pipe

HERE = Path(__file__).resolve().parent
RUN_LOG = HERE / "run_log.json"
OUT = HERE / "bioreact_handoff.json"

# Above this, a molecule is not a small-molecule synthetic target at all.
SMALL_MOLECULE_MW_LIMIT = 1000.0


def _route(mw: float | None) -> dict:
    """
    Which manufacturing route does this candidate belong to?

    This is the field their gate reads. Small molecules go to organic
    synthesis; a CHO bioreactor is the wrong tool and their app should
    refuse it.
    """
    if mw is not None and mw > SMALL_MOLECULE_MW_LIMIT:
        return {
            "route": "unclassified",
            "route_label": "Unclassified — too large for small-molecule synthesis",
            "cho_bioreactor_eligible": False,
            "route_reason": f"{mw:.0f} Da exceeds the {SMALL_MOLECULE_MW_LIMIT:.0f} Da "
                            f"small-molecule limit; needs a modality decision.",
        }
    return {
        "route": "chemical_synthesis",
        "route_label": "Route A — organic chemical synthesis",
        "cho_bioreactor_eligible": False,
        "route_reason": (
            f"{mw:.0f} Da synthetic small molecule. Produced by organic "
            f"synthesis, not mammalian cell culture — a CHO bioreactor "
            f"cannot express a non-biologic."
            if mw is not None else
            "Synthetic small molecule; produced by organic synthesis, not "
            "mammalian cell culture."
        ),
    }


def _entry(a: dict) -> dict:
    """One candidate in their `DockedCandidateEntry` shape."""
    m = a.get("metrics") or a.get("synthesisability", {}).get("metrics", {})
    syn, proc = a.get("synthesisability", {}), a.get("process", {})
    mw = m.get("mw")

    return {
        "smiles": a["smiles"],
        "label": a.get("label", ""),
        "rationale": a.get("rationale", ""),
        "dock_affinity": a.get("affinity"),
        "dock_source": a.get("dock_source", "AutoDock Vina"),
        "overall_verdict": a.get("verdict"),
        "sa_score": a.get("sa_score"),
        "stereocentres": m.get("stereocentres"),
        "estimated_steps": a.get("estimated_steps"),
        # Their field is named cost_band, but we do not cost molecules —
        # that is the process chemist's call. We send route complexity.
        "cost_band": a.get("route_complexity"),
        "route_complexity": a.get("route_complexity"),
        "mw": mw,
        "logp": m.get("logp"),
        "tpsa": m.get("tpsa"),
        "rejections": a.get("rejections", []),
        "manufacturing": _route(mw),
        "assessment": {
            "smiles": a["smiles"],
            "overall_verdict": a.get("verdict"),
            "synthesisability": {
                "verdict": syn.get("verdict"),
                "sa_score": a.get("sa_score"),
                "stereocentres": m.get("stereocentres"),
                "unassigned_stereo": m.get("unassigned_stereo"),
                "fused_ring_systems": m.get("fused_ring_systems"),
                "max_ring_size": m.get("max_ring_size"),
                "spiro_atoms": m.get("spiro_atoms"),
                "bridgehead_atoms": m.get("bridgehead_atoms"),
                "rejections": syn.get("rejections", []),
            },
            "process_chemistry": {
                "verdict": proc.get("verdict"),
                "mw": mw,
                "logp": m.get("logp"),
                "tpsa": m.get("tpsa"),
                "heavy_atoms": m.get("heavy_atoms"),
                "rotatable_bonds": m.get("rotatable_bonds"),
                "aromatic_rings": m.get("aromatic_rings"),
                "fsp3": m.get("fsp3"),
                "halogen_density": m.get("halogen_density"),
                "estimated_steps": a.get("estimated_steps"),
                "route_complexity": a.get("route_complexity"),
                "alerts": [
                    {"group": g, "reason": f"{g} needs stability and handling "
                                           f"review before scale-up",
                     "severity": "flag", "suggest": "", "count": 1}
                    for g in proc.get("group_flags", [])
                ],
                "rejections": proc.get("rejections", []),
            },
            "all_rejections": a.get("rejections", []),
            "summary": _summary(a),
        },
    }


def _summary(a: dict) -> str:
    v = a.get("verdict")
    steps, sa = a.get("estimated_steps"), a.get("sa_score")
    head = {"pass": "Buildable", "flag": "Buildable with caveats",
            "fail": "Not practically makeable"}.get(v, "Assessed")
    blockers = [r["criterion"] for r in a.get("rejections", [])
                if r["level"] == "fail"]
    tail = f" Blocked on: {', '.join(blockers)}." if blockers else ""
    return f"{head}. SA {sa}, ~{steps} steps.{tail}"


def build(run_log: Path = RUN_LOG) -> dict:
    if not run_log.exists():
        raise SystemExit(f"no run yet — {run_log} not found. "
                         f"Run the loop first.")
    log = json.loads(run_log.read_text())
    t = pipe.TARGET()
    ref = dict(pipe.REFERENCE_LIGAND)
    result = log.get("result") or {}

    rounds, tool_trace, seen = [], [], {}
    for r in log.get("rounds", []):
        assessed = r.get("assessed") or []
        entries = [_entry(a) for a in assessed]
        for e in entries:
            seen[e["smiles"]] = e

        counts = {v: sum(1 for a in assessed if a.get("verdict") == v)
                  for v in ("pass", "flag", "fail")}
        fb = r.get("feedback_in") or []
        crits = sorted({x["criterion"] for f in fb
                        for x in f.get("rejections", [])
                        if x["level"] == "fail"})

        rounds.append({
            "round": r.get("round"),
            "agent_notes": r.get("changes_made") or "",
            "submitted_count": len(entries),
            "pass_count": counts["pass"],
            "flag_count": counts["flag"],
            "fail_count": counts["fail"],
            "candidates": entries,
            "feedback_sent": (f"Rejected {len(fb)} candidate(s). "
                              f"Must fix: {', '.join(crits)}") if crits else None,
        })
        for ev in r.get("trace", []):
            tool_trace.append({
                "round": r.get("round"),
                "tool": ev.get("tool"),
                "args": ev.get("args", {}),
                "result_summary": str(ev.get("result"))[:200],
            })

    shortlist = sorted(
        (e for e in seen.values() if e["overall_verdict"] != "fail"
         and e["dock_affinity"] is not None),
        key=lambda e: e["dock_affinity"])

    return {
        "id": f"{t.get('slug', 'target')}-live",
        "name": "Closed-loop run exported from the design tool",
        "modeLabel": f"{log.get('dock_mode', '?').upper()} · "
                     f"{log.get('model', '?')}",
        "target": t.get("name"),
        "targetName": t.get("description") or t.get("name"),
        "referenceLigand": ref.get("name"),
        "referenceAffinity": ref.get("affinity"),
        "converged": "converged" in (result.get("verdict_reason") or ""),
        "total_rounds": len(rounds),
        "tool_calls_used": sum(len(r.get("trace", []))
                               for r in log.get("rounds", [])),
        "docks_used": sum(1 for ev in tool_trace if ev["tool"] == "dock"),
        "elapsed_s": result.get("elapsed_s"),
        "rounds": rounds,
        "tool_trace": tool_trace,
        "final_shortlist": shortlist,

        # The routing decision, stated once at the top so their gate does
        # not have to infer it from molecular weight.
        "manufacturing_route": {
            "route": "chemical_synthesis",
            "cho_bioreactor_eligible": False,
            "reason": "Every candidate here is a synthetic small molecule "
                      "(<1 kDa). These are made by organic synthesis. A CHO "
                      "mammalian bioreactor produces biologics and cannot "
                      "express them — refusing the bioreactor gate for these "
                      "candidates is the correct behaviour, not an error.",
            "handoff_to": "process chemistry / route scouting",
        },
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "closed-loop design tool",
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="export results for bioREACT")
    ap.add_argument("--stdout", action="store_true")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    data = build()
    text = json.dumps(data, indent=2, default=str)
    if args.stdout:
        print(text)
        return
    Path(args.out).write_text(text)
    n = len(data["final_shortlist"])
    print(f"wrote {args.out}")
    print(f"  target     {data['target']}  (ref {data['referenceLigand']} "
          f"{data['referenceAffinity']} kcal/mol)")
    print(f"  rounds     {data['total_rounds']}  "
          f"converged={data['converged']}")
    print(f"  shortlist  {n} makeable candidate(s)")
    if n:
        b = data["final_shortlist"][0]
        print(f"  best       {b['dock_affinity']} kcal/mol · "
              f"{b['mw']} Da · ~{b['estimated_steps']} steps · "
              f"{b['route_complexity']}")
    print(f"  route      {data['manufacturing_route']['route']} "
          f"(CHO eligible: "
          f"{data['manufacturing_route']['cho_bioreactor_eligible']})")


if __name__ == "__main__":
    sys.exit(main())
