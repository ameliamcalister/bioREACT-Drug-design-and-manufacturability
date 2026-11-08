export type DatabaseStreamName =
  | 'Europe PMC'
  | 'OpenAlex'
  | 'PubMed'
  | 'Crossref'
  | 'Semantic Scholar'
  | 'UniProt'
  | 'ChEMBL'
  | 'ClinicalTrials.gov';

export type RecordClassification =
  | 'Primary CHO Study'
  | 'Bioprocess Review'
  | 'Target / Sequence Record'
  | 'Clinical / CMC Trial'
  | 'Preprint'
  | 'Excluded (Out-of-Scope / Noise)';

export type StrictParameterClassification =
  | 'Directly measured and source-verified'
  | 'Derived from literature with documented calculation'
  | 'Researcher-provided'
  | 'Synthetic demonstration assumption'
  | 'Unverified or unknown';

export type EpistemicSourceTag =
  | StrictParameterClassification
  | 'Literature-Grounded Value'
  | 'Researcher-Supplied Value'
  | 'Engineering Assumption'
  | 'Synthetic Simulation Output';

export interface ExtractedBioprocessParameter {
  parameterKey:
    | 'q_p'
    | 'mu_max'
    | 'q_o2'
    | 'vvd_opt'
    | 'do_setpoint'
    | 'shear_limit'
    | 'kla_min'
    | 'viability_min';
  label: string;
  value: number;
  unit: string;
  dataOrigin: EpistemicSourceTag;
  sourcePassageQuote: string;
}

export interface DatabaseStreamRecord {
  id: string;
  source: DatabaseStreamName;
  mergedSources?: DatabaseStreamName[];
  accessionId: string;
  doi?: string;
  title: string;
  authorsOrSponsor: string;
  publicationDate: string;
  url: string;
  license: string;
  retrievedAt: string;
  retrievalMode: 'live_api' | 'verified_fallback';
  httpStatus: number;
  latencyMs: number;
  classification: RecordClassification;
  prismaStatus: 'Included' | 'Excluded' | 'Merged Duplicate';
  exclusionOrMergeReason?: string;
  provenanceAuditNote: string;
  summary: string;
  extractedParameters: ExtractedBioprocessParameter[];
}

export interface PrismaScreeningSummary {
  totalIdentifiedRaw: number;
  duplicatesRemovedTwoKey: number;
  recordsScreened: number;
  recordsExcluded: number;
  recordsIncluded: number;
  dedupeExamples: Array<{
    canonicalTitle: string;
    doi: string;
    sourcesMerged: DatabaseStreamName[];
    note: string;
  }>;
  exclusionLog: Array<{
    title: string;
    source: DatabaseStreamName;
    reason: string;
  }>;
}

export interface StreamStatusTelemetry {
  source: DatabaseStreamName;
  endpointUrl: string;
  status: 'online' | 'fallback_active' | 'loading';
  httpStatus: number;
  latencyMs: number;
  recordCount: number;
  license: string;
  lastChecked: string;
  errorNote?: string;
}

export interface BiologicCandidate {
  id: string;
  genericName: string;
  brandName: string;
  modality:
    | 'Monoclonal Antibody (IgG1)'
    | 'Monoclonal Antibody (IgG4)'
    | 'Hyperglycosylated Recombinant Protein'
    | 'Fc-Fusion Protein';
  drugbankOrMabId: string;
  targetUniprotId: string;
  chemblId: string;
  molecularWeightKda: number;
  expressionSystem: 'CHO-K1' | 'CHO-DG44' | 'CHO-S';
  targetAntigen: string;
  therapeuticIndication: string;
  criticalQualityAttributes: string[];
  shearSensitivity: 'Moderate (CHO mAb)' | 'High (Fragile Glycoprotein)' | 'Low-Moderate';
  oxygenDemand: 'High (Perfusion High-VCD)' | 'Moderate' | 'Very High';
  defaultGroundedParams: GroundedSimulatorParams;
}

export type CandidatePathwayMode =
  | 'established_biologic'
  | 'novel_dissertation_protein'
  | 'small_molecule_chemical';

export type ExpressionHostOption =
  | 'CHO Mammalian'
  | 'HEK293 Mammalian'
  | 'E. coli Microbial'
  | 'Pichia pastoris Yeast'
  | 'Saccharomyces cerevisiae Yeast'
  | 'Skeletal Muscle (Cultivated Meat)'
  | 'Microalgae Phototrophic'
  | 'Insect Sf9 / Baculovirus'
  | 'Unassigned — Requires Human Host Selection'
  | 'Unknown / Uncharacterised';

export interface NovelProteinDissertationProfile {
  proteinName: string;
  researcherNameAndLab: string;
  intendedApplication: string;
  molecularWeightKda: number;
  ptmAndGlycosylationRequirement:
    | 'Complex Human-like N-Glycosylation Required'
    | 'Simple Disulfide Bonds / Non-Glycosylated'
    | 'High-Mannose Acceptable'
    | 'Unknown PTM Profile';
  proposedExpressionHost: ExpressionHostOption;
  thermalStabilityMeltingTempC: number | null;
  shearSensitivityObservation: 'High (Aggregates under agitation)' | 'Moderate' | 'Low' | 'Unmeasured';
  researcherSuppliedQp: number | null; // pg/cell/day or null if unknown
  researcherSuppliedQO2: number | null; // pmol/cell/h or null if unknown
  researcherSuppliedMuMax: number | null; // h^-1 or null if unknown
  experimentalNotes: string;
  confidentialityCleared: boolean;
}

