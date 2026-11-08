import React, { useMemo, useState } from 'react';
import {
  AuditedParameterProvenanceRecord,
  BiologicCandidate,
  CandidatePathwayMode,
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  HumanSafetyGate,
  ImpellerType,
  NextExperimentRecommendationSuite,
  OrganismSystemId,
  ProposedNextExperimentRecipe,
  SafetyGateId,
  SafetyGateStatus,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  computeScaleUpOperatingWindow,
  formatTwoSigFigs,
  solveMassBalanceAndReactorPhysics,
} from '../services/bioprocessEngine';
import {
  DEFAULT_HF_PHYSICS,
  DEFAULT_STR_PHYSICS,
  FEASIBLE_500L_STR_PHYSICS,
  IMPELLER_GEOMETRY_SPECS,
} from '../data/bioprocessData';
import { ConstraintViolationRadarPanel } from './ConstraintViolationRadarPanel';
import { ImpellerSensitivityAnalysisPanel } from './ImpellerSensitivityAnalysisPanel';
import { ResolveOxygenLimitationPanel } from './ResolveOxygenLimitationPanel';
import { NextExperimentRecommendationsPanel } from './NextExperimentRecommendationsPanel';
import { BioreactorProcessVisualiserPanel } from './BioreactorProcessVisualiserPanel';
import { ChevronDown, ChevronUp, RotateCcw, ArrowRight, FileText } from 'lucide-react';

interface MassBalanceScaleUpPanelProps {
  candidate: BiologicCandidate;
  groundedParams: GroundedSimulatorParams;
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  onUpdateHfParams: (next: HollowFibrePhysicsParams) => void;
  onNavigateToOptimiser: () => void;
  safetyGates?: HumanSafetyGate[];
  onUpdateSafetyGate?: (
    gateId: SafetyGateId,
    status: SafetyGateStatus,
    reviewerName: string,
    justification: string
  ) => void;
  recommendationSuite?: NextExperimentRecommendationSuite;
  provenanceLedger?: AuditedParameterProvenanceRecord[];
  selectedOrganismId?: OrganismSystemId;
  candidatePathwayMode?: CandidatePathwayMode;
  onApplyExperimentHardwareToStage5?: (recipe: ProposedNextExperimentRecipe) => void;
  onExecuteReviewedExperimentInBo?: (
    recipe: ProposedNextExperimentRecipe,
    reviewerName: string,
    reviewerNotes: string
  ) => void;
  onTriggerAbstentionDemo?: () => void;
  onRestoreCalibratedChoModel?: () => void;
}

