"""
orchestrator.py — the closed loop. This is the demo.

    Designer agent  ──candidates──▶  Synthesisability critic
                                              │ survivors
                                              ▼
                                       Process critic
                                              │
         ◀──structured rejections─────────────┘
         (the feedback edge: the only interesting part)

The designer is TOLD WHY its molecule cannot be made, and tries again. We
show the before/after: round 1 proposes molecules with (say) five
stereocentres; the critic rejects them naming `stereocentres`; round 2's
proposal has none, and the agent says so in `changes_made`.

Terminates on whichever comes first:
    - every submitted candidate is manufacturable
    - MAX_ROUNDS reached (a visible design choice, not a bug)

Run it:
    python3 orchestrator.py                  # real Claude designer, live Vina
    LLM_BACKEND=mock python3 orchestrator.py # no API key needed
    DOCK_MODE=cache  python3 orchestrator.py # instant, cached poses only
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import critics
import designer_agent as designer
import llm
import pipeline_adapter as pipe

HERE = Path(__file__).resolve().parent
MAX_ROUNDS = int(os.environ.get("MAX_ROUNDS", "3"))
AFFINITY_TARGET = float(os.environ.get("AFFINITY_TARGET", "-9.0"))

C = {
    "b": "\033[1m", "d": "\033[2m", "r": "\033[0m",
    "green": "\033[32m", "yellow": "\033[33m", "red": "\033[31m",
    "cyan": "\033[36m",
}
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    C = {k: "" for k in C}

VERDICT_COLOUR = {"pass": C["green"], "flag": C["yellow"], "fail": C["red"]}


def rule(title: str = "") -> None:
    if title:
        print(f"\n{C['b']}{'─' * 4} {title} {'─' * max(0, 68 - len(title))}{C['r']}")
    else:
        print(f"{C['d']}{'─' * 74}{C['r']}")


def run_critics(candidates: list[dict]) -> list[dict]:
    """
    Both critics on every candidate. Synthesisability gates first; the process
    critic still runs on everything so the report is complete, but a molecule
    that fails synthesisability is already dead.
    """
    assessed = []
    for c in candidates:
        a = critics.assess(c["smiles"])
        a["rationale"] = c.get("rationale", "")
        a["affinity"] = c.get("affinity")
        # A candidate that docks badly is not a manufacturability failure,
        # but it is not a survivor either. Track the two separately.
        a["meets_affinity"] = (
            c.get("affinity") is not None and c["affinity"] <= AFFINITY_TARGET
        )
        assessed.append(a)
    return assessed


def print_assessment(assessed: list[dict]) -> None:
    for i, a in enumerate(assessed, 1):
        col = VERDICT_COLOUR[a["verdict"]]
        aff = a["affinity"]
        aff_s = f"{aff:>6.2f}" if isinstance(aff, (int, float)) else "   n/a"
        print(f"\n  {C['b']}[{i}]{C['r']} {col}{a['verdict'].upper():<5}{C['r']} "
              f"affinity {aff_s} kcal/mol   "
              f"SA {a['sa_score']}   ~{a['estimated_steps']} steps   "
              f"{a['cost_band']}")
        print(f"      {C['d']}{a['smiles'][:66]}{C['r']}")
        if a["rationale"]:
            print(f"      {C['d']}designer: {a['rationale'][:60]}{C['r']}")
        for r in a["rejections"][:3]:
            mark = "✗" if r["level"] == "fail" else "⚠"
            rc = VERDICT_COLOUR["fail" if r["level"] == "fail" else "flag"]
            print(f"      {rc}{mark}{C['r']} {r['criterion']}: {r['reason']}")
            print(f"        {C['cyan']}→ {r['suggest']}{C['r']}")


def pool_round(n: int, log: designer.RunLog) -> dict:
    """
    Round 1 from the real generative pool instead of the designer.

    This is the honest version of the demo. The molecules in data/runs.db are
    actual outputs of the generative pipeline, and the best-docking ones are
    precisely the ones the critics reject. Starting here means round 1's
    rejections are real data, not a scripted setup — and the anti-correlation
    between docking score and manufacturability is the whole argument.
    """
    log.start_round(1, None)
    pool = pipe.seed_scaffolds(n)
    candidates = [{
        "smiles": p["smiles"],
        "affinity": p["affinity"],
        "rationale": "generative pipeline output, ranked by docking score",
    } for p in pool]
    log.record("generative_pool", {"n": n}, candidates)
    log.finish_round(candidates, "round 1 taken from the generative pool "
                                 "(best docking scores)", "pool")
    return {
        "round": 1, "candidates": candidates, "avoided": [],
        "changes_made": "round 1 is the generative pipeline's own output, "
                        "ranked by docking score — no manufacturability "
                        "filter applied",
        "stop_reason": "pool", "tool_calls": 0, "docks_used": 0,
    }


def closed_loop(max_rounds: int = MAX_ROUNDS, n_candidates: int = 3,
                warm_start: bool = False) -> dict:
    log = designer.RunLog()
    seeded = pipe.seed_cache_from_runs_db()

    t = pipe.TARGET()
    print(f"{C['b']}{t['name']} — closed-loop design{C['r']}")
    print(f"{C['d']}site     : {t.get('grid_source', 'unknown')}")
    print(f"{C['d']}designer : {llm.backend_name()}")
    print(f"docking  : mode={pipe.DOCK_MODE}  exhaustiveness={pipe.EXHAUSTIVENESS}  "
          f"cache={seeded} poses from runs.db")
    print(f"target   : affinity <= {AFFINITY_TARGET} kcal/mol, manufacturable")
    print(f"rounds   : hard cap {max_rounds} (design choice — the loop must "
          f"terminate){C['r']}")

    history = []
    feedback: list[dict] = []
    t0 = time.time()
    verdict_reason = "round cap reached"

    for rnd in range(1, max_rounds + 1):
        rule(f"ROUND {rnd} — DESIGNER")
        if feedback:
            crits = sorted({r["criterion"] for f in feedback
                            for r in f.get("rejections", [])
                            if r["level"] == "fail"})
            print(f"  {C['cyan']}feedback in: {len(feedback)} rejected, "
                  f"must fix {crits or ['(flags only)']}{C['r']}")

        if rnd == 1 and warm_start:
            out = pool_round(n_candidates, log)
            print(f"  {C['d']}seeded from the generative pool — no designer "
                  f"call this round{C['r']}")
        else:
            out = designer.design_round(rnd, feedback, log,
                                        n_candidates=n_candidates)

        print(f"  {len(out['candidates'])} candidates  "
              f"{C['d']}({out['tool_calls']} tool calls, "
              f"{out['docks_used']} docks, stop={out['stop_reason']}){C['r']}")
        if out["avoided"]:
            print(f"  {C['green']}agent avoided: {out['avoided']}{C['r']}")
        print(f"  {C['b']}changes_made:{C['r']} {out['changes_made'][:200]}")

        if out["stop_reason"].startswith("api_error"):
            print(f"  {C['red']}{out['stop_reason']}{C['r']}")
            verdict_reason = out["stop_reason"]
            break

        rule(f"ROUND {rnd} — CRITICS")
        assessed = run_critics(out["candidates"])
        print_assessment(assessed)

        survivors = [a for a in assessed if a["manufacturable"]]
        rejected = [a for a in assessed if not a["manufacturable"]]
        good = [a for a in survivors if a["meets_affinity"]]

        n = len(assessed) or 1
        print(f"\n  {C['b']}round {rnd}: {len(survivors)}/{n} manufacturable, "
              f"{len(good)}/{n} also meet the affinity target{C['r']}")

        history.append({
            "round": rnd,
            "n": len(assessed),
            "manufacturable": len(survivors),
            "meets_both": len(good),
            "changes_made": out["changes_made"],
            "avoided": out["avoided"],
            "stop_reason": out["stop_reason"],
            "tool_calls": out["tool_calls"],
            "docks_used": out["docks_used"],
            "assessed": assessed,
        })
        log.data["rounds"][-1]["assessed"] = assessed
        log.data["history"] = [
            {k: v for k, v in h.items() if k != "assessed"} for h in history
        ]
        log.flush()

        if not rejected and good:
            verdict_reason = "converged: all candidates manufacturable and on target"
            break
        if not rejected:
            verdict_reason = ("all manufacturable, but none met the affinity "
                              "target — stopping")
            break

        # ── THE FEEDBACK EDGE ──
        feedback = rejected

    elapsed = round(time.time() - t0, 1)
    rule("RESULT")
    print(f"  {verdict_reason}")
    print(f"  {C['d']}{len(history)} rounds, {elapsed}s{C['r']}\n")

    if history:
        print(f"  {'round':<8}{'manufacturable':>16}{'on target':>12}")
        for h in history:
            frac = f"{h['manufacturable']}/{h['n']}"
            print(f"  {h['round']:<8}{frac:>16}{h['meets_both']:>12}")
        first, last = history[0], history[-1]
        if last["manufacturable"] > first["manufacturable"]:
            print(f"\n  {C['green']}{C['b']}manufacturable fraction "
                  f"{first['manufacturable']}/{first['n']} → "
                  f"{last['manufacturable']}/{last['n']} "
                  f"after critic feedback{C['r']}")
            print(f"  {C['d']}agent's own account: "
                  f"{last['changes_made'][:160]}{C['r']}")

    best = [a for h in history for a in h["assessed"]
            if a["manufacturable"] and a["affinity"] is not None]
    best.sort(key=lambda a: a["affinity"])
    if best:
        b = best[0]
        print(f"\n  {C['b']}best manufacturable candidate{C['r']}")
        print(f"    {b['smiles']}")
        print(f"    affinity {b['affinity']} kcal/mol   SA {b['sa_score']}   "
              f"~{b['estimated_steps']} steps   {b['cost_band']}")
        print(f"    {C['d']}vs reference MK-571 at "
              f"{pipe.REFERENCE_LIGAND['affinity']} kcal/mol{C['r']}")

    result = {
        "verdict_reason": verdict_reason,
        "rounds": len(history),
        "elapsed_s": elapsed,
        "history": [{k: v for k, v in h.items() if k != "assessed"}
                    for h in history],
        "best": best[0] if best else None,
    }
    log.set(status="finished", result=result)
    print(f"\n  {C['d']}run log: {designer.RUN_LOG}{C['r']}")
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description="closed-loop molecule design")
    ap.add_argument("--rounds", type=int, default=MAX_ROUNDS)
    ap.add_argument("--candidates", type=int, default=3)
    ap.add_argument("--mock", action="store_true",
                    help="scripted designer, no API key")
    ap.add_argument("--cache-only", action="store_true",
                    help="never shell out to Vina (instant, for demo timing)")
    ap.add_argument("--warm-start", action="store_true",
                    help="round 1 from the real generative pool in runs.db "
                         "(recommended for the demo: the rejections are real)")
    ap.add_argument("--json", action="store_true", help="print result as JSON")
    args = ap.parse_args()

    if args.mock:
        llm.BACKEND = "mock"
    if args.cache_only:
        pipe.DOCK_MODE = "cache"

    res = closed_loop(args.rounds, args.candidates, warm_start=args.warm_start)
    if args.json:
        print(json.dumps(res, indent=2, default=str))


if __name__ == "__main__":
    main()
