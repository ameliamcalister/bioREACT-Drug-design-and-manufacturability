"""
pipeline_adapter.py — the ONLY seam between the agent loop and your pipeline.

Everything above this file (designer_agent, critics, orchestrator) talks to
these four functions and nothing else. If your pipeline changes, you edit this
file and nothing else breaks.

Wraps the real functions in docking_pipeline.py:
    validate_smiles, calculate_properties, check_admet,
    smiles_to_pdbqt, run_vina

Docking modes, set by DOCK_MODE env var:
    cache   - lookup only, never shells out to Vina. Instant. Use for the live demo.
    live    - always run Vina. Truthful, slow.
    hybrid  - cache hit if we have one, else live Vina. DEFAULT.

Every live dock result is written back into the cache, so a rehearsal run
warms the cache for the real demo.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load_chemistry():
    """
    Prefer the full docking_pipeline.py if the user has it; otherwise use
    the vendored copy in chemistry.py so a fresh clone just works.

    Set DOCKING_PROJECT to point at a checkout of the full pipeline.
    """
    env = os.environ.get("DOCKING_PROJECT")
    roots = []
    if env:
        roots.append(Path(env).expanduser())
    roots += [HERE.parent, HERE.parent.parent,
              Path.home() / "Downloads" / "dockingapp2.0"]

    for root in roots:
        if (root / "docking_pipeline.py").is_file():
            sys.path.insert(0, str(root))
            try:
                import docking_pipeline as dp
                return dp, root
            except Exception:
                sys.path.pop(0)

    import chemistry as dp
    return dp, None


_chem, PROJECT = _load_chemistry()
USING_FULL_PIPELINE = PROJECT is not None

validate_smiles = _chem.validate_smiles
calculate_properties = _chem.calculate_properties
check_admet = _chem.check_admet
smiles_to_pdbqt = _chem.smiles_to_pdbqt
run_vina = _chem.run_vina

import target as tgt  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
#
# The receptor, grid and reference ligand all come from the active target
# (see target.py), so the loop works for any protein. If no target has been
# set up yet we fall back to the original MRP1 files, so nothing that worked
# before stops working.
# ─────────────────────────────────────────────────────────────────────────────
EXHAUSTIVENESS = int(os.environ.get("VINA_EXHAUSTIVENESS", "8"))
DOCK_MODE = os.environ.get("DOCK_MODE", "hybrid").lower()
RUNS_DB = (PROJECT / "data" / "runs.db") if PROJECT else None

_FALLBACK = {
    "name": "MRP1",
    "slug": "mrp1",
    "description": "ABCC1, a multidrug-resistance efflux transporter.",
    "receptor": str(HERE / "Receptor_MRP1.pdbqt"),
    "grid": {"center_x": 97.497, "center_y": 62.007, "center_z": 57.852,
             "size_x": 24.0, "size_y": 24.0, "size_z": 24.0},
    "grid_source": "docked MK-571 pose",
    "reference": {
        "name": "MK-571", "affinity": -9.1,
        "smiles": "CC(C)(C)c1ccc(cc1)/C=C/c1cc(ccn1)CSC(CC(=O)O)SCCc1ccccc1",
    },
    "cache": str(HERE / "dock_cache.json"),
    "poses": str(HERE / "poses"),
}


def TARGET() -> dict:
    """The active target, read fresh so a change in the UI takes effect."""
    return tgt.active_target() or _FALLBACK


def _cfg(key: str):
    return TARGET().get(key, _FALLBACK[key])


# Kept as module-level names because other modules and the README use them.
def _receptor() -> Path:
    return Path(os.environ.get("MRP1_RECEPTOR") or _cfg("receptor"))


def _cache_path() -> Path:
    return Path(_cfg("cache"))


class _Lazy:
    """Resolves against the active target at attribute-access time."""
    def __init__(self, fn):
        self._fn = fn

    def __getitem__(self, k):
        return self._fn()[k]

    def __iter__(self):
        return iter(self._fn())

    def keys(self):
        return self._fn().keys()

    def get(self, k, d=None):
        return self._fn().get(k, d)

    def __repr__(self):
        return repr(self._fn())


GRID = _Lazy(lambda: _cfg("grid"))
REFERENCE_LIGAND = _Lazy(lambda: _cfg("reference"))


# ─────────────────────────────────────────────────────────────────────────────
# CACHE
# ─────────────────────────────────────────────────────────────────────────────
def _load_cache() -> dict:
    cp = _cache_path()
    if cp.exists():
        try:
            return json.loads(cp.read_text())
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    cp = _cache_path()
    cp.parent.mkdir(parents=True, exist_ok=True)
    cp.write_text(json.dumps(cache, indent=2))


def seed_cache_from_runs_db() -> int:
    """
    Pull previously docked (smiles -> score) pairs out of data/runs.db.

    Those scores were produced against MRP1, so they are meaningless for any
    other protein. Only seed the MRP1 target — otherwise a new target would
    silently inherit another receptor's affinities.
    """
    if TARGET().get("slug") != "mrp1" or not RUNS_DB or not RUNS_DB.exists():
        return 0
    cache = _load_cache()
    added = 0
    try:
        conn = sqlite3.connect(str(RUNS_DB))
        rows = conn.execute(
            "SELECT smiles, score, pose_path FROM results "
            "WHERE smiles IS NOT NULL AND score IS NOT NULL"
        ).fetchall()
        conn.close()
    except Exception:
        return 0
    for smiles, score, pose in rows:
        key = (smiles or "").strip()
        if not key or key in cache:
            continue
        cache[key] = {
            "affinity": round(float(score), 2),
            "pose_path": pose,
            "source": "runs.db",
        }
        added += 1
    if added:
        _save_cache(cache)
    return added


# ─────────────────────────────────────────────────────────────────────────────
# THE FOUR SEAM FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────
def check_smiles(smiles: str) -> dict:
    """Is this a real molecule? Cheap, always runs before anything expensive."""
    ok, mol = validate_smiles(smiles)
    return {"smiles": smiles, "valid": bool(ok), "mol": mol}


def properties(smiles: str) -> dict:
    """RDKit descriptors + your existing ADMET flag logic."""
    ok, mol = validate_smiles(smiles)
    if not ok:
        return {"smiles": smiles, "valid": False, "error": "invalid SMILES"}
    props = calculate_properties(mol)
    issues = check_admet(props)
    return {
        "smiles": smiles,
        "valid": True,
        **props,
        "admet_flags": [i for i in issues if i.startswith("FLAG")],
        "admet_warnings": [i for i in issues if i.startswith("WARN")],
    }


def dock(smiles: str, name: str = "cand") -> dict:
    """
    Dock against MRP1. Returns:
        {smiles, affinity, pose_path, source, seconds, error}
    affinity is kcal/mol, more negative = better. None means the dock failed.
    """
    smiles = (smiles or "").strip()
    cache = _load_cache()

    if smiles in cache and DOCK_MODE in ("cache", "hybrid"):
        hit = cache[smiles]
        return {
            "smiles": smiles,
            "affinity": hit["affinity"],
            "pose_path": hit.get("pose_path"),
            "source": "cache",
            "seconds": 0.0,
        }

    if DOCK_MODE == "cache":
        return {
            "smiles": smiles, "affinity": None, "source": "cache",
            "error": "no cached pose for this SMILES (DOCK_MODE=cache)",
        }

    ok, _ = validate_smiles(smiles)
    if not ok:
        return {"smiles": smiles, "affinity": None, "error": "invalid SMILES"}

    receptor = _receptor()
    if not receptor.exists():
        return {
            "smiles": smiles, "affinity": None,
            "error": f"receptor not found at {receptor} — set up a target first",
        }

    t0 = time.time()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            pdbqt = smiles_to_pdbqt(smiles, name, tmp_path)
            if pdbqt is None:
                return {
                    "smiles": smiles, "affinity": None,
                    "error": "3D embedding failed (obabel)",
                    "seconds": round(time.time() - t0, 1),
                }
            affinity, docked = run_vina(
                pdbqt, name, tmp_path, str(receptor), dict(_cfg("grid")),
                exhaustiveness=EXHAUSTIVENESS,
            )
            pose_path = None
            if docked is not None:
                poses = Path(_cfg("poses"))
                poses.mkdir(exist_ok=True)
                pose_path = str(poses / f"{name}.pdbqt")
                Path(pose_path).write_bytes(Path(docked).read_bytes())
    except Exception as e:  # never let a bad candidate kill the run
        return {
            "smiles": smiles, "affinity": None,
            "error": f"{type(e).__name__}: {e}",
            "seconds": round(time.time() - t0, 1),
        }

    elapsed = round(time.time() - t0, 1)
    if affinity is not None:
        cache[smiles] = {
            "affinity": round(float(affinity), 2),
            "pose_path": pose_path,
            "source": "vina",
        }
        _save_cache(cache)

    return {
        "smiles": smiles,
        "affinity": round(float(affinity), 2) if affinity is not None else None,
        "pose_path": pose_path,
        "source": "vina",
        "seconds": elapsed,
        **({} if affinity is not None else {"error": "Vina returned no score"}),
    }


def seed_scaffolds(n: int = 3, generative_only: bool = False) -> list[dict]:
    """
    Starting points, best-scoring first. Falls back to the reference ligand.

    `generative_only` restricts this to the ORIGINAL generative output, i.e.
    molecules that came from runs.db rather than ones this loop designed.
    Round 1 of the demo must show what the generator produces unfiltered;
    once the loop has run, its own (makeable) candidates are in the cache
    and would otherwise creep into that pool and soften the result. Keeping
    the two apart is what makes the before/after honest.
    """
    cache = _load_cache()

    def pick(items):
        return [{"smiles": s, "affinity": v["affinity"]}
                for s, v in items if v.get("affinity") is not None]

    scored = []
    if generative_only:
        scored = pick((s, v) for s, v in cache.items()
                      if v.get("source") == "runs.db")
    if not scored:
        scored = pick(cache.items())
    scored.sort(key=lambda d: d["affinity"])
    if not scored:
        scored = [{
            "smiles": REFERENCE_LIGAND["smiles"],
            "affinity": REFERENCE_LIGAND["affinity"],
        }]
    return scored[:n]


if __name__ == "__main__":
    t = TARGET()
    src = f"docking_pipeline.py at {PROJECT}" if PROJECT else "vendored chemistry.py"
    print(f"chemistry: {src}")
    print(f"target   : {t['name']}  ({t.get('grid_source', '?')})")
    print(f"receptor : {_receptor()}  exists={_receptor().exists()}")
    print(f"mode     : {DOCK_MODE}")
    print(f"seeded   : {seed_cache_from_runs_db()} poses from runs.db")
    print(f"cache    : {len(_load_cache())} entries")
    for s in seed_scaffolds(3):
        print(f"  {s['affinity']:>7.2f}  {s['smiles'][:70]}")
