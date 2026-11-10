/**
 * DecisionView.tsx — which of these should a researcher make first?
 *
 * The loop produces candidates and the agents cost them; neither answers
 * the question a project meeting actually asks. This screen does: one row
 * per molecule, binding and manufacturability side by side, an explicit
 * call of MAKE FIRST / MAKE / BACKUP / REDESIGN / DO NOT MAKE, and the
 * strengths and concerns behind that call. The recommendation is a
 * recommendation — the evidence next to it is what makes it arguable.
 */
import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import type { DecisionRow, ManufactureReport, RunLog } from '../types';
import { StructureImage } from './StructureImage';
import {
  BandValue,
  Cell,
  Chip,
  Empty,
  Estimate,
  Note,
  Panel,
  Table,
  type ChipTone,
  weeksText,
} from './ui';

const RECOMMENDATION_TONE: Record<string, ChipTone> = {
  make_first: 'pass',
  make: 'pass',
  backup: 'info',
  redesign: 'flag',
  drop: 'fail',
};

export function DecisionView({
  runLog,
  report,
  onInspect,
}: {
  runLog: RunLog | null;
  report: ManufactureReport | null;
  onInspect: (smiles: string) => void;
}) {
  const rows: DecisionRow[] = runLog?.decision_table ?? [];
  const costed = new Map((report?.candidates ?? []).map((item) => [item.smiles, item]));
  const reference = runLog?.reference;

  if (rows.length === 0) {
    return (
      <Empty>
        The decision table is written at the end of a run. Run the design loop, then come back —
        or open the offline demo mode, which produces one in about five seconds.
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Which one should you make first?"
        help={
          <>
            Ranked by binding among the molecules that can actually be made: a candidate the
            critics rejected sorts below every candidate they cleared, however well it docks.
            {reference?.affinity != null && (
              <>
                {' '}
                The reference ligand {reference.name} scored {reference.affinity} kcal/mol in the
                same docking setup, so anything more negative than that binds better here.
              </>
            )}
          </>
        }
        aside={
          <div className="flex items-center gap-2">
            <a
              href="/candidates.csv"
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Table as CSV
            </a>
            <a
              href="/export.json"
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <FileJson className="h-3.5 w-3.5" />
              Whole run as JSON
            </a>
          </div>
        }
      >
        <Table
          head={[
            '#',
            'structure',
            'call',
            'critics',
            'binding',
            'SA',
            'steps',
            'chiral',
            'route',
            report ? `cost/g at ${report.scale_label}` : 'cost/g',
            'time',
            'strengths and concerns',
          ]}
        >
          {rows.map((row) => {
            const manufacturability = costed.get(row.smiles);
            return (
              <tr key={row.smiles} className="align-top">
                <Cell numeric>{row.rank}</Cell>
                <Cell className="w-[120px]">
                  <button
                    type="button"
                    onClick={() => onInspect(row.smiles)}
                    title="show this pose in the binding site"
                    className="block rounded border border-transparent hover:border-slate-300"
                  >
                    <StructureImage smiles={row.smiles} width={112} height={72} />
                  </button>
                </Cell>
                <Cell>
                  <span className="whitespace-nowrap">
                    <Chip
                      tone={RECOMMENDATION_TONE[row.recommendation] ?? 'neutral'}
                      title={row.recommendation_why}
                    >
                      {row.recommendation_label}
                    </Chip>
                  </span>
                </Cell>
                <Cell>
                  <Chip
                    tone={
                      row.verdict === 'pass' ? 'pass' : row.verdict === 'flag' ? 'flag' : 'fail'
                    }
                  >
                    {row.verdict}
                  </Chip>
                </Cell>
                <Cell numeric>
                  {row.affinity === null ? '—' : row.affinity.toFixed(2)}
                  {row.affinity_sd != null && (
                    <span className="text-slate-500"> ±{row.affinity_sd.toFixed(2)}</span>
                  )}
                </Cell>
                <Cell numeric>{row.sa_score}</Cell>
                <Cell numeric>~{row.estimated_steps}</Cell>
                <Cell numeric>{row.stereocentres}</Cell>
                <Cell>{row.route_complexity}</Cell>
                <Cell numeric>
                  {manufacturability ? (
                    <BandValue band={manufacturability.cost.cost_per_gram_usd} prefix="$" />
                  ) : (
                    <span className="text-slate-400">not costed</span>
                  )}
                </Cell>
                <Cell numeric>
                  {manufacturability ? (
                    weeksText(manufacturability.time.total_weeks)
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Cell>
                <Cell className="min-w-[260px]">
                  <StrengthsAndConcerns pros={row.pros} cons={row.cons} />
                </Cell>
              </tr>
            );
          })}
        </Table>

        <div className="mt-3 space-y-2">
          <Estimate>
            Docking scores rank candidates; they are not binding free energies, and AutoDock Vina
            is stochastic, so a repeat run of the same molecule gives a slightly different number.
            Step counts and costs are modelled estimates.
          </Estimate>
          {!report && (
            <Note>
              Cost and time are blank until the shortlist has been assessed. Open{' '}
              <strong>Manufacturability</strong> and press{' '}
              <strong>Estimate cost and time</strong>.
            </Note>
          )}
          <Note>
            <span className="inline-flex items-center gap-1">
              <Download className="h-3 w-3" />
              The CSV holds the same rows; the JSON export holds the whole run — every round, the
              tool calls the agents made, and the assumptions behind every figure.
            </span>
          </Note>
        </div>
      </Panel>
    </div>
  );
}

/**
 * Three strengths and three concerns, with the rest behind a click. A full
 * list makes every row the height of the screen and nobody reads the
 * seventh bullet anyway.
 */
function StrengthsAndConcerns({ pros, cons }: { pros: string[]; cons: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const realCons = cons.filter((con) => con !== 'none identified');
  const limit = expanded ? Infinity : 3;
  const hidden = Math.max(0, pros.length - 3) + Math.max(0, realCons.length - 3);

  return (
    <div>
      <ul className="space-y-0.5 text-xs leading-relaxed">
        {pros.slice(0, limit).map((pro, index) => (
          <li key={`pro-${index}`} className="text-emerald-800">
            + {pro}
          </li>
        ))}
        {realCons.slice(0, limit).map((con, index) => (
          <li key={`con-${index}`} className="text-rose-800">
            − {con}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-[11px] text-slate-500 underline-offset-2 hover:underline"
        >
          {expanded ? 'show fewer' : `${hidden} more`}
        </button>
      )}
    </div>
  );
}
