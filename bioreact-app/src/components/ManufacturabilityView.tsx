/**
 * ManufacturabilityView.tsx — route, cost at scale, and time to
 * manufacture, per shortlisted candidate.
 *
 * One agent runs per molecule. It chooses the production route and defends
 * the choice; every figure it reports comes from a deterministic tool it
 * was required to call, so the interface can show the cost arithmetic in
 * full and let the reader move any assumption and watch the number move.
 * That is the only honest way to present an uncalibrated estimate.
 */
import { useMemo, useState } from 'react';
import {
  Beaker,
  ChevronDown,
  ChevronRight,
  Clock,
  CircleDollarSign,
  Factory,
  Play,
  RotateCcw,
  Sprout,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { sourceMode } from '../api';
import { DemoNotice } from './DemoBanner';
import type {
  Assumption,
  ManufactureReport,
  Manufacturability,
  RouteKey,
  Status,
} from '../types';
import { StructureImage, SmilesText } from './StructureImage';
import {
  BandValue,
  Button,
  Caveat,
  Cell,
  Chip,
  Empty,
  ErrorText,
  Estimate,
  Field,
  NumberInput,
  Note,
  Panel,
  Select,
  Spinner,
  Stat,
  Table,
  Toggle,
  money,
  weeksText,
} from './ui';

const ROUTE_ICON: Record<RouteKey, typeof Factory> = {
  chemical_synthesis: Factory,
  chemo_enzymatic: Beaker,
  fermentation: Sprout,
  spps: Beaker,
};

const FIT_TONE = {
  recommended: 'pass',
  viable: 'info',
  poor: 'fail',
} as const;

export function ManufacturabilityView({
  report,
  status,
  scaleOptions,
  onRun,
  onStop,
  busy,
}: {
  report: ManufactureReport | null;
  status: Status | null;
  scaleOptions: { grams: number; label: string; purpose: string }[];
  onRun: (options: {
    scale_g: number;
    rules_only: boolean;
    overrides: Record<string, number>;
  }) => Promise<void>;
  onStop: () => Promise<void>;
  busy: boolean;
}) {
  const [scale, setScale] = useState<number>(1000);
  const [rulesOnly, setRulesOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const demo = sourceMode() === 'demo';
  const running = status?.manufacture.running ?? false;
  const candidates = report?.candidates ?? [];
  const assumptions = report?.assumptions ?? [];

  const act = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const scaleHelp =
    scaleOptions.find((option) => option.grams === scale)?.purpose ?? 'a development campaign';

  return (
    <div className="space-y-5">
      <Panel
        title="Assess the shortlist"
        help={
          <>
            For every candidate the critics did not reject, an agent works out how it would be
            produced, what a gram would cost at the quantity you need, and how long the first
            delivery would take. The agent chooses the route; the arithmetic is deterministic and
            shown in full below.
          </>
        }
        aside={
          running ? (
            <Spinner
              label={
                report?.progress
                  ? `${report.progress.done}/${report.progress.total} assessed`
                  : status?.manufacture.label
              }
            />
          ) : (
            <Chip tone="neutral">idle</Chip>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Quantity needed" help={scaleHelp}>
              <Select
                value={String(scale)}
                disabled={running}
                onChange={(value) => setScale(Number(value))}
                options={scaleOptions.map((option) => ({
                  value: String(option.grams),
                  label: `${option.label} — ${option.purpose}`,
                }))}
              />
            </Field>
            <div className="sm:col-span-2 flex items-end">
              <Toggle
                checked={rulesOnly}
                onChange={setRulesOnly}
                label="Rules only, no agent"
                help="Skips the language model entirely: the route is chosen by the same decision rules, and every number is identical. Use it to see what the agent adds."
              />
            </div>
            <div className="flex items-end gap-2">
              {running ? (
                <Button
                  tone="danger"
                  icon={<Square className="h-3.5 w-3.5" />}
                  onClick={() => act(onStop)}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  tone="primary"
                  icon={<Play className="h-3.5 w-3.5" />}
                  disabled={busy || demo}
                  onClick={() => act(() => onRun({ scale_g: scale, rules_only: rulesOnly, overrides }))}
                  hint={demo ? 'not available in the demo' : 'about ten seconds a candidate'}
                >
                  Estimate cost and time
                </Button>
              )}
            </div>
          </div>

          {demo && <DemoNotice action="Re-costing the shortlist" />}
          {!demo && !rulesOnly && !status?.backend.api_key_set && (
            <ErrorText>
              No <code>ANTHROPIC_API_KEY</code> is set, so the agents cannot run. The rules-only
              mode produces the same figures without one.
            </ErrorText>
          )}
          {error && <ErrorText>{error}</ErrorText>}

          {report && !running && candidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
              <span>
                {candidates.length} candidate{candidates.length === 1 ? '' : 's'} at{' '}
                <span className="font-mono text-ink-2">{report.scale_label}</span>
              </span>
              <span>
                mode{' '}
                <span className="font-mono text-ink-2">
                  {report.mode === 'agent' ? `agents · ${report.model}` : 'deterministic rules'}
                </span>
              </span>
              <span>
                took <span className="font-mono text-ink-2">{report.elapsed_s} s</span>
              </span>
            </div>
          )}
        </div>
      </Panel>

      {candidates.length === 0 && !running && (
        <Empty>
          Nothing has been costed yet. Run the design loop first, then press{' '}
          <strong>Estimate cost and time</strong> — the shortlist is taken from the candidates the
          critics cleared.
        </Empty>
      )}

      {candidates.length > 0 && (
        <SideBySide candidates={candidates} scaleLabel={report?.scale_label ?? ''} />
      )}

      {candidates.map((candidate) => (
        <CandidateAssessment key={candidate.smiles} assessment={candidate} />
      ))}

      {assumptions.length > 0 && (
        <AssumptionsPanel
          assumptions={assumptions}
          overrides={overrides}
          disabled={running}
          onChange={setOverrides}
          onApply={() =>
            act(() => onRun({ scale_g: scale, rules_only: rulesOnly, overrides }))
          }
        />
      )}

      {report?.method && <Note>{report.method}</Note>}
    </div>
  );
}

// ─── the comparison the whole project exists to produce ──────────────────
function SideBySide({
  candidates,
  scaleLabel,
}: {
  candidates: Manufacturability[];
  scaleLabel: string;
}) {
  return (
    <Panel
      title={`Side by side at ${scaleLabel}`}
      help="Cheapest makeable candidate first. A molecule with no viable route sorts last however well it binds, because it cannot be advanced as drawn."
    >
      <Table
        head={[
          '#',
          'structure',
          'critics',
          'binding',
          'route',
          `cost per gram`,
          'time to first delivery',
          'one-off development',
        ]}
      >
        {candidates.map((candidate) => (
          <tr key={candidate.smiles} className="align-top">
            <Cell numeric>{candidate.rank}</Cell>
            <Cell className="w-[124px]">
              <div className="structure-stage p-1">
                <StructureImage smiles={candidate.smiles} width={112} height={72} />
              </div>
            </Cell>
            <Cell>
              <Chip
                tone={
                  candidate.critic_verdict === 'pass'
                    ? 'pass'
                    : candidate.critic_verdict === 'flag'
                      ? 'flag'
                      : 'fail'
                }
              >
                {candidate.critic_verdict}
              </Chip>
              {candidate.verdict === 'redesign_required' && (
                <div className="mt-1">
                  <Chip tone="fail">redesign</Chip>
                </div>
              )}
            </Cell>
            <Cell numeric>
              {candidate.affinity === null || candidate.affinity === undefined
                ? '—'
                : candidate.affinity.toFixed(2)}
            </Cell>
            <Cell>
              <div className="text-xs font-medium text-ink">{candidate.route_label}</div>
              <div className="text-[11px] text-ink-3">
                ~{candidate.estimated_steps} steps · {candidate.route_complexity}
              </div>
            </Cell>
            <Cell numeric>
              <BandValue band={candidate.cost.cost_per_gram_usd} prefix="$" />
            </Cell>
            <Cell numeric>{weeksText(candidate.time.total_weeks)}</Cell>
            <Cell numeric>
              {candidate.cost.one_off_development_usd
                ? money(candidate.cost.one_off_development_usd)
                : '—'}
            </Cell>
          </tr>
        ))}
      </Table>
      <div className="mt-3">
        <Estimate>
          Ranges are the model’s point estimate divided and multiplied by its stated uncertainty
          factor. Costs assume a one-off early-phase campaign, not commercial production.
        </Estimate>
      </div>
    </Panel>
  );
}

// ─── one candidate in full ───────────────────────────────────────────────
function CandidateAssessment({ assessment }: { assessment: Manufacturability }) {
  const Icon = ROUTE_ICON[assessment.route] ?? Factory;
  const redesign = assessment.verdict === 'redesign_required';

  return (
    <Panel
      tone={redesign ? 'warning' : 'default'}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-ink-3">#{assessment.rank}</span>
          <Icon className="h-4 w-4 text-ink-3" />
          {assessment.route_label}
          {redesign && <Chip tone="fail">no viable route as drawn</Chip>}
          <Chip tone={assessment.mode === 'agent' ? 'accent' : 'neutral'}>
            {assessment.mode === 'agent' ? 'agent' : 'rules'}
          </Chip>
        </span>
      }
      help={assessment.agent.headline}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="structure-stage p-2">
              <StructureImage smiles={assessment.smiles} width={200} height={130} />
            </div>
            <SmilesText smiles={assessment.smiles} />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat
                label="Cost per gram"
                value={<BandValue band={assessment.cost.cost_per_gram_usd} prefix="$" />}
                basis={`at ${assessment.scale_label}`}
              />
              <Stat
                label="Batch total"
                value={<BandValue band={assessment.cost.batch_total_usd} prefix="$" />}
                basis={`${assessment.scale_g.toLocaleString()} g`}
              />
              <Stat
                label="First delivery"
                value={weeksText(assessment.time.total_weeks)}
                basis="development plus campaign"
              />
              <Stat
                label="Binding"
                value={
                  assessment.affinity === null || assessment.affinity === undefined
                    ? '—'
                    : assessment.affinity.toFixed(2)
                }
                unit="kcal/mol"
                basis="AutoDock Vina, ranks only"
              />
            </div>

            {redesign && <Caveat>{assessment.verdict_note}</Caveat>}
            {assessment.cost.viability_note && !redesign && (
              <Caveat>{assessment.cost.viability_note}</Caveat>
            )}

            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Why this route
              </h3>
              {assessment.mode === 'agent' ? (
                <p className="mt-1 text-sm leading-relaxed text-ink">
                  {assessment.agent.justification}
                </p>
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-ink-2">
                  No agent ran for this candidate, so the route came from the decision rules
                  alone. The figures are identical either way — an agent changes the reasoning,
                  never the arithmetic.
                </p>
              )}
              {assessment.route_reasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {assessment.route_reasons.map((reason, index) => (
                    <li key={index} className="flex gap-2 text-xs leading-relaxed text-ink-2">
                      <span className="text-ink-3">·</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {assessment.enzymes.length > 0 && (
              <div className="rounded-md border border-pass/40 bg-pass-soft p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-pass">
                  Enzyme classes this structure suits
                </h3>
                <ul className="mt-1.5 space-y-1.5">
                  {assessment.enzymes.map((enzyme) => (
                    <li key={enzyme.key} className="text-xs leading-relaxed text-ink">
                      <span className="font-medium">{enzyme.enzyme}</span> — {enzyme.why}.{' '}
                      <span className="text-pass">Replaces: {enzyme.replaces}.</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-relaxed text-pass">
                  Matched from substructure: this says the chemistry is plausible, not that an
                  enzyme accepts this substrate. Screening a panel is the first experiment.
                </p>
              </div>
            )}

            {assessment.agent.risks.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  What could go wrong
                </h3>
                <ul className="mt-1.5 space-y-1.5">
                  {assessment.agent.risks.map((risk, index) => (
                    <li key={index} className="flex gap-2 text-xs leading-relaxed text-ink-2">
                      <span className="text-flag">▲</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CostBreakdown assessment={assessment} />
          <Timeline assessment={assessment} />
        </div>

        {assessment.alternatives.length > 0 && (
          <AlternativeRoutes assessment={assessment} />
        )}

        {assessment.trace.length > 0 && <AgentTrace assessment={assessment} />}

        {assessment.agent_error && (
          <Note>
            The agent did not finish ({assessment.agent_error}), so this is the deterministic
            rule-based assessment. The figures are the same ones the agent would have been given.
          </Note>
        )}
      </div>
    </Panel>
  );
}

function CostBreakdown({ assessment }: { assessment: Manufacturability }) {
  const cost = assessment.cost;
  const total = cost.breakdown.reduce((sum, item) => sum + item.usd_per_gram, 0) || 1;

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <CircleDollarSign className="h-3.5 w-3.5" />
        Where the cost comes from
      </h3>

      <div className="mt-3 space-y-2">
        {cost.breakdown.map((item) => (
          <div key={item.item}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink">{item.item}</span>
              <span className="font-mono tabular-nums text-ink">
                {money(item.usd_per_gram)}/g
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-ink-2"
                style={{ width: `${Math.max(2, (item.usd_per_gram / total) * 100)}%` }}
              />
            </div>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">{item.basis}</p>
          </div>
        ))}
      </div>

      {cost.premiums.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Premiums this structure forces
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {cost.premiums.map((premium) => (
              <li key={premium.label} className="text-xs leading-relaxed text-ink-2">
                <span className="font-mono tabular-nums text-ink">
                  ×{premium.factor.toFixed(2)}
                </span>{' '}
                <span className="font-medium">{premium.label}</span> — {premium.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2 text-[11px]">
        {cost.steps !== undefined && (
          <Figure label="steps" value={`~${cost.steps}`} />
        )}
        {cost.overall_yield !== undefined && (
          <Figure label="overall yield" value={`${(cost.overall_yield * 100).toFixed(1)}%`} />
        )}
        {cost.pmi_kg_per_kg !== undefined && (
          <Figure label="PMI" value={`${cost.pmi_kg_per_kg.toFixed(0)} kg/kg`} />
        )}
        {cost.titre_g_per_l !== undefined && (
          <Figure label="titre" value={`${cost.titre_g_per_l} g/L`} />
        )}
        {cost.isolated_per_batch_g !== undefined && (
          <Figure label="per batch" value={`${cost.isolated_per_batch_g} g`} />
        )}
        {cost.batches !== undefined && <Figure label="batches" value={cost.batches} />}
      </dl>

      {cost.one_off_development_usd > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-2">
          Plus <span className="font-mono">{money(cost.one_off_development_usd)}</span> of one-off
          development, paid before the first gram and not included in the per-gram figure.
        </p>
      )}

      <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-ink-3">{cost.method}</p>
    </div>
  );
}

function Timeline({ assessment }: { assessment: Manufacturability }) {
  const phases = assessment.time.phases;
  const longest = Math.max(...phases.map((phase) => phase.weeks), 1);

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <Clock className="h-3.5 w-3.5" />
        Time to the first delivery
      </h3>

      <div className="mt-3 space-y-3">
        {phases.map((phase) => (
          <div key={phase.phase}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink">{phase.phase}</span>
              <span className="font-mono tabular-nums text-ink">
                {phase.weeks.toFixed(0)} wk
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(2, (phase.weeks / longest) * 100)}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-3">{phase.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2 text-xs">
        <span className="font-medium text-ink">Total</span>
        <span className="font-mono tabular-nums text-ink">
          {weeksText(assessment.time.total_weeks)} ·{' '}
          <BandValue band={assessment.time.total_months} digits={1} unit="months" />
        </span>
      </div>
      <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-ink-3">
        {assessment.time.method}
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </dt>
      <dd className="truncate font-mono tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function AlternativeRoutes({ assessment }: { assessment: Manufacturability }) {
  const [open, setOpen] = useState(false);
  const optionsByRoute = new Map(assessment.route_options.map((option) => [option.route, option]));

  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2 hover:bg-surface-2"
      >
        <span className="inline-flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          The routes that were not chosen ({assessment.alternatives.length})
        </span>
        <span className="font-normal normal-case text-ink-3">
          costed the same way, for comparison
        </span>
      </button>
      {open && (
        <div className="border-t border-line p-3">
          <Table head={['route', 'fit', 'cost per gram', 'first delivery', 'development', 'why not']}>
            {assessment.alternatives.map((alternative) => {
              const option = optionsByRoute.get(alternative.route);
              return (
                <tr key={alternative.route} className="align-top">
                  <Cell>{alternative.label}</Cell>
                  <Cell>
                    <Chip tone={FIT_TONE[alternative.fit as keyof typeof FIT_TONE] ?? 'neutral'}>
                      {alternative.fit}
                    </Chip>
                  </Cell>
                  <Cell numeric>
                    <BandValue band={alternative.cost_per_gram_usd} prefix="$" />
                  </Cell>
                  <Cell numeric>{weeksText(alternative.total_weeks)}</Cell>
                  <Cell numeric>
                    {alternative.one_off_development_usd
                      ? money(alternative.one_off_development_usd)
                      : '—'}
                  </Cell>
                  <Cell>
                    <ul className="space-y-1 text-xs leading-relaxed text-ink-2">
                      {(option?.caveats ?? []).slice(0, 2).map((caveat, index) => (
                        <li key={index}>{caveat}</li>
                      ))}
                    </ul>
                  </Cell>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </div>
  );
}

function AgentTrace({ assessment }: { assessment: Manufacturability }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2 hover:bg-surface-2"
      >
        <span className="inline-flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          What the agent did ({assessment.trace.length} tool calls)
        </span>
        <span className="font-normal normal-case text-ink-3">
          every figure above came from one of these
        </span>
      </button>
      {open && (
        <div className="border-t border-line">
          {assessment.trace.map((event, index) => (
            <div
              key={index}
              className="flex gap-3 border-b border-line px-3 py-1.5 font-mono text-[11px] last:border-0"
            >
              <span className="w-10 shrink-0 text-right text-ink-3">{event.t}s</span>
              <span className="w-40 shrink-0 text-accent">{event.tool}</span>
              <span className={`min-w-0 flex-1 ${event.ok ? 'text-ink-2' : 'text-fail'}`}>
                {event.summary}
              </span>
            </div>
          ))}
          <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-3">
            The agent cannot report a number it did not obtain from a tool: the submission is
            rejected if it names a route it never costed.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── assumptions ─────────────────────────────────────────────────────────
export function AssumptionsPanel({
  assumptions,
  overrides,
  disabled,
  onChange,
  onApply,
}: {
  assumptions: Assumption[];
  overrides: Record<string, number>;
  disabled?: boolean;
  onChange: (overrides: Record<string, number>) => void;
  onApply: () => void;
}) {
  const [open, setOpen] = useState(false);
  const changed = useMemo(() => Object.keys(overrides).length > 0, [overrides]);

  const grouped = useMemo(() => {
    const groups: Record<string, Assumption[]> = {
      'Route and yield': [],
      'Cost factors': [],
      'Biocatalysis and fermentation': [],
      'Reporting': [],
    };
    for (const assumption of assumptions) {
      if (/enzyme|fermentation|titre|strain|downstream|fermenter|biocatalysis/.test(assumption.key)) {
        groups['Biocatalysis and fermentation'].push(assumption);
      } else if (/uncertainty|release/.test(assumption.key)) {
        groups.Reporting.push(assumption);
      } else if (/cost|premium|day|batch_size|procurement/.test(assumption.key)) {
        groups['Cost factors'].push(assumption);
      } else {
        groups['Route and yield'].push(assumption);
      }
    }
    return groups;
  }, [assumptions]);

  return (
    <Panel
      title="Every assumption behind these numbers"
      help="The model has no calibration against real process data, so the only responsible way to show it is to let you move each factor and watch the figures move. Change anything and re-estimate."
      aside={
        <div className="flex items-center gap-2">
          {changed && (
            <Button
              tone="secondary"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => onChange({})}
            >
              Reset
            </Button>
          )}
          <Button
            tone={changed ? 'primary' : 'secondary'}
            disabled={disabled || sourceMode() === 'demo'}
            onClick={onApply}
            title={
              sourceMode() === 'demo'
                ? 'the demo cannot recompute; clone the repository to change these'
                : undefined
            }
          >
            Re-estimate
          </Button>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:underline"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open ? 'Hide' : 'Show'} the {assumptions.length} factors
      </button>

      {open && (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, items]) =>
            items.length === 0 ? null : (
              <div key={group}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  {group}
                </h3>
                <div className="space-y-2">
                  {items.map((assumption) => (
                    <div
                      key={assumption.key}
                      className="grid grid-cols-1 gap-2 rounded-md border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_150px]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs text-ink">
                            {assumption.key}
                          </code>
                          <Chip
                            tone={
                              assumption.provenance === 'rule of thumb'
                                ? 'info'
                                : assumption.provenance === 'convention'
                                  ? 'neutral'
                                  : 'flag'
                            }
                            title={
                              assumption.provenance === 'uncalibrated'
                                ? 'our estimate, not validated against process data'
                                : assumption.provenance === 'rule of thumb'
                                  ? 'typical of early-phase process chemistry'
                                  : 'a definition we chose, stated so it can be changed'
                            }
                          >
                            {assumption.provenance}
                          </Chip>
                          {overrides[assumption.key] !== undefined && (
                            <Chip tone="accent">changed</Chip>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ink-2">
                          {assumption.note}
                        </p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                          {assumption.unit} · plausible {assumption.min}–{assumption.max} ·
                          default {assumption.default}
                        </p>
                      </div>
                      <div className="sm:pt-1">
                        <NumberInput
                          value={overrides[assumption.key] ?? assumption.value}
                          min={assumption.min}
                          max={assumption.max}
                          step={(assumption.max - assumption.min) / 100}
                          disabled={disabled}
                          onChange={(value) => {
                            const next = { ...overrides };
                            if (value === assumption.default) delete next[assumption.key];
                            else next[assumption.key] = value;
                            onChange(next);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </Panel>
  );
}