export const MassBalanceScaleUpPanel: React.FC<MassBalanceScaleUpPanelProps> = ({
  candidate,
  groundedParams,
  strParams,
  hfParams,
  onUpdateStrParams,
  onUpdateHfParams,
  onNavigateToOptimiser,
  safetyGates = [],
  onUpdateSafetyGate,
  recommendationSuite,
  provenanceLedger = [],
  selectedOrganismId = 'cho_mammalian',
  candidatePathwayMode = 'established_biologic',
  onApplyExperimentHardwareToStage5,
  onExecuteReviewedExperimentInBo,
  onTriggerAbstentionDemo,
  onRestoreCalibratedChoModel,
}) => {
  const [showEquationsPanel, setShowEquationsPanel] = useState<boolean>(true);
  const [showCfdPanel, setShowCfdPanel] = useState<boolean>(false);

  const activeImpellerSpec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];
  const activeTurbulentNp0 =
    strParams.customTurbulentNp !== undefined &&
    Number.isFinite(strParams.customTurbulentNp)
      ? strParams.customTurbulentNp
      : activeImpellerSpec.defaultTurbulentNp0;

  const physics = useMemo(
    () =>
      solveMassBalanceAndReactorPhysics(
        strParams,
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      ),
    [strParams, hfParams, groundedParams]
  );

  const windowPoints = useMemo(
    () =>
      computeScaleUpOperatingWindow(
        strParams,
        groundedParams,
        groundedParams.optimalDoPercent
      ),
    [strParams, groundedParams]
  );

  // Live 1 vs 2 vs 3 impeller comparison at current vessel volume, rpm, D_i/D_T, Z/D_T, spacing, and sparging
  const multiImpellerComparison = useMemo(
    () =>
      ([1, 2, 3] as const).map((nCount) => {
        const evalResult = solveMassBalanceAndReactorPhysics(
          {
            ...strParams,
            impellerCount: nCount,
          },
          hfParams,
          groundedParams,
          groundedParams.optimalVvd,
          groundedParams.optimalDoPercent
        );
        return {
          impellerCount: nCount,
          evalResult,
        };
      }),
    [strParams, hfParams, groundedParams]
  );

  // SVG Operating Window Coordinate Mapping (X = vvm 0.008 to 0.120, Y = P/V 0 to 500 W/m^3)
  const mapX = (vvm: number) => 62 + ((vvm - 0.008) / (0.12 - 0.008)) * 520;
  const mapY = (pv: number) => 260 - (Math.min(500, Math.max(0, pv)) / 500) * 230;

  // Construct Feasible Operating Window Polygon Points (where lower bound < upper bound and vvm >= 0.018)
  const feasiblePolygonPoints = useMemo(() => {
    const valid = windowPoints.filter((pt) => pt.isCo2StrippingSufficient);
    const upperPts: string[] = [];
    const lowerPts: string[] = [];

    for (const pt of valid) {
      const lower = Math.max(
        pt.minPvForOtrWPerM3,
        pt.minPvForMixingWPerM3,
        pt.floodingMinPvWPerM3
      );
      const upper = Math.min(pt.maxPvForShearWPerM3, pt.maxPvForFoamingWPerM3);
      if (upper > lower) {
        upperPts.push(`${mapX(pt.vvm).toFixed(1)},${mapY(upper).toFixed(1)}`);
        lowerPts.unshift(`${mapX(pt.vvm).toFixed(1)},${mapY(lower).toFixed(1)}`);
      }
    }
    return [...upperPts, ...lowerPts].join(' ');
  }, [windowPoints]);

  // Current Operating Point on the Diagram
  const currentOpX = mapX(Math.min(0.12, Math.max(0.008, strParams.spargeRateVvm)));
  const currentOpY = mapY(physics.specificPowerWPerM3);

  return (
    <div className="space-y-8">
      {/* Interactive Model-Informed Animated Bioreactor Process-State Visualiser (Placed First Above the Fold) */}
      <BioreactorProcessVisualiserPanel
        strParams={strParams}
        hfParams={hfParams}
        groundedParams={groundedParams}
        physics={physics}
        onUpdateStrParams={onUpdateStrParams}
        onUpdateHfParams={onUpdateHfParams}
        topRecommendedRecipe={recommendationSuite?.proposedExperiments?.[0]}
        onApplyExperimentHardwareToStage5={onApplyExperimentHardwareToStage5}
        safetyGates={safetyGates}
        onUpdateSafetyGate={onUpdateSafetyGate}
      />

      {/* Top Banner & Explicit Provenance Distinction */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-slate-500 mb-1">
              FIRST-PRINCIPLES BIOCHEMICAL ENGINEERING · MASS BALANCE, HYDRODYNAMICS &amp; SCALE-UP WINDOW
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              CHO Perfusion Mass-Balance (OTR / OUR / Bleed) &amp; Vessel Scale-Up Operating Window
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Replaces arbitrary scoring with mechanistic mass-transfer and hydrodynamic equations: Oxygen Transfer Rate (<span className="font-mono">OTR</span>) vs. Oxygen Uptake Rate (<span className="font-mono">OUR</span>), gassed mixing time (<span className="font-mono">t_m</span> vs. <span className="font-mono">1/k_La</span>), geometry- and <span className="font-mono">Re</span>-dependent impeller power (<span className="font-mono">P_0</span> vs. <span className="font-mono">P_g</span>), and Hagen-Poiseuille hollow-fibre lumen pressure drop.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onUpdateStrParams(DEFAULT_STR_PHYSICS);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Unmodified 500 L Open-Pipe (OTR 3.2 &lt; OUR 13.9)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateStrParams(FEASIBLE_500L_STR_PHYSICS);
                onUpdateHfParams(DEFAULT_HF_PHYSICS);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Apply Microsparger + 60% O₂ Fix (OTR 18.6 ≥ OUR 13.9)</span>
            </button>
            <a
              href="/assets/aistudio/mixing_2022_b720717f.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>View UCL Mixing Reference PDF</span>
            </a>
          </div>
        </div>

        {/* Automatic Oxygen-Deficit / Infeasibility Safety Interlock Banner */}
        {(!physics.isScaleUpFeasible || physics.oxygenMarginMmolPerLHour < 0) && (
          <div className="mt-4 p-4 bg-rose-50 border-2 border-rose-600 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 text-xs text-rose-950">
              <div className="font-mono font-bold uppercase tracking-wider text-rose-800">
                500 L OXYGEN-TRANSFER / HYDRODYNAMIC FEASIBILITY FAILURE — REJECTED BY AGENT (GATES 02 &amp; 04 BLOCKED)
              </div>
              <p>
                At <strong className="font-mono">{strParams.workingVolumeL} L</strong> with{' '}
                <strong className="font-mono">
                  {strParams.spargerType === 'sintered_microsparger'
                    ? 'sintered microsparger'
                    : 'open-pipe sparger'}
                </strong>{' '}
                and <strong className="font-mono">{strParams.targetVcdE6PerMl}×10⁶ cells/mL</strong>:{' '}
                <strong className="font-mono">
                  Oxygen Available (OTR) = {physics.otrMmolPerLHour.toFixed(1)} mmol/L/h vs. Oxygen
                  Required (OUR) = {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h
                </strong>
                {physics.oxygenMarginMmolPerLHour < 0 && (
                  <>
                    {' '}
                    (Oxygen deficit ={' '}
                    <strong className="font-mono">
                      {Math.abs(physics.oxygenMarginMmolPerLHour).toFixed(1)} mmol/L/h
                    </strong>
                    )
                  </>
                )}
                . Approval of the present operating point is prevented until an engineering
                modification is verified and signed off by a Bioprocess Engineer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateStrParams(FEASIBLE_500L_STR_PHYSICS)}
              className="px-3.5 py-2 text-xs font-mono font-semibold bg-emerald-700 text-white hover:bg-emerald-800 shrink-0 cursor-pointer"
            >
              Investigate Microsparger + 60% O₂ Redesign →
            </button>
          </div>
        )}

        {/* Epistemic Provenance Legend (Literature vs First-Principles vs Synthetic vs Wet-Lab) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200">
            <div className="font-mono font-semibold text-blue-700">
              1. LITERATURE-DERIVED ASSUMPTIONS
            </div>
            <p className="text-slate-600 mt-1">
              Specific rates <span className="font-mono">q_O2 = {groundedParams.qO2Specific} pmol/cell/h</span>, <span className="font-mono">q_p = {groundedParams.qpBase} pg/cell/d</span>, geometry-specific <span className="font-mono">N_p,0</span> ranges (Rushton et al. 1950; Bates et al. 1963; Doran 2013), and <span className="font-mono">t_m = 2×θ_95%</span> (Rosseburg et al. 2018).
            </p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200">
            <div className="font-mono font-semibold text-slate-900">
              2. FIRST-PRINCIPLES MASS BALANCE
            </div>
            <p className="text-slate-600 mt-1">
              Closed-form <span className="font-mono">OTR − OUR ≥ 0</span>, ungassed <span className="font-mono">P_0</span> vs. gassed <span className="font-mono">P_g</span>, local <span className="font-mono">ε_T,max</span> Kolmogorov <span className="font-mono">λ_K</span> (Nienow 1997), and Hagen-Poiseuille lumen <span className="font-mono">ΔP</span>.
            </p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200">
            <div className="font-mono font-semibold text-amber-800">
              3. SYNTHETIC SURROGATE OUTPUTS
            </div>
            <p className="text-slate-600 mt-1">
              Stage 3 Gaussian Process response surface and simulated productivity trajectories (Computational Level 2).
            </p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200">
            <div className="font-mono font-semibold text-emerald-800">
              4. EXPERIMENTAL VALIDATION GAP
            </div>
            <p className="text-slate-600 mt-1">
              Requires physical benchtop/pilot bioreactor runs, torque-transducer <span className="font-mono">P_0 / P_g</span> calibration, off-gas mass spectrometry, and PIV/CFD verification (Level 3).
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Resolve Oxygen Limitation Workbench (6-Parameter Investigation, Trade-Offs, Agent Proposals & Gate Interlock) */}
      <ResolveOxygenLimitationPanel
        strParams={strParams}
        hfParams={hfParams}
        groundedParams={groundedParams}
        physics={physics}
        onUpdateStrParams={onUpdateStrParams}
        safetyGates={safetyGates}
        onUpdateSafetyGate={onUpdateSafetyGate}
      />

      {/* Main Split: Left 5 Cols = STR & Oxygen Mass-Balance Controls | Right 7 Cols = Interactive UCL Slide 25 Operating Window Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 Columns: Stirred-Tank & CHO Perfusion Mass-Balance Controls */}
        <div className="lg:col-span-5 bg-white border border-slate-200 p-6 space-y-5">
          <div className="pb-3 border-b border-slate-200">
            <div className="text-xs font-mono text-slate-500">
              STIRRED-TANK &amp; PERFUSION MASS-BALANCE INPUTS
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Scale, Impeller <span className="font-mono">N_p</span> Model &amp; Oxygenation Controls
            </h3>
          </div>

          {/* Preset Scale Buttons */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-800">Working Volume Scale (<span className="font-mono">V</span>)</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {strParams.workingVolumeL.toLocaleString()} L
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[3, 50, 500, 2000, 15000].map((vol) => (
                <button
                  key={vol}
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      workingVolumeL: vol,
                      stirrerSpeedRpm:
                        vol === 3
                          ? 260
                          : vol === 50
                          ? 165
                          : vol === 500
                          ? 115
                          : vol === 2000
                          ? 82
                          : 54,
                    })
                  }
                  className={`py-1.5 text-xs font-mono border transition-colors cursor-pointer ${
                    strParams.workingVolumeL === vol
                      ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {vol >= 1000 ? `${vol / 1000}k L` : `${vol} L`}
                </button>
              ))}
            </div>
          </div>

          {/* Impeller Geometry Selector & Literature-Supported Power Number (Np,0) Model */}
          <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <label className="text-xs font-semibold text-slate-900">
                Impeller Geometry &amp; Reference Power Number (<span className="font-mono">N_p,0</span>)
              </label>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                ASSUMPTION · NOT UNIVERSAL CONSTANT
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    id: 'marine_axial',
                    label: '3-Blade Marine',
                    refText: 'Ref Np,0 = 0.38',
                    rangeText: 'Range: 0.30–0.85',
                  },
                  {
                    id: 'pitched_blade',
                    label: '4-Blade 45° PBT',
                    refText: 'Ref Np,0 = 1.28',
                    rangeText: 'Range: 1.10–1.75',
                  },
                  {
                    id: 'rushton_radial',
                    label: '6-Blade Disc RT',
                    refText: 'Ref Np,0 = 5.00',
                    rangeText: 'Range: 4.50–6.00',
                  },
                ] as Array<{
                  id: ImpellerType;
                  label: string;
                  refText: string;
                  rangeText: string;
                }>
              ).map((imp) => {
                const spec = IMPELLER_GEOMETRY_SPECS[imp.id];
                const isSelected = strParams.impellerType === imp.id;
                return (
                  <button
                    key={imp.id}
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({
                        ...strParams,
                        impellerType: imp.id,
                        customTurbulentNp: spec.defaultTurbulentNp0,
                      })
                    }
                    className={`p-2 text-left border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900">{imp.label}</div>
                    <div className="text-[10px] font-mono text-blue-700 font-semibold">
                      {imp.refText}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">{imp.rangeText}</div>
                  </button>
                );
              })}
            </div>

            {/* Adjustable Turbulent Reference Np,0 Slider within Literature Range */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="str-np0" className="font-medium text-slate-800">
                  Single-Impeller Turbulent <span className="font-mono">N_p,0</span> (Lit. Range{' '}
                  <span className="font-mono">
                    {activeImpellerSpec.literatureTurbulentNpRange[0].toFixed(2)}–
                    {activeImpellerSpec.literatureTurbulentNpRange[1].toFixed(2)}
                  </span>
                  )
                </label>
                <span className="font-mono font-bold text-blue-700 tabular-nums">
                  N_p,0 = {physics.turbulentReferenceNp0.toFixed(2)}
                </span>
              </div>
              <input
                id="str-np0"
                type="range"
                min={activeImpellerSpec.literatureTurbulentNpRange[0]}
                max={activeImpellerSpec.literatureTurbulentNpRange[1]}
                step={0.01}
                value={activeTurbulentNp0}
                onChange={(e) =>
                  onUpdateStrParams({
                    ...strParams,
                    customTurbulentNp: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      customTurbulentNp: activeImpellerSpec.literatureTurbulentNpRange[0],
                    })
                  }
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  Min Lit ({activeImpellerSpec.literatureTurbulentNpRange[0].toFixed(2)})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      customTurbulentNp: activeImpellerSpec.defaultTurbulentNp0,
                    })
                  }
                  className="px-1.5 py-0.5 bg-blue-50 border border-blue-300 hover:bg-blue-100 text-blue-800 font-semibold cursor-pointer"
                >
                  Reset Ref ({activeImpellerSpec.defaultTurbulentNp0.toFixed(2)})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      customTurbulentNp: activeImpellerSpec.literatureTurbulentNpRange[1],
                    })
                  }
                  className="px-1.5 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  Max Lit ({activeImpellerSpec.literatureTurbulentNpRange[1].toFixed(2)})
                </button>
              </div>
            </div>

            {/* Baffling Configuration Selector */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-800">Vessel Wall Baffling:</span>
              <div className="grid grid-cols-2 gap-1 bg-slate-200/70 p-0.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({ ...strParams, bafflingMode: 'standard_4_baffles' })
                  }
                  className={`px-2 py-1 cursor-pointer ${
                    strParams.bafflingMode !== 'unbaffled_surface_vortex'
                      ? 'bg-white text-slate-900 font-semibold'
                      : 'text-slate-600'
                  }`}
                >
                  4 Baffles (B=D_T/10)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      bafflingMode: 'unbaffled_surface_vortex',
                    })
                  }
                  className={`px-2 py-1 cursor-pointer ${
                    strParams.bafflingMode === 'unbaffled_surface_vortex'
                      ? 'bg-amber-100 text-amber-950 font-semibold'
                      : 'text-slate-600'
                  }`}
                >
                  Unbaffled (×{activeImpellerSpec.unbaffledVortexPenaltyFactor.toFixed(2)})
                </button>
              </div>
            </div>

            {/* Exact Geometry, Reynolds Regime & Ungassed vs Gassed Power Breakdown */}
            <div className="pt-2 border-t border-slate-200 space-y-2 text-[11px]">
              <div className="font-mono text-slate-700 space-y-0.5">
                <div>
                  <strong className="text-slate-900">Geometry Spec:</strong>{' '}
                  {activeImpellerSpec.bladeCount} blades · {activeImpellerSpec.bladePitchOrAngle} ·{' '}
                  {activeImpellerSpec.bladeWidthToDiameterRatio}
                </div>
                <div>
                  <strong className="text-slate-900">Baffling Ref:</strong>{' '}
                  {activeImpellerSpec.standardBafflingAssumption}
                </div>
              </div>

              {/* Reynolds Number & Flow Regime Classification Banner */}
              <div
                className={`p-2 border font-mono text-[10px] ${
                  physics.isReynoldsOutOfRange
                    ? 'bg-rose-50 border-rose-400 text-rose-950'
                    : physics.reynoldsNumber < 10000
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                  <span>Re = {physics.reynoldsNumber.toLocaleString()}</span>
                  <span>{physics.flowRegimeClassification}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-snug">
                  {activeImpellerSpec.transitionalCorrelationDescription}
                </p>
              </div>

              {/* Side-by-Side Ungassed vs Gassed Power Readout */}
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px] tabular-nums">
                <div className="p-2 bg-white border border-slate-200">
                  <div className="font-bold text-slate-700 uppercase">
                    Ungassed Power (P_0 ≈ n·N_p·ρ·N³·D_i⁵)
                  </div>
                  <div className="mt-0.5 text-slate-600">
                    Single Impeller N_p(Re):{' '}
                    <strong>{physics.reynoldsCorrectedSingleNp.toFixed(2)}</strong>
                  </div>
                  <div className="text-slate-600">
                    Ideal Additive (n={physics.impellerCount} × N_p):{' '}
                    <strong>{physics.idealAdditiveUngassedNpTotal.toFixed(2)}</strong> ({physics.impellerCount}×)
                  </div>
                  <div className="text-slate-600">
                    Effective Assembly N_p,total,0:{' '}
                    <strong className="text-slate-900">
                      {physics.ungassedPowerNumberTotalNp.toFixed(2)}
                    </strong>{' '}
                    (×{physics.multiImpellerStagingFactor.toFixed(2)})
                  </div>
                  <div className="text-slate-900 font-bold mt-0.5">
                    P_0 = {physics.ungassedPowerW.toFixed(1)} W ({physics.ungassedSpecificPowerWPerM3.toFixed(1)} W/m³)
                  </div>
                </div>

                <div className="p-2 bg-white border border-blue-200">
                  <div className="font-bold text-blue-800 uppercase">
                    Gassed Power (P_g · {physics.impellerCount} Impeller{physics.impellerCount > 1 ? 's' : ''})
                  </div>
                  <div className="mt-0.5 text-slate-600">
                    Fl_g = Q_g/(N·D_i³): <strong>{physics.aerationFlowNumberFlg.toFixed(4)}</strong>
                  </div>
                  <div className="text-slate-600">
                    P_g/P_0 = <strong>{physics.gassingPowerFactorPgP0.toFixed(2)}</strong> · Assembly N_p,g ={' '}
                    <strong>{physics.effectiveGassedPowerNumberNpg.toFixed(2)}</strong>
                  </div>
                  <div className="text-slate-600">
                    Zoning Factor (t_m): <strong>×{physics.multiImpellerZoningFactor.toFixed(2)}</strong>
                  </div>
                  <div className="text-blue-900 font-bold mt-0.5">
                    P_g = {physics.gassedPowerW.toFixed(1)} W ({physics.specificPowerWPerM3.toFixed(1)} W/m³)
                  </div>
                </div>
              </div>

              {/* Local Energy Dissipation & Shear Nuance Note */}
              <div className="p-2 bg-white border border-slate-200 text-[10px] text-slate-700 leading-snug space-y-1">
                <div className="font-mono font-semibold text-slate-900">
                  Local Dissipation ε_T,max = {physics.localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg (Φ = {physics.trailingVortexFactorPhi}× mean ε̄_T = {physics.meanEnergyDissipationWPerKg.toFixed(3)} W/kg)
                </div>
                <p>{activeImpellerSpec.shearPhysicsNote}</p>
                <div className="font-mono text-[9px] text-slate-500 pt-1 border-t border-slate-100">
                  <strong>Verified Citations:</strong> {activeImpellerSpec.primaryNpCitations[0]};{' '}
                  {activeImpellerSpec.gassedPowerCitation}; {activeImpellerSpec.turbulentShearCitations[0]}.
                </div>
              </div>
            </div>
          </div>

          {/* Sparger Architecture Selector (Open-Pipe vs Sintered Microsparger) */}
          <div>
            <label className="block text-xs font-medium text-slate-800 mb-1.5">
              Sparger Gas-Distribution Hardware (<span className="font-mono">k_La</span> Interfacial Area)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateStrParams({ ...strParams, spargerType: 'open_pipe' })}
                className={`p-2 text-left border transition-colors cursor-pointer ${
                  strParams.spargerType !== 'sintered_microsparger'
                    ? 'border-rose-600 bg-rose-50/50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">
                  Open-Pipe / Ring Sparger
                </div>
                <div className="text-[10px] font-mono text-rose-700">
                  3–5 mm bubbles · 500 L OTR ≈ 3.2 mmol/L/h
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateStrParams({ ...strParams, spargerType: 'sintered_microsparger' })
                }
                className={`p-2 text-left border transition-colors cursor-pointer ${
                  strParams.spargerType === 'sintered_microsparger'
                    ? 'border-emerald-600 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">
                  Sintered Microsparger (15 μm)
                </div>
                <div className="text-[10px] font-mono text-emerald-700">
                  High gas-liquid area · OTR ≈ 18.6 mmol/L/h
                </div>
              </button>
            </div>
          </div>

          {/* kLa Determination Mode & Direct Assumed kLa Control */}
          <div className="p-3 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800">
                Volumetric <span className="font-mono">k_La</span> Mode (Calculated vs. Assumed)
              </span>
              <span className="font-mono font-bold text-blue-700">
                k_La = {physics.klaPerHour.toFixed(1)} h⁻¹
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateStrParams({
                    ...strParams,
                    klaMode: 'calculated_vant_riet',
                  })
                }
                className={`px-2 py-1 text-[11px] font-mono border cursor-pointer ${
                  (strParams.klaMode ?? 'calculated_vant_riet') ===
                  'calculated_vant_riet'
                    ? 'bg-blue-700 text-white border-blue-800 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Calculated (Van&apos;t Riet: {physics.vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹)
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateStrParams({
                    ...strParams,
                    klaMode: 'assumed_manual',
                    assumedKlaPerHour:
                      strParams.assumedKlaPerHour ??
                      Math.round(physics.vantRietCalculatedKlaPerHour),
                  })
                }
                className={`px-2 py-1 text-[11px] font-mono border cursor-pointer ${
                  strParams.klaMode === 'assumed_manual'
                    ? 'bg-amber-700 text-white border-amber-800 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Assumed / Measured k_La
              </button>
            </div>
            {strParams.klaMode === 'assumed_manual' && (
              <div className="pt-1">
                <input
                  id="str-assumed-kla"
                  aria-label="Assumed volumetric mass transfer coefficient kLa per hour"
                  type="range"
                  min={2}
                  max={180}
                  step={0.5}
                  value={
                    strParams.assumedKlaPerHour ??
                    physics.vantRietCalculatedKlaPerHour
                  }
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      klaMode: 'assumed_manual',
                      assumedKlaPerHour: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-amber-900 mt-0.5">
                  <span>Assumed: {physics.klaPerHour.toFixed(1)} h⁻¹</span>
                  <span>Van&apos;t Riet: {physics.vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹</span>
                </div>
              </div>
            )}
          </div>

          {/* Stirrer Speed N (rpm) */}
          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="str-rpm" className="font-medium text-slate-800">
                Stirrer Agitation Speed (<span className="font-mono">N</span>)
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {strParams.stirrerSpeedRpm} rpm · u_tip = {physics.tipSpeedMPerS.toFixed(2)} m/s
              </span>
            </div>
            <input
              id="str-rpm"
              type="range"
              min={2}
              max={320}
              step={1}
              value={strParams.stirrerSpeedRpm}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  stirrerSpeedRpm: parseInt(e.target.value, 10),
                })
              }
              className="w-full mt-1 accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Aeration Sparge Rate (vvm) */}
          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="str-vvm" className="font-medium text-slate-800">
                Aeration Sparge Rate (<span className="font-mono">Q_gas / V</span>)
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {strParams.spargeRateVvm.toFixed(3)} vvm · v_s = {physics.superficialGasVelocityMPerS.toFixed(4)} m/s
              </span>
            </div>
            <input
              id="str-vvm"
              type="range"
              min={0.01}
              max={0.115}
              step={0.005}
              value={strParams.spargeRateVvm}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  spargeRateVvm: parseFloat(e.target.value),
                })
              }
              className="w-full mt-1 accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Sparge O2 Enrichment Mole Fraction */}
          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="str-o2" className="font-medium text-slate-800">
                Sparge Gas O₂ Mole Fraction (<span className="font-mono">y_O2</span>)
              </label>
              <span className="font-mono font-semibold text-blue-700 tabular-nums">
                {(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% O₂{' '}
                {strParams.oxygenEnrichmentFraction <= 0.22 ? '(Air Only)' : '(O₂-Enriched)'}
              </span>
            </div>
            <input
              id="str-o2"
              type="range"
              min={0.21}
              max={1.0}
              step={0.01}
              value={strParams.oxygenEnrichmentFraction}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  oxygenEnrichmentFraction: parseFloat(e.target.value),
                })
              }
              className="w-full mt-1 accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-0.5">
              <span>21% Air (Max {physics.maxSupportedVcdOnAirE6.toFixed(1)}×10⁶/mL)</span>
              <span>Current Max: {physics.maxSupportedVcdAtCurrentGasE6.toFixed(1)}×10⁶/mL</span>
            </div>
          </div>

          {/* Target Viable Cell Density (10^6 cells/mL) */}
          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="str-vcd" className="font-medium text-slate-800">
                Target Perfusion Viable Cell Density (<span className="font-mono">X_v</span>)
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {strParams.targetVcdE6PerMl.toFixed(0)} × 10⁶ cells/mL
              </span>
            </div>
            <input
              id="str-vcd"
              type="range"
              min={5}
              max={80}
              step={1}
              value={strParams.targetVcdE6PerMl}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  targetVcdE6PerMl: parseFloat(e.target.value),
                })
              }
              className="w-full mt-1 accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Impeller Staging (1, 2, or 3 Impellers) & Vessel Tank Geometry / Spacing Controls */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold text-slate-900 block">
                  Impeller Staging (1, 2, or 3 Impellers · ×{physics.multiImpellerStagingFactor.toFixed(2)} P_0)
                </span>
                <span className="text-[11px] font-mono text-slate-600">
                  Single N_p = {physics.reynoldsCorrectedSingleNp.toFixed(2)} → Assembly N_p,total ={' '}
                  <strong className="text-blue-700">
                    {physics.ungassedPowerNumberTotalNp.toFixed(2)}
                  </strong>{' '}
                  (Ideal n×N_p = {physics.idealAdditiveUngassedNpTotal.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-1 shrink-0">
                {[1, 2, 3].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => onUpdateStrParams({ ...strParams, impellerCount: cnt })}
                    className={`px-2.5 py-1 text-xs font-mono cursor-pointer transition-colors ${
                      strParams.impellerCount === cnt
                        ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    {cnt} Impeller{cnt > 1 ? 's' : ''} ({cnt}×)
                  </button>
                ))}
              </div>
            </div>

            {/* Tank Geometry & Impeller Spacing Sliders (Z/D_T, ΔC/D_i, C_1/D_i) */}
            <div className="p-3 bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-mono text-[11px] font-semibold text-slate-800 uppercase">
                  Tank Aspect Ratio &amp; Multi-Impeller Spacing Geometry
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  D_T = {physics.tankDiameterM.toFixed(2)} m · Z = {physics.liquidHeightM.toFixed(2)} m · D_i = {physics.impellerDiameterM.toFixed(2)} m
                </span>
              </div>

              {/* Vessel Aspect Ratio Z / D_T */}
              <div>
                <div className="flex justify-between text-[11px]">
                  <label htmlFor="str-zdt" className="font-medium text-slate-800">
                    Vessel Liquid Height-to-Diameter Ratio (<span className="font-mono">Z / D_T</span>)
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    Z/D_T = {strParams.aspectRatioZDt.toFixed(2)} (Z = {physics.liquidHeightM.toFixed(2)} m)
                  </span>
                </div>
                <input
                  id="str-zdt"
                  type="range"
                  min={1.15}
                  max={2.80}
                  step={0.05}
                  value={strParams.aspectRatioZDt}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      aspectRatioZDt: parseFloat(e.target.value),
                    })
                  }
                  className="w-full mt-0.5 accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>1.15 (Squat dish)</span>
                  <span>1.45–1.80 (2-impeller STR)</span>
                  <span>2.10–2.80 (Tall 3-impeller STR)</span>
                </div>
              </div>

              {/* Inter-Impeller Spacing Ratio ΔC / D_i (enabled when n >= 2) */}
              {strParams.impellerCount >= 2 && (
                <div>
                  <div className="flex justify-between text-[11px]">
                    <label htmlFor="str-spacing" className="font-medium text-slate-800">
                      Inter-Impeller Spacing (<span className="font-mono">ΔC / D_i</span>)
                    </label>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        physics.isCloselySpacedInteractionFlagged
                          ? 'text-amber-800'
                          : 'text-emerald-800'
                      }`}
                    >
                      ΔC/D_i = {physics.impellerSpacingRatioDeltaCDi.toFixed(2)} (ΔC ={' '}
                      {physics.impellerSpacingDeltaCM.toFixed(2)} m)
                      {physics.isCloselySpacedInteractionFlagged
                        ? ' · ⚠ Closely Spaced (<1.5)'
                        : ' · ● Independent (≥1.5)'}
                    </span>
                  </div>
                  <input
                    id="str-spacing"
                    type="range"
                    min={0.65}
                    max={2.20}
                    step={0.05}
                    value={strParams.impellerSpacingRatioDeltaCDi ?? 1.50}
                    onChange={(e) =>
                      onUpdateStrParams({
                        ...strParams,
                        impellerSpacingRatioDeltaCDi: parseFloat(e.target.value),
                      })
                    }
                    className="w-full mt-0.5 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>&lt;1.0 Coalescing</span>
                    <span>1.0–1.5 Merging / Interacting</span>
                    <span>≥1.5 Independent (n × N_p)</span>
                  </div>
                </div>
              )}

              {/* Bottom Impeller Clearance Ratio C_1 / D_i */}
              <div>
                <div className="flex justify-between text-[11px]">
                  <label htmlFor="str-clearance" className="font-medium text-slate-800">
                    Bottom Impeller Clearance (<span className="font-mono">C₁ / D_i</span>)
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    C₁/D_i = {physics.bottomClearanceRatioC1Di.toFixed(2)} (C₁ ={' '}
                    {physics.bottomClearanceC1M.toFixed(2)} m, C₁/D_T ={' '}
                    {physics.bottomClearanceRatioC1Dt.toFixed(2)})
                  </span>
                </div>
                <input
                  id="str-clearance"
                  type="range"
                  min={0.45}
                  max={1.35}
                  step={0.05}
                  value={strParams.bottomClearanceRatioC1Di ?? 0.90}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      bottomClearanceRatioC1Di: parseFloat(e.target.value),
                    })
                  }
                  className="w-full mt-0.5 accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Top Impeller Submergence & Power Addition Mode Selector */}
              <div className="pt-1.5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono">
                <span
                  className={
                    physics.isTopSubmergenceInsufficient
                      ? 'text-rose-800 font-bold'
                      : 'text-slate-700'
                  }
                >
                  Top Submergence S_top/D_i ={' '}
                  <strong>{physics.topImpellerSubmergenceRatioStopDi.toFixed(2)}</strong> (
                  {physics.topImpellerSubmergenceM.toFixed(2)} m){' '}
                  {physics.isTopSubmergenceInsufficient ? '✖ < 0.50 D_i' : '● ≥ 0.50 D_i'}
                </span>
                {strParams.impellerCount >= 2 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateStrParams({
                          ...strParams,
                          multiImpellerPowerModel: 'spacing_interaction_corrected',
                        })
                      }
                      className={`px-2 py-0.5 border cursor-pointer ${
                        (strParams.multiImpellerPowerModel ?? 'spacing_interaction_corrected') ===
                        'spacing_interaction_corrected'
                          ? 'bg-slate-800 text-white border-slate-900 font-semibold'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Spacing-Corrected N_p
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateStrParams({
                          ...strParams,
                          multiImpellerPowerModel: 'independent_additive',
                        })
                      }
                      className={`px-2 py-0.5 border cursor-pointer ${
                        strParams.multiImpellerPowerModel === 'independent_additive'
                          ? 'bg-blue-700 text-white border-blue-800 font-semibold'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Ideal Additive (n × N_p)
                    </button>
                  </div>
                )}
              </div>

              {/* Warning Banner when Closely Spaced Impellers or Insufficient Top Submergence occur */}
              {physics.isCloselySpacedInteractionFlagged && strParams.impellerCount >= 2 && (
                <div className="p-2.5 bg-amber-50 border border-amber-400 text-[11px] text-amber-950 space-y-1">
                  <div className="font-mono font-bold text-amber-900">
                    ⚠ CLOSELY SPACED IMPELLER INTERACTION FLAG (ΔC/D_i ={' '}
                    {physics.impellerSpacingRatioDeltaCDi.toFixed(2)} &lt; 1.50)
                  </div>
                  <p>
                    At <span className="font-mono">ΔC/D_i = {physics.impellerSpacingRatioDeltaCDi.toFixed(2)}</span>,
                    adjacent impeller discharge streams{' '}
                    {physics.impellerSpacingRatioDeltaCDi < 1.0 ? 'coalesce' : 'merge and interfere'} (Hudcova, Machon &amp; Nienow, 1989; Rutherford et al., 1996). Simple independent power addition (
                    <span className="font-mono">
                      n × N_p = {physics.idealAdditiveUngassedNpTotal.toFixed(2)} →{' '}
                      {physics.idealAdditiveUngassedPowerW.toFixed(1)} W
                    </span>
                    ) is <strong>unreliable</strong>; spacing-corrected assembly power number is{' '}
                    <span className="font-mono font-bold">
                      N_p,total,0 = {(physics.reynoldsCorrectedSingleNp * physics.impellerCount * physics.spacingInteractionFactor * physics.clearancePenaltyFactor).toFixed(2)}
                    </span>{' '}
                    (interaction factor ×{physics.spacingInteractionFactor.toFixed(2)}, approximate correlation).
                  </p>
                </div>
              )}

              {physics.isTopSubmergenceInsufficient && strParams.impellerCount >= 2 && (
                <div className="p-2.5 bg-rose-50 border border-rose-400 text-[11px] text-rose-950 space-y-1.5">
                  <div className="font-mono font-bold text-rose-900">
                    ✖ INSUFFICIENT TOP IMPELLER SUBMERGENCE (S_top/D_i ={' '}
                    {physics.topImpellerSubmergenceRatioStopDi.toFixed(2)} &lt; 0.50)
                  </div>
                  <p>
                    Fitting <strong>{strParams.impellerCount} impellers</strong> at spacing{' '}
                    <span className="font-mono">ΔC/D_i = {physics.impellerSpacingRatioDeltaCDi.toFixed(2)}</span>{' '}
                    inside a vessel of aspect ratio{' '}
                    <span className="font-mono">Z/D_T = {strParams.aspectRatioZDt.toFixed(2)}</span>{' '}
                    leaves only{' '}
                    <span className="font-mono">
                      S_top = {physics.topImpellerSubmergenceM.toFixed(2)} m (
                      {physics.topImpellerSubmergenceRatioStopDi.toFixed(2)} D_i)
                    </span>{' '}
                    above the upper impeller, causing severe surface vortexing, gas blow-through, and loss of upper-stage loading.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({
                        ...strParams,
                        aspectRatioZDt: strParams.impellerCount === 3 ? 2.15 : 1.65,
                        impellerSpacingRatioDeltaCDi: 1.50,
                        bottomClearanceRatioC1Di: 0.90,
                      })
                    }
                    className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-rose-700 text-white hover:bg-rose-800 cursor-pointer"
                  >
                    Auto-Adjust Tank Aspect Ratio (Z/D_T → {strParams.impellerCount === 3 ? '2.15' : '1.65'}) for Independent {strParams.impellerCount}-Impeller Operation →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 7 Columns: Scale-Up Operating Window Graph (Van't Riet 1979, Nienow 1997) & Automated Pipeline Predictor */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-mono text-slate-500">
                  OTR/OUR &amp; SCALE-UP FEASIBILITY ENVELOPE — VAN&apos;T RIET (1979), NIENOW (1997)
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                  Operating Window at {strParams.workingVolumeL.toLocaleString()} L ({strParams.targetVcdE6PerMl.toFixed(0)}×10⁶ cells/mL, {(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% O₂)
                </h3>
              </div>
              <span
                className={`text-xs font-mono font-semibold px-2.5 py-1 border ${
                  physics.isScaleUpFeasible
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {physics.isScaleUpFeasible ? '● Inside Operating Window' : '✖ Boundary Exceeded'}
              </span>
            </div>

            {/* SVG Operating Window Chart */}
            <div className="pt-4">
              <svg
                viewBox="0 0 620 300"
                className="w-full h-auto bg-slate-50 border border-slate-200 overflow-visible"
                role="img"
                aria-label="Bioreactor scale-up operating window showing agitation power per volume versus aeration sparge rate"
              >
                <defs>
                  <pattern
                    id="feasibleHatch"
                    width="8"
                    height="8"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="8"
                      stroke="#10B981"
                      strokeWidth="1.8"
                      strokeOpacity="0.35"
                    />
                  </pattern>
                </defs>

                {/* Grid Lines */}
                {[0, 100, 200, 300, 400, 500].map((pv) => {
                  const y = mapY(pv);
                  return (
                    <g key={pv}>
                      <line
                        x1={62}
                        y1={y}
                        x2={582}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                      />
                      <text
                        x={54}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[9px] font-mono fill-slate-500"
                      >
                        {pv}
                      </text>
                    </g>
                  );
                })}

                {[0.01, 0.03, 0.05, 0.07, 0.09, 0.11].map((vvm) => {
                  const x = mapX(vvm);
                  return (
                    <g key={vvm}>
                      <line
                        x1={x}
                        y1={30}
                        x2={x}
                        y2={260}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={274}
                        textAnchor="middle"
                        className="text-[9px] font-mono fill-slate-600"
                      >
                        {vvm.toFixed(2)} vvm
                      </text>
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={322}
                  y={292}
                  textAnchor="middle"
                  className="text-[10px] font-mono fill-slate-700 font-semibold"
                >
                  AERATION SPARGE RATE [vvm] (SUPERFICIAL GAS VELOCITY v_s = {physics.superficialGasVelocityMPerS.toFixed(4)} m/s)
                </text>
                <text
                  x={16}
                  y={145}
                  textAnchor="middle"
                  transform="rotate(-90, 16, 145)"
                  className="text-[10px] font-mono fill-slate-700 font-semibold"
                >
                  AGITATION SPECIFIC POWER P_g / V [W/m³]
                </text>

                {/* Hatched Feasible Operating Window Polygon */}
                {feasiblePolygonPoints.length > 0 && (
                  <polygon
                    points={feasiblePolygonPoints}
                    fill="url(#feasibleHatch)"
                    stroke="#059669"
                    strokeWidth="2"
                  />
                )}

                {/* 1. CO2 Inhibition Left Vertical Boundary */}
                <line
                  x1={mapX(0.018)}
                  y1={30}
                  x2={mapX(0.018)}
                  y2={260}
                  stroke="#64748B"
                  strokeWidth="1.8"
                  strokeDasharray="4,3"
                />
                <text
                  x={mapX(0.018) + 5}
                  y={52}
                  className="text-[9px] font-mono fill-slate-600 font-semibold"
                >
                  ← CO₂ Inhibition
                </text>

                {/* 2. Top Boundary: Hydromechanical Shear Stress Limit */}
                <polyline
                  fill="none"
                  stroke="#E11D48"
                  strokeWidth="2.2"
                  strokeDasharray="6,3"
                  points={windowPoints
                    .map((pt) => `${mapX(pt.vvm).toFixed(1)},${mapY(pt.maxPvForShearWPerM3).toFixed(1)}`)
                    .join(' ')}
                />
                <text
                  x={290}
                  y={Math.max(42, mapY(windowPoints[10].maxPvForShearWPerM3) - 6)}
                  className="text-[9px] font-mono fill-rose-700 font-bold"
                >
                  Hydromechanical Stress Ceiling (τ ≤ {groundedParams.shearThresholdPa} Pa)
                </text>

                {/* 3. Oxygen Limitation Curve (OTR = OUR) */}
                <polyline
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  points={windowPoints
                    .map((pt) => `${mapX(pt.vvm).toFixed(1)},${mapY(pt.minPvForOtrWPerM3).toFixed(1)}`)
                    .join(' ')}
                />
                <text
                  x={155}
                  y={Math.min(252, mapY(windowPoints[5].minPvForOtrWPerM3) - 6)}
                  className="text-[9px] font-mono fill-blue-700 font-bold"
                >
                  Oxygen Limitation (OTR = OUR = {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h)
                </text>

                {/* 4. Insufficient Mixing Floor (tm <= 60s) */}
                <polyline
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="1.8"
                  strokeDasharray="3,3"
                  points={windowPoints
                    .map((pt) => `${mapX(pt.vvm).toFixed(1)},${mapY(pt.minPvForMixingWPerM3).toFixed(1)}`)
                    .join(' ')}
                />
                <text
                  x={430}
                  y={Math.min(254, mapY(windowPoints[18].minPvForMixingWPerM3) + 12)}
                  className="text-[9px] font-mono fill-amber-700 font-semibold"
                >
                  Insufficient Mixing (t_m &gt; 60 s)
                </text>

                {/* 5. Foaming Right Boundary */}
                <polyline
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="1.8"
                  strokeDasharray="4,2"
                  points={windowPoints
                    .filter((pt) => pt.vvm >= 0.05)
                    .map((pt) => `${mapX(pt.vvm).toFixed(1)},${mapY(pt.maxPvForFoamingWPerM3).toFixed(1)}`)
                    .join(' ')}
                />
                <text
                  x={475}
                  y={90}
                  className="text-[9px] font-mono fill-purple-700 font-semibold"
                >
                  Foaming Limit →
                </text>

                {/* Current Operating Point Marker */}
                <circle
                  cx={currentOpX}
                  cy={currentOpY}
                  r={7}
                  fill={physics.isScaleUpFeasible ? '#059669' : '#E11D48'}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                <text
                  x={Math.min(520, currentOpX + 10)}
                  y={Math.max(40, currentOpY - 6)}
                  className="text-[10px] font-mono fill-slate-900 font-bold"
                >
                  Active Point ({physics.specificPowerWPerM3.toFixed(0)} W/m³, {strParams.spargeRateVvm.toFixed(3)} vvm)
                </text>
              </svg>
            </div>

            {/* Automated Pipeline Next-Step Predictor */}
            <div className="mt-5 p-4 bg-slate-900 text-slate-100">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-700">
                <span className="text-xs font-mono text-cyan-400 font-semibold">
                  AUTOMATED PIPELINE NEXT-STEP PREDICTOR &amp; SCALE-UP DIAGNOSIS
                </span>
                <button
                  type="button"
                  onClick={onNavigateToOptimiser}
                  className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <span>Proceed to Stage 3 BO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {physics.limitingFactors.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-rose-300 font-mono">
                  {physics.limitingFactors.map((lf) => (
                    <div key={lf}>✖ {lf}</div>
                  ))}
                </div>
              )}
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-200">
                {physics.automatedPipelineNextSteps.map((step) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="text-cyan-400 font-mono font-bold">→</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Impeller Staging (1, 2, or 3 Impellers) Hydrodynamic & Engineering Trade-Off Panel */}
      <div className="bg-white border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-blue-700 font-semibold">
              MULTI-IMPELLER STAGING PHYSICS (1, 2, OR 3 IMPELLERS) · POWER ADDITION, TANK GEOMETRY &amp; COMPARTMENTALISATION
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
              Single-Impeller <span className="font-mono">N_p</span> vs. Complete Assembly{' '}
              <span className="font-mono">N_p,total</span> (<span className="font-mono">P_total ≈ n × N_p × ρ × N³ × D_i⁵</span>)
            </h3>
            <p className="text-xs text-slate-600 mt-1 max-w-4xl">
              In fully turbulent flow (<span className="font-mono">Re ≥ 10,000</span>), the dimensionless power number <span className="font-mono">N_p</span> of a single impeller becomes approximately independent of Reynolds number, but adding a 2nd or 3rd impeller increases total shaft power. When <span className="font-mono">n ∈ {'{1, 2, 3}'}</span> identical impellers are sufficiently separated (<span className="font-mono">ΔC/D_i ≥ 1.5</span>, <span className="font-mono">C₁/D_i ≥ 0.65</span>, <span className="font-mono">S_top/D_i ≥ 0.50</span>), total ungassed power scales as <strong className="font-mono">P_total,0 ≈ n × N_p × ρ × N³ × D_i⁵</strong> (1×, 2×, 3×). However, closely spaced impellers (<span className="font-mono">ΔC/D_i &lt; 1.5</span>) interact hydrodynamically, and multiple radial Rushton turbines create separate circulation zones with poor top-to-bottom exchange.
            </p>
          </div>
          <div className="shrink-0 p-3 bg-slate-50 border border-slate-200 font-mono text-xs space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-bold">
              Active Assembly Regime
            </div>
            <div className="font-semibold text-slate-900">
              {physics.multiImpellerFlowRegimeLabel}
            </div>
            <div className="text-[11px] text-blue-700">
              Single N_p(Re) = {physics.reynoldsCorrectedSingleNp.toFixed(2)} · Assembly N_p,total,0 ={' '}
              <strong>{physics.ungassedPowerNumberTotalNp.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Idealized Reference Scaling vs Active Impeller Family */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch text-xs">
          <div className="lg:col-span-5 p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-mono text-[11px] font-bold text-slate-800 uppercase">
              Idealized Independent Turbulent Scaling (ΔC/D_i ≥ 1.5, Re ≥ 10,000)
            </div>
            <p className="text-slate-600 text-[11px]">
              For a single impeller, <span className="font-mono">P_0 = N_p · ρ · N³ · D_i⁵</span>. For <span className="font-mono">n</span> independent identical impellers, <span className="font-mono">P_total,0 ≈ n · N_p · ρ · N³ · D_i⁵</span>:
            </p>
            <table className="w-full text-left border-collapse font-mono text-[11px] bg-white border border-slate-200">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="py-1.5 px-2.5">Impellers (n)</th>
                  <th className="py-1.5 px-2.5">Rushton (N_p=5.0)</th>
                  <th className="py-1.5 px-2.5">Active ({activeImpellerSpec.shortLabel.split(' ')[1]} N_p={physics.reynoldsCorrectedSingleNp.toFixed(2)})</th>
                  <th className="py-1.5 px-2.5">Relative Power</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 tabular-nums">
                {[1, 2, 3].map((nCnt) => (
                  <tr
                    key={nCnt}
                    className={
                      physics.impellerCount === nCnt
                        ? 'bg-blue-50/80 font-bold text-slate-900'
                        : 'text-slate-700'
                    }
                  >
                    <td className="py-1.5 px-2.5">n = {nCnt}</td>
                    <td className="py-1.5 px-2.5">N_p,total ≈ {(5.0 * nCnt).toFixed(1)}</td>
                    <td className="py-1.5 px-2.5 text-blue-700">
                      N_p,total ≈ {(physics.reynoldsCorrectedSingleNp * nCnt).toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2.5">{nCnt}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-slate-500 font-mono">
              Note: Idealized estimates; actual power depends on spacing ΔC/D_i, bottom clearance C₁/D_i, top submergence S_top/D_i, and gassing Fl_g (Hudcova et al., 1989; Rutherford et al., 1996).
            </div>
          </div>

          <div className="lg:col-span-7 p-4 bg-amber-50/50 border border-amber-200 space-y-2">
            <div className="font-mono text-[11px] font-bold text-amber-950 uppercase">
              Why Adding More Impellers Does Not Automatically Improve Bioreactor Performance
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-800">
              <li>
                <strong>1. Radial Compartmentalisation (Multiple Rushton Turbines):</strong> While 2 or 3 radial Rushton turbines double or triple power draw (<span className="font-mono">N_p,total ≈ 10</span> or <span className="font-mono">15</span>) and boost local gas dispersion, each radial stage forms an isolated figure-of-eight circulation loop separated by horizontal shear planes. This <strong>impedes top-to-bottom axial exchange</strong> and increases macromixing time (<span className="font-mono">t_m</span> zoning factor ×1.24 for n=2, ×1.46 for n=3; Vasconcelos et al., 1995; Cooke et al., 1988).
              </li>
              <li>
                <strong>2. Axial Loop Unification in Tall Vessels (Marine / Pitched-Blade):</strong> In tall bioreactors (<span className="font-mono">Z/D_T ≥ 1.8</span>), a single impeller (<span className="font-mono">n = 1</span>) starves the upper zone (<span className="font-mono">t_m</span> penalty). Staging 2 or 3 well-spaced (<span className="font-mono">ΔC/D_i ≥ 1.5</span>) axial/mixed-flow impellers merges their discharge into a unified top-to-bottom axial circulation loop, reducing <span className="font-mono">t_m</span> while distributing <span className="font-mono">P_g/V</span> and <span className="font-mono">k_La</span>.
              </li>
              <li>
                <strong>3. Closely Spaced Interference &amp; Submergence Limits:</strong> Crowding 3 impellers into a short tank (<span className="font-mono">Z/D_T &lt; 1.8</span> at <span className="font-mono">D_i/D_T = 0.40</span>) forces either insufficient top submergence (<span className="font-mono">S_top/D_i &lt; 0.50</span>, causing surface vortexing) or close spacing (<span className="font-mono">ΔC/D_i &lt; 1.50</span>, causing merging/coalescing jets and elevated local shear <span className="font-mono">ε_T,max</span>; Armenante &amp; Chou, 1996).
              </li>
            </ul>
            <div className="pt-1 border-t border-amber-200 font-mono text-[10px] text-amber-900">
              <strong>Epistemic Status:</strong> Multi-impeller spacing interaction factors and axial/radial zoning multipliers are <strong>approximate engineering correlations</strong> (Hudcova et al., 1989; Rutherford et al., 1996; Vasconcelos et al., 1995), not experimentally validated for this specific vessel without shaft-torque and tracer-mixing calibration.
            </div>
          </div>
        </div>

        {/* Live 1 vs 2 vs 3 Impellers Engineering Comparison Table */}
        <div className="overflow-x-auto border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-600">
                <th className="py-2 px-3">Staging (n)</th>
                <th className="py-2 px-3">Single N_p(Re) → Assembly N_p,total,0</th>
                <th className="py-2 px-3">Ungassed P_0 (P_0/V)</th>
                <th className="py-2 px-3">Gassed P_g (P_g/V · P_g/P_0)</th>
                <th className="py-2 px-3">k_La &amp; OTR</th>
                <th className="py-2 px-3">Mixing Time t_m,gas (Zoning)</th>
                <th className="py-2 px-3">Shear τ &amp; λ_K</th>
                <th className="py-2 px-3">Geometry &amp; Feasibility Status</th>
                <th className="py-2 px-3 text-right">Select</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {multiImpellerComparison.map(({ impellerCount: nCnt, evalResult }) => {
                const isSelected = physics.impellerCount === nCnt;
                return (
                  <tr
                    key={nCnt}
                    onClick={() => onUpdateStrParams({ ...strParams, impellerCount: nCnt })}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/90 font-semibold text-slate-950'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">
                          {nCnt} Impeller{nCnt > 1 ? 's' : ''}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-blue-600 text-white font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      {evalResult.reynoldsCorrectedSingleNp.toFixed(2)} →{' '}
                      <strong className="text-blue-700">
                        {evalResult.ungassedPowerNumberTotalNp.toFixed(2)}
                      </strong>{' '}
                      <span className="text-[10px] text-slate-500">
                        (ideal {evalResult.idealAdditiveUngassedNpTotal.toFixed(2)})
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {evalResult.ungassedPowerW.toFixed(1)} W ({evalResult.ungassedSpecificPowerWPerM3.toFixed(1)} W/m³)
                    </td>
                    <td className="py-2.5 px-3 text-blue-700 font-bold">
                      {evalResult.gassedPowerW.toFixed(1)} W ({evalResult.specificPowerWPerM3.toFixed(1)} W/m³ · ×{evalResult.gassingPowerFactorPgP0.toFixed(2)})
                    </td>
                    <td className="py-2.5 px-3">
                      <div>k_La = {evalResult.klaPerHour.toFixed(1)} h⁻¹</div>
                      <div
                        className={
                          evalResult.oxygenMarginMmolPerLHour >= 0
                            ? 'text-emerald-700 font-bold'
                            : 'text-rose-700 font-bold'
                        }
                      >
                        OTR = {evalResult.otrMmolPerLHour.toFixed(1)} mmol/L/h
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={
                          evalResult.isMixingRateLimiting
                            ? 'text-rose-700 font-bold'
                            : 'text-teal-800 font-bold'
                        }
                      >
                        ~{formatTwoSigFigs(evalResult.mixingTimeGassedS)} s
                      </span>{' '}
                      <span className="text-[10px] text-slate-500">
                        (×{evalResult.multiImpellerZoningFactor.toFixed(2)})
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={
                          evalResult.estimatedShearStressPa > groundedParams.shearThresholdPa
                            ? 'text-rose-700 font-bold'
                            : 'text-slate-800'
                        }
                      >
                        {evalResult.estimatedShearStressPa.toFixed(2)} Pa
                      </span>{' '}
                      <span className="text-[10px] text-slate-500">
                        (λ_K={evalResult.kolmogorovScaleUm.toFixed(1)} μm)
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-[11px]">
                      {evalResult.isTopSubmergenceInsufficient && nCnt >= 2 ? (
                        <span className="text-rose-700 font-semibold">
                          ✖ S_top/D_i = {evalResult.topImpellerSubmergenceRatioStopDi.toFixed(2)} &lt; 0.50 (Raise Z/D_T)
                        </span>
                      ) : evalResult.isCloselySpacedInteractionFlagged && nCnt >= 2 ? (
                        <span className="text-amber-800 font-semibold">
                          ⚠ ΔC/D_i = {evalResult.impellerSpacingRatioDeltaCDi.toFixed(2)} &lt; 1.50 (Interacting)
                        </span>
                      ) : evalResult.isScaleUpFeasible ? (
                        <span className="text-emerald-700 font-semibold">
                          ● Feasible &amp; Independent (S_top/D_i={evalResult.topImpellerSubmergenceRatioStopDi.toFixed(2)})
                        </span>
                      ) : (
                        <span className="text-rose-700 font-semibold">
                          ✖ Constraint Violated (S_top/D_i={evalResult.topImpellerSubmergenceRatioStopDi.toFixed(2)})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStrParams({ ...strParams, impellerCount: nCnt });
                        }}
                        className={`px-2 py-1 text-[10px] font-mono border cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? 'Selected' : `Use n=${nCnt}`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Impeller Power-Number (Np) Sensitivity Analysis & Reynolds Regime Validator Panel */}
      <ImpellerSensitivityAnalysisPanel
        strParams={strParams}
        hfParams={hfParams}
        groundedParams={groundedParams}
        physics={physics}
        onUpdateStrParams={onUpdateStrParams}
      />

      {/* Constraint Violation Visualizer Radar Panel */}
      <ConstraintViolationRadarPanel
        strParams={strParams}
        hfParams={hfParams}
        groundedParams={groundedParams}
        physics={physics}
        onUpdateStrParams={onUpdateStrParams}
        onUpdateHfParams={onUpdateHfParams}
      />

      {/* Quantitative Readout Strip: Mass Balance (OTR/OUR/Bleed) + Hollow-Fibre Lumen Physics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 6 Cols: Stirred-Tank Mass-Balance & Mixing Time Readouts */}
        <div className="lg:col-span-6 bg-white border border-slate-200 p-6">
          <div className="pb-3 border-b border-slate-200">
            <div className="text-xs font-mono text-slate-500">
              STIRRED-TANK MASS-BALANCE &amp; MIXING TIME AUDIT
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              OTR vs. OUR Closure, Cell Bleed &amp; Compartmentalisation
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 font-mono text-xs tabular-nums">
            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">OXYGEN TRANSFER (OTR)</span>
              <span className="text-base font-bold text-blue-700">
                {physics.otrMmolPerLHour.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-500 block">mmol O₂ / L / h</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">OXYGEN UPTAKE (OUR)</span>
              <span className="text-base font-bold text-slate-900">
                {physics.ourMmolPerLHour.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-500 block">mmol O₂ / L / h</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">NET O₂ MARGIN (OTR − OUR)</span>
              <span
                className={`text-base font-bold ${
                  physics.oxygenMarginMmolPerLHour >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {physics.oxygenMarginMmolPerLHour >= 0 ? '+' : ''}
                {physics.oxygenMarginMmolPerLHour.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-500 block">mmol O₂ / L / h</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">GASSED MIXING TIME t_m</span>
              <span
                className={`text-base font-bold ${
                  !physics.isMixingRateLimiting ? 'text-slate-900' : 'text-rose-700'
                }`}
              >
                ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s
              </span>
              <span className="text-[11px] text-slate-500 block">
                1/kLa ≈ {formatTwoSigFigs(physics.oxygenTransferTimeConstantS)} s
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">KOLMOGOROV SCALE λ_K</span>
              <span
                className={`text-base font-bold ${
                  physics.kolmogorovScaleUm >= 18 ? 'text-slate-900' : 'text-rose-700'
                }`}
              >
                {physics.kolmogorovScaleUm.toFixed(1)} μm
              </span>
              <span className="text-[11px] text-slate-500 block">
                CHO cell Ø ~ 15 μm
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">REQUIRED CELL BLEED</span>
              <span className="text-base font-bold text-slate-900">
                {physics.requiredBleedRateVvd.toFixed(2)} VVD
              </span>
              <span className="text-[11px] text-slate-500 block">
                CSPR = {physics.cellSpecificPerfusionRatePlCellDay.toFixed(1)} pL/cell/d
              </span>
            </div>
          </div>
        </div>

        {/* Right 6 Cols: Hollow-Fibre Bioreactor Engineering Module (Fibre Diameter, Length, Flow, Pressure Drop) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 p-6 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <div className="text-xs font-mono text-slate-500">
              HOLLOW-FIBRE BIOREACTOR ENGINEERING MODULE (HAGEN-POISEUILLE LUMEN FLOW)
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Fibre Diameter, Cartridge Length, Recirculation Flow &amp; Axial Pressure Drop
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="flex justify-between">
                <label htmlFor="hf-diam" className="font-medium text-slate-800">
                  Fibre Inner Ø (<span className="font-mono">d_f</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {hfParams.fibreInnerDiameterUm} μm
                </span>
              </div>
              <input
                id="hf-diam"
                type="range"
                min={180}
                max={500}
                step={10}
                value={hfParams.fibreInnerDiameterUm}
                onChange={(e) =>
                  onUpdateHfParams({
                    ...hfParams,
                    fibreInnerDiameterUm: parseInt(e.target.value, 10),
                  })
                }
                className="w-full mt-1 accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between">
                <label htmlFor="hf-len" className="font-medium text-slate-800">
                  Fibre Length (<span className="font-mono">L_f</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {hfParams.fibreLengthM.toFixed(2)} m
                </span>
              </div>
              <input
                id="hf-len"
                type="range"
                min={0.15}
                max={0.60}
                step={0.01}
                value={hfParams.fibreLengthM}
                onChange={(e) =>
                  onUpdateHfParams({
                    ...hfParams,
                    fibreLengthM: parseFloat(e.target.value),
                  })
                }
                className="w-full mt-1 accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between">
                <label htmlFor="hf-flow" className="font-medium text-slate-800">
                  Lumen Flow (<span className="font-mono">Q</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {hfParams.recirculationFlowLMin.toFixed(1)} L/min
                </span>
              </div>
              <input
                id="hf-flow"
                type="range"
                min={1.5}
                max={15.0}
                step={0.5}
                value={hfParams.recirculationFlowLMin}
                onChange={(e) =>
                  onUpdateHfParams({
                    ...hfParams,
                    recirculationFlowLMin: parseFloat(e.target.value),
                  })
                }
                className="w-full mt-1 accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 font-mono text-xs tabular-nums">
            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">AXIAL ΔP (LUMEN)</span>
              <span
                className={`text-base font-bold ${
                  physics.hfPressureDropKpa <= 35 ? 'text-slate-900' : 'text-amber-700'
                }`}
              >
                {physics.hfPressureDropKpa.toFixed(2)} kPa
              </span>
              <span className="text-[11px] text-slate-500 block">Hagen-Poiseuille</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">WALL SHEAR τ_w</span>
              <span
                className={`text-base font-bold ${
                  physics.hfWallShearStressPa <= groundedParams.shearThresholdPa
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {physics.hfWallShearStressPa.toFixed(2)} Pa
              </span>
              <span className="text-[11px] text-slate-500 block">
                γ_w = {physics.hfWallShearRatePerS} s⁻¹
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">LUMEN VELOCITY</span>
              <span className="text-base font-bold text-slate-900">
                {(physics.hfLumenVelocityMPerS * 100).toFixed(1)} cm/s
              </span>
              <span className="text-[11px] text-slate-500 block">
                {hfParams.numberOfFibres.toLocaleString()} fibres
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">OUTLET DO (AXIAL)</span>
              <span
                className={`text-base font-bold ${
                  !physics.hfAxialOxygenDepleted ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {physics.hfOutletDoPercent.toFixed(1)}%
              </span>
              <span className="text-[11px] text-slate-500 block">
                {physics.hfAxialOxygenDepleted ? '✖ Axial O₂ Depletion' : '● Sufficient O₂'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Panel 1: "Engineering Calculations, Equations, Units & Assumptions" */}
      <div className="bg-white border border-slate-200">
        <button
          type="button"
          onClick={() => setShowEquationsPanel(!showEquationsPanel)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div>
            <div className="text-xs font-mono text-blue-700 font-semibold">
              EXPANDABLE ENGINEERING REFERENCE PANEL
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Engineering Calculations, Governing Equations, Units &amp; Literature Assumptions
            </h3>
          </div>
          {showEquationsPanel ? (
            <ChevronUp className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          )}
        </button>

        {showEquationsPanel && (
          <div className="px-6 pb-6 pt-2 border-t border-slate-200 space-y-4 text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-600">
                    <th className="py-2 px-3">Engineering Quantity</th>
                    <th className="py-2 px-3">Governing Equation</th>
                    <th className="py-2 px-3">Current Value &amp; Units</th>
                    <th className="py-2 px-3">Source Reference &amp; Explicit Assumption</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Oxygen Uptake Rate (OUR)
                    </td>
                    <td className="py-2.5 px-3">OUR = q_O2 · X_v</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {physics.ourMmolPerLHour.toFixed(2)} mmol O₂·L⁻¹·h⁻¹
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      Unit conversion: 1 pmol·cell⁻¹·h⁻¹ × 10⁶ cells·mL⁻¹ (10⁹ cells·L⁻¹) = 1.0 mmol·L⁻¹·h⁻¹ (Rosseburg et al., 2018).
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Oxygen Transfer Rate (OTR)
                    </td>
                    <td className="py-2.5 px-3">OTR = k_La · (C*_O2 − C_L)</td>
                    <td className="py-2.5 px-3 font-bold text-blue-700">
                      {physics.otrMmolPerLHour.toFixed(2)} mmol O₂·L⁻¹·h⁻¹
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      C*_air = 0.214 mmol/L at 33.5 °C; scales with sparge O₂ fraction y_O2 / 0.21 and hydrostatic head.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Perfusion Cell &amp; Bleed Balance
                    </td>
                    <td className="py-2.5 px-3">dX_v/dt = (μ − k_d − D_bleed − (1−R)D_perf)X_v = 0</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      D_bleed = {physics.requiredBleedRateVvd.toFixed(2)} d⁻¹ (VVD)
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      Steady-state cell retention R = 0.99 (ATF hollow-fibre filter); bleed holds VCD below DO exhaustion limit.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Ungassed Impeller Power (P_0), Multi-Impeller Staging (n=1,2,3) &amp; Re Correlation
                    </td>
                    <td className="py-2.5 px-3">
                      P_total,0 ≈ n · N_p,single(Re) · f_spacing · ρ · N³ · D_i⁵ ; Re = ρ·N·D_i²/μ
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      Single N_p(Re) = {physics.reynoldsCorrectedSingleNp.toFixed(2)} | n = {physics.impellerCount} → N_p,total,0 ={' '}
                      {physics.ungassedPowerNumberTotalNp.toFixed(2)} (ideal n×N_p = {physics.idealAdditiveUngassedNpTotal.toFixed(2)}) | P_0/V ={' '}
                      {physics.ungassedSpecificPowerWPerM3.toFixed(1)} W·m⁻³
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      Rushton et al. (1950); Bates et al. (1963); Bujalski et al. (1987); Doran (2013, Table 8.2) for single-impeller N_p(Re). Hudcova, Machon &amp; Nienow (1989); Rutherford et al. (1996); Armenante &amp; Chou (1996) for multi-impeller staging (n = 1, 2, 3): independent power addition (P_total,0 ≈ n·N_p·ρ·N³·D_i⁵) holds for ΔC/D_i ≥ 1.5, C₁/D_i ≥ 0.65, S_top/D_i ≥ 0.50 at Re ≥ 10,000; closely spaced impellers (ΔC/D_i &lt; 1.5) are flagged and corrected for stream merging/coalescence.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Gassed Power Drawdown (P_g) &amp; Local Dissipation (ε_T,max)
                    </td>
                    <td className="py-2.5 px-3">
                      P_g = P_0 · f(Fl_g, vvm) ; Fl_g = Q_g/(N·D_i³) ; λ_K = (ν³/ε_T,max)^¼
                    </td>
                    <td className="py-2.5 px-3 font-bold text-blue-700">
                      P_g/P_0 = {physics.gassingPowerFactorPgP0.toFixed(2)} (N_p,g ={' '}
                      {physics.effectiveGassedPowerNumberNpg.toFixed(2)}) | P_g/V ={' '}
                      {physics.specificPowerWPerM3.toFixed(1)} W·m⁻³ | ε_T,max ={' '}
                      {physics.localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      Michel &amp; Miller (1962); Hughmark (1980) for gas-cavity power drop P_g/P_0; Wu &amp; Patterson (1989), Zhou &amp; Kresta (1996), and Nienow (1997) for trailing-vortex local dissipation ε_T,max = Φ·ε̄_T (Φ = {physics.trailingVortexFactorPhi}×) and Kolmogorov scale λ_K. (Note: Nienow 1997 is cited for λ_K and bubble-rupture mechanics, not fixed N_p constants.)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Single-Phase &amp; Gassed Mixing Time
                    </td>
                    <td className="py-2.5 px-3">θ_95% = 6.34 / [N · (D_i/D_T)^2.3 · (Z/D_T)^-0.5] ; t_m,gas ≈ 2·θ_95%</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      t_m,gas ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s (θ_95% ~{formatTwoSigFigs(physics.mixingTimeUngassedS)} s)
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      Einsele (1978); Rosseburg et al. (2018); Nienow (1997): Mixing becomes rate-limiting if t_m &gt; 60 s or exceeds oxygen time constant 1/k_La.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Hollow-Fibre Lumen Pressure Drop
                    </td>
                    <td className="py-2.5 px-3">ΔP = (128 · μ · L_f · Q) / (π · N_fibres · d_f⁴)</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      ΔP = {physics.hfPressureDropKpa.toFixed(2)} kPa (τ_w = {physics.hfWallShearStressPa.toFixed(2)} Pa)
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600">
                      Laminar Hagen-Poiseuille intracapillary flow; inverse 4th-power dependence on fibre inner diameter d_f.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Expandable Panel 2: Optional Future-CFD & PIV Integration Specification */}
      <div className="bg-white border border-slate-200">
        <button
          type="button"
          onClick={() => setShowCfdPanel(!showCfdPanel)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div>
            <div className="text-xs font-mono text-slate-500 font-semibold">
              OPTIONAL FUTURE-CFD / PIV SOLVER HANDOFF SPECIFICATION (ROSSEBURG ET AL., 2018)
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Computational Fluid Dynamics (CFD) Boundary Inputs &amp; Expected Spatial Hydrodynamic Outputs
            </h3>
          </div>
          {showCfdPanel ? (
            <ChevronUp className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          )}
        </button>

        {showCfdPanel && (
          <div className="px-6 pb-6 pt-3 border-t border-slate-200 space-y-4 text-xs">
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 font-mono">
              HONESTY &amp; SCOPE STATEMENT: bioREACT uses fast analytical mixing-time and Van&apos;t Riet correlations at runtime. A 3D Navier-Stokes / Euler-Euler multiphase CFD solver is NOT executed in-browser; the specification below defines the exact JSON/mesh handoff for downstream OpenFOAM or ANSYS Fluent validation.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="font-mono font-semibold text-slate-900">
                  INPUTS PASSED FROM bioREACT TO CFD SOLVER:
                </div>
                <ul className="space-y-1.5 text-slate-700 font-mono">
                  <li>· Vessel Diameter D_T = {physics.tankDiameterM.toFixed(3)} m, Liquid Fill Height Z = {physics.liquidHeightM.toFixed(3)} m</li>
                  <li>· Impeller Type = {strParams.impellerType} ({strParams.impellerCount} stage, N_p,0 = {physics.turbulentReferenceNp0.toFixed(2)}), Ø D_i = {physics.impellerDiameterM.toFixed(3)} m</li>
                  <li>· Moving Reference Frame (MRF) Speed N = {strParams.stirrerSpeedRpm} rpm (u_tip = {physics.tipSpeedMPerS.toFixed(2)} m/s, Re = {physics.reynoldsNumber.toLocaleString()})</li>
                  <li>· Sparger Boundary Gas Flux v_s = {physics.superficialGasVelocityMPerS.toFixed(5)} m/s, Bubble Ø d_b = 2.5 mm</li>
                  <li>· Fluid Rheology: ρ = 1005 kg/m³, μ = 0.89 mPa·s (Newtonian culture media)</li>
                </ul>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="font-mono font-semibold text-slate-900">
                  OUTPUTS RETURNED FROM CFD / PIV TO CALIBRATE bioREACT:
                </div>
                <ul className="space-y-1.5 text-slate-700 font-mono">
                  <li>· Normalized 3D Velocity Field u(x,y,z) / u_tip &amp; Dead-Zone Volume Fraction (u &lt; 0.05 u_tip)</li>
                  <li>· Local Turbulent Kinetic Energy Dissipation Histogram ε_T(x,y,z) &amp; 99th-percentile Kolmogorov λ_K,min</li>
                  <li>· Euler-Euler Gas Hold-Up Distribution α_g(x,y,z) &amp; Spatial k_La(x,y,z) Field</li>
                  <li>· Tracer Advection-Diffusion Mixing Time θ_95% &amp; Compartmentalisation Zone Boundaries</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Structured 5-Column Engineering Improvement, Trade-Offs & Validation Plan Panel */}
      <div className="bg-white border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-teal-700 font-semibold">
              CONSTRAINT FAILURE INVESTIGATION &amp; TRADE-OFF RESOLUTION MATRIX
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Structured Engineering Improvement &amp; Experimental Validation Plan
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              For every physical constraint in the mass-balance model, this table maps the physical cause
              of failure, the governing equation, candidate engineering variables to investigate,
              interacting trade-offs, and the required wet-lab validation measurement.
            </p>
          </div>
          <span className="text-xs font-mono text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 shrink-0">
            Requires Human Engineering Review Before Sign-Off
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-600">
                <th className="py-2.5 px-3">1. Failure Mode &amp; Physical Reason</th>
                <th className="py-2.5 px-3">2. Violated Equation / Threshold</th>
                <th className="py-2.5 px-3">3. Candidate Variables to Investigate</th>
                <th className="py-2.5 px-3">4. Interacting Engineering Trade-Offs</th>
                <th className="py-2.5 px-3">5. Required Validation Measurement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Row 1: Insufficient Oxygen Transfer */}
              <tr
                className={
                  physics.oxygenMarginMmolPerLHour < 0 ? 'bg-rose-50/70' : 'hover:bg-slate-50/80'
                }
              >
                <td className="py-3 px-3">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>Insufficient Oxygen Transfer</span>
                    {physics.oxygenMarginMmolPerLHour < 0 ? (
                      <span className="font-mono text-[10px] text-rose-700 font-bold uppercase">
                        [VIOLATED NOW]
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-emerald-700">[PASS]</span>
                    )}
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    Cellular O₂ demand at high perfusion VCD exceeds gas–liquid interphase transfer capacity,
                    triggering hypoxic lactate shift and viability drop.
                  </p>
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-800">
                  <div>OTR = k_La·(C*_O2 − C_L) &lt; OUR = q_O2·X_v</div>
                  <div className="mt-1 font-semibold">
                    Current: OTR {physics.otrMmolPerLHour.toFixed(1)} vs OUR{' '}
                    {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h
                  </div>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Increase sparge O₂ enrichment (21% → 45–60% O₂)</li>
                    <li>Increase volumetric mass transfer k_La via vvm or rpm</li>
                    <li>Reduce steady-state VCD X_v via higher cell bleed D_bleed</li>
                    <li>Evaluate microsparger bubble size reduction</li>
                  </ul>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  Higher agitation N or vvm increases hydrodynamic shear τ, power input P_g/V, and surface
                  foaming; low vvm with pure O₂ risks dissolved CO₂ (pCO₂ &gt; 120 mmHg) stripping failure.
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                  Dynamic gassing-out k_La test in cell-free media + online off-gas mass spectrometry +
                  optical DO probe verification at 500 L.
                </td>
              </tr>

              {/* Row 2: Excessive Hydrodynamic Shear Risk */}
              <tr
                className={
                  physics.estimatedShearStressPa > groundedParams.shearThresholdPa ||
                  physics.kolmogorovScaleUm < 18
                    ? 'bg-rose-50/70'
                    : 'hover:bg-slate-50/80'
                }
              >
                <td className="py-3 px-3">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>Excessive Hydrodynamic Shear Risk</span>
                    {physics.estimatedShearStressPa > groundedParams.shearThresholdPa ||
                    physics.kolmogorovScaleUm < 18 ? (
                      <span className="font-mono text-[10px] text-rose-700 font-bold uppercase">
                        [VIOLATED NOW]
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-emerald-700">[PASS]</span>
                    )}
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    Local trailing-vortex energy dissipation (ε_T,max = Φ·ε̄_T) governed jointly by rotational
                    speed N, diameter D_i, and blade geometry exceeds mammalian membrane tolerance, releasing
                    intracellular LDH and sialidases.
                  </p>
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-800">
                  <div>
                    τ &gt; τ_crit ({groundedParams.shearThresholdPa.toFixed(2)} Pa) or λ_K = (ν³/ε_T,max)^¼ &lt;
                    18 μm
                  </div>
                  <div className="mt-1 font-semibold">
                    Current: τ = {physics.estimatedShearStressPa.toFixed(2)} Pa, λ_K ={' '}
                    {physics.kolmogorovScaleUm.toFixed(1)} μm (ε_T,max ={' '}
                    {physics.localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg)
                  </div>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Reduce rotational speed N or D_i/D_T to lower specific gassed power P_g/V and ε_T,max</li>
                    <li>Select axial 3-blade marine propeller (ref N_p,0 = 0.38, Φ = 4.5×; Doran 2013) vs 6-blade disc turbine (ref N_p,0 = 5.0, Φ = 11.5×; Wu &amp; Patterson 1989) at moderate tip speed</li>
                    <li>Increase HFB fibre inner diameter d_f (200 → 280 μm)</li>
                  </ul>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  Lowering agitation speed N reduces k_La (worsening OTR) and lengthens gassed mixing time
                  t_m (risking pH and DO dead zones).
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                  Supernatant LDH enzymatic release assay + Trypan blue viability + HILIC-UPLC intact Fc
                  N-glycan galactosylation profile.
                </td>
              </tr>

              {/* Row 3: Poor Mixing / Compartmentalisation */}
              <tr
                className={
                  physics.isMixingRateLimiting ? 'bg-rose-50/70' : 'hover:bg-slate-50/80'
                }
              >
                <td className="py-3 px-3">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>Poor Mixing &amp; Compartmentalisation</span>
                    {physics.isMixingRateLimiting ? (
                      <span className="font-mono text-[10px] text-rose-700 font-bold uppercase">
                        [VIOLATED NOW]
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-emerald-700">[PASS]</span>
                    )}
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    Bulk circulation time exceeds oxygen transfer time constant or 60 s threshold, creating
                    localised hypoxic and alkaline pH excursion zones.
                  </p>
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-800">
                  <div>t_m,gas ≈ 2·θ_95% &gt; 60 s or t_m,gas &gt; 1/k_La</div>
                  <div className="mt-1 font-semibold">
                    Current: t_m ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s vs 1/k_La ≈{' '}
                    {formatTwoSigFigs(physics.oxygenTransferTimeConstantS)} s
                  </div>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Increase impeller-to-tank diameter ratio D_i/D_T (0.33 → 0.42)</li>
                    <li>Use dual-stage axial impellers for tall aspect ratios Z/D_T &gt; 1.8</li>
                    <li>Relocate base addition port to high-turbulence impeller discharge zone</li>
                  </ul>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  Larger D_i/D_T increases shaft torque and ungassed power P_0 ∝ D_i⁵ at fixed rpm.
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                  Dual-probe conductivity/pH pulse-response mixing time test (θ_95%) at top and bottom
                  vessel ports (Einsele 1978; Rosseburg et al. 2018).
                </td>
              </tr>

              {/* Row 4: High Medium Consumption & Cost per Gram */}
              <tr className="hover:bg-slate-50/80">
                <td className="py-3 px-3">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>High Medium Consumption &amp; COGS/g</span>
                    <span className="font-mono text-[10px] text-teal-800">[ECONOMIC TRADE-OFF]</span>
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    Excessive perfusion exchange rate (VVD &gt; 2.8 d⁻¹) inflates annual media volume and
                    dilutes harvest titre entering Protein A capture.
                  </p>
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-800">
                  <div>Q_media = VVD · V_working ; CSPR = VVD / X_v</div>
                  <div className="mt-1 font-semibold">
                    Current: CSPR = {physics.cellSpecificPerfusionRatePlCellDay.toFixed(1)} pL/cell/day
                  </div>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Optimise CSPR toward minimum nutrient-sufficient rate (35–42 pL/cell/d)</li>
                    <li>Use concentrated perfusion media feeds to lower volumetric VVD</li>
                    <li>Evaluate temperature shift (37 °C → 33.0 °C) to boost specific q_p</li>
                  </ul>
                </td>
                <td className="py-3 px-3 text-slate-700">
                  Reducing VVD too far (&lt;1.4 d⁻¹ at 45×10⁶ cells/mL) causes toxic lactate (&gt;3.5 g/L)
                  and ammonia accumulation.
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                  Ambr® 250 perfusion CSPR step-down titration measuring daily glucose, lactate, NH₄⁺, and
                  Protein A eluate titre.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked Uncertainty-Aware Next-Experiment Recommendations Panel within Stage 5 Engineering Feasibility */}
      {recommendationSuite &&
        onApplyExperimentHardwareToStage5 &&
        onExecuteReviewedExperimentInBo && (
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
            onRestoreCalibratedChoModel={onRestoreCalibratedChoModel}
            compactContext="stage5_feasibility"
          />
        )}
    </div>
  );
};