export interface NovelProteinEvaluationResult {
  isChoModelCompatible: boolean;
  isOutOfDistribution: boolean;
  abstainsFromOptimisationClaim: boolean;
  recommendedExpressionRoute: string;
  recommendedReactorArchitecture: string;
  missingParametersList: string[];
  outOfDistributionWarnings: string[];
  requiredNextWetLabMeasurements: string[];
  parameterProvenanceTable: Array<{
    parameter: string;
    valueDisplay: string;
    epistemicTag: EpistemicSourceTag | 'Missing — Requires Wet-Lab Measurement';
    note: string;
  }>;
}

export interface GroundedSimulatorParams {
  qpBase: number;
  qpSourceId: string;
  muMax: number;
  muMaxSourceId: string;
  qO2Specific: number;
  qO2SourceId: string;
  optimalVvd: number;
  vvdSourceId: string;
  optimalDoPercent: number;
  doSourceId: string;
  shearThresholdPa: number;
  shearSourceId: string;
  minKlaRequired: number;
  klaSourceId: string;
  minViabilityPercent: number;
  maxLactateGPerL: number;
  operatingTempC: number;
}

export type ReactorId =
  | 'str_perfusion'
  | 'str_fed_batch'
  | 'hollow_fibre'
  | 'packed_bed'
  | 'airlift'
  | 'wave_rocking'
  | 'microbial_high_otr_str'
  | 'tubular_helical_pbr'
  | 'flat_panel_alveolar_pbr'
  | 'open_raceway_pond';

export interface ReactorConfiguration {
  id: ReactorId;
  name: string;
  shortName: string;
  physicalArchitecture:
    | 'Stirred-Tank Vessel'
    | 'Hollow-Fibre Cartridge'
    | 'Fixed-Bed Matrix'
    | 'Pneumatic Airlift Column'
    | 'Single-Use Rocking Bag'
    | 'High-Intensity Microbial Fermenter'
    | 'Tubular Helical Photobioreactor'
    | 'Flat-Panel Alveolar Photobioreactor'
    | 'Open Raceway Pond';
  operatingMode:
    | 'Perfusion (Continuous)'
    | 'Fed-Batch'
    | 'Continuous Perfusion'
    | 'Recirculating Perfusion'
    | 'Fed-Batch / Perfusion'
    | 'High-Density Fed-Batch / Chemostat'
    | 'Phototrophic Continuous / Semi-Continuous';
  cellRetentionSystem: string;
  retentionFactorR: number;
  isShortlistedPrimary: boolean;
  scaleRangeL: [number, number];
  klaRangePerHour: [number, number];
  typicalShearStressPa: number;
  maxShearStressPa: number;
  peakVcdMillionsPerMl: number;
  volumetricProductivityGPerLDay: number;
  specificPowerInputWPerM3: number;
  foulingRiskScore: number;
  massTransferGradientScore: number;
  scalabilityScore: number;
  oxygenTransferScore: number;
  shearSafetyScore: number;
  productivityScore: number;
  cellRetentionScore: number;
  costEfficiencyScore: number;
  howItWorks: string;
  distinctionNote: string;
  mainLimitations: string[];
  literatureBenchmarkRef: string;
}

export interface EngineeringConstraints {
  targetScaleL: number;
  minKlaPerHour: number;
  maxShearStressPa: number;
  minVolumetricProductivityGPerLDay: number;
  minViabilityPercent: number;
  requireContinuousRetention: boolean;
  weights: {
    productivity: number;
    oxygenTransfer: number;
    shearSafety: number;
    scalability: number;
    cellRetention: number;
  };
}

export interface ReactorScreeningEvaluation {
  reactor: ReactorConfiguration;
  overallWeightedScore: number;
  status: 'Recommended' | 'Pass with Trade-offs' | 'Constraint Violation';
  checks: {
    biologicalCompatibilityOk?: boolean;
    scaleOk: boolean;
    klaOk: boolean;
    shearOk: boolean;
    productivityOk: boolean;
    retentionOk: boolean;
  };
  passReasons: string[];
  failOrCautionReasons: string[];
}

export type ImpellerType = 'marine_axial' | 'pitched_blade' | 'rushton_radial';

export interface ImpellerGeometrySpec {
  id: ImpellerType;
  name: string;
  shortLabel: string;
  flowPatternLabel: string;
  bladeCount: number;
  bladePitchOrAngle: string;
  bladeWidthToDiameterRatio: string;
  standardBafflingAssumption: string;
  unbaffledVortexPenaltyFactor: number;
  defaultTurbulentNp0: number;
  literatureTurbulentNpRange: [number, number];
  turbulentRegimeThresholdRe: number;
  transitionalSupportedMinRe: number;
  transitionalCorrelationDescription: string;
  trailingVortexEnergyFactorPhi: number;
  shearPhysicsNote: string;
  primaryNpCitations: string[];
  gassedPowerCitation: string;
  turbulentShearCitations: string[];
  epistemicAssumptionNote: string;
}

