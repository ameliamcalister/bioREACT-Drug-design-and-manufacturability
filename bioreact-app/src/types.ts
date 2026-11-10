/**
 * types.ts — the shapes the Python API returns.
 *
 * These mirror the payloads built in loop/serve.py, loop/critics.py and
 * loop/manufacture.py. Anything optional here is optional there too: a run
 * in progress has half of these fields missing, and the interface has to
 * render that state rather than wait for it.
 */

export type Verdict = 'pass' | 'flag' | 'fail';
export type RunMode = 'live' | 'cache' | 'mock' | 'fresh';
export type RouteKey =
  | 'chemical_synthesis'
  | 'chemo_enzymatic'
  | 'fermentation'
  | 'spps';

/** One critic complaint, and the specific change that would fix it. */
export interface Rejection {
  criterion: string;
  value: number | string | null;
  threshold: number | string | null;
  level: 'fail' | 'flag';
  reason: string;
  suggest: string;
}

export interface Descriptors {
  mw?: number;
  logp?: number;
  tpsa?: number;
  heavy_atoms?: number;
  stereocentres?: number;
  rotatable_bonds?: number;
  rings?: number;
  fused_ring_systems?: number;
  spiro_atoms?: number;
  macrocycle_size?: number;
  fsp3?: number;
  halogen_density?: number;
  sa_score?: number;
  aromatic_rings?: number;
  [key: string]: number | undefined;
}

/** A candidate after both critics have seen it. */
export interface AssessedCandidate {
  smiles: string;
  verdict: Verdict;
  manufacturable: boolean;
  affinity: number | null;
  meets_affinity?: boolean;
  rationale?: string;
  sa_score: number;
  estimated_steps: number;
  route_complexity: string;
  rejections: Rejection[];
  metrics?: Descriptors;
  synthesisability?: { verdict: Verdict; metrics?: Descriptors; rejections: Rejection[] };
  process?: { verdict: Verdict; group_flags: string[]; rejections: Rejection[] };
}

