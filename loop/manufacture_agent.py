"""
manufacture_agent.py — the manufacturability agents.

One agent per shortlisted candidate. Each is given the molecule and a set of
tools, and has to answer three questions:

    How would this be produced?
    What would a gram cost at the scale we need?
    How long until the first delivery?

WHY AN AGENT AT ALL, AND WHERE THE NUMBERS COME FROM

The judgement is genuinely open: a chiral amine could be set by a
transaminase or by resolution, a natural-product-like scaffold may be a
fermentation problem rather than a synthesis problem, and which of those is
right depends on the structure in front of you. That choice is what the
agent makes, and it has to defend it against the tool output.

What the agent may NOT do is produce a number. Every figure in the final
assessment is lifted from a `manufacture.py` tool result recorded during
the conversation — the submit tool reads them out of the transcript rather
than from the model's arguments, so a hallucinated cost cannot reach the
report even if the model states one. If the agent submits a route it never
costed, submission fails and it is told to call the tool first.

Without an API key this module still works: `assess_deterministically`
produces the same structure from the rules alone, labelled as rule-based so
nobody mistakes it for the agent's reasoning.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import admet
import llm
import manufacture

HERE = Path(__file__).resolve().parent
REPORT = HERE / "manufacture_report.json"

MODEL = os.environ.get("MANUFACTURE_MODEL",
                       os.environ.get("DESIGNER_MODEL", "claude-sonnet-5-5"))
MAX_TOOL_CALLS = int(os.environ.get("MANUFACTURE_MAX_TOOL_CALLS", "14"))

METHOD_NOTE = (
    "One agent per candidate chooses the production route and justifies it; "
    "every figure comes from the deterministic model in manufacture.py, "
    "which the agent is required to call. Costs are order-of-magnitude "
    "estimates from uncalibrated factors — the ranking is the result, not "
    "the absolute number.")

SYSTEM = """\
You are a process chemistry and bioprocess engineering agent. A medicinal \
chemistry loop has shortlisted a molecule; your job is to say how it would \
be produced, what a gram would cost at the stated scale, and how long the \
first delivery would take.

HOW TO WORK
1. Call molecule_profile first. It gives you the structure's descriptors, \
the estimated step count, the enzyme-amenable motifs found in it and the \
process operations it forces (precious-metal coupling, chiral resolution, \
chromatography).
2. Call route_options to see every route the rules consider applicable, \
with the reasoning for each.
3. Call estimate_cost and estimate_time for the route you favour. If a \
second route is genuinely competitive, cost that one too and compare. You \
cannot submit a route you have not costed.
4. Call submit_assessment with your chosen route, your justification, and \
the risks a process chemist would raise at the first project meeting.

RULES ABOUT NUMBERS
Never state a cost, a yield, a titre or a duration that did not come back \
from a tool. The tools own the arithmetic; you own the choice of route and \
the explanation. If the tools say no route fits the molecule as drawn, say \
so plainly and recommend redesign rather than quoting a price for a route \
nobody would run.

WHAT A GOOD JUSTIFICATION LOOKS LIKE
Name the structural feature that decides the route — this stereocentre, \
that biaryl bond, this macrocycle — and what it implies for the process. \
Prefer the route a process chemist would actually choose, which is usually \
the shortest one that avoids a resolution. Be specific and brief: three or \
four sentences, no hedging, no marketing.

