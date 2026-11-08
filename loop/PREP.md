# 5-minute presentation prep

Slides: https://claude.ai/artifact/HvVLQ4jtuDnSJNAW1h3KFb
(private — share from the page's Share menu if anyone else needs it)

Speaker notes are on every slide, in the deck.

---

## 1. What was built, in one paragraph

A closed-loop molecule design system for the MRP1 (ABCC1) efflux transporter. An
agentic designer (Claude, given tools rather than a script) proposes molecules;
two deterministic critics assess whether each can actually be manufactured —
first at all, then at kilogram scale; and the rejections are fed **back** to the
designer as structured data, naming the criterion, its value, the threshold it
broke, and a suggested fix. The designer redesigns against that feedback. The
whole thing runs in a browser UI over real AutoDock Vina docking, with the actual
pose files viewable in 3D, and ends in a decision table that says which molecule
to make.

## 2. Why — the argument in four steps

0. **Where it started.** We wanted a cancer drug. MRP1 is an efflux pump that
   cancer cells overexpress to throw chemotherapy back out, so blocking it makes
   the chemotherapy you already have work again. We built a tool that designs
   molecules straight into the binding cavity rather than screening a library.
   It worked — and handed us a molecule at −12.90 kcal/mol that needs 18 steps,
   4 stereocentres and a specialist route. We had optimised the wrong thing.
1. **Generative chemistry has a delivery problem.** It optimises a docking score.
   A docking score says nothing about whether a molecule can be made.
2. **This is not hypothetical, it is in our own data.** The three best-docking
   molecules in the generative pool are the three the critics reject — all on
   route length. Binding and manufacturability are *anti-correlated* here.
   The reference drug MK-571, which people genuinely manufacture, docks at
   −9.1 kcal/mol: worse than all three.
3. **A filter does not fix this.** A pipeline would discard the molecules and
   leave the designer generating the same kind of thing again. The feedback
   edge is what makes it a loop, and the loop is the contribution.
4. **The feedback has to be actionable.** "Too complex" is useless.
   `estimated_steps: 18, threshold: 14, shorten the linear sequence` is not.
   That is why the critics are rules with named criteria, not an LLM judge —
   and it is why they are reproducible and auditable.

## 3. The numbers you should be able to say without looking

| | |
|---|---|
| Round 1, generative pool | **0 / 3** manufacturable, best −12.90 kcal/mol, ~18 steps, specialist route |
| Round 2, after feedback | **3 / 3** manufacturable, best −11.63 kcal/mol, ~8 steps, straightforward, achiral |
| Convergence | 2 rounds, 88 s, agent spent 3 of its 4 docks and stopped itself |
| Reference | MK-571, −9.1 kcal/mol |
| Critic accuracy | 30/34 = 88% combined; **64% on the hard tier** — the honest number |
| Operating point | lenient: 64%, 3 false passes · strict: 45%, **0 false passes** |
| Rubric | 9 criteria; `estimated_steps` flags at 10, fails at 14 |

**The one sentence to land:** the top-docking molecule at −12.90 is still the
best binder, and the tool still says REDESIGN rather than MAKE.

## 4. Timing — 5 minutes, hard

| | time | slide |
|---|---|---|
| Hook — generative chemistry designs molecules nobody can make | 0:00–0:12 | Cover |
| Why this started: cancer drug → design into the cavity → unmakeable | 0:12–0:40 | Origin |
| It generalises: all three best binders fail, and MK-571 beats them | 0:40–1:05 | Problem |
| The loop and the feedback edge | 1:05–1:35 | Loop |
| Rules not a model; what the designer receives | 1:35–1:50 | Rubric |
| **Demo** | 1:50–3:20 | Demo |
| 0/3 → 3/3, and the REDESIGN row | 3:20–3:45 | Result |
| Critic accuracy, the dial, what it does not do | 3:45–4:00 | Honest |
| Buffer / questions | 4:00–5:00 | — |

You have ~2.5 minutes of actual talking. Do not read slides. The Loop slide is
the one worth spending time on; the Rubric slide is the one to cut if you are
behind.

**Do not tell the −12.90 story twice.** Origin uses it as the narrative — *our*
molecule, the one we were proud of, that no chemist could make. Problem then
generalises it: it was not bad luck, all three best binders fail the same way,
and the drug people actually manufacture docks worse than all of them. If you
find yourself repeating "18 steps" on the Problem slide, move straight to the
MK-571 line instead.

## 5. Demo script

Server is already running on port 8000 (PID was 25501). Check before you start:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/
```

If it is not running:

```bash
cd /Users/ameliamcalister/Downloads/UCLxGemini_hackathon/loop && python3 serve.py
```

Open **http://localhost:8000** — not the file, or every button fails silently.

Run `python3 doctor.py` once before you go on. It checked green on this machine:
Vina 1.2.7, Open Babel, RDKit 2025.09.6, receptor loaded, 34 cached poses, API key set.

**On stage:**

1. Point at the mode dropdown. Say which mode you are in and why — being open
   about `cache` is better than being caught by it.
2. Press **Run loop**. While round 1 docks, narrate: *"these are the three
   best-scoring molecules out of our generative pipeline."*
3. When the red rejection cards appear, stop and read one aloud — the criterion,
   the value, the threshold. This is the moment the whole pitch rests on.
4. *"Those exact strings go back to the designer."* Round 2 appears.
5. Scroll to the decision table. Point at a REDESIGN row: best binder, still not
   the one to make.
6. If there is time, open **View docked pose (3D)** and rotate it once. This is
   the proof it is real docking, not a mock-up. Ten seconds, no more.

**If it breaks:** switch the dropdown to `cache` (instant) or `mock` (no network),
say "pre-computed for timing", and carry on. Nobody minds. Rehearse once in
`live` first — every live dock warms `dock_cache.json`, so a rehearsal makes the
real run faster.

## 6. The three questions you will get

**"Is the designer actually an agent, or a script?"**
Open the tool-call trace in the UI, or `run_log.json`. The model chooses which
molecules to propose, which to spend its docking budget on, and when to stop.
We wrote the tools and the budget caps, not the decisions. It spent 3 of 4 docks
and stopped on its own.

**"How do you know the critic is right?"**
`eval_set.py` — 34 molecules, two tiers, every miss printed by name. And the
operating point table: the flag boundary is a dial, and at `strict` there are
zero false passes. Showing the dial is a better answer than any single accuracy.

**"What does this add over a synthetic accessibility score?"**
SA score is one of nine criteria, and it is a single number with no handle on it.
It cannot tell you a molecule needs a chiral resolution, or that a 21-membered
macrocycle needs a dedicated macrocyclisation step. An SA score of 4.26 tells the
designer nothing it can act on; `stereocentres: 4, threshold: 2` does.

**Possible fourth: "does it generalise beyond MRP1?"**
Yes — verified end to end on a second protein, an 8,540-atom ATP-binding
structure, with no code changed. 0/1 → 3/3 there too.

## 7. Say these before a judge does

- Step count is a heuristic from rings, stereocentres and heavy atoms — not a
  retrosynthesis. It is labelled an estimate everywhere.
- We deliberately do not cost molecules. That needs the real route and supplier
  quotes; it is the process chemist's call, not something to infer from a SMILES.
- Building-block availability is approximated by element and halogen checks, not
  a supplier catalogue lookup. That is the obvious next step.
- Docking is rigid-receptor Vina on a single grid. It ranks; it does not predict
  affinity.

---

## One thing to check before you present

`run_log.json` and `candidates.csv` disagree about round 2. The run log's best
round-2 molecule is **−9.78** kcal/mol; `candidates.csv` and the UI show
**−11.63** as MAKE FIRST. They are from different runs — the UI header said
"designer mock (scripted) · docking cache" when I looked.

The deck uses **−11.63**, matching what is currently on screen. Do a rehearsal
run in the mode you will actually present in, and if the number that comes up
differs, either change the Result slide or quote the fraction (0/3 → 3/3) and
the route length instead of the affinity. The fraction is the stronger claim
anyway, and it does not move.
