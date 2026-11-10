"""
poses.py — docked poses, converted for anything that wants to read them.

AutoDock Vina writes PDBQT: PDB plus AutoDock atom types and partial
charges. Browsers' PDB parsers choke on the extra columns, and so does
anything that assumes columns 77–78 hold an element symbol. This module
rewrites each line as clean PDB and recovers the element from the AutoDock
type, keeping MODEL/ENDMDL records so all nine binding modes survive.

Used by the web server (to feed the 3D viewer), by the pocket analysis (to
find the space a pose leaves empty) and by the designer agent (same thing,
as a tool).
"""
from __future__ import annotations

import json
from pathlib import Path

import pipeline_adapter as pipe
import target

HERE = Path(__file__).resolve().parent

# AutoDock type → element. Anything not listed falls back to the first
# character of the type, which is right for C, N, O, S, F, P and I.
AD_ELEMENT = {
    "A": "C",                      # aromatic carbon
    "NA": "N", "NS": "N",
    "OA": "O", "OS": "O",
    "SA": "S",
    "HD": "H", "HS": "H",
    "CL": "CL", "BR": "BR",
}


def pdbqt_to_pdb(text: str) -> str:
    out = []
    for line in text.splitlines():
        if line.startswith(("MODEL", "ENDMDL")):
            out.append(line[:14])
            continue
        if line.startswith("REMARK VINA RESULT"):
            out.append(line)
            continue
        if not line.startswith(("ATOM", "HETATM")):
            continue
        ad = line[77:79].strip().upper() if len(line) > 77 else ""
        element = AD_ELEMENT.get(ad, ad[:1] if ad else line[12:14].strip()[:1])
        out.append(f"{line[:66]:<66}{'':10}{element:>2}")
    out.append("END")
    return "\n".join(out)


_receptor_cache: str | None = None
_receptor_key: str | None = None


def receptor_pdb() -> str:
    """The active target's receptor, converted once and remembered."""
    global _receptor_cache, _receptor_key
    active = target.active_target()
    key = ((active or {}).get("receptor")
           or str(HERE / "targets" / "mrp1" / "receptor.pdbqt"))
    if _receptor_cache is None or key != _receptor_key:
        path = Path(key)
        _receptor_cache = pdbqt_to_pdb(path.read_text()) if path.exists() else "END"
        _receptor_key = key
    return _receptor_cache


def invalidate_receptor_cache() -> None:
    """Call after a new target is prepared, so the viewer reloads it."""
    global _receptor_cache, _receptor_key
    _receptor_cache, _receptor_key = None, None


def pose_for(smiles: str) -> dict:
    """
    The saved Vina pose for a SMILES, via the active target's dock cache.

    Returns {"ok": True, "pdb", "affinity", "mode_scores", "source"} or
    {"ok": False, "error"} — the error text is shown to the user, so it
    says which of the three possible misses happened.
    """
    active = target.active_target()
    cache_file = Path((active or {}).get("cache") or (HERE / "dock_cache.json"))
    if not cache_file.exists():
        return {"ok": False, "error": "nothing has been docked yet"}
    try:
        cache = json.loads(cache_file.read_text())
    except Exception:
        return {"ok": False, "error": "dock cache unreadable"}

    hit = cache.get((smiles or "").strip())
    if not hit:
        return {"ok": False, "error": "this molecule has not been docked"}
    path = pipe.pose_abs(hit.get("pose_path"))
    if path is None or not path.exists():
        return {"ok": False,
                "error": "docked, but the pose file is not on disk "
                         "(scored before poses were kept)"}

    raw = path.read_text()
    scores = [float(line.split()[3]) for line in raw.splitlines()
              if line.startswith("REMARK VINA RESULT")]
    return {
        "ok": True,
        "pdb": pdbqt_to_pdb(raw),
        "affinity": hit.get("affinity"),
        "mode_scores": scores,
        "source": hit.get("source"),
    }
