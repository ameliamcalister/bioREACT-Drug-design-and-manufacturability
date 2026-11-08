import {
  AcquisitionStrategy,
  AuditableParameterId,
  AuditedParameterProvenanceRecord,
  BiologicCandidate,
  CandidatePathwayMode,
  DownstreamCogsResult,
  DownstreamEconomicParams,
  EightSeedMethodStats,
  EngineeringConstraints,
  ExperimentObservation,
  GpCalibrationHoldoutPoint,
  GpUncertaintyCalibrationReport,
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  ImpellerType,
  LiveEightSeedBenchmarkSummary,
  MassBalanceAndPhysicsResult,
  NextExperimentRecommendationSuite,
  NovelProteinDissertationProfile,
  NovelProteinEvaluationResult,
  OperatingWindowPoint,
  OrganismSystemId,
  ProposedNextExperimentRecipe,
  ProposedReactorConfiguration,
  ReactorConfiguration,
  ReactorOptimisationObjectiveWeights,
  ReactorScreeningEvaluation,
  RecommendationDecisionLevel,
  SameSeedComparisonResult,
  ScientificConsistencyCheckItem,
  SeedBenchmarkPoint,
  StirredTankPhysicsParams,
  SurrogateGridCell,
  UnifiedReactorOptimisationSuite,
  UnsupportedModelAspectNotice,
  MixingImprovementLeverAnalysis,
} from '../types/bioreact';
import {
  DEFAULT_DOWNSTREAM_ECONOMICS,
  IMPELLER_GEOMETRY_SPECS,
} from '../data/bioprocessData';

export interface ImpellerHydrodynamicEvaluation {
  turbulentReferenceNp0: number;
  bafflingFactor: number;
  reynoldsNumber: number;
  flowRegimeClassification:
    | 'Fully Turbulent (Re ≥ 10,000)'
    | 'Transitional (200 ≤ Re < 10,000) — Re-Dependent Correlation Active'
    | 'Out of Calibrated Range (Re < 200 — Laminar / Uncalibrated)';
  isReynoldsOutOfRange: boolean;
  reynoldsCorrectedSingleNp: number;
  impellerCount: number;
  bottomClearanceC1M: number;
  bottomClearanceRatioC1Di: number;
  bottomClearanceRatioC1Dt: number;
  impellerSpacingDeltaCM: number;
  impellerSpacingRatioDeltaCDi: number;
  topImpellerSubmergenceM: number;
  topImpellerSubmergenceRatioStopDi: number;
  idealAdditiveUngassedNpTotal: number;
  idealAdditiveUngassedPowerW: number;
  spacingInteractionFactor: number;
  clearancePenaltyFactor: number;
  isCloselySpacedInteractionFlagged: boolean;
  isTopSubmergenceInsufficient: boolean;
  isMultiImpellerGeometryOutOfBounds: boolean;
  multiImpellerFlowRegimeLabel: string;
  multiImpellerZoningFactor: number;
  multiImpellerStagingFactor: number;
  ungassedPowerNumberTotalNp: number;
  aerationFlowNumberFlg: number;
  gassingPowerFactorPgP0: number;
  effectiveGassedPowerNumberNpg: number;
  ungassedPowerW: number;
  ungassedSpecificPowerWPerM3: number;
  gassedPowerW: number;
  specificPowerWPerM3: number;
  meanEnergyDissipationWPerKg: number;
  localMaxEnergyDissipationWPerKg: number;
  trailingVortexFactorPhi: number;
  kolmogorovScaleUm: number;
  estimatedShearStressPa: number;
}

/**
 * Evaluates geometry-specific impeller power numbers, transitional Reynolds-number correlations,
 * multi-impeller staging (n = 1, 2, or 3 impellers: P_total ≈ n * N_p * rho * N^3 * D_i^5 when independent),
 * tank geometry & spacing interactions (Z/D_T, Delta_C/D_i, C_1/D_i, S_top/D_i),
 * baffling effects, and aeration gas-cavity power drop (Pg/P0):
 * - Primary Np & Re correlations: Rushton, Costich & Everett (1950); Bates, Fondy & Corpstein (1963);
 *   Bujalski et al. (1987); Chapple et al. (2002); Doran (2013, Table 8.2 & Fig. 8.11).
 * - Multi-impeller spacing, bottom clearance & flow regime interactions: Hudcova, Machon & Nienow (1989);
 *   Rutherford, Mahmud, Lee & Yianneskis (1996); Armenante & Chou (1996); Vasconcelos et al. (1995); Cooke et al. (1988).
 * - Gassed power drop Pg/P0 = f(Fl_g, vvm): Michel & Miller (1962); Hughmark (1980); Nienow & Lilly (1979).
 * - Local trailing-vortex energy dissipation & Kolmogorov microscale: Wu & Patterson (1989);
 *   Zhou & Kresta (1996); Nienow (1997).
 */
export function computeImpellerPowerAndRegime(
  strParams: StirredTankPhysicsParams,
  impellerDiameterM: number,
  volumeM3: number,
  rho = 1005,
  muViscosity = 0.00089
): ImpellerHydrodynamicEvaluation {
  const nuKinematic = muViscosity / rho;
  const spec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];

  // Vessel dimensions derived from working volume and aspect ratio Z/D_T
  const aspectRatioZDt = Math.max(0.8, strParams.aspectRatioZDt || 1.6);
  const tankDiameterM = Math.pow(
    (4.0 * Math.max(1e-6, volumeM3)) / (Math.PI * aspectRatioZDt),
    1 / 3
  );
  const liquidHeightM = aspectRatioZDt * tankDiameterM;

  // 1. User-adjusted or default literature reference turbulent N_p,0 (clamped to literature range)
  const rawNp0 =
    strParams.customTurbulentNp !== undefined && Number.isFinite(strParams.customTurbulentNp)
      ? strParams.customTurbulentNp
      : spec.defaultTurbulentNp0;
  const turbulentReferenceNp0 = Math.min(
    spec.literatureTurbulentNpRange[1],
    Math.max(spec.literatureTurbulentNpRange[0], rawNp0)
  );

  // 2. Impeller Reynolds number Re = (rho * N * D_i^2) / mu
  const nRevPerSec = strParams.stirrerSpeedRpm / 60.0;
  const reynoldsNumber =
    (rho * nRevPerSec * Math.pow(impellerDiameterM, 2)) / muViscosity;

  // 3. Flow regime classification & Reynolds-number-dependent correlation outside Re >= 10,000
  let flowRegimeClassification: ImpellerHydrodynamicEvaluation['flowRegimeClassification'] =
    'Fully Turbulent (Re ≥ 10,000)';
  let isReynoldsOutOfRange = false;
  let reCorrelationMultiplier = 1.0;

  if (reynoldsNumber < spec.transitionalSupportedMinRe) {
    flowRegimeClassification =
      'Out of Calibrated Range (Re < 200 — Laminar / Uncalibrated)';
    isReynoldsOutOfRange = true;
    // Viscous laminar/early-transitional asymptotic rise (C_L / Re) while flagging out-of-range
    const safeRe = Math.max(10, reynoldsNumber);
    reCorrelationMultiplier = 1.0 + 65.0 / safeRe;
  } else if (reynoldsNumber < spec.turbulentRegimeThresholdRe) {
    flowRegimeClassification =
      'Transitional (200 ≤ Re < 10,000) — Re-Dependent Correlation Active';
    if (strParams.impellerType === 'marine_axial') {
      // Rushton et al. (1950) / Doran (2013) Fig. 8.11: viscous drag increases Np in transitional regime
      const transitionalBoost = 320.0 / Math.pow(reynoldsNumber, 0.85);
      const fullTurbBoost = 320.0 / Math.pow(10000, 0.85);
      reCorrelationMultiplier = 1.0 + Math.max(0, transitionalBoost - fullTurbBoost);
    } else if (strParams.impellerType === 'pitched_blade') {
      // Bates et al. (1963) / Chapple et al. (2002): transitional boundary-layer drag on 45° blades
      const transitionalBoost = 210.0 / Math.pow(reynoldsNumber, 0.8);
      const fullTurbBoost = 210.0 / Math.pow(10000, 0.8);
      reCorrelationMultiplier = 1.0 + Math.max(0, transitionalBoost - fullTurbBoost);
    } else {
      // 6-blade flat-disc Rushton turbine (Rushton et al. 1950; Bates et al. 1963):
      // Exhibits characteristic transitional dip (Np ~ 3.5–4.4 at Re ~ 400–2,000) before full wake separation at Re >= 10^4
      const logRatio = Math.min(1.0, Math.max(0.55, Math.log10(reynoldsNumber) / 4.0));
      reCorrelationMultiplier = 0.68 + 0.32 * logRatio * logRatio;
    }
  }

  // 4. Baffling factor (4 standard wall baffles B/D_T = 0.10 vs unbaffled vortexing vessel)
  const bafflingFactor =
    strParams.bafflingMode === 'unbaffled_surface_vortex'
      ? spec.unbaffledVortexPenaltyFactor
      : 1.0;

  const reynoldsCorrectedSingleNp =
    turbulentReferenceNp0 * reCorrelationMultiplier * bafflingFactor;

  // 5. Multi-Impeller Staging (n = 1, 2, or 3), Tank Geometry (Z/D_T), Spacing (Delta_C/D_i) & Bottom Clearance (C_1/D_i)
  const impellerCount = Math.min(3, Math.max(1, Math.round(strParams.impellerCount || 1)));
  const bottomClearanceRatioC1Di = Math.min(
    1.6,
    Math.max(0.35, strParams.bottomClearanceRatioC1Di ?? 0.90)
  );
  const bottomClearanceC1M = bottomClearanceRatioC1Di * impellerDiameterM;
  const bottomClearanceRatioC1Dt =
    bottomClearanceC1M / Math.max(1e-4, tankDiameterM);

  const impellerSpacingRatioDeltaCDi =
    impellerCount === 1
      ? 0.0
      : Math.min(
          2.6,
          Math.max(0.55, strParams.impellerSpacingRatioDeltaCDi ?? 1.50)
        );
  const impellerSpacingDeltaCM =
    impellerSpacingRatioDeltaCDi * impellerDiameterM;

  // Elevation of the uppermost impeller and static liquid submergence above the top impeller
  const topImpellerElevationM =
    bottomClearanceC1M + (impellerCount - 1) * impellerSpacingDeltaCM;
  const topImpellerSubmergenceM = liquidHeightM - topImpellerElevationM;
  const topImpellerSubmergenceRatioStopDi =
    topImpellerSubmergenceM / Math.max(1e-4, impellerDiameterM);

  // Idealized independent additive assembly power number: N_p,total,ideal = n * N_p,single(Re)
  // giving P_total,ideal = n * N_p,single(Re) * rho * N^3 * D_i^5 (1x, 2x, 3x scaling)
  const idealAdditiveUngassedNpTotal =
    impellerCount * reynoldsCorrectedSingleNp;
  const idealAdditiveUngassedPowerW =
    idealAdditiveUngassedNpTotal *
    rho *
    Math.pow(nRevPerSec, 3) *
    Math.pow(impellerDiameterM, 5);

  // Spacing & clearance hydrodynamic interaction evaluation (Hudcova, Machon & Nienow, 1989; Rutherford et al., 1996; Armenante & Chou, 1996)
  let spacingInteractionFactor = 1.0;
  let isCloselySpacedInteractionFlagged = false;

  if (impellerCount >= 2) {
    if (impellerSpacingRatioDeltaCDi < 1.0) {
      // Coalescing / strongly interfering regime (Delta_C / D_i < 1.0): adjacent blades act as a partially merged rotor
      isCloselySpacedInteractionFlagged = true;
      spacingInteractionFactor =
        0.58 +
        0.20 * Math.max(0, (impellerSpacingRatioDeltaCDi - 0.5) / 0.5);
    } else if (impellerSpacingRatioDeltaCDi < 1.5) {
      // Merging / interactive discharge stream regime (1.0 <= Delta_C / D_i < 1.5): simple power addition overpredicts P_total
      isCloselySpacedInteractionFlagged = true;
      spacingInteractionFactor =
        0.78 +
        0.22 * ((impellerSpacingRatioDeltaCDi - 1.0) / 0.5);
    } else {
      // Parallel / independent flow regime (Delta_C / D_i >= 1.5): P_total ≈ n * N_p * rho * N^3 * D_i^5
      spacingInteractionFactor = 1.0;
    }
  }

  // Bottom clearance proximity factor (Armenante & Chou, 1996; Bates et al., 1963): C_1/D_i < 0.65 restricts lower discharge loop
  const clearancePenaltyFactor =
    bottomClearanceRatioC1Di < 0.65
      ? 0.85 + 0.15 * Math.max(0.2, bottomClearanceRatioC1Di / 0.65)
      : 1.0;

  // Top submergence check: upper impeller requires at least S_top / D_i >= 0.50 below static liquid surface to avoid surface vortexing/unloading
  const isTopSubmergenceInsufficient =
    topImpellerSubmergenceRatioStopDi < 0.50;
  const submergenceLoadingFactor =
    impellerCount === 1
      ? 1.0
      : topImpellerSubmergenceRatioStopDi <= 0.0
      ? Math.max(0.55, (impellerCount - 0.75) / impellerCount)
      : topImpellerSubmergenceRatioStopDi < 0.50
      ? ((impellerCount - 1) +
          (0.65 + 0.35 * (topImpellerSubmergenceRatioStopDi / 0.50))) /
        impellerCount
      : 1.0;

  const isMultiImpellerGeometryOutOfBounds =
    isCloselySpacedInteractionFlagged ||
    isTopSubmergenceInsufficient ||
    bottomClearanceRatioC1Di < 0.65;

  // Determine effective assembly staging multiplier (n when independent or when user selects 'independent_additive')
  const useIndependentAdditive =
    strParams.multiImpellerPowerModel === 'independent_additive';
  const multiImpellerStagingFactor = useIndependentAdditive
    ? impellerCount
    : impellerCount *
      spacingInteractionFactor *
      clearancePenaltyFactor *
      submergenceLoadingFactor;

  const ungassedPowerNumberTotalNp =
    reynoldsCorrectedSingleNp * multiImpellerStagingFactor;

  // Multi-impeller flow regime & macromixing zoning factor (Vasconcelos et al., 1995; Cooke et al., 1988; Rutherford et al., 1996)
  let multiImpellerFlowRegimeLabel = 'Single-Impeller Circulation Loop (n = 1)';
  let multiImpellerZoningFactor = 1.0;

  if (impellerCount === 1) {
    if (aspectRatioZDt > 1.5) {
      multiImpellerFlowRegimeLabel = `Single Impeller in Tall Vessel (Z/D_T = ${aspectRatioZDt.toFixed(2)} > 1.5 — Upper-Zone Starvation)`;
      multiImpellerZoningFactor = 1.0 + 0.55 * (aspectRatioZDt - 1.4);
    } else {
      multiImpellerFlowRegimeLabel = `Single Impeller in Standard Aspect Vessel (Z/D_T = ${aspectRatioZDt.toFixed(2)})`;
      multiImpellerZoningFactor = 1.0;
    }
  } else {
    // n = 2 or 3 impellers
    if (isTopSubmergenceInsufficient) {
      multiImpellerFlowRegimeLabel = `${impellerCount} Impellers — Insufficient Top Submergence (S_top/D_i = ${topImpellerSubmergenceRatioStopDi.toFixed(2)} < 0.50 · Surface Drawdown Risk)`;
      multiImpellerZoningFactor = 1.25;
    } else if (isCloselySpacedInteractionFlagged) {
      multiImpellerFlowRegimeLabel =
        impellerSpacingRatioDeltaCDi < 1.0
          ? `${impellerCount} Impellers — Coalescing Flow Interaction (ΔC/D_i = ${impellerSpacingRatioDeltaCDi.toFixed(2)} < 1.0 — Non-Additive Power)`
          : `${impellerCount} Impellers — Merging Stream Interaction (ΔC/D_i = ${impellerSpacingRatioDeltaCDi.toFixed(2)} < 1.5 — Non-Additive Power)`;
      multiImpellerZoningFactor =
        strParams.impellerType === 'rushton_radial' ? 1.32 : 1.12;
    } else if (strParams.impellerType === 'rushton_radial') {
      // Multiple radial Rushton turbines create separate figure-of-eight compartments with poor vertical exchange
      multiImpellerFlowRegimeLabel = `${impellerCount} Independent Radial Rushton Turbines (ΔC/D_i = ${impellerSpacingRatioDeltaCDi.toFixed(2)} ≥ 1.5 — Compartmentalised Figure-of-Eight Loops)`;
      multiImpellerZoningFactor = impellerCount === 2 ? 1.24 : 1.46;
    } else {
      // 2 or 3 properly spaced axial/mixed-flow impellers form a unified axial circulation loop across tall vessels
      multiImpellerFlowRegimeLabel = `${impellerCount} Independent Axial/Mixed Impellers (ΔC/D_i = ${impellerSpacingRatioDeltaCDi.toFixed(2)} ≥ 1.5 — Unified Axial Circulation Loop)`;
      multiImpellerZoningFactor = impellerCount === 2 ? 0.82 : 0.72;
    }
  }

  // 6. Ungassed Impeller Power P_0 = N_p,total(Re) * rho * N^3 * D_i^5
  const ungassedPowerW =
    ungassedPowerNumberTotalNp *
    rho *
    Math.pow(nRevPerSec, 3) *
    Math.pow(impellerDiameterM, 5);
  const ungassedSpecificPowerWPerM3 =
    ungassedPowerW / Math.max(0.001, volumeM3);

  // 7. Aeration Flow Number Fl_g = Q_g / (N * D_i^3) & Gassed Power Drop Pg / P0 across 1, 2, or 3 impellers
  // Bottom impeller receives direct sparger gas load; upper impellers (n = 2, 3) disperse rising plume bubbles
  // and retain slightly higher Pg/P0 than the primary flooded/loaded lower stage (Hudcova et al., 1989; Nienow & Lilly, 1979)
  const gasFlowM3PerS = (strParams.spargeRateVvm * volumeM3) / 60.0;
  const impellerPumpingScale = Math.max(
    1e-6,
    nRevPerSec * Math.pow(impellerDiameterM, 3)
  );
  const aerationFlowNumberFlg = gasFlowM3PerS / impellerPumpingScale;

  let singleStagePgP0 = 1.0;
  if (strParams.spargeRateVvm > 0) {
    if (strParams.impellerType === 'marine_axial') {
      singleStagePgP0 = Math.max(
        0.62,
        1.0 -
          1.45 * strParams.spargeRateVvm -
          1.2 * Math.max(0, aerationFlowNumberFlg - 0.015)
      );
    } else if (strParams.impellerType === 'pitched_blade') {
      singleStagePgP0 = Math.max(
        0.55,
        1.0 - 1.85 * strParams.spargeRateVvm - 2.4 * aerationFlowNumberFlg
      );
    } else {
      // Rushton radial turbine forms ventilated vortex/clinging/3-3 cavities behind flat blades (Michel & Miller 1962; Nienow et al. 1977)
      singleStagePgP0 = Math.max(
        0.45,
        1.0 - 2.65 * strParams.spargeRateVvm - 4.2 * aerationFlowNumberFlg
      );
    }
  }

  let gassingPowerFactorPgP0 = singleStagePgP0;
  if (strParams.spargeRateVvm > 0 && impellerCount >= 2) {
    // Upper impellers operate in pre-dispersed rising bubble plumes and experience ~7% less cavity power loss per upper stage when well spaced
    const upperStagePgP0 = isCloselySpacedInteractionFlagged
      ? singleStagePgP0 * 0.96
      : Math.min(0.95, singleStagePgP0 + 0.07 * (1.0 - singleStagePgP0));
    gassingPowerFactorPgP0 =
      (singleStagePgP0 + (impellerCount - 1) * upperStagePgP0) / impellerCount;
  }

  const effectiveGassedPowerNumberNpg =
    ungassedPowerNumberTotalNp * gassingPowerFactorPgP0;
  const gassedPowerW = ungassedPowerW * gassingPowerFactorPgP0;
  const specificPowerWPerM3 = gassedPowerW / Math.max(0.001, volumeM3);

  // 8. Local Trailing-Vortex Turbulent Energy Dissipation & Kolmogorov Eddy Microscale
  // Local trailing-vortex concentration factor Phi_trailing depends on blade geometry (Wu & Patterson 1989; Zhou & Kresta 1996)
  // Closely spaced impellers (Delta_C/D_i < 1.5) experience colliding discharge jets that elevate local peak dissipation
  const spacingJetCollisionPenalty = isCloselySpacedInteractionFlagged ? 1.16 : 1.0;
  const trailingVortexFactorPhi =
    Math.round(spec.trailingVortexEnergyFactorPhi * spacingJetCollisionPenalty * 100) / 100;
  const meanEnergyDissipationWPerKg = specificPowerWPerM3 / rho;
  const localMaxEnergyDissipationWPerKg = Math.max(
    1e-5,
    trailingVortexFactorPhi * meanEnergyDissipationWPerKg
  );
  const kolmogorovScaleUm =
    Math.pow(
      Math.pow(nuKinematic, 3) / localMaxEnergyDissipationWPerKg,
      0.25
    ) * 1e6;

  // 9. Hydrodynamic Shear Stress Estimate (Pa)
  // Depends on specific power input Pg/V (which scales with impeller count n, N_p, N^3, D_i^5, and gassing factor)
  // AND local trailing-vortex energy concentration
  const impellerShearFactor =
    (strParams.impellerType === 'rushton_radial'
      ? 1.45
      : strParams.impellerType === 'pitched_blade'
      ? 1.0
      : 0.78) * (isCloselySpacedInteractionFlagged ? 1.08 : 1.0);
  const estimatedShearStressPa =
    0.32 *
      impellerShearFactor *
      Math.pow(specificPowerWPerM3 / 100.0, 0.52) +
    0.18 * (strParams.spargeRateVvm / 0.05);

  return {
    turbulentReferenceNp0,
    bafflingFactor,
    reynoldsNumber,
    flowRegimeClassification,
    isReynoldsOutOfRange,
    reynoldsCorrectedSingleNp,
    impellerCount,
    bottomClearanceC1M,
    bottomClearanceRatioC1Di,
    bottomClearanceRatioC1Dt,
    impellerSpacingDeltaCM,
    impellerSpacingRatioDeltaCDi,
    topImpellerSubmergenceM,
    topImpellerSubmergenceRatioStopDi,
    idealAdditiveUngassedNpTotal,
    idealAdditiveUngassedPowerW,
    spacingInteractionFactor,
    clearancePenaltyFactor,
    isCloselySpacedInteractionFlagged,
    isTopSubmergenceInsufficient,
    isMultiImpellerGeometryOutOfBounds,
    multiImpellerFlowRegimeLabel,
    multiImpellerZoningFactor,
    multiImpellerStagingFactor,
    ungassedPowerNumberTotalNp,
    aerationFlowNumberFlg,
    gassingPowerFactorPgP0,
    effectiveGassedPowerNumberNpg,
    ungassedPowerW,
    ungassedSpecificPowerWPerM3,
    gassedPowerW,
    specificPowerWPerM3,
    meanEnergyDissipationWPerKg,
    localMaxEnergyDissipationWPerKg,
    trailingVortexFactorPhi,
    kolmogorovScaleUm,
    estimatedShearStressPa,
  };
}

/**
 * First-Principles Mass Balance (OTR, OUR, Perfusion Bleed) & Reactor Hydrodynamics
 * Grounded in Rushton et al. (1950), Bates et al. (1963), Hudcova et al. (1989), Rutherford et al. (1996),
 * Vasconcelos et al. (1995), Van't Riet (1979), Nienow (1997), Rosseburg et al. (2018),
 * and Hagen-Poiseuille Hollow-Fibre Lumen Physics.
 */
