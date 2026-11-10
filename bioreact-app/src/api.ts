/**
 * api.ts — one data layer, two sources.
 *
 * Live, the interface talks to the Python service (RDKit, AutoDock Vina,
 * the agents) through the Express proxy. Published as a static page, that
 * service does not exist, so the same calls read a recorded run frozen
 * into `public/demo/` by `loop/build_demo.py`.
 *
 * Which source is in use is settled once, at start-up, by asking the API
 * whether it is there. Everything downstream is identical either way,
 * except that the four actions which would start a computation refuse in
 * demo mode with an explanation the interface can show — rather than a
 * button that silently fails.
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

/** Thrown by anything that needs the backend when only the demo is there. */
export class DemoError extends ApiError {
  constructor(what: string) {
    super(
      `${what} needs the design service, which is not part of this published ` +
        `demo. Everything on screen is a recorded run. To run your own, clone ` +
        `the repository and start it with ./start.sh.`,
    );
  }
}

export type SourceMode = 'live' | 'demo';

interface DemoManifest {
  generated_at: string;
  verdict: string;
  target: string;
  target_description: string;
  rounds: number;
  headline: string;
  note: string;
  structures: Record<string, { light: string; dark: string }>;
  screens: Record<string, string>;
  poses: Record<string, string>;
  voids: Record<string, string>;
}

const BASE = import.meta.env.BASE_URL || '/';
const DEMO_ROOT = `${BASE}demo/`;

let mode: SourceMode = 'live';
let manifest: DemoManifest | null = null;

export const sourceMode = (): SourceMode => mode;
export const demoManifest = (): DemoManifest | null => manifest;

/**
 * Decide where the data comes from. Called once before the app renders.
 *
 * A short timeout matters: when the page is served statically there is
 * nothing listening, and the fetch should fail fast rather than leave the
 * visitor looking at an empty shell.
 */
export async function initDataSource(): Promise<SourceMode> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch('status', { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const body = (await response.json()) as Status & { demo?: boolean };
      if (!body.demo) {
        mode = 'live';
        return mode;
      }
    }
  } catch {
    /* no service here — fall through to the recorded run */
  }

  mode = 'demo';
  try {
    manifest = (await (await fetch(`${DEMO_ROOT}manifest.json`)).json()) as DemoManifest;
  } catch {
    manifest = null;
  }
  return mode;
}

// ─── transport ───────────────────────────────────────────────────────────
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

/** Live path, or the frozen file when there is no service. */
function read<T>(livePath: string, demoFile: string): Promise<T> {
  return mode === 'demo' ? get<T>(`${DEMO_ROOT}${demoFile}`) : get<T>(livePath);
}

function demoLookup(table: 'poses' | 'voids' | 'screens', smiles: string): string | null {
  const entry = manifest?.[table]?.[smiles.trim()];
  return entry ? `${DEMO_ROOT}${entry}` : null;
}

