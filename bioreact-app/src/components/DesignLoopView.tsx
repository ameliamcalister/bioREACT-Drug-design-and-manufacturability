/**
 * DesignLoopView.tsx — the loop itself: run controls, then one block per
 * round.
 *
 * A round block is laid out in the order the round happened, because the
 * feedback edge is the thing worth seeing: what came back from the critics,
 * what the designer changed in response, then the candidates it produced.
 * Without that ordering the page is just three lists of molecules.
 */
import { useState } from 'react';
import {
  ArrowDownToLine,
  CornerDownRight,
  Play,
  Square,
  Terminal,
} from 'lucide-react';
import { sourceMode } from '../api';
import { DemoNotice } from './DemoBanner';
import type {
  AssessedCandidate,
  EvaluationResults,
  Round,
  RunLog,
  RunMode,
  Status,
} from '../types';
import { CandidateCard } from './CandidateCard';
import {
  Button,
  Chip,
  Empty,
  ErrorText,
  Field,
  Grid,
  NumberInput,
  Note,
  Panel,
  Select,
  Spinner,
  Stat,
} from './ui';

const MODE_HELP: Record<RunMode, string> = {
  live: 'real designer, real docking — about 40 s a round',
  cache: 'real designer, poses taken from the cache — instant docking',
  mock: 'scripted designer and cached poses — no API key, works offline',
  fresh: 'real designer invents round 1 too, instead of starting from the generative pool',
};

const MODE_LABEL: Record<RunMode, string> = {
  live: 'live — design and dock for real',
  cache: 'cache — real design, cached poses',
  mock: 'offline demo — no key needed',
  fresh: 'fresh — designer starts round 1',
};

export function RunControls({
  status,
  evaluation,
  onRun,
  onEvaluate,
  onStop,
  onOpenMethod,
  busy,
}: {
  status: Status | null;
  evaluation?: EvaluationResults | null;
  onRun: (options: { mode: RunMode; rounds: number; candidates: number }) => Promise<void>;
  onEvaluate: () => Promise<void>;
  onStop: () => Promise<void>;
  onOpenMethod?: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<RunMode>('live');
  const [rounds, setRounds] = useState(3);
  const [candidates, setCandidates] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);

  const demo = sourceMode() === 'demo';
  const running = status?.loop.running ?? false;
  const backend = status?.backend;
  const canGoLive = Boolean(backend?.api_key_set);
  const canDock = Boolean(backend?.vina && backend?.obabel);

  const act = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  return (
    <Panel
      title="Run the design loop"
      help={
        <>
          The designer proposes molecules, docks them with AutoDock Vina, and two critics judge
          whether they could actually be made. Rejected candidates go back with the reason
          attached, and the designer tries again — that return path is the loop.
        </>
      }
      aside={
        running ? (
          <Spinner label={status?.loop.label || 'running'} />
        ) : (
          <Chip tone="neutral">idle</Chip>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Mode" help={MODE_HELP[mode]}>
            <Select
              value={mode}
              disabled={running}
              onChange={(value) => setMode(value as RunMode)}
              options={(['live', 'cache', 'mock', 'fresh'] as RunMode[]).map((value) => ({
                value,
                label: MODE_LABEL[value],
              }))}
            />
          </Field>
          <Field label="Rounds" help="hard cap, so the loop always terminates">
            <NumberInput
              value={rounds}
              min={1}
              max={6}
              disabled={running}
              onChange={setRounds}
            />
          </Field>
          <Field label="Candidates per round" help="how many molecules the designer submits">
            <NumberInput
              value={candidates}
              min={1}
              max={5}
              disabled={running}
              onChange={setCandidates}
            />
          </Field>
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
                onClick={() => act(() => onRun({ mode, rounds, candidates }))}
                hint={demo ? 'not available in the demo' : 'designs, docks and judges'}
              >
                Run loop
              </Button>
            )}
            <Button
              tone="secondary"
              disabled={running || busy || demo}
              onClick={() => act(onEvaluate)}
              hint="scores them against 34 molecules we know the answer for"
            >
              Check the critics
            </Button>
          </div>
        </div>

        {demo && <DemoNotice action="Running the loop" />}
        {!demo && mode === 'live' && !canGoLive && (
          <ErrorText>
            No <code>ANTHROPIC_API_KEY</code> is set, so the live designer cannot run. Put a key
            in <code>loop/.env</code>, or choose the offline demo mode — it uses docking results
            committed to this repository and needs nothing.
          </ErrorText>
        )}
        {!demo && (mode === 'live' || mode === 'fresh') && !canDock && (
          <ErrorText>
            AutoDock Vina or Open Babel was not found, so nothing can be docked for real. Run{' '}
            <code>python3 loop/doctor.py</code> for the exact fix, or use cached poses instead.
          </ErrorText>
        )}
        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
          {evaluation && (
            <span>
              critics{' '}
              <button
                type="button"
                onClick={onOpenMethod}
                className="font-mono text-ink-2 underline-offset-2 hover:underline"
                title="see the breakdown, and the molecules they got wrong, on the Method screen"
              >
                {evaluation.combined.correct}/{evaluation.combined.n} correct (
                {(evaluation.combined.accuracy * 100).toFixed(0)}%)
              </button>
            </span>
          )}
          <span>
            designer <span className="font-mono text-ink-2">{backend?.designer ?? '—'}</span>
          </span>
          <span>
            docking{' '}
            <span className="font-mono text-ink-2">
              {backend?.vina ? `AutoDock Vina · ${backend.dock_mode}` : 'not installed'}
            </span>
          </span>
          <span>
            chemistry <span className="font-mono text-ink-2">{backend?.chemistry ?? '—'}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowConsole((value) => !value)}
            className="inline-flex items-center gap-1 text-ink-2 underline-offset-2 hover:underline"
          >
            <Terminal className="h-3 w-3" />
            {showConsole ? 'hide' : 'show'} console
          </button>
        </div>

        {showConsole && (
          <pre className="max-h-64 overflow-auto rounded-md bg-ink p-3 font-mono text-[11px] leading-relaxed text-canvas">
            {status?.console?.trim() || 'nothing has run yet'}
          </pre>
        )}
      </div>
    </Panel>
  );
}