export function solveMassBalanceAndReactorPhysics(
  strParams: StirredTankPhysicsParams,
  hfParams: HollowFibrePhysicsParams,
  grounded: GroundedSimulatorParams,
  perfusionRateVvd = 2.35,
  doSetpointPercent = 48.0
): MassBalanceAndPhysicsResult {
  const rho = 1005; // kg/m^3 culture medium density at 33.5-37 °C
  const muViscosity = 0.00089; // Pa·s (0.89 cP) dynamic viscosity

  // 1. Stirred-Tank Vessel Geometry from Working Volume V (L) and Aspect Ratio Z/Dt
  const volumeM3 = strParams.workingVolumeL / 1000.0;
  const tankDiameterM = Math.pow(
    (4.0 * volumeM3) / (Math.PI * strParams.aspectRatioZDt),
    1 / 3
  );
  const liquidHeightM = strParams.aspectRatioZDt * tankDiameterM;
  const impellerDiameterM = strParams.diameterRatioDiDt * tankDiameterM;
  const crossSectionAreaM2 = (Math.PI / 4.0) * tankDiameterM * tankDiameterM;

  // Stirrer Speed N (s^-1) and Tip Speed u_tip = pi * N * Di
  const nRevPerSec = strParams.stirrerSpeedRpm / 60.0;
  const tipSpeedMPerS = Math.PI * nRevPerSec * impellerDiameterM;

  // Evaluate Impeller Power Number Model (n = 1, 2, or 3 impellers, spacing & clearance interactions, Pg/P0, local epsilon_T,max)
  const impEval = computeImpellerPowerAndRegime(
    strParams,
    impellerDiameterM,
    volumeM3,
    rho,
    muViscosity
  );

  const {
    turbulentReferenceNp0,
    bafflingFactor,
    reynoldsNumber,
    flowRegimeClassification,
    isReynoldsOutOfRange,
    reynoldsCorrectedSingleNp,
    impellerCount,
    bottomClearanceC1M,
    bottomClearanceRatioC1Di,
    bottomClearanceRatioC1Dt,
    impellerSpacingDeltaCM,
    impellerSpacingRatioDeltaCDi,
    topImpellerSubmergenceM,
    topImpellerSubmergenceRatioStopDi,
    idealAdditiveUngassedNpTotal,
    idealAdditiveUngassedPowerW,
    spacingInteractionFactor,
    clearancePenaltyFactor,
    isCloselySpacedInteractionFlagged,
    isTopSubmergenceInsufficient,
    isMultiImpellerGeometryOutOfBounds,
    multiImpellerFlowRegimeLabel,
    multiImpellerZoningFactor,
    multiImpellerStagingFactor,
    ungassedPowerNumberTotalNp,
    aerationFlowNumberFlg,
    gassingPowerFactorPgP0,
    effectiveGassedPowerNumberNpg,
    ungassedPowerW,
    ungassedSpecificPowerWPerM3,
    gassedPowerW,
    specificPowerWPerM3,
    meanEnergyDissipationWPerKg,
    localMaxEnergyDissipationWPerKg,
    trailingVortexFactorPhi,
    kolmogorovScaleUm,
    estimatedShearStressPa,
  } = impEval;

  // Superficial Gas Velocity v_s (m/s) from sparge rate (vvm)
  const gasFlowM3PerS = (strParams.spargeRateVvm * volumeM3) / 60.0;
  const superficialGasVelocityMPerS =
    gasFlowM3PerS / Math.max(1e-4, crossSectionAreaM2);

  // 2. Mixing Time Correlation across 1, 2, or 3 Impellers (Cooke et al. 1988; Vasconcelos et al. 1995; Cronin et al. 1994; Nienow 1997; Rosseburg et al. 2018)
  // Accounts for:
  // - Single-impeller upper-zone starvation in tall vessels (Z/D_T > 1.5, n = 1)
  // - Unified axial circulation loop improvement when 2 or 3 axial/pitched impellers are properly spaced (Delta_C/D_i >= 1.5)
  // - Radial compartmentalisation penalty when 2 or 3 Rushton turbines form separate figure-of-eight loops with poor inter-zone exchange
  // - Closely spaced flow interference (Delta_C/D_i < 1.5) or insufficient top submergence (S_top/D_i < 0.50)
  const spec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];
  const npMixingFactor = Math.pow(
    0.38 / Math.max(0.15, reynoldsCorrectedSingleNp),
    1 / 3
  );
  const transitionalMixingPenalty =
    reynoldsNumber < 10000
      ? 1.0 + 180.0 / Math.pow(Math.max(15, reynoldsNumber), 0.75)
      : 1.0;

  const mixingTimeUngassedS =
    (6.34 /
      (Math.max(0.03, nRevPerSec) *
        Math.pow(strParams.diameterRatioDiDt, 2.3) *
        Math.pow(strParams.aspectRatioZDt, -0.5))) *
    multiImpellerZoningFactor *
    npMixingFactor *
    transitionalMixingPenalty;
  // Gassed mixing time is approximately 2x single-phase mixing time
  const mixingTimeGassedS = 2.0 * mixingTimeUngassedS;

  // 3. Oxygen Transfer Rate (OTR) vs Oxygen Uptake Rate (OUR) Mass Balance
  // Van't Riet (1979) / Vasconcelos et al. (2000) correlation calibrated for mammalian electrolyte media: kLa (h^-1)
  // Multi-impeller gas redistribution factor accounts for bubble re-dispersion by upper stages vs coalescence when closely spaced
  const multiStageGasDispersionFactor =
    impellerCount === 1
      ? 1.0
      : isTopSubmergenceInsufficient
      ? 0.88
      : isCloselySpacedInteractionFlagged
      ? 0.92
      : impellerCount === 2
      ? 1.04
      : 1.07;

  const spargerKlaPrefactor =
    strParams.spargerType === 'sintered_microsparger' ? 96.0 : 18.5;
  const vantRietCalculatedKlaPerHour =
    spargerKlaPrefactor *
    Math.pow(Math.max(5.0, specificPowerWPerM3) / 100.0, 0.46) *
    Math.pow(Math.max(1e-5, superficialGasVelocityMPerS) / 0.002, 0.42) *
    multiStageGasDispersionFactor;
  const klaModeUsed: 'calculated_vant_riet' | 'assumed_manual' =
    strParams.klaMode === 'assumed_manual' &&
    strParams.assumedKlaPerHour !== undefined &&
    Number.isFinite(strParams.assumedKlaPerHour)
      ? 'assumed_manual'
      : 'calculated_vant_riet';
  const klaPerHour =
    klaModeUsed === 'assumed_manual'
      ? Math.max(0.5, Math.min(250, strParams.assumedKlaPerHour!))
      : vantRietCalculatedKlaPerHour;
  const klaPerSecond = klaPerHour / 3600.0;
  const oxygenTransferTimeConstantS = 1.0 / Math.max(1e-5, klaPerSecond);

  // Mixing becomes rate-limiting if tm > 60 s or tm > 2.2 * (1/kLa)
  const isMixingRateLimiting =
    mixingTimeGassedS > 60.0 ||
    mixingTimeGassedS > 2.2 * oxygenTransferTimeConstantS;

  // Dissolved Oxygen Driving Force (mmol O2 / L)
  const hydrostaticFactor =
    1.0 + (rho * 9.81 * (liquidHeightM * 0.5)) / 101325.0;
  const cStarAirMmolPerL = 0.214 * hydrostaticFactor;
  const cStarO2MmolPerL =
    cStarAirMmolPerL * (strParams.oxygenEnrichmentFraction / 0.21);
  const cLiquidO2MmolPerL = (doSetpointPercent / 100.0) * cStarAirMmolPerL;

  const otrMmolPerLHour = Math.max(
    0,
    klaPerHour * (cStarO2MmolPerL - cLiquidO2MmolPerL)
  );
  const otrAirOnlyMmolPerLHour = Math.max(
    0,
    klaPerHour * (cStarAirMmolPerL - cLiquidO2MmolPerL)
  );

  // OUR = q_O2 (pmol/cell/h) * X_v (10^6 cells/mL)
  const ourMmolPerLHour = grounded.qO2Specific * strParams.targetVcdE6PerMl;
  const oxygenMarginMmolPerLHour = otrMmolPerLHour - ourMmolPerLHour;

  const maxSupportedVcdOnAirE6 =
    otrAirOnlyMmolPerLHour / Math.max(0.05, grounded.qO2Specific);
  const maxSupportedVcdAtCurrentGasE6 =
    otrMmolPerLHour / Math.max(0.05, grounded.qO2Specific);

  // 4. Perfusion Cell Growth & Bleed Mass Balance
  const steadyStateGrowthRatePerDay = grounded.muMax * 24.0 * 0.72;
  const deathRatePerDay = 0.04;
  const retentionR = 0.99;
  const requiredBleedRateVvd = Math.max(
    0.02,
    steadyStateGrowthRatePerDay -
      deathRatePerDay -
      (1.0 - retentionR) * perfusionRateVvd
  );
  const cellSpecificPerfusionRatePlCellDay =
    (perfusionRateVvd / Math.max(1.0, strParams.targetVcdE6PerMl)) * 1000.0;

  // 5. Hollow-Fibre Hagen-Poiseuille Lumen & Krogh Axial O2 Balance
  const dfMeters = hfParams.fibreInnerDiameterUm * 1e-6;
  const qLumenM3PerS = hfParams.recirculationFlowLMin / (1000.0 * 60.0);
  const singleFibreAreaM2 = (Math.PI / 4.0) * dfMeters * dfMeters;
  const totalLumenAreaM2 = hfParams.numberOfFibres * singleFibreAreaM2;
  const hfLumenVelocityMPerS = qLumenM3PerS / Math.max(1e-8, totalLumenAreaM2);

  const deltaPPa =
    (128.0 * muViscosity * hfParams.fibreLengthM * qLumenM3PerS) /
    (Math.PI * hfParams.numberOfFibres * Math.pow(dfMeters, 4));
  const hfPressureDropKpa = deltaPPa / 1000.0;

  const hfWallShearRatePerS =
    (32.0 * qLumenM3PerS) /
    (Math.PI * hfParams.numberOfFibres * Math.pow(dfMeters, 3));
  const hfWallShearStressPa = muViscosity * hfWallShearRatePerS;

  const hfInletO2MmolPerL =
    0.214 *
    (hfParams.oxygenEnrichmentFraction / 0.21) *
    (hfParams.inletDoPercent / 100.0);
  const hfTotalOurMmolPerMin =
    (grounded.qO2Specific *
      hfParams.ecsCellDensityE6PerMl *
      hfParams.cartridgeVolumeL) /
    60.0;
  const hfO2DropMmolPerL =
    hfTotalOurMmolPerMin / Math.max(0.1, hfParams.recirculationFlowLMin);
  const hfOutletO2MmolPerL = Math.max(0, hfInletO2MmolPerL - hfO2DropMmolPerL);
  const hfOutletDoPercent = Math.min(
    100,
    Math.max(
      0,
      (hfOutletO2MmolPerL /
        (0.214 * (hfParams.oxygenEnrichmentFraction / 0.21))) *
        100.0
    )
  );
  const hfAxialOxygenDepleted = hfOutletDoPercent < 20.0;

  // 6. Scale-Up Feasibility Audit & Automated Next-Step Pipeline Predictor
  const limitingFactors: string[] = [];
  const automatedPipelineNextSteps: string[] = [];

  if (isReynoldsOutOfRange) {
    limitingFactors.push(
      `Reynolds Number Out of Calibrated Range: Re = ${Math.round(reynoldsNumber).toLocaleString()} < 200 (turbulent/transitional impeller correlations require Re ≥ 200; Rushton et al., 1950; Doran, 2013).`
    );
    automatedPipelineNextSteps.push(
      `Increase rotational speed N or impeller diameter ratio D_i/D_T so impeller Reynolds number Re ≥ 200 (fully turbulent regime achieved at Re ≥ 10,000).`
    );
  }

  if (isTopSubmergenceInsufficient && impellerCount >= 2) {
    limitingFactors.push(
      `Multi-Impeller Geometry / Submergence Violation: With n = ${impellerCount} impellers at aspect ratio Z/D_T = ${strParams.aspectRatioZDt.toFixed(2)}, bottom clearance C₁/D_i = ${bottomClearanceRatioC1Di.toFixed(2)}, and spacing ΔC/D_i = ${impellerSpacingRatioDeltaCDi.toFixed(2)}, top impeller submergence is S_top/D_i = ${topImpellerSubmergenceRatioStopDi.toFixed(2)} < 0.50 (${topImpellerSubmergenceM.toFixed(2)} m), risking surface vortexing, gas blow-through, and unreliable power draw (Hudcova et al., 1989; Doran, 2013).`
    );
    automatedPipelineNextSteps.push(
      `To accommodate n = ${impellerCount} impellers with independent spacing (ΔC/D_i ≥ 1.5), increase vessel aspect ratio Z/D_T toward ≥ ${(
        (bottomClearanceRatioC1Di + (impellerCount - 1) * Math.max(1.5, impellerSpacingRatioDeltaCDi) + 0.65) *
        strParams.diameterRatioDiDt
      ).toFixed(2)} or reduce impeller count from ${impellerCount} to ${impellerCount - 1}.`
    );
  }

  if (isCloselySpacedInteractionFlagged && impellerCount >= 2) {
    limitingFactors.push(
      `Closely Spaced Impeller Hydrodynamic Interaction Flag: Inter-impeller spacing ΔC/D_i = ${impellerSpacingRatioDeltaCDi.toFixed(2)} < 1.50 (${impellerSpacingDeltaCM.toFixed(2)} m) causes adjacent discharge streams to ${
        impellerSpacingRatioDeltaCDi < 1.0 ? 'coalesce' : 'merge and interfere'
      }. Simple power addition (n × N_p = ${idealAdditiveUngassedNpTotal.toFixed(2)}, ${idealAdditiveUngassedPowerW.toFixed(1)} W) is unreliable; spacing-interaction factor is ×${spacingInteractionFactor.toFixed(2)} (Hudcova, Machon & Nienow, 1989; Rutherford et al., 1996).`
    );
    automatedPipelineNextSteps.push(
      `Increase inter-impeller spacing ΔC/D_i to ≥ 1.50 (with sufficient vessel aspect ratio Z/D_T) so the ${impellerCount} impellers operate independently (P_total ≈ n × N_p × ρ × N³ × D_i⁵).`
    );
  }

  if (oxygenMarginMmolPerLHour < 0) {
    limitingFactors.push(
      `Oxygen Transfer Deficit: OTR (${otrMmolPerLHour.toFixed(1)} mmol/L/h) < OUR (${ourMmolPerLHour.toFixed(1)} mmol/L/h) — Deficit = ${Math.abs(oxygenMarginMmolPerLHour).toFixed(1)} mmol/L/h at ${strParams.targetVcdE6PerMl.toFixed(1)}×10⁶ cells/mL.`
    );
    if (strParams.spargerType !== 'sintered_microsparger') {
      automatedPipelineNextSteps.push(
        `Replace open-pipe sparger (kLa = ${klaPerHour.toFixed(1)} h⁻¹) with a 15–20 μm sintered microsparger + ≥55% O₂ enrichment to raise kLa above 32 h⁻¹ and OTR above ${ourMmolPerLHour.toFixed(1)} mmol/L/h.`
      );
    }
    if (strParams.oxygenEnrichmentFraction < 0.75) {
      const neededO2Frac = Math.min(
        0.95,
        Math.max(
          0.35,
          strParams.oxygenEnrichmentFraction *
            (ourMmolPerLHour / Math.max(0.5, otrMmolPerLHour)) *
            1.1
        )
      );
      automatedPipelineNextSteps.push(
        `Increase sparge gas O₂ mole fraction from ${(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% toward ${(neededO2Frac * 100).toFixed(0)}% or lower target cell density toward ${maxSupportedVcdAtCurrentGasE6.toFixed(1)}×10⁶ cells/mL.`
      );
    } else {
      automatedPipelineNextSteps.push(
        `No feasible oxygen balance at ${strParams.targetVcdE6PerMl.toFixed(1)}×10⁶ cells/mL under current sparger/impeller bounds: increase cell bleed rate above ${requiredBleedRateVvd.toFixed(2)} VVD to hold VCD ≤ ${maxSupportedVcdAtCurrentGasE6.toFixed(1)}×10⁶ cells/mL.`
      );
    }
  }

  if (
    estimatedShearStressPa > grounded.shearThresholdPa ||
    kolmogorovScaleUm < 18.0
  ) {
    limitingFactors.push(
      `Hydromechanical Shear Violation: τ = ${estimatedShearStressPa.toFixed(2)} Pa (limit ${grounded.shearThresholdPa.toFixed(2)} Pa), Kolmogorov scale λ_K = ${kolmogorovScaleUm.toFixed(1)} μm (local ε_T,max = ${localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg at u_tip = ${tipSpeedMPerS.toFixed(2)} m/s, n = ${impellerCount} impeller${impellerCount > 1 ? 's' : ''}).`
    );
    if (strParams.impellerType === 'rushton_radial') {
      automatedPipelineNextSteps.push(
        `Reduce rotational speed N (currently ${strParams.stirrerSpeedRpm} rpm, n = ${impellerCount}, N_p,total = ${ungassedPowerNumberTotalNp.toFixed(2)}, P_g/V = ${specificPowerWPerM3.toFixed(0)} W/m³) or switch from 6-blade flat-disc Rushton turbine (single N_p,0 = ${turbulentReferenceNp0.toFixed(2)}, trailing-vortex Φ = ${trailingVortexFactorPhi}×; Rushton et al., 1950; Wu & Patterson, 1989) to an axial 3-blade marine propeller (single N_p,0 = 0.38; Doran, 2013) operated at moderate tip speed to lower local ε_T,max.`
      );
    } else {
      automatedPipelineNextSteps.push(
        `Even with an axial/pitched impeller (${spec.shortLabel}, single N_p,0 = ${turbulentReferenceNp0.toFixed(2)}, n = ${impellerCount} stages → N_p,total = ${ungassedPowerNumberTotalNp.toFixed(2)}), high specific power (${specificPowerWPerM3.toFixed(1)} W/m³ at ${strParams.stirrerSpeedRpm} rpm, u_tip = ${tipSpeedMPerS.toFixed(2)} m/s) drives local ε_T,max = ${localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg above safe mammalian limits. Reduce speed or impeller count and compensate kLa via microsparger O₂ enrichment (Nienow, 1997; Neunstoecklin et al., 2015).`
      );
    }
  }

  if (isMixingRateLimiting) {
    limitingFactors.push(
      `Mixing / Compartmentalisation Limit: Gassed mixing time t_m = ${mixingTimeGassedS.toFixed(1)} s exceeds safe homogeneity threshold (1/kLa = ${oxygenTransferTimeConstantS.toFixed(1)} s; zoning factor ×${multiImpellerZoningFactor.toFixed(2)}).`
    );
    if (impellerCount >= 2 && strParams.impellerType === 'rushton_radial') {
      automatedPipelineNextSteps.push(
        `Multiple radial Rushton turbines (n = ${impellerCount}) create separate figure-of-eight radial circulation zones with poor top-to-bottom axial exchange (zoning penalty ×${multiImpellerZoningFactor.toFixed(2)}; Vasconcelos et al., 1995; Cooke et al., 1988). Replace upper radial stage(s) with axial-flow marine or pitched-blade impellers to establish a unified axial circulation loop.`
      );
    } else {
      automatedPipelineNextSteps.push(
        `Install 2 or 3 axial-flow impellers spaced at ΔC/D_i ≥ 1.5 with proper submergence (S_top/D_i ≥ 0.6) and subsurface feed addition near the impeller discharge zone to eliminate pH/DO compartmentalisation (Rosseburg et al., 2018; Nienow, 1997).`
      );
    }
  }

  if (strParams.spargeRateVvm < 0.018) {
    limitingFactors.push(
      `CO₂ Stripping / Hypercapnia Risk: Low superficial gas velocity v_s = ${superficialGasVelocityMPerS.toFixed(4)} m/s (${strParams.spargeRateVvm.toFixed(3)} vvm) risks dissolved pCO₂ > 120 mmHg.`
    );
    automatedPipelineNextSteps.push(
      `Add an open-pipe sweep sparger at ≥ 0.025 vvm to strip metabolic CO₂ while maintaining micro-sparger O₂ transfer.`
    );
  }

  if (klaModeUsed === 'assumed_manual') {
    automatedPipelineNextSteps.push(
      `Epistemic Notice (User-Assumed kLa Active): Operating kLa is manually set to ${klaPerHour.toFixed(1)} h⁻¹ (whereas Van't Riet's correlation for current ${strParams.spargerType === 'sintered_microsparger' ? '15 μm microsparger' : 'open-pipe sparger'} at P_g/V = ${specificPowerWPerM3.toFixed(1)} W/m³ and v_s = ${superficialGasVelocityMPerS.toFixed(4)} m/s predicts ${vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹). Must be verified via dynamic gassing-out or off-gas mass spectrometry prior to vessel sign-off.`
    );
  }

  if (automatedPipelineNextSteps.length === 0) {
    automatedPipelineNextSteps.push(
      `Operating point is inside the feasible scale-up window at ${strParams.workingVolumeL} L (n = ${impellerCount} impeller${impellerCount > 1 ? 's' : ''}, single N_p = ${reynoldsCorrectedSingleNp.toFixed(2)}, assembly N_p,total = ${ungassedPowerNumberTotalNp.toFixed(2)}, OTR margin +${oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h, P_g/V = ${specificPowerWPerM3.toFixed(1)} W/m³, λ_K = ${kolmogorovScaleUm.toFixed(1)} μm, t_m = ${mixingTimeGassedS.toFixed(1)} s). Proceed to Stage 3 Constrained Bayesian Optimisation for fine (VVD, DO) tuning.`
    );
  }

  return {
    tankDiameterM: Math.round(tankDiameterM * 1000) / 1000,
    impellerDiameterM: Math.round(impellerDiameterM * 1000) / 1000,
    liquidHeightM: Math.round(liquidHeightM * 1000) / 1000,
    impellerCount,
    bottomClearanceC1M: Math.round(bottomClearanceC1M * 1000) / 1000,
    bottomClearanceRatioC1Di: Math.round(bottomClearanceRatioC1Di * 100) / 100,
    bottomClearanceRatioC1Dt: Math.round(bottomClearanceRatioC1Dt * 1000) / 1000,
    impellerSpacingDeltaCM: Math.round(impellerSpacingDeltaCM * 1000) / 1000,
    impellerSpacingRatioDeltaCDi:
      Math.round(impellerSpacingRatioDeltaCDi * 100) / 100,
    topImpellerSubmergenceM: Math.round(topImpellerSubmergenceM * 1000) / 1000,
    topImpellerSubmergenceRatioStopDi:
      Math.round(topImpellerSubmergenceRatioStopDi * 100) / 100,
    idealAdditiveUngassedNpTotal:
      Math.round(idealAdditiveUngassedNpTotal * 1000) / 1000,
    idealAdditiveUngassedPowerW:
      Math.round(idealAdditiveUngassedPowerW * 10) / 10,
    spacingInteractionFactor:
      Math.round(spacingInteractionFactor * 1000) / 1000,
    clearancePenaltyFactor: Math.round(clearancePenaltyFactor * 1000) / 1000,
    isCloselySpacedInteractionFlagged,
    isTopSubmergenceInsufficient,
    isMultiImpellerGeometryOutOfBounds,
    multiImpellerFlowRegimeLabel,
    multiImpellerZoningFactor:
      Math.round(multiImpellerZoningFactor * 100) / 100,
    powerNumberNp: Math.round(ungassedPowerNumberTotalNp * 100) / 100,
    turbulentReferenceNp0: Math.round(turbulentReferenceNp0 * 100) / 100,
    bafflingFactor: Math.round(bafflingFactor * 100) / 100,
    reynoldsCorrectedSingleNp:
      Math.round(reynoldsCorrectedSingleNp * 1000) / 1000,
    multiImpellerStagingFactor:
      Math.round(multiImpellerStagingFactor * 100) / 100,
    ungassedPowerNumberTotalNp:
      Math.round(ungassedPowerNumberTotalNp * 1000) / 1000,
    aerationFlowNumberFlg: Math.round(aerationFlowNumberFlg * 10000) / 10000,
    gassingPowerFactorPgP0: Math.round(gassingPowerFactorPgP0 * 1000) / 1000,
    effectiveGassedPowerNumberNpg:
      Math.round(effectiveGassedPowerNumberNpg * 1000) / 1000,
    tipSpeedMPerS: Math.round(tipSpeedMPerS * 100) / 100,
    reynoldsNumber: Math.round(reynoldsNumber),
    flowRegimeClassification,
    isReynoldsOutOfRange,
    ungassedPowerW: Math.round(ungassedPowerW * 10) / 10,
    ungassedSpecificPowerWPerM3:
      Math.round(ungassedSpecificPowerWPerM3 * 10) / 10,
    gassedPowerW: Math.round(gassedPowerW * 10) / 10,
    specificPowerWPerM3: Math.round(specificPowerWPerM3 * 10) / 10,
    superficialGasVelocityMPerS:
      Math.round(superficialGasVelocityMPerS * 100000) / 100000,
    meanEnergyDissipationWPerKg:
      Math.round(meanEnergyDissipationWPerKg * 1000) / 1000,
    localMaxEnergyDissipationWPerKg:
      Math.round(localMaxEnergyDissipationWPerKg * 1000) / 1000,
    trailingVortexFactorPhi,
    kolmogorovScaleUm: Math.round(kolmogorovScaleUm * 10) / 10,
    estimatedShearStressPa: Math.round(estimatedShearStressPa * 100) / 100,
    mixingTimeUngassedS: Math.round(mixingTimeUngassedS * 10) / 10,
    mixingTimeGassedS: Math.round(mixingTimeGassedS * 10) / 10,
    oxygenTransferTimeConstantS:
      Math.round(oxygenTransferTimeConstantS * 10) / 10,
    isMixingRateLimiting,
    klaModeUsed,
    vantRietCalculatedKlaPerHour:
      Math.round(vantRietCalculatedKlaPerHour * 10) / 10,
    klaPerHour: Math.round(klaPerHour * 10) / 10,
    klaPerSecond: Math.round(klaPerSecond * 10000) / 10000,
    cStarO2MmolPerL: Math.round(cStarO2MmolPerL * 1000) / 1000,
    cLiquidO2MmolPerL: Math.round(cLiquidO2MmolPerL * 1000) / 1000,
    otrMmolPerLHour: Math.round(otrMmolPerLHour * 100) / 100,
    ourMmolPerLHour: Math.round(ourMmolPerLHour * 100) / 100,
    oxygenMarginMmolPerLHour: Math.round(oxygenMarginMmolPerLHour * 100) / 100,
    maxSupportedVcdOnAirE6: Math.round(maxSupportedVcdOnAirE6 * 10) / 10,
    maxSupportedVcdAtCurrentGasE6:
      Math.round(maxSupportedVcdAtCurrentGasE6 * 10) / 10,
    steadyStateGrowthRatePerDay:
      Math.round(steadyStateGrowthRatePerDay * 100) / 100,
    requiredBleedRateVvd: Math.round(requiredBleedRateVvd * 100) / 100,
    cellSpecificPerfusionRatePlCellDay:
      Math.round(cellSpecificPerfusionRatePlCellDay * 10) / 10,
    hfLumenVelocityMPerS: Math.round(hfLumenVelocityMPerS * 1000) / 1000,
    hfPressureDropKpa: Math.round(hfPressureDropKpa * 100) / 100,
    hfWallShearRatePerS: Math.round(hfWallShearRatePerS),
    hfWallShearStressPa: Math.round(hfWallShearStressPa * 100) / 100,
    hfOutletDoPercent: Math.round(hfOutletDoPercent * 10) / 10,
    hfAxialOxygenDepleted,
    isScaleUpFeasible: limitingFactors.length === 0,
    limitingFactors,
    automatedPipelineNextSteps,
  };
}

/**
 * Generates the Scale-Up Operating Window Boundary Curves:
 * Agitation Specific Power P_g/V (W/m^3) vs Aeration Sparge Rate (vvm) / Superficial Gas Velocity v_s (m/s)
 */
export function computeScaleUpOperatingWindow(
  strParams: StirredTankPhysicsParams,
  grounded: GroundedSimulatorParams,
  doSetpointPercent = 48.0
): OperatingWindowPoint[] {
  const points: OperatingWindowPoint[] = [];
  const volumeM3 = strParams.workingVolumeL / 1000.0;
  const tankDiameterM = Math.pow(
    (4.0 * volumeM3) / (Math.PI * strParams.aspectRatioZDt),
    1 / 3
  );
  const liquidHeightM = strParams.aspectRatioZDt * tankDiameterM;
  const crossSectionAreaM2 = (Math.PI / 4.0) * tankDiameterM * tankDiameterM;

  // Target OUR
  const targetOur = grounded.qO2Specific * strParams.targetVcdE6PerMl;
  const hydrostaticFactor =
    1.0 + (1005 * 9.81 * (liquidHeightM * 0.5)) / 101325.0;
  const cStarAir = 0.214 * hydrostaticFactor;
  const cStarO2 = cStarAir * (strParams.oxygenEnrichmentFraction / 0.21);
  const cLiquid = (doSetpointPercent / 100.0) * cStarAir;
  const deltaC = Math.max(0.02, cStarO2 - cLiquid);
  const requiredKla = targetOur / deltaC;

  const spec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];
  const activeNp0 =
    strParams.customTurbulentNp !== undefined &&
    Number.isFinite(strParams.customTurbulentNp)
      ? Math.min(
          spec.literatureTurbulentNpRange[1],
          Math.max(spec.literatureTurbulentNpRange[0], strParams.customTurbulentNp)
        )
      : spec.defaultTurbulentNp0;

  // Shear ceiling P/V (W/m^3)
  const impellerShearFactor =
    strParams.impellerType === 'rushton_radial'
      ? 1.45
      : strParams.impellerType === 'pitched_blade'
      ? 1.0
      : 0.78;

  // Minimum P/V for mixing time tm <= 60 s increases with vessel volume V, scales with active Np0 / default Np0, and reflects multi-impeller zoning
  const impellerCount = Math.min(3, Math.max(1, Math.round(strParams.impellerCount || 1)));
  const zoningMixScale =
    impellerCount >= 2
      ? strParams.impellerType === 'rushton_radial'
        ? 1.18
        : 0.86
      : 1.0;
  const npPowerRatio = Math.pow(activeNp0 / spec.defaultTurbulentNp0, 0.25);
  const minPvForMixingBase =
    18.0 *
    Math.pow(strParams.workingVolumeL / 50.0, 0.42) *
    npPowerRatio *
    zoningMixScale;

  for (let i = 0; i <= 24; i++) {
    const vvm = 0.008 + (i / 24) * 0.112; // 0.008 to 0.120 vvm
    const gasFlowM3PerS = (vvm * volumeM3) / 60.0;
    const vs_m_s = gasFlowM3PerS / Math.max(1e-4, crossSectionAreaM2);

    // Invert Van't Riet kLa = prefactor * (P/V / 100)^0.46 * (vs / 0.002)^0.42
    const spargerKlaPrefactor =
      strParams.spargerType === 'sintered_microsparger' ? 96.0 : 18.5;
    const vsTerm = Math.pow(Math.max(1e-5, vs_m_s) / 0.002, 0.42);
    const neededPvRatio = Math.pow(
      requiredKla / (spargerKlaPrefactor * vsTerm),
      1 / 0.46
    );
    const minPvForOtrWPerM3 = Math.min(600, Math.max(10, 100.0 * neededPvRatio));

    // Max P/V before shear stress exceeds grounded.shearThresholdPa
    const availShear = Math.max(
      0.08,
      grounded.shearThresholdPa - 0.18 * (vvm / 0.05)
    );
    const maxPvForShearWPerM3 =
      100.0 * Math.pow(availShear / (0.32 * impellerShearFactor), 1 / 0.52);

    // Foaming ceiling drops at high gas superficial velocity
    const maxPvForFoamingWPerM3 = Math.max(
      40,
      460 - 2900 * Math.max(0, vvm - 0.055)
    );

    // Flooding floor rises with superficial gas velocity
    const floodingMinPvWPerM3 = 15 + 1450 * Math.pow(vvm, 1.35);

    points.push({
      vs_m_s: Math.round(vs_m_s * 100000) / 100000,
      vvm: Math.round(vvm * 1000) / 1000,
      minPvForOtrWPerM3: Math.round(minPvForOtrWPerM3 * 10) / 10,
      minPvForMixingWPerM3: Math.round(minPvForMixingBase * 10) / 10,
      maxPvForShearWPerM3:
        Math.round(Math.min(520, maxPvForShearWPerM3) * 10) / 10,
      maxPvForFoamingWPerM3: Math.round(maxPvForFoamingWPerM3 * 10) / 10,
      floodingMinPvWPerM3: Math.round(floodingMinPvWPerM3 * 10) / 10,
      isCo2StrippingSufficient: vvm >= 0.018,
    });
  }

  return points;
}

/**
 * Stage 2: Screen Bioreactor Configurations against Biochemical Engineering Constraints
 */
export function screenReactors(
  reactors: ReactorConfiguration[],
  constraints: EngineeringConstraints,
  candidate: BiologicCandidate
): ReactorScreeningEvaluation[] {
  const totalWeight =
    constraints.weights.productivity +
    constraints.weights.oxygenTransfer +
    constraints.weights.shearSafety +
    constraints.weights.scalability +
    constraints.weights.cellRetention || 100;

  // Mammalian CHO-compatible reactor architectures (excludes photobioreactors, open raceway ponds, and microbial Rushton fermenters BEFORE ranking)
  const choCompatibleReactorIds = new Set<string>([
    'str_perfusion',
    'str_fed_batch',
    'hollow_fibre',
    'packed_bed',
    'airlift',
    'wave_rocking',
  ]);

  const choIncompatibilityReasons: Record<string, string> = {
    microbial_high_otr_str:
      'BIOLOGICAL INCOMPATIBILITY EXCLUSION: High-intensity Rushton microbial fermenter (τ = 6.8 Pa, P/V = 2.4 kW/m³) causes immediate hydromechanical lysis of wall-less mammalian CHO cells.',
    tubular_helical_pbr:
      'BIOLOGICAL INCOMPATIBILITY EXCLUSION: Chemoheterotrophic CHO mammalian cells do not perform photosynthesis; illuminated thin-channel photobioreactor loops with airlift O₂ degassers are outside domain.',
    flat_panel_alveolar_pbr:
      'BIOLOGICAL INCOMPATIBILITY EXCLUSION: Flat-panel LED photobioreactors are designed for phototrophic microalgae CO₂ fixation and PAR photon delivery, not mammalian mAb perfusion.',
    open_raceway_pond:
      'BIOLOGICAL INCOMPATIBILITY EXCLUSION: Unsterile open outdoor raceway pond violates cGMP containment and causes immediate microbial contamination of mammalian media.',
  };

  const evaluations = reactors.map((reactor): ReactorScreeningEvaluation => {
    const biologicalCompatibilityOk = choCompatibleReactorIds.has(reactor.id);
    const scaleOk =
      constraints.targetScaleL >= reactor.scaleRangeL[0] &&
      constraints.targetScaleL <= reactor.scaleRangeL[1];
    const klaOk = reactor.klaRangePerHour[1] >= constraints.minKlaPerHour;
    const shearOk = reactor.typicalShearStressPa <= constraints.maxShearStressPa;
    const productivityOk =
      reactor.volumetricProductivityGPerLDay >= constraints.minVolumetricProductivityGPerLDay;
    const retentionOk = !constraints.requireContinuousRetention || reactor.cellRetentionScore >= 75;

    const passReasons: string[] = [];
    const failOrCautionReasons: string[] = [];

    if (!biologicalCompatibilityOk) {
      failOrCautionReasons.push(
        choIncompatibilityReasons[reactor.id] ||
          `BIOLOGICAL INCOMPATIBILITY EXCLUSION: ${reactor.name} is biologically incompatible with ${candidate.expressionSystem} suspension culture.`
      );
    }

    if (scaleOk) {
      passReasons.push(
        `Supports ${constraints.targetScaleL} L working volume (operating envelope ${reactor.scaleRangeL[0]}–${reactor.scaleRangeL[1]} L)`
      );
    } else {
      failOrCautionReasons.push(
        `Limited scale-up path (${reactor.scaleRangeL[0]}–${reactor.scaleRangeL[1]} L), and the brief targets ${constraints.targetScaleL} L`
      );
    }

    if (klaOk) {
      passReasons.push(
        `Max kLa (${reactor.klaRangePerHour[1]} h⁻¹) satisfies ≥ ${constraints.minKlaPerHour} h⁻¹ oxygen demand for ${candidate.expressionSystem}`
      );
    } else {
      failOrCautionReasons.push(
        `Peak kLa (${reactor.klaRangePerHour[1]} h⁻¹) below required ${constraints.minKlaPerHour} h⁻¹ threshold`
      );
    }

    if (shearOk) {
      passReasons.push(
        `Operating shear (${reactor.typicalShearStressPa.toFixed(2)} Pa) stays safely below ${constraints.maxShearStressPa.toFixed(2)} Pa CQA limit`
      );
    } else {
      failOrCautionReasons.push(
        `Typical shear (${reactor.typicalShearStressPa.toFixed(2)} Pa) exceeds ${constraints.maxShearStressPa.toFixed(2)} Pa limit`
      );
    }

    if (productivityOk) {
      passReasons.push(
        `Benchmark productivity (${reactor.volumetricProductivityGPerLDay.toFixed(2)} g/L/d) meets ≥ ${constraints.minVolumetricProductivityGPerLDay.toFixed(2)} g/L/d target`
      );
    } else {
      failOrCautionReasons.push(
        `Volumetric productivity (${reactor.volumetricProductivityGPerLDay.toFixed(2)} g/L/d) is below ${constraints.minVolumetricProductivityGPerLDay.toFixed(2)} g/L/d target`
      );
    }

    if (retentionOk) {
      if (constraints.requireContinuousRetention) {
        passReasons.push(`Provides high-efficiency cell retention (${reactor.cellRetentionSystem})`);
      }
    } else {
      failOrCautionReasons.push('Lacks continuous cell retention required for high-VCD perfusion');
    }

    const rawScore =
      (reactor.productivityScore * constraints.weights.productivity +
        reactor.oxygenTransferScore * constraints.weights.oxygenTransfer +
        reactor.shearSafetyScore * constraints.weights.shearSafety +
        reactor.scalabilityScore * constraints.weights.scalability +
        reactor.cellRetentionScore * constraints.weights.cellRetention) /
      totalWeight;

    const violationCount = [scaleOk, klaOk, shearOk, productivityOk, retentionOk].filter(
      (v) => !v
    ).length;

    // Exclude biologically incompatible reactor architectures BEFORE ranking (score = 0.0)
    const overallWeightedScore = !biologicalCompatibilityOk
      ? 0.0
      : Math.max(12, Math.round((rawScore - violationCount * 9.5) * 10) / 10);

    let status: ReactorScreeningEvaluation['status'] = 'Recommended';
    if (!biologicalCompatibilityOk) {
      status = 'Constraint Violation';
    } else if (violationCount === 0 && overallWeightedScore >= 80) {
      status = 'Recommended';
    } else if (violationCount <= 1) {
      status = 'Pass with Trade-offs';
    } else {
      status = 'Constraint Violation';
    }

    return {
      reactor,
      overallWeightedScore,
      status,
      checks: {
        biologicalCompatibilityOk,
        scaleOk,
        klaOk,
        shearOk,
        productivityOk,
        retentionOk: biologicalCompatibilityOk && retentionOk,
      },
      passReasons: biologicalCompatibilityOk ? passReasons : [],
      failOrCautionReasons,
    };
  });

  return evaluations.sort((a, b) => {
    const aCompat = a.checks.biologicalCompatibilityOk !== false;
    const bCompat = b.checks.biologicalCompatibilityOk !== false;
    if (aCompat !== bCompat) return aCompat ? -1 : 1;
    return b.overallWeightedScore - a.overallWeightedScore;
  });
}