export interface StirredTankPhysicsParams {
  workingVolumeL: number;
  impellerType: ImpellerType;
  impellerCount: number;
  diameterRatioDiDt: number;
  aspectRatioZDt: number;
  stirrerSpeedRpm: number;
  spargeRateVvm: number;
  oxygenEnrichmentFraction: number;
  targetVcdE6PerMl: number;
  spargerType?: 'open_pipe' | 'sintered_microsparger';
  customTurbulentNp?: number;
  bafflingMode?: 'standard_4_baffles' | 'unbaffled_surface_vortex';
  klaMode?: 'calculated_vant_riet' | 'assumed_manual';
  assumedKlaPerHour?: number;
  bottomClearanceRatioC1Di?: number;
  impellerSpacingRatioDeltaCDi?: number;
  multiImpellerPowerModel?: 'independent_additive' | 'spacing_interaction_corrected';
}

export interface HollowFibrePhysicsParams {
  cartridgeVolumeL: number;
  fibreInnerDiameterUm: number;
  fibreLengthM: number;
  numberOfFibres: number;
  recirculationFlowLMin: number;
  inletDoPercent: number;
  oxygenEnrichmentFraction: number;
  ecsCellDensityE6PerMl: number;
}

export interface DownstreamEconomicParams {
  campaignDaysPerYear: number;
  mediaCostPerLiterUsd: number;
  clarificationYieldPercent: number;
  proteinACaptureYieldPercent: number;
  viralInactivationAndPolishingYieldPercent: number;
  annualFacilityAndConsumablesMusd: number;
  annualDownstreamPurificationMusd: number;
}

export interface DownstreamCogsResult {
  overallDownstreamYieldPercent: number;
  annualUpstreamHarvestKg: number;
  annualRecoveredDrugSubstanceKg: number;
  annualMediaVolumeKL: number;
  annualMediaCostMusd: number;
  totalAnnualManufacturingCostMusd: number;
  cogsPerGramUsd: number;
}

export interface MassBalanceAndPhysicsResult {
  tankDiameterM: number;
  impellerDiameterM: number;
  liquidHeightM: number;
  impellerCount: number;
  bottomClearanceC1M: number;
  bottomClearanceRatioC1Di: number;
  bottomClearanceRatioC1Dt: number;
  impellerSpacingDeltaCM: number;
  impellerSpacingRatioDeltaCDi: number;
  topImpellerSubmergenceM: number;
  topImpellerSubmergenceRatioStopDi: number;
  powerNumberNp: number;
  turbulentReferenceNp0: number;
  bafflingFactor: number;
  reynoldsCorrectedSingleNp: number;
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
  tipSpeedMPerS: number;
  reynoldsNumber: number;
  flowRegimeClassification:
    | 'Fully Turbulent (Re ≥ 10,000)'
    | 'Transitional (200 ≤ Re < 10,000) — Re-Dependent Correlation Active'
    | 'Out of Calibrated Range (Re < 200 — Laminar / Uncalibrated)';
  isReynoldsOutOfRange: boolean;
  ungassedPowerW: number;
  ungassedSpecificPowerWPerM3: number;
  gassedPowerW: number;
  specificPowerWPerM3: number;
  superficialGasVelocityMPerS: number;
  meanEnergyDissipationWPerKg: number;
  localMaxEnergyDissipationWPerKg: number;
  trailingVortexFactorPhi: number;
  kolmogorovScaleUm: number;
  estimatedShearStressPa: number;
  mixingTimeUngassedS: number;
  mixingTimeGassedS: number;
  oxygenTransferTimeConstantS: number;
  isMixingRateLimiting: boolean;
  klaModeUsed: 'calculated_vant_riet' | 'assumed_manual';
  vantRietCalculatedKlaPerHour: number;
  klaPerHour: number;
  klaPerSecond: number;
  cStarO2MmolPerL: number;
  cLiquidO2MmolPerL: number;
  otrMmolPerLHour: number;
  ourMmolPerLHour: number;
  oxygenMarginMmolPerLHour: number;
  maxSupportedVcdOnAirE6: number;
  maxSupportedVcdAtCurrentGasE6: number;
  steadyStateGrowthRatePerDay: number;
  requiredBleedRateVvd: number;
  cellSpecificPerfusionRatePlCellDay: number;
  hfLumenVelocityMPerS: number;
  hfPressureDropKpa: number;
  hfWallShearRatePerS: number;
  hfWallShearStressPa: number;
  hfOutletDoPercent: number;
  hfAxialOxygenDepleted: boolean;
  isScaleUpFeasible: boolean;
  limitingFactors: string[];
  automatedPipelineNextSteps: string[];
}

