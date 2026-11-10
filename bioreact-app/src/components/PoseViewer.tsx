/**
 * PoseViewer.tsx — the docked pose in the protein, with the empty space
 * drawn.
 *
 * Three things are on screen at once, and each answers a question the
 * numbers alone cannot:
 *
 *   the pose          where AutoDock Vina put the molecule
 *   contact residues  which side chains it actually touches, computed from
 *                     the coordinates rather than asserted
 *   unoccupied space  the cavity volume the molecule does NOT fill, as
 *                     translucent spheres — this is what the designer grows
 *                     into, so being able to see it is the point
 *
 * The receptor is fetched once and cached by the browser; poses are small.
 * Everything here is display: the geometry comes from the Python side.
 */
import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import type { Void } from '../types';

export const VOID_COLOUR = '#c026d3';
const PROTEIN_COLOUR = '#94a3b8';
const CONTACT_COLOUR = '#f59e0b';
const LIGAND_COLOUR = '#0ea5e9';

/**
 * The 3D view stays dark in both themes. Molecular viewers conventionally
 * are, the four marker colours were chosen against a dark ground, and a
 * white protein on a white page loses the depth cue entirely. The exact
 * value comes from the theme tokens so it still belongs to the palette.
 */
function viewerBackground(): string {
  if (typeof window === 'undefined') return '#0b1018';
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue('--c-viewer-bg')
    .trim();
  return token || '#0b1018';
}

interface Atom {
  x: number;
  y: number;
  z: number;
  resi: number;
  chain: string;
}

