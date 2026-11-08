import React, { useMemo, useState } from 'react';
import {
  AcquisitionStrategy,
  AuditedParameterProvenanceRecord,
  BiologicCandidate,
  CandidatePathwayMode,
  ExperimentObservation,
  GroundedSimulatorParams,
  MassBalanceAndPhysicsResult,
  NextExperimentRecommendationSuite,
  ProposedNextExperimentRecipe,
  ReactorConfiguration,
  StirredTankPhysicsParams,
  SurrogateGridCell,
} from '../types/bioreact';
import {
  computeLiveEightSeedBenchmarkSummary,
  computeSurrogateSurfaceGrid,
  formatTwoSigFigs,
  getEightSeedBenchmarkCurve,
  REPRODUCIBILITY_MANIFEST,
  runSameSeedHeadToHeadComparison,
} from '../services/bioprocessEngine';
import {
  Play,
  FastForward,
  RotateCcw,
  Crosshair,
  Lock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { NextExperimentRecommendationsPanel } from './NextExperimentRecommendationsPanel';

interface BayesianOptimiserPanelProps {
  candidate: BiologicCandidate;
  selectedReactor: ReactorConfiguration;
  isReactorSignedOff: boolean;
  groundedParams: GroundedSimulatorParams;
  observations: ExperimentObservation[];
  onGoToReactorSignOff: () => void;
  onRunNextExperiment: (
    strategy: AcquisitionStrategy,
    manualCoords?: { x1_vvd: number; x2_do: number; tempC?: number }
  ) => void;
  onRunBatchExperiments: (strategy: AcquisitionStrategy, count: number) => void;
  onResetExperiments: () => void;
  scaleUpPhysics?: MassBalanceAndPhysicsResult;
  candidatePathwayMode?: CandidatePathwayMode;
  onApplyMicrospargerFix?: () => void;
  selectedOrganismId?: import('../types/bioreact').OrganismSystemId;
  isQuantitativeOptimisationAllowed?: boolean;
  onSwitchToCalibratedChoDemo?: () => void;
  recommendationSuite?: NextExperimentRecommendationSuite;
  strParams?: StirredTankPhysicsParams;
  provenanceLedger?: AuditedParameterProvenanceRecord[];
  onApplyExperimentHardwareToStage5?: (recipe: ProposedNextExperimentRecipe) => void;
  onExecuteReviewedExperimentInBo?: (
    recipe: ProposedNextExperimentRecipe,
    reviewerName: string,
    reviewerNotes: string
  ) => void;
  onTriggerAbstentionDemo?: () => void;
}

type HeatmapLayer = 'gp_mean' | 'gp_uncertainty' | 'prob_feasible' | 'constrained_ei';

export const BayesianOptimiserPanel: React.FC<BayesianOptimiserPanelProps> = ({
  candidate,
  selectedReactor,
  isReactorSignedOff,
  groundedParams,
  observations,
  onGoToReactorSignOff,
  onRunNextExperiment,
  onRunBatchExperiments,
  onResetExperiments,
  scaleUpPhysics,
  candidatePathwayMode = 'established_biologic',
  onApplyMicrospargerFix,
  selectedOrganismId = 'cho_mammalian',
  isQuantitativeOptimisationAllowed = true,
  onSwitchToCalibratedChoDemo,
  recommendationSuite,
  strParams,
  provenanceLedger = [],
  onApplyExperimentHardwareToStage5,
  onExecuteReviewedExperimentInBo,
  onTriggerAbstentionDemo,
}) => {
  const canRunQuantitativeBo =
    isReactorSignedOff &&
    isQuantitativeOptimisationAllowed &&
    selectedOrganismId === 'cho_mammalian' &&
    candidatePathwayMode !== 'small_molecule_chemical';
  const [showNextExperimentsPanel, setShowNextExperimentsPanel] = useState<boolean>(true);
  const [activeStrategy, setActiveStrategy] = useState<AcquisitionStrategy>(
    'Constrained BO (EI × P_feas)'
  );
  const [heatmapLayer, setHeatmapLayer] = useState<HeatmapLayer>('gp_mean');
  const [chartTab, setChartTab] = useState<'same_seed' | 'benchmark_8seed'>('same_seed');
  const [selectedSeed, setSelectedSeed] = useState<number>(1);
  const [hoveredCell, setHoveredCell] = useState<SurrogateGridCell | null>(null);

  const [manualVvd, setManualVvd] = useState<number>(2.4);
  const [manualDo, setManualDo] = useState<number>(48);
  const [manualTemp, setManualTemp] = useState<number>(groundedParams.operatingTempC);
  const [showBoExplainer, setShowBoExplainer] = useState<boolean>(true);
  const [explainerStep, setExplainerStep] = useState<number>(1);

  const gridSteps = 17;
  const gridCells = useMemo(
    () => computeSurrogateSurfaceGrid(observations, groundedParams, selectedReactor, gridSteps),
    [observations, groundedParams, selectedReactor]
  );

  const feasibleObs = useMemo(() => observations.filter((o) => o.isFeasible), [observations]);
  const bestObservation = useMemo(() => {
    if (feasibleObs.length === 0) return observations[0];
    return feasibleObs.reduce((best, cur) =>
      cur.volumetricProductivityMgLDay > best.volumetricProductivityMgLDay ? cur : best
    );
  }, [feasibleObs, observations]);

  const nextSuggestedCell = useMemo(() => {
    if (gridCells.length === 0) return null;
    return gridCells.reduce((best, cur) =>
      cur.constrainedEI > best.constrainedEI ? cur : best
    );
  }, [gridCells]);

  // Same-seed transparent head-to-head comparison against Random Search
  const sameSeedComparison = useMemo(
    () =>
      runSameSeedHeadToHeadComparison(
        selectedSeed,
        observations.length,
        groundedParams,
        selectedReactor
      ),
    [selectedSeed, observations.length, groundedParams, selectedReactor]
  );

  const liveEightSeedSummary = useMemo(
    () =>
      computeLiveEightSeedBenchmarkSummary(
        observations.length,
        groundedParams,
        selectedReactor
      ),
    [observations.length, groundedParams, selectedReactor]
  );

  const [eightSeedCurveSource, setEightSeedCurveSource] = useState<'live_computed' | 'illustrative_ref'>('live_computed');
  const [showFlatPenaltyCurve, setShowFlatPenaltyCurve] = useState<boolean>(false);

  const benchmarkPoints = useMemo(() => {
    const scale =
      selectedReactor.id === 'str_perfusion'
        ? 1.0
        : selectedReactor.id === 'hollow_fibre'
        ? 0.85
        : selectedReactor.id === 'str_fed_batch'
        ? 0.48
        : 0.72;
    return getEightSeedBenchmarkCurve(scale);
  }, [selectedReactor]);

  const getCellFillColor = (cell: SurrogateGridCell): string => {
    if (heatmapLayer === 'prob_feasible') {
      const p = cell.probFeasible;
      if (p >= 0.82) return '#059669';
      if (p >= 0.65) return '#10B981';
      if (p >= 0.48) return '#F59E0B';
      if (p >= 0.30) return '#F97316';
      return '#E11D48';
    }

    if (heatmapLayer === 'gp_uncertainty') {
      const maxStd = Math.max(5.0, ...gridCells.map((c) => c.stdDev));
      const norm = Math.min(1, Math.max(0, cell.stdDev / maxStd));
      const r = Math.round(248 - norm * 120);
      const g = Math.round(250 - norm * 165);
      const b = Math.round(252 - norm * 25);
      return `rgb(${r}, ${g}, ${b})`;
    }

    if (heatmapLayer === 'constrained_ei') {
      const maxEi = Math.max(0.1, ...gridCells.map((c) => c.constrainedEI));
      const norm = Math.min(1, Math.max(0, cell.constrainedEI / maxEi));
      const r = Math.round(241 - norm * 204);
      const g = Math.round(245 - norm * 146);
      const b = Math.round(249 - norm * 14);
      return `rgb(${r}, ${g}, ${b})`;
    }

    const minProd = Math.min(...gridCells.map((c) => c.meanProductivity));
    const maxProd = Math.max(minProd + 10, ...gridCells.map((c) => c.meanProductivity));
    const norm = Math.min(
      1,
      Math.max(0, (cell.meanProductivity - minProd) / (maxProd - minProd))
    );
    if (!cell.trueFeasible) {
      const r = Math.round(234 - norm * 35);
      const g = Math.round(218 - norm * 50);
      const b = Math.round(222 - norm * 45);
      return `rgb(${r}, ${g}, ${b})`;
    }
    const r = Math.round(232 - norm * 202);
    const g = Math.round(244 - norm * 120);
    const b = Math.round(252 - norm * 38);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const noFeasibleGridPointExists = useMemo(
    () => gridCells.length > 0 && gridCells.every((c) => !c.trueFeasible),
    [gridCells]
  );

  return (
    <div className="space-y-8">
      {/* Small-Molecule Modality Refusal Banner */}
      {candidatePathwayMode === 'small_molecule_chemical' && (
        <div className="bg-amber-50 border-2 border-amber-500 p-5 flex items-start gap-3 text-xs text-amber-950">
          <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-mono font-bold uppercase">
              OUTSIDE SUPPORTED MODEL DOMAIN — SMALL-MOLECULE CANDIDATE CANNOT BE SENT TO CHO PERFUSION OPTIMISER
            </div>
            <p>
              The selected candidate is a synthetic small-molecule ligand (MRP1 (ABCC1) Biphenyl
              Sulfonamide, MW 412 Da, −10.82 kcal/mol against MRP1). Small molecules are produced via organic chemical synthesis
              (3-step Suzuki + sulfonamide route), not mammalian cell-culture perfusion.
            </p>
          </div>
        </div>
      )}

      {/* Unvalidated Organism / Insufficient Data Quantitative BO Lock Banner */}
      {(selectedOrganismId !== 'cho_mammalian' || !isQuantitativeOptimisationAllowed) &&
        candidatePathwayMode !== 'small_molecule_chemical' && (
          <div className="bg-amber-50 border-2 border-amber-500 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs text-amber-950">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-mono font-bold uppercase text-amber-900">
                  {selectedOrganismId !== 'cho_mammalian'
                    ? `CONCEPTUAL RESEARCH MODEL — NOT VALIDATED (${selectedOrganismId.toUpperCase()}): QUANTITATIVE OPTIMISATION DISABLED`
                    : 'INSUFFICIENT DATA FOR QUANTITATIVE OPTIMISATION — PRE-MODELLING APPROVAL REQUIRED'}
                </div>
                <p className="leading-relaxed">
                  {selectedOrganismId !== 'cho_mammalian'
                    ? 'bioREACT never reuses CHO-K1 Gaussian Process kinetic parameters for non-CHO organisms (HEK293, E. coli, K. phaffii, Skeletal Muscle, Microalgae). First-principles mass balances and reactor screening are available, but quantitative Bayesian optimisation is disabled rather than fabricating unvalidated surrogate results.'
                    : 'Research-stage dissertation protein requires explicit approval of molecular identity, expression host, literature references, and experimentally measured parameters (q_p, q_O2, μ_max) before quantitative optimisation.'}
                </p>
              </div>
            </div>
            {onSwitchToCalibratedChoDemo && (
              <button
                type="button"
                onClick={onSwitchToCalibratedChoDemo}
                className="px-3.5 py-2 text-xs font-mono font-semibold bg-slate-900 text-white hover:bg-blue-700 shrink-0 cursor-pointer whitespace-nowrap"
              >
                Switch to Calibrated CHO-K1 Demo →
              </button>
            )}
          </div>
        )}

      {/* 500 L Oxygen Balance Failure Block Banner */}
      {scaleUpPhysics && scaleUpPhysics.otrMmolPerLHour < scaleUpPhysics.ourMmolPerLHour && (
        <div className="bg-rose-50 border-2 border-rose-500 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs text-rose-950">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-mono font-bold uppercase text-rose-800">
                500 L OXYGEN-TRANSFER DEFICIT DETECTED — PRESENT OPERATING POINT REJECTED (OTR ={' '}
                {scaleUpPhysics.otrMmolPerLHour.toFixed(1)} vs OUR ={' '}
                {scaleUpPhysics.ourMmolPerLHour.toFixed(1)} mmol/L/h)
              </div>
              <p>
                Under the current 500 L vessel configuration (open-pipe sparging), oxygen transfer is
                insufficient by{' '}
                <strong className="font-mono">
                  {(scaleUpPhysics.ourMmolPerLHour - scaleUpPhysics.otrMmolPerLHour).toFixed(1)} mmol/L/h
                </strong>
                . Safety Gates 02 &amp; 04 are blocked. Investigate switching to a sintered microsparger
                + 60% O₂ enrichment or lowering cell density before approving experimental testing.
              </p>
            </div>
          </div>
          {onApplyMicrospargerFix && (
            <button
              type="button"
              onClick={onApplyMicrospargerFix}
              className="px-3.5 py-2 text-xs font-mono font-semibold bg-emerald-700 text-white hover:bg-emerald-800 shrink-0 cursor-pointer"
            >
              Test Microsparger + 60% O₂ Redesign →
            </button>
          )}
        </div>
      )}

      {/* Explicit Abstention Banner when NO feasible solution exists in the evaluated design space */}
      {noFeasibleGridPointExists && (
        <div className="bg-rose-950 text-white border-2 border-rose-500 p-5 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-mono font-bold uppercase text-rose-300">
              NO FEASIBLE SOLUTION IDENTIFIED WITHIN THE EVALUATED MODEL AND PARAMETER BOUNDS
            </div>
            <p className="text-slate-200">
              Across all 289 evaluated (VVD, DO%) grid points, cellular oxygen demand (OUR) or
              hydrodynamic shear (τ) violates the specified hard engineering thresholds. The agent
              correctly abstains from recommending an optimal setpoint and requests a redesign of
              parameter assumptions (q_O2, τ_crit) or reactor mass-transfer hardware.
            </p>
          </div>
        </div>
      )}

      {/* If user hasn't signed off a reactor in Stage 2, show sign-off reminder banner */}
      {!isReactorSignedOff && (
        <div className="bg-amber-50 border border-amber-300 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-mono text-amber-950">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              STAGE 2 SIGN-OFF REQUIRED: Bioreactor configuration approval is currently blocked or pending review. Resolve any 500 L oxygen deficit and sign off at Gate 2 to unlock new wet-lab recommendations.
            </span>
          </div>
          <button
            type="button"
            onClick={onGoToReactorSignOff}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 cursor-pointer whitespace-nowrap"
          >
            Inspect Stage 2 / Gate 2
          </button>
        </div>
      )}

      {/* Top Banner: Single Signed-Off Reactor + Step-by-Step BO Algorithm Mechanics */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-slate-500 mb-1">
              03. STAGE 3 · CONTINUOUS-MARGIN CONSTRAINED BAYESIAN OPTIMISATION WORKBENCH
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              Optimising Signed-Off Configuration: {selectedReactor.name}
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Rejects infeasible conditions via hard biochemical engineering boundaries (<span className="font-mono">OTR ≥ OUR</span>, <span className="font-mono">τ ≤ {groundedParams.shearThresholdPa} Pa</span>, <span className="font-mono">Viability ≥ {groundedParams.minViabilityPercent}%</span>) rather than arbitrary score penalties. Models a continuous constraint margin alongside the GP objective surrogate.
            </p>
          </div>

          <div className="flex flex-wrap items-stretch gap-3 shrink-0 font-mono text-xs">
            <div className="bg-amber-50 border border-amber-300 px-4 py-2.5 text-left">
              <div className="text-[10px] text-amber-900 font-semibold uppercase">
                1. BEST OPTIMISER SCORE (RUN #{bestObservation?.iteration})
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                ~{formatTwoSigFigs(bestObservation?.volumetricProductivityMgLDay ?? 180)} value units/L/day (synthetic cost basis)
              </div>
              <div className="text-[10px] text-slate-600">
                Economic utility score (revenue − synthetic media/power/O₂ cost)
              </div>
            </div>

            <div className="bg-teal-50 border border-teal-300 px-4 py-2.5 text-left">
              <div className="text-[10px] text-teal-900 font-semibold uppercase">
                2. PHYSICAL VOLUMETRIC PRODUCTIVITY (X_v · q_p)
              </div>
              <div className="text-sm font-bold text-teal-950 mt-0.5 tabular-nums">
                ~{formatTwoSigFigs(bestObservation?.meanVolumetricProductivityMgPerLPerDay ?? 1500)} mg/L/day
              </div>
              <div className="text-[10px] text-slate-600">
                mean_volumetric_productivity_mg_per_L_per_day ({bestObservation?.viableCellDensityE6.toFixed(0)}×10⁶/mL × q_p)
              </div>
            </div>

            <div className="text-right bg-slate-50 border border-slate-200 px-4 py-2.5">
              <div className="text-slate-500 text-[10px]">LOCKED STAGE 3 TARGET (1 OF 6)</div>
              <div className="font-bold text-slate-900 mt-0.5">{selectedReactor.shortName}</div>
              <div className="text-emerald-700 text-[11px]">
                Retention R = {(selectedReactor.retentionFactorR * 100).toFixed(1)}%
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowNextExperimentsPanel(true);
                const el = document.getElementById('bo-next-experiment-recommendations');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              Propose Next Experiments (A/B/C)
            </button>
          </div>
        </div>

        {/* How the Bayesian Optimisation Algorithm Works (6-Step Visual Pipeline) */}
        <div className="pt-5">
          <div className="text-xs font-mono text-slate-500 mb-2.5">
            HOW THE CONSTRAINED BAYESIAN OPTIMISATION ALGORITHM WORKS (STEP-BY-STEP MECHANICS)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200">
              <div className="font-mono font-bold text-slate-900">1. Initial LHS Design</div>
              <p className="text-slate-600 mt-1 text-[11px]">
                4 space-filling Latin Hypercube points sample the (VVD, DO%) domain.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <div className="font-mono font-bold text-blue-700">2. GP Surrogate μ±σ</div>
              <p className="text-slate-600 mt-1 text-[11px]">
                RBF Gaussian Process predicts mean yield μ(x) and epistemic uncertainty σ(x).
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <div className="font-mono font-bold text-emerald-700">3. Margin Classifier</div>
              <p className="text-slate-600 mt-1 text-[11px]">
                Continuous constraint margin prevents flat binary collapse when &lt;25% is feasible.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <div className="font-mono font-bold text-slate-900">4. Acquisition α(x)</div>
              <p className="text-slate-600 mt-1 text-[11px]">
                Maximises α(x) = EI(x) × P(margin ≥ 0 | x) to balance exploration vs feasibility.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <div className="font-mono font-bold text-amber-800">5. Next Experiment</div>
              <p className="text-slate-600 mt-1 text-[11px]">
                Recommends ({nextSuggestedCell?.x1_vvd.toFixed(2)} VVD, {nextSuggestedCell?.x2_do}% DO) with cEI = {nextSuggestedCell?.constrainedEI.toFixed(2)}.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <div className="font-mono font-bold text-slate-900">6. Model Update</div>
              <p className="text-slate-600 mt-1 text-[11px]">
                Evaluates OTR/OUR &amp; shear physics, appends observation #{observations.length + 1}, refits GP.
              </p>
            </div>
          </div>
        </div>

        {/* Beginner-Friendly Interactive 4-Step Bayesian Optimisation & Gaussian Process Explainer */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-teal-700 font-semibold">
                BEGINNER-FRIENDLY INTUITIVE GUIDE · BAYESIAN BELIEF UPDATING IN BIOPROCESS DESIGN
              </span>
              <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                How Bayesian Optimisation &amp; Gaussian Process Surrogates Choose the Next Experiment
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowBoExplainer((prev) => !prev)}
              className="text-xs font-mono text-blue-700 hover:underline cursor-pointer shrink-0"
            >
              {showBoExplainer ? 'Hide Interactive 4-Step Explainer ▲' : 'Show Interactive 4-Step Explainer ▼'}
            </button>
          </div>

          {showBoExplainer && (
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 space-y-4 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left 5 Cols: Intuitive Analogy & Why a Gaussian Process */}
                <div className="lg:col-span-5 bg-white border border-slate-200 p-4 space-y-2.5">
                  <div className="font-mono font-semibold text-slate-900 uppercase text-[11px]">
                    INTUITIVE CONCEPT (PRIOR BELIEF → EVIDENCE → POSTERIOR UPDATE)
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    Just like Bayesian reasoning updates an initial prior belief when new evidence arrives
                    (e.g., the classic librarian-vs-farmer example from lectures), <strong>Bayesian
                    optimisation</strong> decides which bioreactor experiment to run next when you cannot
                    afford to test every combination of Perfusion Rate (<span className="font-mono">VVD</span>)
                    and Dissolved Oxygen (<span className="font-mono">DO%</span>).
                  </p>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-mono font-semibold text-blue-800 text-[11px]">
                      Why a Gaussian Process (GP)?
                    </div>
                    <p className="text-slate-600">
                      Unlike a simple curve fit that only outputs a single number, a Gaussian Process
                      estimates both: (1) the <strong>predicted yield μ(x)</strong> and (2) the{' '}
                      <strong>uncertainty σ(x)</strong> where we have not yet tested.
                    </p>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                    <div className="font-mono font-semibold text-[11px]">
                      CRITICAL MODEL ASSUMPTION NOTICE:
                    </div>
                    <p>
                      The acquisition score{' '}
                      <span className="font-mono font-semibold">EI(x) × P(feasible | x)</span> is a{' '}
                      <strong>model-based feasibility estimate under assumed mass-balance equations</strong>
                      —not a validated probability of real-world clinical or manufacturing safety.
                    </p>
                  </div>
                </div>

                {/* Right 7 Cols: Interactive 4-Step Walkthrough */}
                <div className="lg:col-span-7 bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                    <div className="font-mono font-semibold text-teal-800">
                      INTERACTIVE WALKTHROUGH · STEP {explainerStep} OF 4
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={explainerStep <= 1}
                        onClick={() => setExplainerStep((s) => Math.max(1, s - 1))}
                        className="px-2.5 py-1 text-xs font-mono border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                      >
                        ← Previous
                      </button>
                      {[1, 2, 3, 4].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setExplainerStep(st)}
                          className={`px-2.5 py-1 text-xs font-mono border cursor-pointer ${
                            explainerStep === st
                              ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Step {st}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={explainerStep >= 4}
                        onClick={() => setExplainerStep((s) => Math.min(4, s + 1))}
                        className="px-2.5 py-1 text-xs font-mono bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 cursor-pointer"
                      >
                        {explainerStep === 1
                          ? 'Fit a Model →'
                          : explainerStep === 2
                          ? 'Score Candidates →'
                          : explainerStep === 3
                          ? 'Update Belief →'
                          : 'Done'}
                      </button>
                    </div>
                  </div>

                  {explainerStep === 1 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Step 1/4: Start with a Few Space-Filling Experiments (Initial Prior Evidence)
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        We begin by testing 4 initial operating conditions across the design space (Latin
                        Hypercube runs #1–#4). For example, Run #1 at low perfusion (1.05 VVD, 26% DO) is
                        feasible (~160 value units/L/day; ~1,300 mg/L/day physical yield), whereas Run #4 at extreme perfusion (3.75 VVD, 76% DO)
                        violates shear and oxygen transfer constraints. Much of the intermediate space
                        remains unexplored.
                      </p>
                    </div>
                  )}

                  {explainerStep === 2 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Step 2/4: Fit Two Gaussian Process Surrogates — Objective Score μ(x) ± σ(x) &amp; Constraint Margin g(x)
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        Instead of assigning an arbitrary −500 cliff penalty to failed runs (which warps GP
                        gradients near boundaries), bioREACT fits one GP to the synthetic objective score{' '}
                        <span className="font-mono">μ(x) ± σ(x)</span> (value units/L/day) and a second GP to the continuous
                        engineering margin{' '}
                        <span className="font-mono">
                          g(x) = min((OTR−OUR)/8, (τ_crit−τ)/0.45, (Viab−90)/6)
                        </span>
                        . Regions far from existing data have wide uncertainty <span className="font-mono">σ(x)</span>.
                      </p>
                    </div>
                  )}

                  {explainerStep === 3 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Step 3/4: Balance Exploitation, Exploration &amp; Feasibility via EI(x) × P(feasible | x)
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        <strong>Expected Improvement EI(x)</strong> is high both where predicted score{' '}
                        <span className="font-mono">μ(x)</span> beats our current best feasible run{' '}
                        <span className="font-mono">
                          y⁺ = ~{formatTwoSigFigs(bestObservation?.volumetricProductivityMgLDay ?? 180)} value units/L/day (synthetic cost basis)
                        </span>{' '}
                        (exploitation) and where uncertainty <span className="font-mono">σ(x)</span> is large
                        (exploration). Multiplying by{' '}
                        <span className="font-mono">P(margin ≥ 0 | x) = Φ(μ_g / σ_g)</span> steers the search
                        away from oxygen-starved or high-shear regions.
                      </p>
                    </div>
                  )}

                  {explainerStep === 4 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Step 4/4: Propose Next Condition ({nextSuggestedCell?.x1_vvd.toFixed(2)} VVD, {nextSuggestedCell?.x2_do}% DO) &amp; Update Posterior
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        The highest constrained acquisition score selects the next candidate operating point.
                        Once evaluated in the simulator (or approved by a scientist at Checkpoint 04 for a
                        wet-lab Ambr® 250 test), the new result shrinks uncertainty <span className="font-mono">σ(x)</span>{' '}
                        and refines the surrogate for the next iteration.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Uncertainty-Aware Ranked Next Experiment Recommendations & 3-Level Abstention Engine */}
      {recommendationSuite &&
        strParams &&
        onApplyExperimentHardwareToStage5 &&
        onExecuteReviewedExperimentInBo &&
        showNextExperimentsPanel && (
          <div id="bo-next-experiment-recommendations">
            <NextExperimentRecommendationsPanel
              candidate={candidate}
              recommendationSuite={recommendationSuite}
              strParams={strParams}
              provenanceLedger={provenanceLedger}
              selectedOrganismId={selectedOrganismId}
              candidatePathwayMode={candidatePathwayMode}
              onApplyExperimentHardwareToStage5={onApplyExperimentHardwareToStage5}
              onExecuteReviewedExperimentInBo={onExecuteReviewedExperimentInBo}
              onTriggerAbstentionDemo={onTriggerAbstentionDemo}
              onRestoreCalibratedChoModel={onSwitchToCalibratedChoDemo}
              compactContext="stage6_optimiser"
            />
          </div>
        )}

      {/* Asymmetric Split Console: Left = BO Acquisition & Manual Probe Controls | Right = 2D GP Heatmap + Same-Seed Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Control Column (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 p-6 space-y-6">
          <div className="pb-4 border-b border-slate-200">
            <div className="text-xs font-mono text-slate-500">ACQUISITION CONTROLLER</div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Sequential Experiment Runner
            </h3>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-800">
              Acquisition Function Strategy
            </label>
            {(
              [
                {
                  id: 'Constrained BO (EI × P_feas)',
                  title: 'Constrained BO: EI(x) × P(margin ≥ 0)',
                  desc: 'Decoupled GP objective + continuous constraint margin surrogate.',
                },
                {
                  id: 'Flat-Penalty GP (-500)',
                  title: 'Flat-Penalty GP (−500 on Infeasible)',
                  desc: 'Single GP with −500 cliff. Illustrates surrogate distortion near shear limit.',
                },
                {
                  id: 'Random Search',
                  title: 'Uniform Random Search Baseline',
                  desc: 'Uninformed sampling across (VVD, DO) design space.',
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveStrategy(item.id)}
                className={`w-full text-left p-3 border transition-colors cursor-pointer ${
                  activeStrategy === item.id
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>

          {/* Execution Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={!canRunQuantitativeBo}
              onClick={() => onRunNextExperiment(activeStrategy)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {canRunQuantitativeBo
                  ? `Suggest & Run Next Experiment (Step #${observations.length + 1})`
                  : 'Quantitative BO Locked (Unvalidated / Unapproved)'}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canRunQuantitativeBo}
                onClick={() => onRunBatchExperiments(activeStrategy, 4)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Run +4 Trials</span>
              </button>
              <button
                type="button"
                onClick={onResetExperiments}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Run (10)</span>
              </button>
            </div>
          </div>

          {/* Manual Wet-Lab / In-Silico Parameter Probe */}
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div>
              <div className="text-xs font-mono text-slate-500">MANUAL PARAMETER PROBE</div>
              <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
                Test Custom Operating Setpoint
              </h4>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="manual-vvd" className="font-medium text-slate-800">
                  Perfusion Flow Rate (<span className="font-mono">x₁</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {manualVvd.toFixed(2)} VVD
                </span>
              </div>
              <input
                id="manual-vvd"
                type="range"
                min={0.6}
                max={4.2}
                step={0.05}
                value={manualVvd}
                onChange={(e) => setManualVvd(parseFloat(e.target.value))}
                className="w-full mt-1 accent-slate-800 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="manual-do" className="font-medium text-slate-800">
                  Dissolved Oxygen Setpoint (<span className="font-mono">x₂</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {manualDo}% Air Sat.
                </span>
              </div>
              <input
                id="manual-do"
                type="range"
                min={15}
                max={85}
                step={1}
                value={manualDo}
                onChange={(e) => setManualDo(parseInt(e.target.value, 10))}
                className="w-full mt-1 accent-slate-800 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="manual-temp" className="font-medium text-slate-800">
                  Culture Temperature
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {manualTemp.toFixed(1)} °C
                </span>
              </div>
              <input
                id="manual-temp"
                type="range"
                min={31.0}
                max={37.0}
                step={0.5}
                value={manualTemp}
                onChange={(e) => setManualTemp(parseFloat(e.target.value))}
                className="w-full mt-1 accent-slate-800 cursor-pointer"
              />
            </div>

            <button
              type="button"
              disabled={!canRunQuantitativeBo}
              onClick={() =>
                onRunNextExperiment('Engineer Manual Probe', {
                  x1_vvd: manualVvd,
                  x2_do: manualDo,
                  tempC: manualTemp,
                })
              }
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Crosshair className="w-3.5 h-3.5 text-blue-600" />
              <span>Run Manual Probe at ({manualVvd.toFixed(2)} VVD, {manualDo}% DO)</span>
            </button>
          </div>
        </div>

        {/* Right Main Viewport (8 cols): 2D Surrogate Heatmap with Hatching + Head-to-Head Same-Seed Comparison */}
        <div className="lg:col-span-8 space-y-6">
          {/* 2D Surrogate Surface & Feasibility Boundary Inspector */}
          <div className="bg-white border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-mono text-slate-500">
                  SYNTHETIC SURROGATE OUTPUT · 2D GP SURFACE &amp; HATCHED INFEASIBLE ZONE
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                  Perfusion Flow Rate (<span className="font-mono">x₁</span>) vs. Dissolved Oxygen (<span className="font-mono">x₂</span>) Operating Map
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
                {(
                  [
                    ['gp_mean', 'GP Mean μ(x)'],
                    ['gp_uncertainty', 'Uncertainty σ(x)'],
                    ['prob_feasible', 'Margin P(Feas)'],
                    ['constrained_ei', 'Acquisition EI×P'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHeatmapLayer(key)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      heatmapLayer === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5 items-center">
              <div className="md:col-span-7">
                <svg
                  viewBox="0 0 380 330"
                  className="w-full h-auto cursor-crosshair select-none border border-slate-200 bg-slate-50"
                  role="img"
                  aria-label="2D Gaussian Process surrogate heatmap with hatching over infeasible regions"
                >
                  <defs>
                    <pattern
                      id="infeasibleDiagonalHatch"
                      width="6"
                      height="6"
                      patternTransform="rotate(45 0 0)"
                      patternUnits="userSpaceOnUse"
                    >
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="6"
                        stroke="#9F1239"
                        strokeWidth="1.2"
                        strokeOpacity="0.32"
                      />
                    </pattern>
                  </defs>

                  <text
                    x={205}
                    y={318}
                    textAnchor="middle"
                    className="text-[10px] font-mono fill-slate-700 font-semibold"
                  >
                    PERFUSION FLOW RATE x₁ (VESSEL VOLUMES / DAY, VVD)
                  </text>
                  <text
                    x={14}
                    y={155}
                    textAnchor="middle"
                    transform="rotate(-90, 14, 155)"
                    className="text-[10px] font-mono fill-slate-700 font-semibold"
                  >
                    DISSOLVED OXYGEN SETPOINT x₂ (% AIR SAT.)
                  </text>

                  {gridCells.map((cell, idx) => {
                    const col = Math.floor(idx / gridSteps);
                    const row = idx % gridSteps;
                    const cellW = 310 / gridSteps;
                    const cellH = 260 / gridSteps;
                    const x = 52 + col * cellW;
                    const y = 20 + (gridSteps - 1 - row) * cellH;

                    return (
                      <g
                        key={`${cell.x1_vvd}-${cell.x2_do}`}
                        onMouseEnter={() => setHoveredCell(cell)}
                        onClick={() => {
                          if (!isReactorSignedOff) return;
                          onRunNextExperiment('Engineer Manual Probe', {
                            x1_vvd: cell.x1_vvd,
                            x2_do: cell.x2_do,
                          });
                        }}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={cellW - 0.8}
                          height={cellH - 0.8}
                          fill={getCellFillColor(cell)}
                        />
                        {/* Diagonal Hatching where culture fails constraints */}
                        {!cell.trueFeasible && (
                          <rect
                            x={x}
                            y={y}
                            width={cellW - 0.8}
                            height={cellH - 0.8}
                            fill="url(#infeasibleDiagonalHatch)"
                          />
                        )}
                      </g>
                    );
                  })}

                  {[0.6, 1.5, 2.4, 3.3, 4.2].map((vvd, i) => {
                    const x = 52 + (i / 4) * 310;
                    return (
                      <text
                        key={vvd}
                        x={x}
                        y={294}
                        textAnchor="middle"
                        className="text-[9px] font-mono fill-slate-600"
                      >
                        {vvd.toFixed(1)}
                      </text>
                    );
                  })}
                  {[15, 32, 50, 68, 85].map((doVal, i) => {
                    const y = 280 - (i / 4) * 260;
                    return (
                      <text
                        key={doVal}
                        x={46}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[9px] font-mono fill-slate-600"
                      >
                        {doVal}%
                      </text>
                    );
                  })}

                  {/* Next Suggested Acquisition Target Crosshair Ring */}
                  {nextSuggestedCell && (
                    <circle
                      cx={52 + ((nextSuggestedCell.x1_vvd - 0.6) / (4.2 - 0.6)) * 310}
                      cy={280 - ((nextSuggestedCell.x2_do - 15) / (85 - 15)) * 260}
                      r={10}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2.2"
                      strokeDasharray="3,2"
                    />
                  )}

                  {/* Plot Observed Experiment Points (Numbered 1..N) */}
                  {observations.map((obs) => {
                    const px = 52 + ((obs.x1_vvd - 0.6) / (4.2 - 0.6)) * 310;
                    const py = 280 - ((obs.x2_do - 15) / (85 - 15)) * 260;
                    const isBest =
                      bestObservation && obs.iteration === bestObservation.iteration;

                    return (
                      <g key={obs.iteration}>
                        <circle
                          cx={px}
                          cy={py}
                          r={isBest ? 9 : 7}
                          fill={
                            isBest
                              ? '#F59E0B'
                              : obs.isFeasible
                              ? '#2563EB'
                              : '#E11D48'
                          }
                          stroke="#FFFFFF"
                          strokeWidth="1.8"
                        />
                        <text
                          x={px}
                          y={py + 3}
                          textAnchor="middle"
                          className="text-[8px] font-mono fill-white font-bold pointer-events-none"
                        >
                          {obs.iteration}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="md:col-span-5 space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 tabular-nums">
                  <div className="text-[11px] text-slate-500 font-semibold">
                    SURROGATE PROBE HUD
                  </div>
                  {hoveredCell ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Coordinates (x₁, x₂):</span>
                        <span className="font-bold text-slate-900">
                          {hoveredCell.x1_vvd.toFixed(2)} VVD · {hoveredCell.x2_do}% DO
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">GP Score μ ± σ:</span>
                        <span className="font-bold text-blue-700">
                          ~{formatTwoSigFigs(hoveredCell.meanProductivity)} ± {formatTwoSigFigs(hoveredCell.stdDev)} value units/L/day
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Physical Productivity:</span>
                        <span className="font-bold text-teal-800">
                          ~{formatTwoSigFigs(hoveredCell.trueVolumetricProductivityMgLDay ?? hoveredCell.trueProductivity * 8.6)} mg/L/day
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Margin Mean:</span>
                        <span
                          className={
                            hoveredCell.constraintMarginMean >= 0
                              ? 'text-emerald-700 font-bold'
                              : 'text-rose-700 font-bold'
                          }
                        >
                          {hoveredCell.constraintMarginMean >= 0 ? '+' : ''}
                          {hoveredCell.constraintMarginMean.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">P(Feasible):</span>
                        <span className="font-bold text-slate-900">
                          {(hoveredCell.probFeasible * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Acquisition EI × P:</span>
                        <span className="text-slate-900 font-bold">
                          {hoveredCell.constrainedEI.toFixed(2)}
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-200 text-[11px]">
                        Status:{' '}
                        <strong
                          className={
                            hoveredCell.trueFeasible ? 'text-emerald-700' : 'text-rose-700'
                          }
                        >
                          {hoveredCell.trueFeasible
                            ? '● Feasible Operating Point'
                            : '▨ Hatched: Fails Engineering Constraint'}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500 py-4">
                      Hover over any cell in the 2D surrogate matrix to inspect GP mean μ(x), uncertainty σ(x), continuous constraint margin, and P(feasible).
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="font-mono text-[11px] text-slate-500 uppercase">
                    OPERATING WINDOW LEGEND
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 rounded-full bg-amber-500 border border-white" />
                    <span>Best Observed Feasible Trial (#{bestObservation?.iteration})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 rounded-full bg-blue-600 border border-white" />
                    <span>Passed Trial (OTR ≥ OUR, τ ≤ τ_crit, Viability OK)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 rounded-full bg-rose-600 border border-white" />
                    <span>Rejected Trial (Hit Engineering Constraint)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border border-rose-800 bg-rose-100" />
                    <span>▨ Hatched Region: Predicted Culture Failure</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bayesian Optimisation vs Random Search — Synthetic Benchmark */}
          <div className="bg-white border border-slate-200 p-6 space-y-5">
            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-950 border border-amber-300 font-bold uppercase">
                    SYNTHETIC IN-SILICO SIMULATOR EVALUATIONS — NOT WET-LAB EXPERIMENTS
                  </span>
                  <span className="text-slate-500">
                    IDENTICAL CONSTRAINTS · IDENTICAL OBJECTIVE · EQUAL EVALUATION BUDGET
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Bayesian Optimisation vs Random Search — Synthetic Benchmark
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                  <strong>What each curve plots:</strong> Each solid or dashed curve shows the{' '}
                  <strong>best feasible objective value found up to that evaluation</strong> (monotone
                  running incumbent maximum{' '}
                  <span className="font-mono">
                    y⁺_n = max&#123;J_syn(x_k) : k ≤ n, x_k is feasible&#125;
                  </span>
                  )—<strong>not</strong> the performance of every individual evaluation. All evaluations
                  are deterministic queries of the synthetic CHO perfusion mass-balance simulator (
                  <code className="font-mono">evaluateProcessSimulation</code>), not physical wet-lab
                  bioreactor runs.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-mono bg-slate-50 border border-slate-300 px-2.5 py-1">
                  <span className="text-slate-500">Budget:</span>
                  <strong className="text-slate-900">N = {sameSeedComparison.budget} evals</strong>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-600">Seed:</span>
                  <select
                    value={selectedSeed}
                    onChange={(e) => setSelectedSeed(parseInt(e.target.value, 10))}
                    aria-label="Select random seed for head-to-head comparison"
                    className="bg-slate-50 border border-slate-300 px-2 py-1 text-xs font-mono text-slate-900 font-semibold"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        Seed #{s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setChartTab('same_seed')}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      chartTab === 'same_seed'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Single-Seed Trajectory (Seed #{selectedSeed})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartTab('benchmark_8seed')}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      chartTab === 'benchmark_8seed'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    8-Seed Mean ± SD Curve
                  </button>
                </div>
              </div>
            </div>

            {/* Main Benchmark SVG Plot */}
            <div className="space-y-4">
              {chartTab === 'same_seed' ? (
                <div className="space-y-3">
                  {/* Chart Subheader & Units / Series Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-mono">
                    <div className="flex flex-wrap items-center gap-2 text-slate-700">
                      <span className="font-bold text-slate-900">
                        Single-Seed Running Best (Seed #{selectedSeed}, N = {sameSeedComparison.budget})
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800">
                        Y-Axis Units: <strong>synthetic value units/L/day</strong>
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showFlatPenaltyCurve}
                        onChange={(e) => setShowFlatPenaltyCurve(e.target.checked)}
                        className="accent-violet-700 cursor-pointer"
                      />
                      <span>Show Flat-Penalty GP (−500) curve</span>
                    </label>
                  </div>

                  {/* Responsive Contained SVG Chart (No Overflow Outside Container) */}
                  <div className="w-full border border-slate-200 bg-white p-2 sm:p-3">
                    <svg
                      viewBox="0 0 720 305"
                      className="w-full h-auto block select-none"
                      role="img"
                      aria-label="Bayesian Optimisation vs Random Search benchmark chart showing best feasible objective score versus simulated experiment number"
                    >
                      {/* Y-Axis Label (Shortened & Centered Within Chart Height) */}
                      <text
                        x={20}
                        y={118}
                        textAnchor="middle"
                        transform="rotate(-90, 20, 118)"
                        className="text-[11px] font-sans fill-slate-800 font-semibold"
                      >
                        Best feasible objective score
                      </text>

                      {/* X-Axis Label */}
                      <text
                        x={385}
                        y={290}
                        textAnchor="middle"
                        className="text-[11px] font-sans fill-slate-800 font-semibold"
                      >
                        Simulated experiment number
                      </text>

                      {/* Horizontal Grid Lines & Y-Axis Ticks (Score 100 to 220) */}
                      {[100, 130, 160, 190, 220].map((val) => {
                        const y = 192 - ((val - 100) / 120) * 164;
                        return (
                          <g key={val}>
                            <line
                              x1={78}
                              y1={y}
                              x2={690}
                              y2={y}
                              stroke="#E2E8F0"
                              strokeWidth="1"
                            />
                            <text
                              x={70}
                              y={y + 3.5}
                              textAnchor="end"
                              className="text-[10px] font-mono fill-slate-600"
                            >
                              {val}
                            </text>
                          </g>
                        );
                      })}

                      {/* Dedicated Bottom Track for Rejected / Infeasible Evaluations (Red X Markers) */}
                      <rect
                        x={78}
                        y={202}
                        width={612}
                        height={32}
                        fill="#FFF1F2"
                        stroke="#FECDD3"
                        strokeWidth="1"
                      />
                      <text
                        x={84}
                        y={213}
                        className="text-[8.5px] font-mono fill-rose-800 font-semibold"
                      >
                        INFEASIBLE EVALUATIONS (REJECTED — DO NOT UPDATE BEST-SO-FAR CURVE):
                      </text>

                      {/* Optional Flat-Penalty GP Running Best (Violet Dash-Dot, Never Red) */}
                      {showFlatPenaltyCurve && (
                        <polyline
                          fill="none"
                          stroke="#7C3AED"
                          strokeWidth="2"
                          strokeDasharray="3,3"
                          points={sameSeedComparison.flatPenaltyBestRunning
                            .map((val, i) => {
                              const x =
                                92 +
                                (i / Math.max(1, sameSeedComparison.budget - 1)) * 580;
                              const y =
                                192 - ((Math.min(225, Math.max(100, val)) - 100) / 120) * 164;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ')}
                        />
                      )}

                      {/* Random Search Running Best Feasible Curve (Dashed Amber) */}
                      <polyline
                        fill="none"
                        stroke="#D97706"
                        strokeWidth="2.5"
                        strokeDasharray="6,4"
                        points={sameSeedComparison.randomBestRunning
                          .map((val, i) => {
                            const x =
                              92 +
                              (i / Math.max(1, sameSeedComparison.budget - 1)) * 580;
                            const y =
                              192 - ((Math.min(225, Math.max(100, val)) - 100) / 120) * 164;
                            return `${x.toFixed(1)},${y.toFixed(1)}`;
                          })
                          .join(' ')}
                      />

                      {/* Constrained BO Running Best Feasible Curve (Solid Blue) */}
                      <polyline
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth="3"
                        points={sameSeedComparison.boBestRunning
                          .map((val, i) => {
                            const x =
                              92 +
                              (i / Math.max(1, sameSeedComparison.budget - 1)) * 580;
                            const y =
                              192 - ((Math.min(225, Math.max(100, val)) - 100) / 120) * 164;
                            return `${x.toFixed(1)},${y.toFixed(1)}`;
                          })
                          .join(' ')}
                      />

                      {/* Individual Random Search Evaluations: Open Amber Circles (Feasible) or Red X (Infeasible) */}
                      {sameSeedComparison.randomTrajectory.map((obs, i) => {
                        const x =
                          92 + (i / Math.max(1, sameSeedComparison.budget - 1)) * 580;
                        const y =
                          192 -
                          ((Math.min(225, Math.max(100, obs.volumetricProductivityMgLDay)) - 100) /
                            120) *
                            164;
                        if (obs.isFeasible) {
                          return (
                            <circle
                              key={`rand-feas-${i}`}
                              cx={x}
                              cy={y}
                              r={3}
                              fill="#FFFFFF"
                              stroke="#D97706"
                              strokeWidth="1.5"
                            >
                              <title>
                                Random Search Exp #{i + 1} (Feasible): Score ={' '}
                                {obs.volumetricProductivityMgLDay.toFixed(1)} synthetic units
                              </title>
                            </circle>
                          );
                        }
                        // Red X marker in lower sub-row for Random Search infeasible evaluation
                        const rx = x + 5;
                        const ry = 224;
                        return (
                          <g key={`rand-infeas-${i}`}>
                            <title>
                              Random Search Exp #{i + 1} (INFEASIBLE — Rejected):{' '}
                              {obs.violationReasons.join(', ')}
                            </title>
                            <line
                              x1={rx - 3}
                              y1={ry - 3}
                              x2={rx + 3}
                              y2={ry + 3}
                              stroke="#FB7185"
                              strokeWidth="1.6"
                            />
                            <line
                              x1={rx - 3}
                              y1={ry + 3}
                              x2={rx + 3}
                              y2={ry - 3}
                              stroke="#FB7185"
                              strokeWidth="1.6"
                            />
                          </g>
                        );
                      })}

                      {/* Constrained BO Evaluations: Blue Dots for Feasible, Crisp Red X Markers for Infeasible */}
                      {sameSeedComparison.boBestRunning.map((bestVal, i) => {
                        const x =
                          92 + (i / Math.max(1, sameSeedComparison.budget - 1)) * 580;
                        const yBest =
                          192 -
                          ((Math.min(225, Math.max(100, bestVal)) - 100) / 120) * 164;
                        const rawObs = sameSeedComparison.boTrajectory[i];
                        const isFeasible = rawObs ? rawObs.isFeasible : true;
                        const yIndiv = rawObs
                          ? 192 -
                            ((Math.min(225, Math.max(100, rawObs.volumetricProductivityMgLDay)) -
                              100) /
                              120) *
                              164
                          : yBest;

                        return (
                          <g key={`bo-step-${i}`}>
                            {/* Small step node on the running-best curve */}
                            <circle
                              cx={x}
                              cy={yBest}
                              r={isFeasible && Math.abs(yIndiv - yBest) < 1 ? 4.2 : 2.5}
                              fill="#2563EB"
                              stroke="#FFFFFF"
                              strokeWidth="1.2"
                            >
                              <title>
                                Exp #{i + 1}: BO Best Feasible Score So Far = {bestVal.toFixed(1)}{' '}
                                synthetic units
                              </title>
                            </circle>

                            {/* If feasible but lower than running best, show individual feasible evaluation dot + vertical guide */}
                            {isFeasible && Math.abs(yIndiv - yBest) >= 1.5 && (
                              <>
                                <line
                                  x1={x}
                                  y1={yBest}
                                  x2={x}
                                  y2={yIndiv}
                                  stroke="#93C5FD"
                                  strokeWidth="1"
                                  strokeDasharray="2,2"
                                />
                                <circle
                                  cx={x}
                                  cy={yIndiv}
                                  r={3.2}
                                  fill="#60A5FA"
                                  stroke="#1D4ED8"
                                  strokeWidth="1"
                                >
                                  <title>
                                    BO Exp #{i + 1} (Individual Feasible Evaluation): Score ={' '}
                                    {rawObs?.volumetricProductivityMgLDay.toFixed(1)} synthetic units
                                  </title>
                                </circle>
                              </>
                            )}

                            {/* If INFEASIBLE, plot bold Red X marker in the rejected track (never a red line) */}
                            {!isFeasible && (
                              <g>
                                <title>
                                  BO Exp #{i + 1} (INFEASIBLE — Rejected by Constraints; Best Curve
                                  Unchanged): {rawObs?.violationReasons.join(', ')}
                                </title>
                                <line
                                  x1={x - 4.2}
                                  y1={222 - 4.2}
                                  x2={x + 4.2}
                                  y2={222 + 4.2}
                                  stroke="#E11D48"
                                  strokeWidth="2.2"
                                />
                                <line
                                  x1={x - 4.2}
                                  y1={222 + 4.2}
                                  x2={x + 4.2}
                                  y2={222 - 4.2}
                                  stroke="#E11D48"
                                  strokeWidth="2.2"
                                />
                              </g>
                            )}

                            {/* X-Axis Tick Label (Experiment Number 1..N) */}
                            <text
                              x={x}
                              y={254}
                              textAnchor="middle"
                              className="text-[10px] font-mono fill-slate-700 font-semibold"
                            >
                              {i + 1}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Attached Legend Directly Beneath the Chart */}
                  <div className="bg-slate-50 border border-slate-200 px-4 py-3 space-y-2 text-xs font-mono">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <span className="inline-flex items-center gap-2 text-slate-900 font-semibold">
                        <span className="inline-block w-5 h-0.5 bg-blue-600 border-b-2 border-blue-600" />
                        <span>
                          Constrained BO best feasible so far (~
                          {formatTwoSigFigs(sameSeedComparison.boFinalBest)} units ·{' '}
                          ~{formatTwoSigFigs(sameSeedComparison.boFinalPhysicalBestMgLDay)} mg/L/d)
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-2 text-slate-800 font-semibold">
                        <span className="inline-block w-5 h-0.5 border-b-2 border-dashed border-amber-600" />
                        <span>
                          Random Search best feasible so far (~
                          {formatTwoSigFigs(sameSeedComparison.randomFinalBest)} units ·{' '}
                          ~{formatTwoSigFigs(sameSeedComparison.randomFinalPhysicalBestMgLDay)} mg/L/d)
                        </span>
                      </span>
                      {showFlatPenaltyCurve && (
                        <span className="inline-flex items-center gap-2 text-violet-800 font-semibold">
                          <span className="inline-block w-5 h-0.5 border-b-2 border-dotted border-violet-600" />
                          <span>
                            Flat-Penalty GP (−500) best feasible (~
                            {formatTwoSigFigs(sameSeedComparison.flatPenaltyFinalBest)} units)
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1.5 border-t border-slate-200 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" />
                        <span>Individual feasible BO evaluation</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-amber-600 bg-white" />
                        <span>Individual feasible Random Search evaluation</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-rose-700 font-semibold">
                        <span>✕</span>
                        <span>
                          Infeasible evaluation (violates OTR ≥ OUR or shear τ ≤ τ_crit; rejected,
                          never updates best-so-far curve)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-mono">
                    <div className="flex flex-wrap items-center gap-2 text-slate-700">
                      <span className="font-bold text-slate-900">
                        {eightSeedCurveSource === 'live_computed'
                          ? `8-Seed Mean ± SD Running-Best (Seeds #1–#8, N = ${liveEightSeedSummary.budget})`
                          : 'Illustrative Pre-Computed 8-Seed Reference Curve'}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800">
                        Y-Axis Units: <strong>synthetic value units/L/day</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer select-none mr-2">
                        <input
                          type="checkbox"
                          checked={showFlatPenaltyCurve}
                          onChange={(e) => setShowFlatPenaltyCurve(e.target.checked)}
                          className="accent-violet-700 cursor-pointer"
                        />
                        <span>Show Flat-Penalty GP (−500)</span>
                      </label>
                      <div className="flex items-center gap-1 bg-slate-200/70 p-0.5">
                        <button
                          type="button"
                          onClick={() => setEightSeedCurveSource('live_computed')}
                          className={`px-2 py-0.5 text-[11px] font-mono cursor-pointer ${
                            eightSeedCurveSource === 'live_computed'
                              ? 'bg-slate-900 text-white font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Live 8-Seed Run
                        </button>
                        <button
                          type="button"
                          onClick={() => setEightSeedCurveSource('illustrative_ref')}
                          className={`px-2 py-0.5 text-[11px] font-mono cursor-pointer ${
                            eightSeedCurveSource === 'illustrative_ref'
                              ? 'bg-amber-800 text-white font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Reference Curve
                        </button>
                      </div>
                    </div>
                  </div>

                  {eightSeedCurveSource === 'illustrative_ref' && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 text-[11px] font-mono text-amber-950">
                      <strong>ILLUSTRATIVE HARD-CODED BENCHMARK NOTICE:</strong> Displays the pre-computed reference array (<code className="font-mono">getEightSeedBenchmarkCurve</code>). Switch to <strong>&ldquo;Live 8-Seed Run&rdquo;</strong> to plot trajectories computed dynamically from your current simulator parameters.
                    </div>
                  )}

                  {(() => {
                    const activePts =
                      eightSeedCurveSource === 'live_computed'
                        ? liveEightSeedSummary.trajectoryPoints
                        : benchmarkPoints;
                    return (
                      <>
                        <div className="w-full border border-slate-200 bg-white p-2 sm:p-3">
                          <svg
                            viewBox="0 0 720 285"
                            className="w-full h-auto block select-none"
                            role="img"
                            aria-label="8-seed mean and standard deviation benchmark line chart"
                          >
                            {/* Shortened Y-Axis Label */}
                            <text
                              x={20}
                              y={118}
                              textAnchor="middle"
                              transform="rotate(-90, 20, 118)"
                              className="text-[11px] font-sans fill-slate-800 font-semibold"
                            >
                              Best feasible objective score
                            </text>

                            {/* X-Axis Label */}
                            <text
                              x={385}
                              y={270}
                              textAnchor="middle"
                              className="text-[11px] font-sans fill-slate-800 font-semibold"
                            >
                              Simulated experiment number
                            </text>

                            {[100, 130, 160, 190, 220].map((val) => {
                              const y = 205 - ((val - 100) / 120) * 170;
                              return (
                                <g key={val}>
                                  <line
                                    x1={78}
                                    y1={y}
                                    x2={690}
                                    y2={y}
                                    stroke="#E2E8F0"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={70}
                                    y={y + 3.5}
                                    textAnchor="end"
                                    className="text-[10px] font-mono fill-slate-600"
                                  >
                                    {val}
                                  </text>
                                </g>
                              );
                            })}

                            {/* ±1 SD Shaded Band for Constrained BO */}
                            <polygon
                              fill="rgba(37, 99, 235, 0.14)"
                              stroke="none"
                              points={[
                                ...activePts.map((pt, i) => {
                                  const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                  const topVal = Math.min(225, pt.constrainedBoMean + pt.constrainedBoStd);
                                  const y = 205 - ((Math.max(100, topVal) - 100) / 120) * 170;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                }),
                                ...[...activePts].reverse().map((pt, revIdx) => {
                                  const i = activePts.length - 1 - revIdx;
                                  const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                  const botVal = Math.max(100, pt.constrainedBoMean - pt.constrainedBoStd);
                                  const y = 205 - ((Math.max(100, botVal) - 100) / 120) * 170;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                }),
                              ].join(' ')}
                            />

                            {/* ±1 SD Shaded Band for Random Search */}
                            <polygon
                              fill="rgba(217, 119, 6, 0.12)"
                              stroke="none"
                              points={[
                                ...activePts.map((pt, i) => {
                                  const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                  const topVal = Math.min(225, pt.randomSearchMean + pt.randomSearchStd);
                                  const y = 205 - ((Math.max(100, topVal) - 100) / 120) * 170;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                }),
                                ...[...activePts].reverse().map((pt, revIdx) => {
                                  const i = activePts.length - 1 - revIdx;
                                  const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                  const botVal = Math.max(100, pt.randomSearchMean - pt.randomSearchStd);
                                  const y = 205 - ((Math.max(100, botVal) - 100) / 120) * 170;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                }),
                              ].join(' ')}
                            />

                            {/* Optional Flat-Penalty GP Mean Curve (Violet Dotted) */}
                            {showFlatPenaltyCurve && (
                              <polyline
                                fill="none"
                                stroke="#7C3AED"
                                strokeWidth="2"
                                strokeDasharray="3,3"
                                points={activePts
                                  .map((pt, i) => {
                                    const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                    const y = 205 - ((Math.max(100, pt.flatPenaltyGpMean) - 100) / 120) * 170;
                                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                                  })
                                  .join(' ')}
                              />
                            )}

                            {/* Random Search Mean Curve */}
                            <polyline
                              fill="none"
                              stroke="#D97706"
                              strokeWidth="2.4"
                              strokeDasharray="6,4"
                              points={activePts
                                .map((pt, i) => {
                                  const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                  const y = 205 - ((Math.max(100, pt.randomSearchMean) - 100) / 120) * 170;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                })
                                .join(' ')}
                            />

                            {/* Constrained BO Mean Curve */}
                            <polyline
                              fill="none"
                              stroke="#2563EB"
                              strokeWidth="3"
                              points={activePts
                                .map((pt, i) => {
                                  const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                                  const y = 205 - ((Math.max(100, pt.constrainedBoMean) - 100) / 120) * 170;
                                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                                })
                                .join(' ')}
                            />

                            {activePts.map((pt, i) => {
                              const x = 92 + (i / Math.max(1, activePts.length - 1)) * 580;
                              const y = 205 - ((Math.max(100, pt.constrainedBoMean) - 100) / 120) * 170;
                              return (
                                <g key={pt.iteration}>
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={3.5}
                                    fill="#2563EB"
                                    stroke="#FFFFFF"
                                    strokeWidth="1.4"
                                  />
                                  <text
                                    x={x}
                                    y={236}
                                    textAnchor="middle"
                                    className="text-[10px] font-mono fill-slate-700 font-semibold"
                                  >
                                    {pt.iteration}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono">
                          <span className="inline-flex items-center gap-2 text-blue-800 font-semibold">
                            <span className="inline-block w-5 h-0.5 bg-blue-600 border-b-2 border-blue-600" />
                            <span>Constrained BO Mean ± 1 SD (Seeds #1–#8)</span>
                          </span>
                          <span className="inline-flex items-center gap-2 text-amber-800 font-semibold">
                            <span className="inline-block w-5 h-0.5 border-b-2 border-dashed border-amber-600" />
                            <span>Random Search Mean ± 1 SD (Seeds #1–#8)</span>
                          </span>
                          {showFlatPenaltyCurve && (
                            <span className="inline-flex items-center gap-2 text-violet-800 font-semibold">
                              <span className="inline-block w-5 h-0.5 border-b-2 border-dotted border-violet-600" />
                              <span>Flat-Penalty GP (−500) Mean</span>
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Objective Function Definition & Units Caption Beneath the Graph */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-900 uppercase text-[11px]">
                    FIGURE CAPTION · OBJECTIVE DEFINITION, UNITS &amp; FEASIBILITY CONSTRAINTS
                  </span>
                  <span className="font-mono text-[11px] text-slate-600">
                    Equal Budget: N = {sameSeedComparison.budget} simulated evaluations per method
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="p-2.5 bg-white border border-slate-200 space-y-1">
                    <div className="font-semibold text-blue-800">
                      1. Plotted Y-Axis Objective Score J_syn [synthetic value units/L/day]:
                    </div>
                    <div className="text-slate-800 break-words">
                      J_syn = max(25.0, X_v · q_p · 0.116 · [0.76 + 0.24 · φ_VVD(x₁) · φ_DO(x₂)])
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans">
                      Weights physical productivity by synthetic media, power, and oxygen cost factors (φ_VVD, φ_DO). Best-so-far curves update only when a strictly better feasible evaluation is found.
                    </div>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 space-y-1">
                    <div className="font-semibold text-teal-800">
                      2. Physical Volumetric Productivity P_vol [mg/L/day] (Reported Separately):
                    </div>
                    <div className="text-slate-800">
                      P_vol = X_v(x₁, x₂) [10⁶ cells/mL] × q_p(x₁, x₂, T) [pg/cell/day] = mg/L/day
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans">
                      Hard constraints enforced identically on all methods: OTR ≥ OUR, Shear τ ≤ {groundedParams.shearThresholdPa.toFixed(2)} Pa, Viability ≥ {groundedParams.minViabilityPercent.toFixed(1)}%, Lactate ≤ {groundedParams.maxLactateGPerL.toFixed(2)} g/L, DO ≥ 22%.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Best Operating Conditions & Constraint Margins Corresponding to Each Method's Best Result (Seed #selectedSeed) */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono font-bold text-slate-900 uppercase">
                  OPERATING CONDITIONS &amp; ENGINEERING CONSTRAINT MARGINS FOR EACH METHOD&apos;S BEST FEASIBLE RESULT (SEED #{selectedSeed}, N = {sameSeedComparison.budget} SIMULATED EVALUATIONS)
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Margin &gt; 0 required across all 4 physical boundaries for feasibility
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                {(
                  [
                    {
                      title: '1. Constrained BO Best (EI × P_feas)',
                      accentClass: 'border-blue-600 bg-blue-50/30',
                      headerClass: 'text-blue-800',
                      obs: sameSeedComparison.boBestObservation,
                      violations: sameSeedComparison.boViolationCount,
                    },
                    {
                      title: '2. Random Search Best Baseline',
                      accentClass: 'border-amber-500 bg-amber-50/30',
                      headerClass: 'text-amber-900',
                      obs: sameSeedComparison.randomBestObservation,
                      violations: sameSeedComparison.randomViolationCount,
                    },
                    {
                      title: '3. Flat-Penalty GP (−500) Best',
                      accentClass: 'border-rose-400 bg-rose-50/20',
                      headerClass: 'text-rose-900',
                      obs: sameSeedComparison.flatPenaltyBestObservation,
                      violations: sameSeedComparison.flatPenaltyViolationCount,
                    },
                  ] as const
                ).map((card) => {
                  const obs = card.obs;
                  const physMgLDay = obs
                    ? obs.meanVolumetricProductivityMgPerLPerDay ??
                      Math.round(obs.volumetricProductivityMgLDay * 8.6)
                    : 0;
                  const otrMargin = obs ? obs.otrMmolPerLHour - obs.ourMmolPerLHour : 0;
                  const shearMargin = obs ? groundedParams.shearThresholdPa - obs.shearStressPa : 0;
                  const viabMargin = obs
                    ? obs.cellViabilityPercent - groundedParams.minViabilityPercent
                    : 0;
                  const lacMargin = obs ? groundedParams.maxLactateGPerL - obs.lactateGPerL : 0;

                  return (
                    <div
                      key={card.title}
                      className={`p-3.5 border ${card.accentClass} space-y-2 tabular-nums`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <span className={`font-bold text-[11px] ${card.headerClass}`}>
                          {card.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-700">
                          {obs ? `Found at Eval #${obs.iteration}/${sameSeedComparison.budget}` : 'No Feasible Point'}
                        </span>
                      </div>

                      {obs ? (
                        <>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Best Objective J_syn:</span>
                              <span className="font-bold text-slate-900">
                                ~{formatTwoSigFigs(obs.volumetricProductivityMgLDay)} value units/L/day
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Physical Productivity P_vol:</span>
                              <span className="font-bold text-teal-800">
                                ~{formatTwoSigFigs(physMgLDay)} mg/L/day
                              </span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-200/80">
                              <span className="text-slate-600">Operating Setpoints:</span>
                              <span className="font-bold text-slate-900">
                                {obs.x1_vvd.toFixed(2)} VVD · {obs.x2_do}% DO · {obs.tempC.toFixed(1)} °C
                              </span>
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-slate-200/80 space-y-1 text-[10.5px]">
                            <div className="text-[10px] font-semibold text-slate-500 uppercase">
                              Constraint Margins at Best Point:
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">O₂ Margin (OTR − OUR):</span>
                              <span className="text-emerald-700 font-semibold">
                                +{otrMargin.toFixed(1)} mmol/L/h ({obs.otrMmolPerLHour.toFixed(1)} vs {obs.ourMmolPerLHour.toFixed(1)})
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Shear Margin (τ_crit − τ):</span>
                              <span className="text-emerald-700 font-semibold">
                                +{shearMargin.toFixed(2)} Pa (τ = {obs.shearStressPa.toFixed(2)} ≤ {groundedParams.shearThresholdPa.toFixed(2)})
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Viability Margin:</span>
                              <span className="text-emerald-700 font-semibold">
                                +{viabMargin.toFixed(1)}% ({obs.cellViabilityPercent.toFixed(1)}% ≥ {groundedParams.minViabilityPercent.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Lactate Margin:</span>
                              <span className="text-emerald-700 font-semibold">
                                +{lacMargin.toFixed(2)} g/L ({obs.lactateGPerL.toFixed(2)} ≤ {groundedParams.maxLactateGPerL.toFixed(2)})
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Norm. Margin g(x):</span>
                              <span className="font-bold text-emerald-800">
                                +{obs.continuousConstraintMargin.toFixed(3)}
                              </span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-200/80">
                              <span className="text-slate-600">Constraint Violations (Seed #{selectedSeed}):</span>
                              <span className="font-bold text-rose-700">
                                {card.violations} / {sameSeedComparison.budget} evals failed
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-rose-700 py-4 text-[11px]">
                          All {sameSeedComparison.budget} simulated evaluations on Seed #{selectedSeed} violated at least one engineering constraint.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Eight-Seed (Seeds #1–#8) Mean ± SD Statistical Comparison Table */}
            <div className="pt-3 border-t border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono font-bold text-slate-900 uppercase">
                  EIGHT-SEED (SEEDS #1–#8, N = {liveEightSeedSummary.budget} EVALUATIONS/SEED) MEAN ± STANDARD DEVIATION COMPARISON (LIVE SIMULATOR COMPUTATION)
                </div>
                <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5">
                  Computed live across 8 random seeds × {liveEightSeedSummary.budget} evaluations = {8 * liveEightSeedSummary.budget} simulator calls
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-mono text-[11px] text-slate-700">
                      <th className="py-2 px-3">Optimisation Method (Equal Budget N = {liveEightSeedSummary.budget})</th>
                      <th className="py-2 px-3">Final Best Objective Score (Mean ± SD) [value units/L/day, synthetic cost basis]</th>
                      <th className="py-2 px-3">Corresponding Physical Productivity (Mean ± SD) [mg/L/day]</th>
                      <th className="py-2 px-3">Constraint Violations per Seed (Mean ± SD)</th>
                      <th className="py-2 px-3">Feasible Evaluation Rate (%)</th>
                      <th className="py-2 px-3">Seeds Won / Tied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                    {[
                      {
                        stat: liveEightSeedSummary.constrainedBoStats,
                        rowClass: 'bg-blue-50/40 font-semibold',
                        badgeColor: 'text-blue-700',
                      },
                      {
                        stat: liveEightSeedSummary.randomSearchStats,
                        rowClass: 'bg-white',
                        badgeColor: 'text-amber-700',
                      },
                      {
                        stat: liveEightSeedSummary.flatPenaltyGpStats,
                        rowClass: 'bg-white',
                        badgeColor: 'text-rose-700',
                      },
                    ].map(({ stat, rowClass, badgeColor }) => (
                      <tr key={stat.methodName} className={rowClass}>
                        <td className={`py-2.5 px-3 ${badgeColor}`}>{stat.methodName}</td>
                        <td className="py-2.5 px-3 text-slate-900">
                          {stat.finalScoreMean.toFixed(1)} ± {stat.finalScoreStd.toFixed(1)} value units/L/day
                          <span className="text-slate-500 text-[10px] block">
                            (~{formatTwoSigFigs(stat.finalScoreMean)} ± {formatTwoSigFigs(stat.finalScoreStd)} rounded 2 s.f.)
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-teal-900">
                          ~{formatTwoSigFigs(stat.finalPhysicalMgLDayMean)} ± {formatTwoSigFigs(stat.finalPhysicalMgLDayStd)} mg/L/day
                        </td>
                        <td className="py-2.5 px-3 text-rose-700">
                          {stat.violationsCountMean.toFixed(1)} ± {stat.violationsCountStd.toFixed(1)} / {liveEightSeedSummary.budget} evals
                        </td>
                        <td className="py-2.5 px-3 text-emerald-800">
                          {stat.feasibleRatePercentMean.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-slate-900">
                          {stat.seedsWonCount} / {liveEightSeedSummary.seedCount} seeds
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Code-Level Reproducibility & Seed Verification Manifest */}
            <div className="pt-4 border-t border-slate-200 bg-slate-900 text-white p-4 space-y-3 text-xs font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
                <span className="text-cyan-300 font-bold uppercase">
                  CODE-LEVEL REPRODUCIBILITY &amp; DETERMINISTIC SEED VERIFICATION MANIFEST ({REPRODUCIBILITY_MANIFEST.engineVersion})
                </span>
                <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px]">
                  LIVE COUPLED TO SIMULATOR PARAMETERS (q_p={groundedParams.qpBase}, q_O2={groundedParams.qO2Specific}, τ_crit={groundedParams.shearThresholdPa} Pa)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="p-2.5 bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-slate-400 uppercase text-[10px]">
                    Deterministic Seeded PRNG &amp; LHS Initialisation:
                  </div>
                  <div className="text-cyan-200">{REPRODUCIBILITY_MANIFEST.deterministicPrngFormula}</div>
                  <div className="text-slate-400 text-[10px]">
                    Active Seed: #{selectedSeed} | Multi-Seed Suite: Seeds #1–#8 | Budget: N = {sameSeedComparison.budget} evaluations/method
                  </div>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-slate-400 uppercase text-[10px]">
                    GP Objective &amp; Continuous Margin Surrogate Kernels:
                  </div>
                  <div className="text-emerald-200">{REPRODUCIBILITY_MANIFEST.gpObjectiveKernel}</div>
                  <div className="text-slate-400 text-[10px]">
                    {REPRODUCIBILITY_MANIFEST.acquisitionFunctionFormula}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Expandable Experiment Telemetry Table */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-slate-500">
              SEQUENTIAL EXPERIMENT TELEMETRY TRAY (SURROGATE PREDICTIONS, ACQUISITION SCORES &amp; OUTCOMES)
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Every Experiment Chosen by the Agent ({observations.length} Runs)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const payload = {
                  exportedAt: new Date().toISOString(),
                  reproducibilityManifest: REPRODUCIBILITY_MANIFEST,
                  epistemicNotice:
                    'Synthetic simulation benchmark trajectories generated on the deterministic CHO perfusion mass-balance simulator. EI(x) * P(feasible|x) is a model-based acquisition score under assumed equations.',
                  reactorConfiguration: selectedReactor.name,
                  groundedModelAssumptions: groundedParams,
                  activeSessionObservations: observations,
                  sameSeedHeadToHeadComparison: sameSeedComparison,
                  liveEightSeedBenchmarkSummary: liveEightSeedSummary,
                  preloadedIllustrativeReferenceCurve: benchmarkPoints,
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bioreact_bo_trajectories_${selectedReactor.id}_seed${selectedSeed}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 text-xs font-mono font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            >
              Export Raw BO Trajectories &amp; Reproducibility Manifest (.json)
            </button>
            <div className="text-xs font-mono text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1">
              Synthetic simulation outputs using CHO range assumptions — not wet-lab data
            </div>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-600">
                <th className="py-2.5 px-2">Run #</th>
                <th className="py-2.5 px-2">Strategy</th>
                <th className="py-2.5 px-2">x₁ (VVD)</th>
                <th className="py-2.5 px-2">x₂ (DO%)</th>
                <th className="py-2.5 px-2">GP Pred μ±σ</th>
                <th className="py-2.5 px-2">EI(x)</th>
                <th className="py-2.5 px-2">P(feas)</th>
                <th className="py-2.5 px-2">EI×P(feas)</th>
                <th className="py-2.5 px-2">Score (value units/L/day, synthetic cost basis)</th>
                <th className="py-2.5 px-2">Physical Yield (mg/L/day)</th>
                <th className="py-2.5 px-2">OTR / OUR</th>
                <th className="py-2.5 px-2">Shear τ (Pa)</th>
                <th className="py-2.5 px-2">Engineering Constraint Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {observations.map((obs) => {
                const isBest =
                  bestObservation && obs.iteration === bestObservation.iteration;
                const physMgLDay =
                  obs.meanVolumetricProductivityMgPerLPerDay ??
                  Math.round(obs.volumetricProductivityMgLDay * 8.6);
                return (
                  <tr
                    key={obs.iteration}
                    className={
                      isBest
                        ? 'bg-amber-50/70'
                        : obs.isFeasible
                        ? 'hover:bg-slate-50'
                        : 'bg-rose-50/30 hover:bg-rose-50/50'
                    }
                  >
                    <td className="py-2.5 px-2 font-bold text-slate-900">
                      #{obs.iteration} {isBest ? '★' : ''}
                    </td>
                    <td className="py-2.5 px-2 font-sans text-slate-700">{obs.strategy}</td>
                    <td className="py-2.5 px-2 font-semibold text-slate-900">
                      {obs.x1_vvd.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-slate-900">{obs.x2_do}%</td>
                    <td className="py-2.5 px-2 text-slate-600">
                      ~{formatTwoSigFigs(obs.gpPredictedMean)} ± {formatTwoSigFigs(obs.gpPredictedStd)}
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">
                      {obs.expectedImprovement.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2">{(obs.probFeasible * 100).toFixed(0)}%</td>
                    <td className="py-2.5 px-2 font-semibold text-teal-800">
                      {obs.constrainedAcquisitionScore.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 font-bold text-blue-700">
                      ~{formatTwoSigFigs(obs.volumetricProductivityMgLDay)} value units/L/day
                    </td>
                    <td className="py-2.5 px-2 font-bold text-teal-800">
                      ~{formatTwoSigFigs(physMgLDay)} mg/L/day
                    </td>
                    <td className="py-2.5 px-2">
                      {obs.otrMmolPerLHour.toFixed(1)} / {obs.ourMmolPerLHour.toFixed(1)}
                    </td>
                    <td
                      className={`py-2.5 px-2 ${
                        obs.shearStressPa <= groundedParams.shearThresholdPa
                          ? 'text-slate-900'
                          : 'text-rose-700 font-semibold'
                      }`}
                    >
                      {obs.shearStressPa.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 font-sans">
                      {obs.isFeasible ? (
                        <span className="text-emerald-700 font-medium">
                          ● Passed (Viab {obs.cellViabilityPercent.toFixed(1)}%, Gal {obs.galactosylationIndexPercent.toFixed(0)}%)
                        </span>
                      ) : (
                        <span className="text-rose-700 font-medium">
                          ✖ Rejected: {obs.violationReasons.join('; ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
