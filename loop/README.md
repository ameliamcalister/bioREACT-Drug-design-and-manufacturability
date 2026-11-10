# The design and manufacturability service

Everything that needs RDKit, Open Babel, AutoDock Vina or an API key lives
here. The interface in `bioreact-app/` holds no chemistry: it reads this
service's JSON and draws it. Start both with `./start.sh` from the
repository root — this document is for working on the service itself.

```
                      ┌─────────────────────────────────┐
  designer_agent.py ──┤ seed_scaffolds                  │
    (Claude + tools)  │ binding_site_gaps  ← pocket.py  │
         │            │ known_binders      ← chembl.py  │
         │            │ properties / property_screen    │
         │            │ dock               ← pipeline_adapter.py
         │            │ propose / submit                │
         │            └─────────────────────────────────┘
         ▼
     candidates ──▶ critics.py ──▶ rejections ──┐
                    (two critics, one rubric)   │
         ▲                                      │
         └──────── orchestrator.py ◀────────────┘
                        │  the feedback edge
                        ▼
                   shortlist ──▶ manufacture_agent.py
                                   (one agent per candidate)
                                        │ tools only
                                        ▼
                                  manufacture.py
                           route · cost at scale · time
```

## Run it from the command line

```bash
python3 doctor.py                       # check the machine, with fixes
python3 serve.py                        # the JSON API on :8000

python3 orchestrator.py --warm-start    # the loop
python3 manufacture_agent.py --scale 1000
python3 eval_set.py                     # the critics' confusion matrix
python3 export_run.py                   # the whole run as one JSON file
python3 -m pytest                       # 51 tests, no network, no API key
```

Most modules also run alone and print something useful:

```bash
python3 critics.py                      # the rubric table and three examples
python3 manufacture.py                  # cost and time for three molecules
python3 admet.py                        # the property screen on three molecules
python3 pocket.py "<smiles>"            # unoccupied space beside a pose
python3 chembl.py MRP1                  # published binders of a target
python3 pipeline_adapter.py             # what chemistry and target are in use
```

## The modules

| file | what it owns |
|------|--------------|
| `orchestrator.py` | the loop: rounds, the feedback edge, termination |
| `designer_agent.py` | the designer's tool surface, budget and run log |
| `critics.py` | **the rubric.** Both critics, every threshold, every suggestion |
| `pocket.py` | unoccupied cavity space from a receptor and a docked pose |
| `admet.py` | Lipinski, Veber, Ghose, Egan, QED, PAINS and Brenk |
| `chembl.py` | ChEMBL target search, published binders, analogues, offline cache |
| `manufacture.py` | **the cost, route and time model.** All assumptions in `ASSUMPTIONS` |
| `manufacture_agent.py` | the manufacturability agents; tools own every number |
| `compare.py` | the decision table and its CSV |
| `eval_set.py` | ground truth for the critics and the confusion matrix |
| `pipeline_adapter.py` | the only seam to the chemistry functions |
| `chemistry.py` | those functions, vendored so a clone runs standalone |
| `poses.py` | PDBQT → PDB for the viewer, and pose lookup |
| `target.py` | preparing and switching target proteins |
| `serve.py` | the HTTP API |
| `llm.py` | a minimal tool-calling client, plus a scripted offline backend |

## The two things most worth editing

**The rubric, in `critics.py`.** `RUBRIC` maps each criterion to
`(flag_above, fail_above)`. Above the flag threshold a candidate proceeds
with a caveat; above the fail threshold it is rejected and the designer is
told which criterion to fix. Every rejection carries the criterion, the
measured value, the threshold and an actionable `suggest` line — that last
field is what the designer acts on, so it has to name a structural change,
never "make it simpler". `python3 critics.py` prints the table.

**The cost assumptions, in `manufacture.py`.** `ASSUMPTIONS` holds every
factor with its unit, a plausible range, a provenance tag and a note
explaining what it is. Nothing else in the file contains a number. The
interface renders this table and lets a reader override any entry, which is
the only responsible way to present a model that has not been calibrated
against real process data.

Both are deliberately boring data structures rather than code, so a chemist
can change the science without touching the plumbing.

## How the agents are kept honest

The designer and the manufacturability agents are both given tools and a
budget, and both are constrained by what the tools accept rather than by
prompt wording:

- The designer is asked once to look at `binding_site_gaps` before it
  proposes anything, so candidates are grown into the empty parts of the
  cavity rather than made larger at random.
- A manufacturability agent cannot submit a route it has not costed and
  timed: the submission tool reads the figures out of its own tool results
  and refuses otherwise. A number stated in prose never reaches the report.
- Every tool exception is caught and returned to the model as text, so a
  malformed SMILES produces a retry rather than a crash.
- Hard caps on tool calls and docking runs mean a round always terminates.
- Without an API key, both fall back to deterministic behaviour that is
  labelled as such in the interface — never silently.

## Environment variables

| variable | default | purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | — | read from the shell or from `loop/.env` |
| `LLM_BACKEND` | `api` | `mock` runs the scripted designer, no key needed |
| `DESIGNER_MODEL` | `claude-sonnet-5-5` | the designer |
| `MANUFACTURE_MODEL` | same as the designer | the manufacturability agents |
| `DOCK_MODE` | `hybrid` | `cache` never shells out to Vina; `live` always does |
| `VINA_EXHAUSTIVENESS` | `8` | Vina's search effort |
| `MAX_ROUNDS` | `3` | loop cap |
| `MAX_TOOL_CALLS` | `24` | designer tool budget per round |
| `MAX_DOCKS` | `4` | docking runs per round |
| `AFFINITY_TARGET` | `-9.0` | what counts as good enough binding |
| `CRITIC_POLICY` | `lenient` | `strict` treats a flag as a rejection in the evaluation |
| `VINA_PATH`, `OBABEL_PATH` | found on `PATH` | if they live somewhere unusual |
| `DOCKING_PROJECT` | — | use a checkout of the larger pipeline instead of `chemistry.py` |
| `DESIGN_PORT` | `8000` | the API port |

## Targets

Each target lives in `targets/<slug>/` with its prepared receptor, docking
cache, saved poses, ChEMBL cache and `target.json`. Caches are per target,
so docking scores never leak between proteins. `target.json` at the top of
`loop/` records which one is active.

The MRP1 target is committed, including the poses behind the offline demo
(about 600 KB in total), so a clone can run the whole loop with no docking
software and no API key. Pose paths inside a cache are stored relative to
`loop/`, which is what makes that work on a machine other than the one that
docked them.

## Performance

On an M-series laptop: about 1 s to embed a molecule in 3D, 11 s for Vina
at exhaustiveness 8, so roughly 35 s for a live round of three candidates.
The cavity analysis takes about 2 s per pose and is cached per molecule
within a round. A manufacturability agent takes about 10 s per candidate.