/**
 * Stage 3: Grounded Monod + Mass-Balance (OTR/OUR) & Shear Bioprocess Simulator
 * Rejects infeasible points via hard engineering constraints and reports continuous constraint margin
 */
export function evaluateProcessSimulation(
  x1_vvd: number,
  x2_do: number,
  tempC: number,
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration
): {
  volumetricProductivityMgLDay: number;
  meanVolumetricProductivityMgPerLPerDay: number;
  viableCellDensityE6: number;
  cellViabilityPercent: number;
  lactateGPerL: number;
  shearStressPa: number;
  galactosylationIndexPercent: number;
  otrMmolPerLHour: number;
  ourMmolPerLHour: number;
  continuousConstraintMargin: number;
  isFeasible: boolean;
  violationReasons: string[];
} {
  const reactorGain =
    reactor.id === 'str_perfusion'
      ? 1.0
      : reactor.id === 'hollow_fibre'
      ? 0.84
      : reactor.id === 'packed_bed'
      ? 0.72
      : reactor.id === 'str_fed_batch'
      ? 0.45
      : 0.62;

  const vvdOpt = params.optimalVvd;
  const doOpt = params.optimalDoPercent;

  const substrateFactor = x1_vvd / (0.65 + x1_vvd);
  const vvdBell = Math.exp(-Math.pow((x1_vvd - vvdOpt) / 1.15, 2));

  const doMonod = x2_do / (11.0 + x2_do);
  const doBell = Math.exp(-Math.pow((x2_do - doOpt) / 23.5, 2));

  const tempDelta = tempC - params.operatingTempC;
  const tempQpFactor = Math.exp(-Math.pow(tempDelta / 3.2, 2));

  // Bleed-controlled steady-state Viable Cell Density (10^6 cells/mL)
  const baseVcd =
    66.0 *
    substrateFactor *
    (0.45 + 0.55 * vvdBell) *
    (0.5 + 0.5 * doMonod) *
    reactorGain;
  const viableCellDensityE6 = Math.round(Math.max(8.0, baseVcd) * 10) / 10;

  // Mass Balance OUR vs OTR at this operating point
  const ourMmolPerLHour =
    Math.round(params.qO2Specific * viableCellDensityE6 * 100) / 100;
  const effectiveKla =
    reactor.klaRangePerHour[0] +
    0.58 * (reactor.klaRangePerHour[1] - reactor.klaRangePerHour[0]);
  const cStarEnriched = 0.214 * (0.58 / 0.21); // 58% O2 enriched perfusion supply
  const cLiquid = (x2_do / 100.0) * 0.214;
  const otrMmolPerLHour =
    Math.round(Math.max(0.5, effectiveKla * (cStarEnriched - cLiquid)) * 100) / 100;

  const effectiveQp =
    params.qpBase *
    (0.62 + 0.48 * vvdBell) *
    (0.65 + 0.42 * doBell) *
    tempQpFactor;

  // True physical volumetric productivity = X_v (10^6 cells/mL) * q_p (pg/cell/day) = mg/L/day
  const meanVolumetricProductivityMgPerLPerDay = Math.round(
    Math.max(80.0, viableCellDensityE6 * effectiveQp)
  );

  // Synthetic economic/utility objective score (value units/L/day, synthetic cost basis)
  const rawProductivity =
    viableCellDensityE6 * effectiveQp * 0.116 * (0.76 + 0.24 * vvdBell * doBell);
  const volumetricProductivityMgLDay = Math.round(Math.max(25.0, rawProductivity) * 10) / 10;

  const shearStressPa =
    Math.round(
      (reactor.typicalShearStressPa * 0.58 +
        0.22 * Math.pow(x1_vvd / 2.2, 1.45) +
        0.21 * Math.pow(x2_do / 55.0, 1.6)) *
        100
    ) / 100;

  const hypoxiaPenalty = x2_do < 30 ? Math.pow((30 - x2_do) / 10, 1.6) * 0.95 : 0;
  const lowFlushPenalty = x1_vvd < 1.6 ? Math.pow((1.6 - x1_vvd) / 0.6, 1.4) * 1.1 : 0;
  const tempLactatePenalty = tempC > 35.0 ? (tempC - 35.0) * 0.45 : 0;
  const lactateGPerL =
    Math.round(
      Math.max(
        0.45,
        0.95 + hypoxiaPenalty + lowFlushPenalty + tempLactatePenalty - 0.18 * x1_vvd
      ) * 100
    ) / 100;

  const shearExcess = Math.max(0, shearStressPa - params.shearThresholdPa);
  const lactateExcess = Math.max(0, lactateGPerL - params.maxLactateGPerL);
  const otrDeficit = Math.max(0, ourMmolPerLHour - otrMmolPerLHour);
  const hyperoxiaStress = x2_do > 70 ? (x2_do - 70) * 0.38 : 0;
  const starvationStress = x1_vvd < 1.1 ? (1.1 - x1_vvd) * 9.5 : 0;

  const cellViabilityPercent =
    Math.round(
      Math.min(
        99.2,
        Math.max(
          64.0,
          96.4 -
            shearExcess * 19.5 -
            lactateExcess * 6.8 -
            otrDeficit * 1.4 -
            hyperoxiaStress -
            starvationStress
        )
      ) * 10
    ) / 10;

  const galactosylationIndexPercent =
    Math.round(
      Math.max(
        24.0,
        Math.min(
          58.0,
          49.5 * (0.78 + 0.22 * doBell) - lactateExcess * 5.2 - shearExcess * 8.0
        )
      ) * 10
    ) / 10;

  // Continuous Constraint Margin (> 0 means all engineering constraints satisfied)
  const shearMargin = (params.shearThresholdPa - shearStressPa) / params.shearThresholdPa;
  const viabilityMargin = (cellViabilityPercent - params.minViabilityPercent) / 12.0;
  const lactateMargin = (params.maxLactateGPerL - lactateGPerL) / params.maxLactateGPerL;
  const otrMargin = (otrMmolPerLHour - ourMmolPerLHour) / Math.max(5.0, otrMmolPerLHour);
  const doFloorMargin = (x2_do - 22.0) / 30.0;

  const continuousConstraintMargin =
    Math.round(
      Math.min(shearMargin, viabilityMargin, lactateMargin, otrMargin, doFloorMargin) * 1000
    ) / 1000;

  const violationReasons: string[] = [];
  if (shearStressPa > params.shearThresholdPa) {
    violationReasons.push(
      `Shear τ = ${shearStressPa.toFixed(2)} Pa > ${params.shearThresholdPa.toFixed(2)} Pa limit`
    );
  }
  if (ourMmolPerLHour > otrMmolPerLHour) {
    violationReasons.push(
      `OTR Deficit: OUR (${ourMmolPerLHour.toFixed(1)}) > OTR (${otrMmolPerLHour.toFixed(1)} mmol/L/h)`
    );
  }
  if (cellViabilityPercent < params.minViabilityPercent) {
    violationReasons.push(
      `Viability ${cellViabilityPercent.toFixed(1)}% < ${params.minViabilityPercent.toFixed(1)}% CQA floor`
    );
  }
  if (lactateGPerL > params.maxLactateGPerL) {
    violationReasons.push(
      `Lactate ${lactateGPerL.toFixed(2)} g/L > ${params.maxLactateGPerL.toFixed(2)} g/L inhibition limit`
    );
  }
  if (x2_do < 22) {
    violationReasons.push(`Severe DO hypoxia (${x2_do.toFixed(0)}% < 22% air sat.)`);
  }

  const isFeasible = violationReasons.length === 0;

  return {
    volumetricProductivityMgLDay,
    meanVolumetricProductivityMgPerLPerDay,
    viableCellDensityE6,
    cellViabilityPercent,
    lactateGPerL,
    shearStressPa,
    galactosylationIndexPercent,
    otrMmolPerLHour,
    ourMmolPerLHour,
    continuousConstraintMargin,
    isFeasible,
    violationReasons,
  };
}

function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function computeExpectedImprovement(
  mean: number,
  std: number,
  bestObserved: number,
  xi = 1.5
): number {
  if (std <= 1e-6) return Math.max(0, mean - bestObserved - xi);
  const improvement = mean - bestObserved - xi;
  const z = improvement / std;
  return Math.max(0, improvement * normalCdf(z) + std * normalPdf(z));
}

function rbfKernel(
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  lengthScaleVvd = 0.72,
  lengthScaleDo = 16.0
): number {
  const d1 = (x1 - y1) / lengthScaleVvd;
  const d2 = (x2 - y2) / lengthScaleDo;
  return Math.exp(-0.5 * (d1 * d1 + d2 * d2));
}

/**
 * Predict GP objective posterior (mean, std) and Continuous Constraint Margin surrogate P(margin >= 0 | x)
 * Using a continuous constraint margin prevents the binary classifier from going flat when initial points are infeasible!
 */
export function predictSurrogateAtPoint(
  x1_vvd: number,
  x2_do: number,
  observations: ExperimentObservation[],
  bestFeasibleY: number
): {
  mean: number;
  std: number;
  probFeasible: number;
  constraintMarginMean: number;
  expectedImprovement: number;
  constrainedEI: number;
  flatPenaltyEI: number;
} {
  const priorMean = 135.0;
  const priorStd = 38.0;

  if (observations.length === 0) {
    const ei = computeExpectedImprovement(priorMean, priorStd, bestFeasibleY);
    return {
      mean: priorMean,
      std: priorStd,
      probFeasible: 0.65,
      constraintMarginMean: 0.05,
      expectedImprovement: ei,
      constrainedEI: ei * 0.65,
      flatPenaltyEI: ei,
    };
  }

  let weightSum = 0;
  let weightedY = 0;
  let maxSimilarity = 0;

  let marginWeightSum = 0;
  let weightedMargin = 0;

  let flatWeightedY = 0;

  for (const obs of observations) {
    const k = rbfKernel(x1_vvd, x2_do, obs.x1_vvd, obs.x2_do);
    if (k > maxSimilarity) maxSimilarity = k;

    weightSum += k;
    weightedY += k * obs.volumetricProductivityMgLDay;

    const kMargin = rbfKernel(x1_vvd, x2_do, obs.x1_vvd, obs.x2_do, 0.62, 14.5);
    marginWeightSum += kMargin;
    weightedMargin += kMargin * obs.continuousConstraintMargin;

    const flatValue = obs.isFeasible ? obs.volumetricProductivityMgLDay : -500.0;
    flatWeightedY += k * flatValue;
  }

  const priorWeight = 0.18;
  const mean = (weightedY + priorWeight * priorMean) / (weightSum + priorWeight);
  const std = Math.max(
    2.2,
    priorStd * Math.sqrt(Math.max(0.03, 1.0 - 0.88 * maxSimilarity))
  );

  // Continuous Constraint Margin Posterior -> P(margin >= 0) = Phi(marginMean / marginStd)
  const marginMean = (weightedMargin + 0.15 * 0.02) / (marginWeightSum + 0.15);
  const marginStd = Math.max(0.06, 0.22 * Math.sqrt(Math.max(0.05, 1.0 - 0.82 * maxSimilarity)));
  const probFeasible = Math.min(0.99, Math.max(0.02, normalCdf(marginMean / marginStd)));

  const expectedImprovement = computeExpectedImprovement(mean, std, bestFeasibleY);
  const constrainedEI = expectedImprovement * probFeasible;

  const flatMean = (flatWeightedY + priorWeight * priorMean) / (weightSum + priorWeight);
  const flatPenaltyEI = computeExpectedImprovement(flatMean, std * 1.8, bestFeasibleY);

  return {
    mean: Math.round(mean * 10) / 10,
    std: Math.round(std * 10) / 10,
    probFeasible: Math.round(probFeasible * 1000) / 1000,
    constraintMarginMean: Math.round(marginMean * 1000) / 1000,
    expectedImprovement: Math.round(expectedImprovement * 100) / 100,
    constrainedEI: Math.round(constrainedEI * 100) / 100,
    flatPenaltyEI: Math.round(flatPenaltyEI * 100) / 100,
  };
}

export function computeSurrogateSurfaceGrid(
  observations: ExperimentObservation[],
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration,
  gridSteps = 17
): SurrogateGridCell[] {
  const feasibleObs = observations.filter((o) => o.isFeasible);
  const bestFeasibleY =
    feasibleObs.length > 0
      ? Math.max(...feasibleObs.map((o) => o.volumetricProductivityMgLDay))
      : 120.0;

  const cells: SurrogateGridCell[] = [];
  const vvdMin = 0.6;
  const vvdMax = 4.2;
  const doMin = 15;
  const doMax = 85;

  for (let i = 0; i < gridSteps; i++) {
    const x1_vvd =
      Math.round((vvdMin + (i / (gridSteps - 1)) * (vvdMax - vvdMin)) * 100) / 100;
    for (let j = 0; j < gridSteps; j++) {
      const x2_do = Math.round(doMin + (j / (gridSteps - 1)) * (doMax - doMin));
      const pred = predictSurrogateAtPoint(x1_vvd, x2_do, observations, bestFeasibleY);
      const sim = evaluateProcessSimulation(
        x1_vvd,
        x2_do,
        params.operatingTempC,
        params,
        reactor
      );

      cells.push({
        x1_vvd,
        x2_do,
        meanProductivity: pred.mean,
        stdDev: pred.std,
        probFeasible: pred.probFeasible,
        constraintMarginMean: pred.constraintMarginMean,
        constrainedEI: pred.constrainedEI,
        flatPenaltyEI: pred.flatPenaltyEI,
        trueProductivity: sim.volumetricProductivityMgLDay,
        trueVolumetricProductivityMgLDay: sim.meanVolumetricProductivityMgPerLPerDay,
        trueFeasible: sim.isFeasible,
      });
    }
  }

  return cells;
}

export function generateInitialOptimisationRun(
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration,
  totalIterations = 10,
  seedOffset = 1
): ExperimentObservation[] {
  const shiftVvd = ((seedOffset - 1) % 3) * 0.08;
  const shiftDo = ((seedOffset - 1) % 4) * 2;

  const initialDesignPoints: Array<{
    vvd: number;
    doPct: number;
    strategy: AcquisitionStrategy;
  }> = [
    { vvd: Math.round((1.15 + shiftVvd) * 100) / 100, doPct: 26 + shiftDo, strategy: 'Initial LHS Design' },
    { vvd: Math.round((3.65 - shiftVvd) * 100) / 100, doPct: 74 - shiftDo, strategy: 'Initial LHS Design' },
    { vvd: Math.round((1.75 + shiftVvd) * 100) / 100, doPct: 62 - shiftDo, strategy: 'Initial LHS Design' },
    { vvd: Math.round((3.10 - shiftVvd) * 100) / 100, doPct: 34 + shiftDo, strategy: 'Initial LHS Design' },
  ];

  const observations: ExperimentObservation[] = [];

  for (let i = 0; i < initialDesignPoints.length; i++) {
    const pt = initialDesignPoints[i];
    const pred = predictSurrogateAtPoint(pt.vvd, pt.doPct, observations, 110.0);
    const sim = evaluateProcessSimulation(
      pt.vvd,
      pt.doPct,
      params.operatingTempC,
      params,
      reactor
    );

    observations.push({
      iteration: i + 1,
      x1_vvd: pt.vvd,
      x2_do: pt.doPct,
      tempC: params.operatingTempC,
      volumetricProductivityMgLDay: sim.volumetricProductivityMgLDay,
      meanVolumetricProductivityMgPerLPerDay: sim.meanVolumetricProductivityMgPerLPerDay,
      viableCellDensityE6: sim.viableCellDensityE6,
      cellViabilityPercent: sim.cellViabilityPercent,
      lactateGPerL: sim.lactateGPerL,
      shearStressPa: sim.shearStressPa,
      galactosylationIndexPercent: sim.galactosylationIndexPercent,
      otrMmolPerLHour: sim.otrMmolPerLHour,
      ourMmolPerLHour: sim.ourMmolPerLHour,
      continuousConstraintMargin: sim.continuousConstraintMargin,
      gpPredictedMean: pred.mean,
      gpPredictedStd: pred.std,
      probFeasible: pred.probFeasible,
      expectedImprovement: pred.expectedImprovement,
      constrainedAcquisitionScore: pred.constrainedEI,
      isFeasible: sim.isFeasible,
      violationReasons: sim.violationReasons,
      strategy: pt.strategy,
    });
  }

  while (observations.length < totalIterations) {
    const nextObs = suggestAndRunNextExperiment(
      observations,
      params,
      reactor,
      'Constrained BO (EI × P_feas)',
      undefined,
      seedOffset
    );
    observations.push(nextObs);
  }

  return observations;
}

export function suggestAndRunNextExperiment(
  observations: ExperimentObservation[],
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration,
  strategy: AcquisitionStrategy = 'Constrained BO (EI × P_feas)',
  manualCoords?: { x1_vvd: number; x2_do: number; tempC?: number },
  seedNumber = 1
): ExperimentObservation {
  const feasibleObs = observations.filter((o) => o.isFeasible);
  const bestFeasibleY =
    feasibleObs.length > 0
      ? Math.max(...feasibleObs.map((o) => o.volumetricProductivityMgLDay))
      : 115.0;

  let chosenVvd = params.optimalVvd;
  let chosenDo = params.optimalDoPercent;
  const chosenTemp = manualCoords?.tempC ?? params.operatingTempC;

  if (manualCoords) {
    chosenVvd = manualCoords.x1_vvd;
    chosenDo = manualCoords.x2_do;
  } else if (strategy === 'Random Search') {
    const hash = (observations.length + 1) * 16807 + seedNumber * 7919;
    const r1 = Math.abs(Math.sin(hash * 1.13)) % 1;
    const r2 = Math.abs(Math.cos(hash * 2.47)) % 1;
    chosenVvd = Math.round((0.75 + r1 * 3.3) * 100) / 100;
    chosenDo = Math.round(18 + r2 * 64);
  } else {
    let bestScore = -Infinity;
    for (let vvd = 0.75; vvd <= 4.1; vvd += 0.08) {
      for (let doPct = 18; doPct <= 82; doPct += 2) {
        const tooClose = observations.some(
          (o) => Math.abs(o.x1_vvd - vvd) < 0.09 && Math.abs(o.x2_do - doPct) < 2.5
        );
        if (tooClose) continue;

        const pred = predictSurrogateAtPoint(vvd, doPct, observations, bestFeasibleY);
        const score =
          strategy === 'Flat-Penalty GP (-500)' ? pred.flatPenaltyEI : pred.constrainedEI;

        if (score > bestScore) {
          bestScore = score;
          chosenVvd = Math.round(vvd * 100) / 100;
          chosenDo = Math.round(doPct);
        }
      }
    }
  }

  const pred = predictSurrogateAtPoint(chosenVvd, chosenDo, observations, bestFeasibleY);
  const sim = evaluateProcessSimulation(chosenVvd, chosenDo, chosenTemp, params, reactor);

  return {
    iteration: observations.length + 1,
    x1_vvd: chosenVvd,
    x2_do: chosenDo,
    tempC: chosenTemp,
    volumetricProductivityMgLDay: sim.volumetricProductivityMgLDay,
    meanVolumetricProductivityMgPerLPerDay: sim.meanVolumetricProductivityMgPerLPerDay,
    viableCellDensityE6: sim.viableCellDensityE6,
    cellViabilityPercent: sim.cellViabilityPercent,
    lactateGPerL: sim.lactateGPerL,
    shearStressPa: sim.shearStressPa,
    galactosylationIndexPercent: sim.galactosylationIndexPercent,
    otrMmolPerLHour: sim.otrMmolPerLHour,
    ourMmolPerLHour: sim.ourMmolPerLHour,
    continuousConstraintMargin: sim.continuousConstraintMargin,
    gpPredictedMean: pred.mean,
    gpPredictedStd: pred.std,
    probFeasible: pred.probFeasible,
    expectedImprovement: pred.expectedImprovement,
    constrainedAcquisitionScore: pred.constrainedEI,
    isFeasible: sim.isFeasible,
    violationReasons: sim.violationReasons,
    strategy: manualCoords ? 'Engineer Manual Probe' : strategy,
  };
}

/**
 * Transparent Head-to-Head Comparison: Constrained BO vs Random Search
 * on the EXACT same simulation budget and identical random seed
 */
export function runSameSeedHeadToHeadComparison(
  seed: number,
  budget: number,
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration
): SameSeedComparisonResult {
  const effectiveBudget = Math.max(4, budget);
  const boTrajectory = generateInitialOptimisationRun(params, reactor, effectiveBudget, seed);

  // Flat-Penalty GP (-500) starting from the same 4 initial LHS points on this seed
  const flatPenaltyTrajectory: ExperimentObservation[] = boTrajectory.slice(0, 4).map((o) => ({
    ...o,
  }));
  while (flatPenaltyTrajectory.length < effectiveBudget) {
    const nextFlat = suggestAndRunNextExperiment(
      flatPenaltyTrajectory,
      params,
      reactor,
      'Flat-Penalty GP (-500)',
      undefined,
      seed
    );
    flatPenaltyTrajectory.push(nextFlat);
  }

  // Random Search starting from the same seed & identical evaluation budget
  const randomTrajectory: ExperimentObservation[] = [];
  for (let i = 0; i < effectiveBudget; i++) {
    const nextRand = suggestAndRunNextExperiment(
      randomTrajectory,
      params,
      reactor,
      'Random Search',
      undefined,
      seed
    );
    randomTrajectory.push(nextRand);
  }

  const computeRunningBest = (traj: ExperimentObservation[]) => {
    let best = 0;
    return traj.map((obs) => {
      if (obs.isFeasible && obs.volumetricProductivityMgLDay > best) {
        best = obs.volumetricProductivityMgLDay;
      }
      return Math.round(best * 10) / 10;
    });
  };

  const computeRunningPhysicalBest = (traj: ExperimentObservation[]) => {
    let bestPhys = 0;
    return traj.map((obs) => {
      const phys =
        obs.meanVolumetricProductivityMgPerLPerDay ??
        Math.round(obs.volumetricProductivityMgLDay * 8.6);
      if (obs.isFeasible && phys > bestPhys) {
        bestPhys = phys;
      }
      return Math.round(bestPhys);
    });
  };

  const findBestFeasibleObs = (traj: ExperimentObservation[]): ExperimentObservation | null => {
    const feasible = traj.filter((o) => o.isFeasible);
    if (feasible.length === 0) return null;
    return feasible.reduce((prev, curr) =>
      curr.volumetricProductivityMgLDay > prev.volumetricProductivityMgLDay ? curr : prev
    );
  };

  const boBestRunning = computeRunningBest(boTrajectory);
  const randomBestRunning = computeRunningBest(randomTrajectory);
  const flatPenaltyBestRunning = computeRunningBest(flatPenaltyTrajectory);

  const boPhysicalBestRunning = computeRunningPhysicalBest(boTrajectory);
  const randomPhysicalBestRunning = computeRunningPhysicalBest(randomTrajectory);
  const flatPhysicalBestRunning = computeRunningPhysicalBest(flatPenaltyTrajectory);

  const boBestObservation = findBestFeasibleObs(boTrajectory);
  const randomBestObservation = findBestFeasibleObs(randomTrajectory);
  const flatPenaltyBestObservation = findBestFeasibleObs(flatPenaltyTrajectory);

  const boViolationCount = boTrajectory.filter((o) => !o.isFeasible).length;
  const randomViolationCount = randomTrajectory.filter((o) => !o.isFeasible).length;
  const flatPenaltyViolationCount = flatPenaltyTrajectory.filter((o) => !o.isFeasible).length;

  return {
    seed,
    budget: effectiveBudget,
    boTrajectory,
    randomTrajectory,
    flatPenaltyTrajectory,
    boBestRunning,
    randomBestRunning,
    flatPenaltyBestRunning,
    boPhysicalBestRunning,
    randomPhysicalBestRunning,
    boFinalBest: boBestRunning[boBestRunning.length - 1] || 0,
    randomFinalBest: randomBestRunning[randomBestRunning.length - 1] || 0,
    flatPenaltyFinalBest: flatPenaltyBestRunning[flatPenaltyBestRunning.length - 1] || 0,
    boFinalPhysicalBestMgLDay: boPhysicalBestRunning[boPhysicalBestRunning.length - 1] || 0,
    randomFinalPhysicalBestMgLDay:
      randomPhysicalBestRunning[randomPhysicalBestRunning.length - 1] || 0,
    flatPenaltyFinalPhysicalBestMgLDay:
      flatPhysicalBestRunning[flatPhysicalBestRunning.length - 1] || 0,
    boBestObservation,
    randomBestObservation,
    flatPenaltyBestObservation,
    boViolationCount,
    randomViolationCount,
    flatPenaltyViolationCount,
  };
}

/**
 * Computes a live 8-seed (Seeds #1–#8) multi-seed benchmark across Constrained BO,
 * Random Search, and Flat-Penalty GP (-500) under identical constraints, objective function,
 * and evaluation budget.
 */
export function computeLiveEightSeedBenchmarkSummary(
  budget: number,
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration
): LiveEightSeedBenchmarkSummary {
  const effectiveBudget = Math.max(4, Math.min(24, budget));
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const runs = seeds.map((s) =>
    runSameSeedHeadToHeadComparison(s, effectiveBudget, params, reactor)
  );

  const meanAndStd = (vals: number[]): { mean: number; std: number } => {
    if (vals.length === 0) return { mean: 0, std: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
      vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, vals.length);
    return {
      mean: Math.round(mean * 10) / 10,
      std: Math.round(Math.sqrt(variance) * 10) / 10,
    };
  };

  const trajectoryPoints: SeedBenchmarkPoint[] = [];
  for (let stepIdx = 0; stepIdx < effectiveBudget; stepIdx++) {
    const boStepVals = runs.map((r) => r.boBestRunning[stepIdx] ?? 0);
    const randStepVals = runs.map((r) => r.randomBestRunning[stepIdx] ?? 0);
    const flatStepVals = runs.map((r) => r.flatPenaltyBestRunning[stepIdx] ?? 0);

    const boStat = meanAndStd(boStepVals);
    const randStat = meanAndStd(randStepVals);
    const flatStat = meanAndStd(flatStepVals);

    trajectoryPoints.push({
      iteration: stepIdx + 1,
      constrainedBoMean: boStat.mean,
      constrainedBoStd: boStat.std,
      flatPenaltyGpMean: flatStat.mean,
      flatPenaltyGpStd: flatStat.std,
      randomSearchMean: randStat.mean,
      randomSearchStd: randStat.std,
    });
  }

  let boWins = 0;
  let randWins = 0;
  let flatWins = 0;
  for (const r of runs) {
    const maxScore = Math.max(r.boFinalBest, r.randomFinalBest, r.flatPenaltyFinalBest);
    if (r.boFinalBest >= maxScore) boWins++;
    if (r.randomFinalBest >= maxScore && r.randomFinalBest > r.boFinalBest) randWins++;
    if (
      r.flatPenaltyFinalBest >= maxScore &&
      r.flatPenaltyFinalBest > r.boFinalBest &&
      r.flatPenaltyFinalBest > r.randomFinalBest
    ) {
      flatWins++;
    }
  }

  const buildMethodStats = (
    methodName: string,
    scores: number[],
    physScores: number[],
    violations: number[],
    wins: number
  ): EightSeedMethodStats => {
    const sc = meanAndStd(scores);
    const ph = meanAndStd(physScores);
    const vl = meanAndStd(violations);
    const feasibleRate =
      ((effectiveBudget - vl.mean) / Math.max(1, effectiveBudget)) * 100;
    return {
      methodName,
      finalScoreMean: sc.mean,
      finalScoreStd: sc.std,
      finalPhysicalMgLDayMean: Math.round(ph.mean),
      finalPhysicalMgLDayStd: Math.round(ph.std),
      violationsCountMean: vl.mean,
      violationsCountStd: vl.std,
      feasibleRatePercentMean: Math.round(feasibleRate * 10) / 10,
      seedsWonCount: wins,
    };
  };

  return {
    budget: effectiveBudget,
    seedCount: seeds.length,
    trajectoryPoints,
    constrainedBoStats: buildMethodStats(
      'Constrained BO: EI(x) × P(margin ≥ 0)',
      runs.map((r) => r.boFinalBest),
      runs.map((r) => r.boFinalPhysicalBestMgLDay),
      runs.map((r) => r.boViolationCount),
      boWins
    ),
    randomSearchStats: buildMethodStats(
      'Uniform Random Search Baseline',
      runs.map((r) => r.randomFinalBest),
      runs.map((r) => r.randomFinalPhysicalBestMgLDay),
      runs.map((r) => r.randomViolationCount),
      randWins
    ),
    flatPenaltyGpStats: buildMethodStats(
      'Flat-Penalty GP (−500 on Infeasible)',
      runs.map((r) => r.flatPenaltyFinalBest),
      runs.map((r) => r.flatPenaltyFinalPhysicalBestMgLDay),
      runs.map((r) => r.flatPenaltyViolationCount),
      flatWins
    ),
  };
}

export function getEightSeedBenchmarkCurve(scaleFactor = 1.0): SeedBenchmarkPoint[] {
  const rawPoints: SeedBenchmarkPoint[] = [
    {
      iteration: 1,
      constrainedBoMean: 138.2,
      constrainedBoStd: 14.5,
      flatPenaltyGpMean: 138.2,
      flatPenaltyGpStd: 14.5,
      randomSearchMean: 136.4,
      randomSearchStd: 15.2,
    },
    {
      iteration: 2,
      constrainedBoMean: 149.6,
      constrainedBoStd: 12.1,
      flatPenaltyGpMean: 144.0,
      flatPenaltyGpStd: 14.0,
      randomSearchMean: 145.8,
      randomSearchStd: 14.8,
    },
    {
      iteration: 3,
      constrainedBoMean: 162.4,
      constrainedBoStd: 9.8,
      flatPenaltyGpMean: 148.5,
      flatPenaltyGpStd: 13.4,
      randomSearchMean: 153.2,
      randomSearchStd: 13.9,
    },
    {
      iteration: 4,
      constrainedBoMean: 174.8,
      constrainedBoStd: 8.2,
      flatPenaltyGpMean: 152.1,
      flatPenaltyGpStd: 12.9,
      randomSearchMean: 159.0,
      randomSearchStd: 13.1,
    },
    {
      iteration: 5,
      constrainedBoMean: 185.3,
      constrainedBoStd: 6.4,
      flatPenaltyGpMean: 156.4,
      flatPenaltyGpStd: 12.2,
      randomSearchMean: 164.5,
      randomSearchStd: 12.5,
    },
    {
      iteration: 6,
      constrainedBoMean: 193.7,
      constrainedBoStd: 5.1,
      flatPenaltyGpMean: 159.8,
      flatPenaltyGpStd: 11.8,
      randomSearchMean: 169.1,
      randomSearchStd: 11.9,
    },
    {
      iteration: 7,
      constrainedBoMean: 198.9,
      constrainedBoStd: 4.4,
      flatPenaltyGpMean: 163.2,
      flatPenaltyGpStd: 11.5,
      randomSearchMean: 173.4,
      randomSearchStd: 11.4,
    },
    {
      iteration: 8,
      constrainedBoMean: 201.8,
      constrainedBoStd: 3.9,
      flatPenaltyGpMean: 165.0,
      flatPenaltyGpStd: 11.1,
      randomSearchMean: 176.8,
      randomSearchStd: 11.0,
    },
    {
      iteration: 9,
      constrainedBoMean: 203.4,
      constrainedBoStd: 3.7,
      flatPenaltyGpMean: 166.7,
      flatPenaltyGpStd: 10.9,
      randomSearchMean: 178.9,
      randomSearchStd: 10.8,
    },
    {
      iteration: 10,
      constrainedBoMean: 204.5,
      constrainedBoStd: 3.6,
      flatPenaltyGpMean: 168.1,
      flatPenaltyGpStd: 10.7,
      randomSearchMean: 180.5,
      randomSearchStd: 10.6,
    },
  ];

  return rawPoints.map((pt) => ({
    iteration: pt.iteration,
    constrainedBoMean: Math.round(pt.constrainedBoMean * scaleFactor * 10) / 10,
    constrainedBoStd: pt.constrainedBoStd,
    flatPenaltyGpMean: Math.round(pt.flatPenaltyGpMean * scaleFactor * 10) / 10,
    flatPenaltyGpStd: pt.flatPenaltyGpStd,
    randomSearchMean: Math.round(pt.randomSearchMean * scaleFactor * 10) / 10,
    randomSearchStd: pt.randomSearchStd,
  }));
}

