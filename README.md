# bioREACT — Drug Design and Manufacture

**Generative chemistry designs molecules nobody can manufacture. bioREACT
closes the loop.**

Researchers have to decide which molecule to make first. Today that means
sending a long list to a process chemist and waiting weeks. bioREACT makes
that decision in minutes, with the reasoning attached.

Two halves, one product:

| | |
|---|---|
| **Design loop** (`loop/`) | An agent designs molecules, docks them with AutoDock Vina, and two critics judge whether they can actually be made. Rejections are structured, and the agent redesigns against them. |
| **Bioprocess workbench** (`bioreact-app/`) | Takes a candidate and works out how to manufacture it — route selection, reactor screening, oxygen balance, optimisation, and human sign-off gates. |

They meet at a **routing gate**: small molecules go to chemical synthesis,
biologics to a CHO bioreactor. The gate refuses to put a 409 Da small
molecule into a bioreactor, because mammalian cells cannot express one.
That refusal is designed behaviour, not a gap.

---

## Run it

```bash
./start.sh
```

Then open **http://localhost:3000**.

One command starts both halves. The bioprocess workbench is the front door;
the design loop is proxied behind it at `/design`, reachable from the
**Design Loop →** button in the Research Workbench nav. Ctrl-C stops both.

Re-running `start.sh` is safe — it frees both ports first.

### First run on a new machine

```bash
pip install -r loop/requirements.txt
```

```bash
cd loop && python3 doctor.py
```

`doctor.py` checks every dependency and prints the exact command to fix
anything missing. `start.sh` installs the Node packages itself on first run.

---

## What you need

| | why | install |
|---|---|---|
| Python 3.10+ with **rdkit**, **httpx** | molecules, descriptors, API calls | `pip install -r loop/requirements.txt` |
| **Node 18+** | the bioprocess workbench | `brew install node` |
| **Open Babel** | SMILES → 3D structure | `conda install -c conda-forge openbabel` |
| **AutoDock Vina** | docking | `brew install autodock-vina` |
| Claude API key | only for the live designer | `cp loop/.env.example loop/.env`, add your key |

**You can run the whole demo without an API key and without Vina.** Pick
**mock** mode: it uses docking results committed to this repo. About five
seconds, fully offline.

---

## Results

| round | source | manufacturable | best |
|-------|--------|---------------|------|
| 1 | real generative output | **0/3** | −12.90 kcal/mol, ~18 steps |
| 2 | designer, after feedback | **3/3** | −11.63 kcal/mol, ~8 steps |

The round-2 molecule beats the reference MRP1 inhibitor MK-571 (−9.1) on a
far shorter route.

**The finding:** docking score and manufacturability are *anti-correlated*.
The three best-docking molecules in the source data are the three the
critics reject.

Critic accuracy: 23/23 on an easy tier, **7/11 on a deliberately hard one**,
30/34 (88%) combined. Press **Run evaluation** to reproduce it. The easy
tier is unimpressive and the tool says so — those groups separate on
molecular weight alone.

---

## Layout

| path | what |
|------|------|
| `start.sh` | starts both halves |
| `loop/` | the design loop — see [loop/README.md](loop/README.md) |
| `loop/doctor.py` | dependency check with fixes |
| `loop/critics.py` | **the rubric** — edit thresholds here |
| `loop/serve.py`, `index.html` | the design UI and its API |
| `loop/bioreact_export.py` | the handoff — see [loop/INTEGRATION.md](loop/INTEGRATION.md) |
| `bioreact-app/` | the bioprocess workbench (React + Express) |
| `bioreact-app/server.ts` | serves the app and proxies `/design` |
| `docking_pipeline.py` | the original full pipeline, used if present |

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'rdkit'`** — Homebrew's `python3`
is ahead of Anaconda's on your PATH and does not have rdkit. `start.sh`
pins the right interpreter; if running by hand, use the full path:
`~/anaconda3/bin/python3 serve.py`.

**`EADDRINUSE` / `Address already in use`** — servers from a previous run
are still going. `./start.sh` clears both ports, so just run it again.

**Every button fails, or "could not reach the server"** — the page is open
as a local file. It must be served: use `http://localhost:3000`, never
double-click `index.html`.

**"Design tool not reachable"** — the Python half is still starting (it
loads rdkit, a few seconds). Wait and reload.

**`npm install` fails on peer dependencies** — use
`npm install --legacy-peer-deps`, then `npm install-scripts approve esbuild`.

---

## Honest limitations

- `estimated_steps` is a heuristic from rings, stereocentres and heavy
  atoms, **not a retrosynthesis**. Labelled an estimate everywhere.
- Docking **ranks**; it does not predict affinity. Rigid receptor, one grid,
  no rescoring. Vina is stochastic — repeat runs varied by 0.17 kcal/mol for
  a rigid candidate, 1.51 for the flexible reference.
- **No cost estimates.** Route complexity is reported; price per gram
  depends on the real route, scale and supplier quotes, and is the process
  chemist's call.
- Building-block availability is approximated by element and halogen
  checks, not a supplier catalogue.
- The designer is a language model proposing structures, not a trained
  molecular generator. The bioprocess model is CHO-specific and abstains
  outside that distribution.
- **No synthesis is ever executed.** The output is a proposal; a person
  approves at every gate.
