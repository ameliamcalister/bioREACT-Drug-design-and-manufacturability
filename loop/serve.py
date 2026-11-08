"""
serve.py — tiny demo server. No framework, no build step.

    python3 serve.py          then open http://localhost:8000

Serves this directory, plus the endpoints the page needs:

    GET  /svg?smiles=...   RDKit-rendered 2D structure as SVG
    GET  /run_log.json     written by the agent after every tool call
    GET  /status           is a run in progress? plus its console tail
    POST /run              start the loop  {mode, rounds, candidates, warm}
    POST /stop             kill a running loop
    POST /eval             run the critic evaluation

So you never have to touch the terminal: open the page, press Run.
The loop runs as a subprocess; the page polls run_log.json as before.
"""
from __future__ import annotations

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

RDLogger.DisableLog("rdApp.*")

HERE = Path(__file__).resolve().parent
PORT = 8000


def render_svg(smiles: str, width: int = 300, height: int = 190) -> str:
    mol = Chem.MolFromSmiles((smiles or "").strip())
    if mol is None:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
                f'height="{height}"><text x="8" y="20" font-size="12" '
                f'fill="#b00">invalid SMILES</text></svg>')
    d = rdMolDraw2D.MolDraw2DSVG(width, height)
    opts = d.drawOptions()
    opts.clearBackground = False
    opts.bondLineWidth = 2
    rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
    d.FinishDrawing()
    return d.GetDrawingText()


# ─────────────────────────────────────────────────────────────────────────────
# TARGET SETUP — receptor and reference ligand uploaded from the page
#
# Files arrive base64-encoded inside JSON rather than as multipart, which
# keeps this to one stdlib handler with no form parsing. They are written to
# a scratch directory under the target's own folder and only ever handed to
# Open Babel as path arguments.
# ─────────────────────────────────────────────────────────────────────────────
import base64  # noqa: E402

import target  # noqa: E402

MAX_UPLOAD = 80 * 1024 * 1024


