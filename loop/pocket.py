"""
pocket.py — where is there still room in the binding site?

The design strategy this project uses is to grow a small known binder into
the parts of the cavity it does not yet touch, so that shape
complementarity improves instead of the molecule simply getting bigger.
That strategy needs an answer to a geometric question:

    given this receptor and this docked pose, which regions of the cavity
    are empty, how big are they, and which residues line them?

This module answers it, and the answer is handed to the designer agent as a
tool (`pocket_voids`) and drawn in the 3D viewer as translucent spheres.

HOW IT WORKS (grid-and-ray, the LIGSITE/POCKET family of methods)

  1. Lay a 0.8 Å grid over the docking box.
  2. A point is FREE if no receptor heavy atom is within `clash` Å of it
     (3.1 Å ≈ a carbon's van der Waals radius plus a water probe).
  3. A free point is BURIED if, casting rays along 13 axes, protein is hit
     on both sides in at least `min_enclosure` of them. This is what
     separates a real pocket from the open solvent outside the protein.
  4. A buried free point is UNOCCUPIED if it is further than `ligand_clear`
     Å from every ligand atom, and within `shell` Å of at least one — i.e.
     empty space that the current ligand could plausibly reach into.
  5. Connected unoccupied points are clustered (26-connectivity) and each
     cluster is reported with its volume, its position relative to the
     ligand, the residues lining it, and how polar that lining is.

WHAT IT IS NOT

  This is a geometric estimate, not a validated cavity-detection program
  (fpocket, SiteMap and friends do more: energetics, conservation,
  druggability scores). Volumes from a grid method depend on the probe and
  spacing chosen, so they are reported to two significant figures and
  should be read as "about this big", not as measurements. No energy term
  is computed anywhere in this file.
"""
from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent

# ── parameters, all in ångström unless stated ────────────────────────────────
SPACING = 0.8           # grid spacing
CLASH = 3.1             # a grid point this close to protein is inside protein
LIGAND_CLEAR = 2.2      # closer than this to the ligand counts as occupied
SHELL = 7.0             # only empty space this close to the ligand is useful
MIN_ENCLOSURE = 9       # of 13 ray axes, how many must be blocked both ways
RAY_LENGTH = 11.0       # how far to look for protein along each ray
MIN_VOLUME = 25.0       # Å³ — smaller clusters are noise, not subpockets
LINING_CUTOFF = 5.0     # residues within this of a void line it

# Kyte–Doolittle hydropathy, used only to describe a lining in one word.
HYDROPHOBIC = {"ALA", "VAL", "LEU", "ILE", "PHE", "MET", "TRP", "PRO", "CYS",
               "GLY", "TYR"}
POLAR = {"SER", "THR", "ASN", "GLN", "HIS", "LYS", "ARG", "ASP", "GLU"}
CHARGED = {"ASP", "GLU", "LYS", "ARG", "HIS"}

# 13 ray axes: 3 cartesian, 6 face diagonals, 4 body diagonals. Each is
# cast in both directions, which is what makes it a burial test.
_RAYS = np.array([
    (1, 0, 0), (0, 1, 0), (0, 0, 1),
    (1, 1, 0), (1, -1, 0), (1, 0, 1), (1, 0, -1), (0, 1, 1), (0, 1, -1),
    (1, 1, 1), (1, 1, -1), (1, -1, 1), (1, -1, -1),
], dtype=float)
_RAYS /= np.linalg.norm(_RAYS, axis=1, keepdims=True)


