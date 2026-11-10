"""
serve.py — the API the interface talks to. No framework, no build step.

    python3 serve.py          listens on http://localhost:8000

This process owns everything that needs RDKit, Open Babel, AutoDock Vina or
an API key. The interface (bioreact-app, React) owns nothing but
presentation and proxies these endpoints, so there is one place where
chemistry happens and one place where pixels happen.

READ
    GET  /status                    is anything running, and its console tail
    GET  /run_log.json              the design loop's log, rewritten per tool call
    GET  /manufacture_report.json   the manufacturability agents' report
    GET  /targets                   configured targets and the active one
    GET  /svg?smiles=               2D structure, rendered by RDKit
    GET  /pose?smiles=              docked pose as PDB, all binding modes
    GET  /receptor                  the active receptor as PDB
    GET  /voids?smiles=             unoccupied regions beside a docked pose
    GET  /screen?smiles=            property rule sets and structural alerts
    GET  /method                    rubric, assumptions, scales, versions
    GET  /chembl/actives?n=         published binders of the active target
    GET  /chembl/analogues?smiles=  published molecules similar to one of ours
    GET  /candidates.csv            the decision table as CSV
    GET  /export.json               the whole run as one JSON document

WRITE
    POST /run            start the design loop  {mode, rounds, candidates}
    POST /manufacture    assess the shortlist   {scale_g, rules_only, overrides}
    POST /eval           reproduce the critic evaluation
    POST /stop           stop whichever job is running
    POST /target         prepare a new target from uploaded files
    POST /target/select  switch the active target

Two jobs can run at once — the design loop and the manufacturability
agents — because the second takes a minute and there is no reason to block
the interface while it runs. A third request to a busy slot is refused with
a message rather than queued.
"""
from __future__ import annotations

import base64
import http.server
import json
import os
import signal
import socketserver
import subprocess
import sys
import threading
import urllib.parse
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem.Draw import rdMolDraw2D

import admet
import chembl
import critics
import manufacture
import pipeline_adapter as pipe
import pocket
import poses
import target

RDLogger.DisableLog("rdApp.*")

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("DESIGN_PORT", "8000"))
MAX_UPLOAD = 80 * 1024 * 1024


# ─────────────────────────────────────────────────────────────────────────────
# STRUCTURE DRAWING
# ─────────────────────────────────────────────────────────────────────────────
def render_svg(smiles: str, width: int = 320, height: int = 200,
               dark: bool = False) -> str:
    mol = Chem.MolFromSmiles((smiles or "").strip())
    if mol is None:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
                f'height="{height}"><text x="8" y="20" font-size="12" '
                f'fill="#b00">invalid SMILES</text></svg>')
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    options = drawer.drawOptions()
    options.clearBackground = False
    options.bondLineWidth = 2
    if dark:
        # Light-on-dark atom palette, so a structure can sit on a dark panel
        # without being wrapped in a white box.
        options.setAtomPalette({-1: (0.90, 0.93, 0.96)})
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


# ─────────────────────────────────────────────────────────────────────────────
# TARGET SETUP — receptor and reference ligand uploaded from the interface
#
# Files arrive base64-encoded inside JSON rather than as multipart, which
# keeps this to one stdlib handler with no form parsing. They are written to
# a scratch directory under the target's own folder and only ever handed to
# Open Babel as path arguments.
# ─────────────────────────────────────────────────────────────────────────────
def summarise(cfg: dict) -> dict:
    grid = cfg.get("grid", {})
    reference = cfg.get("reference", {})
    return {
        "name": cfg.get("name"),
        "slug": cfg.get("slug"),
        "description": cfg.get("description", ""),
        "grid_source": cfg.get("grid_source", ""),
        "blind": "blind" in (cfg.get("grid_source") or ""),
        "box": [grid.get("size_x"), grid.get("size_y"), grid.get("size_z")],
        "centre": [grid.get("center_x"), grid.get("center_y"),
                   grid.get("center_z")],
        "reference_name": reference.get("name"),
        "reference_smiles": reference.get("smiles"),
        "reference_affinity": reference.get("affinity"),
        "receptor_atoms": cfg.get("receptor_atoms"),
        "chembl_target_id": cfg.get("chembl_target_id"),
    }


