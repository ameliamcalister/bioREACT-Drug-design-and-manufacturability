import React, { useMemo, useState } from 'react';
import {
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  MassBalanceAndPhysicsResult,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  formatTwoSigFigs,
  solveMassBalanceAndReactorPhysics,
} from '../services/bioprocessEngine';
import {
  DEFAULT_HF_PHYSICS,
  DEFAULT_STR_PHYSICS,
  FEASIBLE_500L_STR_PHYSICS,
} from '../data/bioprocessData';

interface ConstraintViolationRadarPanelProps {
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  groundedParams: GroundedSimulatorParams;
  physics: MassBalanceAndPhysicsResult;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  onUpdateHfParams: (next: HollowFibrePhysicsParams) => void;
}

export interface RadarConstraintAxis {
  id:
    | 'oxygen_deficit'
    | 'shear_stress'
    | 'mixing_time'
    | 'kolmogorov_eddy'
    | 'gas_sparge_foaming'
    | 'hf_lumen_hydraulics';
  shortLabel: string;
  radarLine1: string;
  radarLine2: string;
  fullTitle: string;
  plainEnglishSummary: string;
  boundTypeLabel: 'Lower Bound (≥)' | 'Upper Bound (≤)' | 'Operating Window';
  normalisationFormulaLabel: string;
  governingCheck: string;
  currentDisplay: string;
  limitDisplay: string;
  signedMarginDisplay: string;
  signedMarginPercent: number; // Positive = safe headroom %, Negative = violation breach %
  loadPercentOfLimit: number; // <=100% = PASS (within limit), >100% = FAIL (violates limit)
  isViolated: boolean;
  isNearLimit: boolean;
  failureMechanism: string;
  correctiveAction: string;
}

type ReferenceOverlayMode = 'none' | 'open_pipe_baseline' | 'microsparger_feasible';

