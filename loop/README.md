# Closed-loop molecule design — any protein

> Set up for MRP1 out of the box. Press **+ New target**, upload a receptor
> and a reference ligand, and the whole loop works for your protein instead.



**The claim:** generative chemistry outputs molecules nobody can manufacture.
We close the loop with a process-chemistry critic.

Not a pipeline. A **loop** — the designer is told *why* its molecule can't be
made and tries again. That feedback edge is the whole pitch.

```
Designer agent ──candidates──▶ Synthesisability critic ──▶ Process critic
      ▲                                                          │
      └──────────── structured rejection reasons ◀───────────────┘
```

---

## Run it

One command, then everything happens in the browser:

```bash
cd loop && python3 serve.py
```

Open http://localhost:8000 and press **Run loop**. Pick a mode, press the
button, watch it fill in live — structures, verdicts, rejection reasons,
console output. **Run evaluation** gives you the confusion matrix. No
terminal needed after startup.

Every docked molecule has a **View docked pose (3D)** button: the real Vina
output, rotatable, with all nine binding modes and their individual scores
in a dropdown, the pocket residues within 4.5 Å picked out in yellow, and an
optional surface. This is the actual pose file from disk, not a picture —
good insurance for "is it really docking?"

| mode | what it does |
|------|-------------|
| **live** | real Vina docking, real Claude designer (~90 s) — the demo |
| **cache** | pre-computed poses, instant — if you're short on time on stage |
| **mock** | scripted designer, offline — if wifi or the API dies |
| **fresh** | designer invents round 1 too (usually converges immediately) |

The first three start round 1 from the **real** generative output in your
`data/runs.db` — the molecules that dock best and cannot be made. The critics
reject them; the designer fixes exactly what it was told to fix.

**Open it at `http://localhost:8000`, not by double-clicking `index.html`.**
A file-opened page has no http origin, so none of its requests can resolve
and every button fails. The page detects this and tells you, but it is the
single easiest way to lose ten minutes.

## Which molecule should I make?

Every run ends with a **decision table**, in the terminal and at the top of
the page, ranking each candidate with explicit strengths and concerns and
one of five calls:

| call | meaning |
|------|---------|
| `MAKE FIRST` | best binding among the molecules that can actually be made |
| `MAKE` | solid candidate, nothing blocking |
| `BACKUP` | workable, but weaker binding or a route caveat |
| `REDESIGN` | binds well, but the route blocks it — worth another pass |
| `DO NOT MAKE` | not makeable at a practical scale |

`REDESIGN` is the interesting one and it is where the argument lives. The
top-docking molecule in the MRP1 run scores −12.90 — better than anything
else — and is still not the one to make, because the route is ~18 steps.
That single row is the pitch.

The table is also written to `candidates.csv` for your slides.

**No prices.** How demanding a route looks is reported
(`straightforward` / `moderate` / `demanding` / `specialist`); what it costs
per gram is the process chemist's call, from the real route and supplier
quotes, and is deliberately not guessed here.

## Using your own protein

Press **+ New target** and fill in:

| field | notes |
|-------|-------|
| **protein name** | anything — it names the target and appears in the prompt |
| **receptor file** | `.pdb` or `.pdbqt`. A `.pdb` is converted for you (~1 s) |
| **reference ligand file** | **this is the important one** — see below |
| reference SMILES | optional, names the molecule but gives no position |
| what is it? | one line of biology; it goes into the designer's prompt |

**The reference ligand decides where on the protein you dock.** Give it a
pose file — the ligand from the crystal structure as `.pdb`, `.sdf` or
`.mol2` — and the grid is boxed tightly around it. Without one, the loop
boxes the *whole protein* and docks blind: much slower and far less
reliable. The UI warns you when that happens. SMILES alone is not enough,
because a SMILES string has no coordinates.

If your PDB has the ligand in it, pull it out with one line (`ATP` here):

```bash
grep "^HETATM" structure.pdb | grep " ATP " > ligand.pdb
```

Verified end to end on a second protein: an 8,540-atom ATP-binding structure
with ATP as the reference. Open Babel recovered ATP's full structure and
stereochemistry from its 3D coordinates, the critics rejected ATP itself
(6 stereocentres, ~17 steps), and the designer came back with achiral
pyrazolo[3,4-d]pyrimidine adenine mimics at −9.74 kcal/mol, ~8 steps,
a straightforward route. **0/1 → 3/3.** No code changed between the two proteins.

Targets live in `loop/targets/<slug>/` — prepared receptor, cache, poses and
`target.json`. Switch between them with the dropdown. Each keeps its own
docking cache, so scores never leak between proteins.

Terminal equivalents, if you prefer:

```bash
python3 orchestrator.py --warm-start    # the loop
python3 eval_set.py                     # the confusion matrix
./demo.sh live                          # both, in order
```

---

## Verified result

Real Vina docking against `Receptor_MRP1.pdbqt`, real Claude designer:

| round | source | manufacturable | best affinity |
|-------|--------|---------------|---------------|
| 1 | your generative pool | **0/3** | −12.90 kcal/mol, ~18 steps, specialist route |
| 2 | designer, after feedback | **3/3** | −10.82 kcal/mol, ~6 steps, straightforward |

Converged in 2 rounds, 88 s. The round-2 molecule still beats the reference
MRP1 inhibitor MK-571 (−9.1 kcal/mol) on a far shorter route.

**The one-sentence finding:** in your own data, docking score and
manufacturability are *anti-correlated*. The three best-docking molecules in
`runs.db` are the three the critics reject.

### Critic accuracy