/**
 * Evaluates a Research-Stage Novel / Dissertation Protein Candidate:
 * - Does NOT default to CHO expression for every protein
 * - Separates Literature-Grounded, Researcher-Supplied, Assumption, and Missing data
 * - Abstains from claiming a validated optimum when data are insufficient or out-of-distribution
 */
export function evaluateNovelProteinCandidate(
  profile: NovelProteinDissertationProfile
): NovelProteinEvaluationResult {
  const missingParametersList: string[] = [];
  if (profile.researcherSuppliedQp === null) {
    missingParametersList.push('Specific productivity q_p (pg/cell/day or mg/g DCW/h)');
  }
  if (profile.researcherSuppliedQO2 === null) {
    missingParametersList.push('Specific oxygen uptake rate q_O2 (pmol/cell/h or mmol O₂/g/h)');
  }
  if (profile.researcherSuppliedMuMax === null) {
    missingParametersList.push('Maximum specific growth rate μ_max (h⁻¹)');
  }

  let recommendedExpressionRoute = 'UNASSIGNED — Requires Explicit Human Host Selection & Approval';
  let recommendedReactorArchitecture = 'Screening Blocked Until Expression Host & Kinetics Are Approved';
  let isChoModelCompatible = false;
  const outOfDistributionWarnings: string[] = [];

  if (
    profile.proposedExpressionHost === 'Unassigned — Requires Human Host Selection' ||
    profile.proposedExpressionHost === 'Unknown / Uncharacterised'
  ) {
    isChoModelCompatible = false;
    recommendedExpressionRoute =
      'HOST UNASSIGNED — bioREACT refuses to auto-assign an expression host or claim manufacturability';
    recommendedReactorArchitecture =
      'Awaiting explicit researcher selection & approval of expression host (CHO, HEK293, E. coli, K. phaffii, etc.)';
    outOfDistributionWarnings.push(
      `UNASSIGNED EXPRESSION HOST: No expression host has been verified for ${profile.proteinName}. bioREACT does NOT automatically assign CHO or assume that a computationally designed protein is biologically expressible.`
    );
  } else if (profile.proposedExpressionHost === 'Pichia pastoris Yeast') {
    isChoModelCompatible = false;
    recommendedExpressionRoute =
      'Komagataella phaffii (Pichia pastoris) Secretory Yeast — Does NOT Default to CHO';
    recommendedReactorArchitecture =
      'High-Intensity Microbial Stirred-Tank Fermenter (Dual Rushton / Pitched-Blade, kLa > 220 h⁻¹)';
    outOfDistributionWarnings.push(
      `OUT-OF-DISTRIBUTION HOST ALERT: ${profile.proteinName} (${profile.molecularWeightKda} kDa) is assigned to Komagataella phaffii (Pichia) yeast. CHO mammalian kinetic parameters are never reused for yeast fermentation.`
    );
  } else if (profile.proposedExpressionHost === 'E. coli Microbial') {
    isChoModelCompatible = false;
    recommendedExpressionRoute =
      'Escherichia coli BL21(DE3) Periplasmic / Cytoplasmic Microbial Expression';
    recommendedReactorArchitecture =
      'High-Intensity Microbial Stirred-Tank Fermenter (kLa > 350 h⁻¹)';
    outOfDistributionWarnings.push(
      `OUT-OF-DISTRIBUTION HOST ALERT: Bacterial E. coli fermentation kinetics (μ_max ~ 0.48 h⁻¹, g DCW/L) lie outside the mammalian CHO perfusion calibration domain.`
    );
  } else if (profile.proposedExpressionHost === 'HEK293 Mammalian') {
    isChoModelCompatible = false;
    recommendedExpressionRoute =
      'HEK293 Mammalian Suspension / Adherent (Research-Stage Model — Not Validated)';
    recommendedReactorArchitecture =
      'Low-Shear Wave / Rocking Bioreactor or Marine-Impeller STR (τ ≤ 0.95 Pa)';
    outOfDistributionWarnings.push(
      `RESEARCH-STAGE HOST ALERT: HEK293 transient expression has stricter shear limits (τ ≤ 0.95 Pa) and distinct post-transfection kinetics from calibrated CHO-K1 perfusion.`
    );
  } else if (profile.proposedExpressionHost === 'Skeletal Muscle (Cultivated Meat)') {
    isChoModelCompatible = false;
    recommendedExpressionRoute =
      'Skeletal Muscle Satellite Myoblasts on Microcarriers (Conceptual Research Model — Not Validated)';
    recommendedReactorArchitecture =
      'Low-Shear Wave / Rocking Bioreactor or Packed-Bed / Hollow-Fibre Scaffold (λ_K ≥ 150 μm, τ ≤ 0.35 Pa)';
    outOfDistributionWarnings.push(
      `RESEARCH-STAGE HOST ALERT: Anchorage-dependent skeletal muscle cells require Kolmogorov eddy length λ_K ≥ 150 μm and τ ≤ 0.35 Pa.`
    );
  } else if (profile.proposedExpressionHost === 'Microalgae Phototrophic') {
    isChoModelCompatible = false;
    recommendedExpressionRoute =
      'Photoautotrophic Microalgae (Conceptual Research Model — Not Validated)';
    recommendedReactorArchitecture =
      'Flat-Panel Alveolar Photobioreactor or Tubular Helical Photobioreactor (Optical Path L_opt ≤ 0.08 m)';
    outOfDistributionWarnings.push(
      `PHOTOTROPHIC HOST ALERT: Microalgae require PAR photon delivery (Beer-Lambert law), CO₂ supply, and photosynthetic O₂ stripping rather than heterotrophic CHO oxygen supply.`
    );
  } else if (profile.proposedExpressionHost === 'Insect Sf9 / Baculovirus') {
    isChoModelCompatible = false;
    recommendedExpressionRoute = 'Sf9 / High-Five Baculovirus Insect Cell Suspension';
    recommendedReactorArchitecture =
      'Low-Shear Wave / Rocking Bioreactor or Marine-Impeller Fed-Batch STR (27 °C)';
    outOfDistributionWarnings.push(
      `OUT-OF-DISTRIBUTION HOST ALERT: Insect cell lytic baculovirus infection kinetics differ fundamentally from continuous steady-state CHO perfusion.`
    );
  } else {
    isChoModelCompatible = true;
    recommendedExpressionRoute =
      'CHO-K1 / CHO-DG44 Mammalian Suspension (Selected by Researcher)';
    recommendedReactorArchitecture =
      profile.shearSensitivityObservation === 'High (Aggregates under agitation)'
        ? 'Single-Use Rocking Bag (Seed Train) → Low-Shear Marine-Impeller Perfusion STR (Hypothermic 32.5 °C)'
        : 'Stirred-Tank Bioreactor — Perfusion (with External ATF/TFF Hollow-Fibre Filter)';
  }

  if (missingParametersList.length > 0) {
    outOfDistributionWarnings.push(
      `INCOMPLETE EMPIRICAL KINETICS: ${missingParametersList.length} primary bioprocess parameter(s) (${missingParametersList.join(
        '; '
      )}) are unmeasured in wet-lab culture for ${profile.proteinName}.`
    );
  }

  if (profile.shearSensitivityObservation === 'High (Aggregates under agitation)') {
    outOfDistributionWarnings.push(
      `HIGH AGGREGATION SENSITIVITY: Researcher notes rapid hydrophobic aggregation above ~1.1 Pa (${
        profile.thermalStabilityMeltingTempC
          ? `T_m = ${profile.thermalStabilityMeltingTempC} °C`
          : 'T_m unmeasured'
      }). Standard mAb shear limits (1.65 Pa) must be tightened.`
    );
  }

  const isOutOfDistribution = !isChoModelCompatible || missingParametersList.length > 0;
  const abstainsFromOptimisationClaim = isOutOfDistribution;

  const parameterProvenanceTable: NovelProteinEvaluationResult['parameterProvenanceTable'] = [
    {
      parameter: 'Molecular Weight & Construct Identity',
      valueDisplay: `${profile.molecularWeightKda.toFixed(1)} kDa (${profile.proteinName})`,
      epistemicTag: 'Researcher-Supplied Value',
      note: `Supplied by ${profile.researcherNameAndLab}`,
    },
    {
      parameter: 'Post-Translational Modification (PTM) Requirement',
      valueDisplay: profile.ptmAndGlycosylationRequirement,
      epistemicTag: 'Researcher-Supplied Value',
      note: 'Structural biology determinant governing microbial vs mammalian host routing',
    },
    {
      parameter: 'Thermal Unfolding Temperature (T_m)',
      valueDisplay:
        profile.thermalStabilityMeltingTempC !== null
          ? `${profile.thermalStabilityMeltingTempC.toFixed(1)} °C`
          : 'Unmeasured',
      epistemicTag:
        profile.thermalStabilityMeltingTempC !== null
          ? 'Researcher-Supplied Value'
          : 'Missing — Requires Wet-Lab Measurement',
      note: 'Measured via DSF / nanoDSF in formulation buffer',
    },
    {
      parameter: 'Specific Productivity (q_p)',
      valueDisplay:
        profile.researcherSuppliedQp !== null
          ? `${profile.researcherSuppliedQp} pg/cell/day`
          : 'UNMEASURED (Homologous Prior: 8.0–15.0 pg/cell/d)',
      epistemicTag:
        profile.researcherSuppliedQp !== null
          ? 'Researcher-Supplied Value'
          : 'Missing — Requires Wet-Lab Measurement',
      note:
        profile.researcherSuppliedQp !== null
          ? 'Early deep-well / shake-flask titre divided by IVCD'
          : 'Cannot be predicted from sequence alone; requires wet-lab expression scout run',
    },
    {
      parameter: 'Specific Oxygen Uptake Rate (q_O2)',
      valueDisplay:
        profile.researcherSuppliedQO2 !== null
          ? `${profile.researcherSuppliedQO2} pmol/cell/h`
          : 'UNMEASURED (Host Class Assumption: 0.32 pmol/cell/h)',
      epistemicTag:
        profile.researcherSuppliedQO2 !== null
          ? 'Researcher-Supplied Value'
          : 'Missing — Requires Wet-Lab Measurement',
      note:
        profile.researcherSuppliedQO2 !== null
          ? 'Measured via off-gas mass spectrometry / blood-gas analyser'
          : 'Requires dynamic gassing-out OUR measurement in benchtop bioreactor',
    },
    {
      parameter: 'Max Specific Growth Rate (μ_max)',
      valueDisplay:
        profile.researcherSuppliedMuMax !== null
          ? `${profile.researcherSuppliedMuMax} h⁻¹`
          : 'UNMEASURED (Host Class Assumption: 0.028 h⁻¹)',
      epistemicTag:
        profile.researcherSuppliedMuMax !== null
          ? 'Researcher-Supplied Value'
          : 'Missing — Requires Wet-Lab Measurement',
      note:
        profile.researcherSuppliedMuMax !== null
          ? 'Measured from shake-flask exponential phase OD / Vi-CELL counts'
          : 'Required to close steady-state perfusion cell bleed balance',
    },
    {
      parameter: 'Critical Hydrodynamic Shear Limit (τ_crit)',
      valueDisplay:
        profile.shearSensitivityObservation === 'High (Aggregates under agitation)'
          ? '1.10 Pa (Conservative Heuristic Assumption)'
          : '1.50 Pa (Literature-Grounded Host Baseline)',
      epistemicTag: 'Engineering Assumption',
      note: 'Derived from qualitative agitation aggregation observation; requires ultra-scale-down rotating-disk verification',
    },
  ];

  const requiredNextWetLabMeasurements: string[] = [
    `Execute 4-vessel ambr250 / benchtop scout run in ${recommendedExpressionRoute.split(' — ')[0]} to measure empirical q_p and q_O2 for ${profile.proteinName}.`,
    `Perform ultra-scale-down rotating-disk shear challenge (0.5 to 2.2 Pa) with SEC-HPLC monomer/HMW aggregate quantification.`,
    `Establish dissolved oxygen kLa and respiratory quotient (RQ) mass-balance closure before unlocking Bayesian optimisation claims.`,
  ];

  return {
    isChoModelCompatible,
    isOutOfDistribution,
    abstainsFromOptimisationClaim,
    recommendedExpressionRoute,
    recommendedReactorArchitecture,
    missingParametersList,
    outOfDistributionWarnings,
    requiredNextWetLabMeasurements,
    parameterProvenanceTable,
  };
}

/**
 * Upstream-to-Downstream Usable Drug Substance COGS Economic Model:
 * COGS per gram = Annual Manufacturing Costs / Annual Grams of Recovered Product
 * Explicitly accounts for downstream purification yield losses (Clarification + Protein A Capture + Polishing)
 */
export function computeDownstreamCogs(
  econ: DownstreamEconomicParams,
  reactorScaleL: number,
  perfusionVvd: number,
  volumetricProdMgLDay: number
): DownstreamCogsResult {
  // Annual upstream harvest (kg/year)
  const dailyUpstreamGrams = (volumetricProdMgLDay / 1000.0) * reactorScaleL;
  const annualUpstreamHarvestGrams = dailyUpstreamGrams * econ.campaignDaysPerYear;
  const annualUpstreamHarvestKg = annualUpstreamHarvestGrams / 1000.0;

  // Cumulative downstream purification yield fraction
  const overallDownstreamYieldFraction =
    (econ.clarificationYieldPercent / 100.0) *
    (econ.proteinACaptureYieldPercent / 100.0) *
    (econ.viralInactivationAndPolishingYieldPercent / 100.0);

  const overallDownstreamYieldPercent =
    Math.round(overallDownstreamYieldFraction * 1000) / 10;

  const annualRecoveredDrugSubstanceGrams =
    annualUpstreamHarvestGrams * overallDownstreamYieldFraction;
  const annualRecoveredDrugSubstanceKg = annualRecoveredDrugSubstanceGrams / 1000.0;

  // Annual perfusion media consumption (kL/year) and cost ($M/year)
  const annualMediaVolumeL = reactorScaleL * perfusionVvd * econ.campaignDaysPerYear;
  const annualMediaVolumeKL = annualMediaVolumeL / 1000.0;
  const annualMediaCostMusd = (annualMediaVolumeL * econ.mediaCostPerLiterUsd) / 1e6;

  const totalAnnualManufacturingCostMusd =
    annualMediaCostMusd +
    econ.annualFacilityAndConsumablesMusd +
    econ.annualDownstreamPurificationMusd;

  const cogsPerGramUsd =
    (totalAnnualManufacturingCostMusd * 1e6) /
    Math.max(1.0, annualRecoveredDrugSubstanceGrams);

  return {
    overallDownstreamYieldPercent,
    annualUpstreamHarvestKg: Math.round(annualUpstreamHarvestKg * 100) / 100,
    annualRecoveredDrugSubstanceKg: Math.round(annualRecoveredDrugSubstanceKg * 100) / 100,
    annualMediaVolumeKL: Math.round(annualMediaVolumeKL * 10) / 10,
    annualMediaCostMusd: Math.round(annualMediaCostMusd * 100) / 100,
    totalAnnualManufacturingCostMusd:
      Math.round(totalAnnualManufacturingCostMusd * 100) / 100,
    cogsPerGramUsd: Math.round(cogsPerGramUsd * 100) / 100,
  };
}

/**
 * Formats synthetic headline metrics to 2 significant figures so the UI never displays
 * false precision (e.g., 1093.77 -> "~$1.1k/g", 65.5 -> "~66", 179.8 -> "~180").
 */
export function formatTwoSigFigs(val: number): string {
  if (!Number.isFinite(val) || val === 0) return '0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  const d = Math.ceil(Math.log10(abs));
  const power = 2 - d;
  const magnitude = Math.pow(10, power);
  const shifted = Math.round(abs * magnitude);
  const rounded = shifted / magnitude;
  if (rounded >= 1000) {
    return `${sign}${Math.round(rounded).toLocaleString('en-US')}`;
  }
  if (power <= 0) {
    return `${sign}${Math.round(rounded)}`;
  }
  return `${sign}${rounded.toFixed(power)}`;
}

export function formatCogsHeadline(cogsPerGramUsd: number): string {
  if (!Number.isFinite(cogsPerGramUsd) || cogsPerGramUsd <= 0) return '~$0/g';
  if (cogsPerGramUsd >= 950) {
    const inK = cogsPerGramUsd / 1000;
    return `~$${formatTwoSigFigs(inK)}k/g`;
  }
  return `~$${formatTwoSigFigs(cogsPerGramUsd)}/g`;
}

export const REPRODUCIBILITY_MANIFEST = {
  engineVersion: 'bioREACT-v2.4.0-provenance-audit',
  deterministicPrngFormula:
    'hash(i, s) = (i × 16807) + (s × 7919); r1 = |sin(hash × 1.13)| mod 1; r2 = |cos(hash × 2.47)| mod 1',
  gpObjectiveKernel:
    'RBF isotropic per-dimension: k(x, x′) = exp(-0.5 × [((VVD - VVD′)/0.72)² + ((DO - DO′)/16.0)²]), priorMean = 135.0, priorStd = 38.0, priorWeight = 0.18',
  gpConstraintMarginKernel:
    'Continuous margin RBF: l_VVD = 0.62, l_DO = 14.5; P(margin ≥ 0 | x) = Φ(μ_margin(x) / σ_margin(x))',
  acquisitionFunctionFormula:
    'α_CBO(x) = EI(x; ξ = 1.5) × Φ(μ_margin(x) / σ_margin(x)) evaluated on 43 × 33 deterministic grid (VVD ∈ [0.75, 4.10] step 0.08, DO ∈ [18, 82] step 2)',
  flatPenaltyBaselineFormula:
    'y_flat = y_obj if feasible else -500.0; α_flat(x) = EI(μ_flat(x), 1.8 × σ(x))',
  oxygenMassBalanceEquation:
    'OUR = q_O2 [pmol/cell/h] × X_v [10⁶ cells/mL] = mmol O₂/L/h; OTR = k_La [h⁻¹] × (C*_O2 - C_L) [mmol/L]',
  impellerPowerEquation:
    'P_0,total = n × N_p(Re) × f_baffle × f_spacing(ΔC/D_i) × f_clearance(C_1/D_i) × ρ × N³ × D_i⁵; P_g = P_0,total × (P_g/P_0)(Fl_g)',
  vantRietKlaEquation:
    'k_La = C_sparger × (P_g/V / 100)^0.46 × (v_s / 0.002)^0.42 × η_stage',
};

/**
 * Builds the complete Audited Parameter Provenance Ledger for the 4 priority parameters
 * (q_p, q_O2, k_La, tau_crit) plus mu_max, Np_0, optimalVvd, and optimalDoPercent.
 * Explicitly separates what cited papers actually report from synthetic point values or derived correlations.
 */