export interface OperatingWindowPoint {
  vs_m_s: number;
  vvm: number;
  minPvForOtrWPerM3: number;
  minPvForMixingWPerM3: number;
  maxPvForShearWPerM3: number;
  maxPvForFoamingWPerM3: number;
  floodingMinPvWPerM3: number;
  isCo2StrippingSufficient: boolean;
}

export type AcquisitionStrategy =
  | 'Initial LHS Design'
  | 'Constrained BO (EI × P_feas)'
  | 'Flat-Penalty GP (-500)'
  | 'Random Search'
  | 'Engineer Manual Probe';

export interface ExperimentObservation {
  iteration: number;
  x1_vvd: number;
  x2_do: number;
  tempC: number;
  volumetricProductivityMgLDay: number; // Synthetic objective score (value units/L/day)
  meanVolumetricProductivityMgPerLPerDay?: number; // True physical X_v * q_p (mg/L/day)
  viableCellDensityE6: number;
  cellViabilityPercent: number;
  lactateGPerL: number;
  shearStressPa: number;
  galactosylationIndexPercent: number;
  otrMmolPerLHour: number;
  ourMmolPerLHour: number;
  continuousConstraintMargin: number;
  gpPredictedMean: number;
  gpPredictedStd: number;
  probFeasible: number;
  expectedImprovement: number;
  constrainedAcquisitionScore: number;
  isFeasible: boolean;
  violationReasons: string[];
  strategy: AcquisitionStrategy;
}

export interface SurrogateGridCell {
  x1_vvd: number;
  x2_do: number;
  meanProductivity: number;
  stdDev: number;
  probFeasible: number;
  constraintMarginMean: number;
  constrainedEI: number;
  flatPenaltyEI: number;
  trueProductivity: number;
  trueVolumetricProductivityMgLDay?: number;
  trueFeasible: boolean;
}

export interface SeedBenchmarkPoint {
  iteration: number;
  constrainedBoMean: number;
  constrainedBoStd: number;
  flatPenaltyGpMean: number;
  flatPenaltyGpStd: number;
  randomSearchMean: number;
  randomSearchStd: number;
}

export interface SameSeedComparisonResult {
  seed: number;
  budget: number;
  boTrajectory: ExperimentObservation[];
  randomTrajectory: ExperimentObservation[];
  flatPenaltyTrajectory: ExperimentObservation[];
  boBestRunning: number[];
  randomBestRunning: number[];
  flatPenaltyBestRunning: number[];
  boPhysicalBestRunning: number[];
  randomPhysicalBestRunning: number[];
  boFinalBest: number;
  randomFinalBest: number;
  flatPenaltyFinalBest: number;
  boFinalPhysicalBestMgLDay: number;
  randomFinalPhysicalBestMgLDay: number;
  flatPenaltyFinalPhysicalBestMgLDay: number;
  boBestObservation: ExperimentObservation | null;
  randomBestObservation: ExperimentObservation | null;
  flatPenaltyBestObservation: ExperimentObservation | null;
  boViolationCount: number;
  randomViolationCount: number;
  flatPenaltyViolationCount: number;
}

export interface EightSeedMethodStats {
  methodName: string;
  finalScoreMean: number;
  finalScoreStd: number;
  finalPhysicalMgLDayMean: number;
  finalPhysicalMgLDayStd: number;
  violationsCountMean: number;
  violationsCountStd: number;
  feasibleRatePercentMean: number;
  seedsWonCount: number;
}

export interface LiveEightSeedBenchmarkSummary {
  budget: number;
  seedCount: number;
  trajectoryPoints: SeedBenchmarkPoint[];
  constrainedBoStats: EightSeedMethodStats;
  randomSearchStats: EightSeedMethodStats;
  flatPenaltyGpStats: EightSeedMethodStats;
}

export type SafetyGateId = 'gate1_candidate' | 'gate2_reactor' | 'gate3_optimiser' | 'gate4_protocol' | 'gate5_report';

export type SafetyGateStatus = 'Approved' | 'Pending Review' | 'Changes Requested' | 'Rejected';

export interface HumanSafetyGate {
  id: SafetyGateId;
  gateNumber: number;
  title: string;
  reviewerRole: string;
  whatMustBeApproved: string;
  status: SafetyGateStatus;
  reviewerName: string;
  timestamp: string;
  justification: string;
  automaticRiskFlags: string[];
  approvedWhileOtrDeficit?: boolean;
  postSignOffValidationWarning?: string;
}

export interface WorkflowTimelineStep {
  stepNumber: number;
  manualTitle: string;
  manualInputs: string;
  manualOutputs: string;
  manualHumanInvolvement: string;
  manualIllustrativeMinutes: number;
  bioreactTitle: string;
  bioreactInputs: string;
  bioreactOutputs: string;
  bioreactHumanInvolvement: string;
  bioreactIllustrativeMinutes: number;
  dependencies: string;
}

