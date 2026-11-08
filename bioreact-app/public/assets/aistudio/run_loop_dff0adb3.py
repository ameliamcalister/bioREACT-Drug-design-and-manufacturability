"""
The closed loop. This is what you run on stage.

    python run_loop.py --target MRP1 --mock-designer          # 2s, no deps
    python run_loop.py --rounds 3 --parent "<SMILES>"         # real

KEY ORDERING DECISION: critics run BEFORE docking.

A Vina run on MRP1 takes minutes. Docking a molecule the process critic would
reject anyway wastes that time for nothing. So each round goes:

    propose -> CRITICS GATE -> dock survivors only -> carry forward best

Round 1 typically rejects 2 of 3, so you dock one molecule instead of three.
That is both ~3x faster and a better argument: we do not spend compute
docking molecules nobody can manufacture.
"""

from __future__ import annotations

import argparse
import json
import time

import critics
import pipeline_adapter as pipeline


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="MRP1")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--n", type=int, default=3, help="Candidates proposed per round.")
    ap.add_argument("--log", default="run_log.json")
    ap.add_argument("--mock-designer", action="store_true",
                    help="Skip the LLM; candidates come straight from the adapter.")
    ap.add_argument("--parent", default="CC(=O)Nc1ccc(O)cc1",
                    help="Starting compound (your MK571 analogue for real runs).")
    ap.add_argument("--parent-score", type=float, default=0.0,
                    help="Known Vina score of the parent, if you have one.")
    ap.add_argument("--max-docks", type=int, default=12,
                    help="Hard wall-clock guard. Stops proposing once hit.")
    ap.add_argument("--dock-flagged", action="store_true",
                    help="Also dock 'flag' candidates, not just 'pass'. Slower.")
    args = ap.parse_args()

    if not pipeline.MOCK and not pipeline.receptor_ready():
        raise SystemExit(
            "Receptor not found. Set RECEPTOR_PDBQT=/path/to/5uja.pdbqt, "
            "or run with DESIGNER_MOCK=1."
        )

    pipeline.set_parent(args.parent, score=args.parent_score)
    pipeline.load_chembl_context()
    print(f"[loop] {pipeline.cache_stats()}")

    history: list[dict] = []
    avoid: list[str] = []
    docks_used = 0
    t0 = time.time()

    for rnd in range(1, args.rounds + 1):
        if docks_used >= args.max_docks:
            print(f"\n[loop] dock budget ({args.max_docks}) exhausted. Stopping.")
            break

        print(f"\n{'=' * 72}\nROUND {rnd}")
        if avoid:
            print(f"Constraints carried in: {', '.join(avoid)}")
        print("=" * 72)

        # ---- 1. propose -------------------------------------------------
        smis = pipeline.propose_candidates(args.target, n=args.n, avoid=avoid)
        if not smis:
            print("No valid candidates proposed. Stopping.")
            break
        print(f"Proposed {len(smis)} candidates.")

        # ---- 2. CRITICS GATE (before any docking) -----------------------
        cands = [{"smiles": s} for s in smis]
        verdicts = critics.judge(cands)

        gate = {"pass"} if not args.dock_flagged else {"pass", "flag"}
        survivors = [s for s, v in zip(smis, verdicts) if v["overall"] in gate]
        rejected = len(smis) - len(survivors)
        print(f"Critics: {len(survivors)} cleared, {rejected} rejected "
              f"-> {rejected} Vina run(s) saved "
              f"(~{rejected * 3} min at ~3 min/dock).")

        # ---- 3. dock survivors only, in parallel ------------------------
        budget_left = max(0, args.max_docks - docks_used)
        to_dock = survivors[:budget_left]
        dock_results = pipeline.dock_many(to_dock) if to_dock else {}
        docks_used += sum(1 for r in dock_results.values() if not r.get("cached"))

        for c, v in zip(cands, verdicts):
            dr = dock_results.get(c["smiles"]) or {}
            c["score"] = dr.get("score")
            c["pose_path"] = dr.get("pose_path")
            c["cached"] = dr.get("cached", False)
            c["docked"] = c["smiles"] in dock_results

        _print_round(cands, verdicts)

        # ---- 4. carry forward the best SURVIVOR -------------------------
        scored = [(c, v) for c, v in zip(cands, verdicts)
                  if c.get("score") is not None and v["overall"] in gate]
        if scored:
            best_c, _best_v = min(scored, key=lambda cv: cv[0]["score"])
            pipeline.set_parent(best_c["smiles"], score=best_c["score"])
            if best_c.get("pose_path"):
                pipeline.update_pose_context(best_c["pose_path"])
            print(f"\nCarrying forward: {best_c['score']} kcal/mol  "
                  f"{best_c['smiles'][:60]}")

        history.append({
            "round": rnd,
            "candidates": cands,
            "verdicts": verdicts,
            "constraints_in": list(avoid),
            "docks_used": docks_used,
            "elapsed_s": round(time.time() - t0, 1),
        })

        # ---- 5. accumulate constraints ----------------------------------
        new = {f for v in verdicts for f in v["features_to_avoid"]}
        avoid = sorted(set(avoid) | new)

        if all(v["overall"] == "pass" for v in verdicts):
            print(f"\nAll candidates cleared both critics at round {rnd}. Loop closed.")
            break

    with open(args.log.replace(".json", "_loop.json"), "w") as fh:
        json.dump({"target": args.target, "parent": args.parent,
                   "history": history}, fh, indent=2)

    _print_summary(history, time.time() - t0, docks_used)