export function DesignLoopView({
  runLog,
  status,
  evaluation,
  onInspect,
  onRun,
  onEvaluate,
  onStop,
  onOpenMethod,
  busy,
}: {
  runLog: RunLog | null;
  status: Status | null;
  evaluation?: EvaluationResults | null;
  onInspect: (smiles: string) => void;
  onRun: (options: { mode: RunMode; rounds: number; candidates: number }) => Promise<void>;
  onEvaluate: () => Promise<void>;
  onStop: () => Promise<void>;
  onOpenMethod?: () => void;
  busy: boolean;
}) {
  const rounds = runLog?.rounds ?? [];
  const withCandidates = rounds.filter((round) => (round.assessed ?? []).length > 0);
  const first = withCandidates[0];
  const last = withCandidates[withCandidates.length - 1];
  const referenceAffinity = runLog?.reference?.affinity ?? null;

  const fraction = (round?: Round) => {
    const assessed = round?.assessed ?? [];
    if (!assessed.length) return '—';
    return `${assessed.filter((candidate) => candidate.manufacturable).length}/${assessed.length}`;
  };

  const improved =
    first &&
    last &&
    first !== last &&
    (last.assessed ?? []).filter((candidate) => candidate.manufacturable).length >
      (first.assessed ?? []).filter((candidate) => candidate.manufacturable).length;

  return (
    <div className="space-y-5">
      <RunControls
        status={status}
        evaluation={evaluation}
        onRun={onRun}
        onEvaluate={onEvaluate}
        onStop={onStop}
        onOpenMethod={onOpenMethod}
        busy={busy}
      />

      {withCandidates.length > 0 && (
        <Panel
          title="What the loop did"
          help="Manufacturable means both critics cleared the molecule — it binds well enough to be interesting and could be produced at a practical scale."
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Rounds" value={rounds.length} />
            <Stat
              label="Round 1 manufacturable"
              value={fraction(first)}
              basis={first?.status === 'pool' ? 'generative output, unfiltered' : 'designer'}
              tone="bad"
            />
            <Stat
              label="Latest round"
              value={fraction(last)}
              basis="after critic feedback"
              tone={improved ? 'good' : 'default'}
            />
            <Stat
              label="Tool calls"
              value={rounds.reduce((total, round) => total + (round.trace?.length ?? 0), 0)}
              basis="decisions the agent made itself"
            />
          </div>

          {improved && (
            <div className="mt-4 rounded-md border border-pass/40 bg-pass-soft px-3 py-2 text-sm text-ink">
              <strong className="font-semibold">
                Manufacturable fraction {fraction(first)} → {fraction(last)} after critic feedback.
              </strong>{' '}
              The designer was told which criterion each molecule failed on, and changed exactly
              that.
            </div>
          )}
          {runLog?.result?.verdict_reason && (
            <Note>
              Finished: {runLog.result.verdict_reason}
              {runLog.result.elapsed_s ? ` · ${runLog.result.elapsed_s} s` : ''}
            </Note>
          )}
        </Panel>
      )}

      {rounds.length === 0 && (
        <Empty>
          Nothing has run yet. Press <strong>Run loop</strong> above — or pick the offline demo
          mode, which replays the loop from docking results committed to this repository and needs
          no API key and no docking software.
        </Empty>
      )}

      {rounds.map((round) => (
        <RoundBlock
          key={round.round}
          round={round}
          referenceAffinity={referenceAffinity}
          onInspect={onInspect}
        />
      ))}
    </div>
  );
}