export interface MeasuredBenchmarkRecord {
  id: string;
  participantName: string;
  workflowMode: 'Manual Baseline' | 'bioREACT-Assisted';
  elapsedMinutes: number;
  evidenceAccuracyPercent: number;
  constraintViolationsCount: number;
  humanCorrectionsCount: number;
  notes: string;
  recordedAt: string;
  isIllustrativeDemo?: boolean;
  verificationStatus?:
    | 'Illustrative Demo Data'
    | 'Illustrative Usability Study — Not Yet Conducted'
    | 'Recorded via Live Stopwatch';
}

export interface EngineeringInvestigationRow {
  failureMode: string;
  isCurrentlyViolated: boolean;
  physicalReason: string;
  violatedEquationOrThreshold: string;
  candidateVariablesToInvestigate: string[];
  interactingTradeOffs: string[];
  requiredValidationExperiment: string;
}

export interface AgentToolStepLog {
  stepNumber: number;
  toolName:
    | 'gather_evidence'
    | 'profile_product'
    | 'screen_reactors'
    | 'solve_mass_balance'
    | 'suggest_next_experiment';
  status: 'completed' | 'running';
  durationMs: number;
  inputsSummary: string;
  outputsSummary: string;
  timestamp: string;
}

export interface AgentSynthesisReport {
  generatedAt: string;
  mode: 'gemini_live' | 'deterministic_orchestrator';
  modelUsed: string;
  executiveSummary: string;
  stage1ProductBrief: string;
  stage2ReactorRationale: string;
  stage3OptimisationAnalysis: string;
  recommendedNextWetLabProtocol: {
    reactorConfig: string;
    perfusionRateVvd: number;
    doSetpointPercent: number;
    temperatureC: number;
    predictedProductivityMgLDay: number;
    predictedViabilityPercent: number;
    probFeasible: number;
    controlAssays: string[];
  };
  validationStatement: {
    level1Software: string;
    level2Computational: string;
    level3ExperimentalGap: string;
  };
  citationsUsed: string[];
}

/**
 * Multi-Organism Biomanufacturing Platform Architecture Types
 * Separates Biology (Organism Process Models) from Reactor Screening & Bayesian Optimisation
 */
export type OrganismSystemId =
  | 'cho_mammalian'
  | 'hek293_mammalian'
  | 'ecoli_microbial'
  | 'pichia_yeast'
  | 'saccharomyces_yeast'
  | 'skeletal_muscle_cultivated_meat'
  | 'microalgae_phototrophic';

export type ModelReadinessLevel =
  | 'Supported computational demonstration'
  | 'Research-stage model with unverified assumptions'
  | 'Insufficient data for quantitative optimisation'
  | 'Outside supported model domain';

export interface OrganismSpecificKineticParameter {
  key: string;
  symbol: string;
  label: string;
  value: number | null;
  unit: string;
  sourceTag: EpistemicSourceTag | 'Missing — Requires Wet-Lab Measurement';
  citationOrNote: string;
}

export interface OrganismProcessModelProfile {
  id: OrganismSystemId;
  organismName: string;
  scientificName: string;
  shortBadge: string;
  category:
    | 'Mammalian Suspension / Perfusion'
    | 'Mammalian Viral Vector / Transient'
    | 'Prokaryotic Microbial Fermentation'
    | 'Eukaryotic Methylotrophic / Secretory Yeast'
    | 'Eukaryotic Crabtree-Positive Yeast'
    | 'Anchorage-Dependent Cultivated Meat Myoblasts'
    | 'Photoautotrophic Microalgae';
  exemplarProduct: string;
  modelReadiness: ModelReadinessLevel;
  modelValidationBanner: string;
  quantitativeOptimisationAllowedByDefault: boolean;
  whyChoParametersCannotBeReused: string;
  engineeringObjectives: string[];
  governingEquationsSummary: string[];
  biomassUnit: '10⁶ cells/mL' | 'g DCW/L';
  defaultTargetBiomass: number;
  specificGrowthRateMuMaxPerHour: number;
  specificO2RateValue: number; // positive = O2 uptake, negative = photosynthetic O2 evolution
  specificO2RateUnit: 'pmol/cell/h' | 'mmol O₂/g DCW/h';
  specificCO2FixationRateMmolPerGDcwHour?: number;
  metabolicHeatPerMmolO2Kj: number;
  shearThresholdPa: number;
  kolmogorovLimitUm: number;
  optimalTempC: number;
  optimalPh: number;
  primaryMetaboliteLimitLabel: string;
  primaryMetaboliteLimitValue: string;
  lightIntensityUmolM2S?: number;
  opticalExtinctionCoeffLPerGDcwM?: number;
  maxOpticalPathLengthM?: number;
  parameters: OrganismSpecificKineticParameter[];
  hardConstraints: string[];
  evidenceRequirements: string[];
  applicableReactorIds: ReactorId[];
  inapplicableReactorReasons: Record<string, string>;
}

