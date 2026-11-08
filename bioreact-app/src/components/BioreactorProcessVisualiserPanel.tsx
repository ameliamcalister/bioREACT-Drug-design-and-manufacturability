import React, { useMemo, useState } from 'react';
import {
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  HumanSafetyGate,
  ImpellerType,
  MassBalanceAndPhysicsResult,
  ProposedNextExperimentRecipe,
  ProposedReactorConfiguration,
  ReactorOptimisationObjectivePresetId,
  ReactorOptimisationObjectiveWeights,
  SafetyGateId,
  SafetyGateStatus,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  DEFAULT_HF_PHYSICS,
  DEFAULT_STR_PHYSICS,
  IMPELLER_GEOMETRY_SPECS,
} from '../data/bioprocessData';
import {
  computeRadarLoadPercentages,
  optimiseUnifiedReactorConfiguration,
  solveMassBalanceAndReactorPhysics,
} from '../services/bioprocessEngine';
import {
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Sparkles,
  RotateCcw,
  Eye,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Layers,
  Gauge,
  Activity,
  Scale,
  BookOpen,
} from 'lucide-react';

interface BioreactorProcessVisualiserPanelProps {
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  groundedParams: GroundedSimulatorParams;
  physics: MassBalanceAndPhysicsResult;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  onUpdateHfParams?: (next: HollowFibrePhysicsParams) => void;
  topRecommendedRecipe?: ProposedNextExperimentRecipe;
  onApplyExperimentHardwareToStage5?: (recipe: ProposedNextExperimentRecipe) => void;
  safetyGates?: HumanSafetyGate[];
  onUpdateSafetyGate?: (
    gateId: SafetyGateId,
    status: SafetyGateStatus,
    reviewerName: string,
    justification: string
  ) => void;
}

type SubsystemFilter =
  | 'all'
  | 'oxygen'
  | 'shear'
  | 'mixing'
  | 'filter_hydraulics'
  | 'foaming';

type DeepDiveTab =
  | 'mixing_and_filter_levers'
  | 'pareto_tradeoffs'
  | 'epistemic_and_unsupported';

interface SnapshotState {
  label: string;
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  physics: MassBalanceAndPhysicsResult;
  radar: ProposedReactorConfiguration['radarLoadPercentages'];
}

const OBJECTIVE_PRESETS: Record<
  ReactorOptimisationObjectivePresetId,
  {
    label: string;
    shortDesc: string;
    weights: ReactorOptimisationObjectiveWeights;
  }
> = {
  balanced_all_constraints: {
    label: 'Balanced All-6-Axes Optimum',
    shortDesc: 'Jointly optimises mixing time, filter ΔP, OTR capacity, shear safety, and COGS.',
    weights: {
      minimiseMixingTime: 85,
      minimiseFilterPressureDrop: 85,
      maximiseOxygenTransfer: 85,
      minimiseShearStress: 80,
      balanceProductivityAndCost: 75,
    },
  },
  minimise_mixing_and_filter_dp: {
    label: 'Minimise Mixing Time & Filter ΔP',
    shortDesc: 'Prioritises rapid macromixing (t_m < 35 s) and low hollow-fibre pressure drop (ΔP < 5 kPa).',
    weights: {
      minimiseMixingTime: 100,
      minimiseFilterPressureDrop: 100,
      maximiseOxygenTransfer: 65,
      minimiseShearStress: 60,
      balanceProductivityAndCost: 50,
    },
  },
  maximise_otr_and_productivity: {
    label: 'Maximise O₂ Capacity & Productivity',
    shortDesc: 'Maximises OTR − OUR headroom and volumetric mAb output at full cell density.',
    weights: {
      minimiseMixingTime: 65,
      minimiseFilterPressureDrop: 65,
      maximiseOxygenTransfer: 100,
      minimiseShearStress: 60,
      balanceProductivityAndCost: 95,
    },
  },
  minimise_shear_cell_protection: {
    label: 'Minimise Shear Stress & Protect Cells',
    shortDesc: 'Maximises Kolmogorov eddy length (λ_K) and minimises impeller & lumen wall shear.',
    weights: {
      minimiseMixingTime: 55,
      minimiseFilterPressureDrop: 85,
      maximiseOxygenTransfer: 70,
      minimiseShearStress: 100,
      balanceProductivityAndCost: 60,
    },
  },
  balance_productivity_energy_cost: {
    label: 'Balance Productivity & Energy/Cost',
    shortDesc: 'Minimises specific power draw (P_g/V), O₂ enrichment demand, and $/g COGS.',
    weights: {
      minimiseMixingTime: 55,
      minimiseFilterPressureDrop: 70,
      maximiseOxygenTransfer: 65,
      minimiseShearStress: 75,
      balanceProductivityAndCost: 100,
    },
  },
};

export const BioreactorProcessVisualiserPanel: React.FC<
  BioreactorProcessVisualiserPanelProps
