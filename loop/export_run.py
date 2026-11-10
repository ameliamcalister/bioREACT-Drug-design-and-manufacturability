"""
export_run.py — the whole run as one JSON document.

A run leaves its evidence in three files: run_log.json (what the designer
did and what the critics said), candidates.csv (the decision table) and
manufacture_report.json (route, cost and time per candidate). This collects
them into a single self-describing document, so a result can be sent to a
colleague, attached to a report, or diffed against a later run without
anyone having to know which file held what.

    python3 export_run.py              writes bioreact_run.json
    python3 export_run.py --stdout     prints it

Nothing is recomputed here except the critics' descriptors, so the export
always matches the run it describes.
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
MANUFACTURE_REPORT = HERE / "manufacture_report.json"
OUT = HERE / "bioreact_run.json"


def _candidate(assessed: dict) -> dict:
    """One candidate: structure, binding, and what the critics said."""
    metrics = (assessed.get("metrics")
               or assessed.get("synthesisability", {}).get("metrics", {}))
    synthesisability = assessed.get("synthesisability", {})
    process = assessed.get("process", {})

    return {
        "smiles": assessed["smiles"],
        "rationale": assessed.get("rationale", ""),
        "docking": {
            "affinity_kcal_per_mol": assessed.get("affinity"),
            "engine": "AutoDock Vina",
            "note": "ranks candidates; not a binding free energy",
        },
        "critics": {
            "verdict": assessed.get("verdict"),
            "manufacturable": assessed.get("manufacturable"),
            "synthesisability_verdict": synthesisability.get("verdict"),
            "process_verdict": process.get("verdict"),
            "sa_score": assessed.get("sa_score"),
            "estimated_steps": assessed.get("estimated_steps"),
            "estimated_steps_note": "heuristic, not a retrosynthesis",
            "route_complexity": assessed.get("route_complexity"),
            "functional_group_flags": process.get("group_flags", []),
            "rejections": assessed.get("rejections", []),
        },
        "descriptors": {k: v for k, v in metrics.items()
                        if not k.startswith("_")},
    }


def build(run_log: Path = RUN_LOG) -> dict:
    if not run_log.exists():
        raise SystemExit(f"no run yet — {run_log} not found. Run the loop "
                         f"first.")
    log = json.loads(run_log.read_text())
    active = pipe.TARGET()
    reference = dict(pipe.REFERENCE_LIGAND)
    result = log.get("result") or {}

    rounds, tool_trace = [], []
    for round_data in log.get("rounds", []):
        assessed = round_data.get("assessed") or []
        counts = {verdict: sum(1 for a in assessed
                               if a.get("verdict") == verdict)
                  for verdict in ("pass", "flag", "fail")}
        feedback = round_data.get("feedback_in") or []
        must_fix = sorted({r["criterion"] for f in feedback
                           for r in f.get("rejections", [])
                           if r["level"] == "fail"})

        rounds.append({
            "round": round_data.get("round"),
            "source": ("generative pool" if round_data.get("status") == "pool"
                       else "designer agent"),
            "agent_notes": round_data.get("changes_made") or "",
            "feedback_in": (
                {"rejected": len(feedback), "must_fix": must_fix}
                if must_fix else None),
            "candidates": [_candidate(a) for a in assessed],
            "counts": counts,
            "tool_calls": len(round_data.get("trace", [])),
        })
        for event in round_data.get("trace", []):
            tool_trace.append({
                "round": round_data.get("round"),
                "t_seconds": event.get("t"),
                "tool": event.get("tool"),
                "args": event.get("args", {}),
                "result_summary": str(event.get("result"))[:200],
            })

    manufacturability = None
    if MANUFACTURE_REPORT.exists():
        try:
            manufacturability = json.loads(MANUFACTURE_REPORT.read_text())
        except Exception:
            manufacturability = None

    return {
        "schema": "bioreact.run/1",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "target": {
            "name": active.get("name"),
            "slug": active.get("slug"),
            "description": active.get("description", ""),
            "grid_source": active.get("grid_source"),
            "grid": dict(active.get("grid", {})),
            "chembl_target_id": active.get("chembl_target_id"),
            "reference_ligand": {
                "name": reference.get("name"),
                "smiles": reference.get("smiles"),
                "affinity_kcal_per_mol": reference.get("affinity"),
            },
        },
        "run": {
            "designer": log.get("model"),
            "docking_mode": log.get("dock_mode"),
            "status": log.get("status"),
            "rounds_completed": len(rounds),
            "verdict_reason": result.get("verdict_reason"),
            "elapsed_s": result.get("elapsed_s"),
            "tool_calls": len(tool_trace),
            "docks": sum(1 for e in tool_trace if e["tool"] == "dock"),
        },
        "rounds": rounds,
        "tool_trace": tool_trace,
        "decision_table": log.get("decision_table") or [],
        "manufacturability": manufacturability,
        "rubric": {name: {"flag_above": flag, "fail_above": fail}
                   for name, (flag, fail) in critics.RUBRIC.items()},
        "limitations": [
            "Estimated step count is a heuristic from rings, stereocentres "
            "and heavy atoms, not a retrosynthesis.",
            "Cost and time figures are order-of-magnitude estimates from "
            "uncalibrated factors; the ranking between candidates is the "
            "result, not the absolute number.",
            "Docking is rigid-receptor AutoDock Vina on one grid: scores "
            "rank, they do not predict affinity.",
            "The property screen is published rule sets and structural "
            "alerts, not a trained ADMET model.",
            "No synthesis or fermentation is ever executed. Everything here "
            "is a proposal for a person to approve.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="export the run as JSON")
    parser.add_argument("--stdout", action="store_true")
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()

    data = build()
    text = json.dumps(data, indent=2, default=str)
    if args.stdout:
        print(text)
        return

    Path(args.out).write_text(text)
    shortlist = data.get("decision_table") or []
    print(f"wrote {args.out}")
    print(f"  target     {data['target']['name']} "
          f"(ref {data['target']['reference_ligand']['name']} "
          f"{data['target']['reference_ligand']['affinity_kcal_per_mol']} "
          f"kcal/mol)")
    print(f"  rounds     {data['run']['rounds_completed']}  "
          f"{data['run']['verdict_reason']}")
    print(f"  candidates {len(shortlist)} in the decision table")
    if data.get("manufacturability"):
        costed = data["manufacturability"].get("candidates") or []
        print(f"  costed     {len(costed)} at "
              f"{data['manufacturability'].get('scale_label')}")


if __name__ == "__main__":
    sys.exit(main())