export interface OrganismMassBalanceResult {
  organismId: OrganismSystemId;
  workingVolumeL: number;
  biomassConcentration: number;
  biomassUnit: '10⁶ cells/mL' | 'g DCW/L';
  otrMmolPerLHour: number;
  ourMmolPerLHour: number;
  oxygenBalanceMarginMmolPerLHour: number;
  klaPerHour: number;
  estimatedShearStressPa: number;
  shearThresholdPa: number;
  kolmogorovScaleUm: number;
  kolmogorovLimitUm: number;
  mixingTimeGassedS: number;
  metabolicHeatLoadKw: number;
  maxJacketCoolingCapacityKw: number;
  isCoolingFeasible: boolean;
  // Microalgae phototrophic fields
  isPhototrophic: boolean;
  meanLightIntensityUmolM2S?: number;
  photicZoneFractionPercent?: number;
  co2TransferRateMmolPerLHour?: number;
  co2UptakeRateMmolPerLHour?: number;
  dissolvedO2AccumulationPercentAir?: number;
  // Overall feasibility
  isFeasible: boolean;
  violatedConstraints: string[];
  engineeringRecommendations: string[];
}

export interface UploadedExperimentalRow {
  runId: string;
  timeHours: number;
  biomassValue: number;
  biomassUnit: string;
  titerOrProductMgL: number;
  dissolvedOxygenPercent: number;
  specificO2UptakeMeasured: number;
  specificProductivityMeasured: number;
  lactateOrByproductGPerL: number;
  viabilityPercent: number;
}

export interface ResearcherCandidateApprovalState {
  molecularIdentityApproved: boolean;
  expressionHostApproved: boolean;
  literatureReferencesApproved: boolean;
  experimentalParametersApproved: boolean;
  approverName: string;
  approverRole: string;
  approvedTimestamp: string | null;
}

export type ManufacturingRouteParadigm =
  | 'Mammalian-Cell Cultivation'
  | 'Microbial Fermentation'
  | 'Phototrophic Cultivation'
  | 'Non-Biological Chemical Synthesis';

export type ProductRouteArchetypeId =
  | 'pharma_igg_mab'
  | 'disulfide_scfv_or_fab'
  | 'peptide_hormone_or_vlp'
  | 'viral_vector_or_human_sialo'
  | 'small_molecule_sulfonamide'
  | 'cultivated_muscle_biomass'
  | 'algal_carotenoid_or_antigen';

export interface HostRouteEvaluationEntry {
  hostId: OrganismSystemId | 'chemical_synthesis';
  hostName: string;
  scientificName: string;
  paradigm: ManufacturingRouteParadigm;
  suitabilityVerdict:
    | 'Primary Recommended Route'
    | 'Viable Alternative with Trade-Offs'
    | 'Biologically Incompatible for Intended Product'
    | 'Requires Non-Biological Chemical Synthesis';
  modelStatusLabel:
    | 'Supported Computational Demo (CHO Perfusion)'
    | 'Research-Stage Model — Quantitative BO Locked'
    | 'Unsupported in Bioprocess Simulator (Chemical Route)';
  whyCouldOrCouldNotProduce: string;
  proteinFoldingAndPtmRequirements: string;
  cultivationAndDownstreamChallenges: string[];
  compatibleReactorConfigurations: string[];
  incompatibleReactorsNote: string;
  missingScientificData: string[];
  choParameterIsolationNote: string;
}

export type AuditableParameterId =
  | 'q_p'
  | 'q_o2'
  | 'kla'
  | 'tau_crit'
  | 'mu_max'
  | 'np_0'
  | 'vvd_ref'
  | 'do_ref';

export interface AuditedParameterProvenanceRecord {
  parameterId: AuditableParameterId;
  symbol: string;
  name: string;
  currentValue: number;
  defaultValue: number;
  unit: string;
  classification: StrictParameterClassification;
  isPriorityFourAudit: boolean;
  publicationTitle: string;
  authorsAndYear: string;
  doiOrUrl: string;
  databaseId: string;
  supportingSectionOrTable: string;
  exactSourceEvidenceAndAudit: string;
  originalReportedValueAndUnits: string;
  unitTransformationFormula: string;
  biologicalSystemContext: string;
  experimentalConditions: string;
  uncertaintyAndRange: string;
  validCalibrationRange: [number, number];
  downstreamCausalChain: {
    step1MassBalance: string;
    step2FeasibilityConstraint: string;
    step3OptimisationImpact: string;
    step4CogsEconomicImpact: string;
  };
  researcherChallengeJustification?: string;
}

export interface ParameterChallengeSnapshot {
  parameterId: AuditableParameterId;
  symbol: string;
  unit: string;
  beforeValue: number;
  afterValue: number;
  beforeClassification: StrictParameterClassification;
  afterClassification: StrictParameterClassification;
  researcherJustification: string;
  timestampUtc: string;
  beforeMetrics: {
    ourMmolPerLHour: number;
    otrMmolPerLHour: number;
    oxygenMarginMmolPerLHour: number;
    klaPerHour: number;
    shearStressPa: number;
    shearLimitPa: number;
    isScaleUpFeasible: boolean;
    bestBoScoreUnits: number;
    bestPhysicalMgLDay: number;
    recommendedVvd: number;
    recommendedDoPercent: number;
    infeasibleTrialsCount: number;
    cogsPerGramUsd: number;
  };
  afterMetrics: {
    ourMmolPerLHour: number;
    otrMmolPerLHour: number;
    oxygenMarginMmolPerLHour: number;
    klaPerHour: number;
    shearStressPa: number;
    shearLimitPa: number;
    isScaleUpFeasible: boolean;
    bestBoScoreUnits: number;
    bestPhysicalMgLDay: number;
    recommendedVvd: number;
    recommendedDoPercent: number;
    infeasibleTrialsCount: number;
    cogsPerGramUsd: number;
  };
}

