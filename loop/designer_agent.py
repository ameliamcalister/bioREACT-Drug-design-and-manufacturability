"""
designer_agent.py — your pipeline, agentified.

This is an agent, not a script. The difference, and the thing to say when a
judge asks: the model decides which molecules to propose, which to spend a
docking run on, when it has enough, and how to respond to critic feedback.
We decide none of that. What we control is the tool surface and the budget.

Tools the agent can call:
    seed_scaffolds      - the reference ligand and anything already docked
    binding_site_gaps   - the unoccupied regions of the cavity next to a
                          docked pose: volume, lining residues, what to put
                          there. This is what makes the design strategy
                          "grow into the empty space" rather than "make it
                          bigger and hope"
    known_binders       - published binders of this target from ChEMBL,
                          with measured potency
    find_analogues      - ChEMBL molecules similar to one of ours, so the
                          agent can see whether a scaffold is already known
    properties          - RDKit descriptors, cheap, no docking
    property_screen     - Lipinski, Veber, Ghose, Egan, QED and structural
                          alerts, with each rule named
    dock                - AutoDock Vina against the target (~12 s live)
    propose_candidates  - register candidate SMILES, validated
    submit              - finish the round

Safety rails that make it demo-proof, all deliberate:
    - hard tool-call budget (MAX_TOOL_CALLS), so it cannot run away
    - if the model stops calling tools without submitting, it gets ONE nudge,
      then we bail out and keep whatever it proposed
    - every tool exception is caught and returned to the model as text, so a
      malformed SMILES produces a retry instead of a crash
    - run_log.json is rewritten after EVERY tool call, so the UI just polls
      one file and never needs to talk to this process
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import admet
import chembl
import llm
import pipeline_adapter as pipe
import pocket
import poses

HERE = Path(__file__).resolve().parent
RUN_LOG = HERE / "run_log.json"

MODEL = os.environ.get("DESIGNER_MODEL", "claude-sonnet-5-5")
MAX_TOOL_CALLS = int(os.environ.get("MAX_TOOL_CALLS", "24"))
MAX_DOCKS_PER_ROUND = int(os.environ.get("MAX_DOCKS", "4"))

SYSTEM_TEMPLATE = """\
You are a medicinal chemistry design agent working on small-molecule binders \
of %(target)s.%(about)s

Your job each round: propose a small set of candidate molecules, dock them, \
and submit the best ones.

THE DESIGN STRATEGY
Start from a small known binder and grow it into the parts of the cavity it \
does not yet occupy, so that shape complementarity improves rather than the \
molecule simply getting heavier. binding_site_gaps tells you where those \
regions are, how large they are and which residues line them; design into \
them specifically, and say which gap each change is aimed at.

HOW TO WORK
1. Call seed_scaffolds first to see the reference ligand and anything already
   docked against this target, with its score.
2. Call binding_site_gaps on the best-docking seed. Read the volume, the
   lining residues and the suggested chemistry for each unoccupied region.
3. Call known_binders once to see what has already been made against this
   protein and how potent it was. Use it as structural inspiration; never
   resubmit a published molecule as your own candidate.
4. Design NEW molecules by growing those scaffolds into the gaps. Do not
   resubmit a seed unchanged. Match the chemistry to the lining: lipophilic
   groups into hydrophobic regions, hydrogen-bonding groups towards polar
   residues.
5. Use properties() or property_screen() to screen cheaply before spending a
   docking run, and find_analogues() if you want to know whether a scaffold
   is already known.
6. Dock your best candidates. You have at most %(max_docks)d docking runs this
   round, so choose deliberately rather than docking everything.
7. Call submit() with your final candidates once you have docking scores. You
   MUST call submit to finish. A round with no submit is a failed round.

A good candidate: binding affinity better (more negative) than %(target_aff).1f \
kcal/mol, MW under 600, cLogP under 5.5.

RESPONDING TO CRITIC FEEDBACK — THIS IS THE MOST IMPORTANT RULE
If the prompt contains feedback from the synthesisability or process critics, \
earlier candidates were rejected as unmakeable. You must:
  - read each rejection's `criterion` and `suggest` field
  - pass every rejected criterion into the `avoid` argument of
    propose_candidates, naming it explicitly
  - make a STRUCTURAL change that fixes that specific criterion, not a
    cosmetic one. If you were told you have too many stereocentres, remove
    stereocentres. If you were told a spirocycle is impractical, remove the
    spirocycle.
  - state in `changes_made` what you changed and which rejection it addresses