export interface ToolEvent {
  t: number;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface Round {
  round: number;
  status: string;
  changes_made: string | null;
  feedback_in: AssessedCandidate[];
  trace: ToolEvent[];
  candidates: { smiles: string; rationale?: string; affinity?: number | null }[];
  assessed?: AssessedCandidate[];
}

export interface DecisionRow {
  rank: number;
  smiles: string;
  verdict: Verdict;
  affinity: number | null;
  affinity_sd?: number | null;
  sa_score: number;
  estimated_steps: number;
  stereocentres: number;
  rotatable_bonds?: number;
  mw?: number;
  route_complexity: string;
  recommendation: 'make_first' | 'make' | 'backup' | 'redesign' | 'drop';
  recommendation_label: string;
  recommendation_why: string;
  pros: string[];
  cons: string[];
  rationale?: string;
}

export interface RunLog {
  status: string;
  model?: string;
  dock_mode?: string;
  target?: string;
  reference?: { name?: string; smiles?: string | null; affinity?: number | null };
  rounds: Round[];
  decision_table?: DecisionRow[];
  result?: {
    verdict_reason?: string;
    rounds?: number;
    elapsed_s?: number;
    best?: AssessedCandidate | null;
  };
}

export interface JobState {
  running: boolean;
  label: string;
  console: string;
}

export interface BackendState {
  designer: string;
  api_key_set: boolean;
  vina: boolean;
  obabel: boolean;
  dock_mode: string;
  chemistry: string;
}

export interface Status {
  loop: JobState;
  manufacture: JobState;
  running: boolean;
  label: string;
  console: string;
  backend: BackendState;
}

export interface TargetSummary {
  name: string;
  slug: string;
  description: string;
  grid_source: string;
  blind: boolean;
  box: (number | null)[];
  centre: (number | null)[];
  reference_name?: string;
  reference_smiles?: string | null;
  reference_affinity?: number | null;
  receptor_atoms?: number | null;
  chembl_target_id?: string | null;
}

/** An unoccupied region of the binding cavity beside a docked pose. */
export interface Void {
  rank: number;
  volume_a3: number;
  centre: number[];
  gap_to_ligand_a: number | null;
  direction_from_ligand: number[];
  lining_residues: string[];
  lining_counts: { hydrophobic: number; polar: number; charged: number };
  character: 'hydrophobic' | 'polar' | 'mixed';
  suggested_chemistry: string;
  grid_points: number;
}

export interface VoidResult {
  ok: boolean;
  error?: string;
  smiles?: string;
  voids: Void[];
  unoccupied_volume_a3?: number;
  receptor_atoms?: number;
  ligand_atoms?: number;
  method?: string;
  caveat?: string;
  note?: string;
  summary?: string;
}

export interface PoseResult {
  ok: boolean;
  error?: string;
  pdb?: string;
  affinity?: number | null;
  mode_scores?: number[];
  source?: string;
}

/** Property screen: published rule sets plus structural alerts. */
export interface ScreenResult {
  ok: boolean;
  error?: string;
  smiles: string;
  verdict: Verdict;
  descriptors: Record<string, number>;
  rule_sets: {
    key: string;
    name: string;
    citation: string;
    what_for: string;
    violations: number;
    allowed_violations: number;
    pass: boolean;
    checks: { descriptor: string; value: number; requirement: string; pass: boolean }[];
  }[];
  rule_sets_broken: string[];
  alerts: { name: string; family: 'PAINS' | 'Brenk'; scope: string; means: string }[];
  qed: number;
  proxies: { property: string; expectation: string; basis: string }[];
  disclaimer: string;
}

export interface Band {
  point: number;
  low: number;
  high: number;
}

export interface CostResult {
  route: RouteKey;
  scale_g: number;
  steps?: number;
  overall_yield?: number;
  pmi_kg_per_kg?: number;
  titre_g_per_l?: number;
  isolated_per_batch_g?: number;
  batches?: number;
  cost_per_gram_usd: Band;
  batch_total_usd: Band;
  one_off_development_usd: number;
  breakdown: { item: string; usd_per_gram: number; basis: string }[];
  premiums: { label: string; factor: number; detail: string }[];
  viable: boolean;
  viability_note: string | null;
  method: string;
}

export interface TimeResult {
  route: RouteKey;
  scale_g: number;
  phases: { phase: string; weeks: number; detail: string }[];
  total_weeks: Band;
  total_months: Band;
  method: string;
}

export interface RouteOption {
  route: RouteKey;
  label: string;
  fit: 'recommended' | 'viable' | 'poor';
  reasons: string[];
  caveats: string[];
  enzymes: { key: string; enzyme: string; replaces: string; why: string; matches: number }[];
  recommended: boolean;
}

/** One candidate's manufacturability assessment. */
export interface Manufacturability {
  ok: boolean;
  smiles: string;
  rank?: number;
  affinity?: number | null;
  rationale?: string;
  scale_g: number;
  scale_label: string;
  verdict: 'route_identified' | 'redesign_required';
  verdict_note: string;
  critic_verdict: Verdict;
  manufacturable: boolean;
  estimated_steps: number;
  sa_score: number;
  route_complexity: string;
  route: RouteKey;
  route_label: string;
  route_fit: string;
  route_reasons: string[];
  route_caveats: string[];
  enzymes: { key: string; enzyme: string; replaces: string; why: string; matches: number }[];
  route_options: RouteOption[];
  alternatives: {
    route: RouteKey;
    label: string;
    fit: string;
    cost_per_gram_usd: Band;
    total_weeks: Band;
    one_off_development_usd: number;
  }[];
  cost: CostResult;
  time: TimeResult;
  process_flags: { key: string; label: string; detail: string }[];
  limitations: string[];
  mode: 'agent' | 'rule_based';
  model: string;
  agent: {
    headline: string;
    justification: string;
    risks: string[];
    redesign_recommended: boolean;
    routes_costed: string[];
  };
  trace: { t: number; tool: string; args: Record<string, unknown>; ok: boolean; summary: string }[];
  tool_calls: number;
  agent_error?: string;
  elapsed_s?: number;
}

export interface Assumption {
  key: string;
  value: number;
  default: number;
  overridden: boolean;
  unit: string;
  min: number;
  max: number;
  provenance: string;
  note: string;
}

export interface ManufactureReport {
  ok: boolean;
  status?: 'running' | 'finished';
  progress?: { done: number; total: number };
  generated_at: string;
  mode: 'agent' | 'rule_based';
  model: string;
  scale_g: number;
  scale_label: string;
  overrides: Record<string, number>;
  assumptions: Assumption[];
  candidates: Manufacturability[];
  elapsed_s: number;
  method: string;
}

export interface MethodDocument {
  rubric: { criterion: string; flag_above: number; fail_above: number }[];
  rubric_note: string;
  property_rule_sets: {
    key: string;
    name: string;
    citation: string;
    what_for: string;
    allowed_violations: number;
    rules: string[];
  }[];
  assumptions: Assumption[];
  scales: { grams: number; label: string; purpose: string }[];
  routes: Record<string, string>;
  enzyme_classes: { key: string; enzyme: string; replaces: string; why: string }[];
  pocket_method: {
    spacing_a: number;
    clash_a: number;
    burial_axes: string;
    min_volume_a3: number;
    note: string;
  };
  docking: { engine: string; mode: string; exhaustiveness: number; note: string };
  target: TargetSummary | null;
  limitations: string[];
  attribution: string[];
}

export interface ChemblActives {
  ok: boolean;
  error?: string;
  from_cache?: boolean;
  cached_at?: string;
  note?: string;
  source?: string;
  target_chembl_id?: string;
  compounds?: {
    chembl_id: string;
    name: string;
    smiles: string;
    pchembl: number;
    assay_type: string;
    potency_nm: number;
    assay_description: string;
  }[];
}

/** The critics measured against molecules whose makeability we know. */
export interface EvaluationTier {
  tier: 'easy' | 'hard';
  n: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  misses: { name: string; truth: boolean; predicted: boolean; verdict: string; note?: string }[];
  rows: {
    name: string;
    smiles: string;
    truth: boolean;
    predicted: boolean;
    correct: boolean;
    verdict: string;
    sa_score: number;
    estimated_steps: number;
    route_complexity: string;
    note: string;
    top_rejection: string | null;
  }[];
}

export interface EvaluationResults {
  tiers: { easy: EvaluationTier; hard: EvaluationTier };
  combined: { n: number; correct: number; accuracy: number };
}
