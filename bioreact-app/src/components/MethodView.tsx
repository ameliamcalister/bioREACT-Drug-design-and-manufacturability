/**
 * MethodView.tsx — what every number means, and what it is worth.
 *
 * A tool that estimates cost and synthesisability has to be auditable or
 * it is worthless, so this screen is not an appendix: it carries the
 * critics' thresholds, the published rule sets with their citations, every
 * cost assumption with its provenance, how the cavity analysis works, and
 * a plain list of what the project cannot do. If a reader disagrees with a
 * number, this is where they find the one to change.
 */
import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { api } from '../api';
import type { ChemblActives, EvaluationResults, MethodDocument } from '../types';
import {
  Cell,
  Chip,
  ErrorText,
  Note,
  Panel,
  Table,
} from './ui';

export function MethodView({ method }: { method: MethodDocument | null }) {
  const [actives, setActives] = useState<ChemblActives | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResults | null>(null);

  useEffect(() => {
    api
      .chemblActives(6)
      .then(setActives)
      .catch(() => setActives(null));
    api
      .evaluation()
      .then(setEvaluation)
      .catch(() => setEvaluation(null));
  }, []);

  if (!method) {
    return <ErrorText>The design service is not reachable, so the method cannot be shown.</ErrorText>;
  }

  return (
    <div className="space-y-5">
      <Panel
        title="What this tool does, in order"
        help="Five stages. Each one can reject a candidate, and each rejection names the number it failed on."
      >
        <ol className="space-y-3">
          {[
            [
              'Design',
              'An agent starts from a small known binder and grows it into the unoccupied regions of the binding cavity, using the geometry below to decide where. Published binders of the same target come from ChEMBL as structural inspiration.',
            ],
            [
              'Dock and rank',
              `${method.docking.engine} places each candidate in the site and scores it. ${method.docking.note}`,
            ],
            [
              'Judge manufacturability',
              'Two deterministic critics — synthesisability and process chemistry — compare computed descriptors against the thresholds below. A rejection carries the criterion, the value, the threshold and the specific structural change that would fix it, and that goes straight back to the designer.',
            ],
            [
              'Screen properties',
              'Published rule sets over computed descriptors, plus structural alerts. This filters on physicochemistry; it does not predict what a molecule does in an animal.',
            ],
            [
              'Cost, route and time',
              'One agent per surviving candidate chooses a production route and defends it, calling deterministic tools for every figure: cost per gram at the scale you need, the enzyme classes the structure suits, and weeks to the first delivery.',
            ],
          ].map(([title, body], index) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-canvas">
                {index + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">{title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel
        title="The critics’ rubric"
        help={method.rubric_note}
        aside={
          <code className="font-mono text-[11px] text-ink-3">loop/critics.py</code>
        }
      >
        <Table head={['criterion', 'flag above', 'fail above']}>
          {method.rubric.map((rule) => (
            <tr key={rule.criterion}>
              <Cell>
                <code className="font-mono text-xs">{rule.criterion}</code>
              </Cell>
              <Cell numeric>{rule.flag_above}</Cell>
              <Cell numeric>{rule.fail_above}</Cell>
            </tr>
          ))}
        </Table>
      </Panel>

      {evaluation && <EvaluationPanel evaluation={evaluation} />}

      <Panel
        title="Property rule sets"
        help="Each of these is a published heuristic over computed descriptors. None is a trained model, and none predicts absorption, metabolism or toxicity."
      >
        <div className="space-y-3">
          {method.property_rule_sets.map((set) => (
            <div key={set.key} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold text-ink">{set.name}</h3>
                <span className="text-[11px] text-ink-3">{set.citation}</span>
                <Chip tone="neutral">{set.what_for}</Chip>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-2">
                {set.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-ink-3">
                {set.allowed_violations === 0
                  ? 'no violations allowed'
                  : `up to ${set.allowed_violations} violation allowed`}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Note>
            Structural alerts come from RDKit’s own filter catalogue: PAINS (Baell &amp; Holloway)
            and the Brenk set. Both lists are deliberately broad — several PAINS patterns match
            marketed drugs — so an alert is reported for a chemist to judge and never used on its
            own to reject a molecule.
          </Note>
        </div>
      </Panel>

      <Panel
        title="How the unoccupied space is found"
        help={method.pocket_method.note}
      >
        <dl className="grid grid-cols-2 gap-3 font-mono text-xs md:grid-cols-4">
          <Pair label="grid spacing" value={`${method.pocket_method.spacing_a} Å`} />
          <Pair label="clash distance" value={`${method.pocket_method.clash_a} Å`} />
          <Pair label="burial test" value={`${method.pocket_method.burial_axes} axes`} />
          <Pair
            label="smallest region"
            value={`${method.pocket_method.min_volume_a3} Å³`}
          />
        </dl>
      </Panel>

      <Panel
        title="Production routes considered"
        help="A route is proposed only when the structure supports it. Biocatalysis needs a matching motif; fermentation needs a scaffold that is plausibly biosynthetic."
      >
        <ul className="space-y-1.5 text-xs leading-relaxed text-ink-2">
          {Object.entries(method.routes).map(([key, label]) => (
            <li key={key}>
              <code className="font-mono text-[11px] text-ink-3">{key}</code> — {label}
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Enzyme classes matched from substructure
        </h3>
        <Table head={['enzyme', 'replaces', 'why it is proposed']}>
          {method.enzyme_classes.map((enzyme) => (
            <tr key={enzyme.key} className="align-top">
              <Cell>{enzyme.enzyme}</Cell>
              <Cell className="text-xs text-ink-2">{enzyme.replaces}</Cell>
              <Cell className="text-xs text-ink-2">{enzyme.why}</Cell>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel
        title="Cost and time assumptions"
        help="Every figure the agents report is built from these. Provenance says where each one came from: a rule of thumb from process chemistry, a definition we chose, or our own uncalibrated estimate."
      >
        <Table head={['factor', 'value', 'unit', 'plausible range', 'provenance', 'what it is']}>
          {method.assumptions.map((assumption) => (
            <tr key={assumption.key} className="align-top">
              <Cell>
                <code className="font-mono text-xs">{assumption.key}</code>
              </Cell>
              <Cell numeric>{assumption.value}</Cell>
              <Cell className="text-xs text-ink-2">{assumption.unit}</Cell>
              <Cell numeric className="text-ink-2">
                {assumption.min}–{assumption.max}
              </Cell>
              <Cell>
                <Chip
                  tone={
                    assumption.provenance === 'rule of thumb'
                      ? 'info'
                      : assumption.provenance === 'convention'
                        ? 'neutral'
                        : 'flag'
                  }
                >
                  {assumption.provenance}
                </Chip>
              </Cell>
              <Cell className="min-w-[280px] text-xs leading-relaxed text-ink-2">
                {assumption.note}
              </Cell>
            </tr>
          ))}
        </Table>
      </Panel>

      {actives?.ok && (actives.compounds?.length ?? 0) > 0 && (
        <Panel
          title="Published binders of this target"
          help="Retrieved from ChEMBL through its public API and used as design inspiration. Potency is as deposited; assays differ, so these are comparable only loosely."
          aside={
            <span className="text-[11px] text-ink-3">
              {actives.from_cache
                ? `from cache${actives.cached_at ? `, fetched ${actives.cached_at}` : ''}`
                : 'fetched live'}
            </span>
          }
        >
          <Table head={['compound', 'assay', 'potency', 'pChEMBL', 'structure']}>
            {(actives.compounds ?? []).map((compound) => (
              <tr key={compound.chembl_id + compound.pchembl} className="align-top">
                <Cell>
                  <a
                    href={`https://www.ebi.ac.uk/chembl/compound_report_card/${compound.chembl_id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
                  >
                    {compound.name}
                    <ExternalLink className="h-3 w-3 text-ink-3" />
                  </a>
                </Cell>
                <Cell className="text-xs text-ink-2">{compound.assay_type}</Cell>
                <Cell numeric>{formatPotency(compound.potency_nm)}</Cell>
                <Cell numeric>{compound.pchembl}</Cell>
                <Cell>
                  <code className="break-all font-mono text-[10.5px] text-ink-3">
                    {compound.smiles}
                  </code>
                </Cell>
              </tr>
            ))}
          </Table>
          <div className="mt-2">
            <Note>{actives.source}</Note>
          </div>
        </Panel>
      )}

      <Panel
        title="What this tool cannot do"
        help="Read this before quoting any number from it."
        tone="quiet"
      >
        <ul className="space-y-2">
          {method.limitations.map((limitation, index) => (
            <li key={index} className="flex gap-2 text-xs leading-relaxed text-ink-2">
              <span className="text-ink-3">—</span>
              <span>{limitation}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Software and data" tone="quiet">
        <ul className="space-y-1.5">
          {method.attribution.map((line, index) => (
            <li key={index} className="flex gap-2 text-xs leading-relaxed text-ink-2">
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * How often are the critics right? Measured against molecules whose
 * makeability is known, split into an easy tier and a deliberately hard
 * one. The easy tier is near-useless as evidence and the panel says so;
 * the hard tier, and the molecules it got wrong by name, are the honest
 * result.
 */
function EvaluationPanel({ evaluation }: { evaluation: EvaluationResults }) {
  const { easy, hard } = evaluation.tiers;
  const combined = evaluation.combined;

  const tiers = [
    {
      key: 'easy',
      tier: easy,
      label: 'Easy tier',
      what: 'marketed small-molecule drugs against natural products and fermentation-derived macrolides',
      caveat:
        'These two groups separate on molecular weight alone, so a perfect score here is not evidence of much.',
    },
    {
      key: 'hard',
      tier: hard,
      label: 'Hard tier',
      what: 'structurally complex marketed drugs against plausible-looking molecules that could not be made',
      caveat: 'This is the number worth quoting.',
    },
  ];

  return (
    <Panel
      title="How often are the critics right?"
      help="Measured against molecules whose makeability is known from how they are actually produced. Press “Check the critics” on the design loop screen to reproduce this."
      aside={
        <span className="font-mono text-xs text-ink-2">
          {combined.correct}/{combined.n} = {(combined.accuracy * 100).toFixed(0)}% overall
        </span>
      }
    >
      <div className="space-y-4">
        {tiers.map(({ key, tier, label, what, caveat }) => (
          <div key={key} className="rounded-md border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">{label}</h3>
              <span className="font-mono text-sm tabular-nums text-ink">
                {tier.tp + tier.tn}/{tier.n} = {(tier.accuracy * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{what}</p>
            <dl className="mt-2 grid grid-cols-4 gap-2 font-mono text-[11px]">
              <Pair label="correct pass" value={String(tier.tp)} />
              <Pair label="correct reject" value={String(tier.tn)} />
              <Pair label="false pass" value={String(tier.fp)} />
              <Pair label="false reject" value={String(tier.fn)} />
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{caveat}</p>
            {tier.misses.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  What it got wrong, by name
                </h4>
                <ul className="mt-1 space-y-1 text-xs leading-relaxed text-ink-2">
                  {tier.misses.map((miss) => (
                    <li key={miss.name}>
                      <span className="font-medium">{miss.name}</span> — the critics said{' '}
                      <Chip tone={miss.predicted ? 'pass' : 'fail'}>
                        {miss.predicted ? 'makeable' : 'not makeable'}
                      </Chip>{' '}
                      and it is {miss.truth ? 'made at scale' : 'not made this way'}
                      {miss.note ? `: ${miss.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <Note>
          A false pass sends an unmakeable molecule into a synthesis campaign; a false reject only
          costs one idea, and the designer can produce more ideas cheaply. That asymmetry is the
          argument for where the thresholds sit.
        </Note>
      </div>
    </Panel>
  );
}

/** Sub-nanomolar potencies read better in picomolar than as "0.01 nM". */
function formatPotency(nanomolar: number): string {
  if (!Number.isFinite(nanomolar)) return '—';
  if (nanomolar < 1) return `${(nanomolar * 1000).toPrecision(3)} pM`;
  if (nanomolar >= 1000) return `${(nanomolar / 1000).toPrecision(3)} µM`;
  return `${nanomolar.toPrecision(3)} nM`;
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