function buildConstraintAxes(
  strParams: StirredTankPhysicsParams,
  groundedParams: GroundedSimulatorParams,
  physics: MassBalanceAndPhysicsResult
): RadarConstraintAxis[] {
  // 1. Oxygen Transfer Adequacy (Lower Bound: OTR >= OUR)
  // Normalisation: Severity % = (OUR / OTR) * 100.
  // If OTR >= OUR -> <= 100% (PASS). If OTR < OUR -> > 100% (FAIL).
  const our = Math.max(0.1, physics.ourMmolPerLHour);
  const otr = Math.max(0.05, physics.otrMmolPerLHour);
  const o2Margin = physics.oxygenMarginMmolPerLHour; // OTR - OUR
  const o2MarginPct = ((otr - our) / our) * 100;
  const o2LoadPct = (our / otr) * 100;
  const o2Violated = o2Margin < 0 || o2LoadPct > 100.01;

  // 2. Impeller Hydrodynamic Shear Stress (Upper Bound: tau <= tau_crit)
  // Normalisation: Severity % = (tau / tau_crit) * 100.
  // If tau <= tau_crit -> <= 100% (PASS). If tau > tau_crit -> > 100% (FAIL).
  const tauCrit = Math.max(0.1, groundedParams.shearThresholdPa);
  const tau = physics.estimatedShearStressPa;
  const shearMargin = tauCrit - tau;
  const shearMarginPct = (shearMargin / tauCrit) * 100;
  const shearLoadPct = (tau / tauCrit) * 100;
  const shearViolated = tau > tauCrit;

  // 3. Gassed Bulk Mixing Time (Upper Bound: t_m <= effective limit)
  // Governing limit is min(60 s, 2 / kLa) when oxygen-transfer time constant governs macromixing.
  const twoOverKlaS = Math.max(12.0, 2.0 * physics.oxygenTransferTimeConstantS);
  const tmEffectiveLimit = physics.isMixingRateLimiting
    ? Math.min(60.0, twoOverKlaS)
    : 60.0;
  const tm = physics.mixingTimeGassedS;
  const tmMargin = tmEffectiveLimit - tm;
  const tmMarginPct = (tmMargin / tmEffectiveLimit) * 100;
  const tmLoadPct = (tm / tmEffectiveLimit) * 100;
  const tmViolated = tm > tmEffectiveLimit || physics.isMixingRateLimiting;

  // 4. Kolmogorov Micro-Eddy Length Scale (Lower Bound: lambda_K >= 18.0 um)
  // Larger eddies are safer; eddies smaller than 18 um damage cells.
  // Normalisation: Severity % = (18.0 um / lambda_K) * 100.
  // If lambda_K >= 18 um -> <= 100% (PASS). If lambda_K < 18 um -> > 100% (FAIL).
  const lambdaMin = 18.0;
  const lambdaK = Math.max(4.0, physics.kolmogorovScaleUm);
  const lambdaMargin = lambdaK - lambdaMin;
  const lambdaMarginPct = (lambdaMargin / lambdaMin) * 100;
  const lambdaLoadPct = (lambdaMin / lambdaK) * 100;
  const lambdaViolated = lambdaK < lambdaMin;

  // 5. Aeration Sparge & Foaming Window (Two-Sided Bound: 0.018 <= vvm <= 0.095)
  // Normalisation: Inside [0.018, 0.095] maps monotonically from 30% (at midpoint 0.0565 vvm) to 100% at either boundary.
  // Below 0.018 vvm -> (0.018 / vvm) * 100 > 100% (FAIL: CO2 accumulation).
  // Above 0.095 vvm -> (vvm / 0.095) * 100 > 100% (FAIL: foaming).
  const vvm = strParams.spargeRateVvm;
  const vvmFloor = 0.018;
  const vvmCeiling = 0.095;
  const vvmMid = 0.5 * (vvmFloor + vvmCeiling); // 0.0565
  const vvmHalfSpan = 0.5 * (vvmCeiling - vvmFloor); // 0.0385
  let vvmMarginDisplay = '';
  let vvmMarginPct = 0;
  let vvmLoadPct = 0;
  let vvmViolated = false;

  if (vvm < vvmFloor) {
    const diff = vvm - vvmFloor; // negative
    vvmViolated = true;
    vvmMarginDisplay = `${diff.toFixed(3)} vvm (below CO₂ floor)`;
    vvmMarginPct = (diff / vvmFloor) * 100;
    vvmLoadPct = (vvmFloor / Math.max(0.004, vvm)) * 100;
  } else if (vvm > vvmCeiling) {
    const diffHigh = vvmCeiling - vvm; // negative
    vvmViolated = true;
    vvmMarginDisplay = `${diffHigh.toFixed(3)} vvm (above foam limit)`;
    vvmMarginPct = (diffHigh / vvmCeiling) * 100;
    vvmLoadPct = (vvm / vvmCeiling) * 100;
  } else {
    vvmViolated = false;
    const distToFloor = vvm - vvmFloor;
    const distToCeiling = vvmCeiling - vvm;
    const nearestMargin = Math.min(distToFloor, distToCeiling);
    const nearestLabel = distToFloor <= distToCeiling ? 'above CO₂ floor' : 'below foam limit';
    vvmMarginDisplay = `+${nearestMargin.toFixed(3)} vvm (${nearestLabel})`;
    vvmLoadPct = 30 + (Math.abs(vvm - vvmMid) / vvmHalfSpan) * 70;
    vvmMarginPct = 100 - vvmLoadPct;
  }

  // 6. Hollow-Fibre Filter Hydraulics (Upper Bound: DeltaP <= 35 kPa & tau_w <= tau_crit)
  // Normalisation: Severity % = max(DeltaP / 35, tau_w / tau_crit) * 100.
  const dpLimit = 35.0;
  const dp = physics.hfPressureDropKpa;
  const tauW = physics.hfWallShearStressPa;
  const dpLoadPct = (dp / dpLimit) * 100;
  const tauWLoadPct = (tauW / tauCrit) * 100;
  const hfLoadPct = Math.max(dpLoadPct, tauWLoadPct, physics.hfAxialOxygenDepleted ? 120 : 0);
  const hfMarginPct = 100 - hfLoadPct;
  const hfViolated =
    dp > dpLimit || tauW > tauCrit || physics.hfAxialOxygenDepleted;

  return [
    {
      id: 'oxygen_deficit',
      shortLabel: 'Oxygen Transfer (OTR ≥ OUR)',
      radarLine1: '1. Oxygen Transfer',
      radarLine2: 'OTR ≥ OUR',
      fullTitle: 'Oxygen Mass-Transfer Adequacy (OTR vs. OUR)',
      plainEnglishSummary:
        'Dissolved oxygen supply (OTR) must meet or exceed cellular oxygen consumption (OUR).',
      boundTypeLabel: 'Lower Bound (≥)',
      normalisationFormulaLabel: 'OUR / OTR × 100%',
      governingCheck: 'OTR = k_La·(C*_O2 − C_L) ≥ OUR = q_O2·X_v',
      currentDisplay: `OTR = ${physics.otrMmolPerLHour.toFixed(1)} mmol/L/h`,
      limitDisplay: `≥ OUR (${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h)`,
      signedMarginDisplay: `${o2Margin >= 0 ? '+' : ''}${o2Margin.toFixed(1)} mmol/L/h`,
      signedMarginPercent: o2MarginPct,
      loadPercentOfLimit: o2LoadPct,
      isViolated: o2Violated,
      isNearLimit: !o2Violated && o2LoadPct >= 85,
      failureMechanism:
        'Cellular oxygen demand exceeds gas–liquid transfer capacity, causing dissolved oxygen collapse and hypoxic lactate spike.',
      correctiveAction:
        'Switch open-pipe sparger to 15 μm sintered microsparger, increase O₂ enrichment (21% → 60%), or lower VCD via cell bleed.',
    },
    {
      id: 'shear_stress',
      shortLabel: 'Impeller Shear (τ ≤ τ_crit)',
      radarLine1: '2. Impeller Shear',
      radarLine2: `τ ≤ ${tauCrit.toFixed(2)} Pa`,
      fullTitle: 'Hydromechanical Shear Stress Ceiling (τ vs. τ_crit)',
      plainEnglishSummary:
        'Fluid shear stress from impeller agitation and gas sparging must stay below the cell-damage limit.',
      boundTypeLabel: 'Upper Bound (≤)',
      normalisationFormulaLabel: 'τ / τ_crit × 100%',
      governingCheck: 'τ_max ≈ f(P_g/V, Φ_trailing, u_tip) ≤ τ_crit',
      currentDisplay: `τ = ${tau.toFixed(2)} Pa`,
      limitDisplay: `≤ ${tauCrit.toFixed(2)} Pa`,
      signedMarginDisplay: `${shearMargin >= 0 ? '+' : ''}${shearMargin.toFixed(2)} Pa`,
      signedMarginPercent: shearMarginPct,
      loadPercentOfLimit: shearLoadPct,
      isViolated: shearViolated,
      isNearLimit: !shearViolated && shearLoadPct >= 85,
      failureMechanism: `Hydrodynamic stress depends on rotational speed (N = ${strParams.stirrerSpeedRpm} rpm, u_tip = ${physics.tipSpeedMPerS.toFixed(2)} m/s), impeller geometry (N_p,0 = ${physics.turbulentReferenceNp0.toFixed(2)}), and local trailing-vortex energy dissipation (ε_T,max = ${physics.localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg). Excessive shear lyses cells and releases sialidases.`,
      correctiveAction:
        'Reduce rotational speed N or D_i/D_T to lower P_g/V and local ε_T,max, or select an axial 3-blade marine propeller at moderate tip speed.',
    },
    {
      id: 'mixing_time',
      shortLabel: 'Bulk Mixing Time (t_m ≤ 60 s)',
      radarLine1: '3. Bulk Mixing Time',
      radarLine2: `t_m ≤ ${tmEffectiveLimit.toFixed(0)} s`,
      fullTitle: 'Gassed Bulk Mixing Time & Homogeneity (t_m vs. Limit)',
      plainEnglishSummary:
        'Nutrients, alkali base, and dissolved oxygen must blend across the vessel before local depletion occurs.',
      boundTypeLabel: 'Upper Bound (≤)',
      normalisationFormulaLabel: 't_m / t_m,limit × 100%',
      governingCheck: 't_m,gas ≈ 2·θ_95% ≤ 60 s & t_m,gas ≤ 2/k_La',
      currentDisplay: `t_m = ${formatTwoSigFigs(tm)} s`,
      limitDisplay: `≤ ${tmEffectiveLimit.toFixed(0)} s (2/kLa ≈ ${formatTwoSigFigs(twoOverKlaS)} s)`,
      signedMarginDisplay: `${tmMargin >= 0 ? '+' : ''}${tmMargin.toFixed(1)} s`,
      signedMarginPercent: tmMarginPct,
      loadPercentOfLimit: tmLoadPct,
      isViolated: tmViolated,
      isNearLimit: !tmViolated && tmLoadPct >= 85,
      failureMechanism:
        'Slow macromixing creates dissolved oxygen dead zones and alkali pH spikes near base addition ports.',
      correctiveAction:
        'Increase impeller speed N moderately or use multi-stage axial impellers to improve axial circulation.',
    },
    {
      id: 'kolmogorov_eddy',
      shortLabel: 'Eddy Safe Size (λ_K ≥ 18 μm)',
      radarLine1: '4. Eddy Safe Size',
      radarLine2: 'λ_K ≥ 18.0 μm',
      fullTitle: 'Kolmogorov Turbulent Micro-Eddy Length Scale (λ_K ≥ 18 μm)',
      plainEnglishSummary:
        'Larger micro-eddies are safer: the smallest turbulent eddies must remain larger than a CHO cell (~15–18 μm).',
      boundTypeLabel: 'Lower Bound (≥)',
      normalisationFormulaLabel: '18.0 μm / λ_K × 100%',
      governingCheck: 'λ_K = (ν³ / ε_T,max)^¼ ≥ 18.0 μm (CHO Ø ~15 μm)',
      currentDisplay: `λ_K = ${lambdaK.toFixed(1)} μm`,
      limitDisplay: `≥ 18.0 μm (larger is safer)`,
      signedMarginDisplay: `${lambdaMargin >= 0 ? '+' : ''}${lambdaMargin.toFixed(1)} μm`,
      signedMarginPercent: lambdaMarginPct,
      loadPercentOfLimit: lambdaLoadPct,
      isViolated: lambdaViolated,
      isNearLimit: !lambdaViolated && lambdaLoadPct >= 85,
      failureMechanism: `When local trailing-vortex dissipation ε_T,max = ${physics.localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg (${physics.trailingVortexFactorPhi}× mean ε̄_T; Nienow 1997) shrinks λ_K below 18 μm, micro-eddies exert damaging viscous shear directly across the cell membrane.`,
      correctiveAction:
        'Lower specific gassed power P_g/V (by reducing N or N_p,0) or switch to a lower trailing-vortex impeller.',
    },
    {
      id: 'gas_sparge_foaming',
      shortLabel: 'Aeration Window (vvm)',
      radarLine1: '5. Aeration Window',
      radarLine2: '0.018–0.095 vvm',
      fullTitle: 'Aeration Sparge Window: CO₂ Stripping Floor & Foaming Ceiling',
      plainEnglishSummary:
        'Gas sparging must stay high enough to strip metabolic CO₂ (≥0.018 vvm) without causing severe foaming (≤0.095 vvm).',
      boundTypeLabel: 'Operating Window',
      normalisationFormulaLabel: 'Window Load % (100% at bounds)',
      governingCheck: '0.018 vvm (CO₂ floor) ≤ Q_gas/V ≤ 0.095 vvm (Foam ceiling)',
      currentDisplay: `${vvm.toFixed(3)} vvm`,
      limitDisplay: `0.018 – 0.095 vvm`,
      signedMarginDisplay: vvmMarginDisplay,
      signedMarginPercent: vvmMarginPct,
      loadPercentOfLimit: vvmLoadPct,
      isViolated: vvmViolated,
      isNearLimit: !vvmViolated && vvmLoadPct >= 85,
      failureMechanism:
        'Too low sparging (<0.018 vvm) fails to strip dissolved CO₂ (>120 mmHg); excessive sparging (>0.095 vvm) causes protein foaming and bubble-rupture cell death.',
      correctiveAction:
        'Maintain aeration sparge rate between 0.030 and 0.075 vvm and use O₂ enrichment rather than excessive gas flow.',
    },
    {
      id: 'hf_lumen_hydraulics',
      shortLabel: 'Filter Hydraulics (ΔP & τ_w)',
      radarLine1: '6. Filter Hydraulics',
      radarLine2: 'ΔP ≤ 35 kPa',
      fullTitle: 'Hollow-Fibre Retention Filter Pressure Drop (ΔP) & Wall Shear (τ_w)',
      plainEnglishSummary:
        'External cell-retention filter pressure drop (ΔP) and fibre wall shear (τ_w) must stay below fouling and lysis limits.',
      boundTypeLabel: 'Upper Bound (≤)',
      normalisationFormulaLabel: 'max(ΔP/35, τ_w/τ_crit) × 100%',
      governingCheck: 'ΔP = 128·μ·L·Q / (π·N·d_f⁴) ≤ 35 kPa & τ_w ≤ τ_crit',
      currentDisplay: `ΔP = ${dp.toFixed(1)} kPa · τ_w = ${tauW.toFixed(2)} Pa`,
      limitDisplay: `ΔP ≤ 35.0 kPa · τ_w ≤ ${tauCrit.toFixed(2)} Pa`,
      signedMarginDisplay: `ΔP ${dpLimit - dp >= 0 ? '+' : ''}${(dpLimit - dp).toFixed(1)} kPa`,
      signedMarginPercent: hfMarginPct,
      loadPercentOfLimit: hfLoadPct,
      isViolated: hfViolated,
      isNearLimit: !hfViolated && hfLoadPct >= 85,
      failureMechanism:
        'Narrow fibre inner diameter (d_f^-4 scaling) or excessive recirculation flow elevates transmembrane Starling pressure and wall shear.',
      correctiveAction:
        'Increase hollow-fibre inner diameter d_f (e.g. 200 → 280 μm) or shorten cartridge axial length L_f.',
    },
  ];
}

