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
import { api, ApiError } from './api';
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
import { TargetPanel } from './components/TargetPanel';
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

  const scales = method?.scales ?? [
    { grams: 10, label: '10 g', purpose: 'in vivo pharmacology' },
    { grams: 100, label: '100 g', purpose: 'GLP toxicology batch' },
    { grams: 1000, label: '1 kg', purpose: 'first clinical supply' },
    { grams: 10000, label: '10 kg', purpose: 'Phase II campaign' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-slate-900">bioREACT</h1>
            <p className="text-[11px] leading-tight text-slate-600">
              Design a molecule that binds — and that someone can actually make.
            </p>
          </div>

          <nav className="order-3 flex w-full flex-wrap gap-1 lg:order-none lg:w-auto">
            {SCREENS.map((item) => {
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  title={item.blurb}
                  className={`rounded-md px-3 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block font-semibold">{item.label}</span>
                  <span
                    className={`block text-[10.5px] ${active ? 'text-slate-300' : 'text-slate-500'}`}
                  >
                    {item.blurb}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {status?.running ? (
              <Spinner label={status.label || 'running'} />
            ) : (
              <Chip tone="neutral">idle</Chip>
            )}
            {activeTarget && (
              <span className="hidden font-mono text-[11px] text-slate-500 sm:inline">
                {activeTarget.name}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 px-6 py-6">
        {offline && (
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

      <footer className="border-t border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 text-[11px] leading-relaxed text-slate-500 sm:flex-row sm:items-start sm:justify-between">
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