# ─────────────────────────────────────────────────────────────────────────────
# PARSING
# ─────────────────────────────────────────────────────────────────────────────
def parse_atoms(text: str, first_model_only: bool = False) -> dict:
    """
    Heavy atoms out of a PDB or PDBQT file.

    Returns {"xyz": (N,3) array, "resn": [...], "resi": [...], "chain": [...]}.
    Hydrogens are dropped: they are absent from crystal structures and
    inconsistently present in docked poses, so including them would make
    the geometry depend on which file a pose happened to come from.
    """
    xyz, resn, resi, chain, name = [], [], [], [], []
    for line in text.splitlines():
        if first_model_only and line.startswith("ENDMDL"):
            break
        if not line.startswith(("ATOM", "HETATM")):
            continue
        atom_name = line[12:16].strip()
        element = (line[76:78].strip() or atom_name[:1]).upper()
        if element.startswith("H") and element not in ("HG", "HF", "HO", "HE"):
            continue
        if element in ("HD", "HS"):          # AutoDock polar-hydrogen types
            continue
        try:
            xyz.append((float(line[30:38]), float(line[38:46]),
                        float(line[46:54])))
        except ValueError:
            continue
        resn.append(line[17:20].strip().upper())
        try:
            resi.append(int(line[22:26]))
        except ValueError:
            resi.append(0)
        chain.append((line[21] or "A").strip() or "A")
        name.append(atom_name)
    return {
        "xyz": np.asarray(xyz, dtype=float).reshape(-1, 3),
        "resn": resn, "resi": resi, "chain": chain, "name": name,
    }


# ─────────────────────────────────────────────────────────────────────────────
# THE CALCULATION
# ─────────────────────────────────────────────────────────────────────────────
def _grid(grid_cfg: dict, ligand_xyz: np.ndarray) -> tuple[np.ndarray, tuple]:
    """
    Grid points covering the docking box, trimmed to the neighbourhood of
    the ligand so the cost does not depend on how large the box is.
    """
    centre = np.array([grid_cfg["center_x"], grid_cfg["center_y"],
                       grid_cfg["center_z"]], dtype=float)
    size = np.array([grid_cfg["size_x"], grid_cfg["size_y"],
                     grid_cfg["size_z"]], dtype=float)
    lo, hi = centre - size / 2, centre + size / 2

    if len(ligand_xyz):
        lo = np.maximum(lo, ligand_xyz.min(axis=0) - SHELL - 1.0)
        hi = np.minimum(hi, ligand_xyz.max(axis=0) + SHELL + 1.0)
    if np.any(hi <= lo):
        return np.zeros((0, 3)), (lo, (0, 0, 0))

    axes = [np.arange(lo[i], hi[i] + 1e-9, SPACING) for i in range(3)]
    shape = tuple(len(a) for a in axes)
    mesh = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1)
    return mesh.reshape(-1, 3), (lo, shape)


def _buried(points: np.ndarray, protein: np.ndarray) -> np.ndarray:
    """
    Ray-casting burial test, vectorised over points.

    For each ray axis, step outwards in both directions and ask whether any
    protein atom sits within CLASH of the stepped position. An axis counts
    as blocked only when protein is found in both directions — that is what
    distinguishes a pocket from a dimple on the surface.
    """
    if not len(points):
        return np.zeros(0, dtype=bool)
    steps = np.arange(CLASH, RAY_LENGTH + 1e-9, SPACING * 2)
    blocked = np.zeros((len(points), len(_RAYS)), dtype=np.int8)

    from scipy.spatial import cKDTree
    tree = cKDTree(protein)

    for axis_i, ray in enumerate(_RAYS):
        for sign in (1, -1):
            hit = np.zeros(len(points), dtype=bool)
            for s in steps:
                probe = points + sign * ray * s
                hit |= tree.query(probe, k=1)[0] < CLASH
            blocked[:, axis_i] += hit.astype(np.int8)
    return (blocked == 2).sum(axis=1) >= MIN_ENCLOSURE


def _cluster(points: np.ndarray, origin: np.ndarray) -> list[np.ndarray]:
    """Group grid points into connected components (26-connectivity)."""
    if not len(points):
        return []
    keys = np.rint((points - origin) / SPACING).astype(int)
    index = {tuple(k): i for i, k in enumerate(keys)}
    seen = set()
    offsets = [(dx, dy, dz)
               for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1)
               if (dx, dy, dz) != (0, 0, 0)]

    clusters = []
    for start in index:
        if start in seen:
            continue
        queue, members = deque([start]), []
        seen.add(start)
        while queue:
            cur = queue.popleft()
            members.append(index[cur])
            for off in offsets:
                nxt = (cur[0] + off[0], cur[1] + off[1], cur[2] + off[2])
                if nxt in index and nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        clusters.append(points[np.asarray(members)])
    clusters.sort(key=len, reverse=True)
    return clusters