export const ConstraintViolationRadarPanel: React.FC<ConstraintViolationRadarPanelProps> = ({
  strParams,
  hfParams,
  groundedParams,
  physics,
  onUpdateStrParams,
  onUpdateHfParams,
}) => {
  const [selectedAxisId, setSelectedAxisId] =
    useState<RadarConstraintAxis['id']>('oxygen_deficit');
  const [referenceOverlay, setReferenceOverlay] =
    useState<ReferenceOverlayMode>('open_pipe_baseline');

  const axes = useMemo(
    () => buildConstraintAxes(strParams, groundedParams, physics),
    [strParams, groundedParams, physics]
  );

  // Reference comparison physics for overlay polygon (uses baseline DEFAULT_HF_PHYSICS so HF filter improvements are clearly visible against reference)
  const referenceAxes = useMemo(() => {
    if (referenceOverlay === 'none') return null;
    const refStr =
      referenceOverlay === 'open_pipe_baseline'
        ? DEFAULT_STR_PHYSICS
        : FEASIBLE_500L_STR_PHYSICS;
    const refPhys = solveMassBalanceAndReactorPhysics(
      refStr,
      DEFAULT_HF_PHYSICS,
      groundedParams,
      groundedParams.optimalVvd,
      groundedParams.optimalDoPercent
    );
    return buildConstraintAxes(refStr, groundedParams, refPhys);
  }, [referenceOverlay, groundedParams]);

  const selectedAxis = useMemo(
    () => axes.find((a) => a.id === selectedAxisId) || axes[0],
    [axes, selectedAxisId]
  );

  const violatedCount = axes.filter((a) => a.isViolated).length;

  // Compact, well-padded Radar SVG Geometry
  // ViewBox: 520 x 370. Center (cx, cy) = (260, 185).
  // Outer radius (140% violation cap) = 112px. 100% Limit Polygon radius = 80px.
  // Label anchor distance = 132px -> fits with generous margin inside 520 x 370 (zero clipping).
  const cx = 260;
  const cy = 185;
  const maxLoadScale = 140; // 140% = outer ring
  const outerRadius = 112;

  const getVertexCoords = (index: number, total: number, loadPercent: number) => {
    const clampedLoad = Math.min(maxLoadScale, Math.max(8, loadPercent));
    const r = (clampedLoad / maxLoadScale) * outerRadius;
    const angleRad = -Math.PI / 2 + (index * 2 * Math.PI) / total;
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
      angleRad,
    };
  };

  const activePolygonPoints = axes
    .map((axis, i) => {
      const pt = getVertexCoords(i, axes.length, axis.loadPercentOfLimit);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  const referencePolygonPoints = referenceAxes
    ? referenceAxes
        .map((axis, i) => {
          const pt = getVertexCoords(i, referenceAxes.length, axis.loadPercentOfLimit);
          return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        })
        .join(' ')
    : null;

  const limitPolygonPoints = axes
    .map((_, i) => {
      const pt = getVertexCoords(i, axes.length, 100);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
      {/* Top Header & Normalisation Explanation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="text-xs font-mono text-slate-500 uppercase">
            ENGINEERING FEASIBILITY RADAR · UNIFIED CONSTRAINT-SEVERITY NORMALISATION
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Constraint Violation Visualizer &amp; Synchronised Engineering Margin Table
          </h3>
          <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
            Every radial axis is normalised so that{' '}
            <strong className="font-mono text-emerald-800">≤ 100%</strong> is inside the safe
            operating boundary (<strong>PASS</strong>) and{' '}
            <strong className="font-mono text-rose-700">&gt; 100%</strong> indicates a physical
            constraint violation (<strong>FAIL</strong>)—including lower-bound constraints such as{' '}
            <strong>Oxygen Transfer (OUR / OTR)</strong> and{' '}
            <strong>Eddy Safe Size (18 μm / λ_K)</strong> where larger physical values are safer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs">
          <span
            className={`px-3 py-1.5 font-semibold border ${
              violatedCount === 0
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-400'
            }`}
          >
            {violatedCount === 0
              ? 'PASS · 0/6 CONSTRAINTS VIOLATED (ALL ≤ 100%)'
              : `FAIL · ${violatedCount}/6 CONSTRAINTS VIOLATED (> 100% LIMIT)`}
          </span>
        </div>
      </div>

      {/* Quick Parameter Perturbation Presets Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-slate-600 font-semibold mr-1">
            TEST SCENARIOS:
          </span>
          <button
            type="button"
            onClick={() => {
              onUpdateStrParams(DEFAULT_STR_PHYSICS);
              onUpdateHfParams(DEFAULT_HF_PHYSICS);
              setSelectedAxisId('oxygen_deficit');
            }}
            className="px-2.5 py-1 font-mono bg-white border border-slate-300 hover:bg-rose-50 hover:border-rose-400 text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            1. 500 L Open-Pipe Deficit (OTR &lt; OUR)
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdateStrParams(FEASIBLE_500L_STR_PHYSICS);
              onUpdateHfParams(DEFAULT_HF_PHYSICS);
              setSelectedAxisId('oxygen_deficit');
            }}
            className="px-2.5 py-1 font-mono bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            2. O₂-Only Fix (Mixing 86%, Filter 81%)
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdateStrParams({
                ...FEASIBLE_500L_STR_PHYSICS,
                diameterRatioDiDt: 0.44,
                stirrerSpeedRpm: 118,
                spargeRateVvm: 0.055,
                oxygenEnrichmentFraction: 0.60,
                spargerType: 'sintered_microsparger',
              });
              onUpdateHfParams({
                ...DEFAULT_HF_PHYSICS,
                fibreInnerDiameterUm: 340,
                fibreLengthM: 0.26,
                numberOfFibres: 15500,
                recirculationFlowLMin: 6.0,
              });
              setReferenceOverlay('microsparger_feasible');
              setSelectedAxisId('mixing_time');
            }}
            className="px-2.5 py-1 font-mono bg-emerald-700 text-white border border-emerald-800 hover:bg-emerald-800 font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            3. Unified Multi-Objective Optimum (Mixing + Filter + O₂ + Shear)
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdateStrParams({
                ...FEASIBLE_500L_STR_PHYSICS,
                impellerType: 'rushton_radial',
                customTurbulentNp: 5.0,
                stirrerSpeedRpm: 245,
              });
              setSelectedAxisId('shear_stress');
            }}
            className="px-2.5 py-1 font-mono bg-white border border-slate-300 hover:bg-rose-50 hover:border-rose-400 text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            4. Rushton 245 RPM (Shear &amp; Eddy Breach)
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdateStrParams({
                ...FEASIBLE_500L_STR_PHYSICS,
                stirrerSpeedRpm: 55,
                spargeRateVvm: 0.012,
              });
              setSelectedAxisId('mixing_time');
            }}
            className="px-2.5 py-1 font-mono bg-white border border-slate-300 hover:bg-amber-50 hover:border-amber-400 text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            5. Low 55 RPM + 0.012 vvm (Mixing &amp; CO₂ Breach)
          </button>
        </div>

        <div className="flex items-center gap-1.5 font-mono shrink-0">
          <span className="text-slate-500">Reference Overlay:</span>
          <select
            value={referenceOverlay}
            onChange={(e) => setReferenceOverlay(e.target.value as ReferenceOverlayMode)}
            aria-label="Select reference radar overlay"
            className="bg-white border border-slate-300 px-2 py-1 text-xs font-mono text-slate-900"
          >
            <option value="open_pipe_baseline">500 L Open-Pipe Baseline</option>
            <option value="microsparger_feasible">500 L O₂-Only Microsparger Fix</option>
            <option value="none">No Overlay</option>
          </select>
        </div>
      </div>

      {/* Main Responsive Split: Left 5 Cols = Compact Centered Radar + Legend | Right 7 Cols = Synchronised Constraint Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 5 Columns: Centered, Compact Radar Chart + Immediate Legend */}
        <div className="xl:col-span-5 bg-slate-50 border border-slate-200 p-4 flex flex-col items-center">
          <div className="w-full max-w-[420px] mx-auto">
            <svg
              viewBox="0 0 520 365"
              className="w-full h-auto select-none block"
              role="img"
              aria-label="6-axis engineering feasibility radar chart with 100% constraint limit boundary"
            >
              <defs>
                <pattern
                  id="radarViolationZoneHatch"
                  width="7"
                  height="7"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="7"
                    stroke="#E11D48"
                    strokeWidth="1.2"
                    strokeOpacity="0.2"
                  />
                </pattern>
              </defs>

              {/* Outer 140% Violation Zone (Hatched Ring Outside 100% Limit) */}
              <polygon
                points={axes
                  .map((_, i) => {
                    const pt = getVertexCoords(i, axes.length, maxLoadScale);
                    return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="url(#radarViolationZoneHatch)"
                stroke="#FDA4AF"
                strokeWidth="1"
                strokeDasharray="3,3"
              />

              {/* Safe Operating Envelope Inside 100% Critical Limit Ring */}
              <polygon
                points={limitPolygonPoints}
                fill="#F0FDF4"
                fillOpacity="0.92"
                stroke="#059669"
                strokeWidth="2.2"
                strokeDasharray="5,3"
              />

              {/* Inner Concentric Grid Polygons (25%, 50%, 75%) */}
              {[25, 50, 75].map((pct) => (
                <polygon
                  key={pct}
                  points={axes
                    .map((_, i) => {
                      const pt = getVertexCoords(i, axes.length, pct);
                      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth="1"
                />
              ))}

              {/* Radial Spokes & Non-Clipped Two-Line Axis Labels */}
              {axes.map((axis, i) => {
                const outerPt = getVertexCoords(i, axes.length, maxLoadScale);
                const angleRad = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
                const isTopOrBottom = Math.abs(Math.cos(angleRad)) < 0.2;
                const labelDist = isTopOrBottom ? outerRadius + 24 : outerRadius + 16;
                const lx = cx + labelDist * Math.cos(angleRad);
                const ly = cy + labelDist * Math.sin(angleRad);
                const isSelected = axis.id === selectedAxis.id;

                const textAnchor = isTopOrBottom
                  ? 'middle'
                  : Math.cos(angleRad) > 0
                  ? 'start'
                  : 'end';

                const dyLine1 =
                  i === 0 ? -12 : i === 3 ? 6 : -6;
                const dyLine2 = dyLine1 + 12;
                const dyLine3 = dyLine2 + 12;

                return (
                  <g
                    key={axis.id}
                    onClick={() => setSelectedAxisId(axis.id)}
                    className="cursor-pointer"
                  >
                    <line
                      x1={cx}
                      y1={cy}
                      x2={outerPt.x}
                      y2={outerPt.y}
                      stroke={isSelected ? '#0F172A' : '#94A3B8'}
                      strokeWidth={isSelected ? '2' : '1'}
                    />
                    <text
                      x={lx}
                      y={ly + dyLine1}
                      textAnchor={textAnchor}
                      className={`text-[10.5px] font-sans font-bold ${
                        axis.isViolated
                          ? 'fill-rose-700'
                          : isSelected
                          ? 'fill-slate-950'
                          : 'fill-slate-800'
                      }`}
                    >
                      {axis.radarLine1}
                    </text>
                    <text
                      x={lx}
                      y={ly + dyLine2}
                      textAnchor={textAnchor}
                      className="text-[9.5px] font-mono fill-slate-600"
                    >
                      {axis.radarLine2}
                    </text>
                    <text
                      x={lx}
                      y={ly + dyLine3}
                      textAnchor={textAnchor}
                      className={`text-[9.5px] font-mono font-bold ${
                        axis.isViolated ? 'fill-rose-600' : 'fill-emerald-700'
                      }`}
                    >
                      {axis.loadPercentOfLimit.toFixed(0)}% ({axis.isViolated ? 'FAIL' : 'PASS'})
                    </text>
                  </g>
                );
              })}

              {/* Concentric Ring Percentage Labels */}
              {[50, 100, 140].map((pct) => {
                const r = (pct / maxLoadScale) * outerRadius;
                return (
                  <text
                    key={pct}
                    x={cx + 4}
                    y={cy - r + 10}
                    className={`text-[8.5px] font-mono ${
                      pct === 100
                        ? 'fill-emerald-800 font-bold'
                        : pct > 100
                        ? 'fill-rose-700 font-semibold'
                        : 'fill-slate-500'
                    }`}
                  >
                    {pct === 100 ? '100% LIMIT' : `${pct}%`}
                  </text>
                );
              })}

              {/* Optional Reference Overlay Polygon */}
              {referencePolygonPoints && (
                <polygon
                  points={referencePolygonPoints}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="1.8"
                  strokeDasharray="3,3"
                />
              )}

              {/* Active Simulation Parameter Polygon */}
              <polygon
                points={activePolygonPoints}
                fill={violatedCount > 0 ? 'rgba(225, 29, 72, 0.16)' : 'rgba(6, 182, 212, 0.20)'}
                stroke={violatedCount > 0 ? '#E11D48' : '#0891B2'}
                strokeWidth="2.4"
              />

              {/* Data Vertices */}
              {axes.map((axis, i) => {
                const pt = getVertexCoords(i, axes.length, axis.loadPercentOfLimit);
                const isSelected = axis.id === selectedAxis.id;
                return (
                  <circle
                    key={axis.id}
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 6 : 4.8}
                    fill={
                      axis.isViolated
                        ? '#E11D48'
                        : axis.isNearLimit
                        ? '#D97706'
                        : '#059669'
                    }
                    stroke="#FFFFFF"
                    strokeWidth="1.6"
                    className="cursor-pointer"
                    onClick={() => setSelectedAxisId(axis.id)}
                  />
                );
              })}
            </svg>
          </div>

          {/* Attached Legend Immediately Beneath the Radar Chart */}
          <div className="w-full max-w-[420px] mt-2 pt-3 border-t border-slate-200 space-y-1.5 text-[11px] font-mono text-slate-700">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 border-b-2 border-dashed border-emerald-600" />
                <span>100% Constraint Limit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-rose-100 border border-rose-400" />
                <span>&gt;100% Violation Zone</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>PASS Vertex (≤100%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-600" />
                <span>FAIL Vertex (&gt;100%)</span>
              </div>
            </div>
            {referenceOverlay !== 'none' && (
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/80">
                ┈┈ Slate dashed polygon: {referenceOverlay === 'open_pipe_baseline' ? '500 L Open-Pipe Baseline' : '500 L Microsparger Fix'}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Columns: Synchronised Table of Physical Values, Limits, Normalised % & Plain-English Meaning */}
        <div className="xl:col-span-7 space-y-4">
          <div className="border border-slate-200 overflow-x-auto bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 font-mono text-[10.5px] text-slate-600 uppercase">
                  <th className="py-2.5 px-3">Constraint &amp; Plain-English Meaning</th>
                  <th className="py-2.5 px-2.5">Actual Value</th>
                  <th className="py-2.5 px-2.5">Allowable Limit</th>
                  <th className="py-2.5 px-2.5">Physical Margin</th>
                  <th className="py-2.5 px-3 w-36">Normalised % of Limit</th>
                  <th className="py-2.5 px-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 tabular-nums">
                {axes.map((axis) => {
                  const isSelected = axis.id === selectedAxis.id;
                  const fillWidthPct = Math.min(
                    100,
                    Math.max(4, (axis.loadPercentOfLimit / maxLoadScale) * 100)
                  );
                  const limitMarkerPct = (100 / maxLoadScale) * 100; // 71.4%

                  return (
                    <tr
                      key={axis.id}
                      onClick={() => setSelectedAxisId(axis.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70'
                          : axis.isViolated
                          ? 'bg-rose-50/50 hover:bg-rose-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                          <span>{axis.shortLabel}</span>
                          <span className="text-[10px] font-mono font-normal px-1.5 py-0.2 bg-slate-100 text-slate-600 border border-slate-200">
                            {axis.boundTypeLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {axis.plainEnglishSummary}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {axis.currentDisplay}
                      </td>
                      <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                        {axis.limitDisplay}
                      </td>
                      <td
                        className={`py-2.5 px-2.5 font-mono font-bold whitespace-nowrap ${
                          axis.isViolated ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {axis.signedMarginDisplay}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <div className="flex items-center justify-between text-[10.5px] font-semibold mb-1">
                          <span className={axis.isViolated ? 'text-rose-700' : 'text-slate-900'}>
                            {axis.loadPercentOfLimit.toFixed(0)}% of limit
                          </span>
                          <span className="text-[9.5px] text-slate-500">
                            ({axis.normalisationFormulaLabel})
                          </span>
                        </div>
                        <svg
                          viewBox="0 0 140 10"
                          className="w-full h-2.5 bg-slate-200 block"
                          aria-label={`${axis.shortLabel} normalised severity ${axis.loadPercentOfLimit.toFixed(0)}%`}
                        >
                          <rect
                            x={0}
                            y={0}
                            width={(fillWidthPct / 100) * 140}
                            height={10}
                            fill={
                              axis.isViolated
                                ? '#E11D48'
                                : axis.isNearLimit
                                ? '#F59E0B'
                                : '#059669'
                            }
                          />
                          <line
                            x1={(limitMarkerPct / 100) * 140}
                            y1={0}
                            x2={(limitMarkerPct / 100) * 140}
                            y2={10}
                            stroke="#0F172A"
                            strokeWidth="2"
                          />
                        </svg>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10.5px] font-bold border ${
                            axis.isViolated
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          {axis.isViolated ? 'FAIL' : 'PASS'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Constraint Axis Deep-Dive Inspector */}
          <div
            className={`p-4 border space-y-2 text-xs ${
              selectedAxis.isViolated
                ? 'bg-rose-50/70 border-rose-300 text-rose-950'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 font-mono">
              <span className="font-bold uppercase">
                SELECTED CONSTRAINT DETAILS · {selectedAxis.fullTitle}
              </span>
              <span
                className={`font-bold ${
                  selectedAxis.isViolated ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                Normalised Severity: {selectedAxis.loadPercentOfLimit.toFixed(0)}% of Limit (
                {selectedAxis.isViolated ? 'FAIL — >100%' : 'PASS — ≤100%'})
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div>
                <span className="font-mono text-[10px] uppercase text-slate-500 block">
                  Governing Threshold &amp; Normalisation
                </span>
                <p className="font-mono font-semibold mt-0.5">{selectedAxis.governingCheck}</p>
                <p className="font-mono text-[11px] text-slate-600 mt-0.5">
                  Radar Axis = {selectedAxis.normalisationFormulaLabel}
                </p>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase text-slate-500 block">
                  Physical Failure Mechanism
                </span>
                <p className="text-slate-700 mt-0.5 leading-relaxed">
                  {selectedAxis.failureMechanism}
                </p>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase text-slate-500 block">
                  Engineering Resolution
                </span>
                <p className="text-slate-800 font-medium mt-0.5 leading-relaxed">
                  {selectedAxis.correctiveAction}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
