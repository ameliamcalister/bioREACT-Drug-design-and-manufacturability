"""
build_demo.py — freeze a real run into files the interface can read with
no backend at all.

    python3 build_demo.py

The interface normally talks to serve.py for everything: structures,
poses, cavity analysis, the run log, the manufacturability report. A
visitor arriving from a link has none of that — no Python, no RDKit, no
AutoDock Vina, no API key — so this writes the same payloads to disk as
static files, and the interface falls back to them when the API does not
answer.

What that gives a visitor is the whole interface over a real run: the
actual molecules, the actual critic rejections, the actual docked poses in
3D, the actual costs. What it cannot give them is a new run, and the
interface says so rather than letting a button fail.

Everything written here is generated from the current state of loop/, so
rebuilding after a better run is one command.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import admet
import chembl
import critics
import manufacture
import pipeline_adapter as pipe
import pocket
import poses
import serve
import target as tgt

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "bioreact-app" / "public" / "demo"

# Every molecule worth having a structure, a pose and a cavity analysis
# for. Anything else the interface asks about falls back gracefully.
MAX_POSES = 8


def write_json(name: str, payload) -> None:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, default=str))


def molecules_from_run(run_log: dict) -> list[str]:
    """Every SMILES mentioned by the run, best binding first."""
    seen: dict[str, float] = {}
    for round_data in run_log.get("rounds", []):
        for candidate in round_data.get("assessed") or []:
            smiles = candidate.get("smiles")
            if smiles:
                seen[smiles] = candidate.get("affinity") or 0.0
    for row in run_log.get("decision_table") or []:
        seen.setdefault(row["smiles"], row.get("affinity") or 0.0)
    return sorted(seen, key=lambda s: seen[s])


def main() -> None:
    run_log_path = HERE / "run_log.json"
    if not run_log_path.exists():
        raise SystemExit(
            "no run to freeze — run the loop first:\n"
            "  python3 orchestrator.py --warm-start")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    run_log = json.loads(run_log_path.read_text())
    active = tgt.active_target() or {}
    molecules = molecules_from_run(run_log)

    # ── the documents the interface polls ────────────────────────────────
    write_json("run_log.json", run_log)
    write_json("method.json", serve.method_document())
    write_json("targets.json", {
        "active": serve.summarise(active) if active else None,
        "targets": [serve.summarise(t) for t in tgt.list_targets()],
    })
    write_json("status.json", {
        "loop": {"running": False, "label": "", "console": ""},
        "manufacture": {"running": False, "label": "", "console": ""},
        "running": False,
        "label": "",
        "console": "",
        "backend": {
            "designer": "not available in the demo",
            "api_key_set": False,
            "vina": False,
            "obabel": False,
            "dock_mode": "recorded",
            "chemistry": "recorded run",
        },
        "demo": True,
    })

    for name, source in (("manufacture_report.json", HERE / "manufacture_report.json"),
                         ("eval_results.json", HERE / "eval_results.json")):
        if source.exists():
            write_json(name, json.loads(source.read_text()))
        else:
            print(f"  (skipped {name}: {source.name} not present)")

    # ── structures, in both themes ───────────────────────────────────────
    structures: dict[str, dict[str, str]] = {}
    for index, smiles in enumerate(molecules):
        stem = f"structures/{index:03d}"
        for suffix, dark in (("", False), ("-dark", True)):
            svg = serve.render_svg(smiles, 320, 200, dark=dark)
            path = OUT / f"{stem}{suffix}.svg"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(svg)
        structures[smiles] = {"light": f"{stem}.svg", "dark": f"{stem}-dark.svg"}
    print(f"  {len(structures)} structures")

    # ── the property screen, per molecule ────────────────────────────────
    screens = {}
    for index, smiles in enumerate(molecules):
        name = f"screens/{index:03d}.json"
        write_json(name, admet.screen(smiles))
        screens[smiles] = name

    # ── poses and cavity analysis, for those that have one ───────────────
    receptor_written = False
    pose_files: dict[str, str] = {}
    void_files: dict[str, str] = {}
    for index, smiles in enumerate(molecules):
        if len(pose_files) >= MAX_POSES:
            break
        pose = poses.pose_for(smiles)
        if not pose.get("ok"):
            continue

        if not receptor_written:
            (OUT / "receptor.pdb").write_text(poses.receptor_pdb())
            receptor_written = True

        name = f"poses/{index:03d}.json"
        write_json(name, pose)
        pose_files[smiles] = name

        voids = pocket.find_voids(active["receptor"], pose["pdb"],
                                  dict(active["grid"]))
        voids["smiles"] = smiles
        voids["summary"] = pocket.summarise_for_agent(voids)
        name = f"voids/{index:03d}.json"
        write_json(name, voids)
        void_files[smiles] = name
    print(f"  {len(pose_files)} poses with cavity analysis")

    # ── published binders, from the ChEMBL cache ─────────────────────────
    chembl_id = active.get("chembl_target_id")
    if chembl_id:
        actives = chembl.known_actives(chembl_id, limit=6, offline=True)
        if actives.get("ok"):
            write_json("chembl-actives.json", actives)

    # ── the decision table as CSV, so the download works too ─────────────
    csv_path = HERE / "candidates.csv"
    if csv_path.exists():
        shutil.copyfile(csv_path, OUT / "candidates.csv")

    # ── the index the interface reads first ──────────────────────────────
    best = next((row for row in (run_log.get("decision_table") or [])
                 if row.get("rank") == 1), None)
    write_json("manifest.json", {
        "generated_at": time.strftime("%Y-%m-%d"),
        "verdict": (run_log.get("result") or {}).get("verdict_reason", ""),
        "target": active.get("name"),
        "target_description": active.get("description", ""),
        "rounds": len(run_log.get("rounds", [])),
        "headline": (
            f"{best['recommendation_label']} · {best['affinity']} kcal/mol · "
            f"~{best['estimated_steps']} steps" if best else ""),
        "structures": structures,
        "screens": screens,
        "poses": pose_files,
        "voids": void_files,
        "note": (
            "A recorded run, frozen into static files. Every number, "
            "structure and pose here came out of the real pipeline; what "
            "the demo cannot do is start a new run, because that needs "
            "RDKit, AutoDock Vina and an API key on your own machine."),
        "rubric_version": len(critics.RUBRIC),
        "assumptions_version": len(manufacture.ASSUMPTIONS),
        "dock_mode": pipe.DOCK_MODE,
    })

    total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"wrote {OUT} — {total / 1024:.0f} KB over "
          f"{sum(1 for f in OUT.rglob('*') if f.is_file())} files")


if __name__ == "__main__":
    main()
