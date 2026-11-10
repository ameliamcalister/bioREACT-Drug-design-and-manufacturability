/**
 * api.ts — every call to the Python side, in one place.
 *
 * The interface holds no chemistry and no state the backend owns: it reads
 * run_log.json and manufacture_report.json while they fill, and posts the
 * four actions a user can take (run the loop, assess the shortlist,
 * reproduce the evaluation, stop). Express proxies these paths to
 * localhost:8000, so relative URLs work in development and in a build.
 */
import type {
  ChemblActives,
  EvaluationResults,
  ManufactureReport,
  MethodDocument,
  PoseResult,
  RunLog,
  RunMode,
  ScreenResult,
  Status,
  TargetSummary,
  VoidResult,
} from './types';

export class ApiError extends Error {}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = String(body.error);
    } catch {
      /* a non-JSON error body tells us nothing more */
    }
    throw new ApiError(detail);
  }
  return (await response.json()) as T;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(
      `the design service replied with ${response.status}: ${text.slice(0, 160) || 'nothing'}`,
    );
  }
  const result = parsed as { ok?: boolean; error?: string };
  if (!response.ok || result.ok === false) {
    throw new ApiError(result.error || `HTTP ${response.status}`);
  }
  return parsed as T;
}

export const api = {
  status: () => get<Status>('/status'),
  runLog: () => get<RunLog>(`/run_log.json?t=${Date.now()}`),
  manufactureReport: () =>
    get<ManufactureReport>(`/manufacture_report.json?t=${Date.now()}`),
  method: () => get<MethodDocument>('/method'),
  evaluation: () => get<EvaluationResults>(`/eval_results.json?t=${Date.now()}`),
  targets: () =>
    get<{ active: TargetSummary | null; targets: TargetSummary[] }>('/targets'),
  pose: (smiles: string) => get<PoseResult>(`/pose?smiles=${encodeURIComponent(smiles)}`),
  voids: (smiles: string) => get<VoidResult>(`/voids?smiles=${encodeURIComponent(smiles)}`),
  screen: (smiles: string) => get<ScreenResult>(`/screen?smiles=${encodeURIComponent(smiles)}`),
  receptor: async (): Promise<string> => {
    const response = await fetch('/receptor');
    if (!response.ok) throw new ApiError(`receptor unavailable (HTTP ${response.status})`);
    return response.text();
  },
  chemblActives: (n = 6) => get<ChemblActives>(`/chembl/actives?n=${n}`),

  runLoop: (options: { mode: RunMode; rounds: number; candidates: number }) =>
    post<{ ok: true; label: string }>('/run', options),
  runManufacture: (options: {
    scale_g: number;
    rules_only?: boolean;
    overrides?: Record<string, number>;
    smiles?: string[];
  }) => post<{ ok: true; label: string }>('/manufacture', options),
  runEvaluation: () => post<{ ok: true; label: string }>('/eval'),
  stop: () => post<{ ok: boolean; stopped: string[] }>('/stop'),
  selectTarget: (slug: string) =>
    post<{ ok: true; target: TargetSummary }>('/target/select', { slug }),
  createTarget: (body: Record<string, unknown>) =>
    post<{ ok: true; target: TargetSummary }>('/target', body),
};

/** 2D structure, drawn server-side by RDKit. */
export function structureUrl(smiles: string, width = 320, height = 200): string {
  return `/svg?smiles=${encodeURIComponent(smiles)}&w=${width}&h=${height}`;
}

/** A file picked in the browser, as the base64 payload /target expects. */
export function readFileAsBase64(
  file: File,
): Promise<{ filename: string; b64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ filename: file.name, b64: String(reader.result).split(',')[1] ?? '' });
    reader.onerror = () => reject(new ApiError(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
