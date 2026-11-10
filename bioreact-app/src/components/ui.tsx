/**
 * ui.tsx — the shared vocabulary of the interface.
 *
 * Every panel, button, chip and number in the app comes from here, so the
 * whole thing reads as one instrument rather than a collection of screens.
 * Two rules it exists to enforce:
 *
 *   1. Nothing is unlabelled. Panels take a `help` line that says what the
 *      thing is for, in words a biochemist would use; actions take a
 *      `hint`; a figure can carry a `basis` saying where it came from.
 *   2. An estimate never looks like a measurement. `Band` renders a range,
 *      `Estimate` marks a number as modelled rather than observed.
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
}: {
  title?: ReactNode;
  help?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'quiet' | 'warning';
  id?: string;
}) {
  const border =
    tone === 'warning'
      ? 'border-amber-300 bg-amber-50/60'
      : tone === 'quiet'
        ? 'border-slate-200 bg-slate-50/70'
        : 'border-slate-200 bg-white';
  return (
    <section id={id} className={`border ${border} rounded-lg`}>
      {(title || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-slate-200/80">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
            )}
            {help && <p className="mt-1 text-xs leading-relaxed text-slate-600">{help}</p>}
          </div>
          {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Grid({
  cols = 2,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const map = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 xl:grid-cols-3',
    4: 'md:grid-cols-2 xl:grid-cols-4',
  } as const;
  return <div className={`grid grid-cols-1 ${map[cols]} gap-4`}>{children}</div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
      <p className="mx-auto max-w-prose text-sm text-slate-600">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
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
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  icon?: ReactNode;
  hint?: string;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const tones: Record<ButtonTone, string> = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300',
    secondary:
      'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
    danger: 'bg-white text-rose-700 border border-rose-300 hover:bg-rose-50',
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${tones[tone]}`}
      >
        {icon}
        {children}
      </button>
      {hint && <span className="text-[11px] leading-tight text-slate-500">{hint}</span>}
    </span>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {help && <span className="text-[11px] leading-tight text-slate-500">{help}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 ' +
  'focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100';

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      className={inputClass}
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
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      className={inputClass}
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
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
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
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-400 accent-slate-900"
      />
      <span className="min-w-0">
        <span className="block text-sm text-slate-800">{label}</span>
        {help && <span className="block text-[11px] leading-tight text-slate-500">{help}</span>}
      </span>
    </label>
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
    pass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    flag: 'bg-amber-50 text-amber-900 border-amber-300',
    fail: 'bg-rose-50 text-rose-800 border-rose-300',
    info: 'bg-sky-50 text-sky-900 border-sky-300',
    accent: 'bg-slate-900 text-white border-slate-900',
    neutral: 'bg-slate-100 text-slate-700 border-slate-300',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
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
  const colour =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900';
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg leading-tight tabular-nums ${colour}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>}
      </div>
      {basis && <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{basis}</div>}
    </div>
  );
}

/** A modelled range. Always shows low–high; the point estimate is secondary. */
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
    <span className="font-mono tabular-nums">
      {format(band.low)}–{format(band.high)}
      {unit && <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>}
    </span>
  );
}

export function Estimate({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <Info className="h-3 w-3 shrink-0" />
      {children}
    </span>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
      {label}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-900">
      {children}
    </p>
  );
}

// ─── tables ──────────────────────────────────────────────────────────────
export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                className="whitespace-nowrap border-b border-slate-300 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
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
      className={`border-b border-slate-200 px-2 py-2 align-top ${
        numeric ? 'whitespace-nowrap font-mono tabular-nums' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

// ─── small formatters ────────────────────────────────────────────────────
export const money = (value: number) =>
  '$' +
  value.toLocaleString('en-GB', { maximumFractionDigits: value < 10 ? 2 : 0 });

export const affinityText = (value: number | null | undefined) =>
  value === null || value === undefined ? 'not docked' : `${value.toFixed(2)} kcal/mol`;

export const weeksText = (band: { low: number; high: number }) =>
  `${band.low.toFixed(0)}–${band.high.toFixed(0)} weeks`;