| tier | set | accuracy |
|------|-----|----------|
| 1 | classic drugs vs natural products | 23/23 = 100% |
| 2 | **hard**: complex marketed drugs vs plausible-looking rejects | 7/11 = 64% |
| | combined | 30/34 = 88% |

Say tier 1 out loud *and* say why it isn't impressive: aspirin-likes versus
fermentation-derived macrolides separate on molecular weight alone. **Tier 2
is the honest number**, and `eval_set.py` prints all misses by name.

Operating point (`CRITIC_POLICY=strict|lenient`) — does a `flag` count as
makeable?

| policy | hard accuracy | false passes | false rejects |
|--------|--------------|-------------|--------------|
| lenient | 64% | 3 | 1 |
| strict | 45% | **0** | 6 |

A false pass wastes a synthesis campaign; a false reject costs one idea, and
the designer makes ideas cheaply. That argues for `strict`. Being able to
*show the dial* is a better answer than any single accuracy number.

---

## Files

| file | owner | what it is |
|------|-------|-----------|
| `orchestrator.py` | CS | the loop, the feedback edge, terminal display |
| `designer_agent.py` | you | the agentified designer: tools, budget, run log |
| `critics.py` | **chem eng** | the rubric. Edit `RUBRIC` and `GROUP_ALERTS` |
| `eval_set.py` | clinical | ground truth, confusion matrix, operating point |
| `pipeline_adapter.py` | you | **the only seam** to `docking_pipeline.py` |
| `llm.py` | — | tool-calling client + scripted mock backend |
| `index.html` / `serve.py` | CS | the display. Plain HTML. Do not start a React app |

### The seam

`pipeline_adapter.py` is the only file that imports your pipeline. It wraps
`validate_smiles`, `calculate_properties`, `check_admet`, `smiles_to_pdbqt`
and `run_vina`. Change your pipeline, edit that file, nothing else breaks.

### The rubric

`critics.py` holds `RUBRIC` as a dict of
`criterion -> (flag_above, fail_above)`. Every rejection carries a
`criterion`, `value`, `threshold`, plain-language `reason` and an actionable
`suggest`. `python3 critics.py` prints the rubric table for the slide.

Chem eng: edit the numbers, not the code.

---

## Demo safety

Measured on this machine: **~12 s per dock** (1 s 3D embedding + 11 s Vina at
exhaustiveness 8). Three docks a round, so a live round is ~35 s.

| risk | lever |
|------|-------|
| wifi dies / no API key | `--mock` — scripted designer, loop still real |
| docking too slow on the day | `--cache-only` — instant, served from `dock_cache.json` |
| agent won't terminate | hard caps: `MAX_ROUNDS=3`, `MAX_TOOL_CALLS=18`, `MAX_DOCKS=4` |
| bad SMILES from the model | every tool exception is caught and returned to the model as text |
| model stops without submitting | one nudge, then bail and keep what was proposed |

Every live dock is written back into `dock_cache.json`, so **a rehearsal run
warms the cache for the real demo**. Rehearse with the real path, then run
`--cache-only` on stage if you're short on time, and say so — "poses
pre-computed for demo timing" is a fine thing to admit.

### Environment variables

| var | default | purpose |
|-----|---------|---------|
| `LLM_BACKEND` | `api` | `mock` for no-key operation |
| `DESIGNER_MODEL` | `claude-sonnet-5-5` | designer model |
| `DOCK_MODE` | `hybrid` | `cache` \| `live` \| `hybrid` |
| `MAX_ROUNDS` | `3` | loop cap |
| `MAX_DOCKS` | `4` | docks per round |
| `CRITIC_POLICY` | `lenient` | `strict` treats `flag` as reject |
| `MRP1_RECEPTOR` | `loop/Receptor_MRP1.pdbqt` | receptor path |

---

## The three questions you will get

**"Is the designer actually an agent or just a script?"**
Open the tool-call trace in the UI, or any round's `trace` in
`run_log.json`. The model chooses which molecules to propose, which to spend
its docking budget on, and when to stop. We wrote the tools and the budget,
not the decisions. Note it spent 3 of 4 docks and stopped on its own.

**"How do you know the critic is right?"**
`eval_set.py`: two tiers, 34 molecules, every miss named. And the operating
point table — the flag boundary is a dial you choose, and at `strict` there
are zero false passes.

**"What does scale-up assessment add over an SA score?"**
Chem eng answers this, not you. SA score is one of eight criteria.
It cannot tell you that a molecule needs a chiral resolution, that a
21-membered macrocycle needs a dedicated macrocyclisation, or that a
dithioester will not survive isolation. Point at the round-1 cards: the
rejections name `stereocentres`, `estimated_steps` and `heavy_atoms`
individually, and those names are what the designer acts on. An SA score of
4.26 tells the designer nothing it can fix.

---

## Known limitations — say these before a judge does

- `estimated_steps` is a heuristic from ring count, stereocentres and heavy
  atoms, not a retrosynthesis. It is labelled an estimate everywhere.
- **We do not cost molecules.** Pricing a route depends on the actual route,
  the scale and supplier quotes — it is the process chemist's call, not
  something to infer from a SMILES string. The tool reports how demanding a
  synthesis looks (`straightforward` / `moderate` / `demanding` /
  `specialist`) and stops there.
- Building-block availability is approximated by element and halogen-density
  checks, not a supplier-catalogue lookup. That is the obvious next step.
- Docking is rigid-receptor Vina on a single grid; scores rank, they do not
  predict affinity.
- The critics are deterministic rules, not an LLM. That is a deliberate
  choice — it makes them reproducible and auditable on a slide.