def _describe(cluster: np.ndarray, receptor: dict, ligand_xyz: np.ndarray,
              rank: int) -> dict:
    from scipy.spatial import cKDTree

    volume = len(cluster) * SPACING ** 3
    centroid = cluster.mean(axis=0)

    # residues lining this void
    tree = cKDTree(receptor["xyz"])
    near_atoms = set()
    for idx in tree.query_ball_point(cluster, LINING_CUTOFF):
        near_atoms.update(idx)
    residues = {}
    for i in near_atoms:
        key = (receptor["chain"][i], receptor["resi"][i], receptor["resn"][i])
        d = float(np.min(np.linalg.norm(cluster - receptor["xyz"][i], axis=1)))
        residues[key] = min(residues.get(key, 1e9), d)
    lining = sorted(residues.items(), key=lambda kv: kv[1])

    names = [f"{resn}{resi}" + (f":{ch}" if ch not in ("A", "") else "")
             for (ch, resi, resn), _ in lining[:8]]
    kinds = [resn for (_, _, resn), _ in lining]
    n_phobic = sum(1 for k in kinds if k in HYDROPHOBIC)
    n_polar = sum(1 for k in kinds if k in POLAR)
    n_charged = sum(1 for k in kinds if k in CHARGED)
    total = max(1, n_phobic + n_polar)
    polar_fraction = n_polar / total

    if polar_fraction >= 0.6:
        character, chemistry = "polar", (
            "add a hydrogen-bond donor or acceptor — an amide, sulfonamide, "
            "hydroxyl or basic amine — pointing into this region")
    elif polar_fraction <= 0.35:
        character, chemistry = "hydrophobic", (
            "extend with a lipophilic group — an aryl, benzyl, halogenated "
            "ring or tert-butyl — to fill this region")
    else:
        character, chemistry = "mixed", (
            "an aryl ring carrying one polar substituent suits a lining of "
            "this kind")

    # how to get there from the ligand
    if len(ligand_xyz):
        d_lig = np.linalg.norm(ligand_xyz[:, None, :] - cluster[None, :, :],
                               axis=2)
        nearest_atom = int(np.argmin(d_lig.min(axis=1)))
        gap = float(d_lig.min())
        direction = centroid - ligand_xyz[nearest_atom]
        norm = float(np.linalg.norm(direction)) or 1.0
        bearing = (direction / norm).round(2).tolist()
    else:
        nearest_atom, gap, bearing = -1, float("nan"), [0, 0, 0]

    return {
        "rank": rank,
        "volume_a3": float(round(volume, -1) if volume >= 100 else round(volume)),
        "centre": [round(float(v), 2) for v in centroid],
        "gap_to_ligand_a": round(gap, 1) if math.isfinite(gap) else None,
        "nearest_ligand_atom_index": nearest_atom,
        "direction_from_ligand": bearing,
        "lining_residues": names,
        "lining_counts": {"hydrophobic": n_phobic, "polar": n_polar,
                          "charged": n_charged},
        "character": character,
        "suggested_chemistry": chemistry,
        "grid_points": len(cluster),
    }


