/**
 * App.tsx — the shell: one header, four screens, one source of state.
 *
 * The screens follow the question a researcher is actually working
 * through, in order:
 *
 *   Design loop        design, dock, judge, and feed the rejections back
 *   Binding site       where there is still room, and what to put there
 *   Manufacturability  how it would be made, what it costs, how long
 *   Decide             which one to make first
 *   Method             what every number means and what it is worth
 *
 * All the state lives here and is polled from the Python side, so every
 * screen shows the same run and nothing can drift out of step. Polling is
 * slow when nothing is running and quick while a job is.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, sourceMode } from './api';
import type {
  EvaluationResults,
  ManufactureReport,
  MethodDocument,
  RunLog,
  RunMode,
  Status,
  TargetSummary,
} from './types';
import { BindingSiteView } from './components/BindingSiteView';
import { DecisionView } from './components/DecisionView';
import { DesignLoopView } from './components/DesignLoopView';
import { ManufacturabilityView } from './components/ManufacturabilityView';
import { MethodView } from './components/MethodView';
import { DemoBanner } from './components/DemoBanner';
import { TargetPanel } from './components/TargetPanel';
import { ThemeControl } from './components/ThemeControl';
import { Chip, ErrorText, Spinner } from './components/ui';

type Screen = 'loop' | 'site' | 'manufacture' | 'decide' | 'method';

const SCREENS: { id: Screen; label: string; blurb: string }[] = [
  { id: 'loop', label: 'Design loop', blurb: 'design, dock, judge, repeat' },
  { id: 'site', label: 'Binding site', blurb: 'where there is still room' },
  {
    id: 'manufacture',
    label: 'Manufacturability',
    blurb: 'route, cost at scale, time',
  },
  { id: 'decide', label: 'Decide', blurb: 'which one to make first' },
  { id: 'method', label: 'Method', blurb: 'what every number means' },
];

const IDLE_POLL_MS = 4000;
const BUSY_POLL_MS = 1200;

export default function App() {
  const [screen, setScreen] = useState<Screen>('loop');
  const [status, setStatus] = useState<Status | null>(null);
  const [runLog, setRunLog] = useState<RunLog | null>(null);
  const [report, setReport] = useState<ManufactureReport | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResults | null>(null);
  const [method, setMethod] = useState<MethodDocument | null>(null);
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [activeTarget, setActiveTarget] = useState<TargetSummary | null>(null);
  const [selectedMolecule, setSelectedMolecule] = useState<string | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const loadTargets = useCallback(async () => {
    try {
      const result = await api.targets();
      setTargets(result.targets);
      setActiveTarget(result.active);
    } catch {
      /* the status poll reports the outage; no need to report it twice */
    }
  }, []);

  const loadMethod = useCallback(async () => {
    try {
      setMethod(await api.method());
    } catch {
      setMethod(null);
    }
  }, []);

  // One poll loop for everything, its interval set by whether a job is
  // running. Each file is allowed to be missing: a fresh checkout has no
  // run log and no report, and that is a legitimate state to render.
  const poll = useCallback(async () => {
    try {
      const nextStatus = await api.status();
      setStatus(nextStatus);
      setOffline(null);

      const [log, manufactureReport, evaluationResults] = await Promise.all([
        api.runLog().catch(() => null),
        api.manufactureReport().catch(() => null),
        api.evaluation().catch(() => null),
      ]);
      if (log) setRunLog(log);
      if (manufactureReport) setReport(manufactureReport);
      if (evaluationResults) setEvaluation(evaluationResults);
      return nextStatus.running;
    } catch (problem) {
      setOffline(
        problem instanceof ApiError
          ? problem.message
          : 'the design service is not responding',
      );
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const running = await poll();
      if (cancelled) return;
      timer.current = window.setTimeout(tick, running ? BUSY_POLL_MS : IDLE_POLL_MS);
    };

    tick();
    loadTargets();
    loadMethod();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poll, loadTargets, loadMethod]);

  const runLoop = async (options: { mode: RunMode; rounds: number; candidates: number }) => {
    setBusy(true);
    try {
      await api.runLoop(options);
      await poll();
    } finally {
      setBusy(false);
    }
  };

  const runManufacture = async (options: {
    scale_g: number;
    rules_only: boolean;
    overrides: Record<string, number>;
  }) => {
    setBusy(true);
    try {
      await api.runManufacture(options);
      await poll();
    } finally {
      setBusy(false);
    }
  };

  const runEvaluation = async () => {
    setBusy(true);
    try {
      await api.runEvaluation();
      await poll();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    await api.stop();
    await poll();
  };

  const inspect = (smiles: string) => {
    setSelectedMolecule(smiles);
    setScreen('site');
  };

  const demo = sourceMode() === 'demo';

  const scales = method?.scales ?? [
    { grams: 10, label: '10 g', purpose: 'in vivo pharmacology' },
    { grams: 100, label: '100 g', purpose: 'GLP toxicology batch' },
    { grams: 1000, label: '1 kg', purpose: 'first clinical supply' },
    { grams: 10000, label: '10 kg', purpose: 'Phase II campaign' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2.5">
          <button
            type="button"
            onClick={() => setScreen('loop')}
            className="group min-w-0 text-left"
            title="back to the design loop"
          >
            <span className="block text-[15px] font-bold leading-none tracking-[-0.02em] text-ink">
              bioREACT
            </span>
            <span className="mt-1 block text-[11px] leading-tight text-ink-3">
              Design a molecule that binds — and that someone can make.
            </span>
          </button>

          <nav
            aria-label="Sections"
            className="order-3 -mx-1 flex w-full gap-0.5 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:overflow-visible lg:px-0"
          >
            {SCREENS.map((item) => {
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={`${item.label} — ${item.blurb}`}
                  className={`relative shrink-0 rounded-[5px] px-2.5 py-1.5 text-left transition-colors ${
                    active ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span className="block text-[12.5px] font-semibold leading-tight">
                    {item.label}
                  </span>
                  <span className="block text-[10.5px] leading-tight text-ink-3">
                    {item.blurb}
                  </span>
                  {active && (
                    <span className="absolute inset-x-2.5 -bottom-[9px] hidden h-[2px] rounded-full bg-accent lg:block" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {activeTarget && (
              <span
                className="hidden items-center gap-1.5 font-mono text-[11px] text-ink-3 md:inline-flex"
                title={activeTarget.description || activeTarget.name}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {activeTarget.name}
              </span>
            )}
            {status?.running ? (
              <Spinner label={status.label || 'running'} />
            ) : (
              <Chip tone="neutral">idle</Chip>
            )}
            <ThemeControl />
          </div>
        </div>
      </header>

      {demo && <DemoBanner />}

      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 px-6 py-6">
        {offline && !demo && (
          <ErrorText>
            {offline}. The design service runs separately from this page — start both with{' '}
            <code>./start.sh</code> from the repository root, then reload. Nothing on these
            screens can be computed without it.
          </ErrorText>
        )}

        {(screen === 'loop' || screen === 'site') && (
          <TargetPanel
            targets={targets}
            active={activeTarget}
            disabled={status?.loop.running}
            onChanged={() => {
              loadTargets();
              loadMethod();
              poll();
            }}
          />
        )}

        {screen === 'loop' && (
          <DesignLoopView
            runLog={runLog}
            status={status}
            evaluation={evaluation}
            onOpenMethod={() => setScreen('method')}
            onInspect={inspect}
            onRun={runLoop}
            onEvaluate={runEvaluation}
            onStop={stop}
            busy={busy}
          />
        )}

        {screen === 'site' && (
          <BindingSiteView
            runLog={runLog}
            target={activeTarget}
            selected={selectedMolecule}
            onSelect={setSelectedMolecule}
          />
        )}

        {screen === 'manufacture' && (
          <ManufacturabilityView
            report={report}
            status={status}
            scaleOptions={scales}
            onRun={runManufacture}
            onStop={stop}
            busy={busy}
          />
        )}

        {screen === 'decide' && (
          <DecisionView runLog={runLog} report={report} onInspect={inspect} />
        )}

        {screen === 'method' && <MethodView method={method} />}
      </main>

      <footer className="border-t border-line bg-surface px-6 py-5">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 text-[11px] leading-relaxed text-ink-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-3xl">
            Docking ranks candidates and does not predict affinity; step counts, costs and
            timelines are modelled estimates from stated assumptions, not quotations. No synthesis
            or fermentation is ever carried out — every output is a proposal for a person to
            approve. See <strong>Method</strong> for the thresholds, the assumptions and the
            limitations.
          </p>
          <p className="font-mono shrink-0">
            AutoDock Vina · RDKit · Open Babel · ChEMBL
          </p>
        </div>
      </footer>
    </div>
  );
}
