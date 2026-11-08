"""
llm.py — minimal tool-calling client, two backends.

Why not the anthropic SDK: the SDK install in this anaconda environment raises
APIConnectionError while raw HTTPS to the same endpoint works. Rather than
debug someone else's dependency tree at a hackathon, this talks to the
Messages API directly over httpx. One file, no version risk.

Backends (LLM_BACKEND env var):
    api   - real Claude call. Needs ANTHROPIC_API_KEY. DEFAULT.
    mock  - deterministic scripted designer. No key, no network.

The mock backend exists for three reasons, all of them real:
    1. your CS teammate can build the UI before the API is wired up
    2. the loop is testable in CI with no key
    3. it is the demo fallback if venue wifi dies

Both backends return the same shape:
    {"text": str, "tool_calls": [{"id","name","input"}], "stop_reason": str}
"""
from __future__ import annotations

import json
import os
import uuid

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv() -> None:
    """
    Read loop/.env if it exists, so a key can live in a file instead of the
    shell. The real environment always wins, so `export ANTHROPIC_API_KEY=...`
    still overrides the file. Never commit .env — it is in .gitignore.
    """
    path = os.path.join(HERE, ".env")
    if not os.path.exists(path):
        return
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                os.environ.setdefault(k, v)   # shell wins over the file
    except Exception:
        pass


_load_dotenv()

MODEL = os.environ.get("DESIGNER_MODEL", "claude-sonnet-5-5")
BACKEND = os.environ.get("LLM_BACKEND", "api").lower()
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "120"))