def find_voids(receptor_path: str | Path, ligand_pdb: str, grid_cfg: dict,
               max_voids: int = 4) -> dict:
    """
    Unoccupied subpockets around a docked pose.

    `ligand_pdb` is the text of a PDB/PDBQT pose (first model is used).
    Returns {"voids": [...], "ligand_volume_a3": float, "method": str, ...}.
    """
    receptor_text = Path(receptor_path).read_text(errors="ignore")
    receptor = parse_atoms(receptor_text)
    ligand = parse_atoms(ligand_pdb, first_model_only=True)
    if not len(receptor["xyz"]):
        return {"ok": False, "error": "no receptor atoms parsed", "voids": []}
    if not len(ligand["xyz"]):
        return {"ok": False, "error": "no ligand atoms parsed", "voids": []}

    from scipy.spatial import cKDTree
    points, (origin, _) = _grid(grid_cfg, ligand["xyz"])
    if not len(points):
        return {"ok": False, "error": "docking box and pose do not overlap",
                "voids": []}

    prot_tree = cKDTree(receptor["xyz"])
    lig_tree = cKDTree(ligand["xyz"])

    free = prot_tree.query(points, k=1)[0] >= CLASH
    points = points[free]
    if not len(points):
        return {"ok": True, "voids": [], "note": "no free space in the box"}

    d_lig = lig_tree.query(points, k=1)[0]
    candidate = points[(d_lig >= LIGAND_CLEAR) & (d_lig <= SHELL)]
    if not len(candidate):
        return {"ok": True, "voids": [],
                "note": "the pose fills the space around it"}

    candidate = candidate[_buried(candidate, receptor["xyz"])]
    if not len(candidate):
        return {"ok": True, "voids": [],
                "note": "the empty space nearby is open solvent, not pocket"}

    voids = []
    for rank, cluster in enumerate(_cluster(candidate, origin), start=1):
        volume = len(cluster) * SPACING ** 3
        if volume < MIN_VOLUME:
            break
        voids.append(_describe(cluster, receptor, ligand["xyz"], rank))
        if len(voids) >= max_voids:
            break

    return {
        "ok": True,
        "voids": voids,
        "receptor_atoms": int(len(receptor["xyz"])),
        "ligand_atoms": int(len(ligand["xyz"])),
        "unoccupied_volume_a3": int(round(sum(v["volume_a3"] for v in voids))),
        "method": (f"grid {SPACING} Å, probe clash {CLASH} Å, burial "
                   f"{MIN_ENCLOSURE}/13 ray axes, clusters above "
                   f"{MIN_VOLUME:.0f} Å³"),
        "caveat": ("geometric estimate from one rigid pose — no energy term, "
                   "no receptor flexibility, volumes depend on probe size"),
    }


def summarise_for_agent(result: dict, max_voids: int = 3) -> str:
    """Plain-text form of the result, for the designer agent's prompt."""
    if not result.get("ok"):
        return f"pocket analysis unavailable: {result.get('error')}"
    voids = result.get("voids") or []
    if not voids:
        return (f"No unoccupied subpocket above {MIN_VOLUME:.0f} Å³ next to "
                f"this pose. {result.get('note', '')}".strip())
    lines = [f"{len(voids)} unoccupied region(s) next to the pose "
             f"(~{result['unoccupied_volume_a3']} Å³ in total):"]
    for v in voids[:max_voids]:
        lines.append(
            f"  #{v['rank']}  ~{v['volume_a3']:.0f} Å³, {v['character']}, "
            f"{v['gap_to_ligand_a']} Å from the nearest ligand atom; "
            f"lined by {', '.join(v['lining_residues'][:5])}")
        lines.append(f"      → {v['suggested_chemistry']}")
    lines.append("Grow the scaffold into these regions rather than adding "
                 "mass anywhere else; " + result["caveat"] + ".")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    import pipeline_adapter as pipe
    import serve

    smiles = sys.argv[1] if len(sys.argv) > 1 else None
    t = pipe.TARGET()
    if smiles is None:
        seeds = pipe.seed_scaffolds(1)
        smiles = seeds[0]["smiles"]
    pose = serve.pose_for(smiles)
    if not pose.get("ok"):
        raise SystemExit(f"no pose for that molecule: {pose.get('error')}")
    res = find_voids(t["receptor"], pose["pdb"], dict(t["grid"]))
    print(json.dumps(res, indent=2))
    print()
    print(summarise_for_agent(res))
