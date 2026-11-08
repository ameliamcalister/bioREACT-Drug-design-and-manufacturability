# Closed-loop molecule design

**Generative chemistry outputs molecules nobody can manufacture. We close the
loop with a process-chemistry critic.**

A design agent proposes molecules and docks them. Two critics judge whether
they could actually be made. When they can't, the agent is told *exactly
which property to fix* — and tries again.

```
Designer agent ──candidates──▶ Synthesisability critic ──▶ Process critic
      ▲                                                          │
      └──────────── structured rejection reasons ◀───────────────┘
```

That feedback arrow is the point. Most systems are a straight line:
design → check → done. This one is a circle.

<img width="1432" height="780" alt="Screenshot 2026-11-08 at 15 54 41" src="https://github.com/user-attachments/assets/737d860f-bf7d-4fbf-8752-863246874fc8" />

<img width="1432" height="780" alt="Screenshot 2026-11-08 at 15 55 12" src="https://github.com/user-attachments/assets/ea30b2e2-87a9-4760-8076-ad6265706107" />
<img width="1432" height="780" alt="Screenshot 2026-11-08 at 15 56 28" src="https://github.com/user-attachments/assets/13717763-e85f-4c67-8c7d-2401044f1388" />
<img width="1432" height="780" alt="Screenshot 2026-11-08 at 15 56 45" src="https://github.com/user-attachments/assets/b8a7a297-35fe-447b-98dc-783702e6212d" />

---

## Quickstart

```bash
pip install -r loop/requirements.txt
```

```bash
cd loop && python3 doctor.py
```

`doctor.py` checks everything and prints the exact fix for anything missing.
When it says **Ready**:

```bash
cd loop && python3 serve.py
```

Open **http://localhost:8000** and press **Run loop**.

> Open it at that address — not by double-clicking `index.html`. A page
> opened as a file has no http origin, so none of its buttons work.

### Nothing to install? Try it offline first

Pick **mock** mode and press Run. No API key, no docking, ~5 seconds, and
it still shows the real loop using cached results committed to this repo.

---

## What you need

| | why | install |
|---|---|---|
| Python 3.10+ | | python.org |
| `rdkit` | molecules, descriptors, drawing | `pip install -r loop/requirements.txt` |
| `httpx` | Claude API calls | same |
| **Open Babel** | SMILES → 3D structure | `conda install -c conda-forge openbabel` or `brew install open-babel` |
| **AutoDock Vina** | the docking engine | `brew install autodock-vina` |
| Claude API key | only for the real designer | `cp loop/.env.example loop/.env`, add your key |

The last two can't be installed by pip. `doctor.py` will tell you if they're
missing and where to get them. If they live somewhere unusual, set
`VINA_PATH` / `OBABEL_PATH`.

**You can run the whole demo without an API key** using mock mode, and
without Vina using cache mode.

---

## Run modes

| mode | needs | time | what it is |
|------|-------|------|-----------|
| **live** | key + Vina | ~90 s | the real thing |
| **cache** | key | instant | real designer, pre-computed poses |
| **mock** | nothing | ~5 s | scripted designer, cached poses — fully offline |
| **fresh** | key + Vina | ~90 s | designer invents round 1 too |

`live`, `cache` and `mock` start round 1 from real generative output that
docks well and cannot be made. That's the demo.

---

## What it does

| round | source | manufacturable | best |
|-------|--------|---------------|------|
| 1 | real generative output | **0/3** | −12.90 kcal/mol, ~18 steps |
| 2 | designer, after feedback | **3/3** | −11.63 kcal/mol, ~8 steps |

The round-2 molecule beats the reference MRP1 inhibitor MK-571 (−9.1) on a
far shorter route.

**The finding:** docking score and manufacturability are *anti-correlated*.
The three best-docking molecules in the source data are the three the
critics reject.

Every run ends with a **decision table** — each candidate ranked with
explicit strengths and concerns and a call of `MAKE FIRST`, `MAKE`,
`BACKUP`, `REDESIGN` or `DO NOT MAKE` — also written to
`loop/candidates.csv`.

### Critic accuracy

| tier | accuracy |
|------|----------|
| classic drugs vs natural products | 23/23 = 100% |
| **hard: complex marketed drugs vs plausible rejects** | 7/11 = 64% |
| combined | 30/34 = 88% |

Press **Run evaluation** to reproduce it. Tier 1 at 100% is not impressive
and you should say so — those two groups separate on molecular weight
alone. Tier 2 is the honest number, and every miss is printed by name.

---

## Your own protein

Press **+ New target**, upload a receptor (`.pdb` is converted for you) and
a reference ligand.

**The reference ligand decides where on the protein you dock.** Give it a
pose file — the ligand from the crystal structure as `.pdb`/`.sdf`/`.mol2` —
and the grid is boxed tightly around it. Without one it docks blind against
the whole protein: slower and far less reliable. SMILES alone is not
enough; it has no coordinates.

If the ligand is inside your PDB already:

```bash
grep "^HETATM" structure.pdb | grep " ATP " > ligand.pdb
```

Verified on a second protein (an 8,540-atom ATP-binding structure): **0/1 →
3/3**, with no code changed.

---

## Layout

| path | what |
|------|------|
| `loop/orchestrator.py` | the loop and the feedback edge |
| `loop/designer_agent.py` | the agent: tools, budget, run log |
| `loop/critics.py` | **the rubric** — edit `RUBRIC` here |
| `loop/compare.py` | the decision table |
| `loop/eval_set.py` | ground truth and confusion matrix |
| `loop/pipeline_adapter.py` | the only seam to the chemistry |
| `loop/chemistry.py` | vendored chemistry, so a clone runs standalone |
| `loop/index.html`, `serve.py` | the web UI |
| `docking_pipeline.py` | the original full pipeline (used if present) |

---

## Honest limitations

- `estimated_steps` is a heuristic from rings, stereocentres and heavy
  atoms — **not** a retrosynthesis. Labelled an estimate everywhere.
- **No costing.** Route complexity is reported
  (`straightforward`/`moderate`/`demanding`/`specialist`); pricing per gram
  depends on the real route, scale and supplier quotes and is the process
  chemist's call, not something to guess from a SMILES string.
- Building-block availability is approximated by element and halogen
  checks, not a supplier catalogue. Obvious next step.
- Docking is rigid-receptor Vina on one grid. Scores **rank**; they do not
  predict affinity. Vina is also stochastic — repeat runs of one molecule
  varied by 0.17 kcal/mol (rigid) to 1.51 (flexible) here.
- The critics are deterministic rules, not an LLM — deliberately, so every
  rejection points at a number and a threshold you can defend.