export interface ScientificConsistencyCheckItem {
  id: string;
  category:
    | 'Oxygen Balance'
    | 'Dimensional & Unit Consistency'
    | 'Host-Specific Applicability'
    | 'Reactor & Impeller Geometry'
    | 'Parameter Extrapolation Bounds'
    | 'Epistemic Provenance Verification';
  title: string;
  status: 'Verified Pass' | 'Warning / Extrapolated' | 'Failed / Violated';
  equationOrRule: string;
  currentDiagnostic: string;
  remediationAction: string;
}

export type RecommendationDecisionLevel =
  | 'LEVEL_1_SUFFICIENT_EVIDENCE'
  | 'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
  | 'LEVEL_3_ABSTAIN_INSUFFICIENT_EVIDENCE';

export type ProposedExperimentObjectiveRole =
  | 'EXPLOITATION_OPTIMUM'
  | 'EXPLORATION_INFO_GAIN'
  | 'PRODUCTIVITY_COST_TRADEOFF';

export interface ProposedNextExperimentRecipe {
  id: string;
  rank: 1 | 2 | 3;
  codeLabel: 'Experiment A' | 'Experiment B' | 'Experiment C';
  title: string;
  subtitlePurpose: string;
  objectiveRole: ProposedExperimentObjectiveRole;
  selectionMethodLabel: string;
  isDynamicallyComputed: boolean;
  decisionLevelForCandidate: RecommendationDecisionLevel;
  operatingVector: {
    reactorId: ReactorId;
    reactorName: string;
    workingVolumeL: number;
    spargerType: 'open_pipe' | 'sintered_microsparger';
    spargerLabel: string;
    impellerType: ImpellerType;
    impellerLabel: string;
    impellerCount: 1 | 2 | 3;
    agitationRpm: number;
    spargeRateVvm: number;
    inletO2Percent: number;
    targetVcdE6PerMl: number;
    perfusionRateVvd: number;
    doSetpointPercent: number;
    operatingTempC: number;
  };
  predictions: {
    gpCompositeScoreMean: number;
    gpCompositeScoreStd: number;
    gpCompositeCredibleInterval95: [number, number];
    volumetricProductivityMeanMgLDay: number;
    volumetricProductivityEpistemicStdMgLDay: number;
    volumetricProductivityAleatoricStdMgLDay: number;
    volumetricProductivityTotalStdMgLDay: number;
    volumetricProductivityCredibleInterval95MgLDay: [number, number];
    uncertaintySourceDisclosure: string;
    predictedOtrMmolPerLHour: number;
    predictedOurMmolPerLHour: number;
    oxygenMarginMmolPerLHour: number;
    predictedKlaPerHour: number;
    predictedShearStressPa: number;
    shearLimitPa: number;
    shearMarginPa: number;
    predictedMixingTimeS: number;
    specificPowerWPerM3: number;
    predictedViabilityPercent: number;
    predictedLactateGPerL: number;
    estimatedUsableCogsPerGramUsd: number;
    annualRecoveredKg: number;
  };
  probabilisticConstraints: {
    probOtrGeqOur: number | null;
    probShearSafe: number | null;
    probMixingSafe: number | null;
    gpSurrogateProbFeasible: number;
    jointFeasibilityProbability: number;
    isProbabilisticO2SafeAt95: boolean;
    isUncertaintyQuantifiedForO2: boolean;
    uncertaintyPropagationNote: string;
  };
  whySelectedSummary: string;
  acquisitionScoreValue: number;
  acquisitionMetricName: string;
  engineeringTradeOffs: string[];
  wetLabValidationChecks: string[];
}

export interface GpCalibrationHoldoutPoint {
  pointId: number;
  x1_vvd: number;
  x2_do: number;
  trueSimulatorScore: number;
  gpMeanScore: number;
  gpStdScore: number;
  ci68Lower: number;
  ci68Upper: number;
  ci95Lower: number;
  ci95Upper: number;
  within68Ci: boolean;
  within95Ci: boolean;
  standardizedZError: number;
}

export interface GpUncertaintyCalibrationReport {
  holdoutSampleCount: number;
  empiricalCoverage68Percent: number;
  empiricalCoverage95Percent: number;
  nominal68TargetPercent: 68.3;
  nominal95TargetPercent: 95.0;
  rmseCompositeScore: number;
  meanAbsoluteZScore: number;
  calibrationStatus:
    | 'Well-Calibrated Simulator Surrogate (Empirical 95% Coverage within 88–100%)'
    | 'Under-Dispersed / Overconfident Surrogate (Empirical Coverage < 88%)'
    | 'Conservative / Wide Surrogate Intervals';
  calibrationMethodDisclosure: string;
  holdoutPoints: GpCalibrationHoldoutPoint[];
}

