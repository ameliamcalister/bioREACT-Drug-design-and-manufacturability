/**
 * BindingSiteView.tsx — where there is still room, and what to put there.
 *
 * The design strategy is to grow a small binder into the parts of the
 * cavity it does not occupy, so this screen exists to make that strategy
 * inspectable: pick a docked molecule, see its pose, and see the empty
 * regions beside it with their volume, the residues lining them and the
 * kind of group that would fill each one. The same analysis is what the
 * designer agent reads as a tool.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { api } from '../api';
import type { PoseResult, RunLog, TargetSummary, Void, VoidResult } from '../types';
import { PoseViewer, VOID_COLOUR } from './PoseViewer';
import { SmilesText, StructureImage } from './StructureImage';
import {
  Chip,
  Empty,
  ErrorText,
  Note,
  Panel,
  Select,
  Stat,
  Toggle,
  affinityText,
} from './ui';

const CHARACTER_HELP: Record<string, string> = {
  hydrophobic:
    'mostly non-polar side chains line this region, so a lipophilic group gains the most here',
  polar: 'polar and charged side chains line it, so a hydrogen-bonding group suits it',
  mixed: 'both kinds of side chain line it, so an aryl ring with one polar substituent fits',
};

export function BindingSiteView({
  runLog,
  target,
  selected,
  onSelect,
}: {
  runLog: RunLog | null;
  target: TargetSummary | null;
  selected: string | null;
  onSelect: (smiles: string) => void;
}) {
  const [receptor, setReceptor] = useState<string | null>(null);
  const [pose, setPose] = useState<PoseResult | null>(null);
  const [voids, setVoids] = useState<VoidResult | null>(null);
  const [modeIndex, setModeIndex] = useState(0);
  const [showVoids, setShowVoids] = useState(true);
  const [showSurface, setShowSurface] = useState(false);
  const [contacts, setContacts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Everything docked in this run, best binding first.
  const docked = useMemo(() => {
    const seen = new Map<string, { smiles: string; affinity: number | null; verdict: string }>();
    for (const round of runLog?.rounds ?? []) {
      for (const candidate of round.assessed ?? []) {
        if (candidate.affinity === null || candidate.affinity === undefined) continue;
        seen.set(candidate.smiles, {
          smiles: candidate.smiles,
          affinity: candidate.affinity,
          verdict: candidate.verdict,
        });
      }
    }
    return [...seen.values()].sort((a, b) => (a.affinity ?? 0) - (b.affinity ?? 0));
  }, [runLog]);

  const active = selected ?? docked[0]?.smiles ?? null;

  useEffect(() => {
    let cancelled = false;
    api
      .receptor()
      .then((text) => {
        if (!cancelled) setReceptor(text);
      })
      .catch((problem) => {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      });
    return () => {
      cancelled = true;
    };
  }, [target?.slug]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPose(null);
    setVoids(null);
    setModeIndex(0);

    Promise.all([api.pose(active), api.voids(active).catch(() => null)])
      .then(([poseResult, voidResult]) => {
        if (cancelled) return;
        setPose(poseResult);
        setVoids(voidResult);
        if (!poseResult.ok) setError(poseResult.error ?? 'no pose for this molecule');
      })
      .catch((problem) => {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const handleContacts = useCallback((count: number) => setContacts(count), []);

  if (!docked.length) {
    return (
      <Empty>
        Nothing has been docked yet, so there is no pose to look at. Run the design loop first —
        the offline demo mode works without an API key or docking software.
      </Empty>
    );
  }

  const regions: Void[] = voids?.voids ?? [];

  return (
    <div className="space-y-5">
      <Panel
        title="The pose, and the space it leaves empty"
        help={
          <>
            Translucent magenta marks cavity volume this molecule does not fill. Growing a
            scaffold into those regions improves shape complementarity; adding mass anywhere else
            mostly adds molecular weight. The regions are found geometrically from one rigid pose —
            no energy term is involved.
          </>
        }
        aside={
          <div className="flex items-center gap-3">
            <Toggle
              checked={showVoids}
              onChange={setShowVoids}
              label="Unoccupied space"
            />
            <Toggle checked={showSurface} onChange={setShowSurface} label="Pocket surface" />
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Molecule
                </span>
                <Select
                  value={active ?? ''}
                  onChange={onSelect}
                  options={docked.map((candidate) => ({
                    value: candidate.smiles,
                    label: `${candidate.affinity?.toFixed(2)} kcal/mol · ${candidate.verdict} · ${candidate.smiles.slice(0, 40)}…`,
                  }))}
                />
              </label>
              {(pose?.mode_scores?.length ?? 0) > 1 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    Binding mode
                  </span>
                  <Select
                    value={String(modeIndex)}
                    onChange={(value) => setModeIndex(Number(value))}
                    options={(pose?.mode_scores ?? []).map((score, index) => ({
                      value: String(index),
                      label: `mode ${index + 1} — ${score.toFixed(2)} kcal/mol`,
                    }))}
                  />
                </label>
              )}
            </div>

            <PoseViewer
              receptorPdb={receptor}
              posePdb={pose?.ok ? (pose.pdb ?? null) : null}
              modeIndex={modeIndex}
              voids={regions}
              showVoids={showVoids}
              showSurface={showSurface}
              onContactCount={handleContacts}
            />

            {error && (
              <div className="mt-3">
                <ErrorText>{error}</ErrorText>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {active && (
              <div className="structure-stage p-2">
                <StructureImage smiles={active} width={320} height={180} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Best score"
                value={pose?.affinity?.toFixed(2) ?? '—'}
                unit="kcal/mol"
                basis={
                  pose?.source === 'vina'
                    ? 'docked in this session'
                    : pose?.source
                      ? `from ${pose.source}`
                      : undefined
                }
              />
              <Stat
                label="Contact residues"
                value={contacts || '—'}
                basis="within 4.5 Å of the pose"
              />
              <Stat
                label="Unoccupied space"
                value={voids?.unoccupied_volume_a3 ?? (loading ? '…' : '—')}
                unit="Å³"
                basis={`${regions.length} region${regions.length === 1 ? '' : 's'} found`}
              />
              <Stat
                label="Binding modes"
                value={pose?.mode_scores?.length ?? '—'}
                basis="kept from the docking run"
              />
            </div>
            {target && (
              <div className="rounded-md border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
                <div className="font-medium text-ink">{target.name}</div>
                {target.description && <p className="mt-1">{target.description}</p>}
                <p className="mt-1.5 font-mono text-[11px]">
                  site from {target.grid_source} · box {target.box.filter(Boolean).join(' × ')} Å
                  {target.receptor_atoms ? ` · ${target.receptor_atoms.toLocaleString()} atoms` : ''}
                </p>
                {target.blind && (
                  <p className="mt-1 text-flag">
                    No reference ligand was given, so this docks blind against the whole protein —
                    slower and much less reliable than boxing the known site.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Unoccupied regions, largest first"
        help="Each region is a cluster of empty grid points inside the cavity. Volume is approximate and depends on the probe size; the lining tells you what chemistry belongs there."
        aside={
          voids?.method ? (
            <span className="font-mono text-[11px] text-ink-3">{voids.method}</span>
          ) : null
        }
      >
        {regions.length === 0 ? (
          <Empty>
            {voids?.note ??
              'No unoccupied region above the size threshold next to this pose — on this measure the molecule already fills the space around it.'}
          </Empty>
        ) : (
          <div className="space-y-3">
            {regions.map((region) => (
              <div
                key={region.rank}
                className="rounded-md border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: VOID_COLOUR }}
                  />
                  <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                    {Math.round(region.volume_a3)} Å³
                  </span>
                  <Chip tone={region.character === 'polar' ? 'info' : 'neutral'}
                    title={CHARACTER_HELP[region.character]}>
                    {region.character}
                  </Chip>
                  {region.gap_to_ligand_a !== null && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-3">
                      <Ruler className="h-3 w-3" />
                      {region.gap_to_ligand_a} Å from the molecule
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-2">
                  <span className="font-medium">What to do here: </span>
                  {region.suggested_chemistry}
                </p>
                <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink-3">
                  lined by {region.lining_residues.join(', ')} ·{' '}
                  {region.lining_counts.hydrophobic} non-polar, {region.lining_counts.polar} polar
                  {region.lining_counts.charged
                    ? `, ${region.lining_counts.charged} charged`
                    : ''}
                </p>
              </div>
            ))}
            {voids?.caveat && <Note>{voids.caveat}</Note>}
          </div>
        )}
      </Panel>
    </div>
  );
}