Do not argue with the critics and do not re-propose a rejected molecule with a \
trivial change. A molecule that cannot be manufactured is worth nothing, no \
matter how well it docks.

Be concise. Prefer acting over explaining.
"""


def system_prompt() -> str:
    """Built per run, so the agent knows which protein it is designing for."""
    t = pipe.TARGET()
    desc = (t.get("description") or "").strip()
    return SYSTEM_TEMPLATE % {
        "target": t.get("name", "the target protein"),
        "about": f" {desc}" if desc else "",
        "max_docks": MAX_DOCKS_PER_ROUND,
        "target_aff": float(os.environ.get("AFFINITY_TARGET", "-9.0")),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOL SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────
TOOLS = [
    {
        "name": "seed_scaffolds",
        "description": "Look up the reference ligand and any molecules "
                       "already docked against this target, best affinity "
                       "first. Use these as starting points.",
        "input_schema": {
            "type": "object",
            "properties": {"n": {"type": "integer",
                                 "description": "how many to return (1-5)"}},
            "required": [],
        },
    },
    {
        "name": "binding_site_gaps",
        "description": "The unoccupied regions of the binding cavity next to "
                       "a docked pose: volume in Å³, distance from the "
                       "ligand, the residues lining each one and what kind "
                       "of group would fill it. Use this to decide WHERE to "
                       "grow a scaffold. The molecule must have been docked "
                       "already.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles": {"type": "string",
                           "description": "a molecule that has been docked, "
                                          "usually the best seed"},
            },
            "required": ["smiles"],
        },
    },
    {
        "name": "known_binders",
        "description": "Published binders of this target from ChEMBL, most "
                       "potent first, with measured IC50/Ki and the ChEMBL "
                       "id. Structural inspiration — what has been made and "
                       "measured against this protein.",
        "input_schema": {
            "type": "object",
            "properties": {"n": {"type": "integer",
                                 "description": "how many to return (1-8)"}},
            "required": [],
        },
    },
    {
        "name": "find_analogues",
        "description": "ChEMBL molecules similar to a SMILES you give, with "
                       "their Tanimoto similarity. Tells you whether a "
                       "scaffold is already known and, if so, what was done "
                       "with it.",
        "input_schema": {
            "type": "object",
            "properties": {"smiles": {"type": "string"}},
            "required": ["smiles"],
        },
    },
    {
        "name": "property_screen",
        "description": "Lipinski, Veber, Ghose and Egan rule sets, QED, and "
                       "PAINS/Brenk structural alerts, each named. Rules "
                       "over descriptors, not a trained ADMET model.",
        "input_schema": {
            "type": "object",
            "properties": {"smiles": {"type": "string"}},
            "required": ["smiles"],
        },
    },
    {
        "name": "properties",
        "description": "RDKit descriptors (MW, cLogP, HBD, HBA, TPSA, "
                       "rotatable bonds) plus ADMET flags. Cheap, no docking. "
                       "Use to screen before docking.",
        "input_schema": {
            "type": "object",
            "properties": {"smiles": {"type": "string"}},
            "required": ["smiles"],
        },
    },
    {
        "name": "dock",
        "description": "Dock a molecule into the target binding site with "
                       "AutoDock Vina. Returns binding affinity in kcal/mol "
                       "(more negative is better). Expensive: budgeted.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles": {"type": "string"},
                "name": {"type": "string",
                         "description": "short label for the pose file"},
            },
            "required": ["smiles"],
        },
    },
    {
        "name": "propose_candidates",
        "description": "Register candidate molecules for this round. Validates "
                       "each SMILES and returns which parsed. Call this before "
                       "docking.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "smiles": {"type": "string"},
                            "rationale": {
                                "type": "string",
                                "description": "one line: what you changed and why",
                            },
                        },
                        "required": ["smiles", "rationale"],
                    },
                },
                "avoid": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Critic criteria you are deliberately "
                                   "avoiding this round, e.g. "
                                   "['stereocentres', 'spiro_atoms']. "
                                   "REQUIRED when responding to feedback.",
                },
            },
            "required": ["candidates"],
        },
    },
    {
        "name": "submit",
        "description": "Finish the round. Submit your final candidates with "
                       "their docking scores.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "smiles": {"type": "string"},
                            "affinity": {"type": "number"},
                            "rationale": {"type": "string"},
                        },
                        "required": ["smiles", "rationale"],
                    },
                },
                "changes_made": {
                    "type": "string",
                    "description": "What you changed versus the previous round "
                                   "and which critic rejection it addresses. "
                                   "Write 'first round' if there was no feedback.",
                },
            },
            "required": ["candidates", "changes_made"],
        },
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# RUN LOG — the UI's only interface. Rewritten after every tool call.
# ─────────────────────────────────────────────────────────────────────────────
class RunLog:
    def __init__(self, path: Path = RUN_LOG):
        self.path = path
        self.data = {
            "status": "starting",
            "started_at": time.time(),
            "rounds": [],
            "dock_mode": pipe.DOCK_MODE,
            "model": llm.backend_name(),
            "target": pipe.TARGET().get("name", ""),
            "reference": dict(pipe.REFERENCE_LIGAND),
        }
        self.flush()

    def start_round(self, n: int, feedback: list | None) -> None:
        self.data["rounds"].append({
            "round": n,
            "feedback_in": feedback or [],
            "trace": [],
            "candidates": [],
            "changes_made": None,
            "status": "running",
        })
        self.data["status"] = f"round {n} designing"
        self.flush()

    def record(self, tool: str, args: dict, result) -> None:
        if not self.data["rounds"]:
            return
        self.data["rounds"][-1]["trace"].append({
            "t": round(time.time() - self.data["started_at"], 1),
            "tool": tool,
            "args": args,
            "result": result,
        })
        self.flush()

    def finish_round(self, candidates: list, changes: str, reason: str) -> None:
        r = self.data["rounds"][-1]
        r["candidates"] = candidates
        r["changes_made"] = changes
        r["status"] = reason
        self.flush()

    def set(self, **kw) -> None:
        self.data.update(kw)
        self.flush()

    def flush(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2, default=str))
        tmp.replace(self.path)


# ─────────────────────────────────────────────────────────────────────────────
# TOOL DISPATCH
# ─────────────────────────────────────────────────────────────────────────────
class ToolBox:
    """Executes tools and enforces the docking budget."""

    def __init__(self, max_docks: int = MAX_DOCKS_PER_ROUND,
                 offline: bool = False):
        self.max_docks = max_docks
        self.docks_used = 0
        self.proposed: list[dict] = []
        self.dock_results: dict[str, float] = {}
        self.avoided: list[str] = []
        # Void detection takes a couple of seconds per pose, and the agent
        # tends to ask about the same seed twice.
        self.void_cache: dict[str, dict] = {}
        self.gap_nudged = False
        # In offline mode the ChEMBL tools answer from the committed cache
        # and say so, rather than reporting a network failure as "nothing
        # found" — which an agent would read as "this scaffold is novel".
        self.offline = offline

    def run(self, name: str, args: dict):
        try:
            return getattr(self, f"_{name}")(args)
        except AttributeError:
            return {"error": f"unknown tool '{name}'"}
        except Exception as e:
            # Never crash the loop on a bad candidate.
            return {"error": f"{type(e).__name__}: {e}"}

    def _seed_scaffolds(self, args):
        """
        The seeds, and — for the best of them — the cavity space it leaves
        empty.

        The gap analysis is returned here rather than waiting to be asked
        for, because the design strategy depends on it: a model that has
        already seen where the room is designs into it, while one that has
        to remember to ask often does not. It costs about two seconds, once
        a round.
        """
        n = min(max(int(args.get("n", 3)), 1), 5)
        scaffolds = pipe.seed_scaffolds(n)
        payload = {"scaffolds": scaffolds, "reference": pipe.REFERENCE_LIGAND}

        for seed in scaffolds:
            gaps = self._binding_site_gaps({"smiles": seed["smiles"]})
            if "error" not in gaps:
                payload["unoccupied_space_beside_the_best_seed"] = {
                    "smiles": seed["smiles"],
                    "regions": gaps["unoccupied_regions"],
                    "summary": gaps["summary"],
                    "caveat": gaps["caveat"],
                }
                payload["design_instruction"] = (
                    "Grow this seed into the regions above, matching the "
                    "chemistry to each lining, and say in each candidate's "
                    "rationale which region it fills. Ask for "
                    "binding_site_gaps on another docked molecule if you "
                    "want to compare.")
                break
        return payload

    def _properties(self, args):
        return pipe.properties(args["smiles"])

    def _property_screen(self, args):
        result = admet.screen(args["smiles"])
        if not result.get("ok"):
            return result
        return {
            "verdict": result["verdict"],
            "descriptors": result["descriptors"],
            "rule_sets": [{"name": s["name"], "pass": s["pass"],
                           "violations": [c["requirement"] for c in s["checks"]
                                          if not c["pass"]]}
                          for s in result["rule_sets"]],
            "alerts": [f"{a['family']}: {a['name']}" for a in result["alerts"]],
            "qed": result["qed"],
            "disclaimer": result["disclaimer"],
        }

    def _binding_site_gaps(self, args):
        smiles = (args.get("smiles") or "").strip()
        if smiles in self.void_cache:
            return self.void_cache[smiles]
        pose = poses.pose_for(smiles)
        if not pose.get("ok"):
            return {"error": f"{pose.get('error')} — dock it first, then ask "
                             f"where the gaps are"}
        t = pipe.TARGET()
        result = pocket.find_voids(t["receptor"], pose["pdb"], dict(t["grid"]))
        payload = {
            "smiles": smiles,
            "affinity_of_this_pose": pose.get("affinity"),
            "unoccupied_regions": result.get("voids", []),
            "total_unoccupied_volume_a3": result.get("unoccupied_volume_a3"),
            "summary": pocket.summarise_for_agent(result),
            "method": result.get("method"),
            "caveat": result.get("caveat"),
        }
        self.void_cache[smiles] = payload
        return payload

    def _known_binders(self, args):
        n = min(max(int(args.get("n", 6)), 1), 8)
        target_name = pipe.TARGET().get("name", "")
        chembl_id = (pipe.TARGET().get("chembl_target_id")
                     or chembl.resolve_target_id(target_name,
                                                 offline=self.offline))
        if not chembl_id:
            return {"error": f"no ChEMBL target found for '{target_name}' — "
                             f"design from the seeds and the cavity instead"}
        result = chembl.known_actives(chembl_id, limit=n, offline=self.offline)
        if result.get("ok"):
            result["summary"] = chembl.summarise_actives(result)
        return result

    def _find_analogues(self, args):
        return chembl.analogues((args.get("smiles") or "").strip(),
                                offline=self.offline)

    def _dock(self, args):
        if self.docks_used >= self.max_docks:
            return {"error": f"docking budget exhausted "
                             f"({self.max_docks} runs used). Submit what you have."}
        self.docks_used += 1
        res = pipe.dock(args["smiles"], args.get("name") or f"cand{self.docks_used}")
        if res.get("affinity") is not None:
            self.dock_results[args["smiles"]] = res["affinity"]
        res["docks_remaining"] = self.max_docks - self.docks_used
        return res

    def _propose_candidates(self, args):
        # The strategy is to grow into the empty parts of the cavity, so the
        # agent is asked once to look at them before it draws anything. One
        # nudge, not a hard block: if the pose analysis is unavailable the
        # round must still be able to finish.
        if not self.void_cache and not self.gap_nudged:
            self.gap_nudged = True
            return {
                "error": "call binding_site_gaps on the seed you are growing "
                         "before proposing candidates, so the changes are "
                         "aimed at the unoccupied regions of the cavity "
                         "rather than added anywhere",
                "then": "re-propose with each candidate's rationale naming "
                        "the gap it fills",
            }

        avoid = args.get("avoid") or []
        self.avoided = list(dict.fromkeys(self.avoided + avoid))
        out = []
        for c in args.get("candidates", []):
            smi = (c.get("smiles") or "").strip()
            chk = pipe.check_smiles(smi)
            rec = {"smiles": smi, "rationale": c.get("rationale", ""),
                   "valid": chk["valid"]}
            if chk["valid"]:
                p = pipe.properties(smi)
                rec["properties"] = {k: p[k] for k in
                                     ("MW", "cLogP", "HBD", "HBA", "TPSA", "RotBonds")
                                     if k in p}
                rec["admet_flags"] = p.get("admet_flags", [])
                self.proposed.append(rec)
            else:
                rec["error"] = "SMILES did not parse — fix and re-propose"
            out.append(rec)
        return {"registered": out, "avoiding": self.avoided,
                "valid_count": sum(1 for r in out if r["valid"])}

    def _submit(self, args):
        cands = []
        for c in args.get("candidates", []):
            smi = (c.get("smiles") or "").strip()
            cands.append({
                "smiles": smi,
                "rationale": c.get("rationale", ""),
                # trust our own dock record over whatever the model typed
                "affinity": self.dock_results.get(smi, c.get("affinity")),
            })
        return {"submitted": cands, "changes_made": args.get("changes_made", "")}


# ─────────────────────────────────────────────────────────────────────────────
# THE AGENT LOOP
# ─────────────────────────────────────────────────────────────────────────────
def format_feedback(rejected: list[dict]) -> str:
    """Turn critic output into the designer's next prompt. The feedback edge."""
    if not rejected:
        return ""
    lines = ["CRITIC FEEDBACK — the following candidates were REJECTED as "
             "unmanufacturable. Fix the named criteria.\n"]
    for item in rejected:
        lines.append(f"REJECTED: {item['smiles']}")
        lines.append(f"  verdict: {item['verdict']}  "
                     f"(SA {item.get('sa_score')}, "
                     f"~{item.get('estimated_steps')} steps, "
                     f"{item.get('route_complexity')})")
        for r in item.get("rejections", [])[:4]:
            lines.append(f"  - [{r['level']}] {r['criterion']}: {r['reason']}")
            lines.append(f"      FIX: {r['suggest']}")
        lines.append("")
    crits = sorted({r["criterion"]
                    for item in rejected for r in item.get("rejections", [])})
    lines.append(f"Pass these into `avoid`: {crits}")
    lines.append("Make a structural change that fixes each one. State it in "
                 "`changes_made`.")
    return "\n".join(lines)