export interface NextExperimentRecommendationSuite {
  generatedAt: string;
  engineVersion: string;
  decisionLevel: RecommendationDecisionLevel;
  decisionBadge: string;
  decisionTitle: string;
  decisionSummary: string;
  abstentionDiagnostics: {
    isAbstaining: boolean;
    primaryReasons: string[];
    missingParametersOrEvidence: string[];
    highestPriorityWetLabMeasurements: string[];
    whySmallGpVarianceDoesNotProveValidity: string;
  };
  uncertaintyDecompositionSummary: {
    epistemicMeanStdMgLDay: number;
    aleatoricAssayNoiseStdMgLDay: number;
    evidenceApplicabilityStatus: string;
    epistemicExplanation: string;
    aleatoricExplanation: string;
    evidenceExplanation: string;
  };
  calibrationReport: GpUncertaintyCalibrationReport;
  proposedExperiments: ProposedNextExperimentRecipe[];
}

export type ReactorOptimisationObjectivePresetId =
  | 'balanced_all_constraints'
  | 'minimise_mixing_and_filter_dp'
  | 'maximise_otr_and_productivity'
  | 'minimise_shear_cell_protection'
  | 'balance_productivity_energy_cost';

export interface ReactorOptimisationObjectiveWeights {
  minimiseMixingTime: number; // 0 to 100
  minimiseFilterPressureDrop: number; // 0 to 100
  maximiseOxygenTransfer: number; // 0 to 100
  minimiseShearStress: number; // 0 to 100
  balanceProductivityAndCost: number; // 0 to 100
}

export interface UnsupportedModelAspectNotice {
  variableOrEffect: string;
  requestedSettingOrChange: string;
  statusLabel:
    | 'Unsupported by 0D Correlation — Calibration Required'
    | 'Bounded Regime Check Only (Not Continuous)'
    | 'Empirical Prefactor Assumption — Wet-Lab Verification Required';
  whyModelCannotPredictCredibly: string;
  requiredCalibrationData: string;
}

export interface MixingImprovementLeverAnalysis {
  leverName: string;
  parameterChangeDisplay: string;
  variableType: 'Discrete Hardware' | 'Continuous Operating' | 'Geometric Ratio';
  predictedMixingTimeBeforeS: number;
  predictedMixingTimeAfterS: number;
  mixingTimeReductionPercent: number;
  governingMechanism: string;
  coupledTradeOffs: string[];
  modelCredibilityStatus: 'Literature-Supported Correlation' | 'Bounded Regime Check Only';
}

export interface ProposedReactorConfiguration {
  id: string;
  rank: 1 | 2 | 3;
  title: string;
  strategyBadge: string;
  paretoRoleLabel: string;
  summaryRationale: string;
  compositeObjectiveScore: number;
  objectiveBreakdown: {
    mixingScore: number;
    filterHydraulicsScore: number;
    oxygenTransferScore: number;
    shearSafetyScore: number;
    productivityCostScore: number;
  };
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  evalPhysics: MassBalanceAndPhysicsResult;
  evalCogs: DownstreamCogsResult;
  radarLoadPercentages: {
    oxygenLoadPct: number;
    shearLoadPct: number;
    mixingLoadPct: number;
    eddyLoadPct: number;
    aerationLoadPct: number;
    filterHydraulicsLoadPct: number;
    maxAxisLoadPct: number;
  };
  keyVariableChangesFromCurrent: string[];
  competingObjectiveTradeOffs: string[];
  epistemicClassificationNotes: {
    literatureVerifiedLimitsUsed: string[];
    designAssumptionsUsed: string[];
  };
}

export interface UnifiedReactorOptimisationSuite {
  evaluatedDiscreteBranchesCount: number;
  evaluatedTotalConfigurationsCount: number;
  feasibleConfigurationsCount: number;
  rejectedHardConstraintCount: number;
  rankedConfigurations: ProposedReactorConfiguration[];
  paretoFrontPoints: Array<{
    id: string;
    label: string;
    isTopThreeRank?: 1 | 2 | 3;
    isCurrentConfig?: boolean;
    isFeasible: boolean;
    mixingTimeGassedS: number;
    shearStressPa: number;
    oxygenMarginMmolPerLHour: number;
    hfPressureDropKpa: number;
    hfWallShearPa: number;
    specificPowerWPerM3: number;
    volumetricProductivityGPerLDay: number;
    cogsPerGramUsd: number;
    maxRadarLoadPct: number;
  }>;
  mixingImprovementLevers: MixingImprovementLeverAnalysis[];
  filterHydraulicsImprovementSummary: {
    currentDpKpa: number;
    currentWallShearPa: number;
    recommendedDfUm: number;
    recommendedLengthM: number;
    recommendedFlowLMin: number;
    predictedDpKpa: number;
    predictedWallShearPa: number;
    predictedOutletDoPercent: number;
    mechanismAndTradeOffExplanation: string;
  };
  paretoConflictSummary: string[];
  unsupportedModelNotices: UnsupportedModelAspectNotice[];
}