def summarise(cfg: dict) -> dict:
    g = cfg.get("grid", {})
    ref = cfg.get("reference", {})
    return {
        "name": cfg.get("name"),
        "slug": cfg.get("slug"),
        "description": cfg.get("description", ""),
        "grid_source": cfg.get("grid_source", ""),
        "blind": "blind" in (cfg.get("grid_source") or ""),
        "box": [g.get("size_x"), g.get("size_y"), g.get("size_z")],
        "centre": [g.get("center_x"), g.get("center_y"), g.get("center_z")],
        "reference_name": ref.get("name"),
        "reference_smiles": ref.get("smiles"),
        "receptor_atoms": cfg.get("receptor_atoms"),
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
    rec = _save_upload(body.get("receptor"), scratch)
    if rec is None:
        raise ValueError("a receptor file is required (.pdb or .pdbqt)")
    lig = _save_upload(body.get("ligand"), scratch)

    cfg = target.build_target(
        name=name,
        receptor_path=rec,
        ligand_path=lig,
        ligand_smiles_text=str(body.get("ligand_smiles") or ""),
        description=str(body.get("description") or ""),
        padding=float(body.get("padding") or target.DEFAULT_PADDING),
        reference_name=str(body.get("reference_name") or ""),
    )
    cfg["receptor_atoms"] = sum(
        1 for ln in Path(cfg["receptor"]).read_text(errors="ignore").splitlines()
        if ln.startswith(("ATOM", "HETATM")))
    (target.TARGETS / cfg["slug"] / "target.json").write_text(
        json.dumps(cfg, indent=2))

    global _receptor_cache
    _receptor_cache = None            # the viewer must reload the new protein
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# POSES — real Vina output, served to the 3D viewer
#
# PDBQT is PDB plus AutoDock atom types and partial charges. Browsers' PDB
# parsers choke on the extra columns, so we rewrite each line as clean PDB
# and recover the element from the AutoDock type. MODEL/ENDMDL records are
# kept, so all nine binding modes survive and the viewer can step through
# them.
# ─────────────────────────────────────────────────────────────────────────────
AD_ELEMENT = {
    "A": "C",    # aromatic carbon
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
        el = AD_ELEMENT.get(ad, ad[:1] if ad else line[12:14].strip()[:1])
        out.append(f"{line[:66]:<66}{'':10}{el:>2}")
    out.append("END")
    return "\n".join(out)


_receptor_cache: str | None = None
_receptor_key: str | None = None


def receptor_pdb() -> str:
    """The ACTIVE target's receptor, converted for the browser viewer."""
    global _receptor_cache, _receptor_key
    t = target.active_target()
    key = (t or {}).get("receptor") or str(HERE / "Receptor_MRP1.pdbqt")
    if _receptor_cache is None or key != _receptor_key:
        p = Path(key)
        _receptor_cache = pdbqt_to_pdb(p.read_text()) if p.exists() else "END"
        _receptor_key = key
    return _receptor_cache


def pose_for(smiles: str) -> dict:
    """Find the saved Vina pose for a SMILES, via the dock cache."""
    t = target.active_target()
    cache_file = Path((t or {}).get("cache") or (HERE / "dock_cache.json"))
    if not cache_file.exists():
        return {"ok": False, "error": "no dock cache yet"}
    try:
        cache = json.loads(cache_file.read_text())
    except Exception:
        return {"ok": False, "error": "dock cache unreadable"}

    hit = cache.get((smiles or "").strip())
    if not hit:
        return {"ok": False, "error": "this molecule has not been docked"}
    path = hit.get("pose_path")
    if not path or not Path(path).exists():
        return {"ok": False,
                "error": "docked, but the pose file is not on disk "
                         "(scored before poses were kept)"}

    raw = Path(path).read_text()
    scores = [float(m) for m in
              (ln.split()[3] for ln in raw.splitlines()
               if ln.startswith("REMARK VINA RESULT"))]
    return {
        "ok": True,
        "pdb": pdbqt_to_pdb(raw),
        "affinity": hit.get("affinity"),
        "mode_scores": scores,
        "source": hit.get("source"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# JOB RUNNER — one subprocess at a time, output captured for the page
# ─────────────────────────────────────────────────────────────────────────────
class Job:
    def __init__(self):
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
                return False, "a run is already in progress"
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
            del self.lines[:-400]      # keep the tail bounded
        proc.wait()

    def stop(self) -> bool:
        if not self.running or self.proc is None:
            return False
        try:
            os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
        except Exception:
            self.proc.terminate()
        self.lines.append("\n  ** stopped by user **")
        return True


JOB = Job()

MODE_ARGS = {
    # label        orchestrator flags
    "live":  ["--warm-start"],
    "cache": ["--warm-start", "--cache-only"],
    "mock":  ["--warm-start", "--cache-only", "--mock"],
    "fresh": [],                      # designer invents round 1 too
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def _json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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
            cands = max(1, min(int(body.get("candidates", 3)), 5))
            args = ["orchestrator.py", *MODE_ARGS[mode],
                    "--rounds", str(rounds), "--candidates", str(cands)]
            ok, msg = JOB.start(args, f"loop ({mode}, {rounds} rounds)")
            return self._json({"ok": ok, "label": msg})

        if path == "/eval":
            ok, msg = JOB.start(["eval_set.py"], "critic evaluation")
            return self._json({"ok": ok, "label": msg})

        if path == "/stop":
            return self._json({"ok": JOB.stop()})

        if path == "/target":
            if JOB.running:
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
            return self._json({"ok": True, "target": summarise(cfg)})

        return self._json({"ok": False, "error": "unknown endpoint"}, 404)

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/status":
            return self._json({
                "running": JOB.running,
                "label": JOB.label,
                "console": "\n".join(JOB.lines[-200:]),
            })
        if parsed.path == "/bioreact.json":
            # Hand the current run to the bioREACT bioprocess app, in the
            # ClosedLoopRunDataset shape it already declares. Built fresh so
            # it always reflects the latest run rather than a copied figure.
            try:
                import bioreact_export
                data = bioreact_export.build()
            except SystemExit as e:
                return self._json({"ok": False, "error": str(e)}, 404)
            except Exception as e:
                return self._json(
                    {"ok": False, "error": f"{type(e).__name__}: {e}"}, 500)
            body = json.dumps(data, indent=2, default=str).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Disposition",
                             'attachment; filename="bioreact_handoff.json"')
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/targets":
            active = target.active_target()
            return self._json({
                "active": summarise(active) if active else None,
                "targets": [summarise(t) for t in target.list_targets()],
            })
        if parsed.path == "/pose":
            q = urllib.parse.parse_qs(parsed.query)
            res = pose_for(q.get("smiles", [""])[0])
            return self._json(res, 200 if res["ok"] else 404)
        if parsed.path == "/receptor":
            body = receptor_pdb().encode()
            self.send_response(200)
            self.send_header("Content-Type", "chemical/x-pdb")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/svg":
            q = urllib.parse.parse_qs(parsed.query)
            svg = render_svg(q.get("smiles", [""])[0])
            body = svg.encode()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path in ("/", "/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        # run_log.json changes constantly; never let the browser cache it.
        if self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal clean during the demo


if __name__ == "__main__":
    log = HERE / "run_log.json"
    if not log.exists():
        log.write_text(json.dumps({"status": "no run yet", "rounds": []}))
    # Threaded, not socketserver.TCPServer. A single-threaded server is
    # occupied for seconds by a multi-megabyte receptor upload (base64
    # decode, then Open Babel), while the page keeps polling /status and
    # run_log.json. Those connections fill the backlog and the browser's
    # next fetch is refused — which looks exactly like the server being
    # down. One thread per request, and a deeper queue.
    class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True
        request_queue_size = 64

    with Server(("", PORT), Handler) as httpd:
        print(f"  demo UI : http://localhost:{PORT}")
        print(f"  serving : {HERE}")
        print(f"  open the page and press Run — no terminal needed")
        print(f"  ctrl-c to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")
