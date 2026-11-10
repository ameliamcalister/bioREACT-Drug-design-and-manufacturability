"""
target.py — make the loop work for any protein, not just MRP1.

A "target" is everything the loop needs to know about what it is designing
against. It is written to targets/<slug>/target.json and every other module
reads it from there:

    {
      "name": "MRP1",
      "slug": "mrp1",
      "description": "multidrug-resistance efflux transporter",
      "receptor": "/abs/path/receptor.pdbqt",
      "grid": {center_x..., size_x...},
      "reference": {"name": "MK-571", "smiles": "...", "affinity": null},
      "grid_source": "reference ligand" | "whole receptor"
    }

What the user supplies:
  * a receptor  — .pdb (we convert) or .pdbqt (used as is)        REQUIRED
  * a reference ligand — .pdb/.pdbqt/.sdf/.mol2 file, or a SMILES  optional

Why the reference ligand matters: it defines WHERE to dock. With one, the
grid is a tight box around it — fast and focused on the real binding site.
Without one, we fall back to a box around the whole protein, which is slow
and much less reliable. Say so in the UI; blind docking is a real downgrade,
not a detail.

Uploaded files are untrusted input. They are written into their own
directory and only ever passed to obabel as path arguments.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGETS = HERE / "targets"
ACTIVE = HERE / "target.json"          # pointer to the current target

RECEPTOR_EXT = {".pdb", ".pdbqt", ".ent"}
LIGAND_EXT = {".pdb", ".pdbqt", ".sdf", ".mol", ".mol2", ".smi"}
MAX_BYTES = 80 * 1024 * 1024

DEFAULT_PADDING = 10.0     # Å added around the reference ligand
MIN_BOX = 18.0             # never smaller than this
MAX_BOX = 40.0             # Vina gets slow and unreliable past this


class TargetError(RuntimeError):
    pass


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "target").lower()).strip("-")
    return s or "target"


def _obabel() -> str:
    exe = shutil.which("obabel")
    if not exe:
        raise TargetError("Open Babel not found — `conda install -c conda-forge "
                          "openbabel` or `brew install open-babel`")
    return exe


def _run(cmd: list[str], what: str) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        raise TargetError(f"{what} timed out") from None
    return r.stdout + r.stderr


# ─────────────────────────────────────────────────────────────────────────────
# GEOMETRY
# ─────────────────────────────────────────────────────────────────────────────
def coords_from_pdblike(path: Path) -> list[tuple[float, float, float]]:
    pts = []
    for line in path.read_text(errors="ignore").splitlines():
        if line.startswith(("ATOM", "HETATM")):
            try:
                pts.append((float(line[30:38]), float(line[38:46]),
                            float(line[46:54])))
            except ValueError:
                pass
        elif line.startswith("ENDMDL"):
            break          # first pose only
    return pts


def coords_from_molfile(path: Path) -> list[tuple[float, float, float]]:
    """SDF / MOL / MOL2 via RDKit, falling back to Open Babel."""
    try:
        from rdkit import Chem
        suppl = (Chem.SDMolSupplier(str(path), removeHs=False)
                 if path.suffix.lower() in (".sdf", ".mol")
                 else [Chem.MolFromMol2File(str(path), removeHs=False)])
        for mol in suppl:
            if mol is None or not mol.GetNumConformers():
                continue
            c = mol.GetConformer()
            return [tuple(c.GetAtomPosition(i)) for i in range(mol.GetNumAtoms())]
    except Exception:
        pass
    tmp = path.with_suffix(".conv.pdb")
    _run([_obabel(), str(path), "-opdb", "-O", str(tmp)], "ligand conversion")
    return coords_from_pdblike(tmp) if tmp.exists() else []


def grid_from_points(pts, padding: float = DEFAULT_PADDING) -> dict:
    if not pts:
        raise TargetError("no coordinates found in that file")
    xs, ys, zs = zip(*pts)
    out = {}
    for axis, vals in (("x", xs), ("y", ys), ("z", zs)):
        lo, hi = min(vals), max(vals)
        out[f"center_{axis}"] = round((lo + hi) / 2, 3)
        out[f"size_{axis}"] = round(
            min(max(hi - lo + 2 * padding, MIN_BOX), MAX_BOX), 1)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# PREPARATION
# ─────────────────────────────────────────────────────────────────────────────
def prepare_receptor(src: Path, out_dir: Path) -> Path:
    """.pdbqt is used as is; .pdb is converted to a rigid receptor."""
    if src.suffix.lower() == ".pdbqt":
        dst = out_dir / "receptor.pdbqt"
        shutil.copy(src, dst)
        return dst

    dst = out_dir / "receptor.pdbqt"

    # -xr makes a rigid receptor. Gasteiger charges are preferable but Open
    # Babel aborts the whole conversion on some structures (metals, odd
    # residues) and reports "0 molecules converted", so fall back to -xr
    # alone, which assigns its own charges and works far more widely.
    attempts = [
        ["-xr", "--partialcharge", "gasteiger"],
        ["-xr"],
    ]
    log = ""
    for extra in attempts:
        if dst.exists():
            dst.unlink()
        log = _run([_obabel(), str(src), "-opdbqt", "-O", str(dst), *extra],
                   "receptor preparation")
        if dst.exists() and dst.stat().st_size > 0:
            return dst

    raise TargetError(f"could not convert the receptor to PDBQT. "
                      f"Open Babel said: {log.strip()[:300]}")


def ligand_smiles(src: Path) -> str | None:
    """Best-effort SMILES for the reference ligand, used as a design seed."""
    if src.suffix.lower() == ".smi":
        txt = src.read_text(errors="ignore").strip().split()
        return txt[0] if txt else None
    out = _run([_obabel(), str(src), "-osmi"], "SMILES extraction")
    for line in out.splitlines():
        cand = line.strip().split("\t")[0].split()[0] if line.strip() else ""
        if len(cand) < 4:
            continue
        try:
            from rdkit import Chem
            m = Chem.MolFromSmiles(cand)
            if m is not None and m.GetNumHeavyAtoms() >= 6:
                return Chem.MolToSmiles(m)
        except Exception:
            return cand
    return None


def build_target(
    name: str,
    receptor_path: Path,
    ligand_path: Path | None = None,
    ligand_smiles_text: str = "",
    description: str = "",
    padding: float = DEFAULT_PADDING,
    reference_name: str = "",
) -> dict:
    """Prepare everything and write targets/<slug>/target.json."""
    slug = slugify(name)
    out_dir = TARGETS / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    if receptor_path.suffix.lower() not in RECEPTOR_EXT:
        raise TargetError(f"receptor must be one of "
                          f"{', '.join(sorted(RECEPTOR_EXT))}")
    receptor = prepare_receptor(receptor_path, out_dir)

    # ── where to dock ────────────────────────────────────────────────────
    ref_smiles, grid, grid_source = None, None, ""

    if ligand_path is not None:
        ext = ligand_path.suffix.lower()
        if ext not in LIGAND_EXT:
            raise TargetError(f"ligand must be one of "
                              f"{', '.join(sorted(LIGAND_EXT))}")
        pts = (coords_from_pdblike(ligand_path)
               if ext in (".pdb", ".pdbqt", ".ent")
               else coords_from_molfile(ligand_path))
        if pts:
            grid = grid_from_points(pts, padding)
            grid_source = "reference ligand"
        ref_smiles = ligand_smiles(ligand_path)
        shutil.copy(ligand_path, out_dir / f"reference{ext}")

    if ligand_smiles_text.strip():
        ref_smiles = ligand_smiles_text.strip()

    if grid is None:
        # No pose to centre on: box the whole protein. Slower, less reliable.
        grid = grid_from_points(coords_from_pdblike(receptor), padding=4.0)
        for ax in "xyz":
            grid[f"size_{ax}"] = round(min(grid[f"size_{ax}"], 60.0), 1)
        grid_source = "whole receptor (blind docking — no reference ligand)"

    cfg = {
        "name": name.strip() or "Target",
        "slug": slug,
        "description": description.strip(),
        "receptor": str(receptor),
        "grid": grid,
        "grid_source": grid_source,
        "reference": {
            "name": reference_name.strip() or "reference ligand",
            "smiles": ref_smiles,
            "affinity": None,          # filled in by the first dock
        },
        "cache": str(out_dir / "dock_cache.json"),
        "poses": str(out_dir / "poses"),
    }
    (out_dir / "target.json").write_text(json.dumps(cfg, indent=2))
    ACTIVE.write_text(json.dumps({"slug": slug}, indent=2))
    (out_dir / "poses").mkdir(exist_ok=True)
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# ACCESS
# ─────────────────────────────────────────────────────────────────────────────
def _rehome(cfg: dict) -> dict:
    """
    Recompute file paths from the target's own folder.

    target.json stores absolute paths, which go stale the moment the folder
    is moved or handed to a teammate. The files always live under
    targets/<slug>/, so derive them rather than trusting what was written.
    """
    d = TARGETS / cfg.get("slug", "")
    cfg["receptor"] = str(d / "receptor.pdbqt")
    cfg["cache"] = str(d / "dock_cache.json")
    cfg["poses"] = str(d / "poses")
    return cfg


def list_targets() -> list[dict]:
    out = []
    if TARGETS.exists():
        for d in sorted(TARGETS.iterdir()):
            f = d / "target.json"
            if f.is_file():
                try:
                    out.append(_rehome(json.loads(f.read_text())))
                except Exception:
                    pass
    return out


def active_target() -> dict | None:
    """The target the loop is currently pointed at, or None."""
    if ACTIVE.exists():
        try:
            slug = json.loads(ACTIVE.read_text())["slug"]
            f = TARGETS / slug / "target.json"
            if f.is_file():
                return _rehome(json.loads(f.read_text()))
        except Exception:
            pass
    return None


def set_active(slug: str) -> dict:
    f = TARGETS / slug / "target.json"
    if not f.is_file():
        raise TargetError(f"no such target: {slug}")
    ACTIVE.write_text(json.dumps({"slug": slug}, indent=2))
    return _rehome(json.loads(f.read_text()))


def seed_mrp1_target() -> dict:
    """
    Rebuild the MRP1 target from the receptor committed to this repository.

    Only needed if targets/mrp1/target.json is deleted or corrupted; the
    prepared target is committed, so a clone does not have to run this.
    """
    rec = TARGETS / "mrp1" / "receptor.pdbqt"
    if not rec.exists():
        raise TargetError(f"{rec} not found")
    cfg = build_target(
        name="MRP1",
        receptor_path=rec,
        description="ABCC1, a multidrug-resistance efflux transporter. "
                    "Blocking it is intended to restore the activity of "
                    "chemotherapy agents the transporter pumps out of "
                    "tumour cells.",
        reference_name="MK-571",
        ligand_smiles_text="CC(C)(C)c1ccc(cc1)/C=C/c1cc(ccn1)CSC(CC(=O)O)"
                           "SCCc1ccccc1",
    )
    # the grid we measured from the docked MK-571 pose
    cfg["grid"] = {"center_x": 97.497, "center_y": 62.007, "center_z": 57.852,
                   "size_x": 24.0, "size_y": 24.0, "size_z": 24.0}
    cfg["grid_source"] = "docked MK-571 pose"
    cfg["reference"]["affinity"] = -9.1
    (TARGETS / cfg["slug"] / "target.json").write_text(json.dumps(cfg, indent=2))
    return cfg


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "seed":
        c = seed_mrp1_target()
        print(f"created target '{c['name']}' ({c['slug']})")
        print(f"  receptor  {c['receptor']}")
        print(f"  grid      {c['grid_source']}")
    for t in list_targets():
        a = active_target()
        mark = "*" if a and a["slug"] == t["slug"] else " "
        print(f" {mark} {t['slug']:<16} {t['name']:<18} "
              f"ref={(t['reference']['smiles'] or '')[:30]}")