class LLMError(RuntimeError):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# REAL BACKEND
# ─────────────────────────────────────────────────────────────────────────────
def _call_api(system: str, messages: list, tools: list,
              model: str = "", max_tokens: int = 4096) -> dict:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise LLMError("ANTHROPIC_API_KEY is not set "
                       "(use LLM_BACKEND=mock to run without it)")

    payload = {
        "model": model or MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "tools": tools,
        "messages": messages,
    }
    try:
        r = httpx.post(
            f"{BASE_URL}/v1/messages",
            timeout=TIMEOUT,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
    except Exception as e:
        raise LLMError(f"network: {type(e).__name__}: {e}") from e

    if r.status_code != 200:
        raise LLMError(f"HTTP {r.status_code}: {r.text[:400]}")

    body = r.json()
    text = "".join(b.get("text", "") for b in body.get("content", [])
                   if b.get("type") == "text")
    tool_calls = [
        {"id": b["id"], "name": b["name"], "input": b.get("input") or {}}
        for b in body.get("content", []) if b.get("type") == "tool_use"
    ]
    return {
        "text": text,
        "tool_calls": tool_calls,
        "stop_reason": body.get("stop_reason", ""),
        "raw_content": body.get("content", []),
        "usage": body.get("usage", {}),
    }


# ─────────────────────────────────────────────────────────────────────────────
# MOCK BACKEND — a scripted designer that responds to feedback
# ─────────────────────────────────────────────────────────────────────────────
# Round 1 candidates are deliberately mixed: one clean, two that the critics
# will reject. A mock whose first round passes everything kills the narrative,
# and it is also untrue to what a real generator produces.
_MOCK_ROUND_1 = [
    # clean, drug-like
    ("CC(C)(C)c1ccc(cc1)C(=O)Nc1ccc(cc1)S(=O)(=O)Nc1ccncc1",
     "biaryl sulfonamide on the MK-571 pharmacophore, achiral"),
    # too many stereocentres -> synthesisability critic fails it
    ("C[C@H]1CC[C@@H]([C@H](C)[C@@H]1NC(=O)c1ccc(cc1)C(F)(F)F)[C@@H]1CC[C@H](O)CC1",
     "decalin-like core with extended H-bond network"),
    # spirocycle + macrocycle -> process critic fails it
    ("O=C1NCCOCCOCCOCCNC(=O)C2(CC2)c2ccc(cc2)C1",
     "macrocyclic spiro scaffold to preorganise the binding conformation"),
]

# Round 2: the mock reads `avoid` and removes exactly the rejected features.
_MOCK_ROUND_2 = [
    ("CC(C)(C)c1ccc(cc1)C(=O)Nc1ccc(cc1)S(=O)(=O)Nc1ccncc1",
     "kept: achiral biaryl sulfonamide, passed both critics"),
    ("COc1ccc(cc1)C(=O)Nc1ccc(cc1)S(=O)(=O)N1CCOCC1",
     "replaced the decalin stereocentres with a flat anisole; morpholine "
     "in place of the chiral cyclohexanol (addresses: stereocentres)"),
    ("O=C(Nc1ccc(cc1)S(=O)(=O)N1CCNCC1)c1ccc(cc1)C(F)(F)F",
     "opened the macrocycle to a linear biaryl and removed the spiro centre "
     "(addresses: macrocycle_size, spiro_atoms)"),
]


def _mock_designer(messages: list) -> dict:
    """
    Walks a fixed script. Reads conversation state to decide where it is:
      no tool results yet            -> seed_scaffolds
      seeds seen, nothing proposed   -> propose_candidates
      proposed, not all docked       -> dock the next one
      all docked                     -> submit
    """
    text_blob = json.dumps(messages, default=str)
    has_feedback = "CRITIC FEEDBACK" in text_blob
    batch = _MOCK_ROUND_2 if has_feedback else _MOCK_ROUND_1

    # Work out how far through the script we are by counting the tool calls
    # already recorded on the assistant turns.
    called: list[str] = []
    for m in messages:
        content = m.get("content")
        if m.get("role") == "assistant" and isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    called.append(b["name"])

    def call(name, inp):
        return {"text": "", "stop_reason": "tool_use", "raw_content": [],
                "tool_calls": [{"id": f"mock_{uuid.uuid4().hex[:8]}",
                                "name": name, "input": inp}]}

    if "seed_scaffolds" not in called:
        return call("seed_scaffolds", {"n": 3})

    if "propose_candidates" not in called:
        avoid = []
        if has_feedback:
            for crit in ("stereocentres", "spiro_atoms", "macrocycle_size",
                         "sa_score", "fused_ring_systems", "heavy_atoms",
                         "rotatable_bonds", "estimated_steps"):
                if f"{crit}:" in text_blob or f"'{crit}'" in text_blob:
                    avoid.append(crit)
        return call("propose_candidates", {
            "candidates": [{"smiles": s, "rationale": r} for s, r in batch],
            "avoid": avoid,
        })

    n_docked = called.count("dock")
    if n_docked < len(batch):
        smi = batch[n_docked][0]
        return call("dock", {"smiles": smi, "name": f"mock_r_{n_docked + 1}"})

    changes = ("first round — no feedback yet" if not has_feedback else
               "removed all stereocentres (chiral decalin -> flat anisole), "
               "opened the macrocycle to a linear biaryl, and deleted the "
               "spiro centre. Addresses: stereocentres, macrocycle_size, "
               "spiro_atoms.")
    return call("submit", {
        "candidates": [{"smiles": s, "rationale": r} for s, r in batch],
        "changes_made": changes,
    })


# ─────────────────────────────────────────────────────────────────────────────
def complete(system: str, messages: list, tools: list,
             model: str = "", max_tokens: int = 4096) -> dict:
    if BACKEND == "mock":
        return _mock_designer(messages)
    return _call_api(system, messages, tools, model, max_tokens)


def backend_name() -> str:
    return "mock (scripted)" if BACKEND == "mock" else f"api:{MODEL}"


def key_status() -> str:
    """Is a key set, where did it come from, and does it actually work?"""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return ("NO KEY. Either `export ANTHROPIC_API_KEY=sk-ant-...` in the "
                "shell before starting serve.py, or put it in loop/.env")
    src = ("loop/.env" if os.path.exists(os.path.join(HERE, ".env"))
           and key == _file_key() else "shell environment")
    # never print the key itself, only enough to tell two keys apart
    tail = key[-4:] if len(key) > 8 else "????"
    try:
        _call_api("Reply with one word.",
                  [{"role": "user", "content": "Say ok"}], [], max_tokens=8)
        return f"key ...{tail} from {src} — WORKS"
    except LLMError as e:
        return f"key ...{tail} from {src} — FAILED: {e}"


def _file_key() -> str | None:
    path = os.path.join(HERE, ".env")
    try:
        for line in open(path):
            if line.strip().startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


if __name__ == "__main__":
    print("backend:", backend_name())
    print(key_status() if BACKEND != "mock" else "mock backend — no key needed")