// ─── reads ───────────────────────────────────────────────────────────────
export const api = {
  status: () => read<Status>('status', 'status.json'),

  runLog: () =>
    mode === 'demo'
      ? get<RunLog>(`${DEMO_ROOT}run_log.json`)
      : get<RunLog>(`run_log.json?t=${Date.now()}`),

  manufactureReport: () =>
    mode === 'demo'
      ? get<ManufactureReport>(`${DEMO_ROOT}manufacture_report.json`)
      : get<ManufactureReport>(`manufacture_report.json?t=${Date.now()}`),

  evaluation: () =>
    mode === 'demo'
      ? get<EvaluationResults>(`${DEMO_ROOT}eval_results.json`)
      : get<EvaluationResults>(`eval_results.json?t=${Date.now()}`),

  method: () => read<MethodDocument>('method', 'method.json'),

  targets: () =>
    read<{ active: TargetSummary | null; targets: TargetSummary[] }>(
      'targets',
      'targets.json',
    ),

  pose: (smiles: string) => {
    if (mode === 'demo') {
      const file = demoLookup('poses', smiles);
      if (!file) {
        return Promise.resolve<PoseResult>({
          ok: false,
          error: 'this molecule’s pose is not part of the recorded demo',
        });
      }
      return get<PoseResult>(file);
    }
    return get<PoseResult>(`pose?smiles=${encodeURIComponent(smiles)}`);
  },

  voids: (smiles: string) => {
    if (mode === 'demo') {
      const file = demoLookup('voids', smiles);
      if (!file) {
        return Promise.resolve<VoidResult>({
          ok: false,
          error: 'no cavity analysis for this molecule in the recorded demo',
          voids: [],
        });
      }
      return get<VoidResult>(file);
    }
    return get<VoidResult>(`voids?smiles=${encodeURIComponent(smiles)}`);
  },

  screen: (smiles: string) => {
    if (mode === 'demo') {
      const file = demoLookup('screens', smiles);
      if (!file) throw new DemoError('Screening a new molecule');
      return get<ScreenResult>(file);
    }
    return get<ScreenResult>(`screen?smiles=${encodeURIComponent(smiles)}`);
  },

  receptor: async (): Promise<string> => {
    const path = mode === 'demo' ? `${DEMO_ROOT}receptor.pdb` : 'receptor';
    const response = await fetch(path);
    if (!response.ok) throw new ApiError(`receptor unavailable (HTTP ${response.status})`);
    return response.text();
  },

  chemblActives: (n = 6) =>
    mode === 'demo'
      ? get<ChemblActives>(`${DEMO_ROOT}chembl-actives.json`).catch(() => ({
          ok: false,
          error: 'not included in the recorded demo',
        }))
      : get<ChemblActives>(`chembl/actives?n=${n}`),

  /** Where the decision table and the full run can be downloaded. */
  downloads: () => ({
    csv: mode === 'demo' ? `${DEMO_ROOT}candidates.csv` : 'candidates.csv',
    json: mode === 'demo' ? `${DEMO_ROOT}run_log.json` : 'export.json',
  }),

  // ─── actions ───────────────────────────────────────────────────────────
  runLoop: (options: { mode: RunMode; rounds: number; candidates: number }) => {
    if (mode === 'demo') throw new DemoError('Running the design loop');
    return post<{ ok: true; label: string }>('run', options);
  },

  runManufacture: (options: {
    scale_g: number;
    rules_only?: boolean;
    overrides?: Record<string, number>;
    smiles?: string[];
  }) => {
    if (mode === 'demo') throw new DemoError('Costing the shortlist');
    return post<{ ok: true; label: string }>('manufacture', options);
  },

  runEvaluation: () => {
    if (mode === 'demo') throw new DemoError('Re-running the critic evaluation');
    return post<{ ok: true; label: string }>('eval');
  },

  stop: () => {
    if (mode === 'demo') throw new DemoError('Stopping a run');
    return post<{ ok: boolean; stopped: string[] }>('stop');
  },

  selectTarget: (slug: string) => {
    if (mode === 'demo') throw new DemoError('Switching target');
    return post<{ ok: true; target: TargetSummary }>('target/select', { slug });
  },

  createTarget: (body: Record<string, unknown>) => {
    if (mode === 'demo') throw new DemoError('Preparing a new target');
    return post<{ ok: true; target: TargetSummary }>('target', body);
  },
};

/**
 * The 2D structure for a molecule.
 *
 * Live, RDKit draws it on request, in a palette that suits the current
 * theme. In the demo both variants were drawn ahead of time.
 */
export function structureUrl(
  smiles: string,
  width = 320,
  height = 200,
  dark = false,
): string {
  if (mode === 'demo') {
    const entry = manifest?.structures?.[smiles.trim()];
    if (!entry) return '';
    return `${DEMO_ROOT}${dark ? entry.dark : entry.light}`;
  }
  return `svg?smiles=${encodeURIComponent(smiles)}&w=${width}&h=${height}${
    dark ? '&dark=1' : ''
  }`;
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