function RoundBlock({
  round,
  referenceAffinity,
  onInspect,
}: {
  round: Round;
  referenceAffinity: number | null;
  onInspect: (smiles: string) => void;
}) {
  const assessed: AssessedCandidate[] = round.assessed ?? [];
  const madeCount = assessed.filter((candidate) => candidate.manufacturable).length;
  const feedback = round.feedback_in ?? [];
  const mustFix = [
    ...new Set(
      feedback.flatMap((item) =>
        (item.rejections ?? [])
          .filter((rejection) => rejection.level === 'fail')
          .map((rejection) => rejection.criterion),
      ),
    ),
  ];
  const fromPool = round.status === 'pool';

  return (
    <Panel
      title={`Round ${round.round}`}
      help={
        fromPool
          ? 'Taken straight from the generative pipeline’s own output, ranked by docking score, with no manufacturability filter applied. This is the baseline the loop has to beat.'
          : 'Designed by the agent, against the critics’ feedback from the previous round.'
      }
      aside={
        <span className="font-mono text-[11px] text-ink-3">
          {assessed.length ? `${madeCount}/${assessed.length} manufacturable` : round.status} ·{' '}
          {round.trace?.length ?? 0} tool calls
        </span>
      }
    >
      <div className="space-y-4">
        {mustFix.length > 0 && (
          <div className="rounded-md border border-accent/40 bg-accent-soft px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              feedback in from the critics
            </div>
            <p className="mt-1 text-xs text-ink">
              {feedback.length} candidate{feedback.length === 1 ? '' : 's'} rejected as
              unmanufacturable. The designer was told to fix:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {mustFix.map((criterion) => (
                <Chip key={criterion} tone="info">
                  {criterion}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {round.changes_made && !fromPool && (
          <div className="rounded-md border border-pass/40 bg-pass-soft px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-pass">
              <CornerDownRight className="h-3.5 w-3.5" />
              what the designer changed
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink">{round.changes_made}</p>
          </div>
        )}

        {assessed.length > 0 ? (
          <Grid cols={3}>
            {assessed.map((candidate) => (
              <CandidateCard
                key={candidate.smiles}
                candidate={candidate}
                referenceAffinity={referenceAffinity}
                onInspect={onInspect}
              />
            ))}
          </Grid>
        ) : (
          <p className="text-xs text-ink-3">designing…</p>
        )}

        {(round.trace?.length ?? 0) > 0 && <ToolTrace round={round} />}
      </div>
    </Panel>
  );
}

function ToolTrace({ round }: { round: Round }) {
  const [open, setOpen] = useState(false);
  const trace = round.trace ?? [];
  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2 hover:bg-surface-2"
      >
        <span>
          Tool calls the agent chose to make ({trace.length})
        </span>
        <span className="font-normal normal-case text-ink-3">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="max-h-72 overflow-auto border-t border-line">
          {trace.map((event, index) => (
            <div
              key={index}
              className="flex gap-3 border-b border-line px-3 py-1.5 font-mono text-[11px] last:border-0"
            >
              <span className="w-10 shrink-0 text-right text-ink-3">{event.t}s</span>
              <span className="w-44 shrink-0 text-accent">{event.tool}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3">
                {JSON.stringify(event.args).slice(0, 180)}
              </span>
            </div>
          ))}
          <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-3">
            The agent decides which molecules to propose, which to spend a docking run on, where
            in the cavity to grow them and when it has enough. Only the tool surface and the
            budget are fixed.
          </p>
        </div>
      )}
    </div>
  );
}
