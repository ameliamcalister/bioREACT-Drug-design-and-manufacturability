"""
Agentified designer: the generative half of the closed loop.

The agent is deliberately narrow. It decides which candidates to propose,
which to spend docking budget on, and when to stop -- nothing else. All
chemistry lives in pipeline_adapter.py. This narrowness is the point: an
agent that calls your pipeline competently and terminates is a working demo;
one that reasons beautifully and never stops is a dead demo.

It also ingests structured rejections from the critics and must visibly change
its proposals in response. That feedback edge is the pitch.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Callable

try:
    import anthropic
except ImportError:
    sys.exit("pip install anthropic")

import pipeline_adapter as pipeline

MODEL = os.environ.get("DESIGNER_MODEL", "claude-sonnet-5-5")
MAX_TOOL_CALLS = int(os.environ.get("DESIGNER_MAX_TOOL_CALLS", "20"))

SYSTEM = """You are the designer agent in a closed-loop drug-design system.

Your job: propose small-molecule candidates for the stated target, dock them, \
and submit a short ranked shortlist. A separate synthesisability critic and a \
process-chemistry critic will judge whether your molecules can actually be \
manufactured, and their rejections come back to you.

Operating rules:
- Work in small batches. Propose a handful, dock them, then decide.
- Docking is the expensive step. Do not dock a molecule you would not submit.
- Call submit as soon as you have 3 defensible candidates. Do not keep \
optimising for its own sake; you have a hard tool-call budget.
- When you receive critic feedback, you MUST change your proposals in \
response to the specific reason given. Pass the rejected features to \
propose_candidates via `avoid`, and say in your rationale what you changed \
and why. Re-submitting a molecule with the same rejected motif is a failure.
- A lower (more negative) docking score is better. Do not chase score at the \
cost of manufacturability -- a -11 kcal/mol molecule nobody can make scores \
zero for this system.

