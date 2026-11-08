"""
chemistry.py — the chemistry primitives, vendored so this repo stands alone.

These six functions are the whole chemical surface the loop needs:
validation, descriptors, property flags, 3D embedding and docking. They are
kept byte-for-byte equivalent to the originals in docking_pipeline.py so
results do not drift between the two.

Why vendored: a clone of this repository should run without also needing a
separate private project on disk. If you DO have the full pipeline, set
DOCKING_PROJECT and pipeline_adapter will prefer it, so improvements there
still flow through.

External programs required (both free):
    obabel   Open Babel, for SMILES -> 3D structure
    vina     AutoDock Vina, for docking

Found on PATH by default. Override with the OBABEL_PATH / VINA_PATH
environment variables if they live somewhere unusual.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors, rdMolDescriptors

RDLogger.DisableLog("rdApp.*")

import os  # noqa: E402

VINA_PATH = os.environ.get("VINA_PATH", "vina")
OBABEL_PATH = os.environ.get("OBABEL_PATH", "obabel")


def find_tool(hardcoded_path: str, tool_name: str) -> str:
    if Path(hardcoded_path).exists():
        return hardcoded_path
    found = shutil.which(tool_name)
    if found:
        return found
    raise FileNotFoundError(
        f"Cannot find '{tool_name}'. Install it, or set "
        f"{tool_name.upper()}_PATH to its full path. "
        f"Run `python3 doctor.py` for setup help."
    )


def validate_smiles(smiles: str):
    """Return (valid: bool, mol or None)."""
    if not smiles or not smiles.strip():
        return False, None
    try:
        mol = Chem.MolFromSmiles(smiles.strip())
    except Exception:
        return False, None
    return (mol is not None), mol


def calculate_properties(mol) -> dict:
    if mol is None:
        return {}
    return {
        "MW":       round(Descriptors.ExactMolWt(mol), 2),
        "cLogP":    round(Descriptors.MolLogP(mol), 2),
        "HBD":      rdMolDescriptors.CalcNumHBD(mol),
        "HBA":      rdMolDescriptors.CalcNumHBA(mol),
        "TPSA":     round(Descriptors.TPSA(mol), 1),
        "RotBonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
    }


def check_admet(props: dict) -> list[str]:
    issues = []
    if not props:
        return issues
    mw, logp, hbd, hba, tpsa, rot = (
        props.get("MW", 0), props.get("cLogP", 0), props.get("HBD", 0),
        props.get("HBA", 0), props.get("TPSA", 0), props.get("RotBonds", 0)
    )
    if mw > 620:   issues.append(f"FLAG  MW = {mw} Da  (limit: <=620)")
    elif mw > 600: issues.append(f"WARN  MW = {mw} Da  (soft limit: <=600)")
    if logp > 6.0:   issues.append(f"FLAG  cLogP = {logp}  (limit: <=6.0)")
    elif logp > 5.5: issues.append(f"WARN  cLogP = {logp}  (soft limit: <=5.5)")
    if hbd > 3:    issues.append(f"FLAG  HBD = {hbd}  (limit: <=3)")
    if hba > 10:   issues.append(f"FLAG  HBA = {hba}  (limit: <=10)")
    if tpsa > 140: issues.append(f"FLAG  TPSA = {tpsa} A^2  (limit: <=140)")
    if rot > 12:   issues.append(f"FLAG  RotBonds = {rot}  (limit: <=12)")
    elif rot > 10: issues.append(f"WARN  RotBonds = {rot}  (soft limit: <=10)")
    return issues


def smiles_to_pdbqt(smiles: str, name: str, work_dir: Path) -> Path | None:
    """SMILES -> 3D structure -> PDBQT, via Open Babel. ~1 s."""
    obabel = find_tool(OBABEL_PATH, "obabel")
    smi_path = work_dir / f"{name}.smi"
    sdf_path = work_dir / f"{name}.sdf"
    pdbqt_path = work_dir / f"{name}.pdbqt"

    smi_path.write_text(smiles.strip())

    subprocess.run(
        [obabel, str(smi_path), "-osdf", "-O", str(sdf_path), "--gen3d",
         "--forcefield", "mmff94", "-h", "--partialcharge", "gasteiger"],
        capture_output=True, text=True)
    if not sdf_path.exists() or sdf_path.stat().st_size == 0:
        return None

    subprocess.run(
        [obabel, str(sdf_path), "-opdbqt", "-O", str(pdbqt_path),
         "--partialcharge", "gasteiger"],
        capture_output=True, text=True)
    if not pdbqt_path.exists() or pdbqt_path.stat().st_size == 0:
        return None
    return pdbqt_path


def run_vina(
    pdbqt_path: Path, name: str, work_dir: Path,
    receptor: str, grid: dict, exhaustiveness: int = 8, seed: int = 0,
) -> tuple[float | None, Path | None]:
    """Dock one molecule. Returns (best affinity kcal/mol, pose file)."""
    vina = find_tool(VINA_PATH, "vina")
    out_pdbqt = work_dir / f"{name}_docked.pdbqt"

    cmd = [
        vina,
        "--receptor",       str(receptor),
        "--ligand",         str(pdbqt_path),
        "--out",            str(out_pdbqt),
        "--center_x",       str(grid["center_x"]),
        "--center_y",       str(grid["center_y"]),
        "--center_z",       str(grid["center_z"]),
        "--size_x",         str(grid["size_x"]),
        "--size_y",         str(grid["size_y"]),
        "--size_z",         str(grid["size_z"]),
        "--exhaustiveness", str(exhaustiveness),
        "--num_modes",      "9",
        "--energy_range",   "3",
    ]
    if seed:
        cmd += ["--seed", str(seed)]

    result = subprocess.run(cmd, capture_output=True, text=True)
    combined = result.stdout + result.stderr
    (work_dir / f"{name}_vina.log").write_text(combined)

    if not out_pdbqt.exists():
        return None, None

    match = re.search(r"^\s*1\s+([-\d.]+)", combined, re.MULTILINE)
    affinity = float(match.group(1)) if match else None
    return affinity, out_pdbqt
