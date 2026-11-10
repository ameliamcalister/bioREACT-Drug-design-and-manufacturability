/**
 * ui.tsx — the shared vocabulary of the interface.
 *
 * Every panel, control, chip and number in the app comes from here, so
 * the whole thing reads as one instrument rather than a set of screens.
 * Three rules it exists to enforce:
 *
 *   1. No component names a colour. Everything is a semantic token from
 *      index.css, which is what makes both themes work without a second
 *      set of styles.
 *   2. Nothing is unlabelled. A panel takes a `help` line saying what it
 *      is for in words a biochemist would use; an action takes a `hint`;
 *      a figure can carry the basis it was computed from.
 *   3. An estimate never looks like a measurement. `BandValue` renders a
 *      range; `Estimate` marks a number as modelled rather than observed.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

// ─── layout ──────────────────────────────────────────────────────────────
export function Panel({
  title,
  help,
  aside,
  children,
  tone = 'default',
  id,
  busy,
}: {
  title?: ReactNode;
  help?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'quiet' | 'warning';
  id?: string;
  busy?: boolean;
}) {
  const surface =
    tone === 'warning'
      ? 'border-flag/40 bg-flag-soft'
      : tone === 'quiet'
        ? 'border-line bg-surface-2'
        : 'border-line bg-surface';
  return (
    <section
      id={id}
      className={`relative overflow-hidden rounded-[7px] border ${surface} panel-shadow`}
    >
      {busy && <span className="running-stripe absolute inset-x-0 top-0 h-0.5" />}
      {(title || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                {title}
              </h2>
            )}
            {help && (
              <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-ink-2">{help}</p>
            )}
          </div>
          {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const map = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 xl:grid-cols-3',
    4: 'md:grid-cols-2 xl:grid-cols-4',
  } as const;
  return <div className={`grid grid-cols-1 ${map[cols]} gap-4`}>{children}</div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[7px] border border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center">
      <p className="mx-auto max-w-prose text-sm leading-relaxed text-ink-2">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Placeholder bars, so a panel has a shape before its data arrives. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded bg-surface-3"
          style={{ width: `${92 - index * 14}%` }}
        />
      ))}
    </div>
  );
}

// ─── controls ────────────────────────────────────────────────────────────
type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  children,
  onClick,
  disabled,
  tone = 'secondary',
  icon,
  hint,
  type = 'button',
  title,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  icon?: ReactNode;
  hint?: string;
  type?: 'button' | 'submit';
  title?: string;
  full?: boolean;
}) {
  const tones: Record<ButtonTone, string> = {
    primary:
      'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 ' +
      'disabled:bg-surface-3 disabled:text-ink-3',
    secondary:
      'border border-line-strong bg-surface text-ink hover:bg-surface-2 ' +
      'disabled:text-ink-3 disabled:hover:bg-surface',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-ink-3',
    danger:
      'border border-fail/50 bg-surface text-fail hover:bg-fail-soft disabled:text-ink-3',
  };
  return (
    <span className={`inline-flex flex-col gap-1 ${full ? 'w-full' : ''}`}>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`inline-flex items-center justify-center gap-2 rounded-[5px] px-3 py-[7px] text-[13px] font-medium transition-[background-color,color,filter,border-color] duration-150 disabled:cursor-not-allowed ${tones[tone]} ${full ? 'w-full' : ''}`}
      >
        {icon}
        {children}
      </button>
      {hint && <span className="text-[11px] leading-tight text-ink-3">{hint}</span>}
    </span>
  );
}

export function Field({
  label,
  help,
  children,
  htmlFor,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3"
      >
        {label}
      </label>
      {children}
      {help && <span className="text-[11px] leading-tight text-ink-3">{help}</span>}
    </div>
  );
}

const controlClass =
  'w-full rounded-[5px] border border-line-strong bg-surface px-2.5 py-[7px] font-mono ' +
  'text-[13px] text-ink transition-colors placeholder:text-ink-3 ' +
  'hover:border-ink-3 focus:border-accent focus:outline-none ' +
  'disabled:bg-surface-2 disabled:text-ink-3';

export function Select({
  value,
  onChange,
  options,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      className={controlClass}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      className={controlClass}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      className={controlClass}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function FileInput({
  accept,
  disabled,
  onChange,
  id,
}: {
  accept: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="file"
      accept={accept}
      disabled={disabled}
      onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      className="w-full rounded-[5px] border border-line-strong bg-surface px-2.5 py-[6px] text-[12px] text-ink-2 file:mr-3 file:rounded-[4px] file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-[12px] file:font-medium file:text-ink hover:border-ink-3"
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] h-[15px] w-[15px] shrink-0 cursor-pointer rounded-[3px] border-line-strong accent-[var(--c-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight text-ink">{label}</span>
        {help && <span className="mt-1 block text-[11px] leading-tight text-ink-3">{help}</span>}
      </span>
    </label>
  );
}

/** A small segmented control — used for the theme, and for short choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-[5px] border border-line-strong bg-surface-2 p-[2px]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-[3px] text-[11.5px] font-medium transition-colors ${
              active
                ? 'bg-surface text-ink shadow-[0_1px_1px_rgb(0_0_0/0.06)]'
                : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── status and emphasis ─────────────────────────────────────────────────
export type ChipTone = 'pass' | 'flag' | 'fail' | 'info' | 'neutral' | 'accent';

export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: ChipTone;
  title?: string;
}) {
  const tones: Record<ChipTone, string> = {
    pass: 'border-pass/35 bg-pass-soft text-pass',
    flag: 'border-flag/35 bg-flag-soft text-flag',
    fail: 'border-fail/35 bg-fail-soft text-fail',
    info: 'border-accent/35 bg-accent-soft text-accent',
    accent: 'border-transparent bg-ink text-canvas',
    neutral: 'border-line-strong bg-surface-2 text-ink-2',
  };
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[3px] border px-1.5 py-[1px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export const verdictTone: Record<string, ChipTone> = {
  pass: 'pass',
  flag: 'flag',
  fail: 'fail',
};

export function Stat({
  label,
  value,
  unit,
  basis,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  basis?: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  const colour = tone === 'good' ? 'text-pass' : tone === 'bad' ? 'text-fail' : 'text-ink';
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[19px] leading-tight tabular ${colour}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{unit}</span>}
      </div>
      {basis && <div className="mt-1 text-[11px] leading-tight text-ink-3">{basis}</div>}
    </div>
  );
}

/** A modelled range. The span is primary; the point estimate is not shown. */
export function BandValue({
  band,
  unit,
  prefix = '',
  digits = 0,
}: {
  band: { low: number; high: number; point: number };
  unit?: string;
  prefix?: string;
  digits?: number;
}) {
  const format = (value: number) =>
    prefix +
    value.toLocaleString('en-GB', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  return (
    <span className="font-mono tabular whitespace-nowrap">
      {format(band.low)}
      <span className="text-ink-3">–</span>
      {format(band.high)}
      {unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{unit}</span>}
    </span>
  );
}

export function Estimate({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3">
      <Info className="mt-[1px] h-3 w-3 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[5px] border border-flag/40 bg-flag-soft px-3 py-2 text-xs leading-relaxed text-ink">
      <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-flag" />
      <span>{children}</span>
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
      <Info className="mt-[2px] h-3.5 w-3.5 shrink-0 text-ink-3" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11.5px] text-ink-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pass opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-pass" />
      </span>
      {label}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[5px] border border-fail/40 bg-fail-soft px-3 py-2 text-xs leading-relaxed text-ink">
      {children}
    </p>
  );
}

// ─── tables ──────────────────────────────────────────────────────────────
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                className="whitespace-nowrap border-b border-line-strong px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  highlight,
}: {
  children: ReactNode;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`align-top transition-colors hover:bg-surface-2 ${
        highlight ? 'bg-accent-soft/40' : ''
      }`}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  numeric,
  className = '',
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line px-2 py-2.5 align-top ${
        numeric ? 'whitespace-nowrap font-mono tabular' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

// ─── small formatters ────────────────────────────────────────────────────
export const money = (value: number) =>
  '$' + value.toLocaleString('en-GB', { maximumFractionDigits: value < 10 ? 2 : 0 });

export const affinityText = (value: number | null | undefined) =>
  value === null || value === undefined ? 'not docked' : `${value.toFixed(2)} kcal/mol`;

export const weeksText = (band: { low: number; high: number }) =>
  `${band.low.toFixed(0)}–${band.high.toFixed(0)} weeks`;