def _save_upload(spec, dest_dir: Path) -> Path | None:
    """spec is {"filename": str, "b64": str} or None."""
    if not spec or not spec.get("b64"):
        return None
    name = Path(str(spec.get("filename") or "upload")).name
    if not name or name.startswith("."):
        raise ValueError("bad filename")
    try:
        data = base64.b64decode(spec["b64"], validate=True)
    except Exception:
        raise ValueError(f"{name} is not valid base64") from None
    if len(data) > MAX_UPLOAD:
        raise ValueError(f"{name} is larger than "
                         f"{MAX_UPLOAD // (1024 * 1024)} MB")
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / name
    out.write_bytes(data)
    return out


def build_target_from_upload(body: dict) -> dict:
    name = str(body.get("name") or "").strip()
    if not name:
        raise ValueError("give the target a name")

    scratch = target.TARGETS / target.slugify(name) / "uploads"
    receptor = _save_upload(body.get("receptor"), scratch)
    if receptor is None:
        raise ValueError("a receptor file is required (.pdb or .pdbqt)")
    ligand = _save_upload(body.get("ligand"), scratch)

    cfg = target.build_target(
        name=name,
        receptor_path=receptor,
        ligand_path=ligand,
        ligand_smiles_text=str(body.get("ligand_smiles") or ""),
        description=str(body.get("description") or ""),
        padding=float(body.get("padding") or target.DEFAULT_PADDING),
        reference_name=str(body.get("reference_name") or ""),
    )
    cfg["receptor_atoms"] = sum(
        1 for line in Path(cfg["receptor"]).read_text(errors="ignore").splitlines()
        if line.startswith(("ATOM", "HETATM")))
    (target.TARGETS / cfg["slug"] / "target.json").write_text(
        json.dumps(cfg, indent=2))

    poses.invalidate_receptor_cache()   # the viewer must load the new protein
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# JOB RUNNER — one subprocess per slot, output captured for the interface
# ─────────────────────────────────────────────────────────────────────────────
class Job:
    def __init__(self, slot: str):
        self.slot = slot
        self.proc: subprocess.Popen | None = None
        self.lines: list[str] = []
        self.label = ""
        self.lock = threading.Lock()

    @property
    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def start(self, args: list[str], label: str) -> tuple[bool, str]:
        with self.lock:
            if self.running:
                return False, f"{self.slot} is already running ({self.label})"
            self.lines = []
            self.label = label
            env = dict(os.environ, NO_COLOR="1", PYTHONUNBUFFERED="1")
            self.proc = subprocess.Popen(
                [sys.executable, "-u", *args],
                cwd=str(HERE), env=env, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, bufsize=1,
                start_new_session=True,
            )
            threading.Thread(target=self._pump, daemon=True).start()
            return True, label

    def _pump(self) -> None:
        proc = self.proc
        if proc is None or proc.stdout is None:
            return
        for line in proc.stdout:
            line = line.rstrip("\n")
            if "Running Vina" in line:
                line = "  docking..."
            self.lines.append(line)
            del self.lines[:-400]            # keep the tail bounded
        proc.wait()

    def stop(self) -> bool:
        if not self.running or self.proc is None:
            return False
        try:
            os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
        except Exception:
            self.proc.terminate()
        self.lines.append("\n  ** stopped **")
        return True

    def state(self) -> dict:
        return {"running": self.running, "label": self.label,
                "console": "\n".join(self.lines[-200:])}


LOOP_JOB = Job("design loop")
MANUFACTURE_JOB = Job("manufacturability agents")

MODE_ARGS = {
    # label        orchestrator flags
    "live":  ["--warm-start"],
    "cache": ["--warm-start", "--cache-only"],
    "mock":  ["--warm-start", "--cache-only", "--mock"],
    "fresh": [],                          # designer invents round 1 too
}