Be terse. Your reasoning is logged and shown live to an audience."""

TOOLS: list[dict[str, Any]] = [
    {
        "name": "propose_candidates",
        "description": (
            "Generate candidate SMILES for the target. Use `avoid` to exclude "
            "structural features the critics have rejected."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "n": {"type": "integer", "description": "How many candidates (1-8)."},
                "avoid": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Structural features/motifs to steer clear of, in plain "
                        'language, e.g. ["boronic ester", "TMS-protected alkyne"].'
                    ),
                },
                "scaffold": {
                    "type": "string",
                    "description": "Optional core SMILES to stay on.",
                },
            },
            "required": ["n"],
        },
    },
    {
        "name": "dock",
        "description": "Dock one ligand against the prepared receptor. Expensive -- use deliberately.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles": {"type": "string"},
                "exhaustiveness": {
                    "type": "integer",
                    "description": "Search exhaustiveness, 8 is the default. Raise only to break a tie.",
                },
            },
            "required": ["smiles"],
        },
    },
    {
        "name": "properties",
        "description": "Cheap physchem descriptors for one SMILES. Free -- use freely before docking.",
        "input_schema": {
            "type": "object",
            "properties": {"smiles": {"type": "string"}},
            "required": ["smiles"],
        },
    },
    {
        "name": "submit",
        "description": "Submit the final ranked shortlist for this round. Ends the round.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "smiles": {"type": "string"},
                            "score": {"type": "number"},
                            "why": {"type": "string", "description": "One sentence."},
                        },
                        "required": ["smiles", "why"],
                    },
                },
                "changed_from_feedback": {
                    "type": "string",
                    "description": (
                        "What you changed in response to critic feedback, or "
                        '"first round" if there was none.'
                    ),
                },
            },
            "required": ["candidates", "changed_from_feedback"],
        },
    },
]


class DesignerAgent:
    """One agent, many rounds. Call run_round(), then feed critic verdicts
    back in via run_round(feedback=...)."""

    def __init__(self, target: str, log_path: str = "run_log.json"):
        self.target = target
        self.log_path = log_path
        self.client = anthropic.Anthropic()
        self.messages: list[dict[str, Any]] = []
        self.trace: list[dict[str, Any]] = []
        self.rounds: list[dict[str, Any]] = []
        self.round_no = 0
        self._t0 = time.time()

    # -- tool dispatch ----------------------------------------------------
    def _dispatch(self, name: str, args: dict[str, Any]) -> Any:
        if name == "propose_candidates":
            return pipeline.propose_candidates(
                self.target,
                n=min(int(args.get("n", 5)), 8),
                avoid=args.get("avoid"),
                scaffold=args.get("scaffold"),
            )
        if name == "dock":
            return pipeline.dock(
                args["smiles"], self.target, int(args.get("exhaustiveness", 8))
            )
        if name == "properties":
            return pipeline.properties(args["smiles"])
        raise ValueError(f"unknown tool {name}")

    def _log(self, kind: str, **payload: Any) -> None:
        self.trace.append(
            {
                "round": self.round_no,
                "t": round(time.time() - self._t0, 2),
                "kind": kind,
                **payload,
            }
        )
        # Flush after every step so a UI can poll this file live.
        with open(self.log_path, "w") as fh:
            json.dump(
                {"target": self.target, "rounds": self.rounds, "trace": self.trace},
                fh,
                indent=2,
            )

    # -- main loop --------------------------------------------------------
    def run_round(self, feedback: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Run one design round. Returns the submitted shortlist dict."""
        self.round_no += 1

        if feedback is None:
            prompt = (
                f"Target: {self.target}. Receptor prepared: "
                f"{pipeline.receptor_ready(self.target)}.\n"
                "Design a shortlist of candidates. First round -- no critic "
                "feedback yet."
            )
        else:
            prompt = (
                "Critic verdicts on your last shortlist:\n"
                + json.dumps(feedback, indent=2)
                + "\n\nRevise. Avoid the specific features that were rejected "
                "and state what you changed."
            )

        self.messages.append({"role": "user", "content": prompt})
        self._log("round_start", feedback=feedback)

        calls = 0
        while calls < MAX_TOOL_CALLS:
            resp = self.client.messages.create(
                model=MODEL,
                max_tokens=2048,
                system=SYSTEM,
                tools=TOOLS,
                messages=self.messages,
            )
            self.messages.append({"role": "assistant", "content": resp.content})

            for block in resp.content:
                if block.type == "text" and block.text.strip():
                    self._log("thought", text=block.text.strip())

            tool_uses = [b for b in resp.content if b.type == "tool_use"]
            if not tool_uses:
                # Model stopped without submitting -- nudge once, then bail.
                self.messages.append(
                    {
                        "role": "user",
                        "content": "Call submit now with your best candidates so far.",
                    }
                )
                calls += 1
                continue

            results = []
            submitted = None

            for tu in tool_uses:
                calls += 1
                if tu.name == "submit":
                    submitted = tu.input
                    results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": "Shortlist received. Round complete.",
                        }
                    )
                    continue
                try:
                    out = self._dispatch(tu.name, tu.input)
                    self._log("tool", tool=tu.name, input=tu.input, output=out)
                    results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": json.dumps(out),
                        }
                    )
                except Exception as exc:  # keep the demo alive
                    self._log("tool_error", tool=tu.name, input=tu.input, error=str(exc))
                    results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": f"ERROR: {exc}",
                            "is_error": True,
                        }
                    )

            self.messages.append({"role": "user", "content": results})

            if submitted is not None:
                record = {"round": self.round_no, "tool_calls": calls, **submitted}
                self.rounds.append(record)
                self._log("submitted", **submitted)
                return record

        # Budget exhausted without a submit.
        record = {
            "round": self.round_no,
            "tool_calls": calls,
            "candidates": [],
            "changed_from_feedback": "",
            "terminated": "tool-call budget exhausted",
        }
        self.rounds.append(record)
        self._log("budget_exhausted", tool_calls=calls)
        return record