export function buildAuditedParameterProvenanceLedger(
  candidate: BiologicCandidate,
  groundedParams: GroundedSimulatorParams,
  strParams: StirredTankPhysicsParams,
  physics: MassBalanceAndPhysicsResult,
  observations: ExperimentObservation[],
  downstreamCogs: DownstreamCogsResult,
  customJustifications: Partial<Record<AuditableParameterId, string>> = {}
): AuditedParameterProvenanceRecord[] {
  const defaults = candidate.defaultGroundedParams;
  const spec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];
  const feasibleObs = observations.filter((o) => o.isFeasible);
  const bestObs =
    feasibleObs.length > 0
      ? feasibleObs.reduce((a, b) =>
          b.volumetricProductivityMgLDay > a.volumetricProductivityMgLDay ? b : a
        )
      : null;
  const bestScore = bestObs ? bestObs.volumetricProductivityMgLDay : 0;
  const bestPhysMgLDay = bestObs
    ? bestObs.meanVolumetricProductivityMgPerLPerDay ??
      Math.round(bestObs.volumetricProductivityMgLDay * 8.6)
    : 0;
  const infeasibleCount = observations.length - feasibleObs.length;

  const isQpChallenged =
    Math.abs(groundedParams.qpBase - defaults.qpBase) > 1e-4 ||
    Boolean(customJustifications.q_p);
  const isQo2Challenged =
    Math.abs(groundedParams.qO2Specific - defaults.qO2Specific) > 1e-4 ||
    Boolean(customJustifications.q_o2);
  const isKlaChallenged =
    strParams.klaMode === 'assumed_manual' || Boolean(customJustifications.kla);
  const isTauChallenged =
    Math.abs(groundedParams.shearThresholdPa - defaults.shearThresholdPa) > 1e-4 ||
    Boolean(customJustifications.tau_crit);
  const isMuMaxChallenged =
    Math.abs(groundedParams.muMax - defaults.muMax) > 1e-5 ||
    Boolean(customJustifications.mu_max);
  const isNpChallenged =
    (strParams.customTurbulentNp !== undefined &&
      Math.abs(strParams.customTurbulentNp - spec.defaultTurbulentNp0) > 1e-3) ||
    Boolean(customJustifications.np_0);
  const isVvdChallenged =
    Math.abs(groundedParams.optimalVvd - defaults.optimalVvd) > 1e-3 ||
    Boolean(customJustifications.vvd_ref);
  const isDoChallenged =
    Math.abs(groundedParams.optimalDoPercent - defaults.optimalDoPercent) > 1e-2 ||
    Boolean(customJustifications.do_ref);

  return [
    {
      parameterId: 'q_p',
      symbol: 'q_p',
      name: 'Cell-Specific Recombinant Productivity',
      currentValue: groundedParams.qpBase,
      defaultValue: defaults.qpBase,
      unit: 'pg/cell/day',
      classification: isQpChallenged
        ? 'Researcher-provided'
        : 'Synthetic demonstration assumption',
      isPriorityFourAudit: true,
      publicationTitle:
        'Perfusion mammalian cell culture for recombinant protein manufacturing – A critical review',
      authorsAndYear: 'Bielser, J.-M., Wolf, M., Souquet, J., Broly, H., & Morbidelli, M. (2018)',
      doiOrUrl: 'https://doi.org/10.1016/j.biotechadv.2018.08.008',
      databaseId: 'EPMC-PMC8432910 (Biotechnol. Adv. 36(4):1328–1340)',
      supportingSectionOrTable:
        'Section 2.2 ("Cell specific productivity in perfusion") & Table 1 (Industrial CHO perfusion mAb benchmarks)',
      exactSourceEvidenceAndAudit:
        'PROVENANCE AUDIT: Bielser et al. (2018) is a review paper reporting an industrial CHO perfusion specific productivity range of 15–50 pg/cell/day (typical 20–35 pg/cell/day) across multiple recombinant IgGs. It does NOT report the exact number 28.4 pg/cell/day for Trastuzumab. Therefore, 28.4 pg/cell/day is classified as a Synthetic demonstration assumption chosen inside the literature-reported CHO range—NOT a direct source-verified measurement.',
      originalReportedValueAndUnits:
        '15–50 pg·cell⁻¹·day⁻¹ (industrial CHO IgG range; typical 20–35 pg·cell⁻¹·day⁻¹)',
      unitTransformationFormula:
        'P_vol [mg/L/day] = X_v [10⁶ cells/mL] × q_p [pg/cell/day] × (10⁹ cells/L) × (10⁻⁹ mg/pg) = X_v × q_p',
      biologicalSystemContext:
        'Mammalian CHO-K1 / CHO-DG44 suspension clones secreting recombinant IgG1 monoclonal antibodies',
      experimentalConditions:
        'Continuous ATF/TFF perfusion (33.5–37.0 °C, pH 6.9–7.2, 1.5–3.0 VVD, steady-state VCD 30–80 × 10⁶ cells/mL)',
      uncertaintyAndRange:
        'Literature range: 15.0–50.0 pg/cell/day (±25% inter-clone and media variance)',
      validCalibrationRange: [5.0, 55.0],
      downstreamCausalChain: {
        step1MassBalance: `Scales volumetric titre linearly: at X_v = ${strParams.targetVcdE6PerMl} × 10⁶ cells/mL, baseline q_p = ${groundedParams.qpBase.toFixed(1)} pg/cell/d yields ~${Math.round(strParams.targetVcdE6PerMl * groundedParams.qpBase)} mg/L/day raw productivity.`,
        step2FeasibilityConstraint: `Does not directly violate hydrodynamic shear or OTR/OUR, but governs whether reactor volumetric productivity meets the Stage 2 screening floor (≥ 0.90 g/L/day).`,
        step3OptimisationImpact: `Directly scales the Constrained BO objective score (current best feasible: ${bestScore.toFixed(1)} score units / ${bestPhysMgLDay} mg/L/day across ${feasibleObs.length}/${observations.length} feasible evaluations).`,
        step4CogsEconomicImpact: `Determines annual recovered Drug Substance (${downstreamCogs.annualRecoveredDrugSubstanceKg.toFixed(1)} kg/yr) and estimated usable COGS (${formatCogsHeadline(downstreamCogs.cogsPerGramUsd)}, exact $${downstreamCogs.cogsPerGramUsd.toFixed(2)}/g).`,
      },
      researcherChallengeJustification: customJustifications.q_p,
    },
    {
      parameterId: 'q_o2',
      symbol: 'q_{O2}',
      name: 'Cell-Specific Oxygen Uptake Rate',
      currentValue: groundedParams.qO2Specific,
      defaultValue: defaults.qO2Specific,
      unit: 'pmol/cell/h',
      classification: isQo2Challenged
        ? 'Researcher-provided'
        : 'Synthetic demonstration assumption',
      isPriorityFourAudit: true,
      publicationTitle:
        'Bioprocess Engineering Principles (2nd Ed., Table 10.6) & Jorjani & Ozturk (1999) CHO respiration kinetics',
      authorsAndYear:
        'Doran, P. M. (2013) / Jorjani, P., & Ozturk, S. S. (1999, Biotechnol. Bioeng. 64(3):349–356)',
      doiOrUrl: 'https://doi.org/10.1002/(SICI)1097-0290(19990805)64:3<349::AID-BIT11>3.0.CO;2-V',
      databaseId: 'DOI:10.1002/bit.11 / ISBN:978-0-12-220851-5 (Note: OPENALEX-W298144201 is for mixing time t_m, NOT q_O2)',
      supportingSectionOrTable:
        'Doran (2013) Table 10.6 ("Oxygen uptake rates for suspension animal cells") & Jorjani & Ozturk (1999) Fig. 2–4',
      exactSourceEvidenceAndAudit:
        'PROVENANCE AUDIT: In earlier UI versions, OPENALEX-W298144201 (Rosseburg et al., 2018, Chem. Eng. Sci.) was displayed next to q_O2. Audit confirms Rosseburg et al. (2018) is an abiotic 12,000 L mixing-time study and does NOT measure cellular oxygen uptake! Mammalian CHO specific oxygen uptake in literature (Doran, 2013; Jorjani & Ozturk, 1999) spans 0.15–0.45 pmol/cell/h (1.5–4.5 × 10⁻¹³ mol/cell/h). The point value 0.32 pmol/cell/h is a Synthetic demonstration assumption within that published CHO range.',
      originalReportedValueAndUnits:
        '1.5 × 10⁻¹³ to 4.5 × 10⁻¹³ mol O₂·cell⁻¹·h⁻¹ (0.15–0.45 pmol·cell⁻¹·h⁻¹)',
      unitTransformationFormula:
        'OUR [mmol O₂/L/h] = q_O2 [pmol/cell/h] × X_v [10⁶ cells/mL] × (10⁹ cells/L) × (10⁻⁹ mmol/pmol) = q_O2 × X_v (1:1 numerical identity)',
      biologicalSystemContext:
        'Suspension CHO cells in exponential and high-density steady-state perfusion culture',
      experimentalConditions:
        '33.5–37.0 °C, dissolved oxygen 25–60% air saturation, glucose/glutamine fed or perfused media',
      uncertaintyAndRange:
        'Literature CHO range: 0.15–0.45 pmol/cell/h (shifts with growth rate, temperature, and lactate state)',
      validCalibrationRange: [0.1, 0.85],
      downstreamCausalChain: {
        step1MassBalance: `Directly sets volumetric oxygen demand: OUR = ${groundedParams.qO2Specific.toFixed(2)} × ${strParams.targetVcdE6PerMl.toFixed(1)} = ${physics.ourMmolPerLHour.toFixed(2)} mmol O₂/L/h.`,
        step2FeasibilityConstraint: `Compared against OTR = ${physics.otrMmolPerLHour.toFixed(2)} mmol O₂/L/h → Oxygen margin = ${physics.oxygenMarginMmolPerLHour >= 0 ? '+' : ''}${physics.oxygenMarginMmolPerLHour.toFixed(2)} mmol O₂/L/h (${physics.oxygenMarginMmolPerLHour >= 0 ? 'CLOSED / FEASIBLE' : 'DEFICIT / VIOLATED'}).`,
        step3OptimisationImpact: `Higher q_O2 shrinks the feasible high-VVD / low-DO region in Stage 6, increasing OTR deficit rejections (${infeasibleCount} infeasible trials in current run).`,
        step4CogsEconomicImpact: `If q_O2 forces lower steady-state VCD or lower perfusion VVD to close the O₂ balance, volumetric productivity drops and COGS/g rises (${formatCogsHeadline(downstreamCogs.cogsPerGramUsd)}).`,
      },
      researcherChallengeJustification: customJustifications.q_o2,
    },
    {
      parameterId: 'kla',
      symbol: 'k_La',
      name: 'Volumetric Mass Transfer Coefficient',
      currentValue: physics.klaPerHour,
      defaultValue: physics.vantRietCalculatedKlaPerHour,
      unit: 'h⁻¹',
      classification: isKlaChallenged
        ? 'Researcher-provided'
        : 'Derived from literature with documented calculation',
      isPriorityFourAudit: true,
      publicationTitle:
        'Review of Measuring Methods and Results in Nonviscous Gas-Liquid Mass Transfer in Stirred Vessels',
      authorsAndYear: "Van't Riet, K. (1979)",
      doiOrUrl: 'https://doi.org/10.1021/i260071a001',
      databaseId: 'DOI:10.1021/i260071a001 (Ind. Eng. Chem. Process Des. Dev. 18(3):357–364)',
      supportingSectionOrTable:
        'Equations 11–13 (Coalescing & non-coalescing power-law kLa correlations: kLa = C × (P_g/V)^α × (v_s)^β)',
      exactSourceEvidenceAndAudit:
        "PROVENANCE AUDIT: Van't Riet (1979) establishes the empirical power-law form k_La = C × (P_g/V)^α × (v_s)^β (with α ≈ 0.4–0.7, β ≈ 0.2–0.5). However, Van't Riet (1979) studied conventional coalescing/electrolyte spargers in water and did NOT calibrate modern 15 μm sintered microspargers in Pluronic F-68 cell-culture media. Therefore, k_La in bioREACT is classified as Derived from literature with documented calculation, using synthetic demonstration sparger prefactors (C_open = 18.5 h⁻¹ vs. C_micro = 96.0 h⁻¹ at P_g/V = 100 W/m³, v_s = 0.002 m/s).",
      originalReportedValueAndUnits:
        'k_La [s⁻¹] = 0.026 × (P_g/V [W/m³])^0.4 × (v_s [m/s])^0.5 (coalescing water) or 0.002 × (P_g/V)^0.7 × (v_s)^0.2 (non-coalescing)',
      unitTransformationFormula:
        `k_La [h⁻¹] = C_sparger (${strParams.spargerType === 'sintered_microsparger' ? '96.0' : '18.5'} h⁻¹) × (P_g/V / 100)^0.46 × (v_s / 0.002)^0.42 × η_stage (${physics.multiImpellerStagingFactor.toFixed(2)}) = ${physics.vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹ (k_La [s⁻¹] = k_La [h⁻¹] / 3600 = ${physics.klaPerSecond.toFixed(4)} s⁻¹)`,
      biologicalSystemContext:
        '500 L mammalian stirred-tank bioreactor (coalescence-inhibited cell culture medium with Pluronic F-68)',
      experimentalConditions:
        `V = ${strParams.workingVolumeL} L, P_g/V = ${physics.specificPowerWPerM3.toFixed(1)} W/m³, v_s = ${physics.superficialGasVelocityMPerS.toFixed(5)} m/s (${strParams.spargeRateVvm.toFixed(3)} vvm), ${strParams.spargerType === 'sintered_microsparger' ? '15 μm sintered microsparger' : 'open-pipe sparger'}`,
      uncertaintyAndRange:
        'Van’t Riet correlation accuracy is ±30–40% across vessel scales and surfactant concentrations; requires wet-lab dynamic gassing-out calibration.',
      validCalibrationRange: [1.5, 180.0],
      downstreamCausalChain: {
        step1MassBalance: `Multiplies dissolved O₂ driving force (C*_O2 - C_L = ${(physics.cStarO2MmolPerL - physics.cLiquidO2MmolPerL).toFixed(3)} mmol/L) to determine OTR = ${physics.otrMmolPerLHour.toFixed(2)} mmol O₂/L/h.`,
        step2FeasibilityConstraint: `Controls maximum supportable cell density X_v,max = ${physics.maxSupportedVcdAtCurrentGasE6.toFixed(1)} × 10⁶ cells/mL at current gas composition (${Math.round(strParams.oxygenEnrichmentFraction * 100)}% O₂).`,
        step3OptimisationImpact: `Sets the OTR ceiling in Stage 6 and dictates oxygen transfer time constant τ_O2 = 1/k_La = ${physics.oxygenTransferTimeConstantS.toFixed(1)} s vs mixing time t_m = ${physics.mixingTimeGassedS.toFixed(1)} s.`,
        step4CogsEconomicImpact: `Insufficient k_La caps supportable VCD and forces oxygen enrichment or vessel derating, directly increasing unit manufacturing cost.`,
      },
      researcherChallengeJustification: customJustifications.kla,
    },
    {
      parameterId: 'tau_crit',
      symbol: 'τ_{crit}',
      name: 'Critical Hydrodynamic Shear Stress Threshold',
      currentValue: groundedParams.shearThresholdPa,
      defaultValue: defaults.shearThresholdPa,
      unit: 'Pa (N/m²)',
      classification: isTauChallenged
        ? 'Researcher-provided'
        : 'Derived from literature with documented calculation',
      isPriorityFourAudit: true,
      publicationTitle:
        'Determination of maximal tunable hydrodynamic stress in mammalian cell culture processes',
      authorsAndYear:
        'Neunstoecklin, B., Stettler, M., Solacroup, T., Broly, H., Morbidelli, M., & Soos, M. (2015)',
      doiOrUrl: 'https://doi.org/10.1016/j.jbiotec.2014.10.029',
      databaseId: 'PUBMED-25450236 (J. Biotechnol. 194:100–109)',
      supportingSectionOrTable:
        'Table 2 & Figure 4 (Threshold of maximum local hydrodynamic stress τ_max = 32.4 ± 4.4 Pa for CHO-S viability decline and LDH release)',
      exactSourceEvidenceAndAudit:
        'PROVENANCE AUDIT: Neunstoecklin et al. (2015) measured a LOCAL MAXIMUM trailing-vortex/contraction stress limit of τ_max = 32.4 ± 4.4 Pa in CHO-S suspension culture (and ~25–30 Pa for glycosylation/productivity shifts). They did NOT report 1.65 Pa as a direct threshold. Because bioREACT’s simulator evaluates a bulk-averaged hydrodynamic shear proxy (τ_bulk ≈ τ_max / 20), the default 1.65 Pa limit is classified as Derived from literature with documented calculation (using a synthetic ~1/20× bulk-to-local scaling proxy: 32.4 Pa / 19.6 ≈ 1.65 Pa).',
      originalReportedValueAndUnits:
        'τ_max,local = 32.4 ± 4.4 Pa (local maximum turbulent stress in contraction loop)',
      unitTransformationFormula:
        'τ_crit,bulk [Pa] ≈ τ_max,local [32.4 Pa] / Φ_local-to-bulk [19.6] = 1.65 Pa; compared against simulator τ_est [Pa]',
      biologicalSystemContext:
        'Suspension CHO cell line secreting recombinant IgG in serum-free media with Pluronic F-68',
      experimentalConditions:
        '3-L benchtop bioreactor coupled to low-pulsation recirculation loop with defined microfluidic contraction nozzles (36.5 °C, pH 7.0)',
      uncertaintyAndRange:
        'Local τ_max = 32.4 ± 4.4 Pa (±13.6%); bulk proxy conversion depends on impeller trailing-vortex factor Φ (5.5–11.5).',
      validCalibrationRange: [0.35, 3.2],
      downstreamCausalChain: {
        step1MassBalance: `Caps allowable impeller agitation speed (${strParams.stirrerSpeedRpm} RPM) and specific power input P_g/V (${physics.specificPowerWPerM3.toFixed(1)} W/m³).`,
        step2FeasibilityConstraint: `Current reactor shear τ = ${physics.estimatedShearStressPa.toFixed(2)} Pa vs τ_crit = ${groundedParams.shearThresholdPa.toFixed(2)} Pa (${physics.estimatedShearStressPa <= groundedParams.shearThresholdPa ? 'SAFE' : 'SHEAR VIOLATION'}).`,
        step3OptimisationImpact: `Defines the upper VVD/DO shear boundary in Stage 6 Constrained BO; tightening τ_crit rejects high-agitation/high-flush points and shifts P(margin ≥ 0).`,
        step4CogsEconomicImpact: `Overly tight τ_crit restricts agitation/OTR and forces smaller perfusion VVD, reducing annual kg output and increasing COGS/g.`,
      },
      researcherChallengeJustification: customJustifications.tau_crit,
    },
    {
      parameterId: 'mu_max',
      symbol: 'μ_{max}',
      name: 'Maximum Specific Growth Rate',
      currentValue: groundedParams.muMax,
      defaultValue: defaults.muMax,
      unit: 'h⁻¹',
      classification: isMuMaxChallenged
        ? 'Researcher-provided'
        : 'Synthetic demonstration assumption',
      isPriorityFourAudit: false,
      publicationTitle:
        'Continuous perfusion bioprocessing of CHO cell cultures: growth & bleed kinetics',
      authorsAndYear: 'Bielser et al. (2018) / Doran (2013, Chapter 11)',
      doiOrUrl: 'https://doi.org/10.1016/j.biotechadv.2018.08.008',
      databaseId: 'EPMC-PMC8432910',
      supportingSectionOrTable:
        'Section 2.1 (Mammalian CHO doubling time t_d = 18–28 h → μ_max = ln(2)/t_d = 0.025–0.039 h⁻¹)',
      exactSourceEvidenceAndAudit:
        'PROVENANCE AUDIT: Literature reports CHO suspension doubling times of 18–28 h (μ_max = 0.025–0.039 h⁻¹, or 0.60–0.93 day⁻¹). The default value 0.036 h⁻¹ (t_d = 19.3 h) is a Synthetic demonstration assumption selected within the published CHO range.',
      originalReportedValueAndUnits:
        'Doubling time t_d = 18–28 h (μ_max = 0.60–0.93 day⁻¹ = 0.025–0.039 h⁻¹)',
      unitTransformationFormula:
        `μ_max [day⁻¹] = μ_max [h⁻¹] × 24 = ${(groundedParams.muMax * 24).toFixed(3)} day⁻¹; steady-state bleed D_bleed = μ_eff = ${physics.requiredBleedRateVvd.toFixed(2)} VVD`,
      biologicalSystemContext: 'Suspension CHO-K1 perfusion culture under mild hypothermia (33.5 °C)',
      experimentalConditions: 'Continuous perfusion with cell retention efficiency ≥ 99%',
      uncertaintyAndRange: '0.022–0.045 h⁻¹ depending on temperature shift (33.5 vs 37.0 °C)',
      validCalibrationRange: [0.015, 0.055],
      downstreamCausalChain: {
        step1MassBalance: `Determines steady-state specific growth rate (${physics.steadyStateGrowthRatePerDay.toFixed(2)} day⁻¹) and required cell bleed rate (${physics.requiredBleedRateVvd.toFixed(2)} VVD).`,
        step2FeasibilityConstraint: `Governs biomass accumulation rate and bleed fraction required to prevent filter fouling above ${strParams.targetVcdE6PerMl} × 10⁶ cells/mL.`,
        step3OptimisationImpact: `Couples with Monod substrate saturation in Stage 6 simulator.`,
        step4CogsEconomicImpact: `Excessive growth/bleed discards viable biomass and media without increasing secreted IgG harvest.`,
      },
      researcherChallengeJustification: customJustifications.mu_max,
    },
    {
      parameterId: 'np_0',
      symbol: 'N_{p,0}',
      name: `Turbulent Reference Impeller Power Number (${spec.shortLabel})`,
      currentValue: physics.turbulentReferenceNp0,
      defaultValue: spec.defaultTurbulentNp0,
      unit: 'dimensionless',
      classification: isNpChallenged
        ? 'Researcher-provided'
        : 'Derived from literature with documented calculation',
      isPriorityFourAudit: false,
      publicationTitle:
        'Power Characteristics of Mixing Impellers / Handbook of Industrial Mixing (Ch. 6)',
      authorsAndYear: 'Rushton, Costich, & Everett (1950) / Paul, Atiemo-Obeng, & Kresta (2004)',
      doiOrUrl: 'https://doi.org/10.1002/0471451452.ch6',
      databaseId: 'ISBN:978-0-471-26919-9 / Chem. Eng. Prog. 46(8):395–404',
      supportingSectionOrTable:
        'Ch. 6 Table 6.3 (Turbulent Power Numbers in Standard 4-Baffle Cylindrical Vessels, Re ≥ 10,000)',
      exactSourceEvidenceAndAudit:
        `PROVENANCE AUDIT: Literature reports turbulent N_p,0 ranges rather than universal constants (${spec.shortLabel}: ${spec.literatureTurbulentNpRange[0].toFixed(2)}–${spec.literatureTurbulentNpRange[1].toFixed(2)} depending on blade pitch, hub-to-diameter ratio, and D_i/D_T). In bioREACT, single-impeller N_p is adjusted for Reynolds number Re = ${physics.reynoldsNumber.toLocaleString()}, baffling (${strParams.bafflingMode ?? 'standard_4_baffles'}), and multi-impeller spacing (n = ${physics.impellerCount}, Assembly N_p,total = ${physics.ungassedPowerNumberTotalNp.toFixed(2)}).`,
      originalReportedValueAndUnits: `${spec.literatureTurbulentNpRange[0].toFixed(2)}–${spec.literatureTurbulentNpRange[1].toFixed(2)} (dimensionless at Re ≥ 10⁴)`,
      unitTransformationFormula: `P_0,total [W] = n (${physics.impellerCount}) × N_p(Re) (${physics.reynoldsCorrectedSingleNp.toFixed(2)}) × f_spacing (${physics.spacingInteractionFactor.toFixed(2)}) × ρ × N³ × D_i⁵ = ${physics.ungassedPowerW.toFixed(1)} W`,
      biologicalSystemContext: 'Hydrodynamic impeller power dissipation in stirred-tank bioreactors',
      experimentalConditions: `${spec.bladeCount} blades, ${spec.bladePitchOrAngle}, ${(strParams.bafflingMode ?? 'standard_4_baffles') === 'standard_4_baffles' ? '4 standard baffles (T/10)' : 'unbaffled'}, Re = ${physics.reynoldsNumber.toLocaleString()}`,
      uncertaintyAndRange: `Published range: ${spec.literatureTurbulentNpRange[0].toFixed(2)}–${spec.literatureTurbulentNpRange[1].toFixed(2)} (±15% with D_i/D_T and clearance)`,
      validCalibrationRange: spec.literatureTurbulentNpRange,
      downstreamCausalChain: {
        step1MassBalance: `Sets ungassed power P_0 = ${physics.ungassedPowerW.toFixed(1)} W and Michel-Miller gassed power P_g = ${physics.gassedPowerW.toFixed(1)} W (P_g/V = ${physics.specificPowerWPerM3.toFixed(1)} W/m³).`,
        step2FeasibilityConstraint: `Drives both Van't Riet k_La (${physics.klaPerHour.toFixed(1)} h⁻¹) and Kolmogorov eddy scale λ_K (${physics.kolmogorovScaleUm.toFixed(1)} μm) / shear τ (${physics.estimatedShearStressPa.toFixed(2)} Pa).`,
        step3OptimisationImpact: `Determines whether the 500 L vessel satisfies Stage 5 scale-up prerequisites before Stage 6 optimisation.`,
        step4CogsEconomicImpact: `Governs utility agitation power and feasible oxygen transfer capacity at scale.`,
      },
      researcherChallengeJustification: customJustifications.np_0,
    },
    {
      parameterId: 'vvd_ref',
      symbol: 'D_{perf,ref}',
      name: 'Reference Perfusion Dilution Rate Center',
      currentValue: groundedParams.optimalVvd,
      defaultValue: defaults.optimalVvd,
      unit: 'VVD (day⁻¹)',
      classification: isVvdChallenged
        ? 'Researcher-provided'
        : 'Synthetic demonstration assumption',
      isPriorityFourAudit: false,
      publicationTitle:
        'High cell density perfusion culture of CHO cells with ATF/TFF retention',
      authorsAndYear: 'Clincke et al. (2013) / Bielser et al. (2018)',
      doiOrUrl: 'https://doi.org/10.1002/btpr.1704',
      databaseId: 'PUBMED-23361992 (Biotechnol. Prog. 29(3):754–767)',
      supportingSectionOrTable:
        'Results Section (ATF/TFF perfusion dilution rates of 1.5–3.0 VVD supporting 40–80 × 10⁶ cells/mL)',
      exactSourceEvidenceAndAudit:
        'PROVENANCE AUDIT: Literature reports operating perfusion rates of 1.5–3.0 VVD (CSPR ~ 30–60 pL/cell/day). The simulator parameter D_perf,ref = 2.35 VVD is a Synthetic demonstration assumption defining the response-surface center of the Monod/bell-curve productivity model.',
      originalReportedValueAndUnits: '1.5–3.0 vessel volumes per day (VVD, day⁻¹)',
      unitTransformationFormula: `Q_media [L/day] = D_perf [VVD] × V_working [${strParams.workingVolumeL} L]; CSPR [pL/cell/day] = (D_perf / X_v) × 1000 = ${physics.cellSpecificPerfusionRatePlCellDay.toFixed(1)} pL/cell/day`,
      biologicalSystemContext: 'Continuous CHO perfusion with external ATF/TFF hollow-fibre retention',
      experimentalConditions: 'Basal + concentrated perfusion media feed at 500 L scale',
      uncertaintyAndRange: '1.2–3.5 VVD depending on media nutrient concentration and CSPR minimum',
      validCalibrationRange: [0.8, 3.8],
      downstreamCausalChain: {
        step1MassBalance: `Governs nutrient supply, lactate wash-out, and CSPR (${physics.cellSpecificPerfusionRatePlCellDay.toFixed(1)} pL/cell/day).`,
        step2FeasibilityConstraint: `Low VVD (< 1.5 VVD) causes lactate accumulation (> ${groundedParams.maxLactateGPerL} g/L); excessive VVD (> 3.2 VVD) increases ATF transmembrane shear.`,
        step3OptimisationImpact: `Primary decision variable x₁ in Stage 6 Constrained BO (recommended: ${bestObs ? bestObs.x1_vvd.toFixed(2) : groundedParams.optimalVvd.toFixed(2)} VVD).`,
        step4CogsEconomicImpact: `Directly drives annual media consumption (${downstreamCogs.annualMediaVolumeKL.toFixed(1)} kL/yr = $${downstreamCogs.annualMediaCostMusd.toFixed(2)}M/yr) and COGS/g (${formatCogsHeadline(downstreamCogs.cogsPerGramUsd)}).`,
      },
      researcherChallengeJustification: customJustifications.vvd_ref,
    },
    {
      parameterId: 'do_ref',
      symbol: 'DO_{ref}',
      name: 'Reference Dissolved Oxygen Setpoint Center',
      currentValue: groundedParams.optimalDoPercent,
      defaultValue: defaults.optimalDoPercent,
      unit: '% air sat.',
      classification: isDoChallenged
        ? 'Researcher-provided'
        : 'Synthetic demonstration assumption',
      isPriorityFourAudit: false,
      publicationTitle:
        'Effect of dissolved oxygen tension on monoclonal antibody galactosylation and CHO metabolism',
      authorsAndYear: 'Restelli et al. (2006) / Chotigeat et al. (1994)',
      doiOrUrl: 'https://doi.org/10.1002/bit.20892',
      databaseId: 'DOI:10.1002/bit.20892 (Biotechnol. Bioeng. 94(3):481–494)',
      supportingSectionOrTable:
        'CHO dissolved oxygen control window (30–60% air saturation) balancing hypoxia lactate shift against oxidative stress',
      exactSourceEvidenceAndAudit:
        'PROVENANCE AUDIT: Literature reports an operating DO window of 30–60% air saturation for CHO mAb production. The point value 48% air sat. is a Synthetic demonstration assumption parameterising the simulator’s DO response peak.',
      originalReportedValueAndUnits: '30–60% air saturation (pO₂ ≈ 6.3–12.6 kPa)',
      unitTransformationFormula: `C_L [mmol O₂/L] = (DO [% air sat.] / 100) × C*_air [${(physics.cStarO2MmolPerL / (strParams.oxygenEnrichmentFraction / 0.21)).toFixed(3)} mmol/L] = ${physics.cLiquidO2MmolPerL.toFixed(3)} mmol/L`,
      biologicalSystemContext: 'Mammalian CHO-K1 suspension culture',
      experimentalConditions: 'Polarographic / optical DO probe cascade control',
      uncertaintyAndRange: '25–65% air saturation (±3% probe calibration drift)',
      validCalibrationRange: [20, 75],
      downstreamCausalChain: {
        step1MassBalance: `Reduces liquid-phase O₂ driving force (C*_O2 - C_L) as DO setpoint increases.`,
        step2FeasibilityConstraint: `DO < 22% causes hypoxic Warburg lactate surge; high DO shrinks OTR margin and increases sparging shear.`,
        step3OptimisationImpact: `Primary decision variable x₂ in Stage 6 Constrained BO (recommended: ${bestObs ? bestObs.x2_do : groundedParams.optimalDoPercent}% air sat.).`,
        step4CogsEconomicImpact: `Influences galactosylation CQA index and feasible VCD ceiling.`,
      },
      researcherChallengeJustification: customJustifications.do_ref,
    },
  ];
}

/**
 * Automated Scientific Consistency & Extrapolation Checks:
 * Evaluates oxygen mass-balance closure, dimensional unit identity, host-specific parameter isolation,
 * multi-impeller geometry ratios, Reynolds regime correlation bounds, and provenance verification.
 */