> = ({
  strParams,
  hfParams,
  groundedParams,
  physics,
  onUpdateStrParams,
  onUpdateHfParams,
  safetyGates = [],
  onUpdateSafetyGate,
}) => {
  const [activeFilter, setActiveFilter] = useState<SubsystemFilter>('all');
  const [activePresetId, setActivePresetId] =
    useState<ReactorOptimisationObjectivePresetId>('balanced_all_constraints');
  const [objectiveWeights, setObjectiveWeights] =
    useState<ReactorOptimisationObjectiveWeights>(
      OBJECTIVE_PRESETS.balanced_all_constraints.weights
    );
  const [selectedRankIndex, setSelectedRankIndex] = useState<number>(0);
  const [activeDeepDiveTab, setActiveDeepDiveTab] = useState<DeepDiveTab>(
    'mixing_and_filter_levers'
  );
  const [showObjectiveSliders, setShowObjectiveSliders] = useState<boolean>(true);

  // Baseline snapshot for Before-and-After comparison when a configuration is applied
  const defaultBaselinePhysics = useMemo(
    () =>
      solveMassBalanceAndReactorPhysics(
        DEFAULT_STR_PHYSICS,
        DEFAULT_HF_PHYSICS,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      ),
    [groundedParams]
  );

  const defaultBaselineRadar = useMemo(
    () =>
      computeRadarLoadPercentages(
        DEFAULT_STR_PHYSICS,
        groundedParams,
        defaultBaselinePhysics
      ),
    [groundedParams, defaultBaselinePhysics]
  );

  const [beforeSnapshot, setBeforeSnapshot] = useState<SnapshotState>({
    label: '500 L Unoptimised Baseline (Before Unified Fix)',
    strParams: DEFAULT_STR_PHYSICS,
    hfParams: DEFAULT_HF_PHYSICS,
    physics: defaultBaselinePhysics,
    radar: defaultBaselineRadar,
  });
  const [appliedConfigTitle, setAppliedConfigTitle] = useState<string | null>(null);

  // Current active radar percentages
  const currentRadar = useMemo(
    () => computeRadarLoadPercentages(strParams, groundedParams, physics),
    [strParams, groundedParams, physics]
  );

  // Run the Unified Multi-Objective Constrained Reactor Configuration Optimiser
  const optimisationSuite = useMemo(
    () =>
      optimiseUnifiedReactorConfiguration(
        strParams,
        hfParams,
        groundedParams,
        objectiveWeights
      ),
    [strParams, hfParams, groundedParams, objectiveWeights]
  );

  const rankedConfigs = optimisationSuite.rankedConfigurations;
  const selectedConfig: ProposedReactorConfiguration | undefined =
    rankedConfigs[selectedRankIndex] || rankedConfigs[0];

  // Evaluate individual physical constraint statuses from live model outputs
  const isOxygenDeficit = physics.otrMmolPerLHour < physics.ourMmolPerLHour;
  const isShearExceeded =
    physics.estimatedShearStressPa > groundedParams.shearThresholdPa;
  const isEddyTooSmall = physics.kolmogorovScaleUm < 18.0;
  const isShearOrEddyViolation = isShearExceeded || isEddyTooSmall;

  const mixingLimitS = 60.0;
  const isMixingSlow =
    physics.mixingTimeGassedS > mixingLimitS || physics.isMixingRateLimiting;
  const isMixingNearLimit =
    !isMixingSlow && physics.mixingTimeGassedS > 45.0;

  const isHfViolated =
    physics.hfPressureDropKpa > 35.0 ||
    physics.hfWallShearStressPa > groundedParams.shearThresholdPa ||
    physics.hfAxialOxygenDepleted;
  const isHfNearLimit =
    !isHfViolated && currentRadar.filterHydraulicsLoadPct >= 75.0;

  const isFoamingHigh = strParams.spargeRateVvm > 0.095;
  const isCo2StrippingLow = strParams.spargeRateVvm < 0.018;
  const isGasFlowViolation = isFoamingHigh || isCo2StrippingLow;

  const isAllFeasible =
    !isOxygenDeficit &&
    !isShearOrEddyViolation &&
    !isMixingSlow &&
    !isHfViolated &&
    !isGasFlowViolation &&
    physics.isScaleUpFeasible;

  const spargerType = strParams.spargerType ?? 'open_pipe';
  const isMicrosparger = spargerType === 'sintered_microsparger';
  const impellerSpec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];

  const gate2 = safetyGates.find((g) => g.id === 'gate2_reactor');

  // Check if user has selected an unsupported or uncalibrated spacing/geometry parameter
  const spacingRatio = strParams.impellerSpacingRatioDeltaCDi ?? 1.5;
  const isSpacingNonStandard =
    strParams.impellerCount >= 2 &&
    (spacingRatio < 1.48 || spacingRatio > 1.65);

  // Rotation duration (s) inversely proportional to RPM
  const rotationDurationS = Math.max(
    0.45,
    Math.min(4.0, 140 / Math.max(25, strParams.stirrerSpeedRpm))
  );

  // Compute impeller Y positions inside the liquid column (SVG liquid top = 115, bottom = 390)
  const liquidTopY = 115;
  const liquidBottomY = 390;
  const liquidHeightPx = liquidBottomY - liquidTopY;

  const impellerYPositions = useMemo(() => {
    const count = strParams.impellerCount;
    if (count === 1) {
      return [liquidBottomY - liquidHeightPx * 0.26];
    }
    const normSpan = Math.min(0.38, Math.max(0.16, spacingRatio * 0.19));
    if (count === 2) {
      return [
        liquidBottomY - liquidHeightPx * 0.22,
        liquidBottomY - liquidHeightPx * (0.22 + normSpan),
      ];
    }
    return [
      liquidBottomY - liquidHeightPx * 0.18,
      liquidBottomY - liquidHeightPx * (0.18 + normSpan * 0.85),
      liquidBottomY - liquidHeightPx * Math.min(0.84, 0.18 + normSpan * 1.7),
    ];
  }, [strParams.impellerCount, spacingRatio, liquidBottomY, liquidHeightPx]);

  // Deterministic explanatory bubble stream coordinates scaled by sparger type & vvm
  const bubbles = useMemo(() => {
    const count = isMicrosparger
      ? Math.min(42, Math.max(20, Math.round(strParams.spargeRateVvm * 650)))
      : Math.min(14, Math.max(6, Math.round(strParams.spargeRateVvm * 220)));

    return Array.from({ length: count }, (_, idx) => {
      const seed = (idx * 37 + 13) % 100;
      const spreadX = isMicrosparger
        ? (seed - 50) * 1.65
        : ((idx % 5) - 2) * 14;
      const cx = 225 + spreadX;
      const r = isMicrosparger
        ? 2.2 + (idx % 3) * 0.7
        : 6.2 + (idx % 3) * 1.8;
      const duration = isMicrosparger
        ? 2.6 + (idx % 5) * 0.45
        : 1.5 + (idx % 4) * 0.3;
      const delay = (idx * 0.23) % 2.8;
      return { id: idx, cx, r, duration, delay };
    });
  }, [isMicrosparger, strParams.spargeRateVvm]);

  // Simplified bulk cell-culture representation
  const cellMarkers = useMemo(() => {
    const count = Math.min(
      24,
      Math.max(8, Math.round(strParams.targetVcdE6PerMl / 2.2))
    );
    return Array.from({ length: count }, (_, idx) => {
      const row = Math.floor(idx / 4);
      const col = idx % 4;
      const cx = 148 + col * 50 + ((row % 2) * 12 - 6);
      const cy = 145 + row * 38 + ((col % 2) * 8 - 4);
      return { id: idx, cx, cy };
    });
  }, [strParams.targetVcdE6PerMl]);

  const handleSelectPreset = (presetId: ReactorOptimisationObjectivePresetId) => {
    setActivePresetId(presetId);
    setObjectiveWeights(OBJECTIVE_PRESETS[presetId].weights);
    setSelectedRankIndex(0);
  };

  const handleLoadOxygenDeficitBaseline = () => {
    onUpdateStrParams(DEFAULT_STR_PHYSICS);
    if (onUpdateHfParams) {
      onUpdateHfParams(DEFAULT_HF_PHYSICS);
    }
    setBeforeSnapshot({
      label: '500 L Open-Pipe Baseline (OTR 3.2 < OUR 13.9, Mixing 54 s, Filter 81%)',
      strParams: DEFAULT_STR_PHYSICS,
      hfParams: DEFAULT_HF_PHYSICS,
      physics: defaultBaselinePhysics,
      radar: defaultBaselineRadar,
    });
    setAppliedConfigTitle(null);
  };

  const handleApplyConfigurationToSimulation = (
    config: ProposedReactorConfiguration
  ) => {
    // Capture current state as "Before" so the user can see the exact transition on all 6 axes
    setBeforeSnapshot({
      label: `Previous State (${strParams.impellerCount}× ${
        IMPELLER_GEOMETRY_SPECS[strParams.impellerType].shortLabel
      }, ${strParams.stirrerSpeedRpm} RPM, d_f=${hfParams.fibreInnerDiameterUm}μm)`,
      strParams,
      hfParams,
      physics,
      radar: currentRadar,
    });
    onUpdateStrParams(config.strParams);
    if (onUpdateHfParams) {
      onUpdateHfParams(config.hfParams);
    }
    setAppliedConfigTitle(config.title);
  };

  const showOxygenOverlay = activeFilter === 'all' || activeFilter === 'oxygen';
  const showShearOverlay = activeFilter === 'all' || activeFilter === 'shear';
  const showMixingOverlay = activeFilter === 'all' || activeFilter === 'mixing';
  const showFoamingOverlay = activeFilter === 'all' || activeFilter === 'foaming';

  return (
    <section
      id="interactive-bioreactor-visualiser"
      className="bg-white border-2 border-slate-300 shadow-sm p-6 space-y-6"
    >
      {/* CSS Keyframes for smooth 2D cutaway animations */}
      <style>{`
        @keyframes bioreactBubbleRise {
          0% {
            transform: translateY(0px) scale(0.85);
            opacity: 0.85;
          }
          70% {
            opacity: 0.75;
          }
          100% {
            transform: translateY(-255px) scale(1.18);
            opacity: 0;
          }
        }
        @keyframes bioreactImpellerSpin {
          0% {
            transform: scaleX(1);
          }
          25% {
            transform: scaleX(0.35);
          }
          50% {
            transform: scaleX(-1);
          }
          75% {
            transform: scaleX(-0.35);
          }
          100% {
            transform: scaleX(1);
          }
        }
        @keyframes bioreactPulseWarning {
          0%, 100% {
            opacity: 0.92;
          }
          50% {
            opacity: 0.45;
          }
        }
      `}</style>

      {/* Top Header & Mandatory Scientific Integrity Disclaimer */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-blue-700 text-white">
              UNIFIED REACTOR CONFIGURATION OPTIMISER &amp; ANIMATED CUTAWAY
            </span>
            <span className="px-2.5 py-0.5 text-xs font-mono font-semibold text-amber-950 bg-amber-100 border border-amber-300">
              Model-informed explanatory visualisation — not validated CFD or experimentally measured flow behaviour.
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Interactive Bioreactor Process-State Visualiser &amp; Multi-Objective Engineering Optimiser
          </h2>
          <p className="text-xs text-slate-600 max-w-4xl leading-relaxed">
            Connected to <span className="font-semibold">bioREACT</span>’s live mass-balance, macromixing, and Hagen–Poiseuille filter hydraulics engine (<span className="font-mono">OTR</span>, <span className="font-mono">OUR</span>, <span className="font-mono">t_m</span>, <span className="font-mono">τ</span>, <span className="font-mono">λ_K</span>, <span className="font-mono">P_g/V</span>, <span className="font-mono">ΔP_HF</span>, <span className="font-mono">τ_w</span>). Jointly optimises discrete equipment choices and continuous operating variables across all 6 constraint axes without relaxing hard safety limits.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            id="btn-load-500l-baseline"
            type="button"
            onClick={handleLoadOxygenDeficitBaseline}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold border transition-colors cursor-pointer ${
              isOxygenDeficit && !isMicrosparger
                ? 'bg-rose-700 text-white border-rose-800'
                : 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>1. Load 500 L Baseline (OTR 3.2 &lt; OUR 13.9)</span>
          </button>

          <button
            id="btn-optimise-reactor-config"
            type="button"
            onClick={() => {
              setShowObjectiveSliders(true);
              handleSelectPreset('balanced_all_constraints');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 transition-colors cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>2. Optimise Reactor Configuration (All 6 Axes)</span>
          </button>

          {selectedConfig && (
            <button
              id="btn-apply-to-simulation"
              type="button"
              onClick={() => handleApplyConfigurationToSimulation(selectedConfig)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-800 transition-colors cursor-pointer shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                3. Apply Rank #{selectedConfig.rank} Configuration (Max Axis{' '}
                {selectedConfig.radarLoadPercentages.maxAxisLoadPct.toFixed(0)}%)
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Subsystem Highlight Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-3">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-700">
          <Eye className="w-4 h-4 text-blue-600" />
          <span>HIGHLIGHT PHYSICAL SUBSYSTEM:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            {
              id: 'all' as const,
              label: `All 6 Axes (Max Load ${currentRadar.maxAxisLoadPct.toFixed(0)}%)`,
              failed: !isAllFeasible,
              warn: isAllFeasible && currentRadar.maxAxisLoadPct >= 80,
            },
            {
              id: 'oxygen' as const,
              label: `1. O₂ Transfer (${currentRadar.oxygenLoadPct.toFixed(0)}% · OTR ${physics.otrMmolPerLHour.toFixed(1)} vs OUR ${physics.ourMmolPerLHour.toFixed(1)})`,
              failed: isOxygenDeficit,
              warn: !isOxygenDeficit && currentRadar.oxygenLoadPct >= 85,
            },
            {
              id: 'shear' as const,
              label: `2. Impeller Shear & Eddies (${Math.max(currentRadar.shearLoadPct, currentRadar.eddyLoadPct).toFixed(0)}% · τ ${physics.estimatedShearStressPa.toFixed(2)} Pa, λ_K ${physics.kolmogorovScaleUm.toFixed(1)} μm)`,
              failed: isShearOrEddyViolation,
              warn: !isShearOrEddyViolation && Math.max(currentRadar.shearLoadPct, currentRadar.eddyLoadPct) >= 80,
            },
            {
              id: 'mixing' as const,
              label: `3. Bulk Mixing (${currentRadar.mixingLoadPct.toFixed(0)}% · t_m ${physics.mixingTimeGassedS.toFixed(1)} s)`,
              failed: isMixingSlow,
              warn: isMixingNearLimit,
            },
            {
              id: 'filter_hydraulics' as const,
              label: `4. Filter Hydraulics (${currentRadar.filterHydraulicsLoadPct.toFixed(0)}% · ΔP ${physics.hfPressureDropKpa.toFixed(1)} kPa, τ_w ${physics.hfWallShearStressPa.toFixed(2)} Pa)`,
              failed: isHfViolated,
              warn: isHfNearLimit,
            },
            {
              id: 'foaming' as const,
              label: `5. Aeration (${strParams.spargeRateVvm.toFixed(3)} vvm)`,
              failed: isGasFlowViolation,
              warn: false,
            },
          ].map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                    : tab.failed
                    ? 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100'
                    : tab.warn
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    tab.failed
                      ? 'bg-rose-500'
                      : tab.warn
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 12-Column Split: Left 7 Cols = Animated Bioreactor + Filter Cutaway & All Engineering Variable Controls; Right 5 Cols = Unified "Optimise Reactor Configuration" Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 Cols): Large Animated Stirred-Tank + Hollow-Fibre Cutaway & Direct Parameter Controls */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 p-4 text-slate-100 space-y-4">
          {/* Vessel Status Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <div className="text-[11px] font-mono text-slate-400">
                STIRRED-TANK + ATF/TFF RETENTION · V = {strParams.workingVolumeL.toLocaleString()} L · D_T ={' '}
                {physics.tankDiameterM.toFixed(2)} m · Z = {physics.liquidHeightM.toFixed(2)} m · D_i/D_T ={' '}
                {strParams.diameterRatioDiDt.toFixed(2)}
              </div>
              <div className="text-sm font-mono font-semibold text-white mt-0.5">
                {strParams.impellerCount}× {impellerSpec.shortLabel} ({strParams.stirrerSpeedRpm} RPM) ·{' '}
                {isMicrosparger ? '15 μm Sintered Microsparger' : 'Open-Pipe Sparger'} · HF d_f ={' '}
                {hfParams.fibreInnerDiameterUm} μm
              </div>
            </div>
            <div
              className={`px-3 py-1 text-xs font-mono font-bold border ${
                isAllFeasible
                  ? currentRadar.maxAxisLoadPct < 70
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500'
                    : 'bg-teal-950/90 text-teal-300 border-teal-500'
                  : 'bg-rose-950/90 text-rose-300 border-rose-500'
              }`}
            >
              {isAllFeasible
                ? `✓ ALL 6 AXES FEASIBLE (MAX LOAD ${currentRadar.maxAxisLoadPct.toFixed(0)}%)`
                : `✕ CONSTRAINT VIOLATION (${physics.limitingFactors.length} ACTIVE)`}
            </div>
          </div>

          {/* Large Animated SVG Bioreactor + External Hollow-Fibre Filter Cutaway */}
          <div className="relative flex justify-center bg-slate-900/95 border border-slate-800 p-3">
            <svg
              viewBox="0 0 585 480"
              className="w-full max-w-[585px] h-auto select-none"
              role="img"
              aria-label="Model-informed explanatory stirred-tank bioreactor and hollow-fibre retention filter cutaway"
            >
              <defs>
                <linearGradient id="cultureMediumGrad" x1="0" y1="0" x2="0" y2="1">
                  {isOxygenDeficit ? (
                    <>
                      <stop offset="0%" stopColor="#881337" stopOpacity="0.82" />
                      <stop offset="55%" stopColor="#9f1239" stopOpacity="0.74" />
                      <stop offset="100%" stopColor="#b45309" stopOpacity="0.70" />
                    </>
                  ) : isMixingSlow ? (
                    <>
                      <stop offset="0%" stopColor="#581c87" stopOpacity="0.78" />
                      <stop offset="50%" stopColor="#0f766e" stopOpacity="0.68" />
                      <stop offset="100%" stopColor="#047857" stopOpacity="0.75" />
                    </>
                  ) : (
                    <>
                      <stop offset="0%" stopColor="#0f766e" stopOpacity="0.74" />
                      <stop offset="50%" stopColor="#0d9488" stopOpacity="0.70" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.78" />
                    </>
                  )}
                </linearGradient>

                <clipPath id="vesselInteriorClip">
                  <path d="M 120 70 L 330 70 L 330 375 Q 330 412 225 412 Q 120 412 120 375 Z" />
                </clipPath>
              </defs>

              {/* EXTERNAL HOLLOW-FIBRE CELL-RETENTION CARTRIDGE MODULE (LEFT SIDE) */}
              <g transform="translate(12, 148)">
                {/* Recirculation Piping Loop to Vessel */}
                <path
                  d="M 42 25 L 108 25"
                  fill="none"
                  stroke={isHfViolated ? '#f43f5e' : isHfNearLimit ? '#f59e0b' : '#38bdf8'}
                  strokeWidth="3.5"
                />
                <path
                  d="M 42 185 L 108 185"
                  fill="none"
                  stroke={isHfViolated ? '#f43f5e' : isHfNearLimit ? '#f59e0b' : '#34d399'}
                  strokeWidth="3.5"
                />
                {/* Cartridge Housing */}
                <rect
                  x="8"
                  y="12"
                  width="54"
                  height="186"
                  rx="6"
                  fill={isHfViolated ? '#4c0519' : isHfNearLimit ? '#451a03' : '#0f172a'}
                  stroke={isHfViolated ? '#f43f5e' : isHfNearLimit ? '#f59e0b' : '#38bdf8'}
                  strokeWidth="2"
                />
                {/* Symbolic Hollow Fibres inside Cartridge */}
                {[18, 26, 34, 42, 50].map((fx) => (
                  <line
                    key={`hf-fibre-${fx}`}
                    x1={fx}
                    y1="22"
                    x2={fx}
                    y2="188"
                    stroke={isHfViolated ? '#fda4af' : isHfNearLimit ? '#fcd34d' : '#67e8f9'}
                    strokeWidth={hfParams.fibreInnerDiameterUm >= 330 ? '2.2' : '1.3'}
                    strokeDasharray="6 3"
                  />
                ))}
                <text
                  x="35"
                  y="4"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="8"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  HF FILTER
                </text>
                <text
                  x="35"
                  y="212"
                  textAnchor="middle"
                  fill={isHfViolated ? '#fda4af' : isHfNearLimit ? '#fcd34d' : '#67e8f9'}
                  fontSize="8"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  d_f={hfParams.fibreInnerDiameterUm}μm
                </text>
                <text
                  x="35"
                  y="223"
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="7.5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  ΔP={physics.hfPressureDropKpa.toFixed(1)}kPa
                </text>
              </g>

              {/* Background Scale Grid Lines */}
              <g stroke="#1e293b" strokeWidth="1">
                <line x1="100" y1="115" x2="345" y2="115" strokeDasharray="3 3" />
                <line x1="100" y1="250" x2="345" y2="250" strokeDasharray="3 3" />
                <line x1="100" y1="390" x2="345" y2="390" strokeDasharray="3 3" />
              </g>

              {/* Thermal Jacket Outer Wall */}
              <path
                d="M 108 85 L 108 378 Q 108 422 225 422 Q 342 422 342 378 L 342 85"
                fill="none"
                stroke="#334155"
                strokeWidth="6"
              />

              {/* Vessel Interior Clipped Region */}
              <g clipPath="url(#vesselInteriorClip)">
                {/* Headspace Gas Zone */}
                <rect x="120" y="70" width="210" height="45" fill="#0f172a" />

                {/* Liquid Culture Medium Column */}
                <rect
                  x="120"
                  y={liquidTopY}
                  width="210"
                  height={liquidBottomY - liquidTopY + 25}
                  fill="url(#cultureMediumGrad)"
                />

                {/* Bulk Mixing Limitation / Near-Limit Symbolic Indicator */}
                {showMixingOverlay && (isMixingSlow || isMixingNearLimit) && (
                  <g style={{ animation: 'bioreactPulseWarning 2.2s infinite' }}>
                    <rect
                      x="120"
                      y={liquidTopY}
                      width="210"
                      height="68"
                      fill={isMixingSlow ? '#7e22ce' : '#b45309'}
                      fillOpacity="0.38"
                    />
                    <line
                      x1="120"
                      y1={liquidTopY + 68}
                      x2="330"
                      y2={liquidTopY + 68}
                      stroke={isMixingSlow ? '#d8b4fe' : '#fde68a'}
                      strokeWidth="1.5"
                      strokeDasharray="5 4"
                    />
                    <text
                      x="225"
                      y={liquidTopY + 22}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="9"
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight="700"
                    >
                      {isMixingSlow
                        ? `MIXING LIMIT BREACHED (t_m = ${physics.mixingTimeGassedS.toFixed(1)} s > 60 s)`
                        : `MIXING NEAR LIMIT (t_m = ${physics.mixingTimeGassedS.toFixed(1)} s · ${currentRadar.mixingLoadPct.toFixed(0)}%)`}
                    </text>
                    <text
                      x="225"
                      y={liquidTopY + 36}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="8"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      Increase D_i/D_T (0.44) or stage axial impellers to lower t_m
                    </text>
                  </g>
                )}

                {/* Headspace Foam / Aeration Window Indicator */}
                {showFoamingOverlay && (
                  <g>
                    <rect
                      x="120"
                      y={isFoamingHigh ? 92 : 108}
                      width="210"
                      height={isFoamingHigh ? 26 : 8}
                      fill={isFoamingHigh ? '#fb7185' : '#94a3b8'}
                      fillOpacity={isFoamingHigh ? 0.78 : 0.35}
                    />
                  </g>
                )}

                {/* Vessel Wall Baffles */}
                {strParams.bafflingMode !== 'unbaffled_surface_vortex' ? (
                  <g fill="#475569" opacity="0.88">
                    <rect x="123" y="95" width="6" height="285" />
                    <rect x="321" y="95" width="6" height="285" />
                  </g>
                ) : (
                  <path
                    d="M 120 115 Q 225 155 330 115"
                    fill="#0f172a"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                  />
                )}

                {/* Symbolic Circulation Loops per Impeller Stage */}
                {impellerYPositions.map((impY, idx) => (
                  <g
                    key={`loop-${idx}`}
                    stroke={isMixingSlow ? '#c084fc' : '#5eead4'}
                    strokeWidth="1.3"
                    strokeDasharray="4 3"
                    fill="none"
                    opacity="0.48"
                  >
                    {strParams.impellerType === 'rushton_radial' ? (
                      <>
                        <path d={`M 200 ${impY} C 140 ${impY - 30}, 140 ${impY + 30}, 200 ${impY}`} />
                        <path d={`M 250 ${impY} C 310 ${impY - 30}, 310 ${impY + 30}, 250 ${impY}`} />
                      </>
                    ) : (
                      <>
                        <path d={`M 205 ${impY + 12} C 145 ${impY + 45}, 145 ${impY - 45}, 205 ${impY - 15}`} />
                        <path d={`M 245 ${impY + 12} C 305 ${impY + 45}, 305 ${impY - 45}, 245 ${impY - 15}`} />
                      </>
                    )}
                  </g>
                ))}

                {/* Simplified Cell-Culture Representation */}
                {cellMarkers.map((cell) => (
                  <circle
                    key={`cell-${cell.id}`}
                    cx={cell.cx}
                    cy={cell.cy}
                    r="3.6"
                    fill={
                      isOxygenDeficit
                        ? '#fbbf24'
                        : isShearOrEddyViolation
                        ? '#fb7185'
                        : '#34d399'
                    }
                    stroke={
                      isOxygenDeficit
                        ? '#78350f'
                        : isShearOrEddyViolation
                        ? '#881337'
                        : '#064e3b'
                    }
                    strokeWidth="1"
                    opacity="0.9"
                  />
                ))}

                {/* Explanatory Rising Oxygen Bubble Stream */}
                {showOxygenOverlay &&
                  bubbles.map((b) => (
                    <circle
                      key={`bubble-${b.id}`}
                      cx={b.cx}
                      cy={392}
                      r={b.r}
                      fill={
                        isMicrosparger
                          ? '#67e8f9'
                          : isOxygenDeficit
                          ? '#fda4af'
                          : '#bae6fd'
                      }
                      fillOpacity={isMicrosparger ? 0.75 : 0.55}
                      stroke={isMicrosparger ? '#ecfeff' : '#fecdd3'}
                      strokeWidth={isMicrosparger ? '0.7' : '1.2'}
                      style={{
                        animation: `bioreactBubbleRise ${b.duration}s linear ${b.delay}s infinite`,
                      }}
                    />
                  ))}
              </g>

              {/* Vessel Cutaway Stainless Outline */}
              <path
                d="M 120 70 L 330 70 L 330 375 Q 330 412 225 412 Q 120 412 120 375 Z"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="3"
              />

              {/* Top Headplate & Motor Drive */}
              <rect x="110" y="60" width="230" height="10" rx="2" fill="#64748b" />
              <rect
                x="203"
                y="20"
                width="44"
                height="40"
                rx="3"
                fill="#334155"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
              <text
                x="225"
                y="43"
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="700"
              >
                {strParams.stirrerSpeedRpm} RPM
              </text>

              {/* Central Impeller Shaft */}
              <line
                x1="225"
                y1="60"
                x2="225"
                y2={impellerYPositions[0] + 10}
                stroke="#e2e8f0"
                strokeWidth="5"
              />

              {/* Rotating Impeller Stages (1, 2, or 3 Impellers scaled by D_i/D_T) */}
              {impellerYPositions.map((impY, idx) => {
                const impHalfWidth = Math.round(
                  Math.min(74, Math.max(30, strParams.diameterRatioDiDt * 125))
                );
                return (
                  <g key={`impeller-stage-${idx}`}>
                    {showShearOverlay && isShearOrEddyViolation && (
                      <g style={{ animation: 'bioreactPulseWarning 1.1s infinite' }}>
                        <ellipse
                          cx={225 - impHalfWidth - 6}
                          cy={impY}
                          rx="16"
                          ry="11"
                          fill="#f43f5e"
                          fillOpacity="0.38"
                          stroke="#fda4af"
                          strokeWidth="1.5"
                          strokeDasharray="3 2"
                        />
                        <ellipse
                          cx={225 + impHalfWidth + 6}
                          cy={impY}
                          rx="16"
                          ry="11"
                          fill="#f43f5e"
                          fillOpacity="0.38"
                          stroke="#fda4af"
                          strokeWidth="1.5"
                          strokeDasharray="3 2"
                        />
                      </g>
                    )}

                    <g
                      style={{
                        transformOrigin: `225px ${impY}px`,
                        animation: `bioreactImpellerSpin ${rotationDurationS}s linear infinite`,
                      }}
                    >
                      {strParams.impellerType === 'rushton_radial' ? (
                        <g>
                          <rect
                            x={225 - impHalfWidth}
                            y={impY - 3}
                            width={impHalfWidth * 2}
                            height="6"
                            fill="#cbd5e1"
                          />
                          <rect
                            x={225 - impHalfWidth}
                            y={impY - 10}
                            width="12"
                            height="20"
                            fill={isShearOrEddyViolation ? '#fb7185' : '#94a3b8'}
                            stroke="#f8fafc"
                            strokeWidth="1"
                          />
                          <rect
                            x={225 + impHalfWidth - 12}
                            y={impY - 10}
                            width="12"
                            height="20"
                            fill={isShearOrEddyViolation ? '#fb7185' : '#94a3b8'}
                            stroke="#f8fafc"
                            strokeWidth="1"
                          />
                        </g>
                      ) : strParams.impellerType === 'pitched_blade' ? (
                        <g>
                          <polygon
                            points={`225,${impY - 4} ${225 - impHalfWidth},${impY - 12} ${225 - impHalfWidth + 6},${impY + 8} 225,${impY + 4}`}
                            fill={isShearOrEddyViolation ? '#fb7185' : '#38bdf8'}
                            stroke="#e0f2fe"
                            strokeWidth="1"
                          />
                          <polygon
                            points={`225,${impY - 4} ${225 + impHalfWidth},${impY + 12} ${225 + impHalfWidth - 6},${impY - 8} 225,${impY + 4}`}
                            fill={isShearOrEddyViolation ? '#fb7185' : '#38bdf8'}
                            stroke="#e0f2fe"
                            strokeWidth="1"
                          />
                        </g>
                      ) : (
                        <g>
                          <path
                            d={`M 225 ${impY} Q ${225 - impHalfWidth * 0.6} ${impY - 14} ${225 - impHalfWidth} ${impY + 5} Q ${225 - impHalfWidth * 0.5} ${impY + 10} 225 ${impY} Z`}
                            fill={isShearOrEddyViolation ? '#fb7185' : '#34d399'}
                            stroke="#ecfdf5"
                            strokeWidth="1"
                          />
                          <path
                            d={`M 225 ${impY} Q ${225 + impHalfWidth * 0.6} ${impY - 14} ${225 + impHalfWidth} ${impY + 5} Q ${225 + impHalfWidth * 0.5} ${impY + 10} 225 ${impY} Z`}
                            fill={isShearOrEddyViolation ? '#fb7185' : '#34d399'}
                            stroke="#ecfdf5"
                            strokeWidth="1"
                          />
                        </g>
                      )}
                      <circle
                        cx="225"
                        cy={impY}
                        r="6"
                        fill="#f8fafc"
                        stroke="#334155"
                        strokeWidth="1.5"
                      />
                    </g>
                  </g>
                );
              })}

              {/* Sparger Hardware at Vessel Bottom */}
              <g>
                <path
                  d="M 80 400 L 180 400 L 180 393"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3"
                />
                {isMicrosparger ? (
                  <g>
                    <rect
                      x="170"
                      y="388"
                      width="110"
                      height="9"
                      rx="3"
                      fill="#06b6d4"
                      stroke="#cffafe"
                      strokeWidth="1.5"
                    />
                    <text
                      x="225"
                      y="438"
                      textAnchor="middle"
                      fill="#67e8f9"
                      fontSize="9.5"
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight="600"
                    >
                      15 μm Sintered Microsparger (k_La = {physics.klaPerHour.toFixed(1)} h⁻¹)
                    </text>
                  </g>
                ) : (
                  <g>
                    <rect
                      x="207"
                      y="388"
                      width="36"
                      height="8"
                      rx="1"
                      fill="#f43f5e"
                      stroke="#ffe4e6"
                      strokeWidth="1.5"
                    />
                    <text
                      x="225"
                      y="438"
                      textAnchor="middle"
                      fill="#fda4af"
                      fontSize="9.5"
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight="600"
                    >
                      Conventional Open-Pipe Sparger (k_La = {physics.klaPerHour.toFixed(1)} h⁻¹)
                    </text>
                  </g>
                )}
              </g>

              {/* ON-DIAGRAM LIVE ENGINEERING READOUT CALLOUTS (4 BOXES COVERING ALL SUBSYSTEMS) */}
              {/* 1. Oxygen Transfer Indicator */}
              <g transform="translate(352, 56)">
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="74"
                  rx="3"
                  fill={isOxygenDeficit ? '#4c0519' : '#064e3b'}
                  stroke={isOxygenDeficit ? '#f43f5e' : '#10b981'}
                  strokeWidth="1.8"
                />
                <text
                  x="8"
                  y="16"
                  fill={isOxygenDeficit ? '#fda4af' : '#6ee7b7'}
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {isOxygenDeficit
                    ? `✕ 1. O₂ LIMITATION (${currentRadar.oxygenLoadPct.toFixed(0)}% LOAD)`
                    : `✓ 1. O₂ TRANSFER OK (${currentRadar.oxygenLoadPct.toFixed(0)}% OF LIMIT)`}
                </text>
                <text x="8" y="32" fill="#f8fafc" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                  OTR: {physics.otrMmolPerLHour.toFixed(1)} vs OUR: {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h
                </text>
                <text x="8" y="47" fill="#cbd5e1" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  k_La = {physics.klaPerHour.toFixed(1)} h⁻¹ · Inlet O₂ ={' '}
                  {Math.round(strParams.oxygenEnrichmentFraction * 100)}%
                </text>
                <text
                  x="8"
                  y="62"
                  fill={isOxygenDeficit ? '#fecdd3' : '#a7f3d0'}
                  fontSize="8.5"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  O₂ Margin: {physics.oxygenMarginMmolPerLHour >= 0 ? '+' : ''}
                  {physics.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h
                </text>
              </g>

              {/* 2. Hydrodynamic Shear & Eddy Indicator */}
              <g transform="translate(352, 140)">
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="74"
                  rx="3"
                  fill={isShearOrEddyViolation ? '#451a03' : '#0f172a'}
                  stroke={isShearOrEddyViolation ? '#f59e0b' : '#334155'}
                  strokeWidth="1.5"
                />
                <text
                  x="8"
                  y="16"
                  fill={isShearOrEddyViolation ? '#fcd34d' : '#93c5fd'}
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {isShearOrEddyViolation
                    ? '✕ 2. SHEAR / EDDY FAILED'
                    : `✓ 2. SHEAR & EDDIES OK (${Math.max(currentRadar.shearLoadPct, currentRadar.eddyLoadPct).toFixed(0)}%)`}
                </text>
                <text x="8" y="32" fill="#f8fafc" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                  Shear τ = {physics.estimatedShearStressPa.toFixed(2)} Pa (≤ {groundedParams.shearThresholdPa} Pa)
                </text>
                <text x="8" y="47" fill="#cbd5e1" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  Kolmogorov λ_K = {physics.kolmogorovScaleUm.toFixed(1)} μm (≥ 18.0 μm)
                </text>
                <text x="8" y="62" fill="#94a3b8" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  u_tip = {physics.tipSpeedMPerS.toFixed(2)} m/s · P_g/V = {physics.specificPowerWPerM3.toFixed(0)} W/m³
                </text>
              </g>

              {/* 3. Bulk Mixing & Impeller Geometry Indicator */}
              <g transform="translate(352, 224)">
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="74"
                  rx="3"
                  fill={
                    isMixingSlow
                      ? '#3b0764'
                      : isMixingNearLimit
                      ? '#451a03'
                      : '#0f172a'
                  }
                  stroke={
                    isMixingSlow
                      ? '#c084fc'
                      : isMixingNearLimit
                      ? '#f59e0b'
                      : '#334155'
                  }
                  strokeWidth="1.5"
                />
                <text
                  x="8"
                  y="16"
                  fill={
                    isMixingSlow
                      ? '#e9d5ff'
                      : isMixingNearLimit
                      ? '#fcd34d'
                      : '#6ee7b7'
                  }
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {isMixingSlow
                    ? `✕ 3. MIXING FAILED (${currentRadar.mixingLoadPct.toFixed(0)}% > 100%)`
                    : isMixingNearLimit
                    ? `⚠ 3. MIXING NEAR LIMIT (${currentRadar.mixingLoadPct.toFixed(0)}% OF 60s)`
                    : `✓ 3. BULK MIXING OPTIMISED (${currentRadar.mixingLoadPct.toFixed(0)}%)`}
                </text>
                <text x="8" y="32" fill="#f8fafc" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                  Mixing t_m = {physics.mixingTimeGassedS.toFixed(1)} s (≤ 60.0 s)
                </text>
                <text x="8" y="47" fill="#cbd5e1" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  D_i/D_T = {strParams.diameterRatioDiDt.toFixed(2)} · n = {strParams.impellerCount} (N_p,tot = {physics.ungassedPowerNumberTotalNp.toFixed(2)})
                </text>
                <text x="8" y="62" fill="#94a3b8" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  Aeration = {strParams.spargeRateVvm.toFixed(3)} vvm (0.018–0.095)
                </text>
              </g>

              {/* 4. Hollow-Fibre Filter Hydraulics Indicator */}
              <g transform="translate(352, 308)">
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="74"
                  rx="3"
                  fill={
                    isHfViolated
                      ? '#4c0519'
                      : isHfNearLimit
                      ? '#451a03'
                      : '#0f172a'
                  }
                  stroke={
                    isHfViolated
                      ? '#f43f5e'
                      : isHfNearLimit
                      ? '#f59e0b'
                      : '#38bdf8'
                  }
                  strokeWidth="1.5"
                />
                <text
                  x="8"
                  y="16"
                  fill={
                    isHfViolated
                      ? '#fda4af'
                      : isHfNearLimit
                      ? '#fcd34d'
                      : '#67e8f9'
                  }
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {isHfViolated
                    ? `✕ 4. FILTER HYDRAULICS FAILED (${currentRadar.filterHydraulicsLoadPct.toFixed(0)}%)`
                    : isHfNearLimit
                    ? `⚠ 4. FILTER NEAR LIMIT (${currentRadar.filterHydraulicsLoadPct.toFixed(0)}% LOAD)`
                    : `✓ 4. FILTER HYDRAULICS OK (${currentRadar.filterHydraulicsLoadPct.toFixed(0)}%)`}
                </text>
                <text x="8" y="32" fill="#f8fafc" fontSize="9" fontFamily="IBM Plex Mono, monospace">
                  Lumen ΔP = {physics.hfPressureDropKpa.toFixed(1)} kPa (≤ 35.0 kPa)
                </text>
                <text x="8" y="47" fill="#cbd5e1" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  Wall τ_w = {physics.hfWallShearStressPa.toFixed(2)} Pa (≤ {groundedParams.shearThresholdPa} Pa)
                </text>
                <text x="8" y="62" fill="#94a3b8" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                  d_f = {hfParams.fibreInnerDiameterUm} μm · L_f = {hfParams.fibreLengthM.toFixed(2)} m · Q = {hfParams.recirculationFlowLMin.toFixed(1)} L/m
                </text>
              </g>

              {/* Symbolic Legend Box */}
              <g transform="translate(352, 392)">
                <rect
                  x="0"
                  y="0"
                  width="220"
                  height="52"
                  rx="3"
                  fill="#0f172a"
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <circle cx="14" cy="15" r="4" fill="#34d399" />
                <text x="24" y="18" fill="#cbd5e1" fontSize="8" fontFamily="IBM Plex Mono, monospace">
                  Feasible bulk cell &amp; filter state
                </text>
                <circle cx="14" cy="31" r="4" fill="#fbbf24" />
                <text x="24" y="34" fill="#fde68a" fontSize="8" fontFamily="IBM Plex Mono, monospace">
                  O₂-limited / near-limit warning state
                </text>
                <text x="10" y="46" fill="#94a3b8" fontSize="7.5" fontFamily="IBM Plex Mono, monospace">
                  *Bulk 0D/1D model state (not spatial CFD)
                </text>
              </g>
            </svg>
          </div>

          {/* Interactive Parameter Controls Connected to Live Model (Vessel + Impeller + Sparger + Filter) */}
          <div className="bg-slate-900 border border-slate-800 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-blue-300">
                <Sliders className="w-3.5 h-3.5" />
                <span>
                  CUSTOMISE DISCRETE &amp; CONTINUOUS ENGINEERING VARIABLES (LIVE PHYSICS ENGINE)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-slate-400">Scale:</span>
                {[50, 500, 2000].map((vol) => (
                  <button
                    key={vol}
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({ ...strParams, workingVolumeL: vol })
                    }
                    className={`px-2 py-0.5 text-[11px] font-mono border cursor-pointer ${
                      strParams.workingVolumeL === vol
                        ? 'bg-blue-600 text-white border-blue-400 font-semibold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {vol} L
                  </button>
                ))}
              </div>
            </div>

            {/* Row 1: Discrete Equipment Choices */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Sparger Configuration */}
              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1.5">
                <label className="block text-[11px] font-mono text-slate-400">
                  1. Sparger Type (Discrete)
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({ ...strParams, spargerType: 'open_pipe' })
                    }
                    className={`px-2 py-1.5 font-mono text-[11px] border cursor-pointer ${
                      !isMicrosparger
                        ? 'bg-rose-700 text-white border-rose-500 font-semibold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    Open-Pipe
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({
                        ...strParams,
                        spargerType: 'sintered_microsparger',
                      })
                    }
                    className={`px-2 py-1.5 font-mono text-[11px] border cursor-pointer ${
                      isMicrosparger
                        ? 'bg-emerald-700 text-white border-emerald-500 font-semibold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    15 μm Sintered
                  </button>
                </div>
              </div>

              {/* Impeller Type */}
              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1.5">
                <label className="block text-[11px] font-mono text-slate-400">
                  2. Impeller Type (Discrete)
                </label>
                <select
                  value={strParams.impellerType}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      impellerType: e.target.value as ImpellerType,
                      customTurbulentNp: undefined,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-2 py-1.5 font-mono text-xs"
                >
                  <option value="marine_axial">Marine Hydrofoil (N_p=0.38)</option>
                  <option value="pitched_blade">45° Pitched-Blade (N_p=1.28)</option>
                  <option value="rushton_radial">Rushton Turbine (N_p=5.00)</option>
                </select>
              </div>

              {/* Impeller Number (1–3) */}
              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1.5">
                <label className="block text-[11px] font-mono text-slate-400">
                  3. Impeller Count (Discrete 1–3)
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[1, 2, 3].map((nCount) => (
                    <button
                      key={nCount}
                      type="button"
                      onClick={() =>
                        onUpdateStrParams({
                          ...strParams,
                          impellerCount: nCount,
                          aspectRatioZDt:
                            nCount === 3 && strParams.aspectRatioZDt < 1.8
                              ? 1.9
                              : strParams.aspectRatioZDt,
                        })
                      }
                      className={`px-2 py-1.5 font-mono text-[11px] border cursor-pointer ${
                        strParams.impellerCount === nCount
                          ? 'bg-blue-600 text-white border-blue-400 font-semibold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {nCount}× Stage
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: STR Operating & Impeller Geometry Sliders (RPM, D_i/D_T, Spacing ΔC/D_i, Inlet O2 %, vvm) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-slate-400">Agitation RPM</span>
                  <span className="text-blue-300 font-semibold">
                    {strParams.stirrerSpeedRpm} RPM
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={260}
                  step={2}
                  value={strParams.stirrerSpeedRpm}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      stirrerSpeedRpm: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-blue-400 cursor-pointer"
                />
              </div>

              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-slate-400">Impeller Ø (D_i/D_T)</span>
                  <span className="text-purple-300 font-semibold">
                    {strParams.diameterRatioDiDt.toFixed(2)} ({physics.impellerDiameterM.toFixed(2)}m)
                  </span>
                </div>
                <input
                  type="range"
                  min={0.32}
                  max={0.46}
                  step={0.01}
                  value={strParams.diameterRatioDiDt}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      diameterRatioDiDt: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-slate-400">Inlet O₂ % &amp; vvm</span>
                  <span className="text-cyan-300 font-semibold">
                    {Math.round(strParams.oxygenEnrichmentFraction * 100)}% · {strParams.spargeRateVvm.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.21}
                  max={0.85}
                  step={0.01}
                  value={strParams.oxygenEnrichmentFraction}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      oxygenEnrichmentFraction: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-slate-400">Spacing ΔC/D_i</span>
                  <span
                    className={`font-semibold ${
                      isSpacingNonStandard ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {strParams.impellerCount === 1
                      ? 'N/A (n=1)'
                      : `${spacingRatio.toFixed(2)}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.85}
                  max={2.2}
                  step={0.05}
                  disabled={strParams.impellerCount === 1}
                  value={spacingRatio}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      impellerSpacingRatioDeltaCDi: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer disabled:opacity-40"
                />
              </div>
            </div>

            {/* Epistemic Warning if User Adjusts Impeller Spacing away from 1.50 */}
            {isSpacingNonStandard && (
              <div className="p-2.5 bg-amber-950/90 border border-amber-500 text-[11px] font-mono text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300">
                    UNSUPPORTED CONTINUOUS CORRELATION WARNING (ΔC/D_i = {spacingRatio.toFixed(2)}):
                  </strong>{' '}
                  {spacingRatio < 1.5
                    ? 'Literature correlations (Hudcova et al., 1989) flag ΔC/D_i < 1.50 as a merging/interfering stream regime where simple power addition fails.'
                    : 'While ΔC/D_i ≥ 1.50 satisfies independent stage spacing, 0D analytical correlations cannot credibly predict continuous mixing improvements between ΔC/D_i = 1.50 and 2.20 without 3D CFD/PIV or dual-probe tracer calibration data.'}
                </div>
              </div>
            )}

            {/* Row 3: Hollow-Fibre Filter Geometry & Flow Controls */}
            {onUpdateHfParams && (
              <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-slate-400">HF Fibre Ø (d_f)</span>
                    <span className="text-sky-300 font-semibold">
                      {hfParams.fibreInnerDiameterUm} μm (ΔP ∝ d_f⁻⁴)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={200}
                    max={420}
                    step={10}
                    value={hfParams.fibreInnerDiameterUm}
                    onChange={(e) =>
                      onUpdateHfParams({
                        ...hfParams,
                        fibreInnerDiameterUm: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-slate-400">HF Length (L_f)</span>
                    <span className="text-sky-300 font-semibold">
                      {hfParams.fibreLengthM.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.18}
                    max={0.48}
                    step={0.02}
                    value={hfParams.fibreLengthM}
                    onChange={(e) =>
                      onUpdateHfParams({
                        ...hfParams,
                        fibreLengthM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 p-2.5 space-y-1">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-slate-400">HF Flow (Q_HF)</span>
                    <span className="text-sky-300 font-semibold">
                      {hfParams.recirculationFlowLMin.toFixed(1)} L/min
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3.0}
                    max={11.0}
                    step={0.2}
                    value={hfParams.recirculationFlowLMin}
                    onChange={(e) =>
                      onUpdateHfParams({
                        ...hfParams,
                        recirculationFlowLMin: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): Unified "Optimise Reactor Configuration" Engine + 3 Ranked Configurations + Before/After + Human Gate */}
        <div className="lg:col-span-5 space-y-4">
          {/* 1. Unified Multi-Objective Configuration Optimiser */}
          <div className="p-4 bg-blue-50/50 border-2 border-blue-300 space-y-3.5">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-blue-200">
              <div>
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-900">
                  UNIFIED CONSTRAINED MULTI-OBJECTIVE OPTIMISER
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                  Optimise Reactor Configuration (Mixing, Filter ΔP, O₂, Shear &amp; Cost)
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Evaluated{' '}
                  <strong className="font-mono text-slate-900">
                    {optimisationSuite.evaluatedTotalConfigurationsCount.toLocaleString()}
                  </strong>{' '}
                  discrete × continuous configurations across{' '}
                  <strong className="font-mono text-slate-900">
                    {optimisationSuite.evaluatedDiscreteBranchesCount}
                  </strong>{' '}
                  equipment branches ·{' '}
                  <strong className="font-mono text-emerald-800">
                    {optimisationSuite.feasibleConfigurationsCount} feasible
                  </strong>{' '}
                  ({optimisationSuite.rejectedHardConstraintCount} rejected for hard safety limits).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowObjectiveSliders((prev) => !prev)}
                className="px-2 py-1 text-[10px] font-mono font-semibold bg-white border border-blue-300 text-blue-900 cursor-pointer shrink-0"
              >
                {showObjectiveSliders ? 'Hide Weights' : 'Edit Weights'}
              </button>
            </div>

            {/* Scientist Objective Presets & 5 Weight Sliders */}
            <div className="bg-white border border-blue-200 p-3 space-y-2.5">
              <div className="text-[10.5px] font-mono font-bold text-slate-700 uppercase">
                1. Define Engineering Objectives (Presets or Custom Weights):
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  Object.keys(OBJECTIVE_PRESETS) as ReactorOptimisationObjectivePresetId[]
                ).map((presetKey) => {
                  const preset = OBJECTIVE_PRESETS[presetKey];
                  const isSelected = activePresetId === presetKey;
                  return (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => handleSelectPreset(presetKey)}
                      className={`px-2 py-1 text-[10px] font-mono border cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-700 text-white border-blue-800 font-bold'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-blue-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {showObjectiveSliders && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-slate-100 text-[11px]">
                  {[
                    {
                      key: 'minimiseMixingTime' as const,
                      label: 'Minimise Mixing Time (t_m)',
                    },
                    {
                      key: 'minimiseFilterPressureDrop' as const,
                      label: 'Minimise Filter ΔP & τ_w',
                    },
                    {
                      key: 'maximiseOxygenTransfer' as const,
                      label: 'Maximise Feasible OTR',
                    },
                    {
                      key: 'minimiseShearStress' as const,
                      label: 'Minimise Shear Stress (τ, λ_K)',
                    },
                    {
                      key: 'balanceProductivityAndCost' as const,
                      label: 'Balance Productivity & Cost',
                    },
                  ].map((obj) => (
                    <div key={obj.key} className="space-y-0.5">
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-slate-700">{obj.label}</span>
                        <span className="font-bold text-blue-800">
                          {objectiveWeights[obj.key]}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={objectiveWeights[obj.key]}
                        onChange={(e) =>
                          setObjectiveWeights({
                            ...objectiveWeights,
                            [obj.key]: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-1.5 accent-blue-600 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3 Ranked Engineering Configurations */}
            <div className="space-y-2.5">
              <div className="text-[10.5px] font-mono font-bold text-slate-800 uppercase">
                2. Top 3 Ranked Feasible Reactor Configurations (Zero Hard Constraints Relaxed):
              </div>

              {rankedConfigs.map((cfg, idx) => {
                const isSelected = idx === selectedRankIndex;
                const ev = cfg.evalPhysics;
                const rad = cfg.radarLoadPercentages;
                return (
                  <div
                    key={cfg.id}
                    onClick={() => setSelectedRankIndex(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedRankIndex(idx);
                      }
                    }}
                    className={`p-3 border transition-all cursor-pointer text-xs space-y-2 ${
                      isSelected
                        ? 'bg-white border-2 border-blue-600 shadow-xs'
                        : 'bg-white/85 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold ${
                          cfg.rank === 1
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : cfg.rank === 2
                            ? 'bg-blue-100 text-blue-900 border border-blue-300'
                            : 'bg-purple-100 text-purple-900 border border-purple-300'
                        }`}
                      >
                        {cfg.strategyBadge}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
                        ✓ All 6 Radar Axes ≤ {rad.maxAxisLoadPct.toFixed(0)}%
                      </span>
                    </div>

                    <div className="text-[11px] font-mono font-semibold text-blue-900">
                      {cfg.paretoRoleLabel}
                    </div>
                    <div className="font-bold text-slate-900 leading-snug">
                      {cfg.title}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {cfg.summaryRationale}
                    </p>

                    {/* Complete Input Settings Strip */}
                    <div className="p-2 bg-slate-50 border border-slate-200 font-mono text-[10px] text-slate-700 space-y-0.5">
                      <div className="font-bold text-slate-900">
                        COMPLETE INPUT SETTINGS (STR + HOLLOW-FIBRE FILTER):
                      </div>
                      <div>
                        • STR: {cfg.strParams.impellerCount}×{' '}
                        {IMPELLER_GEOMETRY_SPECS[cfg.strParams.impellerType].shortLabel} · D_i/D_T ={' '}
                        {cfg.strParams.diameterRatioDiDt.toFixed(2)} · Z/D_T ={' '}
                        {cfg.strParams.aspectRatioZDt.toFixed(2)} · N = {cfg.strParams.stirrerSpeedRpm} RPM
                      </div>
                      <div>
                        • Gas &amp; VCD: 15 μm Sintered Microsparger · {cfg.strParams.spargeRateVvm.toFixed(3)} vvm ·{' '}
                        {Math.round(cfg.strParams.oxygenEnrichmentFraction * 100)}% O₂ · X_v ={' '}
                        {cfg.strParams.targetVcdE6PerMl.toFixed(1)}×10⁶/mL
                      </div>
                      <div>
                        • HF Filter: d_f = {cfg.hfParams.fibreInnerDiameterUm} μm · L_f ={' '}
                        {cfg.hfParams.fibreLengthM.toFixed(2)} m · {cfg.hfParams.numberOfFibres.toLocaleString()} fibres · Q ={' '}
                        {cfg.hfParams.recirculationFlowLMin.toFixed(1)} L/min
                      </div>
                    </div>

                    {/* Predicted Results across All 6 Constraints */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
                      <div className="p-1.5 bg-emerald-50/70 border border-emerald-200">
                        <span className="text-slate-500 block">Mixing t_m (≤60s)</span>
                        <strong className="text-emerald-900">
                          {ev.mixingTimeGassedS.toFixed(1)} s ({rad.mixingLoadPct.toFixed(0)}%)
                        </strong>
                      </div>
                      <div className="p-1.5 bg-sky-50/70 border border-sky-200">
                        <span className="text-slate-500 block">Filter ΔP &amp; τ_w</span>
                        <strong className="text-sky-900">
                          {ev.hfPressureDropKpa.toFixed(1)} kPa · {ev.hfWallShearStressPa.toFixed(2)} Pa ({rad.filterHydraulicsLoadPct.toFixed(0)}%)
                        </strong>
                      </div>
                      <div className="p-1.5 bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 block">OTR / OUR</span>
                        <strong className="text-emerald-800">
                          {ev.otrMmolPerLHour.toFixed(1)} / {ev.ourMmolPerLHour.toFixed(1)} (+{ev.oxygenMarginMmolPerLHour.toFixed(1)})
                        </strong>
                      </div>
                      <div className="p-1.5 bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 block">Shear τ &amp; λ_K</span>
                        <strong className="text-slate-900">
                          {ev.estimatedShearStressPa.toFixed(2)} Pa · {ev.kolmogorovScaleUm.toFixed(1)} μm
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRankIndex(idx);
                        handleApplyConfigurationToSimulation(cfg);
                      }}
                      className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Apply Rank #{cfg.rank} Configuration to Live Simulation &amp; Radar
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Synchronised Before vs. After Simulation Comparison Table */}
          <div className="p-4 bg-white border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-800">
                BEFORE vs. AFTER SIMULATION COMPARISON (ALL 6 AXES)
              </div>
              {appliedConfigTitle && (
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                  Unified Fix Applied
                </span>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-1.5 px-2">Variable / Constraint</th>
                    <th className="py-1.5 px-2 text-rose-800">Before</th>
                    <th className="py-1.5 px-2 text-emerald-800">Current Simulation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      Impeller, D_i/D_T &amp; RPM
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      {beforeSnapshot.strParams.impellerCount}×{' '}
                      {IMPELLER_GEOMETRY_SPECS[beforeSnapshot.strParams.impellerType].shortLabel} (D_i/D_T=
                      {beforeSnapshot.strParams.diameterRatioDiDt.toFixed(2)},{' '}
                      {beforeSnapshot.strParams.stirrerSpeedRpm} RPM)
                    </td>
                    <td className="py-1.5 px-2 font-semibold text-slate-900">
                      {strParams.impellerCount}× {impellerSpec.shortLabel} (D_i/D_T=
                      {strParams.diameterRatioDiDt.toFixed(2)}, {strParams.stirrerSpeedRpm} RPM)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      HF Filter (d_f, L_f, Q)
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      d_f={beforeSnapshot.hfParams.fibreInnerDiameterUm}μm · L_f=
                      {beforeSnapshot.hfParams.fibreLengthM.toFixed(2)}m ·{' '}
                      {beforeSnapshot.hfParams.recirculationFlowLMin.toFixed(1)} L/m
                    </td>
                    <td className="py-1.5 px-2 font-semibold text-slate-900">
                      d_f={hfParams.fibreInnerDiameterUm}μm · L_f=
                      {hfParams.fibreLengthM.toFixed(2)}m ·{' '}
                      {hfParams.recirculationFlowLMin.toFixed(1)} L/m
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      1. OTR vs. OUR (mmol/L/h)
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      {beforeSnapshot.physics.otrMmolPerLHour.toFixed(1)} vs{' '}
                      {beforeSnapshot.physics.ourMmolPerLHour.toFixed(1)} (
                      {beforeSnapshot.radar.oxygenLoadPct.toFixed(0)}%)
                    </td>
                    <td
                      className={`py-1.5 px-2 font-bold ${
                        isOxygenDeficit ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {physics.otrMmolPerLHour.toFixed(1)} vs {physics.ourMmolPerLHour.toFixed(1)} (
                      {currentRadar.oxygenLoadPct.toFixed(0)}% of limit)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      2. Mixing Time t_m (≤ 60 s)
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      {beforeSnapshot.physics.mixingTimeGassedS.toFixed(1)} s (
                      {beforeSnapshot.radar.mixingLoadPct.toFixed(0)}%)
                    </td>
                    <td
                      className={`py-1.5 px-2 font-bold ${
                        isMixingSlow
                          ? 'text-rose-700'
                          : isMixingNearLimit
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {physics.mixingTimeGassedS.toFixed(1)} s ({currentRadar.mixingLoadPct.toFixed(0)}% of limit)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      3. Filter ΔP &amp; Wall Shear τ_w
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      {beforeSnapshot.physics.hfPressureDropKpa.toFixed(1)} kPa ·{' '}
                      {beforeSnapshot.physics.hfWallShearStressPa.toFixed(2)} Pa (
                      {beforeSnapshot.radar.filterHydraulicsLoadPct.toFixed(0)}%)
                    </td>
                    <td
                      className={`py-1.5 px-2 font-bold ${
                        isHfViolated
                          ? 'text-rose-700'
                          : isHfNearLimit
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {physics.hfPressureDropKpa.toFixed(1)} kPa ·{' '}
                      {physics.hfWallShearStressPa.toFixed(2)} Pa (
                      {currentRadar.filterHydraulicsLoadPct.toFixed(0)}% of limit)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      4. Impeller Shear τ &amp; λ_K
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      {beforeSnapshot.physics.estimatedShearStressPa.toFixed(2)} Pa ·{' '}
                      {beforeSnapshot.physics.kolmogorovScaleUm.toFixed(1)} μm
                    </td>
                    <td
                      className={`py-1.5 px-2 font-bold ${
                        isShearOrEddyViolation ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {physics.estimatedShearStressPa.toFixed(2)} Pa ·{' '}
                      {physics.kolmogorovScaleUm.toFixed(1)} μm
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      5. Gassed Power P_g/V
                    </td>
                    <td className="py-1.5 px-2 text-slate-700">
                      {beforeSnapshot.physics.specificPowerWPerM3.toFixed(1)} W/m³ (
                      {beforeSnapshot.physics.gassedPowerW.toFixed(0)} W)
                    </td>
                    <td className="py-1.5 px-2 font-semibold text-slate-900">
                      {physics.specificPowerWPerM3.toFixed(1)} W/m³ ({physics.gassedPowerW.toFixed(0)} W)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 font-sans font-medium text-slate-700">
                      Max Radar Load Across 6 Axes
                    </td>
                    <td className="py-1.5 px-2 font-bold text-rose-700">
                      {beforeSnapshot.radar.maxAxisLoadPct.toFixed(0)}%
                    </td>
                    <td
                      className={`py-1.5 px-2 font-bold ${
                        isAllFeasible ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {currentRadar.maxAxisLoadPct.toFixed(0)}% (
                      {isAllFeasible ? 'ALL 6 PASS' : 'VIOLATION'})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Mandatory Human Safety Gate Sign-Off Box */}
          <div
            className={`p-3.5 border text-xs space-y-2 ${
              !isAllFeasible
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : gate2?.status === 'Approved'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex items-center justify-between font-mono font-bold text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                {isAllFeasible ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                )}
                <span>MANDATORY HUMAN REVIEW · GATE 02 &amp; GATE 04</span>
              </span>
              <span>Status: {gate2?.status ?? 'Changes Requested'}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {!isAllFeasible
                ? 'Sign-off is automatically blocked while any physical constraint fails. Apply a feasible configuration above before requesting human sign-off.'
                : gate2?.status === 'Approved'
                ? 'Simulated human reviewer sign-off recorded after verifying OTR ≥ OUR, mixing t_m ≤ 60 s, filter ΔP ≤ 35 kPa, and shear τ ≤ τ_crit.'
                : 'All 6 modelled engineering constraints now pass. A human Bioprocess Engineer must still review and approve Gate 02 before any wet-lab experiment.'}
            </p>
            {isAllFeasible && onUpdateSafetyGate && gate2?.status !== 'Approved' && (
              <button
                type="button"
                onClick={() => {
                  onUpdateSafetyGate(
                    'gate2_reactor',
                    'Approved',
                    'Simulated Demo Reviewer — Bioprocess Engineer',
                    `Simulated Demo Sign-Off (No Institutional Approval Implied): Verified ${strParams.workingVolumeL} L unified configuration (OTR = ${physics.otrMmolPerLHour.toFixed(1)} >= OUR = ${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h, mixing t_m = ${physics.mixingTimeGassedS.toFixed(1)} s, filter ΔP = ${physics.hfPressureDropKpa.toFixed(1)} kPa, shear τ = ${physics.estimatedShearStressPa.toFixed(2)} Pa).`
                  );
                  onUpdateSafetyGate(
                    'gate4_protocol',
                    'Approved',
                    'Simulated Demo Reviewer — Bioprocess Engineer',
                    `Simulated Demo Sign-Off (No Institutional Approval Implied): Approved experimental protocol after unified multi-objective reactor optimisation.`
                  );
                }}
                className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Record Human Engineer Sign-Off (Gates 02 &amp; 04)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FULL-WIDTH DEEP-DIVE WORKBENCH: (1) Mixing & Filter Hydraulics Improvement Plan, (2) Multi-Objective Pareto Trade-Offs, (3) Epistemic Honesty & Unsupported Model Aspects */}
      <div className="bg-slate-50 border border-slate-300 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono font-bold text-blue-800 uppercase">
              MULTI-OBJECTIVE ENGINEERING DIAGNOSTICS, PARETO FRONT &amp; EPISTEMIC BOUNDARIES
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Mixing Improvement Levers, Pareto Trade-Off Analysis &amp; Unsupported Correlation Disclosures
            </h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              {
                id: 'mixing_and_filter_levers' as const,
                label: '1. Mixing Time & Filter Hydraulics Improvement Plan',
                icon: Gauge,
              },
              {
                id: 'pareto_tradeoffs' as const,
                label: '2. Conflicting Objectives & Pareto Comparison',
                icon: Scale,
              },
              {
                id: 'epistemic_and_unsupported' as const,
                label: '3. Literature Limits vs. Unsupported Predictions',
                icon: BookOpen,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeDeepDiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDeepDiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border cursor-pointer transition-colors ${
                    active
                      ? 'bg-blue-700 text-white border-blue-800 font-bold'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: MIXING IMPROVEMENT & FILTER HYDRAULICS DIAGNOSTIC */}
        {activeDeepDiveTab === 'mixing_and_filter_levers' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-white border border-slate-200 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono font-bold text-slate-900 uppercase">
                  MIXING IMPROVEMENT RECOMMENDATION — WHY ISOLATED SINGLE-LEVER CHANGES INTRODUCE COUPLED TRADE-OFFS
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 font-semibold">
                  Governing Equation: t_m,gas = 2 · [6.34 / (N · (D_i/D_T)^2.3 · (Z/D_T)^-0.5)] · f_zoning · (0.38/N_p)^⅓
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                In the O₂-only microsparger fix, gassed mixing time remained at{' '}
                <strong className="font-mono text-slate-900">~51.6–53.9 s</strong> (86% of the 60 s limit). Below are the 4 physically supported engineering levers that reduce predicted <span className="font-mono">t_m,gas</span> and the exact hydrodynamic trade-offs each introduces if applied in isolation versus in the unified configuration.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {optimisationSuite.mixingImprovementLevers.map((lever, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 p-4 space-y-2.5 text-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{lever.leverName}</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                        {lever.predictedMixingTimeBeforeS.toFixed(1)} s →{' '}
                        {lever.predictedMixingTimeAfterS.toFixed(1)} s (
                        {lever.mixingTimeReductionPercent >= 0 ? '−' : '+'}
                        {Math.abs(lever.mixingTimeReductionPercent).toFixed(1)}%)
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-blue-800 bg-blue-50/60 px-2.5 py-1 border border-blue-200">
                      {lever.parameterChangeDisplay} ({lever.variableType})
                    </div>

                    <p className="text-slate-700 leading-relaxed">
                      <strong className="font-mono text-slate-900">Physical Mechanism: </strong>
                      {lever.governingMechanism}
                    </p>

                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 space-y-1 text-[11px] text-amber-950">
                      <div className="font-mono font-bold text-amber-900">
                        Coupled Trade-Offs Introduced:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {lever.coupledTradeOffs.map((t, tidx) => (
                          <li key={tidx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Hollow-Fibre Filter Hydraulics Improvement Card */}
            <div className="bg-white border border-sky-300 p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono font-bold text-sky-900 uppercase">
                  HOLLOW-FIBRE RETENTION FILTER HYDRAULICS IMPROVEMENT (HAGEN–POISEUILLE d_f⁻⁴ SCALING)
                </div>
                <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                  ΔP: {optimisationSuite.filterHydraulicsImprovementSummary.currentDpKpa.toFixed(1)} kPa →{' '}
                  {optimisationSuite.filterHydraulicsImprovementSummary.predictedDpKpa.toFixed(1)} kPa · Wall τ_w:{' '}
                  {optimisationSuite.filterHydraulicsImprovementSummary.currentWallShearPa.toFixed(2)} Pa →{' '}
                  {optimisationSuite.filterHydraulicsImprovementSummary.predictedWallShearPa.toFixed(2)} Pa
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {
                  optimisationSuite.filterHydraulicsImprovementSummary
                    .mechanismAndTradeOffExplanation
                }
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: CONFLICTING OBJECTIVES & PARETO COMPARISON */}
        {activeDeepDiveTab === 'pareto_tradeoffs' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 6 Cols: 2D Pareto Trade-Off Scatter Plot (Mixing Time t_m vs Peak Shear Stress τ) */}
              <div className="lg:col-span-6 bg-white border border-slate-200 p-4 space-y-2">
                <div className="text-xs font-mono font-bold text-slate-900 uppercase">
                  2D PARETO FRONTIER: BULK MIXING TIME (t_m,gas) vs. HYDRODYNAMIC SHEAR (τ)
                </div>
                <p className="text-[11px] text-slate-600">
                  Lower-left is desirable (faster mixing AND lower cellular shear), but physics forces a Pareto trade-off because higher pumping power (<span className="font-mono">P_g/V</span>) shortens <span className="font-mono">t_m</span> while elevating trailing-vortex shear <span className="font-mono">τ</span>.
                </p>

                <svg
                  viewBox="0 0 460 250"
                  className="w-full h-auto bg-slate-50 border border-slate-200 block"
                  role="img"
                  aria-label="Pareto front plot of gassed mixing time versus hydrodynamic shear stress"
                >
                  {/* Axes */}
                  <line x1="52" y1="20" x2="52" y2="210" stroke="#475569" strokeWidth="1.5" />
                  <line x1="52" y1="210" x2="435" y2="210" stroke="#475569" strokeWidth="1.5" />

                  {/* 60 s Mixing Limit Vertical Line */}
                  <line
                    x1={52 + ((60 - 15) / 55) * 370}
                    y1="20"
                    x2={52 + ((60 - 15) / 55) * 370}
                    y2="210"
                    stroke="#e11d48"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={52 + ((60 - 15) / 55) * 370 - 4}
                    y="32"
                    textAnchor="end"
                    fill="#be123c"
                    fontSize="8.5"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight="700"
                  >
                    t_m ≤ 60 s Limit
                  </text>

                  {/* Plot Pareto Points */}
                  {optimisationSuite.paretoFrontPoints.map((pt) => {
                    const x =
                      52 +
                      Math.min(1, Math.max(0, (pt.mixingTimeGassedS - 15) / 55)) * 370;
                    const y =
                      210 -
                      Math.min(
                        1,
                        Math.max(
                          0,
                          pt.shearStressPa / (groundedParams.shearThresholdPa * 1.15)
                        )
                      ) *
                        180;
                    const fill = pt.isCurrentConfig
                      ? '#e11d48'
                      : pt.isTopThreeRank === 1
                      ? '#059669'
                      : pt.isTopThreeRank === 2
                      ? '#2563eb'
                      : pt.isTopThreeRank === 3
                      ? '#7c3aed'
                      : '#94a3b8';
                    const r = pt.isCurrentConfig || pt.isTopThreeRank ? 6.5 : 4;
                    return (
                      <g key={pt.id}>
                        <circle
                          cx={x}
                          cy={y}
                          r={r}
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        {(pt.isCurrentConfig || pt.isTopThreeRank) && (
                          <text
                            x={x + 8}
                            y={y + 3}
                            fill="#0f172a"
                            fontSize="8.5"
                            fontFamily="IBM Plex Mono, monospace"
                            fontWeight="700"
                          >
                            {pt.isCurrentConfig
                              ? `Current (${pt.mixingTimeGassedS.toFixed(0)}s, ${pt.shearStressPa.toFixed(2)}Pa)`
                              : `Rank #${pt.isTopThreeRank} (${pt.mixingTimeGassedS.toFixed(0)}s, ${pt.shearStressPa.toFixed(2)}Pa)`}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  <text
                    x="245"
                    y="238"
                    textAnchor="middle"
                    fill="#334155"
                    fontSize="9.5"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight="600"
                  >
                    Gassed Bulk Mixing Time t_m,gas (seconds — lower is faster mixing)
                  </text>
                  <text
                    x="15"
                    y="115"
                    textAnchor="middle"
                    fill="#334155"
                    fontSize="9.5"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight="600"
                    transform="rotate(-90 15 115)"
                  >
                    Bulk Shear Stress τ (Pa)
                  </text>
                </svg>
              </div>

              {/* Right 6 Cols: Why No Single Configuration Is Universally Optimal */}
              <div className="lg:col-span-6 bg-white border border-slate-200 p-4 space-y-3 text-xs">
                <div className="font-mono font-bold text-slate-900 uppercase">
                  FUNDAMENTAL MULTI-OBJECTIVE CONFLICTS (WHY NO SINGLE POINT IS UNIVERSALLY OPTIMAL)
                </div>
                <ul className="space-y-2 text-slate-700 leading-relaxed">
                  {optimisationSuite.paretoConflictSummary.map((item, idx) => (
                    <li
                      key={idx}
                      className="p-2.5 bg-slate-50 border border-slate-200"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EPISTEMIC HONESTY — LITERATURE-VERIFIED LIMITS vs DESIGN ASSUMPTIONS & UNSUPPORTED PREDICTIONS */}
        {activeDeepDiveTab === 'epistemic_and_unsupported' && (
          <div className="space-y-4 text-xs">
            {selectedConfig && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-emerald-300 p-4 space-y-2">
                  <div className="font-mono font-bold text-emerald-900 uppercase">
                    1. LITERATURE-VERIFIED PHYSICAL LIMITS &amp; MECHANISTIC EQUATIONS (HARD CONSTRAINTS)
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 leading-relaxed">
                    {selectedConfig.epistemicClassificationNotes.literatureVerifiedLimitsUsed.map(
                      (note, i) => (
                        <li key={i}>{note}</li>
                      )
                    )}
                  </ul>
                </div>

                <div className="bg-white border border-amber-300 p-4 space-y-2">
                  <div className="font-mono font-bold text-amber-900 uppercase">
                    2. ENGINEERING DESIGN ASSUMPTIONS &amp; HEURISTIC THRESHOLDS (DISTINGUISHED FROM LAWS)
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 leading-relaxed">
                    {selectedConfig.epistemicClassificationNotes.designAssumptionsUsed.map(
                      (note, i) => (
                        <li key={i}>{note}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* Unsupported Model Aspects Table (Requirement 10) */}
            <div className="bg-white border-2 border-amber-400 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono font-bold text-amber-950 uppercase">
                  3. UNSUPPORTED OR UNCALIBRATED MODEL EFFECTS — CALIBRATION DATA REQUESTED (NO INVENTED RESULTS)
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-100 text-amber-950 border border-amber-300 font-bold">
                  SCIENTIFIC HONESTY SAFEGUARD
                </span>
              </div>
              <p className="text-slate-600">
                Where analytical 0D/1D correlations cannot credibly predict a continuous physical effect, <span className="font-semibold">bioREACT</span> explicitly abstains from inventing fine-grained optimisation gains and specifies the wet-lab or CFD calibration data required:
              </p>

              <div className="overflow-x-auto border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-mono text-[10.5px] text-slate-700">
                      <th className="py-2 px-3">Engineering Variable / Effect</th>
                      <th className="py-2 px-3">Model Credibility Status</th>
                      <th className="py-2 px-3">Why 0D Physics Model Cannot Credibly Predict</th>
                      <th className="py-2 px-3">Required Calibration / Experimental Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {optimisationSuite.unsupportedModelNotices.map((notice, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          <div>{notice.variableOrEffect}</div>
                          <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                            {notice.requestedSettingOrChange}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10.5px]">
                          <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-950 border border-amber-300 font-bold">
                            {notice.statusLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 leading-relaxed">
                          {notice.whyModelCannotPredictCredibly}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-blue-900 leading-relaxed">
                          {notice.requiredCalibrationData}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
