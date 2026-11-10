/**
 * CandidateCard.tsx — one molecule as the critics left it.
 *
 * The card has to answer four questions without being clicked: what is it,
 * how well does it bind, can it be made, and if not, what exactly is wrong.
 * The last one is the point of the project, so every rejection shows both
 * the measured value against its threshold and the change that would fix
 * it — the same text the designer agent is given.
 */
import { Box } from 'lucide-react';
import type { AssessedCandidate } from '../types';
import { SmilesText, StructureImage } from './StructureImage';
import { Button, Chip, verdictTone } from './ui';

const VERDICT_MEANING: Record<string, string> = {
  pass: 'both critics cleared it: makeable at a practical scale',
  flag: 'makeable, but with a caveat a process chemist should see',
  fail: 'rejected: cannot be made at a practical scale as drawn',
};

export function CandidateCard({
  candidate,
  referenceAffinity,
  onInspect,
}: {
  candidate: AssessedCandidate;
  referenceAffinity?: number | null;
  onInspect?: (smiles: string) => void;
}) {
  const verdict = candidate.verdict;
  const edge =
    verdict === 'pass'
      ? 'border-l-pass'
      : verdict === 'flag'
        ? 'border-l-flag'
        : 'border-l-fail';
  const beatsReference =
    candidate.affinity !== null &&
    referenceAffinity !== null &&
    referenceAffinity !== undefined &&
    candidate.affinity < referenceAffinity;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-lg border border-line border-l-4 bg-surface ${edge}`}
    >
      <div className="flex items-center justify-center border-b border-line bg-surface-2 p-2">
        <StructureImage smiles={candidate.smiles} width={320} height={190} />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={verdictTone[verdict]} title={VERDICT_MEANING[verdict]}>
            {verdict}
          </Chip>
          {candidate.affinity !== null && (
            <span className="font-mono text-sm tabular-nums text-ink">
              {candidate.affinity.toFixed(2)}
              <span className="ml-1 text-[11px] font-normal text-ink-3">kcal/mol</span>
            </span>
          )}
          {beatsReference && (
            <Chip tone="info" title="binds better than the reference ligand in this docking run">
              beats reference
            </Chip>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-2 text-[11px]">
          <Metric
            label="SA score"
            value={candidate.sa_score}
            help="Ertl synthetic accessibility, 1 easy to 10 hard"
          />
          <Metric
            label="steps"
            value={`~${candidate.estimated_steps}`}
            help="estimated linear sequence length — a heuristic, not a retrosynthesis"
          />
          <Metric
            label="route"
            value={candidate.route_complexity}
            help="how demanding the synthesis looks overall"
          />
        </dl>

        {candidate.rationale && (
          <p className="text-xs italic leading-relaxed text-ink-2">
            designer: {candidate.rationale}
          </p>
        )}

        {candidate.rejections.length > 0 && (
          <div className="space-y-2 border-t border-line pt-2">
            {candidate.rejections.slice(0, 4).map((rejection, index) => (
              <div key={`${rejection.criterion}-${index}`} className="text-xs">
                <div className="flex items-baseline gap-1.5">
                  <Chip tone={rejection.level === 'fail' ? 'fail' : 'flag'}>
                    {rejection.criterion}
                  </Chip>
                  <span className="text-ink-2">{rejection.reason}</span>
                </div>
                <div className="mt-0.5 pl-1 text-[11px] leading-relaxed text-accent">
                  → {rejection.suggest}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-2 pt-1">
          {onInspect && (
            <Button
              tone="secondary"
              icon={<Box className="h-3.5 w-3.5" />}
              onClick={() => onInspect(candidate.smiles)}
            >
              See it in the pocket
            </Button>
          )}
          <SmilesText smiles={candidate.smiles} />
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  help,
}: {
  label: string;
  value: string | number;
  help: string;
}) {
  return (
    <div title={help} className="min-w-0">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </dt>
      <dd className="truncate font-mono text-xs tabular-nums text-ink">{value}</dd>
    </div>
  );
}
