"""
doctor.py — check this machine can run the loop, and say exactly how to fix
whatever is missing.

    python3 doctor.py

Run this first on any new machine. It never changes anything; it only looks
and reports. Each failure comes with the command that fixes it, because
"missing dependency" without the fix is just a different kind of stuck.

Exit code 0 if you can run the full demo, 1 if something essential is
missing.
"""
from __future__ import annotations

import importlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

G, Y, R, D, B, X = (
    "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[1m", "\033[0m")
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    G = Y = R = D = B = X = ""

OK, WARN, FAIL = f"{G}OK  {X}", f"{Y}WARN{X}", f"{R}FAIL{X}"

results: list[tuple[str, str, str]] = []


def check(name: str, status: str, detail: str = "", fix: str = "") -> None:
    results.append((status, name, detail))
    print(f"  [{status}] {B}{name}{X}" + (f"  {D}{detail}{X}" if detail else ""))
    if fix and status != OK:
        for line in fix.strip().splitlines():
            print(f"         {G}{line}{X}")


def main() -> int:
    print(f"{B}Closed-loop design — setup check{X}\n")

    # ── Python ───────────────────────────────────────────────────────────
    v = sys.version_info
    check("Python >= 3.10",
          OK if v >= (3, 10) else FAIL,
          f"found {v.major}.{v.minor}.{v.micro}",
          "Install Python 3.10 or newer: https://www.python.org/downloads/")

    # ── Python packages ──────────────────────────────────────────────────
    for mod, why, fix in [
        ("rdkit", "molecule handling, descriptors, structure drawing",
         "pip install rdkit\n  (or: conda install -c conda-forge rdkit)"),
        ("httpx", "talking to the Claude API",
         "pip install httpx"),
    ]:
        try:
            m = importlib.import_module(mod)
            ver = getattr(m, "__version__", "")
            check(f"python package: {mod}", OK, f"{ver}  {why}")
        except Exception:
            check(f"python package: {mod}", FAIL, why,
                  f"pip install -r requirements.txt\n  or: {fix}")

    # ── External programs ────────────────────────────────────────────────
    for exe, env, why, fix in [
        ("obabel", "OBABEL_PATH", "SMILES -> 3D structure",
         "conda install -c conda-forge openbabel\n"
         "  or: brew install open-babel"),
        ("vina", "VINA_PATH", "the docking engine",
         "brew install autodock-vina\n"
         "  or download: https://github.com/ccsb-scripps/AutoDock-Vina/releases\n"
         "  then: export VINA_PATH=/full/path/to/vina"),
    ]:
        custom = os.environ.get(env)
        path = custom if custom and Path(custom).exists() else shutil.which(exe)
        if path:
            ver = ""
            try:
                out = subprocess.run([path, "--help"], capture_output=True,
                                     text=True, timeout=20)
                first = (out.stdout or out.stderr).strip().splitlines()
                ver = first[0][:46] if first else ""
            except Exception:
                pass
            check(f"program: {exe}", OK, f"{path}  {ver}")
        else:
            check(f"program: {exe}", FAIL, why, fix)

    # ── Chemistry source ─────────────────────────────────────────────────
    sys.path.insert(0, str(HERE))
    try:
        import pipeline_adapter as pipe
        src = (f"docking_pipeline.py at {pipe.PROJECT}"
               if pipe.USING_FULL_PIPELINE else "vendored chemistry.py")
        check("chemistry functions", OK, src)
    except Exception as e:
        check("chemistry functions", FAIL, f"{type(e).__name__}: {e}",
              "Something is wrong with the install — "
              "fix the failures above first.")
        pipe = None

    # ── Target ───────────────────────────────────────────────────────────
    if pipe:
        try:
            t = pipe.TARGET()
            rec = pipe._receptor()
            if rec.exists():
                size = rec.stat().st_size // 1024
                check(f"target: {t['name']}", OK,
                      f"{t.get('grid_source')}  receptor {size} KB")
            else:
                check(f"target: {t['name']}", FAIL, f"receptor missing: {rec}",
                      "Open the page and press '+ New target' to set one up,\n"
                      "or: python3 target.py seed   (rebuilds MRP1)")
            n = len(pipe._load_cache())
            check("cached docking results", OK if n else WARN,
                  f"{n} poses — the offline demo needs these",
                  "Run once with docking enabled to populate the cache:\n"
                  "  python3 orchestrator.py --warm-start")
        except Exception as e:
            check("target", FAIL, f"{type(e).__name__}: {e}")

    # ── API key ──────────────────────────────────────────────────────────
    try:
        import llm
        if os.environ.get("ANTHROPIC_API_KEY"):
            check("Claude API key", OK, "set (the designer can run for real)")
        else:
            check("Claude API key", WARN,
                  "not set — you can still run with --mock",
                  "cp .env.example .env   then put your key in it\n"
                  "or: export ANTHROPIC_API_KEY=sk-ant-...")
    except Exception as e:
        check("llm module", FAIL, f"{type(e).__name__}: {e}")

    # ── Verdict ──────────────────────────────────────────────────────────
    fails = [r for r in results if r[0] == FAIL]
    warns = [r for r in results if r[0] == WARN]
    print()
    if fails:
        print(f"{R}{B}{len(fails)} problem(s) to fix:{X}")
        for _, name, _ in fails:
            print(f"  - {name}")
        print(f"\n{D}Fix the green commands above, then run this again.{X}")

        # Missing docking tools is not the end of the road: the repo ships
        # cached poses, so the offline demo still runs. Say so, rather than
        # leaving someone thinking they are blocked.
        blocked = {n for _, n, _ in fails}
        tools_only = blocked <= {"program: obabel", "program: vina"}
        try:
            cached = pipe and len(pipe._load_cache()) > 0
        except Exception:
            cached = False
        if tools_only and cached:
            print(f"\n{G}{B}You can still run the offline demo right now.{X}")
            print(f"  {D}Cached docking results are committed to this "
                  f"repo, so no docking is needed:{X}\n")
            print(f"    {B}python3 serve.py{X}   "
                  f"{D}then pick 'mock' mode and press Run loop{X}")
            print(f"  {D}or: python3 orchestrator.py "
                  f"--warm-start --cache-only --mock{X}")
        return 1

    print(f"{G}{B}Ready.{X}  Start it with:\n")
    print(f"    {B}python3 serve.py{X}")
    print(f"\n  then open {B}http://localhost:8000{X} and press Run loop.")
    if warns:
        print(f"\n{Y}{len(warns)} warning(s) — not blocking, see above.{X}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
