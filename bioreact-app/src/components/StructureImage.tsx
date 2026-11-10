/**
 * StructureImage.tsx — a 2D structure, drawn by RDKit.
 *
 * Structures come from the same RDKit that computes every descriptor, so
 * the picture and the numbers can never disagree. The drawing is asked
 * for in a palette that matches the theme, which is why this component
 * needs to know whether the page is currently dark.
 */
import { useState } from 'react';
import { structureUrl } from '../api';
import { useTheme } from '../theme';

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
  const { dark } = useTheme();
  const [failed, setFailed] = useState(false);
  const source = structureUrl(smiles, width, height, dark);

  if (failed || !source) {
    return (
      <div
        className={`structure-stage flex items-center justify-center px-2 text-center text-[11px] text-ink-3 ${className}`}
        style={{ minHeight: Math.max(48, height / 2) }}
      >
        structure not available
      </div>
    );
  }

  return (
    <img
      key={source}
      src={source}
      alt={`structure of ${smiles}`}
      title={smiles}
      width={width}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-auto w-full max-w-full ${className}`}
    />
  );
}

/** The SMILES itself, monospaced and selectable — chemists copy these. */
export function SmilesText({ smiles }: { smiles: string }) {
  return (
    <code className="block break-all font-mono text-[10.5px] leading-snug text-ink-3">
      {smiles}
    </code>
  );
}