# ─────────────────────────────────────────────────────────────────────────────
# METHOD — everything the interface needs to explain itself
# ─────────────────────────────────────────────────────────────────────────────
def method_document() -> dict:
    active = target.active_target()
    return {
        "rubric": [
            {"criterion": name, "flag_above": flag, "fail_above": fail}
            for name, (flag, fail) in critics.RUBRIC.items()
        ] + [{"criterion": "estimated_steps", "flag_above": 10,
              "fail_above": 14}],
        "rubric_note": (
            "Both critics compare computed descriptors against these "
            "numbers. Above the flag threshold a candidate proceeds with a "
            "caveat; above the fail threshold it is rejected and the "
            "designer is told which criterion to fix. The thresholds live "
            "in critics.py and are meant to be edited by a chemist."),
        "property_rule_sets": [
            {"key": key, "name": spec["name"], "citation": spec["citation"],
             "what_for": spec["what_for"],
             "allowed_violations": spec["allowed_violations"],
             "rules": [text for *_, text in spec["rules"]]}
            for key, spec in admet.RULE_SETS.items()
        ],
        "assumptions": manufacture.assumptions_table(),
        "scales": manufacture.SCALE_PRESETS,
        "routes": manufacture.ROUTES,
        "enzyme_classes": [
            {"key": m["key"], "enzyme": m["enzyme"], "replaces": m["replaces"],
             "why": m["why"]} for m in manufacture.ENZYME_MOTIFS
        ],
        "pocket_method": {
            "spacing_a": pocket.SPACING,
            "clash_a": pocket.CLASH,
            "burial_axes": f"{pocket.MIN_ENCLOSURE}/13",
            "min_volume_a3": pocket.MIN_VOLUME,
            "note": ("Unoccupied space is found on a grid: a point counts "
                     "if no receptor atom is within the clash distance, it "
                     "is enclosed on enough ray axes to be inside a pocket "
                     "rather than in solvent, and it is clear of the "
                     "ligand. Connected points are clustered. Geometry "
                     "only — no energy term, one rigid pose."),
        },
        "docking": {
            "engine": "AutoDock Vina",
            "mode": pipe.DOCK_MODE,
            "exhaustiveness": pipe.EXHAUSTIVENESS,
            "note": ("Rigid receptor, one grid, nine binding modes kept. "
                     "Scores rank candidates; they are not binding free "
                     "energies, and Vina is stochastic, so repeat runs of "
                     "one molecule differ."),
        },
        "target": summarise(active) if active else None,
        "limitations": [
            "The step count is a heuristic from rings, stereocentres and "
            "heavy atoms — not a retrosynthesis. No reaction is ever "
            "proposed, so no real route is costed.",
            "Cost and time factors are uncalibrated defaults inside "
            "published ranges for early-phase manufacture. Nothing here is "
            "validated against real process data, so read the ranking "
            "between candidates rather than the absolute figures.",
            "Docking is rigid-receptor AutoDock Vina on a single grid. "
            "Scores rank; they do not predict affinity.",
            "The property screen applies published rule sets and structural "
            "alerts. There is no trained ADMET model anywhere in this "
            "project, so nothing here predicts absorption or toxicity.",
            "Building-block availability is approximated from elements and "
            "halogen density, not from a supplier catalogue.",
            "The critics are deterministic rules, not a model — "
            "deliberately, so every rejection points at a number and a "
            "threshold that can be defended or changed.",
        ],
        "attribution": [
            "Docking: AutoDock Vina. Structure handling: RDKit and Open "
            "Babel. Synthetic accessibility: Ertl & Schuffenhauer SA score "
            "as shipped with RDKit.",
            "Published activity and analogue data: ChEMBL (EMBL-EBI), "
            "CC-BY-SA 3.0, retrieved through the public REST API.",
            "Structural alerts: PAINS (Baell & Holloway) and the Brenk set, "
            "both as shipped in RDKit's filter catalogue.",
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    # ── helpers ──────────────────────────────────────────────────────────
    def _json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _raw(self, body: bytes, content_type: str, cache: str = "no-store",
             filename: str = "") -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        if filename:
            self.send_header("Content-Disposition",
                             f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def _query(self, parsed) -> dict:
        return {k: v[0] for k, v in
                urllib.parse.parse_qs(parsed.query).items()}

    # ── POST ─────────────────────────────────────────────────────────────
    def do_POST(self):  # noqa: N802
        path = urllib.parse.urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            body = {}

        if path == "/run":
            mode = str(body.get("mode", "live"))
            if mode not in MODE_ARGS:
                return self._json({"ok": False, "error": "bad mode"}, 400)
            rounds = max(1, min(int(body.get("rounds", 3)), 6))
            candidates = max(1, min(int(body.get("candidates", 3)), 5))
            args = ["orchestrator.py", *MODE_ARGS[mode],
                    "--rounds", str(rounds), "--candidates", str(candidates)]
            ok, message = LOOP_JOB.start(
                args, f"design loop · {mode} · {rounds} rounds")
            return self._json({"ok": ok, "label": message}
                              if ok else {"ok": False, "error": message})

        if path == "/manufacture":
            scale = float(body.get("scale_g") or 1000.0)
            args = ["manufacture_agent.py", "--scale", str(scale)]
            if body.get("rules_only"):
                args.append("--rules-only")
            if body.get("overrides"):
                args += ["--overrides", json.dumps(body["overrides"])]
            for smiles in (body.get("smiles") or []):
                args.append(str(smiles))
            label = (f"manufacturability · "
                     f"{'rules' if body.get('rules_only') else 'agents'} · "
                     f"{scale:.0f} g")
            ok, message = MANUFACTURE_JOB.start(args, label)
            return self._json({"ok": ok, "label": message}
                              if ok else {"ok": False, "error": message})

        if path == "/eval":
            ok, message = LOOP_JOB.start(["eval_set.py"], "critic evaluation")
            return self._json({"ok": ok, "label": message}
                              if ok else {"ok": False, "error": message})

        if path == "/stop":
            stopped = [job.slot for job in (LOOP_JOB, MANUFACTURE_JOB)
                       if job.stop()]
            return self._json({"ok": bool(stopped), "stopped": stopped})

        if path == "/target":
            if LOOP_JOB.running:
                return self._json({"ok": False,
                                   "error": "stop the current run first"}, 409)
            try:
                cfg = build_target_from_upload(body)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
            return self._json({"ok": True, "target": summarise(cfg)})

        if path == "/target/select":
            try:
                cfg = target.set_active(str(body.get("slug", "")))
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
            poses.invalidate_receptor_cache()
            return self._json({"ok": True, "target": summarise(cfg)})

        return self._json({"ok": False, "error": "unknown endpoint"}, 404)

    # ── GET ──────────────────────────────────────────────────────────────
    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path, query = parsed.path, self._query(parsed)

        if path == "/status":
            return self._json({
                "loop": LOOP_JOB.state(),
                "manufacture": MANUFACTURE_JOB.state(),
                # kept flat as well, so a client can ask one question
                "running": LOOP_JOB.running or MANUFACTURE_JOB.running,
                "label": LOOP_JOB.label if LOOP_JOB.running
                         else MANUFACTURE_JOB.label,
                "console": "\n".join(
                    (LOOP_JOB.lines if LOOP_JOB.running
                     else MANUFACTURE_JOB.lines)[-200:]),
                "backend": _backend_state(),
            })

        if path == "/method":
            return self._json(method_document())

        if path == "/targets":
            active = target.active_target()
            return self._json({
                "active": summarise(active) if active else None,
                "targets": [summarise(t) for t in target.list_targets()],
            })

        if path == "/pose":
            result = poses.pose_for(query.get("smiles", ""))
            return self._json(result, 200 if result["ok"] else 404)

        if path == "/voids":
            smiles = query.get("smiles", "")
            pose = poses.pose_for(smiles)
            if not pose.get("ok"):
                return self._json(pose, 404)
            active = pipe.TARGET()
            result = pocket.find_voids(active["receptor"], pose["pdb"],
                                       dict(active["grid"]))
            result["smiles"] = smiles
            result["summary"] = pocket.summarise_for_agent(result)
            return self._json(result)

        if path == "/screen":
            result = admet.screen(query.get("smiles", ""))
            return self._json(result, 200 if result.get("ok") else 400)

        if path == "/chembl/actives":
            active = target.active_target() or {}
            chembl_id = (active.get("chembl_target_id")
                         or chembl.resolve_target_id(active.get("name", "")))
            if not chembl_id:
                return self._json({"ok": False, "error":
                                   "no ChEMBL target matches this protein"},
                                  404)
            limit = int(query.get("n", 6))
            return self._json(chembl.known_actives(chembl_id, limit=limit))

        if path == "/chembl/analogues":
            return self._json(chembl.analogues(query.get("smiles", "")))

        if path == "/receptor":
            return self._raw(poses.receptor_pdb().encode(), "chemical/x-pdb",
                             cache="public, max-age=86400")

        if path == "/svg":
            svg = render_svg(query.get("smiles", ""),
                             width=int(query.get("w", 320)),
                             height=int(query.get("h", 200)),
                             dark=query.get("dark") == "1")
            return self._raw(svg.encode(), "image/svg+xml",
                             cache="public, max-age=3600")

        if path == "/candidates.csv":
            csv_path = HERE / "candidates.csv"
            if not csv_path.exists():
                return self._json({"ok": False,
                                   "error": "no decision table yet"}, 404)
            return self._raw(csv_path.read_bytes(), "text/csv",
                             filename="candidates.csv")

        if path == "/export.json":
            try:
                import export_run
                data = export_run.build()
            except SystemExit as e:
                return self._json({"ok": False, "error": str(e)}, 404)
            except Exception as e:
                return self._json(
                    {"ok": False, "error": f"{type(e).__name__}: {e}"}, 500)
            return self._raw(
                json.dumps(data, indent=2, default=str).encode(),
                "application/json", filename="bioreact_run.json")

        if path in ("/", "/index.html"):
            return self._json({
                "ok": True,
                "service": "bioREACT design and manufacturability API",
                "interface": "http://localhost:3000",
                "note": ("This process serves data, not pages. Start the "
                         "interface with ./start.sh and open port 3000."),
            })

        return super().do_GET()

    def end_headers(self):
        if self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass                      # the console tail is the useful log here


def _backend_state() -> dict:
    """What the interface needs to tell the user what will actually run."""
    import llm
    import shutil
    return {
        "designer": llm.backend_name(),
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "vina": bool(shutil.which(os.environ.get("VINA_PATH", "vina"))
                     or Path(os.environ.get("VINA_PATH", "")).exists()),
        "obabel": bool(shutil.which(os.environ.get("OBABEL_PATH", "obabel"))),
        "dock_mode": pipe.DOCK_MODE,
        "chemistry": ("docking_pipeline.py" if pipe.USING_FULL_PIPELINE
                      else "vendored chemistry.py"),
    }


if __name__ == "__main__":
    log = HERE / "run_log.json"
    if not log.exists():
        log.write_text(json.dumps({"status": "no run yet", "rounds": []}))

    # Threaded, not plain TCPServer. A single-threaded server is occupied
    # for seconds by a multi-megabyte receptor upload (base64 decode, then
    # Open Babel) while the interface keeps polling /status, and those
    # connections fill the backlog until the next fetch is refused — which
    # looks exactly like the server being down.
    class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True
        request_queue_size = 64

    with Server(("", PORT), Handler) as httpd:
        print(f"  design API : http://localhost:{PORT}")
        print("  interface  : http://localhost:3000  <- open this")
        print("  ctrl-c to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")
