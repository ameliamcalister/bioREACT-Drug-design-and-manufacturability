# Handoff to bioREACT (the bioprocess app)

## The scientific point, first

Our candidates are **synthetic small molecules** (~400–500 Da). The
bioREACT simulator models **CHO mammalian cell culture**, which makes
biologics — antibodies and recombinant proteins.

**You cannot make a 409 Da sulfonamide in a CHO bioreactor.**

bioREACT already knows this. It has a `small_molecule_chemical` pathway and
refuses the bioreactor gate:

> *REFUSED BY bioREACT GATE: Candidate is a synthetic small molecule.
> Cannot approve CHO bioreactor gate for a non-biologic.*

That refusal is **the result, not a bug**. Two tools correctly declining to
chain is a stronger demo than a fake pipeline — it shows each side knows the
limits of its own model. The handoff therefore carries an explicit routing
decision rather than pretending the molecules go into a fermenter.

```
designer → critics → decision table
                           │
                           ▼
                  manufacturing_route
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
  small molecule                         biologic
  Route A: organic synthesis       Route B: CHO bioreactor
  (us)                             (bioREACT)
```

## What to do

Get the data:

```bash
curl http://localhost:8000/bioreact.json -o bioreact_handoff.json
```

or press **↓ Export for bioREACT** on the decision table.

It is built fresh on every request, so it always reflects the latest run.

## What it is

Exactly the `ClosedLoopRunDataset` shape already declared in
`src/data/dissertationDockingData.ts` — same field names, same nesting, so
it drops into `CLOSED_LOOP_DATASETS` without a converter:

```ts
import live from './bioreact_handoff.json';

export const CLOSED_LOOP_DATASETS = {
  ...existing,
  live: live as ClosedLoopRunDataset,
};
```

Every `DockedCandidateEntry` carries the fields bioREACT already reads
(`smiles`, `dock_affinity`, `overall_verdict`, `sa_score`, `stereocentres`,
`estimated_steps`, `mw`, `logp`, `tpsa`, `rejections`, `assessment`), plus
one addition:

```jsonc
"manufacturing": {
  "route": "chemical_synthesis",
  "route_label": "Route A — organic chemical synthesis",
  "cho_bioreactor_eligible": false,
  "route_reason": "409 Da synthetic small molecule. Produced by organic
                   synthesis, not mammalian cell culture — a CHO
                   bioreactor cannot express a non-biologic."
}
```

Read `cho_bioreactor_eligible` to drive the gate, and `route_reason` for the
refusal text, instead of hardcoding it.

## Two things that will trip you up

**`cost_band` is not a cost.** The field name is kept so the TypeScript type
still matches, but it holds a route-complexity rating —
`straightforward` / `moderate` / `demanding` / `specialist`. We deliberately
do not estimate price per gram: that depends on the real route, scale and
supplier quotes, and is the process chemist's call. `route_complexity` holds
the same value under a clearer name.

**Replace the hardcoded numbers.** bioREACT currently has
`Route A · MRP1 Small Molecule (−10.82 kcal/mol)` written into the UI, and
`412 Da`, `3-step Suzuki`, `SA = 2.34` in several panels. Those came from one
old run and are already out of date — the current best is a different
molecule. Read them from the handoff instead.

## If the export fails

`{"ok": false, "error": "no run yet"}` means the loop has not been run in
this session. Press **Run loop** first (mock mode is enough — it needs no
API key and no docking).