/** Heavy-atom coordinates out of PDB text, for the contact calculation. */
function parseAtoms(pdb: string): Atom[] {
  const atoms: Atom[] = [];
  for (const line of pdb.split('\n')) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;
    const x = Number.parseFloat(line.slice(30, 38));
    const y = Number.parseFloat(line.slice(38, 46));
    const z = Number.parseFloat(line.slice(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    atoms.push({
      x,
      y,
      z,
      resi: Number.parseInt(line.slice(22, 26), 10) || 0,
      chain: (line[21] || 'A').trim() || 'A',
    });
  }
  return atoms;
}

/** First MODEL only — a Vina pose file holds up to nine. */
function splitModels(pdb: string): string[] {
  const models: string[] = [];
  let current: string[] | null = null;
  for (const line of pdb.split('\n')) {
    if (line.startsWith('MODEL')) {
      current = [];
      continue;
    }
    if (line.startsWith('ENDMDL')) {
      if (current) models.push(current.join('\n'));
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  return models.length ? models : [pdb];
}

/**
 * Residues with any atom within `cutoff` of any ligand atom.
 *
 * 3Dmol's own `within` selector matched the whole protein here, so this is
 * computed directly: a bounding box around the ligand skips almost every
 * protein atom, which keeps it instant even for a 10,000-atom receptor.
 */
function contactResidues(
  receptorAtoms: Atom[],
  ligandPdb: string,
  cutoff: number,
): Record<string, number[]> {
  const ligand = parseAtoms(ligandPdb);
  if (!ligand.length) return {};

  const pad = cutoff + 0.1;
  const low = { x: Infinity, y: Infinity, z: Infinity };
  const high = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const atom of ligand) {
    low.x = Math.min(low.x, atom.x);
    low.y = Math.min(low.y, atom.y);
    low.z = Math.min(low.z, atom.z);
    high.x = Math.max(high.x, atom.x);
    high.y = Math.max(high.y, atom.y);
    high.z = Math.max(high.z, atom.z);
  }

  const squared = cutoff * cutoff;
  const byChain: Record<string, Set<number>> = {};
  for (const atom of receptorAtoms) {
    if (
      atom.x < low.x - pad ||
      atom.x > high.x + pad ||
      atom.y < low.y - pad ||
      atom.y > high.y + pad ||
      atom.z < low.z - pad ||
      atom.z > high.z + pad
    ) {
      continue;
    }
    for (const other of ligand) {
      const dx = atom.x - other.x;
      const dy = atom.y - other.y;
      const dz = atom.z - other.z;
      if (dx * dx + dy * dy + dz * dz < squared) {
        (byChain[atom.chain] ??= new Set()).add(atom.resi);
        break;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(byChain).map(([chain, set]) => [chain, [...set]]),
  );
}

export function PoseViewer({
  receptorPdb,
  posePdb,
  modeIndex,
  voids,
  showVoids,
  showSurface,
  onContactCount,
}: {
  receptorPdb: string | null;
  posePdb: string | null;
  modeIndex: number;
  voids: Void[];
  showVoids: boolean;
  showSurface: boolean;
  onContactCount?: (count: number) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewer = useRef<$3Dmol.GLViewer | null>(null);
  const receptorAtoms = useRef<Atom[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current || viewer.current) return;
    try {
      viewer.current = $3Dmol.createViewer(host.current, {
        backgroundColor: viewerBackground(),
        antialias: true,
      });
    } catch (problem) {
      setFailure(
        problem instanceof Error
          ? `3D view unavailable: ${problem.message}`
          : '3D view unavailable in this browser',
      );
    }
  }, []);

  useEffect(() => {
    receptorAtoms.current = receptorPdb ? parseAtoms(receptorPdb) : null;
  }, [receptorPdb]);

  useEffect(() => {
    const view = viewer.current;
    if (!view || !receptorPdb || !posePdb) return;

    const models = splitModels(posePdb);
    const pose = models[modeIndex] ?? models[0];

    view.clear();
    view.addModel(receptorPdb, 'pdb'); // model 0
    view.addModel(pose, 'pdb'); // model 1

    view.setStyle({ model: 0 }, { cartoon: { color: PROTEIN_COLOUR, opacity: 0.35 } });
    view.setStyle(
      { model: 1 },
      { stick: { radius: 0.2, colorscheme: 'cyanCarbon' } },
    );

    const contacts = contactResidues(receptorAtoms.current ?? [], pose, 4.5);
    let count = 0;
    for (const [chain, resi] of Object.entries(contacts)) {
      count += resi.length;
      view.addStyle(
        { model: 0, chain, resi },
        { stick: { radius: 0.11, colorscheme: 'yellowCarbon' } },
      );
    }
    onContactCount?.(count);

    if (showSurface) {
      for (const [chain, resi] of Object.entries(
        contactResidues(receptorAtoms.current ?? [], pose, 8),
      )) {
        view.addSurface(
          $3Dmol.SurfaceType.VDW,
          { opacity: 0.62, color: '#64748b' },
          { model: 0, chain, resi },
        );
      }
    }

    if (showVoids) {
      for (const region of voids) {
        // One sphere per region, its radius taken from the reported volume
        // so the size on screen means something. The region is a cluster of
        // grid points, not a ball — this is an indication of where and how
        // much, not a shape.
        const radius = Math.cbrt((3 * region.volume_a3) / (4 * Math.PI));
        view.addSphere({
          center: { x: region.centre[0], y: region.centre[1], z: region.centre[2] },
          radius: Math.max(1.4, Math.min(radius, 6)),
          color: VOID_COLOUR,
          opacity: 0.45,
        });
        view.addLabel(`${Math.round(region.volume_a3)} Å³`, {
          position: { x: region.centre[0], y: region.centre[1], z: region.centre[2] },
          backgroundColor: '#1e1b4b',
          backgroundOpacity: 0.75,
          fontColor: '#f5d0fe',
          fontSize: 11,
          borderThickness: 0,
        });
      }
    }

    view.zoomTo({ model: 1 });
    view.zoom(0.75);
    view.render();
  }, [receptorPdb, posePdb, modeIndex, voids, showVoids, showSurface, onContactCount]);

  return (
    <div className="relative">
      <div
        ref={host}
        className="h-[420px] w-full overflow-hidden rounded-[5px] border border-line bg-viewer-bg"
      />
      {(!receptorPdb || !posePdb) && !failure && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-3">
          loading structure…
        </div>
      )}
      {failure && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-fail">
          {failure}
        </div>
      )}
      <Legend />
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    [LIGAND_COLOUR, 'docked molecule'],
    [PROTEIN_COLOUR, 'protein'],
    [CONTACT_COLOUR, 'contact residues (within 4.5 Å)'],
    [VOID_COLOUR, 'unoccupied cavity space'],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
      {items.map(([colour, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: colour }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