RISKS
Give two to four. Each one should be a thing that could go wrong in \
development, stated concretely enough to plan an experiment around: a \
substrate an enzyme panel may not accept, a metal specification on the \
final compound, an intermediate unlikely to crystallise, a titre that has \
to be reached for the economics to work.
"""

TOOLS = [
    {
        "name": "molecule_profile",
        "description": "Descriptors, estimated step count, enzyme-amenable "
                       "motifs and forced process operations for the "
                       "molecule. Call this first.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "property_screen",
        "description": "Lipinski, Veber, Ghose and Egan rule sets, QED and "
                       "PAINS/Brenk structural alerts. Use it if a property "
                       "problem would change the production decision.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "route_options",
        "description": "Every production route the rules consider for this "
                       "structure — chemical, chemo-enzymatic, fermentation, "
                       "solid-phase peptide synthesis — each with its fit, "
                       "reasons and caveats.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "estimate_cost",
        "description": "Cost per gram at the target scale for one route, "
                       "itemised, with the premiums the structure triggers "
                       "and any one-off development cost.",
        "input_schema": {
            "type": "object",
            "properties": {
                "route": {"type": "string",
                          "enum": list(manufacture.ROUTES.keys())},
            },
            "required": ["route"],
        },
    },
    {
        "name": "estimate_time",
        "description": "Weeks to first delivery at the target scale for one "
                       "route, split into development, execution and "
                       "release testing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "route": {"type": "string",
                          "enum": list(manufacture.ROUTES.keys())},
            },
            "required": ["route"],
        },
    },
    {
        "name": "submit_assessment",
        "description": "Finish. Submit the chosen route, the justification "
                       "and the risks. The cost and time figures are taken "
                       "from your tool results, not from this call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "route": {"type": "string",
                          "enum": list(manufacture.ROUTES.keys()),
                          "description": "must be a route you costed"},
                "justification": {
                    "type": "string",
                    "description": "three or four sentences naming the "
                                   "structural features that decide the route",
                },
                "risks": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "two to four concrete development risks",
                },
                "redesign_recommended": {
                    "type": "boolean",
                    "description": "true if no route fits the molecule as "
                                   "drawn and it should go back to design",
                },
                "headline": {
                    "type": "string",
                    "description": "one sentence a project meeting would "
                                   "accept as the summary",
                },
            },
            "required": ["route", "justification", "risks", "headline"],
        },
    },
]


class Tools:
    """Executes the tools and remembers every number it handed out."""

    def __init__(self, smiles: str, scale_g: float, overrides: dict | None):
        self.smiles = smiles
        self.scale_g = scale_g
        self.overrides = overrides
        self.profile = manufacture.read_structure(smiles)
        self.costed: dict[str, dict] = {}
        self.timed: dict[str, dict] = {}
        self.submission: dict | None = None

    def run(self, name: str, args: dict):
        try:
            return getattr(self, f"_{name}")(args)
        except AttributeError:
            return {"error": f"unknown tool '{name}'"}
        except Exception as e:
            return {"error": f"{type(e).__name__}: {e}"}

    # ── read-only tools ──────────────────────────────────────────────────
    def _molecule_profile(self, _args):
        p = self.profile
        if not p.get("ok"):
            return {"error": p.get("error")}
        return {
            "smiles": self.smiles,
            "target_scale_g": self.scale_g,
            "descriptors": {k: p["metrics"].get(k) for k in
                            ("mw", "logp", "tpsa", "heavy_atoms",
                             "stereocentres", "rotatable_bonds", "rings",
                             "fused_ring_systems", "spiro_atoms",
                             "macrocycle_size", "fsp3", "halogen_density")},
            "estimated_steps": p["estimated_steps"],
            "estimated_steps_caveat": "heuristic from rings, stereocentres "
                                      "and heavy atoms; not a retrosynthesis",
            "sa_score": p["sa_score"],
            "critic_verdict": p["critic_verdict"],
            "critic_rejections": [
                {"criterion": r["criterion"], "level": r["level"],
                 "reason": r["reason"]} for r in p["rejections"][:5]],
            "functional_group_flags": p["group_flags"],
            "enzyme_amenable_motifs": [
                {"motif": h["key"], "enzyme": h["enzyme"],
                 "matches": h["matches"], "replaces": h["replaces"]}
                for h in p["enzyme_motifs"]],
            "forced_operations": [f["label"] for f in manufacture.PROCESS_FLAGS
                                  if p["process_flags"].get(f["key"])],
            "peptide_like": p["is_peptide_like"],
            "natural_product_like": p["is_natural_product_like"],
        }

    def _property_screen(self, _args):
        result = admet.screen(self.smiles)
        if not result.get("ok"):
            return {"error": result.get("error")}
        return {
            "verdict": result["verdict"],
            "qed": result["qed"],
            "rule_sets_broken": result["rule_sets_broken"],
            "alerts": [f"{a['family']}: {a['name']}" for a in result["alerts"]],
            "proxies": result["proxies"],
            "disclaimer": result["disclaimer"],
        }

    def _route_options(self, _args):
        if not self.profile.get("ok"):
            return {"error": self.profile.get("error")}
        return {"options": manufacture.route_options(self.profile)}

    def _estimate_cost(self, args):
        route = args.get("route")
        if route not in manufacture.ROUTES:
            return {"error": f"unknown route '{route}'"}
        result = manufacture.cost(self.profile, self.scale_g, route,
                                  self.overrides)
        self.costed[route] = result
        return result

    def _estimate_time(self, args):
        route = args.get("route")
        if route not in manufacture.ROUTES:
            return {"error": f"unknown route '{route}'"}
        result = manufacture.time_to_manufacture(self.profile, self.scale_g,
                                                 route, self.overrides)
        self.timed[route] = result
        return result

    # ── submission ───────────────────────────────────────────────────────
    def _submit_assessment(self, args):
        route = args.get("route")
        if route not in manufacture.ROUTES:
            return {"error": f"unknown route '{route}'"}
        if route not in self.costed:
            return {"error": f"you have not called estimate_cost for "
                             f"'{route}' — do that first, then submit"}
        if route not in self.timed:
            return {"error": f"you have not called estimate_time for "
                             f"'{route}' — do that first, then submit"}
        risks = [str(r) for r in (args.get("risks") or []) if str(r).strip()]
        if len(risks) < 2:
            return {"error": "give at least two concrete development risks"}

        self.submission = {
            "route": route,
            "justification": str(args.get("justification", "")).strip(),
            "risks": risks[:4],
            "headline": str(args.get("headline", "")).strip(),
            "redesign_recommended": bool(args.get("redesign_recommended")),
        }
        return {"accepted": True,
                "note": "cost and time will be taken from your tool results"}


# ═════════════════════════════════════════════════════════════════════════════
# THE AGENT
# ═════════════════════════════════════════════════════════════════════════════
def assess_with_agent(smiles: str, scale_g: float = 1000.0,
                      overrides: dict | None = None,
                      context: str = "") -> dict:
    """
    One agent, one molecule. Returns the assessment plus its tool trace.

    Any failure — no key, API error, a model that will not submit — falls
    back to the deterministic assessment, with `mode` saying which happened.
    """
    tools = Tools(smiles, scale_g, overrides)
    if not tools.profile.get("ok"):
        return {"ok": False, "smiles": smiles,
                "error": tools.profile.get("error")}

    scale_label = next((s["label"] for s in manufacture.SCALE_PRESETS
                        if s["grams"] == scale_g), f"{scale_g:.0f} g")
    purpose = next((s["purpose"] for s in manufacture.SCALE_PRESETS
                    if s["grams"] == scale_g), "a development campaign")
    task = (f"Molecule: {smiles}\n"
            f"Quantity needed: {scale_label} ({purpose}).\n"
            f"{context}\n"
            f"Work out how it would be produced, what it would cost per "
            f"gram, and how long the first delivery would take.").strip()

    messages = [{"role": "user", "content": task}]
    trace: list[dict] = []
    calls = 0
    nudged = False
    mode, error = "agent", None
    started = time.time()

    while calls < MAX_TOOL_CALLS:
        try:
            response = llm.complete(SYSTEM, messages, TOOLS, model=MODEL)
        except Exception as e:
            mode, error = "deterministic_fallback", f"{type(e).__name__}: {e}"
            break

        tool_uses = response.get("tool_calls") or []
        blocks = response.get("raw_content") or (
            ([{"type": "text", "text": response["text"]}]
             if response.get("text") else [])
            + [{"type": "tool_use", "id": t["id"], "name": t["name"],
                "input": t["input"]} for t in tool_uses])
        if blocks:
            messages.append({"role": "assistant", "content": blocks})

        if not tool_uses:
            if nudged:
                mode, error = "deterministic_fallback", "agent never submitted"
                break
            nudged = True
            messages.append({"role": "user", "content":
                             "Call submit_assessment now with the route you "
                             "costed, your justification and the risks."})
            continue

        results = []
        for use in tool_uses:
            calls += 1
            output = tools.run(use["name"], use["input"] or {})
            trace.append({
                "t": round(time.time() - started, 1),
                "tool": use["name"],
                "args": use["input"] or {},
                "ok": "error" not in (output if isinstance(output, dict) else {}),
                "summary": _summarise_tool(use["name"], output),
            })
            results.append({"type": "tool_result", "tool_use_id": use["id"],
                            "content": json.dumps(output, default=str)[:6000]})
        messages.append({"role": "user", "content": results})

        if tools.submission:
            break
    else:
        mode, error = "deterministic_fallback", "tool budget exhausted"

    if tools.submission is None and mode == "agent":
        mode, error = "deterministic_fallback", error or "no submission"

    if mode != "agent":
        fallback = assess_deterministically(smiles, scale_g, overrides)
        fallback["agent_error"] = error
        fallback["trace"] = trace
        return fallback

    route = tools.submission["route"]
    assessment = manufacture.assess(smiles, scale_g, overrides, route=route)
    assessment.update({
        "mode": "agent",
        "model": llm.backend_name(),
        "agent": {
            "headline": tools.submission["headline"],
            "justification": tools.submission["justification"],
            "risks": tools.submission["risks"],
            "redesign_recommended": tools.submission["redesign_recommended"],
            "routes_costed": sorted(tools.costed.keys()),
        },
        "cost": tools.costed[route],
        "time": tools.timed[route],
        "trace": trace,
        "tool_calls": calls,
        "elapsed_s": round(time.time() - started, 1),
    })
    return assessment


def _summarise_tool(name: str, output) -> str:
    """One line per tool call, for the trace shown in the interface."""
    if isinstance(output, dict) and "error" in output:
        return f"error: {output['error']}"
    if name == "molecule_profile":
        return (f"{output['descriptors'].get('mw')} Da, "
                f"~{output['estimated_steps']} steps, "
                f"{len(output['enzyme_amenable_motifs'])} enzyme motif(s), "
                f"{len(output['forced_operations'])} forced operation(s)")
    if name == "route_options":
        fits = ", ".join(f"{o['route']}={o['fit']}"
                         for o in output.get("options", []))
        return fits or "no options"
    if name == "estimate_cost":
        band = output["cost_per_gram_usd"]
        return (f"{output['route']}: ${band['low']:,.0f}–{band['high']:,.0f}/g "
                f"at {output['scale_g']:.0f} g"
                + ("" if output.get("viable") else "  [not viable as drawn]"))
    if name == "estimate_time":
        band = output["total_weeks"]
        return (f"{output['route']}: {band['low']:.0f}–{band['high']:.0f} "
                f"weeks to first delivery")
    if name == "property_screen":
        return (f"{output['verdict']}, QED {output['qed']}, "
                f"{len(output['alerts'])} alert(s)")
    if name == "submit_assessment":
        return "assessment submitted"
    return "ok"


def _rule_based_risks(assessment: dict) -> list[str]:
    """
    Risks without an agent: the operations this structure forces, the
    critics' own caveats, and the one risk that applies to every figure
    here. Better than a placeholder, and all of it is derived rather than
    written in advance.
    """
    risks: list[str] = []
    for flag in assessment.get("process_flags", []):
        risks.append(f"{flag['label']}: {flag['detail']}")
    for caveat in assessment.get("route_caveats", []):
        risks.append(caveat)
    risks.append(
        "The cost factors behind this estimate are uncalibrated, so the "
        "ranking against the other candidates is the result — not the "
        "figure itself.")
    if len(risks) < 2:
        risks.append(
            "No route-specific risk was identified by the rules, which "
            "means the structure is unremarkable to them, not that the "
            "campaign is risk-free.")
    return risks[:4]


def assess_deterministically(smiles: str, scale_g: float = 1000.0,
                             overrides: dict | None = None) -> dict:
    """
    The same assessment from the rules alone — used when no API key is set,
    and as the fallback if the agent fails. Labelled so the difference is
    visible in the interface.
    """
    assessment = manufacture.assess(smiles, scale_g, overrides)
    if not assessment.get("ok"):
        return assessment
    reasons = assessment["route_reasons"]
    assessment.update({
        "mode": "rule_based",
        "model": "deterministic rules (no agent)",
        "agent": {
            "headline": (
                f"{assessment['route_label']}: "
                f"${assessment['cost']['cost_per_gram_usd']['low']:,.0f}–"
                f"{assessment['cost']['cost_per_gram_usd']['high']:,.0f} per "
                f"gram at {assessment['scale_label']}, first delivery in "
                f"{assessment['time']['total_weeks']['low']:.0f}–"
                f"{assessment['time']['total_weeks']['high']:.0f} weeks"),
            "justification": " ".join(reasons[:3]) or "rule-based assessment",
            "risks": _rule_based_risks(assessment),
            "redesign_recommended": assessment["verdict"] == "redesign_required",
            "routes_costed": [assessment["route"]],
        },
        "trace": [],
        "tool_calls": 0,
    })
    return assessment


# ═════════════════════════════════════════════════════════════════════════════
# A SHORTLIST AT A TIME
# ═════════════════════════════════════════════════════════════════════════════
def assess_shortlist(candidates: list[dict], scale_g: float = 1000.0,
                     overrides: dict | None = None,
                     use_agent: bool | None = None,
                     progress=None, on_update=None) -> dict:
    """
    Run the agents over a shortlist and return the side-by-side comparison.

    `candidates` are dicts with at least `smiles`, optionally `affinity` and
    `label`, which are carried into the comparison so binding and
    manufacturability can be read together.
    """
    if use_agent is None:
        use_agent = (llm.BACKEND != "mock"
                     and bool(os.environ.get("ANTHROPIC_API_KEY")))

    rows, started = [], time.time()
    total = len([c for c in candidates if (c.get("smiles") or "").strip()])

    def envelope(status: str, done: int) -> dict:
        return {
            "ok": True,
            "status": status,
            "progress": {"done": done, "total": total},
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "mode": "agent" if use_agent else "rule_based",
            "model": llm.backend_name() if use_agent else "deterministic rules",
            "scale_g": scale_g,
            "scale_label": next((s["label"] for s in manufacture.SCALE_PRESETS
                                 if s["grams"] == scale_g), f"{scale_g:.0f} g"),
            "overrides": overrides or {},
            "assumptions": manufacture.assumptions_table(overrides),
            "candidates": rows,
            "elapsed_s": round(time.time() - started, 1),
            "method": METHOD_NOTE,
        }

    if on_update:
        on_update(envelope("running", 0))

    for i, candidate in enumerate(candidates, start=1):
        smiles = (candidate.get("smiles") or "").strip()
        if not smiles:
            continue
        if progress:
            progress(i, total, smiles)
        context = ""
        if candidate.get("affinity") is not None:
            context = (f"Docking put it at {candidate['affinity']} kcal/mol "
                       f"against the target, which is why it is on the "
                       f"shortlist.")
        assessment = (assess_with_agent(smiles, scale_g, overrides, context)
                      if use_agent else
                      assess_deterministically(smiles, scale_g, overrides))
        if not assessment.get("ok"):
            continue
        assessment["affinity"] = candidate.get("affinity")
        assessment["label"] = candidate.get("label") or ""
        assessment["rationale"] = candidate.get("rationale") or ""
        rows.append(assessment)

        rows.sort(key=_ranking_key)
        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank
        if on_update:
            on_update(envelope("running", len(rows)))

    final = envelope("finished", len(rows))
    if on_update:
        on_update(final)
    return final


def _ranking_key(row: dict):
    """
    Cheapest makeable candidate first.

    Binding is what the molecule is for, so it breaks ties — but a molecule
    that cannot be made is not a better candidate than one that can,
    however well it docks, so those sort last.
    """
    blocked = 0 if row.get("verdict") == "route_identified" else 1
    not_makeable = 0 if row.get("manufacturable") else 1
    cost = row["cost"]["cost_per_gram_usd"]["point"]
    affinity = row.get("affinity")
    return (blocked, not_makeable, cost,
            affinity if affinity is not None else 0.0)


def write_report(report: dict) -> None:
    """Atomic write, because the interface polls this file while it fills."""
    tmp = REPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps(report, indent=2, default=str))
    tmp.replace(REPORT)


def shortlist_from_run_log(run_log: Path | None = None,
                           limit: int = 6) -> list[dict]:
    """
    The candidates worth assessing, taken from the loop's own run log.

    Everything the critics did not fail, docked, best binding first, one
    entry per molecule. If the loop failed every candidate there is nothing
    to cost — the three worst are assessed anyway, because "this is what it
    would take" is the answer that sends them back to design.
    """
    run_log = run_log or (HERE / "run_log.json")
    if not run_log.exists():
        raise SystemExit(f"no run yet — {run_log} not found. Run the loop "
                         f"first, then assess its shortlist.")
    log = json.loads(run_log.read_text())

    best: dict[str, dict] = {}
    for round_data in log.get("rounds", []):
        for assessed in round_data.get("assessed") or []:
            smiles = assessed.get("smiles")
            if not smiles:
                continue
            best[smiles] = {
                "smiles": smiles,
                "affinity": assessed.get("affinity"),
                "rationale": assessed.get("rationale", ""),
                "verdict": assessed.get("verdict"),
                "round": round_data.get("round"),
            }

    docked = [c for c in best.values() if c["affinity"] is not None]
    makeable = [c for c in docked if c["verdict"] != "fail"]
    pool = makeable or sorted(docked, key=lambda c: c["affinity"])[:3]
    pool.sort(key=lambda c: c["affinity"])
    return pool[:limit]


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="manufacturability agents: route, cost at scale, time")
    parser.add_argument("smiles", nargs="*",
                        help="molecules to assess; default is the shortlist "
                             "from the last loop run")
    parser.add_argument("--scale", type=float, default=1000.0,
                        help="grams needed (default 1000)")
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--rules-only", action="store_true",
                        help="skip the agent, use the deterministic rules")
    parser.add_argument("--overrides", default="",
                        help="JSON object of assumption overrides")
    parser.add_argument("--out", default=str(REPORT))
    args = parser.parse_args()

    overrides = json.loads(args.overrides) if args.overrides.strip() else None
    candidates = ([{"smiles": s} for s in args.smiles] if args.smiles
                  else shortlist_from_run_log(limit=args.limit))
    if not candidates:
        raise SystemExit("nothing to assess")

    out_path = Path(args.out)

    def flush(report: dict) -> None:
        tmp = out_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(report, indent=2, default=str))
        tmp.replace(out_path)

    print(f"assessing {len(candidates)} candidate(s) at "
          f"{args.scale:.0f} g — "
          f"{'rules only' if args.rules_only else llm.backend_name()}")
    report = assess_shortlist(
        candidates, scale_g=args.scale, overrides=overrides,
        use_agent=False if args.rules_only else None,
        progress=lambda i, n, s: print(f"  [{i}/{n}] {s[:62]}", flush=True),
        on_update=flush)

    print()
    for row in report["candidates"]:
        band = row["cost"]["cost_per_gram_usd"]
        weeks = row["time"]["total_weeks"]
        flag = "" if row["verdict"] == "route_identified" else "  [REDESIGN]"
        print(f"#{row['rank']}  {row['route_label']}{flag}")
        print(f"    ${band['low']:,.0f}–{band['high']:,.0f}/g · "
              f"{weeks['low']:.0f}–{weeks['high']:.0f} weeks · "
              f"{row['mode']}")
        print(f"    {row['agent']['headline']}")
        for risk in row["agent"]["risks"][:2]:
            print(f"    risk: {risk}")
        print()
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