def _print_round(cands: list[dict], verdicts: list[dict]) -> None:
    for c, v in zip(cands, verdicts):
        mark = {"pass": "PASS", "flag": "FLAG", "fail": "FAIL"}[v["overall"]]
        print(f"\n[{mark}] {c['smiles']}")
        if c.get("score") is not None:
            tag = " (cached)" if c.get("cached") else ""
            print(f"       dock {c['score']} kcal/mol{tag}")
        elif not c.get("docked"):
            print("       not docked -- rejected before docking")
        for r in v["synthesisability"]["reasons"] + v["process"]["reasons"]:
            print(f"       - {r}")
        if v["features_to_avoid"]:
            print(f"       -> avoid: {', '.join(v['features_to_avoid'])}")
        print(f"       cost: {v['process']['detail'].get('cost_band')}")


def _print_summary(history: list[dict], elapsed: float, docks: int) -> None:
    print(f"\n{'=' * 72}\nLOOP SUMMARY\n{'=' * 72}")
    print(f"{'round':<7}{'proposed':<10}{'pass':<6}{'flag':<6}{'fail':<6}"
          f"{'docked':<8}{'best':<9}")
    for h in history:
        vs = [v["overall"] for v in h["verdicts"]]
        scores = [c["score"] for c in h["candidates"] if c.get("score") is not None]
        best = f"{min(scores):.2f}" if scores else "--"
        print(f"{h['round']:<7}{len(vs):<10}"
              f"{vs.count('pass'):<6}{vs.count('flag'):<6}{vs.count('fail'):<6}"
              f"{len(scores):<8}{best:<9}")

    if len(history) >= 2:
        first = [v["overall"] for v in history[0]["verdicts"]]
        last = [v["overall"] for v in history[-1]["verdicts"]]
        print(f"\nManufacturable fraction: "
              f"{first.count('pass')}/{len(first)} -> {last.count('pass')}/{len(last)}")
        print("^ this number is the pitch. Put it on a slide.")

    saved = sum(len(h["candidates"]) - sum(1 for c in h["candidates"] if c.get("docked"))
                for h in history)
    print(f"\nVina runs performed: {docks} | avoided by gating first: {saved}")
    print(f"Wall clock: {elapsed / 60:.1f} min")


if __name__ == "__main__":
    main()