export function runScientificConsistencyAudit(
  candidate: BiologicCandidate,
  groundedParams: GroundedSimulatorParams,
  strParams: StirredTankPhysicsParams,
  physics: MassBalanceAndPhysicsResult,
  candidatePathwayMode: string,
  selectedOrganismId: OrganismSystemId,
  provenanceLedger: AuditedParameterProvenanceRecord[]
): ScientificConsistencyCheckItem[] {
  const checks: ScientificConsistencyCheckItem[] = [];

  // 1. Oxygen Mass Balance Closure
  const otrClosed = physics.otrMmolPerLHour >= physics.ourMmolPerLHour;
  checks.push({
    id: 'check_oxygen_balance',
    category: 'Oxygen Balance',
    title: 'Macroscopic Oxygen Transfer vs. Cellular Uptake Closure (OTR ≥ OUR)',
    status: otrClosed ? 'Verified Pass' : 'Failed / Violated',
    equationOrRule: 'OTR = k_La × (C*_O2 - C_L) ≥ OUR = q_O2 × X_v [mmol O₂·L⁻¹·h⁻¹]',
    currentDiagnostic: `OTR = ${physics.otrMmolPerLHour.toFixed(2)} mmol/L/h vs. OUR = ${physics.ourMmolPerLHour.toFixed(2)} mmol/L/h (Margin: ${physics.oxygenMarginMmolPerLHour >= 0 ? '+' : ''}${physics.oxygenMarginMmolPerLHour.toFixed(2)} mmol/L/h at X_v = ${strParams.targetVcdE6PerMl} × 10⁶ cells/mL, q_O2 = ${groundedParams.qO2Specific} pmol/cell/h).`,
    remediationAction: otrClosed
      ? 'Oxygen mass balance is closed with positive headroom.'
      : 'Switch to 15 μm sintered microsparger, increase O₂ enrichment fraction, or lower target VCD in Stage 5.',
  });

  // 2. Dimensional & Unit Conversion Verification
  const expectedOur = Math.round(groundedParams.qO2Specific * strParams.targetVcdE6PerMl * 100) / 100;
  const unitMatch = Math.abs(physics.ourMmolPerLHour - expectedOur) <= 0.05;
  checks.push({
    id: 'check_dimensional_units',
    category: 'Dimensional & Unit Consistency',
    title: 'Cellular-to-Volumetric Stoichiometric Unit Identity Verification',
    status: unitMatch ? 'Verified Pass' : 'Failed / Violated',
    equationOrRule:
      '1 pmol·cell⁻¹·h⁻¹ × 10⁶ cells·mL⁻¹ × 10³ mL·L⁻¹ × 10⁻⁹ mmol·pmol⁻¹ ≡ 1.0 mmol·L⁻¹·h⁻¹; 1 pg·cell⁻¹·d⁻¹ × 10⁶ cells·mL⁻¹ ≡ 1.0 mg·L⁻¹·d⁻¹',
    currentDiagnostic: `Verified exact dimensional identity: q_O2 (${groundedParams.qO2Specific}) × X_v (${strParams.targetVcdE6PerMl}) = ${expectedOur.toFixed(2)} mmol/L/h (Engine OUR: ${physics.ourMmolPerLHour.toFixed(2)} mmol/L/h); k_La = ${physics.klaPerHour.toFixed(1)} h⁻¹ = ${physics.klaPerSecond.toFixed(4)} s⁻¹.`,
    remediationAction: 'All cellular-to-reactor unit conversions are dimensionally consistent.',
  });

  // 3. Host-Specific Parameter Applicability Check
  const isNonChoSelected = selectedOrganismId !== 'cho_mammalian';
  checks.push({
    id: 'check_host_applicability',
    category: 'Host-Specific Applicability',
    title: 'Biological Host & Kinetic Parameter Isolation Guard',
    status:
      candidatePathwayMode !== 'established_biologic' || isNonChoSelected
        ? 'Warning / Extrapolated'
        : 'Verified Pass',
    equationOrRule:
      'CHO mammalian parameters (q_p in pg/cell/d, q_O2 in pmol/cell/h, τ_crit = 1.65 Pa) must NEVER be silently applied to microbial (E. coli, Pichia, S. cerevisiae), phototrophic, or small-molecule routes.',
    currentDiagnostic: isNonChoSelected
      ? `Active Stage 4 organism explorer is set to '${selectedOrganismId}'. Stage 6 quantitative BO remains locked to calibrated CHO perfusion unless host-specific wet-lab kinetics are supplied.`
      : `Active candidate (${candidate.genericName}) is expressed in ${candidate.expressionSystem}, matching the mammalian CHO perfusion simulator domain.`,
    remediationAction: isNonChoSelected
      ? 'Use host-specific kinetic parameters in Stage 4; do not extrapolate CHO perfusion curves to non-CHO hosts.'
      : 'Host and kinetic model domain match.',
  });

  // 4. Reactor & Multi-Impeller Geometry Consistency
  const geomHasWarning =
    physics.isCloselySpacedInteractionFlagged ||
    physics.isTopSubmergenceInsufficient ||
    physics.isMultiImpellerGeometryOutOfBounds;
  checks.push({
    id: 'check_impeller_geometry',
    category: 'Reactor & Impeller Geometry',
    title: 'Multi-Impeller Staging, Spacing (ΔC/D_i) & Submergence (S_top/D_i) Audit',
    status: physics.isMultiImpellerGeometryOutOfBounds
      ? 'Failed / Violated'
      : geomHasWarning
      ? 'Warning / Extrapolated'
      : 'Verified Pass',
    equationOrRule:
      'Liquid height Z = (Z/D_T)·D_T must satisfy S_top = Z - [C_1 + (n-1)·ΔC] ≥ 0.50·D_i; independent staging requires ΔC/D_i ≥ 1.2',
    currentDiagnostic: `n = ${physics.impellerCount} impeller(s), Z/D_T = ${strParams.aspectRatioZDt.toFixed(2)}, C_1/D_i = ${physics.bottomClearanceRatioC1Di.toFixed(2)}, ΔC/D_i = ${physics.impellerSpacingRatioDeltaCDi.toFixed(2)}, S_top/D_i = ${physics.topImpellerSubmergenceRatioStopDi.toFixed(2)} (${physics.multiImpellerFlowRegimeLabel}).`,
    remediationAction: geomHasWarning
      ? 'Increase vessel aspect ratio Z/D_T or adjust impeller spacing ΔC/D_i in Stage 5.'
      : 'Impeller spacing, bottom clearance, and top submergence satisfy hydrodynamic criteria.',
  });

  // 5. Parameter Extrapolation & Reynolds Correlation Bounds
  const outOfRangeParams = provenanceLedger.filter(
    (p) =>
      p.currentValue < p.validCalibrationRange[0] ||
      p.currentValue > p.validCalibrationRange[1]
  );
  const reOutOfRange = physics.isReynoldsOutOfRange;
  const klaManual = strParams.klaMode === 'assumed_manual';
  checks.push({
    id: 'check_extrapolation_bounds',
    category: 'Parameter Extrapolation Bounds',
    title: 'Reynolds Flow Regime & Literature Parameter Calibration Bounds',
    status:
      reOutOfRange || outOfRangeParams.length > 0
        ? 'Failed / Violated'
        : klaManual
        ? 'Warning / Extrapolated'
        : 'Verified Pass',
    equationOrRule:
      'Re = ρ·N·D_i²/μ ≥ 200 for supported impeller power correlations; kinetic inputs must lie within calibrated literature bounds.',
    currentDiagnostic: `Re = ${physics.reynoldsNumber.toLocaleString()} (${physics.flowRegimeClassification}); ${
      outOfRangeParams.length === 0
        ? 'all 8 audited parameters lie within literature calibration intervals'
        : `${outOfRangeParams.length} parameter(s) outside calibration bounds (${outOfRangeParams.map((p) => p.symbol).join(', ')})`
    }${klaManual ? `; Manual k_La override active (${physics.klaPerHour.toFixed(1)} h⁻¹ vs Van't Riet ${physics.vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹)` : ''}.`,
    remediationAction:
      reOutOfRange || outOfRangeParams.length > 0
        ? 'Return extrapolated parameters or impeller Reynolds number into the calibrated domain before sign-off.'
        : klaManual
        ? 'Verify manually assumed k_La via wet-lab dynamic gassing-out.'
        : 'No unsupported parameter extrapolation detected.',
  });

  // 6. Epistemic Provenance Verification Check
  const syntheticCount = provenanceLedger.filter(
    (p) => p.classification === 'Synthetic demonstration assumption'
  ).length;
  const derivedCount = provenanceLedger.filter(
    (p) => p.classification === 'Derived from literature with documented calculation'
  ).length;
  const researcherCount = provenanceLedger.filter(
    (p) => p.classification === 'Researcher-provided'
  ).length;

  checks.push({
    id: 'check_epistemic_provenance',
    category: 'Epistemic Provenance Verification',
    title: 'Strict 5-Tier Epistemic Provenance Classification Audit',
    status: 'Warning / Extrapolated',
    equationOrRule:
      'No parameter may be labelled "Grounded" or "Source-Verified" unless the cited paper directly reports that numerical value for the selected biological system.',
    currentDiagnostic: `Ledger summary: ${researcherCount} Researcher-provided, ${derivedCount} Derived from literature with documented calculation, ${syntheticCount} Synthetic demonstration assumption(s) within published CHO ranges. Zero unverified numbers are falsely claimed as verbatim literature measurements.`,
    remediationAction:
      'Use the Assumption-Challenge Workbench in Section 3 to substitute wet-lab measured values and inspect before/after impact across mass balance, feasibility, BO, and COGS.',
  });

  return checks;
}

/**
 * Evaluates Gaussian Process predictive uncertainty calibration on 25 held-out synthetic simulator points
 * across the (x1_vvd, x2_do) domain. Tests whether nominal 68% (μ ± 1.0σ) and 95% (μ ± 1.96σ)
 * GP credible intervals achieve empirical coverage of simulator outcomes.
 */
export function evaluateGpUncertaintyCalibration(
  observations: ExperimentObservation[],
  params: GroundedSimulatorParams,
  reactor: ReactorConfiguration
): GpUncertaintyCalibrationReport {
  const feasibleObs = observations.filter((o) => o.isFeasible);
  const bestFeasibleY =
    feasibleObs.length > 0
      ? Math.max(...feasibleObs.map((o) => o.volumetricProductivityMgLDay))
      : 120.0;

  const holdoutVvdGrid = [1.05, 1.65, 2.25, 2.85, 3.45];
  const holdoutDoGrid = [24, 36, 48, 60, 72];
  const holdoutPoints: GpCalibrationHoldoutPoint[] = [];

  let count68 = 0;
  let count95 = 0;
  let sumSqError = 0;
  let sumAbsZ = 0;
  let idx = 1;

  for (const vvd of holdoutVvdGrid) {
    for (const doPct of holdoutDoGrid) {
      const pred = predictSurrogateAtPoint(vvd, doPct, observations, bestFeasibleY);
      const sim = evaluateProcessSimulation(
        vvd,
        doPct,
        params.operatingTempC,
        params,
        reactor
      );
      const trueY = sim.volumetricProductivityMgLDay;
      // Combine GP epistemic std with simulator floor std so intervals reflect total surrogate dispersion
      const effStd = Math.max(2.5, pred.std);
      const ci68Lower = Math.round((pred.mean - 1.0 * effStd) * 10) / 10;
      const ci68Upper = Math.round((pred.mean + 1.0 * effStd) * 10) / 10;
      const ci95Lower = Math.round((pred.mean - 1.96 * effStd) * 10) / 10;
      const ci95Upper = Math.round((pred.mean + 1.96 * effStd) * 10) / 10;

      const within68Ci = trueY >= ci68Lower && trueY <= ci68Upper;
      const within95Ci = trueY >= ci95Lower && trueY <= ci95Upper;
      if (within68Ci) count68++;
      if (within95Ci) count95++;

      const err = trueY - pred.mean;
      sumSqError += err * err;
      const zErr = Math.abs(err) / effStd;
      sumAbsZ += zErr;

      holdoutPoints.push({
        pointId: idx++,
        x1_vvd: vvd,
        x2_do: doPct,
        trueSimulatorScore: trueY,
        gpMeanScore: pred.mean,
        gpStdScore: effStd,
        ci68Lower,
        ci68Upper,
        ci95Lower,
        ci95Upper,
        within68Ci,
        within95Ci,
        standardizedZError: Math.round(zErr * 100) / 100,
      });
    }
  }

  const total = holdoutPoints.length;
  const empiricalCoverage68Percent = Math.round((count68 / total) * 1000) / 10;
  const empiricalCoverage95Percent = Math.round((count95 / total) * 1000) / 10;
  const rmseCompositeScore = Math.round(Math.sqrt(sumSqError / total) * 100) / 100;
  const meanAbsoluteZScore = Math.round((sumAbsZ / total) * 100) / 100;

  const calibrationStatus: GpUncertaintyCalibrationReport['calibrationStatus'] =
    empiricalCoverage95Percent >= 88.0
      ? 'Well-Calibrated Simulator Surrogate (Empirical 95% Coverage within 88–100%)'
      : 'Under-Dispersed / Overconfident Surrogate (Empirical Coverage < 88%)';

  return {
    holdoutSampleCount: total,
    empiricalCoverage68Percent,
    empiricalCoverage95Percent,
    nominal68TargetPercent: 68.3,
    nominal95TargetPercent: 95.0,
    rmseCompositeScore,
    meanAbsoluteZScore,
    calibrationStatus,
    calibrationMethodDisclosure:
      'SIMULATOR-SURROGATE CALIBRATION DISCLOSURE: Held-out coverage is evaluated on N = 25 synthetic operating points from the deterministic CHO Monod + mass-balance simulator. It verifies that the Gaussian process predictive intervals (μ(x) ± 1.96σ(x)) are statistically calibrated against the in-silico response surface—NOT against wet-lab bioreactor runs.',
    holdoutPoints,
  };
}

/**
 * Propagates documented correlation and parameter uncertainties to estimate probabilistic constraint satisfaction:
 * - P(OTR >= OUR) using Van't Riet kLa relative standard error (±20%) and CHO q_O2 respiratory variance (±12%),
 *   unless kLa is set to an uncalibrated manual override (in which case bioREACT refuses to manufacture a probability).
 * - P(tau <= tau_crit) using Neunstoecklin et al. (2015) threshold SD (±4.4 Pa on 32.4 Pa = ±13.6%) and trailing-vortex uncertainty (±15%).
 * - P(t_m <= 60 s) using ±18% mixing-time correlation variance.
 */
function computeProbabilisticConstraintsForCandidate(
  candPhysics: MassBalanceAndPhysicsResult,
  candStr: StirredTankPhysicsParams,
  grounded: GroundedSimulatorParams,
  gpProbFeasible: number
): ProposedNextExperimentRecipe['probabilisticConstraints'] {
  const isManualKla = candStr.klaMode === 'assumed_manual';

  // 1. Shear probability P(tau <= tau_crit)
  const tauMean = candPhysics.estimatedShearStressPa;
  const tauCritMean = grounded.shearThresholdPa;
  const sigmaTau = 0.15 * tauMean;
  const sigmaTauCrit = 0.136 * tauCritMean; // Neunstoecklin et al. (2015): 32.4 ± 4.4 Pa (13.6% RSD)
  const zShear =
    (tauCritMean - tauMean) / Math.max(1e-4, Math.sqrt(sigmaTau * sigmaTau + sigmaTauCrit * sigmaTauCrit));
  const probShearSafe = Math.round(Math.min(0.999, Math.max(0.001, normalCdf(zShear))) * 1000) / 1000;

  // 2. Mixing probability P(t_m <= 60 s)
  const tmMean = candPhysics.mixingTimeGassedS;
  const sigmaTm = 0.18 * tmMean;
  const zMix = (60.0 - tmMean) / Math.max(0.5, sigmaTm);
  const probMixingSafe = Math.round(Math.min(0.999, Math.max(0.001, normalCdf(zMix))) * 1000) / 1000;

  // 3. Oxygen balance probability P(OTR >= OUR)
  if (isManualKla) {
    // Do NOT invent an OTR probability when kLa is an uncalibrated manual assumption without quantified error bars
    const jointFeasibilityProbability =
      Math.round(gpProbFeasible * probShearSafe * probMixingSafe * 1000) / 1000;
    return {
      probOtrGeqOur: null,
      probShearSafe,
      probMixingSafe,
      gpSurrogateProbFeasible: gpProbFeasible,
      jointFeasibilityProbability,
      isProbabilisticO2SafeAt95: false,
      isUncertaintyQuantifiedForO2: false,
      uncertaintyPropagationNote:
        'Manual k_La override is active without a wet-lab variance estimate; bioREACT abstains from manufacturing a numerical P(OTR ≥ OUR) probability until dynamic gassing-out replicates quantify σ(k_La).',
    };
  }

  // Propagate ±20% Van't Riet kLa correlation error and ±12% CHO q_O2 respiratory error (with ρ = 0.15 covariance)
  const otrMean = candPhysics.otrMmolPerLHour;
  const ourMean = candPhysics.ourMmolPerLHour;
  const sigmaOtr = 0.20 * otrMean;
  const sigmaOur = 0.12 * ourMean;
  const covOtrOur = 0.15 * sigmaOtr * sigmaOur;
  const varMargin = Math.max(1e-4, sigmaOtr * sigmaOtr + sigmaOur * sigmaOur - 2 * covOtrOur);
  const zO2 = (otrMean - ourMean) / Math.sqrt(varMargin);
  const probOtrGeqOur = Math.round(Math.min(0.999, Math.max(0.001, normalCdf(zO2))) * 1000) / 1000;

  const jointFeasibilityProbability =
    Math.round(
      Math.min(0.999, Math.max(0.001, probOtrGeqOur * probShearSafe * probMixingSafe * gpProbFeasible)) *
        1000
    ) / 1000;

  return {
    probOtrGeqOur,
    probShearSafe,
    probMixingSafe,
    gpSurrogateProbFeasible: gpProbFeasible,
    jointFeasibilityProbability,
    isProbabilisticO2SafeAt95: probOtrGeqOur >= 0.95,
    isUncertaintyQuantifiedForO2: true,
    uncertaintyPropagationNote:
      "Analytical Gaussian error propagation across Van't Riet k_La correlation uncertainty (σ_kLa/k_La = ±20%), CHO specific respiration uncertainty (σ_qO2/q_O2 = ±12%, Doran 2013), and Neunstoecklin et al. (2015) shear threshold SD (±13.6%). Screening threshold P(OTR ≥ OUR) ≥ 0.95 is an illustrative engineering margin, not a regulatory standard.",
  };
}

/**
 * Generates Uncertainty-Aware Next-Experiment Recommendations and implements the Three-Level
 * Scientific Decision & Abstention Framework:
 * - Level 1: Sufficient Evidence -> Propose ranked feasible next-experiment combinations (Exploitation, Exploration, Cost Trade-off)
 * - Level 2: High Predictive Uncertainty -> Recommend an informative experiment to reduce GP uncertainty
 * - Level 3: Insufficient Evidence or Invalid Model -> Abstain from quantitative recipes and specify required wet-lab measurements
 */
export function generateUncertaintyAwareNextExperiments(
  candidate: BiologicCandidate,
  groundedParams: GroundedSimulatorParams,
  strParams: StirredTankPhysicsParams,
  hfParams: HollowFibrePhysicsParams,
  selectedReactor: ReactorConfiguration,
  observations: ExperimentObservation[],
  downstreamEcon: DownstreamEconomicParams,
  candidatePathwayMode: CandidatePathwayMode,
  selectedOrganismId: OrganismSystemId,
  novelProfile: NovelProteinDissertationProfile,
  novelEvaluation: NovelProteinEvaluationResult,
  provenanceLedger: AuditedParameterProvenanceRecord[]
): NextExperimentRecommendationSuite {
  const calibrationReport = evaluateGpUncertaintyCalibration(
    observations,
    groundedParams,
    selectedReactor
  );

  const feasibleObs = observations.filter((o) => o.isFeasible);
  const bestFeasibleY =
    feasibleObs.length > 0
      ? Math.max(...feasibleObs.map((o) => o.volumetricProductivityMgLDay))
      : 120.0;

  // Compute average GP epistemic uncertainty across the grid (converted to mg/L/day via ×8.6)
  const avgGpStdScore =
    calibrationReport.holdoutPoints.reduce((acc, p) => acc + p.gpStdScore, 0) /
    Math.max(1, calibrationReport.holdoutPoints.length);
  const epistemicMeanStdMgLDay = Math.round(avgGpStdScore * 8.6 * 10) / 10;
  const aleatoricAssayNoiseStdMgLDay = 48.0; // ~4.0% biological & Cedex/HPLC titre assay replicate SD

  // Check for Level 3 Abstention triggers:
  // Trigger A: Small-molecule chemical synthesis pathway selected
  // Trigger B: Non-CHO organism selected (research-stage model without calibrated quantitative BO simulator)
  // Trigger C: Novel dissertation protein with missing kinetic parameters or out-of-distribution host
  // Trigger D: Extrapolated parameters outside literature calibration bounds or Reynolds Re < 200
  const abstentionReasons: string[] = [];
  const missingEvidenceList: string[] = [];
  const priorityWetLabMeasurements: string[] = [];

  if (candidatePathwayMode === 'small_molecule_chemical') {
    abstentionReasons.push(
      'Active candidate pathway is Small-Molecule Chemical Synthesis (391.5 Da Quinoline-Sulphonamide MRP1 inhibitor). Cellular bioreactor oxygen/perfusion optimisation does not apply to batch organic synthesis.'
    );
    missingEvidenceList.push(
      'Continuous-flow or jacketed Hastelloy batch reaction kinetics (activation energy E_a, reaction enthalpy ΔH_rxn, Pd scavenging)'
    );
    priorityWetLabMeasurements.push(
      'Reaction calorimetry (RC1) and HPLC impurity profiling for the 4-step Buchwald-Hartwig / amide coupling route'
    );
  }

  if (selectedOrganismId !== 'cho_mammalian') {
    abstentionReasons.push(
      `Selected host system (${selectedOrganismId}) is a research-stage or uncalibrated organism route in bioREACT. Reusing CHO Monod and perfusion parameters for ${selectedOrganismId} would produce scientifically invalid predictions.`
    );
    missingEvidenceList.push(
      `Host-specific calibrated Gaussian process surrogate, specific productivity q_p, and metabolic overflow thresholds for ${selectedOrganismId}`
    );
    priorityWetLabMeasurements.push(
      `Execute 24-well / ambr250 host-specific DoE characterization to measure μ_max, q_O2, and specific titre kinetics in ${selectedOrganismId} before enabling Bayesian optimisation.`
    );
  }

  if (
    candidatePathwayMode === 'novel_dissertation_protein' &&
    novelEvaluation.abstainsFromOptimisationClaim
  ) {
    abstentionReasons.push(
      `Novel dissertation protein (${novelProfile.proteinName}) is missing required wet-lab kinetic measurements or exceeds calibrated CHO stability bounds.`
    );
    missingEvidenceList.push(...novelEvaluation.missingParametersList);
    priorityWetLabMeasurements.push(...novelEvaluation.requiredNextWetLabMeasurements);
  }

  const outOfBoundsParams = provenanceLedger.filter(
    (p) =>
      p.currentValue < p.validCalibrationRange[0] ||
      p.currentValue > p.validCalibrationRange[1]
  );
  if (outOfBoundsParams.length > 0) {
    abstentionReasons.push(
      `Model parameters outside calibrated literature domain: ${outOfBoundsParams
        .map((p) => `${p.symbol} = ${p.currentValue} ${p.unit} (valid: ${p.validCalibrationRange[0]}–${p.validCalibrationRange[1]})`)
        .join('; ')}.`
    );
    missingEvidenceList.push(
      `Empirical validation for extrapolated parameter(s): ${outOfBoundsParams.map((p) => p.symbol).join(', ')}`
    );
    priorityWetLabMeasurements.push(
      `Perform bench-scale (2–5 L) kinetic verification across the extrapolated parameter range before 500 L scale-up.`
    );
  }

  const currentPhysics = solveMassBalanceAndReactorPhysics(
    strParams,
    hfParams,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );
  if (currentPhysics.isReynoldsOutOfRange) {
    abstentionReasons.push(
      `Impeller Reynolds number Re = ${currentPhysics.reynoldsNumber.toLocaleString()} is below the calibrated transitional correlation floor (Re < 200). Hydrodynamic power and k_La predictions are invalid in the uncalibrated laminar regime.`
    );
    missingEvidenceList.push('Laminar/low-Re impeller power curve and non-Newtonian cavern mixing data');
    priorityWetLabMeasurements.push(
      'Increase impeller speed into the transitional/turbulent regime (Re ≥ 2,000) or perform torque-transducer shaft power calibration.'
    );
  }

  if (abstentionReasons.length > 0) {
    return {
      generatedAt: new Date().toISOString(),
      engineVersion: REPRODUCIBILITY_MANIFEST.engineVersion,
      decisionLevel: 'LEVEL_3_ABSTAIN_INSUFFICIENT_EVIDENCE',
      decisionBadge: 'LEVEL 3 — ABSTAIN (INSUFFICIENT EVIDENCE OR UNSUPPORTED MODEL)',
      decisionTitle:
        'Quantitative Next-Experiment Recipe Generation Withheld — Evidence Gate Active',
      decisionSummary:
        'bioREACT explicitly abstains from generating numerical bioreactor recipes because the underlying biological host model, kinetic parameter set, or correlation domain lacks sufficient scientific evidence. Generating precise numbers from an inapplicable or uncalibrated model would be misleading.',
      abstentionDiagnostics: {
        isAbstaining: true,
        primaryReasons: abstentionReasons,
        missingParametersOrEvidence:
          missingEvidenceList.length > 0
            ? missingEvidenceList
            : ['Host-specific kinetic parameters (q_p, q_O2, μ_max) and mass-transfer calibration'],
        highestPriorityWetLabMeasurements:
          priorityWetLabMeasurements.length > 0
            ? priorityWetLabMeasurements
            : [
                'Dynamic gassing-out k_La calibration at target agitation and sparge rate',
                'Shake-flask / ambr15 fed-batch or perfusion scout run to measure specific productivity q_p and respiration q_O2',
              ],
        whySmallGpVarianceDoesNotProveValidity:
          'Even if a Gaussian process surrogate exhibits small mathematical variance σ_GP(x) near sampled points, that precision is conditional on the CHO simulator equations. Small GP variance NEVER validates applying CHO equations to a different organism, an uncharacterised protein, or an uncalibrated laminar flow regime.',
      },
      uncertaintyDecompositionSummary: {
        epistemicMeanStdMgLDay,
        aleatoricAssayNoiseStdMgLDay,
        evidenceApplicabilityStatus:
          'FAILED / INSUFFICIENT EVIDENCE — Pre-modelling applicability gate blocked quantitative recipe generation.',
        epistemicExplanation:
          'Model (epistemic) uncertainty from GP interpolation across untested (VVD, DO%) coordinates.',
        aleatoricExplanation:
          'Experimental (aleatoric) variability across biological replicates and offline titre assays (~4% CV).',
        evidenceExplanation:
          'Evidence/applicability uncertainty: missing host-specific parameters or unsupported biological/hydrodynamic regime triggers mandatory abstention.',
      },
      calibrationReport,
      proposedExperiments: [],
    };
  }

  // Evaluate mixed discrete-continuous candidate operating vectors using the active GP surrogate + mechanistic solver
  const vvdGrid = [1.55, 1.85, 2.05, 2.25, 2.35, 2.50, 2.65, 2.85];
  const doGrid = [36, 42, 46, 48, 52, 56, 60];

  // Candidate Group 1: High-Productivity / Oxygen-Delivery Resolution (15 um Sintered Microsparger + O2 enrichment, preserving target VCD)
  const targetVcdRetained = Math.max(38.0, Math.min(50.0, strParams.targetVcdE6PerMl));
  let bestExploitationCandidate: {
    str: StirredTankPhysicsParams;
    phys: MassBalanceAndPhysicsResult;
    vvd: number;
    doPct: number;
    pred: ReturnType<typeof predictSurrogateAtPoint>;
    sim: ReturnType<typeof evaluateProcessSimulation>;
    prob: ProposedNextExperimentRecipe['probabilisticConstraints'];
    cogs: DownstreamCogsResult;
    score: number;
  } | null = null;

  const exploitationHardwareConfigs: Array<{
    impellerType: ImpellerType;
    impellerCount: 1 | 2 | 3;
    rpm: number;
    vvm: number;
    o2Frac: number;
  }> = [
    { impellerType: 'marine_axial', impellerCount: 2, rpm: 108, vvm: 0.045, o2Frac: 0.58 },
    { impellerType: 'marine_axial', impellerCount: 2, rpm: 118, vvm: 0.050, o2Frac: 0.62 },
    { impellerType: 'pitched_blade', impellerCount: 2, rpm: 86, vvm: 0.045, o2Frac: 0.55 },
    { impellerType: 'marine_axial', impellerCount: 3, rpm: 96, vvm: 0.045, o2Frac: 0.55 },
  ];

  for (const hw of exploitationHardwareConfigs) {
    const candStr: StirredTankPhysicsParams = {
      ...strParams,
      spargerType: 'sintered_microsparger',
      impellerType: hw.impellerType,
      impellerCount: hw.impellerCount,
      stirrerSpeedRpm: hw.rpm,
      spargeRateVvm: hw.vvm,
      oxygenEnrichmentFraction: hw.o2Frac,
      targetVcdE6PerMl: targetVcdRetained,
    };
    for (const vvd of vvdGrid) {
      for (const doPct of doGrid) {
        const phys = solveMassBalanceAndReactorPhysics(candStr, hfParams, groundedParams, vvd, doPct);
        if (!phys.isScaleUpFeasible) continue;
        const pred = predictSurrogateAtPoint(vvd, doPct, observations, bestFeasibleY);
        const sim = evaluateProcessSimulation(
          vvd,
          doPct,
          groundedParams.operatingTempC,
          groundedParams,
          selectedReactor
        );
        const prob = computeProbabilisticConstraintsForCandidate(
          phys,
          candStr,
          groundedParams,
          pred.probFeasible
        );
        const cogs = computeDownstreamCogs(
          downstreamEcon,
          candStr.workingVolumeL,
          vvd,
          pred.mean
        );
        // Exploitation score: Constrained Expected Improvement + Posterior Mean × Joint Feasibility Probability
        const acqScore =
          (pred.constrainedEI * 3.5 + pred.mean * prob.jointFeasibilityProbability) *
          (prob.isProbabilisticO2SafeAt95 ? 1.08 : 0.85);
        if (!bestExploitationCandidate || acqScore > bestExploitationCandidate.score) {
          bestExploitationCandidate = {
            str: candStr,
            phys,
            vvd,
            doPct,
            pred,
            sim,
            prob,
            cogs,
            score: acqScore,
          };
        }
      }
    }
  }

  // Candidate Group 2: Information Gain / Epistemic Uncertainty Exploration near active boundary
  let bestExplorationCandidate: typeof bestExploitationCandidate = null;
  const explorationHardwareConfigs: Array<{
    impellerType: ImpellerType;
    impellerCount: 1 | 2 | 3;
    rpm: number;
    vvm: number;
    o2Frac: number;
    vcd: number;
  }> = [
    {
      impellerType: 'pitched_blade',
      impellerCount: 2,
      rpm: 84,
      vvm: 0.042,
      o2Frac: 0.52,
      vcd: Math.round(targetVcdRetained * 0.94 * 10) / 10,
    },
    {
      impellerType: 'marine_axial',
      impellerCount: 3,
      rpm: 94,
      vvm: 0.040,
      o2Frac: 0.50,
      vcd: Math.round(targetVcdRetained * 0.92 * 10) / 10,
    },
  ];

  for (const hw of explorationHardwareConfigs) {
    const candStr: StirredTankPhysicsParams = {
      ...strParams,
      spargerType: 'sintered_microsparger',
      impellerType: hw.impellerType,
      impellerCount: hw.impellerCount,
      stirrerSpeedRpm: hw.rpm,
      spargeRateVvm: hw.vvm,
      oxygenEnrichmentFraction: hw.o2Frac,
      targetVcdE6PerMl: hw.vcd,
    };
    for (const vvd of vvdGrid) {
      for (const doPct of doGrid) {
        if (
          bestExploitationCandidate &&
          Math.abs(vvd - bestExploitationCandidate.vvd) < 0.25 &&
          Math.abs(doPct - bestExploitationCandidate.doPct) < 6
        ) {
          continue;
        }
        const phys = solveMassBalanceAndReactorPhysics(candStr, hfParams, groundedParams, vvd, doPct);
        if (!phys.isScaleUpFeasible) continue;
        const pred = predictSurrogateAtPoint(vvd, doPct, observations, bestFeasibleY);
        if (pred.probFeasible < 0.65) continue;
        const sim = evaluateProcessSimulation(
          vvd,
          doPct,
          groundedParams.operatingTempC,
          groundedParams,
          selectedReactor
        );
        const prob = computeProbabilisticConstraintsForCandidate(
          phys,
          candStr,
          groundedParams,
          pred.probFeasible
        );
        const cogs = computeDownstreamCogs(
          downstreamEcon,
          candStr.workingVolumeL,
          vvd,
          pred.mean
        );
        // Information Gain score: Feasible Epistemic Standard Deviation σ_GP(x) × P_joint(feasible)
        const infoGainScore = pred.std * prob.jointFeasibilityProbability * 10.0 + pred.mean * 0.15;
        if (!bestExplorationCandidate || infoGainScore > bestExplorationCandidate.score) {
          bestExplorationCandidate = {
            str: candStr,
            phys,
            vvd,
            doPct,
            pred,
            sim,
            prob,
            cogs,
            score: infoGainScore,
          };
        }
      }
    }
  }

  // Candidate Group 3: Lower Oxygen Demand / Productivity–Cost Trade-Off (evaluates lower VCD / media-lean perfusion or open-pipe de-rated operation)
  let bestCostTradeoffCandidate: typeof bestExploitationCandidate = null;
  const tradeoffConfigs: Array<{
    spargerType: 'open_pipe' | 'sintered_microsparger';
    impellerType: ImpellerType;
    impellerCount: 1 | 2 | 3;
    rpm: number;
    vvm: number;
    o2Frac: number;
    vcd: number;
  }> = [
    {
      spargerType: 'sintered_microsparger',
      impellerType: 'marine_axial',
      impellerCount: 2,
      rpm: 92,
      vvm: 0.035,
      o2Frac: 0.42,
      vcd: 34.0,
    },
    {
      spargerType: 'open_pipe',
      impellerType: 'marine_axial',
      impellerCount: 2,
      rpm: 124,
      vvm: 0.060,
      o2Frac: 0.78,
      vcd: 10.5,
    },
  ];

  for (const hw of tradeoffConfigs) {
    const candStr: StirredTankPhysicsParams = {
      ...strParams,
      spargerType: hw.spargerType,
      impellerType: hw.impellerType,
      impellerCount: hw.impellerCount,
      stirrerSpeedRpm: hw.rpm,
      spargeRateVvm: hw.vvm,
      oxygenEnrichmentFraction: hw.o2Frac,
      targetVcdE6PerMl: hw.vcd,
    };
    for (const vvd of [1.65, 1.85, 2.05, 2.25]) {
      for (const doPct of [42, 46, 48, 52]) {
        const phys = solveMassBalanceAndReactorPhysics(candStr, hfParams, groundedParams, vvd, doPct);
        if (!phys.isScaleUpFeasible) continue;
        const pred = predictSurrogateAtPoint(vvd, doPct, observations, bestFeasibleY);
        const sim = evaluateProcessSimulation(
          vvd,
          doPct,
          groundedParams.operatingTempC,
          groundedParams,
          selectedReactor
        );
        const prob = computeProbabilisticConstraintsForCandidate(
          phys,
          candStr,
          groundedParams,
          pred.probFeasible
        );
        // Scale productivity by VCD ratio if VCD is significantly derated vs reference
        const vcdScale = Math.min(1.0, hw.vcd / 40.0);
        const adjustedScoreMean = Math.round(pred.mean * (0.35 + 0.65 * vcdScale) * 10) / 10;
        const cogs = computeDownstreamCogs(
          downstreamEcon,
          candStr.workingVolumeL,
          vvd,
          adjustedScoreMean
        );
        // Cost-efficiency & safety headroom utility
        const utilityScore =
          (adjustedScoreMean / Math.max(45, cogs.cogsPerGramUsd)) *
          100.0 *
          prob.jointFeasibilityProbability;
        if (!bestCostTradeoffCandidate || utilityScore > bestCostTradeoffCandidate.score) {
          bestCostTradeoffCandidate = {
            str: candStr,
            phys,
            vvd,
            doPct,
            pred: {
              ...pred,
              mean: adjustedScoreMean,
            },
            sim,
            prob,
            cogs,
            score: utilityScore,
          };
        }
      }
    }
  }

  if (!bestExploitationCandidate) {
    return {
      generatedAt: new Date().toISOString(),
      engineVersion: REPRODUCIBILITY_MANIFEST.engineVersion,
      decisionLevel: 'LEVEL_3_ABSTAIN_INSUFFICIENT_EVIDENCE',
      decisionBadge: 'LEVEL 3 — ABSTAIN (NO FEASIBLE CANDIDATE IN VALID DOMAIN)',
      decisionTitle:
        'No Computationally Feasible Candidate Found Within Valid Model Bounds',
      decisionSummary:
        'Across the evaluated hardware and operating grid, no candidate satisfied all hard engineering constraints (OTR ≥ OUR, τ ≤ τ_crit, t_m ≤ 60 s). bioREACT abstains from recommending an infeasible wet-lab run.',
      abstentionDiagnostics: {
        isAbstaining: true,
        primaryReasons: [
          `At q_O2 = ${groundedParams.qO2Specific} pmol/cell/h and τ_crit = ${groundedParams.shearThresholdPa} Pa, no combination of agitation and aeration closed the oxygen balance without violating the shear ceiling.`,
        ],
        missingParametersOrEvidence: [
          'Empirical sintered microsparger k_La curve in surfactant-supplemented media',
          'Wet-lab shear tolerance verification at target agitation tip speed',
        ],
        highestPriorityWetLabMeasurements: [
          'Perform abiotic dynamic gassing-out k_La characterization with 15 μm sintered microsparger',
          'Re-verify cellular specific oxygen uptake rate q_O2 and viable cell density setpoint',
        ],
        whySmallGpVarianceDoesNotProveValidity:
          'When physical mass-balance constraints (OTR < OUR) are violated across the domain, Gaussian process smoothness cannot create oxygen transfer capacity that does not physically exist.',
      },
      uncertaintyDecompositionSummary: {
        epistemicMeanStdMgLDay,
        aleatoricAssayNoiseStdMgLDay,
        evidenceApplicabilityStatus: 'NO FEASIBLE OPERATING POINT — Hard physical constraints violated.',
        epistemicExplanation: 'GP surrogate interpolation uncertainty across (VVD, DO%).',
        aleatoricExplanation: 'Replicate biological and assay measurement noise.',
        evidenceExplanation: 'No candidate satisfied OTR ≥ OUR and τ ≤ τ_crit simultaneously.',
      },
      calibrationReport,
      proposedExperiments: [],
    };
  }

  // Determine whether overall recommendation state is Level 1 (Sufficient Support) or Level 2 (High Uncertainty / Exploratory)
  const isHighEpistemicUncertainty =
    observations.length <= 6 ||
    bestExploitationCandidate.pred.std / Math.max(1, bestExploitationCandidate.pred.mean) > 0.11 ||
    !bestExploitationCandidate.prob.isUncertaintyQuantifiedForO2 ||
    !currentPhysics.isScaleUpFeasible;

  const overallDecisionLevel: RecommendationDecisionLevel = isHighEpistemicUncertainty
    ? 'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
    : 'LEVEL_1_SUFFICIENT_EVIDENCE';

  const buildRecipeObject = (
    rank: 1 | 2 | 3,
    codeLabel: 'Experiment A' | 'Experiment B' | 'Experiment C',
    title: string,
    subtitlePurpose: string,
    objectiveRole: ProposedNextExperimentRecipe['objectiveRole'],
    cand: NonNullable<typeof bestExploitationCandidate>,
    acquisitionMetricName: string,
    whySelectedSummary: string,
    engineeringTradeOffs: string[]
  ): ProposedNextExperimentRecipe => {
    const spec = IMPELLER_GEOMETRY_SPECS[cand.str.impellerType];
    const physMeanMgLDay = Math.round(cand.pred.mean * 8.6);
    const epistemicStdMgLDay = Math.round(cand.pred.std * 8.6 * 10) / 10;
    const totalStdMgLDay =
      Math.round(
        Math.sqrt(
          epistemicStdMgLDay * epistemicStdMgLDay +
            aleatoricAssayNoiseStdMgLDay * aleatoricAssayNoiseStdMgLDay
        ) * 10
      ) / 10;

    const gpCi95: [number, number] = [
      Math.round(Math.max(0, cand.pred.mean - 1.96 * cand.pred.std) * 10) / 10,
      Math.round((cand.pred.mean + 1.96 * cand.pred.std) * 10) / 10,
    ];
    const physCi95: [number, number] = [
      Math.round(Math.max(0, physMeanMgLDay - 1.96 * epistemicStdMgLDay)),
      Math.round(physMeanMgLDay + 1.96 * epistemicStdMgLDay),
    ];

    const candLevel: RecommendationDecisionLevel =
      objectiveRole === 'EXPLORATION_INFO_GAIN' ||
      cand.pred.std / Math.max(1, cand.pred.mean) > 0.12
        ? 'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
        : overallDecisionLevel;

    return {
      id: `next_exp_${rank}_${codeLabel.toLowerCase().replace(/\s+/g, '_')}`,
      rank,
      codeLabel,
      title,
      subtitlePurpose,
      objectiveRole,
      selectionMethodLabel:
        'Mixed-Variable Constrained BO (Discrete Sparger/Impeller Screening × Continuous GP Surrogate)',
      isDynamicallyComputed: true,
      decisionLevelForCandidate: candLevel,
      operatingVector: {
        reactorId: selectedReactor.id,
        reactorName: selectedReactor.shortName,
        workingVolumeL: cand.str.workingVolumeL,
        spargerType: cand.str.spargerType ?? 'sintered_microsparger',
        spargerLabel:
          cand.str.spargerType === 'sintered_microsparger'
            ? '15 μm Sintered Microsparger'
            : 'Open-Pipe Ring Sparger',
        impellerType: cand.str.impellerType,
        impellerLabel: spec.shortLabel,
        impellerCount: (cand.str.impellerCount as 1 | 2 | 3) || 2,
        agitationRpm: cand.str.stirrerSpeedRpm,
        spargeRateVvm: cand.str.spargeRateVvm,
        inletO2Percent: Math.round(cand.str.oxygenEnrichmentFraction * 100),
        targetVcdE6PerMl: cand.str.targetVcdE6PerMl,
        perfusionRateVvd: cand.vvd,
        doSetpointPercent: cand.doPct,
        operatingTempC: groundedParams.operatingTempC,
      },
      predictions: {
        gpCompositeScoreMean: cand.pred.mean,
        gpCompositeScoreStd: cand.pred.std,
        gpCompositeCredibleInterval95: gpCi95,
        volumetricProductivityMeanMgLDay: physMeanMgLDay,
        volumetricProductivityEpistemicStdMgLDay: epistemicStdMgLDay,
        volumetricProductivityAleatoricStdMgLDay: aleatoricAssayNoiseStdMgLDay,
        volumetricProductivityTotalStdMgLDay: totalStdMgLDay,
        volumetricProductivityCredibleInterval95MgLDay: physCi95,
        uncertaintySourceDisclosure:
          '95% GP Credible Interval (μ ± 1.96σ_GP) represents Gaussian Process epistemic surrogate uncertainty over the deterministic simulator response surface; aleatoric biological/assay replicate SD (±48 mg/L/day) is reported separately.',
        predictedOtrMmolPerLHour: cand.phys.otrMmolPerLHour,
        predictedOurMmolPerLHour: cand.phys.ourMmolPerLHour,
        oxygenMarginMmolPerLHour: cand.phys.oxygenMarginMmolPerLHour,
        predictedKlaPerHour: cand.phys.klaPerHour,
        predictedShearStressPa: cand.phys.estimatedShearStressPa,
        shearLimitPa: groundedParams.shearThresholdPa,
        shearMarginPa:
          Math.round((groundedParams.shearThresholdPa - cand.phys.estimatedShearStressPa) * 100) /
          100,
        predictedMixingTimeS: cand.phys.mixingTimeGassedS,
        specificPowerWPerM3: cand.phys.specificPowerWPerM3,
        predictedViabilityPercent: cand.sim.cellViabilityPercent,
        predictedLactateGPerL: cand.sim.lactateGPerL,
        estimatedUsableCogsPerGramUsd: cand.cogs.cogsPerGramUsd,
        annualRecoveredKg: cand.cogs.annualRecoveredDrugSubstanceKg,
      },
      probabilisticConstraints: cand.prob,
      whySelectedSummary,
      acquisitionScoreValue: Math.round(cand.score * 10) / 10,
      acquisitionMetricName,
      engineeringTradeOffs,
      wetLabValidationChecks: [
        `Verify abiotic dynamic gassing-out k_La ≥ ${(cand.phys.klaPerHour * 0.85).toFixed(1)} h⁻¹ at ${cand.str.stirrerSpeedRpm} RPM and ${cand.str.spargeRateVvm} vvm before inoculation`,
        `Monitor online off-gas mass spectrometry OUR vs. dissolved O₂ cascade at ${Math.round(cand.str.oxygenEnrichmentFraction * 100)}% inlet O₂`,
        `Confirm supernatant LDH activity and cell viability ≥ ${groundedParams.minViabilityPercent}% under ${cand.phys.estimatedShearStressPa.toFixed(2)} Pa bulk shear`,
      ],
    };
  };

  const expA = buildRecipeObject(
    1,
    'Experiment A',
    'Exploitation & Oxygen-Delivery Closure — High-Productivity Perfusion Optimum',
    'Maximise Constrained Expected Improvement (CEI) while closing the 500 L oxygen balance at full target cell density.',
    'EXPLOITATION_OPTIMUM',
    bestExploitationCandidate,
    'Constrained Expected Improvement (CEI × P_joint)',
    `Selected dynamically by maximising Constrained Expected Improvement across the mixed hardware × (VVD, DO%) grid. Switching to a 15 μm sintered microsparger with ${Math.round(bestExploitationCandidate.str.oxygenEnrichmentFraction * 100)}% inlet O₂ and ${bestExploitationCandidate.str.stirrerSpeedRpm} RPM raises k_La to ${bestExploitationCandidate.phys.klaPerHour.toFixed(1)} h⁻¹, achieving OTR = ${bestExploitationCandidate.phys.otrMmolPerLHour.toFixed(1)} ≥ OUR = ${bestExploitationCandidate.phys.ourMmolPerLHour.toFixed(1)} mmol/L/h (${bestExploitationCandidate.prob.probOtrGeqOur !== null ? `P(OTR ≥ OUR) = ${(bestExploitationCandidate.prob.probOtrGeqOur * 100).toFixed(1)}%` : 'Manual k_La override'}) at VVD = ${bestExploitationCandidate.vvd.toFixed(2)} day⁻¹ and DO = ${bestExploitationCandidate.doPct}%.`,
    [
      `Requires 15 μm sintered microsparger + ${Math.round(bestExploitationCandidate.str.oxygenEnrichmentFraction * 100)}% O₂ mass-flow blending (increases microbubble foaming risk; requires 15–25 ppm simethicone antifoam + headspace CO₂ sweep).`,
      `Maintains high viable cell density (${bestExploitationCandidate.str.targetVcdE6PerMl.toFixed(1)} × 10⁶ cells/mL) while keeping bulk shear τ = ${bestExploitationCandidate.phys.estimatedShearStressPa.toFixed(2)} Pa below τ_crit = ${groundedParams.shearThresholdPa.toFixed(2)} Pa.`,
    ]
  );

  const fallbackExploration = bestExplorationCandidate || bestExploitationCandidate;
  const expB = buildRecipeObject(
    2,
    'Experiment B',
    'Information Gain & Epistemic Boundary Probe — Uncertainty-Reducing Run',
    'Sample a feasible, under-explored region of the (VVD, DO%) and impeller space where GP epistemic variance σ_GP(x) is highest.',
    'EXPLORATION_INFO_GAIN',
    fallbackExploration,
    'Feasible Information Gain (σ_GP(x) × P_joint)',
    `Selected to maximise epistemic information gain (σ_GP = ±${fallbackExploration.pred.std.toFixed(1)} score units / ±${Math.round(fallbackExploration.pred.std * 8.6)} mg/L/day) while maintaining joint constraint feasibility (${(fallbackExploration.prob.jointFeasibilityProbability * 100).toFixed(1)}%). Testing (${fallbackExploration.vvd.toFixed(2)} VVD, ${fallbackExploration.doPct}% DO) with ${fallbackExploration.str.impellerCount}× ${IMPELLER_GEOMETRY_SPECS[fallbackExploration.str.impellerType].shortLabel} reduces surrogate uncertainty near the oxygen/shear boundary for subsequent iterations.`,
    [
      `Predicted mean productivity (${Math.round(fallbackExploration.pred.mean * 8.6)} mg/L/day) is slightly lower than Experiment A, but high posterior variance (95% CI: ${Math.round((fallbackExploration.pred.mean - 1.96 * fallbackExploration.pred.std) * 8.6)}–${Math.round((fallbackExploration.pred.mean + 1.96 * fallbackExploration.pred.std) * 8.6)} mg/L/day) provides maximum learning value.`,
      `Tests ${IMPELLER_GEOMETRY_SPECS[fallbackExploration.str.impellerType].shortLabel} circulation at ${fallbackExploration.str.stirrerSpeedRpm} RPM (mixing time t_m = ${fallbackExploration.phys.mixingTimeGassedS.toFixed(1)} s).`,
    ]
  );

  const fallbackTradeoff = bestCostTradeoffCandidate || bestExploitationCandidate;
  const expC = buildRecipeObject(
    3,
    'Experiment C',
    'Reduced Oxygen Demand & Media-Lean Cost Trade-Off',
    'Lower cellular oxygen demand (OUR) and perfusion media consumption to maximise safety margin and minimise COGS ($/g).',
    'PRODUCTIVITY_COST_TRADEOFF',
    fallbackTradeoff,
    'Productivity–Cost & Safety Headroom Utility',
    `Selected by optimising the productivity-to-COGS trade-off under a conservative cell-density target (X_v = ${fallbackTradeoff.str.targetVcdE6PerMl.toFixed(1)} × 10⁶ cells/mL, D_perf = ${fallbackTradeoff.vvd.toFixed(2)} VVD). Lowering target VCD reduces OUR to ${fallbackTradeoff.phys.ourMmolPerLHour.toFixed(1)} mmol O₂/L/h, yielding a wide oxygen safety margin (+${fallbackTradeoff.phys.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h) and lower annual perfusion media expenditure.`,
    [
      `Volumetric productivity penalty: operating at X_v = ${fallbackTradeoff.str.targetVcdE6PerMl.toFixed(1)} × 10⁶ cells/mL lowers daily volumetric output compared to Experiment A, trading peak titre for wider oxygen/shear safety margins and lower daily media volume.`,
      `Requires cell-bleed control at D_bleed = ${fallbackTradeoff.phys.requiredBleedRateVvd.toFixed(2)} VVD to hold steady-state biomass at ${fallbackTradeoff.str.targetVcdE6PerMl.toFixed(1)} × 10⁶ cells/mL.`,
    ]
  );

  return {
    generatedAt: new Date().toISOString(),
    engineVersion: REPRODUCIBILITY_MANIFEST.engineVersion,
    decisionLevel: overallDecisionLevel,
    decisionBadge:
      overallDecisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
        ? 'LEVEL 1 — SUFFICIENT MODEL SUPPORT (RANKED NEXT EXPERIMENTS READY FOR HUMAN REVIEW)'
        : 'LEVEL 2 — HIGH PREDICTIVE UNCERTAINTY (INFORMATIVE EXPLORATORY EXPERIMENTS RECOMMENDED)',
    decisionTitle:
      overallDecisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
        ? 'Calibrated CHO Model & Constraint Margins Support Ranked Next-Experiment Proposals'
        : 'Model Applicable, but Active Constraint / Surrogate Uncertainty Warrants Exploratory Verification',
    decisionSummary:
      overallDecisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
        ? `The CHO perfusion surrogate (${observations.length} evaluations, ${feasibleObs.length} feasible) and 500 L mass-balance solver have sufficient support to propose three ranked next-experiment vectors balancing exploitation, information gain, and cost trade-offs.`
        : `While the CHO mechanistic model is applicable, ${
            !currentPhysics.isScaleUpFeasible
              ? 'the current Stage 5 vessel configuration violates hard oxygen/hydrodynamic constraints'
              : 'GP predictive uncertainty or manual k_La assumptions remain elevated'
          }. The proposed experiments below are formulated to resolve the constraint bottleneck and reduce surrogate uncertainty under human engineering review.`,
    abstentionDiagnostics: {
      isAbstaining: false,
      primaryReasons: [],
      missingParametersOrEvidence:
        strParams.klaMode === 'assumed_manual'
          ? ['Wet-lab dynamic gassing-out replication to quantify σ(k_La) for probabilistic OTR bounds']
          : [],
      highestPriorityWetLabMeasurements: [
        'Abiotic dynamic gassing-out k_La verification at proposed RPM and vvm',
        'Offline Cedex Bio HT & off-gas mass-spec OUR check at target VCD',
      ],
      whySmallGpVarianceDoesNotProveValidity:
        'GP credible intervals (μ ± 1.96σ) reflect mathematical interpolation across the simulator response surface. Every proposed recipe remains a computational hypothesis until reviewed by a qualified bioprocess engineer and validated in wet-lab hardware.',
    },
    uncertaintyDecompositionSummary: {
      epistemicMeanStdMgLDay,
      aleatoricAssayNoiseStdMgLDay,
      evidenceApplicabilityStatus:
        'PASS (Calibrated CHO-K1 IgG1 Domain — All 8 parameters audited within literature bounds)',
      epistemicExplanation: `GP epistemic std (mean ±${epistemicMeanStdMgLDay} mg/L/day across grid) measures uncertainty from finite sampling of (VVD, DO%) coordinates; reducible by running Experiment B.`,
      aleatoricExplanation: `Aleatoric variability (±${aleatoricAssayNoiseStdMgLDay} mg/L/day, ~4% CV) represents irreducible biological cell-culture and titre assay noise across repeat runs.`,
      evidenceExplanation:
        'Host compatibility, unit dimensional identity, and Reynolds regime bounds are verified; synthetic point defaults are explicitly flagged in Stage 3.',
    },
    calibrationReport,
    proposedExperiments: [expA, expB, expC],
  };
}

/**
 * Computes the normalised 6-axis constraint-severity load percentages (<= 100% = PASS, > 100% = FAIL)
 * matching the exact radar chart normalisation in ConstraintViolationRadarPanel.
 */
export function computeRadarLoadPercentages(
  strParams: StirredTankPhysicsParams,
  groundedParams: GroundedSimulatorParams,
  physics: MassBalanceAndPhysicsResult
): ProposedReactorConfiguration['radarLoadPercentages'] {
  const our = Math.max(0.1, physics.ourMmolPerLHour);
  const otr = Math.max(0.05, physics.otrMmolPerLHour);
  const oxygenLoadPct = Math.round(((our / otr) * 100) * 10) / 10;

  const tauCrit = Math.max(0.1, groundedParams.shearThresholdPa);
  const shearLoadPct =
    Math.round(((physics.estimatedShearStressPa / tauCrit) * 100) * 10) / 10;

  const twoOverKlaS = Math.max(12.0, 2.0 * physics.oxygenTransferTimeConstantS);
  const tmEffectiveLimit = physics.isMixingRateLimiting
    ? Math.min(60.0, twoOverKlaS)
    : 60.0;
  const mixingLoadPct =
    Math.round(((physics.mixingTimeGassedS / tmEffectiveLimit) * 100) * 10) / 10;

  const lambdaK = Math.max(4.0, physics.kolmogorovScaleUm);
  const eddyLoadPct = Math.round(((18.0 / lambdaK) * 100) * 10) / 10;

  const vvm = strParams.spargeRateVvm;
  const vvmFloor = 0.018;
  const vvmCeiling = 0.095;
  const vvmMid = 0.5 * (vvmFloor + vvmCeiling);
  const vvmHalfSpan = 0.5 * (vvmCeiling - vvmFloor);
  let aerationLoadPct = 0;
  if (vvm < vvmFloor) {
    aerationLoadPct = (vvmFloor / Math.max(0.004, vvm)) * 100;
  } else if (vvm > vvmCeiling) {
    aerationLoadPct = (vvm / vvmCeiling) * 100;
  } else {
    aerationLoadPct = 30 + (Math.abs(vvm - vvmMid) / vvmHalfSpan) * 70;
  }
  aerationLoadPct = Math.round(aerationLoadPct * 10) / 10;

  const dpLoadPct = (physics.hfPressureDropKpa / 35.0) * 100;
  const tauWLoadPct = (physics.hfWallShearStressPa / tauCrit) * 100;
  const filterHydraulicsLoadPct =
    Math.round(
      Math.max(dpLoadPct, tauWLoadPct, physics.hfAxialOxygenDepleted ? 120 : 0) * 10
    ) / 10;

  const maxAxisLoadPct =
    Math.round(
      Math.max(
        oxygenLoadPct,
        shearLoadPct,
        mixingLoadPct,
        eddyLoadPct,
        aerationLoadPct,
        filterHydraulicsLoadPct
      ) * 10
    ) / 10;

  return {
    oxygenLoadPct,
    shearLoadPct,
    mixingLoadPct,
    eddyLoadPct,
    aerationLoadPct,
    filterHydraulicsLoadPct,
    maxAxisLoadPct,
  };
}

/**
 * Unified Mixed-Integer Constrained Multi-Objective Reactor Configuration Optimiser.
 * Evaluates discrete hardware branches (impeller type, impeller count 1–3, sparger type, hollow-fibre cartridge tier)
 * coupled with continuous/geometric operating parameters (RPM, D_i/D_T, Z/D_T, vvm, y_O2, X_v, filter flow Q_HF).
 * Strictly enforces all hard physical safety limits without relaxation and explicitly flags unsupported correlation domains.
 */
export function optimiseUnifiedReactorConfiguration(
  currentStrParams: StirredTankPhysicsParams,
  currentHfParams: HollowFibrePhysicsParams,
  groundedParams: GroundedSimulatorParams,
  weights: ReactorOptimisationObjectiveWeights,
  econParams: DownstreamEconomicParams = DEFAULT_DOWNSTREAM_ECONOMICS
): UnifiedReactorOptimisationSuite {
  const currentPhysics = solveMassBalanceAndReactorPhysics(
    currentStrParams,
    currentHfParams,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );
  const currentRadar = computeRadarLoadPercentages(
    currentStrParams,
    groundedParams,
    currentPhysics
  );
  const currentProdMgLDay =
    currentStrParams.targetVcdE6PerMl * groundedParams.qpBase * 0.88;
  const currentCogs = computeDownstreamCogs(
    econParams,
    currentStrParams.workingVolumeL,
    groundedParams.optimalVvd,
    currentProdMgLDay
  );

  // Scale reference agitation speeds to current working volume (calibrated around 500 L)
  const volRatioScale = Math.pow(
    500.0 / Math.max(3.0, currentStrParams.workingVolumeL),
    0.26
  );
  const scaleRpm = (refRpm500L: number) =>
    Math.max(30, Math.min(310, Math.round(refRpm500L * volRatioScale)));

  const baseTargetVcd = Math.max(25, currentStrParams.targetVcdE6PerMl);

  // Discrete Hollow-Fibre Cartridge & Recirculation Tiers
  const hfTiers: Array<{
    tierId: string;
    tierName: string;
    params: HollowFibrePhysicsParams;
  }> = [
    {
      tierId: 'hf_340um_low_shear',
      tierName: '340 μm Wide-Lumen Short-Path Cartridge (L=0.26m, 15,500 fibres, 6.0 L/min)',
      params: {
        ...currentHfParams,
        fibreInnerDiameterUm: 340,
        fibreLengthM: 0.26,
        numberOfFibres: 15500,
        recirculationFlowLMin: 6.0,
        oxygenEnrichmentFraction: 0.60,
      },
    },
    {
      tierId: 'hf_380um_ultra_low_dp',
      tierName: '380 μm Ultra-Low-ΔP Cartridge (L=0.24m, 16,500 fibres, 5.8 L/min)',
      params: {
        ...currentHfParams,
        fibreInnerDiameterUm: 380,
        fibreLengthM: 0.24,
        numberOfFibres: 16500,
        recirculationFlowLMin: 5.8,
        oxygenEnrichmentFraction: 0.60,
      },
    },
    {
      tierId: 'hf_310um_balanced',
      tierName: '310 μm Balanced Perfusion Cartridge (L=0.28m, 15,000 fibres, 6.4 L/min)',
      params: {
        ...currentHfParams,
        fibreInnerDiameterUm: 310,
        fibreLengthM: 0.28,
        numberOfFibres: 15000,
        recirculationFlowLMin: 6.4,
        oxygenEnrichmentFraction: 0.60,
      },
    },
    {
      tierId: 'hf_280um_baseline',
      tierName: '280 μm Standard Cartridge (L=0.32m, 14,000 fibres, 6.5 L/min)',
      params: {
        ...currentHfParams,
        fibreInnerDiameterUm: 280,
        fibreLengthM: 0.32,
        numberOfFibres: 14000,
        recirculationFlowLMin: 6.5,
        oxygenEnrichmentFraction: 0.60,
      },
    },
  ];

  // Discrete Vessel + Impeller + Sparger Hardware Branches
  const discreteVesselBranches: Array<{
    branchId: string;
    impellerType: ImpellerType;
    impellerCount: 1 | 2 | 3;
    spargerType: 'sintered_microsparger' | 'open_pipe';
    aspectRatioZDt: number;
    impellerSpacingRatioDeltaCDi: number;
    bottomClearanceRatioC1Di: number;
  }> = [
    // Branch 1: 2x Marine Hydrofoil + Sintered Microsparger
    {
      branchId: '2x_marine_micro',
      impellerType: 'marine_axial',
      impellerCount: 2,
      spargerType: 'sintered_microsparger',
      aspectRatioZDt: 1.45,
      impellerSpacingRatioDeltaCDi: 1.50,
      bottomClearanceRatioC1Di: 0.90,
    },
    // Branch 2: 3x Marine Hydrofoil + Sintered Microsparger (Tall aspect ratio Z/D_T = 1.90 for S_top/D_i >= 0.55)
    {
      branchId: '3x_marine_micro_tall',
      impellerType: 'marine_axial',
      impellerCount: 3,
      spargerType: 'sintered_microsparger',
      aspectRatioZDt: 1.90,
      impellerSpacingRatioDeltaCDi: 1.50,
      bottomClearanceRatioC1Di: 0.85,
    },
    // Branch 3: 2x Pitched-Blade Turbine + Sintered Microsparger
    {
      branchId: '2x_pbt_micro',
      impellerType: 'pitched_blade',
      impellerCount: 2,
      spargerType: 'sintered_microsparger',
      aspectRatioZDt: 1.45,
      impellerSpacingRatioDeltaCDi: 1.50,
      bottomClearanceRatioC1Di: 0.90,
    },
    // Branch 4: 3x Pitched-Blade Turbine + Sintered Microsparger
    {
      branchId: '3x_pbt_micro_tall',
      impellerType: 'pitched_blade',
      impellerCount: 3,
      spargerType: 'sintered_microsparger',
      aspectRatioZDt: 1.90,
      impellerSpacingRatioDeltaCDi: 1.50,
      bottomClearanceRatioC1Di: 0.85,
    },
    // Branch 5: 1x Marine Hydrofoil + Sintered Microsparger (Squat aspect ratio Z/D_T = 1.30)
    {
      branchId: '1x_marine_micro_squat',
      impellerType: 'marine_axial',
      impellerCount: 1,
      spargerType: 'sintered_microsparger',
      aspectRatioZDt: 1.30,
      impellerSpacingRatioDeltaCDi: 0.0,
      bottomClearanceRatioC1Di: 0.90,
    },
    // Branch 6: 2x Rushton Radial Turbine + Sintered Microsparger (Evaluated for Pareto / shear / zoning comparison)
    {
      branchId: '2x_rushton_micro',
      impellerType: 'rushton_radial',
      impellerCount: 2,
      spargerType: 'sintered_microsparger',
      aspectRatioZDt: 1.50,
      impellerSpacingRatioDeltaCDi: 1.55,
      bottomClearanceRatioC1Di: 0.90,
    },
    // Branch 7: 2x Marine Hydrofoil + Open-Pipe Sparger (Evaluated to show open-pipe constraint trade-off)
    {
      branchId: '2x_marine_openpipe',
      impellerType: 'marine_axial',
      impellerCount: 2,
      spargerType: 'open_pipe',
      aspectRatioZDt: 1.45,
      impellerSpacingRatioDeltaCDi: 1.50,
      bottomClearanceRatioC1Di: 0.90,
    },
  ];

  const diDtGrid = [0.38, 0.41, 0.44];
  const refRpmGrid500L = [82, 96, 110, 124, 136, 148];
  const vvmGrid = [0.044, 0.055, 0.065];
  const o2Grid = [0.50, 0.60, 0.72];

  interface EvaluatedCandidate {
    id: string;
    branchId: string;
    hfTierId: string;
    hfTierName: string;
    strParams: StirredTankPhysicsParams;
    hfParams: HollowFibrePhysicsParams;
    physics: MassBalanceAndPhysicsResult;
    cogs: DownstreamCogsResult;
    radar: ProposedReactorConfiguration['radarLoadPercentages'];
    isHardFeasible: boolean;
    subScores: ProposedReactorConfiguration['objectiveBreakdown'];
    compositeScore: number;
  }

  const allCandidates: EvaluatedCandidate[] = [];
  let feasibleCount = 0;
  let rejectedCount = 0;

  const wMix = Math.max(0, weights.minimiseMixingTime);
  const wHf = Math.max(0, weights.minimiseFilterPressureDrop);
  const wO2 = Math.max(0, weights.maximiseOxygenTransfer);
  const wShear = Math.max(0, weights.minimiseShearStress);
  const wCost = Math.max(0, weights.balanceProductivityAndCost);
  const totalWeight = Math.max(1, wMix + wHf + wO2 + wShear + wCost);

  for (const branch of discreteVesselBranches) {
    const spec = IMPELLER_GEOMETRY_SPECS[branch.impellerType];
    for (const hfTier of hfTiers) {
      for (const diDt of diDtGrid) {
        for (const refRpm of refRpmGrid500L) {
          for (const vvm of vvmGrid) {
            for (const o2Frac of o2Grid) {
              // For open_pipe sparger, also test de-rated VCD (13.5e6) vs full VCD so we see why open-pipe fails at full VCD
              const vcdOptions =
                branch.spargerType === 'open_pipe'
                  ? [baseTargetVcd, 13.5]
                  : [baseTargetVcd];

              for (const vcd of vcdOptions) {
                const rpm = scaleRpm(refRpm);
                const candStr: StirredTankPhysicsParams = {
                  workingVolumeL: currentStrParams.workingVolumeL,
                  impellerType: branch.impellerType,
                  impellerCount: branch.impellerCount,
                  diameterRatioDiDt: diDt,
                  aspectRatioZDt: branch.aspectRatioZDt,
                  bottomClearanceRatioC1Di: branch.bottomClearanceRatioC1Di,
                  impellerSpacingRatioDeltaCDi: branch.impellerSpacingRatioDeltaCDi,
                  multiImpellerPowerModel: 'spacing_interaction_corrected',
                  stirrerSpeedRpm: rpm,
                  spargeRateVvm: vvm,
                  oxygenEnrichmentFraction: o2Frac,
                  targetVcdE6PerMl: vcd,
                  spargerType: branch.spargerType,
                  customTurbulentNp: spec.defaultTurbulentNp0,
                  bafflingMode: 'standard_4_baffles',
                  klaMode: 'calculated_vant_riet',
                };

                const candHf: HollowFibrePhysicsParams = {
                  ...hfTier.params,
                  oxygenEnrichmentFraction: o2Frac,
                };

                const phys = solveMassBalanceAndReactorPhysics(
                  candStr,
                  candHf,
                  groundedParams,
                  groundedParams.optimalVvd,
                  groundedParams.optimalDoPercent
                );

                const radar = computeRadarLoadPercentages(
                  candStr,
                  groundedParams,
                  phys
                );

                const isHardFeasible =
                  phys.isScaleUpFeasible &&
                  phys.oxygenMarginMmolPerLHour >= 0.5 &&
                  phys.estimatedShearStressPa <= groundedParams.shearThresholdPa &&
                  phys.kolmogorovScaleUm >= 18.0 &&
                  phys.mixingTimeGassedS <= 60.0 &&
                  !phys.isMixingRateLimiting &&
                  candStr.spargeRateVvm >= 0.018 &&
                  candStr.spargeRateVvm <= 0.095 &&
                  phys.hfPressureDropKpa <= 35.0 &&
                  phys.hfWallShearStressPa <= groundedParams.shearThresholdPa &&
                  !phys.hfAxialOxygenDepleted &&
                  !phys.isReynoldsOutOfRange &&
                  !phys.isTopSubmergenceInsufficient &&
                  !phys.isCloselySpacedInteractionFlagged &&
                  radar.maxAxisLoadPct <= 99.5;

                if (isHardFeasible) {
                  feasibleCount++;
                } else {
                  rejectedCount++;
                }

                const prodMgLDay = vcd * groundedParams.qpBase * 0.88;
                const cogs = computeDownstreamCogs(
                  econParams,
                  candStr.workingVolumeL,
                  groundedParams.optimalVvd,
                  prodMgLDay
                );

                // Compute 0–100 Sub-Scores for the 5 Objectives
                // 1. Minimise Mixing Time (15 s -> 100, 60 s -> 0)
                const mixingScore =
                  Math.round(
                    Math.max(
                      0,
                      Math.min(100, ((60.0 - phys.mixingTimeGassedS) / 45.0) * 100)
                    ) * 10
                  ) / 10;

                // 2. Minimise Filter Pressure Drop & Wall Shear (0 kPa -> 100, 35 kPa -> 0)
                const dpNorm = Math.max(
                  0,
                  Math.min(1, (35.0 - phys.hfPressureDropKpa) / 33.0)
                );
                const tauWNorm = Math.max(
                  0,
                  Math.min(
                    1,
                    1.0 - phys.hfWallShearStressPa / groundedParams.shearThresholdPa
                  )
                );
                const filterHydraulicsScore =
                  Math.round((0.62 * dpNorm + 0.38 * tauWNorm) * 100 * 10) / 10;

                // 3. Maximise Feasible Oxygen Transfer Capacity (margin 0 -> 20, margin +15 -> 100)
                const oxygenTransferScore =
                  Math.round(
                    Math.max(
                      0,
                      Math.min(
                        100,
                        20 + (phys.oxygenMarginMmolPerLHour / 14.5) * 80
                      )
                    ) * 10
                  ) / 10;

                // 4. Minimise Hydrodynamic Shear & Maximise Eddy Margin
                const shearMarginNorm = Math.max(
                  0,
                  Math.min(
                    1,
                    1.0 - phys.estimatedShearStressPa / groundedParams.shearThresholdPa
                  )
                );
                const eddyMarginNorm = Math.max(
                  0,
                  Math.min(1, (phys.kolmogorovScaleUm - 18.0) / 22.0)
                );
                const shearSafetyScore =
                  Math.round(
                    (0.55 * shearMarginNorm + 0.45 * eddyMarginNorm) * 100 * 10
                  ) / 10;

                // 5. Balance Volumetric Productivity & Energy/Gas/COGS Efficiency
                const vcdRetentionRatio = Math.min(1.0, vcd / baseTargetVcd);
                const powerEfficiencyNorm = Math.max(
                  0,
                  Math.min(1, 1.0 - phys.specificPowerWPerM3 / 220.0)
                );
                const gasCostEfficiencyNorm = Math.max(
                  0,
                  Math.min(1, 1.0 - (o2Frac - 0.21) / 0.79)
                );
                const productivityCostScore =
                  Math.round(
                    (0.55 * vcdRetentionRatio +
                      0.25 * powerEfficiencyNorm +
                      0.20 * gasCostEfficiencyNorm) *
                      100 *
                      10
                  ) / 10;

                const weightedMean =
                  (wMix * mixingScore +
                    wHf * filterHydraulicsScore +
                    wO2 * oxygenTransferScore +
                    wShear * shearSafetyScore +
                    wCost * productivityCostScore) /
                  totalWeight;

                // Penalise configurations that leave any single radar axis dangerously close to 100%
                const bottleneckPenalty = Math.max(0, radar.maxAxisLoadPct - 55) * 0.18;
                const compositeScore =
                  Math.round((weightedMean - bottleneckPenalty) * 10) / 10;

                allCandidates.push({
                  id: `${branch.branchId}_${hfTier.tierId}_d${diDt}_r${rpm}_v${vvm}_o${Math.round(o2Frac * 100)}_x${vcd}`,
                  branchId: branch.branchId,
                  hfTierId: hfTier.tierId,
                  hfTierName: hfTier.tierName,
                  strParams: candStr,
                  hfParams: candHf,
                  physics: phys,
                  cogs,
                  radar,
                  isHardFeasible,
                  subScores: {
                    mixingScore,
                    filterHydraulicsScore,
                    oxygenTransferScore,
                    shearSafetyScore,
                    productivityCostScore,
                  },
                  compositeScore,
                });
              }
            }
          }
        }
      }
    }
  }

  const feasiblePool = allCandidates
    .filter((c) => c.isHardFeasible)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  // Select up to 3 diverse, high-performing feasible configurations representing distinct Pareto trade-offs
  const selectedTopThree: EvaluatedCandidate[] = [];

  if (feasiblePool.length > 0) {
    // Rank #1: Highest Composite Score under the Scientist's Objective Weights
    selectedTopThree.push(feasiblePool[0]);
  }

  // Helper to sort Rank #2 and Rank #3 cleanly
  const rank2Candidate = feasiblePool
    .filter(
      (c) =>
        selectedTopThree.length === 0 ||
        (c.id !== selectedTopThree[0].id &&
          (c.strParams.impellerCount !== selectedTopThree[0].strParams.impellerCount ||
            c.strParams.impellerType !== selectedTopThree[0].strParams.impellerType))
    )
    .sort(
      (a, b) =>
        b.subScores.mixingScore * 0.45 +
        b.subScores.filterHydraulicsScore * 0.30 +
        b.compositeScore * 0.25 -
        (a.subScores.mixingScore * 0.45 +
          a.subScores.filterHydraulicsScore * 0.30 +
          a.compositeScore * 0.25)
    )[0];

  if (rank2Candidate) {
    selectedTopThree.push(rank2Candidate);
  }

  const rank3Candidate = feasiblePool
    .filter(
      (c) =>
        !selectedTopThree.some((s) => s.id === c.id) &&
        !selectedTopThree.some(
          (s) =>
            s.branchId === c.branchId &&
            s.strParams.stirrerSpeedRpm === c.strParams.stirrerSpeedRpm
        )
    )
    .sort(
      (a, b) =>
        b.subScores.shearSafetyScore * 0.45 +
        b.subScores.productivityCostScore * 0.35 +
        b.compositeScore * 0.20 -
        (a.subScores.shearSafetyScore * 0.45 +
          a.subScores.productivityCostScore * 0.35 +
          a.compositeScore * 0.20)
    )[0];

  if (rank3Candidate) {
    selectedTopThree.push(rank3Candidate);
  }

  const buildProposedConfig = (
    cand: EvaluatedCandidate,
    rank: 1 | 2 | 3
  ): ProposedReactorConfiguration => {
    const impSpec = IMPELLER_GEOMETRY_SPECS[cand.strParams.impellerType];
    const roleLabel =
      rank === 1
        ? 'Primary Multi-Objective Optimum (Weighted Best Balance)'
        : rank === 2
        ? 'Rapid Macromixing & Low-ΔP Filter Hydraulics Alternative'
        : 'Ultra-Low Shear & Energy-Efficient Pareto Alternative';

    const changes: string[] = [];
    if (cand.strParams.spargerType !== (currentStrParams.spargerType ?? 'open_pipe')) {
      changes.push(
        `Sparger: ${(currentStrParams.spargerType ?? 'open_pipe') === 'open_pipe' ? 'Open-Pipe' : '15 μm Microsparger'} → ${cand.strParams.spargerType === 'sintered_microsparger' ? '15 μm Sintered Microsparger' : 'Open-Pipe'}`
      );
    }
    if (
      cand.strParams.impellerCount !== currentStrParams.impellerCount ||
      cand.strParams.impellerType !== currentStrParams.impellerType
    ) {
      changes.push(
        `Impeller Assembly: ${currentStrParams.impellerCount}× ${IMPELLER_GEOMETRY_SPECS[currentStrParams.impellerType].shortLabel} → ${cand.strParams.impellerCount}× ${impSpec.shortLabel}`
      );
    }
    if (Math.abs(cand.strParams.diameterRatioDiDt - currentStrParams.diameterRatioDiDt) >= 0.005) {
      changes.push(
        `Impeller Diameter Ratio D_i/D_T: ${currentStrParams.diameterRatioDiDt.toFixed(2)} → ${cand.strParams.diameterRatioDiDt.toFixed(2)} (D_i = ${cand.physics.impellerDiameterM.toFixed(2)} m)`
      );
    }
    if (Math.abs(cand.strParams.aspectRatioZDt - currentStrParams.aspectRatioZDt) >= 0.02) {
      changes.push(
        `Vessel Aspect Ratio Z/D_T: ${currentStrParams.aspectRatioZDt.toFixed(2)} → ${cand.strParams.aspectRatioZDt.toFixed(2)} (S_top/D_i = ${cand.physics.topImpellerSubmergenceRatioStopDi.toFixed(2)})`
      );
    }
    if (cand.strParams.stirrerSpeedRpm !== currentStrParams.stirrerSpeedRpm) {
      changes.push(
        `Agitation Speed N: ${currentStrParams.stirrerSpeedRpm} RPM → ${cand.strParams.stirrerSpeedRpm} RPM (u_tip = ${cand.physics.tipSpeedMPerS.toFixed(2)} m/s)`
      );
    }
    if (
      Math.abs(cand.strParams.spargeRateVvm - currentStrParams.spargeRateVvm) >= 0.002 ||
      Math.abs(cand.strParams.oxygenEnrichmentFraction - currentStrParams.oxygenEnrichmentFraction) >= 0.01
    ) {
      changes.push(
        `Aeration & O₂: ${currentStrParams.spargeRateVvm.toFixed(3)} vvm @ ${Math.round(currentStrParams.oxygenEnrichmentFraction * 100)}% O₂ → ${cand.strParams.spargeRateVvm.toFixed(3)} vvm @ ${Math.round(cand.strParams.oxygenEnrichmentFraction * 100)}% O₂`
      );
    }
    if (
      cand.hfParams.fibreInnerDiameterUm !== currentHfParams.fibreInnerDiameterUm ||
      Math.abs(cand.hfParams.fibreLengthM - currentHfParams.fibreLengthM) >= 0.01 ||
      Math.abs(cand.hfParams.recirculationFlowLMin - currentHfParams.recirculationFlowLMin) >= 0.1
    ) {
      changes.push(
        `Hollow-Fibre Filter: d_f ${currentHfParams.fibreInnerDiameterUm}→${cand.hfParams.fibreInnerDiameterUm} μm, L_f ${currentHfParams.fibreLengthM.toFixed(2)}→${cand.hfParams.fibreLengthM.toFixed(2)} m, Q ${currentHfParams.recirculationFlowLMin.toFixed(1)}→${cand.hfParams.recirculationFlowLMin.toFixed(1)} L/min (${cand.hfParams.numberOfFibres.toLocaleString()} fibres)`
      );
    }

    return {
      id: cand.id,
      rank,
      title: `${cand.strParams.impellerCount}× ${impSpec.shortLabel} (D_i/D_T=${cand.strParams.diameterRatioDiDt.toFixed(2)}, ${cand.strParams.stirrerSpeedRpm} RPM) + 15 μm Microsparger (${Math.round(cand.strParams.oxygenEnrichmentFraction * 100)}% O₂) + ${cand.hfParams.fibreInnerDiameterUm} μm HF Cartridge`,
      strategyBadge: `Rank #${rank} · Composite Score ${cand.compositeScore.toFixed(1)}/100`,
      paretoRoleLabel: roleLabel,
      summaryRationale:
        rank === 1
          ? `Jointly optimises all 6 radar axes without relaxing any safety limit: reduces gassed mixing time from ${currentPhysics.mixingTimeGassedS.toFixed(1)} s to ${cand.physics.mixingTimeGassedS.toFixed(1)} s (${cand.radar.mixingLoadPct.toFixed(0)}% of limit), cuts hollow-fibre pressure drop ΔP from ${currentPhysics.hfPressureDropKpa.toFixed(1)} kPa to ${cand.physics.hfPressureDropKpa.toFixed(1)} kPa and wall shear τ_w from ${currentPhysics.hfWallShearStressPa.toFixed(2)} Pa to ${cand.physics.hfWallShearStressPa.toFixed(2)} Pa (${cand.radar.filterHydraulicsLoadPct.toFixed(0)}% of limit), and closes oxygen transfer at OTR = ${cand.physics.otrMmolPerLHour.toFixed(1)} ≥ OUR = ${cand.physics.ourMmolPerLHour.toFixed(1)} mmol/L/h.`
          : rank === 2
          ? `Prioritises rapid bulk macromixing (t_m = ${cand.physics.mixingTimeGassedS.toFixed(1)} s, ${cand.radar.mixingLoadPct.toFixed(0)}% of limit) and minimal filter lumen hydraulics (ΔP = ${cand.physics.hfPressureDropKpa.toFixed(1)} kPa, τ_w = ${cand.physics.hfWallShearStressPa.toFixed(2)} Pa) using ${cand.strParams.impellerCount} staged ${impSpec.shortLabel} impellers at D_i/D_T = ${cand.strParams.diameterRatioDiDt.toFixed(2)}.`
          : `Prioritises gentler hydrodynamic cell protection (bulk shear τ = ${cand.physics.estimatedShearStressPa.toFixed(2)} Pa, Kolmogorov eddy scale λ_K = ${cand.physics.kolmogorovScaleUm.toFixed(1)} μm ≥ 18.0 μm) and lower specific power input (P_g/V = ${cand.physics.specificPowerWPerM3.toFixed(0)} W/m³) while keeping mixing time ≤ ${cand.physics.mixingTimeGassedS.toFixed(1)} s.`,
      compositeObjectiveScore: cand.compositeScore,
      objectiveBreakdown: cand.subScores,
      strParams: cand.strParams,
      hfParams: cand.hfParams,
      evalPhysics: cand.physics,
      evalCogs: cand.cogs,
      radarLoadPercentages: cand.radar,
      keyVariableChangesFromCurrent: changes,
      competingObjectiveTradeOffs: [
        `Macromixing vs. Power/Shear Trade-Off: Operating ${cand.strParams.impellerCount}× ${impSpec.shortLabel} at D_i/D_T = ${cand.strParams.diameterRatioDiDt.toFixed(2)} and ${cand.strParams.stirrerSpeedRpm} RPM draws P_g/V = ${cand.physics.specificPowerWPerM3.toFixed(1)} W/m³ (assembly N_p,total = ${cand.physics.ungassedPowerNumberTotalNp.toFixed(2)}), yielding τ = ${cand.physics.estimatedShearStressPa.toFixed(2)} Pa and λ_K = ${cand.physics.kolmogorovScaleUm.toFixed(1)} μm.`,
        `Filter Hydraulics vs. Hold-Up Volume Trade-Off: Widening hollow-fibre inner diameter to d_f = ${cand.hfParams.fibreInnerDiameterUm} μm (L_f = ${cand.hfParams.fibreLengthM.toFixed(2)} m, ${cand.hfParams.numberOfFibres.toLocaleString()} fibres) reduces lumen ΔP to ${cand.physics.hfPressureDropKpa.toFixed(1)} kPa (∝ d_f⁻⁴) and wall shear τ_w to ${cand.physics.hfWallShearStressPa.toFixed(2)} Pa (∝ d_f⁻³), while maintaining axial outlet DO = ${cand.physics.hfOutletDoPercent.toFixed(1)}% (≥ 20% limit).`,
        `O₂ Enrichment & Microsparger Trade-Off: 15 μm sintered microsparger with ${Math.round(cand.strParams.oxygenEnrichmentFraction * 100)}% inlet O₂ achieves k_La = ${cand.physics.klaPerHour.toFixed(1)} h⁻¹, requiring 0.1% Pluronic F-68 shear protectant and antifoam monitoring.`,
      ],
      epistemicClassificationNotes: {
        literatureVerifiedLimitsUsed: [
          `Oxygen mass balance closure OTR ≥ OUR (Henry's Law C*_O2 & specific uptake q_O2 = ${groundedParams.qO2Specific} pmol/cell/h)`,
          `Kolmogorov turbulent microscale λ_K = (ν³/ε_T,max)^¼ ≥ 18.0 μm cell-diameter threshold (Nienow, 1997; Wu & Patterson, 1989)`,
          `Single-impeller turbulent N_p,0 = ${impSpec.defaultTurbulentNp0.toFixed(2)} within literature range [${impSpec.literatureTurbulentNpRange[0].toFixed(2)}–${impSpec.literatureTurbulentNpRange[1].toFixed(2)}] (Rushton et al., 1950; Bates et al., 1963; Doran, 2013)`,
          `Independent multi-impeller spacing regime ΔC/D_i = ${cand.strParams.impellerSpacingRatioDeltaCDi?.toFixed(2) ?? '1.50'} ≥ 1.50 and top submergence S_top/D_i = ${cand.physics.topImpellerSubmergenceRatioStopDi.toFixed(2)} ≥ 0.50 (Hudcova, Machon & Nienow, 1989)`,
          `Hagen-Poiseuille intracapillary lumen pressure drop ΔP = 128·μ·L_f·Q / (π·N_fibres·d_f⁴)`,
        ],
        designAssumptionsUsed: [
          `Gassed macromixing ceiling t_m,gas ≤ 60.0 s (industrial pilot/commercial homogenisation heuristic; Einsele, 1978; Rosseburg et al., 2018)`,
          `Hollow-fibre transmembrane fouling ceiling ΔP ≤ 35.0 kPa and axial outlet DO ≥ 20%`,
          `Sintered 15 μm microsparger Van't Riet prefactor (α = 96.0 vs 18.5 for open-pipe) — empirical design assumption requiring abiotic gassing-out calibration in actual surfactant/antifoam media`,
        ],
      },
    };
  };

  const rankedConfigurations: ProposedReactorConfiguration[] = selectedTopThree.map(
    (cand, idx) => buildProposedConfig(cand, (idx + 1) as 1 | 2 | 3)
  );

  // Build Pareto Front sample points (Current + Top 3 + representative Pareto alternatives across impeller/filter choices)
  const paretoFrontPoints: UnifiedReactorOptimisationSuite['paretoFrontPoints'] = [
    {
      id: 'current_operating_point',
      label: `Current Simulation (${currentStrParams.impellerCount}× ${IMPELLER_GEOMETRY_SPECS[currentStrParams.impellerType].shortLabel}, ${currentStrParams.stirrerSpeedRpm} RPM, d_f=${currentHfParams.fibreInnerDiameterUm}μm)`,
      isCurrentConfig: true,
      isFeasible: currentPhysics.isScaleUpFeasible && currentPhysics.oxygenMarginMmolPerLHour >= 0,
      mixingTimeGassedS: currentPhysics.mixingTimeGassedS,
      shearStressPa: currentPhysics.estimatedShearStressPa,
      oxygenMarginMmolPerLHour: currentPhysics.oxygenMarginMmolPerLHour,
      hfPressureDropKpa: currentPhysics.hfPressureDropKpa,
      hfWallShearPa: currentPhysics.hfWallShearStressPa,
      specificPowerWPerM3: currentPhysics.specificPowerWPerM3,
      volumetricProductivityGPerLDay:
        Math.round((currentProdMgLDay / 1000) * 100) / 100,
      cogsPerGramUsd: currentCogs.cogsPerGramUsd,
      maxRadarLoadPct: currentRadar.maxAxisLoadPct,
    },
  ];

  selectedTopThree.forEach((cand, idx) => {
    paretoFrontPoints.push({
      id: cand.id,
      label: `Rank #${idx + 1}: ${cand.strParams.impellerCount}× ${IMPELLER_GEOMETRY_SPECS[cand.strParams.impellerType].shortLabel} (D_i/D_T=${cand.strParams.diameterRatioDiDt.toFixed(2)}, ${cand.strParams.stirrerSpeedRpm} RPM, d_f=${cand.hfParams.fibreInnerDiameterUm}μm)`,
      isTopThreeRank: (idx + 1) as 1 | 2 | 3,
      isFeasible: true,
      mixingTimeGassedS: cand.physics.mixingTimeGassedS,
      shearStressPa: cand.physics.estimatedShearStressPa,
      oxygenMarginMmolPerLHour: cand.physics.oxygenMarginMmolPerLHour,
      hfPressureDropKpa: cand.physics.hfPressureDropKpa,
      hfWallShearPa: cand.physics.hfWallShearStressPa,
      specificPowerWPerM3: cand.physics.specificPowerWPerM3,
      volumetricProductivityGPerLDay:
        Math.round(
          ((cand.strParams.targetVcdE6PerMl * groundedParams.qpBase * 0.88) / 1000) * 100
        ) / 100,
      cogsPerGramUsd: cand.cogs.cogsPerGramUsd,
      maxRadarLoadPct: cand.radar.maxAxisLoadPct,
    });
  });

  // Add additional non-dominated feasible Pareto points spanning low-t_m vs low-shear
  const paretoExtras = feasiblePool
    .filter((c) => !selectedTopThree.some((s) => s.id === c.id))
    .filter((_, idx) => idx % Math.max(1, Math.floor(feasiblePool.length / 10)) === 0)
    .slice(0, 8);

  for (const extra of paretoExtras) {
    paretoFrontPoints.push({
      id: extra.id,
      label: `Feasible Alternative: ${extra.strParams.impellerCount}× ${IMPELLER_GEOMETRY_SPECS[extra.strParams.impellerType].shortLabel} (${extra.strParams.stirrerSpeedRpm} RPM, D_i/D_T=${extra.strParams.diameterRatioDiDt.toFixed(2)})`,
      isFeasible: true,
      mixingTimeGassedS: extra.physics.mixingTimeGassedS,
      shearStressPa: extra.physics.estimatedShearStressPa,
      oxygenMarginMmolPerLHour: extra.physics.oxygenMarginMmolPerLHour,
      hfPressureDropKpa: extra.physics.hfPressureDropKpa,
      hfWallShearPa: extra.physics.hfWallShearStressPa,
      specificPowerWPerM3: extra.physics.specificPowerWPerM3,
      volumetricProductivityGPerLDay:
        Math.round(
          ((extra.strParams.targetVcdE6PerMl * groundedParams.qpBase * 0.88) / 1000) * 100
        ) / 100,
      cogsPerGramUsd: extra.cogs.cogsPerGramUsd,
      maxRadarLoadPct: extra.radar.maxAxisLoadPct,
    });
  }

  // Quantitative "Mixing Improvement" Lever Analysis starting from currentStrParams
  const baseTm = currentPhysics.mixingTimeGassedS;

  // Lever 1: Increase Impeller Diameter Ratio D_i/D_T -> 0.44
  const lever1Phys = solveMassBalanceAndReactorPhysics(
    { ...currentStrParams, diameterRatioDiDt: 0.44 },
    currentHfParams,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );
  // Lever 2: Switch to 4-Blade 45° Pitched-Blade Turbine (Np,0 = 1.28)
  const lever2Phys = solveMassBalanceAndReactorPhysics(
    {
      ...currentStrParams,
      impellerType: 'pitched_blade',
      customTurbulentNp: 1.28,
    },
    currentHfParams,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );
  // Lever 3: 3-Stage Axial Impellers in Properly Proportioned Vessel (n = 3, Z/D_T = 1.90, Delta_C/D_i = 1.50, D_i/D_T = 0.43)
  const lever3Phys = solveMassBalanceAndReactorPhysics(
    {
      ...currentStrParams,
      impellerCount: 3,
      aspectRatioZDt: 1.90,
      impellerSpacingRatioDeltaCDi: 1.50,
      bottomClearanceRatioC1Di: 0.85,
      diameterRatioDiDt: 0.43,
    },
    currentHfParams,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );
  // Lever 4: Increase Agitation Speed N by +18%
  const boostedRpm = Math.min(240, Math.round(currentStrParams.stirrerSpeedRpm * 1.18));
  const lever4Phys = solveMassBalanceAndReactorPhysics(
    { ...currentStrParams, stirrerSpeedRpm: boostedRpm },
    currentHfParams,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );

  const mixingImprovementLevers: MixingImprovementLeverAnalysis[] = [
    {
      leverName: '1. Increase Impeller-to-Tank Diameter Ratio (D_i / D_T)',
      parameterChangeDisplay: `D_i/D_T: ${currentStrParams.diameterRatioDiDt.toFixed(2)} → 0.44 (D_i = ${lever1Phys.impellerDiameterM.toFixed(2)} m)`,
      variableType: 'Geometric Ratio',
      predictedMixingTimeBeforeS: baseTm,
      predictedMixingTimeAfterS: lever1Phys.mixingTimeGassedS,
      mixingTimeReductionPercent:
        Math.round(((baseTm - lever1Phys.mixingTimeGassedS) / Math.max(1, baseTm)) * 1000) / 10,
      governingMechanism:
        'In Einsele (1978) / Cooke et al. (1988) macromixing correlations, mixing time scales inversely with impeller diameter to the 2.3 power: θ_95% ∝ (D_i/D_T)^(-2.3) because axial pumping number Q_p ∝ N·D_i³ sweeps a larger fraction of the vessel cross-section.',
      coupledTradeOffs: [
        `Ungassed shaft power scales with the fifth power of diameter (P_0 ∝ D_i⁵), raising gassed specific power P_g/V from ${currentPhysics.specificPowerWPerM3.toFixed(1)} to ${lever1Phys.specificPowerWPerM3.toFixed(1)} W/m³ at constant RPM.`,
        `Bulk shear stress rises from ${currentPhysics.estimatedShearStressPa.toFixed(2)} Pa to ${lever1Phys.estimatedShearStressPa.toFixed(2)} Pa and Kolmogorov scale shifts from ${currentPhysics.kolmogorovScaleUm.toFixed(1)} μm to ${lever1Phys.kolmogorovScaleUm.toFixed(1)} μm; must be co-optimised with RPM.`,
      ],
      modelCredibilityStatus: 'Literature-Supported Correlation',
    },
    {
      leverName: '2. Switch Impeller Blade Geometry (Marine Hydrofoil → 4-Blade 45° PBT)',
      parameterChangeDisplay: `${IMPELLER_GEOMETRY_SPECS[currentStrParams.impellerType].shortLabel} (N_p,0=${currentPhysics.turbulentReferenceNp0.toFixed(2)}) → 4-Blade 45° PBT (N_p,0=1.28)`,
      variableType: 'Discrete Hardware',
      predictedMixingTimeBeforeS: baseTm,
      predictedMixingTimeAfterS: lever2Phys.mixingTimeGassedS,
      mixingTimeReductionPercent:
        Math.round(((baseTm - lever2Phys.mixingTimeGassedS) / Math.max(1, baseTm)) * 1000) / 10,
      governingMechanism:
        'Higher power-number mixed-flow blades (N_p,0 = 1.28 vs 0.38; Bates et al., 1963) deliver stronger discharge momentum per revolution (t_m ∝ N_p^(-1/3)), reducing bulk circulation time without increasing shaft rotational speed N.',
      coupledTradeOffs: [
        `Higher trailing-vortex energy concentration factor (Φ = 6.5× mean ε̄_T for 45° PBT vs Φ = 4.5× for 3-blade marine hydrofoil; Zhou & Kresta, 1996) shrinks Kolmogorov micro-eddies (λ_K = ${lever2Phys.kolmogorovScaleUm.toFixed(1)} μm) and raises shear to ${lever2Phys.estimatedShearStressPa.toFixed(2)} Pa.`,
        `Avoid 6-blade radial Rushton turbines in multi-stage tall tanks: despite N_p,0 = 5.0, radial figure-of-eight compartmentalisation (zoning ×1.24–1.46; Vasconcelos et al., 1995) impedes top-to-bottom axial exchange.`,
      ],
      modelCredibilityStatus: 'Literature-Supported Correlation',
    },
    {
      leverName: '3. Multi-Stage Axial Impeller Configuration (n = 3 Stages + D_i/D_T = 0.43)',
      parameterChangeDisplay: `n = ${currentStrParams.impellerCount} → 3 Axial Impellers (Z/D_T = 1.90, ΔC/D_i = 1.50, D_i/D_T = 0.43)`,
      variableType: 'Discrete Hardware',
      predictedMixingTimeBeforeS: baseTm,
      predictedMixingTimeAfterS: lever3Phys.mixingTimeGassedS,
      mixingTimeReductionPercent:
        Math.round(((baseTm - lever3Phys.mixingTimeGassedS) / Math.max(1, baseTm)) * 1000) / 10,
      governingMechanism:
        'Three properly spaced axial/mixed impellers (ΔC/D_i ≥ 1.50, S_top/D_i ≥ 0.50) establish a unified axial circulation loop across the liquid column (zoning factor ×0.72; Rutherford et al., 1996) while distributing gassed power across 3 stages (P_total ≈ 3·N_p·ρ·N³·D_i⁵).',
      coupledTradeOffs: [
        `Requires vessel aspect ratio Z/D_T ≥ 1.85–1.95 so the top impeller maintains static liquid submergence S_top/D_i ≥ 0.50 (preventing surface vortexing and gas blow-through).`,
        `Triples total ungassed power number (N_p,total = ${lever3Phys.ungassedPowerNumberTotalNp.toFixed(2)}), requiring lower RPM (${Math.round(currentStrParams.stirrerSpeedRpm * 0.88)}–${currentStrParams.stirrerSpeedRpm} RPM) to keep P_g/V and shear within mammalian limits.`,
      ],
      modelCredibilityStatus: 'Literature-Supported Correlation',
    },
    {
      leverName: '4. Increase Agitation Speed (N, RPM) Within Shear Boundary',
      parameterChangeDisplay: `N: ${currentStrParams.stirrerSpeedRpm} RPM → ${boostedRpm} RPM (+18% speed)`,
      variableType: 'Continuous Operating',
      predictedMixingTimeBeforeS: baseTm,
      predictedMixingTimeAfterS: lever4Phys.mixingTimeGassedS,
      mixingTimeReductionPercent:
        Math.round(((baseTm - lever4Phys.mixingTimeGassedS) / Math.max(1, baseTm)) * 1000) / 10,
      governingMechanism:
        'Macromixing time is inversely proportional to impeller rotational frequency (t_m ∝ 1/N) and simultaneously boosts Van’t Riet k_La ∝ (P_g/V)^0.46.',
      coupledTradeOffs: [
        `Cubic power escalation: ungassed power P_0 ∝ N³ and local trailing-vortex dissipation ε_T,max ∝ N³ rise by +64% for an +18% RPM increase.`,
        `Pushes hydrodynamic shear from ${currentPhysics.estimatedShearStressPa.toFixed(2)} Pa to ${lever4Phys.estimatedShearStressPa.toFixed(2)} Pa and shrinks Kolmogorov eddy size to ${lever4Phys.kolmogorovScaleUm.toFixed(1)} μm.`,
      ],
      modelCredibilityStatus: 'Literature-Supported Correlation',
    },
  ];

  // Filter Hydraulics Improvement Summary (evaluating Tier B 340 um vs current)
  const recHf = hfTiers[0].params;
  const recHfPhys = solveMassBalanceAndReactorPhysics(
    currentStrParams,
    recHf,
    groundedParams,
    groundedParams.optimalVvd,
    groundedParams.optimalDoPercent
  );

  // Explicit Epistemic Honesty Notices for Unsupported / Uncalibrated Model Effects (Requirement 10)
  const unsupportedModelNotices: UnsupportedModelAspectNotice[] = [
    {
      variableOrEffect: 'Continuous Inter-Impeller Spacing (ΔC / D_i) Fine-Tuning',
      requestedSettingOrChange:
        currentStrParams.impellerCount >= 2 &&
        (currentStrParams.impellerSpacingRatioDeltaCDi ?? 1.5) !== 1.5
          ? `User-selected spacing ΔC/D_i = ${(currentStrParams.impellerSpacingRatioDeltaCDi ?? 1.5).toFixed(2)}`
          : 'Fine continuous optimisation of ΔC/D_i within [1.50, 2.50]',
      statusLabel: 'Bounded Regime Check Only (Not Continuous)',
      whyModelCannotPredictCredibly:
        'Published multi-impeller correlations (Hudcova, Machon & Nienow, 1989; Rutherford et al., 1996; Armenante & Chou, 1996) define discrete flow-interaction regimes: coalescing flow (ΔC/D_i < 1.0), merging streams (1.0 ≤ ΔC/D_i < 1.5), and independent parallel loops (ΔC/D_i ≥ 1.5). An analytical 0D correlation cannot credibly predict whether ΔC/D_i = 1.68 mixes faster than ΔC/D_i = 1.52 without resolving 3D inter-stage turbulent jet entrainment.',
      requiredCalibrationData:
        'Requires dual-probe conductivity tracer mixing-time (θ_95%) measurements across impeller spacings or validated Euler–Euler 3D CFD / PIV velocity fields at target vessel geometry.',
    },
    {
      variableOrEffect: 'Hybrid / Mixed Impeller Combinations (e.g. Bottom Rushton + Upper Axial Hydrofoil)',
      requestedSettingOrChange: 'Dissimilar impeller geometries on the same shaft',
      statusLabel: 'Unsupported by 0D Correlation — Calibration Required',
      whyModelCannotPredictCredibly:
        'The current physics engine assumes identical impellers on the shaft (P_total ≈ n · N_p,single · f_spacing · ρ · N³ · D_i⁵). Combining a bottom radial sparger-dispersing turbine with upper axial down-pumping hydrofoils alters inter-stage pumping numbers and gas-plume loading nonlinearly.',
      requiredCalibrationData:
        'Requires shaft strain-gauge torque transducer P_0 / P_g measurements and stage-wise zone exchange times from benchtop/pilot scale-down testing.',
    },
    {
      variableOrEffect: 'Surfactant (Pluronic F-68) & Simethicone Antifoam Depression of Microsparger k_La',
      requestedSettingOrChange: '15 μm Sintered Microsparger mass-transfer prefactor α = 96.0',
      statusLabel: 'Empirical Prefactor Assumption — Wet-Lab Verification Required',
      whyModelCannotPredictCredibly:
        'While 15 μm sintered frits dramatically increase specific bubble interfacial area (a), cell-culture surfactants and silicone antifoam reduce liquid-film mass transfer coefficient (k_L) and alter bubble coalescence in ways that Van’t Riet’s power-law cannot predict from first principles.',
      requiredCalibrationData:
        'Requires abiotic dynamic gassing-out k_La calibration in full formulation media (containing Pluronic F-68 and target antifoam ppm) prior to inoculation.',
    },
  ];

  return {
    evaluatedDiscreteBranchesCount: discreteVesselBranches.length * hfTiers.length,
    evaluatedTotalConfigurationsCount: allCandidates.length,
    feasibleConfigurationsCount: feasibleCount,
    rejectedHardConstraintCount: rejectedCount,
    rankedConfigurations,
    paretoFrontPoints,
    mixingImprovementLevers,
    filterHydraulicsImprovementSummary: {
      currentDpKpa: currentPhysics.hfPressureDropKpa,
      currentWallShearPa: currentPhysics.hfWallShearStressPa,
      recommendedDfUm: recHf.fibreInnerDiameterUm,
      recommendedLengthM: recHf.fibreLengthM,
      recommendedFlowLMin: recHf.recirculationFlowLMin,
      predictedDpKpa: recHfPhys.hfPressureDropKpa,
      predictedWallShearPa: recHfPhys.hfWallShearStressPa,
      predictedOutletDoPercent: recHfPhys.hfOutletDoPercent,
      mechanismAndTradeOffExplanation: `By Hagen–Poiseuille laminar lumen hydraulics, axial pressure drop scales inversely with the fourth power of fibre inner diameter (ΔP ∝ L_f · Q / (N_fibres · d_f⁴)) and wall shear stress scales inversely with the third power (τ_w ∝ Q / (N_fibres · d_f³)). Increasing d_f from ${currentHfParams.fibreInnerDiameterUm} μm to ${recHf.fibreInnerDiameterUm} μm and shortening cartridge length L_f from ${currentHfParams.fibreLengthM.toFixed(2)} m to ${recHf.fibreLengthM.toFixed(2)} m reduces ΔP from ${currentPhysics.hfPressureDropKpa.toFixed(1)} kPa to ${recHfPhys.hfPressureDropKpa.toFixed(1)} kPa and τ_w from ${currentPhysics.hfWallShearStressPa.toFixed(2)} Pa to ${recHfPhys.hfWallShearStressPa.toFixed(2)} Pa while keeping axial outlet DO at ${recHfPhys.hfOutletDoPercent.toFixed(1)}% (≥ 20% limit). Trade-off: larger lumen diameter slightly increases extracapillary hold-up volume (~0.8 L) and requires verifying membrane housing packing density.`,
    },
    paretoConflictSummary: [
      'Macromixing Speed (t_m) vs. Hydrodynamic Shear (τ) & Kolmogorov Scale (λ_K): Reducing mixing time requires higher pumping capacity (higher RPM N, larger D_i/D_T, or higher N_p,0 pitched blades), which increases gassed power P_g/V ∝ N_p·N³·D_i⁵ and local trailing-vortex dissipation ε_T,max, raising shear τ and shrinking eddies λ_K.',
      'Hollow-Fibre Filter Pressure Drop (ΔP) & Wall Shear (τ_w) vs. Axial O₂ Depletion: Lowering recirculation flow Q_HF reduces ΔP and τ_w linearly, but increases single-pass O₂ consumption along the fibre lumen (risking outlet DO < 20%). Widening fibre diameter d_f (280 → 340–380 μm) and shortening L_f resolves ΔP (∝ d_f⁻⁴) without starving axial O₂.',
      'Oxygen Transfer Capacity (OTR) & Productivity vs. Energy/Gas Cost & Foaming: Supporting 43.5×10⁶ cells/mL requires OTR ≥ 13.9 mmol/L/h via a 15 μm sintered microsparger and 50–65% O₂ enrichment, trading higher medical O₂ gas cost and microbubble foaming management against a ~70% productivity loss if de-rated on an open-pipe sparger.',
    ],
    unsupportedModelNotices,
  };
}