def design_round(
    round_num: int = 1,
    feedback: list[dict] | None = None,
    log: RunLog | None = None,
    n_candidates: int = 3,
) -> dict:
    """
    Run one round of the designer agent.

    Returns {candidates, changes_made, trace, stop_reason, docks_used}
    """
    log = log or RunLog()
    log.start_round(round_num, feedback)

    # mock mode and cache-only docking are the offline configurations: in
    # both, the network tools must answer from the committed cache.
    box = ToolBox(offline=(llm.BACKEND == "mock"
                           or os.environ.get("OFFLINE") == "1"))

    task = (
        f"Round {round_num}. Design {n_candidates} candidate "
        f"{pipe.TARGET().get('name', 'target')} binders, "
        f"dock them, and submit. You have {MAX_DOCKS_PER_ROUND} docking runs."
    )
    fb = format_feedback(feedback or [])
    if fb:
        task = fb + "\n\n" + task

    messages = [{"role": "user", "content": task}]
    calls = 0
    nudged = False
    stop_reason = "submitted"
    submitted: dict | None = None

    while calls < MAX_TOOL_CALLS:
        try:
            resp = llm.complete(system_prompt(), messages, TOOLS, model=MODEL)
        except Exception as e:
            stop_reason = f"api_error: {type(e).__name__}: {e}"
            break

        tool_uses = resp["tool_calls"]

        # Echo the assistant turn back verbatim so the API sees valid history.
        assistant_blocks = resp.get("raw_content") or (
            ([{"type": "text", "text": resp["text"]}] if resp["text"] else [])
            + [{"type": "tool_use", "id": t["id"], "name": t["name"],
                "input": t["input"]} for t in tool_uses]
        )
        if assistant_blocks:
            messages.append({"role": "assistant", "content": assistant_blocks})

        if not tool_uses:
            # Model stopped without submitting. One nudge, then give up.
            if nudged:
                stop_reason = "stalled_without_submit"
                break
            nudged = True
            messages.append({
                "role": "user",
                "content": "You have not called submit(). Call submit now with "
                           "the candidates you have, including `changes_made`.",
            })
            continue

        results = []
        for tu in tool_uses:
            calls += 1
            name, args = tu["name"], tu["input"] or {}
            out = box.run(name, args)
            log.record(name, args, out)
            results.append({
                "type": "tool_result",
                "tool_use_id": tu["id"],
                "content": json.dumps(out, default=str)[:6000],
            })
            if name == "submit" and "error" not in out:
                submitted = out

        messages.append({"role": "user", "content": results})

        if submitted:
            break

        if calls >= MAX_TOOL_CALLS:
            stop_reason = "tool_budget_exhausted"
            break

    # Fall back to whatever was proposed if submit never happened.
    if submitted:
        candidates = submitted["submitted"]
        changes = submitted.get("changes_made", "")
    else:
        candidates = [{
            "smiles": p["smiles"],
            "rationale": p.get("rationale", ""),
            "affinity": box.dock_results.get(p["smiles"]),
        } for p in box.proposed]
        changes = f"(no submit — recovered {len(candidates)} proposed candidates)"
        if stop_reason == "submitted":
            stop_reason = "recovered_without_submit"

    log.finish_round(candidates, changes, stop_reason)
    return {
        "round": round_num,
        "candidates": candidates,
        "changes_made": changes,
        "avoided": box.avoided,
        "stop_reason": stop_reason,
        "tool_calls": calls,
        "docks_used": box.docks_used,
    }


if __name__ == "__main__":
    pipe.seed_cache_from_runs_db()
    out = design_round(1)
    print(json.dumps(out, indent=2, default=str))
