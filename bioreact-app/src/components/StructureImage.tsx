/**
 * StructureImage.tsx — a 2D structure, drawn by RDKit on the server.
 *
 * Structures are requested as SVG from /svg rather than drawn in the
 * browser: the same RDKit that computes every descriptor also draws the
 * molecule, so the picture and the numbers can never disagree.
 */
import { useState } from 'react';
import { structureUrl } from '../api';

export function StructureImage({
  smiles,
  width = 320,
  height = 200,
  className = '',
}: {
  smiles: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-500 ${className}`}
        style={{ minHeight: height / 2 }}
      >
        structure could not be drawn
      </div>
    );
  }

  return (
    <img
      src={structureUrl(smiles, width, height)}
      alt={`structure of ${smiles}`}
      title={smiles}
      width={width}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-auto max-w-full rounded bg-white ${className}`}
    />
  );
}

/** The SMILES itself, monospaced and selectable — chemists copy these. */
export function SmilesText({ smiles }: { smiles: string }) {
  return (
    <code className="block break-all font-mono text-[10.5px] leading-snug text-slate-500">
      {smiles}
    </code>
  );
}
