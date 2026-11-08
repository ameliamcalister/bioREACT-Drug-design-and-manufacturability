import React, { useState } from 'react';
import {
  AuditedParameterProvenanceRecord,
  BiologicCandidate,
  CandidatePathwayMode,
  NextExperimentRecommendationSuite,
  OrganismSystemId,
  ProposedNextExperimentRecipe,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  formatCogsHeadline,
  REPRODUCIBILITY_MANIFEST,
} from '../services/bioprocessEngine';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
} from 'lucide-react';

interface NextExperimentRecommendationsPanelProps {
  candidate: BiologicCandidate;
  recommendationSuite: NextExperimentRecommendationSuite;
  strParams: StirredTankPhysicsParams;
  provenanceLedger: AuditedParameterProvenanceRecord[];
  selectedOrganismId: OrganismSystemId;
  candidatePathwayMode: CandidatePathwayMode;
  onApplyExperimentHardwareToStage5: (recipe: ProposedNextExperimentRecipe) => void;
  onExecuteReviewedExperimentInBo: (
    recipe: ProposedNextExperimentRecipe,
    reviewerName: string,
    reviewerNotes: string
  ) => void;
  onTriggerAbstentionDemo?: () => void;
  onRestoreCalibratedChoModel?: () => void;
  compactContext?: 'stage5_feasibility' | 'stage6_optimiser';
}

export const NextExperimentRecommendationsPanel: React.FC<
  NextExperimentRecommendationsPanelProps
> = ({
  candidate,
  recommendationSuite,
  strParams,
  provenanceLedger,
  selectedOrganismId,
  candidatePathwayMode,
  onApplyExperimentHardwareToStage5,
  onExecuteReviewedExperimentInBo,
  onTriggerAbstentionDemo,
  onRestoreCalibratedChoModel,
  compactContext = 'stage6_optimiser',
}) => {
  const [selectedExpIndex, setSelectedExpIndex] = useState<number>(0);
  const [showCalibrationTable, setShowCalibrationTable] = useState<boolean>(false);
  const [humanReviewerName, setHumanReviewerName] = useState<string>(
    'Dr. E. Vance (Lead Bioprocess Engineer)'
  );
  const [humanReviewNotes, setHumanReviewNotes] = useState<string>(
    'Checked CHO host applicability, dynamic gassing-out k_La pre-check requirement, and OTR >= OUR probabilistic margin.'
  );
  const [humanSafetyChecklist, setHumanSafetyChecklist] = useState<{
    hostApplicabilityChecked: boolean;
    oxygenAndShearLimitsChecked: boolean;
    notAutonomousExecutionConfirmed: boolean;
  }>({
    hostApplicabilityChecked: true,
    oxygenAndShearLimitsChecked: true,
    notAutonomousExecutionConfirmed: true,
  });
  const [approvedExperimentIds, setApprovedExperimentIds] = useState<
    Record<string, { reviewer: string; timestamp: string; notes: string }>
  >({});
  const [lastLoggedFeedbackBanner, setLastLoggedFeedbackBanner] = useState<string | null>(
    null
  );

  // Allow user to request custom adjustments to the selected candidate before staging
  const activeExp: ProposedNextExperimentRecipe | undefined =
    recommendationSuite.proposedExperiments[selectedExpIndex] ||
    recommendationSuite.proposedExperiments[0];

  const [customVvdOverride, setCustomVvdOverride] = useState<number | null>(null);
  const [customDoOverride, setCustomDoOverride] = useState<number | null>(null);
  const [customRpmOverride, setCustomRpmOverride] = useState<number | null>(null);
  const [customO2Override, setCustomO2Override] = useState<number | null>(null);

  const effectiveExp: ProposedNextExperimentRecipe | undefined = activeExp
    ? {
        ...activeExp,
        operatingVector: {
          ...activeExp.operatingVector,
          perfusionRateVvd:
            customVvdOverride ?? activeExp.operatingVector.perfusionRateVvd,
          doSetpointPercent:
            customDoOverride ?? activeExp.operatingVector.doSetpointPercent,
          agitationRpm:
            customRpmOverride ?? activeExp.operatingVector.agitationRpm,
          inletO2Percent:
            customO2Override ?? activeExp.operatingVector.inletO2Percent,
        },
      }
    : undefined;

  const allChecklistChecked =
    humanSafetyChecklist.hostApplicabilityChecked &&
    humanSafetyChecklist.oxygenAndShearLimitsChecked &&
    humanSafetyChecklist.notAutonomousExecutionConfirmed &&
    humanReviewerName.trim().length > 2;

  const isAbstaining =
    recommendationSuite.decisionLevel === 'LEVEL_3_ABSTAIN_INSUFFICIENT_EVIDENCE';

  const handleDownloadNextExperimentPlanMd = () => {
    const lines: string[] = [
      `# bioREACT — Uncertainty-Aware Next Experiment Plan & Abstention Audit`,
      `Generated: ${recommendationSuite.generatedAt}`,
      `Engine Version: ${recommendationSuite.engineVersion}`,
      `Candidate: ${candidate.genericName} (${candidate.brandName}) · Host: ${selectedOrganismId} · Pathway: ${candidatePathwayMode}`,
      `Decision Level: ${recommendationSuite.decisionBadge}`,
      ``,
      `## 1. Three-Level Epistemic Decision & Uncertainty Summary`,
      `- **Decision Title**: ${recommendationSuite.decisionTitle}`,
      `- **Decision Summary**: ${recommendationSuite.decisionSummary}`,
      `- **Model (Epistemic) GP Uncertainty**: ±${recommendationSuite.uncertaintyDecompositionSummary.epistemicMeanStdMgLDay} mg/L/day (mean across grid)`,
      `- **Experimental (Aleatoric) Variability**: ±${recommendationSuite.uncertaintyDecompositionSummary.aleatoricAssayNoiseStdMgLDay} mg/L/day (replicate biological + assay noise)`,
      `- **Evidence & Applicability Status**: ${recommendationSuite.uncertaintyDecompositionSummary.evidenceApplicabilityStatus}`,
      ``,
      `## 2. Held-Out Simulator GP Uncertainty Calibration (N = ${recommendationSuite.calibrationReport.holdoutSampleCount} Synthetic Points)`,
      `- **Nominal 68% GP Credible Interval (μ ± 1.0σ) Empirical Coverage**: ${recommendationSuite.calibrationReport.empiricalCoverage68Percent}% (Target: 68.3%)`,
      `- **Nominal 95% GP Credible Interval (μ ± 1.96σ) Empirical Coverage**: ${recommendationSuite.calibrationReport.empiricalCoverage95Percent}% (Target: 95.0%)`,
      `- **Composite Score RMSE**: ${recommendationSuite.calibrationReport.rmseCompositeScore} score units · Mean |z|-error: ${recommendationSuite.calibrationReport.meanAbsoluteZScore}`,
      `- **Calibration Status**: ${recommendationSuite.calibrationReport.calibrationStatus}`,
      `- **Disclosure**: ${recommendationSuite.calibrationReport.calibrationMethodDisclosure}`,
      ``,
    ];

    if (isAbstaining) {
      lines.push(
        `## 3. Scientifically Defensible Abstention Diagnostics`,
        `bioREACT abstained from proposing quantitative bioreactor operating recipes for the following reasons:`,
        ...recommendationSuite.abstentionDiagnostics.primaryReasons.map((r) => `- ${r}`),
        ``,
        `### Missing Evidence / Parameters:`,
        ...recommendationSuite.abstentionDiagnostics.missingParametersOrEvidence.map(
          (m) => `- ${m}`
        ),
        ``,
        `### Highest-Priority Wet-Lab Measurements Required Before Optimisation:`,
        ...recommendationSuite.abstentionDiagnostics.highestPriorityWetLabMeasurements.map(
          (w) => `- ${w}`
        ),
        ``,
        `### Statistical Note:`,
        `${recommendationSuite.abstentionDiagnostics.whySmallGpVarianceDoesNotProveValidity}`
      );
    } else {
      lines.push(`## 3. Ranked Proposed Next-Experiment Condition Vectors`);
      for (const exp of recommendationSuite.proposedExperiments) {
        const approval = approvedExperimentIds[exp.id];
        lines.push(
          `### ${exp.codeLabel} (Rank #${exp.rank}): ${exp.title}`,
          `- **Objective Role**: ${exp.objectiveRole} (${exp.acquisitionMetricName} = ${exp.acquisitionScoreValue})`,
          `- **Human Review Status**: ${
            approval
              ? `Reviewed for Wet-Lab Screening by ${approval.reviewer} at ${approval.timestamp} ("${approval.notes}")`
              : 'COMPUTATIONAL PROPOSAL ONLY — Pending Qualified Human Engineering Sign-Off'
          }`,
          `- **Operating Condition Vector**:`,
          `  - Reactor & Scale: ${exp.operatingVector.reactorName} (${exp.operatingVector.workingVolumeL} L)`,
          `  - Sparger & Impeller: ${exp.operatingVector.spargerLabel} · ${exp.operatingVector.impellerCount}× ${exp.operatingVector.impellerLabel}`,
          `  - Agitation & Gas: ${exp.operatingVector.agitationRpm} RPM · ${exp.operatingVector.spargeRateVvm} vvm · ${exp.operatingVector.inletO2Percent}% Inlet O₂`,
          `  - Perfusion & Biomass: VCD = ${exp.operatingVector.targetVcdE6PerMl} × 10⁶ cells/mL · D_perf = ${exp.operatingVector.perfusionRateVvd} VVD · DO = ${exp.operatingVector.doSetpointPercent}% air sat. · T = ${exp.operatingVector.operatingTempC} °C`,
          `- **GP Surrogate Predictions & 95% Credible Intervals**:`,
          `  - Physical Productivity: ${exp.predictions.volumetricProductivityMeanMgLDay} mg/L/day (Epistemic σ_GP = ±${exp.predictions.volumetricProductivityEpistemicStdMgLDay} mg/L/day; 95% GP CI: [${exp.predictions.volumetricProductivityCredibleInterval95MgLDay[0]}, ${exp.predictions.volumetricProductivityCredibleInterval95MgLDay[1]}] mg/L/day; Aleatoric σ = ±${exp.predictions.volumetricProductivityAleatoricStdMgLDay} mg/L/day)`,
          `  - Composite Objective Score: ${exp.predictions.gpCompositeScoreMean} ± ${exp.predictions.gpCompositeScoreStd} arbitrary score units (95% CI: [${exp.predictions.gpCompositeCredibleInterval95[0]}, ${exp.predictions.gpCompositeCredibleInterval95[1]}])`,
          `  - Oxygen Transfer vs Demand: OTR = ${exp.predictions.predictedOtrMmolPerLHour.toFixed(2)} mmol/L/h vs OUR = ${exp.predictions.predictedOurMmolPerLHour.toFixed(2)} mmol/L/h (Margin: +${exp.predictions.oxygenMarginMmolPerLHour.toFixed(2)} mmol/L/h, k_La = ${exp.predictions.predictedKlaPerHour.toFixed(1)} h⁻¹)`,
          `  - Hydrodynamic Shear & Mixing: τ = ${exp.predictions.predictedShearStressPa.toFixed(2)} Pa (Limit: ≤ ${exp.predictions.shearLimitPa.toFixed(2)} Pa) · Mixing Time t_m = ${exp.predictions.predictedMixingTimeS.toFixed(1)} s · P_g/V = ${exp.predictions.specificPowerWPerM3.toFixed(1)} W/m³`,
          `  - Economic Impact: Estimated Usable COGS = ${formatCogsHeadline(exp.predictions.estimatedUsableCogsPerGramUsd)} ($${exp.predictions.estimatedUsableCogsPerGramUsd.toFixed(2)}/g, ${exp.predictions.annualRecoveredKg.toFixed(1)} kg/yr)`,
          `- **Probabilistic Constraint Satisfaction**:`,
          `  - P(OTR ≥ OUR): ${
            exp.probabilisticConstraints.probOtrGeqOur !== null
              ? `${(exp.probabilisticConstraints.probOtrGeqOur * 100).toFixed(1)}%`
              : 'Not Quantified (Manual k_La Override Active)'
          }`,
          `  - P(τ ≤ τ_crit): ${
            exp.probabilisticConstraints.probShearSafe !== null
              ? `${(exp.probabilisticConstraints.probShearSafe * 100).toFixed(1)}%`
              : 'N/A'
          }`,
          `  - Joint Feasibility Probability: ${(exp.probabilisticConstraints.jointFeasibilityProbability * 100).toFixed(1)}%`,
          `  - Propagation Note: ${exp.probabilisticConstraints.uncertaintyPropagationNote}`,
          `- **Selection Rationale**: ${exp.whySelectedSummary}`,
          `- **Engineering Trade-Offs**:`,
          ...exp.engineeringTradeOffs.map((t) => `  - ${t}`),
          ``
        );
      }
    }

    lines.push(
      `## 4. Source Parameter Provenance Summary`,
      ...provenanceLedger.map(
        (p) =>
          `- **${p.symbol} (${p.name})**: ${p.currentValue} ${p.unit} [${p.classification}] — Source: ${p.authorsAndYear} (${p.databaseId})`
      ),
      ``,
      `## 5. Objective Function & Governing Equations`,
      `- **Acquisition Function Formula**: ${REPRODUCIBILITY_MANIFEST.acquisitionFunctionFormula}`,
      `- **Oxygen Mass Balance Equation**: ${REPRODUCIBILITY_MANIFEST.oxygenMassBalanceEquation}`
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bioREACT_Next_Experiment_Plan_${candidate.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadNextExperimentPlanJson = () => {
    const payload = {
      exportType: 'bioREACT_Uncertainty_Aware_Next_Experiment_Plan',
      reproducibilityManifest: REPRODUCIBILITY_MANIFEST,
      recommendationSuite,
      humanReviewApprovals: approvedExperimentIds,
      sourceParameterProvenance: provenanceLedger.map((p) => ({
        parameterId: p.parameterId,
        symbol: p.symbol,
        value: p.currentValue,
        unit: p.unit,
        classification: p.classification,
        source: p.authorsAndYear,
        databaseId: p.databaseId,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bioREACT_Next_Experiment_Plan_${candidate.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border-2 border-slate-900 p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-slate-900 text-white">
              CLOSED-LOOP EXPERIMENTAL DESIGN &amp; UNCERTAINTY-AWARE ABSTENTION ENGINE
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${
                recommendationSuite.decisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : recommendationSuite.decisionLevel ===
                    'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              {recommendationSuite.decisionBadge}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
            Dynamic Next-Experiment Recommendations (Exploitation · Information Gain · Cost Trade-Off)
          </h3>
          <p className="text-xs text-slate-600 mt-1 max-w-4xl leading-relaxed">
            Formulates complete, ranked next-experiment operating vectors directly from the active{' '}
            <strong>Gaussian Process surrogate</strong> and{' '}
            <strong>500 L mechanistic mass-balance solver</strong>—evaluating predictive credible
            intervals (<span className="font-mono">μ(x) ± 1.96σ(x)</span>), probabilistic constraint
            satisfaction (<span className="font-mono">P(OTR ≥ OUR)</span>,{' '}
            <span className="font-mono">P(τ ≤ τ_crit)</span>), and 3-level scientific abstention.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isAbstaining && onTriggerAbstentionDemo && (
            <button
              type="button"
              onClick={onTriggerAbstentionDemo}
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer"
              title="Switch to a research-stage host (E. coli) or missing-evidence state to demonstrate Level 3 scientific abstention"
            >
              Demo Level 3 Abstention Gate
            </button>
          )}
          {isAbstaining && onRestoreCalibratedChoModel && (
            <button
              type="button"
              onClick={onRestoreCalibratedChoModel}
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
            >
              Restore Calibrated CHO Model (Level 1/2)
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadNextExperimentPlanMd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Plan (.md)
          </button>
          <button
            type="button"
            onClick={handleDownloadNextExperimentPlanJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Three-Level Decision & Uncertainty Decomposition Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div
          className={`p-3.5 border ${
            recommendationSuite.decisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
              ? 'bg-emerald-50/70 border-emerald-300'
              : recommendationSuite.decisionLevel === 'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
              ? 'bg-amber-50/70 border-amber-300'
              : 'bg-rose-50/80 border-rose-300'
          }`}
        >
          <div className="text-[10px] font-mono font-bold uppercase text-slate-700">
            ACTIVE 3-LEVEL DECISION GATE
          </div>
          <div className="text-xs font-semibold text-slate-900 mt-1">
            {recommendationSuite.decisionTitle}
          </div>
          <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">
            {recommendationSuite.decisionSummary}
          </p>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-mono font-bold uppercase text-blue-800">
            1. MODEL UNCERTAINTY (EPISTEMIC σ_GP)
          </div>
          <div className="text-sm font-mono font-bold text-slate-900 mt-1">
            ±{recommendationSuite.uncertaintyDecompositionSummary.epistemicMeanStdMgLDay} mg/L/day
          </div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            {recommendationSuite.uncertaintyDecompositionSummary.epistemicExplanation}
          </p>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-mono font-bold uppercase text-purple-800">
            2. EXPERIMENTAL VARIABILITY (ALEATORIC)
          </div>
          <div className="text-sm font-mono font-bold text-slate-900 mt-1">
            ±{recommendationSuite.uncertaintyDecompositionSummary.aleatoricAssayNoiseStdMgLDay} mg/L/day (~4% CV)
          </div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            {recommendationSuite.uncertaintyDecompositionSummary.aleatoricExplanation}
          </p>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-800">
            3. EVIDENCE &amp; APPLICABILITY GATE
          </div>
          <div className="text-xs font-mono font-bold text-slate-900 mt-1">
            {recommendationSuite.uncertaintyDecompositionSummary.evidenceApplicabilityStatus}
          </div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            {recommendationSuite.uncertaintyDecompositionSummary.evidenceExplanation}
          </p>
        </div>
      </div>

      {/* LEVEL 3 ABSTENTION PANEL (Rendered when bioREACT refuses to recommend an unjustified experiment) */}
      {isAbstaining ? (
        <div className="p-6 bg-rose-50 border-2 border-rose-400 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-rose-200 pb-4">
            <div className="flex items-start gap-3">
              <Lock className="w-6 h-6 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-mono font-bold uppercase text-rose-800">
                  LEVEL 3 SCIENTIFIC ABSTENTION ACTIVE — REFUSING UNJUSTIFIED QUANTITATIVE RECIPE
                </div>
                <h4 className="text-base font-semibold text-rose-950 mt-0.5">
                  bioREACT Withholds Operating-Condition Recipes Until Required Evidence Is Provided
                </h4>
              </div>
            </div>
            {onRestoreCalibratedChoModel && (
              <button
                type="button"
                onClick={onRestoreCalibratedChoModel}
                className="px-3.5 py-2 text-xs font-mono font-semibold bg-rose-800 hover:bg-rose-900 text-white transition-colors cursor-pointer shrink-0"
              >
                Switch Back to Calibrated CHO-K1 Model
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div className="bg-white p-4 border border-rose-200">
              <div className="font-mono font-bold uppercase text-rose-900 mb-2">
                1. Why <span className="normal-case">bioREACT</span> Refuses to Recommend a Recipe
              </div>
              <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                {recommendationSuite.abstentionDiagnostics.primaryReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="bg-white p-4 border border-rose-200">
              <div className="font-mono font-bold uppercase text-rose-900 mb-2">
                2. Specific Missing Evidence &amp; Parameters
              </div>
              <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                {recommendationSuite.abstentionDiagnostics.missingParametersOrEvidence.map(
                  (item, i) => (
                    <li key={i}>{item}</li>
                  )
                )}
              </ul>
            </div>

            <div className="bg-white p-4 border border-rose-200">
              <div className="font-mono font-bold uppercase text-emerald-900 mb-2">
                3. Highest-Value Wet-Lab Measurements to Run Next
              </div>
              <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                {recommendationSuite.abstentionDiagnostics.highestPriorityWetLabMeasurements.map(
                  (meas, i) => (
                    <li key={i} className="font-medium text-slate-900">
                      {meas}
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>

          <div className="p-3 bg-white border border-rose-300 text-xs text-slate-700 font-mono">
            <strong className="text-rose-900">
              Why Small GP Variance Does Not Prove Validity:
            </strong>{' '}
            {recommendationSuite.abstentionDiagnostics.whySmallGpVarianceDoesNotProveValidity}
          </div>
        </div>
      ) : (
        <>
          {/* Feedback confirmation banner when closed-loop experiment is logged */}
          {lastLoggedFeedbackBanner && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 flex items-center justify-between gap-3 text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{lastLoggedFeedbackBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setLastLoggedFeedbackBanner(null)}
                className="text-[11px] font-mono underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Side-by-Side Cards for Experiment A, Experiment B, and Experiment C */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {recommendationSuite.proposedExperiments.map((exp, idx) => {
              const isSelected = idx === selectedExpIndex;
              const isApproved = Boolean(approvedExperimentIds[exp.id]);
              const roleBadgeStyle =
                exp.objectiveRole === 'EXPLOITATION_OPTIMUM'
                  ? 'bg-blue-600 text-white'
                  : exp.objectiveRole === 'EXPLORATION_INFO_GAIN'
                  ? 'bg-purple-700 text-white'
                  : 'bg-emerald-700 text-white';

              return (
                <div
                  key={exp.id}
                  onClick={() => {
                    setSelectedExpIndex(idx);
                    setCustomVvdOverride(null);
                    setCustomDoOverride(null);
                    setCustomRpmOverride(null);
                    setCustomO2Override(null);
                  }}
                  className={`border-2 p-4 transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-400'
                  }`}
                >
                  <div>
                    {/* Card Top Badges */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${roleBadgeStyle}`}
                      >
                        {exp.codeLabel} · RANK #{exp.rank}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-semibold border ${
                          isApproved
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-amber-50 text-amber-900 border-amber-300'
                        }`}
                      >
                        {isApproved
                          ? 'HUMAN-REVIEWED FOR WET-LAB'
                          : 'COMPUTATIONAL PROPOSAL'}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                      {exp.title}
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1">{exp.subtitlePurpose}</p>

                    {/* Complete Operating-Condition Vector */}
                    <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 space-y-1 text-[11px] font-mono">
                      <div className="text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200 pb-1 mb-1">
                        PROPOSED OPERATING-CONDITION VECTOR
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Reactor &amp; Scale:</span>
                        <strong className="text-slate-900">
                          {exp.operatingVector.reactorName} ({exp.operatingVector.workingVolumeL} L)
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Sparger:</span>
                        <strong className="text-blue-800">
                          {exp.operatingVector.spargerLabel}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Impeller Assembly:</span>
                        <strong className="text-slate-900">
                          {exp.operatingVector.impellerCount}× {exp.operatingVector.impellerLabel}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Agitation &amp; Sparge:</span>
                        <strong className="text-slate-900">
                          {exp.operatingVector.agitationRpm} RPM · {exp.operatingVector.spargeRateVvm} vvm
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Inlet O₂ &amp; Target VCD:</span>
                        <strong className="text-slate-900">
                          {exp.operatingVector.inletO2Percent}% O₂ ·{' '}
                          {exp.operatingVector.targetVcdE6PerMl.toFixed(1)}×10⁶ cells/mL
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Perfusion &amp; DO Setpoint:</span>
                        <strong className="text-emerald-800">
                          {exp.operatingVector.perfusionRateVvd.toFixed(2)} VVD ·{' '}
                          {exp.operatingVector.doSetpointPercent}% DO ({exp.operatingVector.operatingTempC} °C)
                        </strong>
                      </div>
                    </div>

                    {/* GP Predictive Mean, SD & 95% Credible Interval */}
                    <div className="mt-3 p-2.5 bg-white border border-slate-200 space-y-1.5 text-[11px]">
                      <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                        GP SURROGATE PREDICTION &amp; 95% CREDIBLE INTERVAL
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-600">Predicted Productivity:</span>
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {exp.predictions.volumetricProductivityMeanMgLDay} ±{' '}
                          {exp.predictions.volumetricProductivityEpistemicStdMgLDay} mg/L/d
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-600">
                        <span>95% GP Credible Interval (μ ± 1.96σ_GP):</span>
                        <strong className="text-slate-900">
                          [{exp.predictions.volumetricProductivityCredibleInterval95MgLDay[0]},{' '}
                          {exp.predictions.volumetricProductivityCredibleInterval95MgLDay[1]}] mg/L/d
                        </strong>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-500">
                        <span>Composite Score (arbitrary units):</span>
                        <span>
                          {exp.predictions.gpCompositeScoreMean} ± {exp.predictions.gpCompositeScoreStd} (95% CI:{' '}
                          {exp.predictions.gpCompositeCredibleInterval95[0]}–
                          {exp.predictions.gpCompositeCredibleInterval95[1]})
                        </span>
                      </div>
                    </div>

                    {/* Probabilistic Constraint Satisfaction & Engineering Margins */}
                    <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 space-y-1 text-[11px] font-mono">
                      <div className="text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200 pb-1 mb-1">
                        PROBABILISTIC CONSTRAINTS &amp; MARGINS
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">OTR vs. OUR:</span>
                        <strong className="text-emerald-700">
                          {exp.predictions.predictedOtrMmolPerLHour.toFixed(1)} ≥{' '}
                          {exp.predictions.predictedOurMmolPerLHour.toFixed(1)} mmol/L/h (+
                          {exp.predictions.oxygenMarginMmolPerLHour.toFixed(1)})
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">P(OTR ≥ OUR) Screening:</span>
                        <strong
                          className={
                            exp.probabilisticConstraints.probOtrGeqOur === null
                              ? 'text-amber-800'
                              : exp.probabilisticConstraints.isProbabilisticO2SafeAt95
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }
                        >
                          {exp.probabilisticConstraints.probOtrGeqOur !== null
                            ? `${(exp.probabilisticConstraints.probOtrGeqOur * 100).toFixed(1)}% ${
                                exp.probabilisticConstraints.isProbabilisticO2SafeAt95
                                  ? '(≥ 95% Pass)'
                                  : '(< 95% Caution)'
                              }`
                            : 'Unquantified (Manual kLa)'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Bulk Shear τ &amp; P(τ ≤ τ_crit):</span>
                        <strong className="text-slate-900">
                          {exp.predictions.predictedShearStressPa.toFixed(2)} Pa (P ={' '}
                          {exp.probabilisticConstraints.probShearSafe !== null
                            ? `${(exp.probabilisticConstraints.probShearSafe * 100).toFixed(1)}%`
                            : 'N/A'}
                          )
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Mixing t_m &amp; k_La:</span>
                        <strong className="text-slate-900">
                          t_m = {exp.predictions.predictedMixingTimeS.toFixed(1)} s · k_La ={' '}
                          {exp.predictions.predictedKlaPerHour.toFixed(1)} h⁻¹
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Est. Usable COGS:</span>
                        <strong className="text-blue-800">
                          {formatCogsHeadline(exp.predictions.estimatedUsableCogsPerGramUsd)} ($
                          {exp.predictions.estimatedUsableCogsPerGramUsd.toFixed(2)}/g)
                        </strong>
                      </div>
                    </div>

                    {/* Why Selected */}
                    <div className="mt-3 text-[11px] text-slate-700 leading-relaxed">
                      <strong className="font-mono text-slate-900 uppercase text-[10px]">
                        WHY SELECTED ({exp.acquisitionMetricName}):
                      </strong>{' '}
                      {exp.whySelectedSummary}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-500">
                      {isSelected ? 'ACTIVE SELECTION FOR REVIEW ↓' : 'Click to inspect & review'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyExperimentHardwareToStage5(exp);
                      }}
                      className="px-2.5 py-1 text-[11px] font-mono font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
                    >
                      Stage in Vessel Simulator
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Candidate Deep-Dive, Parameter Tweak & Mandatory Human Review Gate */}
          {effectiveExp && (
            <div className="bg-slate-50 border border-slate-300 p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-[11px] font-mono font-bold uppercase text-blue-800">
                    SELECTED CANDIDATE TRADE-OFF INSPECTOR &amp; MANDATORY HUMAN WET-LAB REVIEW GATE
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    {effectiveExp.codeLabel}: {effectiveExp.title}
                  </h4>
                </div>
                <div className="text-[11px] font-mono text-slate-600">
                  Uncertainty Note: {effectiveExp.predictions.uncertaintySourceDisclosure}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left 5 cols: Trade-offs + Optional Researcher Adjustments before Execution */}
                <div className="lg:col-span-5 space-y-3 text-xs">
                  <div className="bg-white p-3.5 border border-slate-200">
                    <div className="font-mono font-bold uppercase text-slate-800 text-[11px] mb-1.5">
                      Engineering Trade-Offs &amp; Wet-Lab Pre-Checks
                    </div>
                    <ul className="space-y-1.5 text-slate-700 list-disc pl-4 text-[11px]">
                      {effectiveExp.engineeringTradeOffs.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                      {effectiveExp.wetLabValidationChecks.map((w, i) => (
                        <li key={`w-${i}`} className="text-slate-600">
                          <strong>Pre-Run Verification:</strong> {w}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Request Changes / Fine-Tune Proposed Operating Vector */}
                  <div className="bg-white p-3.5 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold uppercase text-slate-800 text-[11px] flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        Request Changes to Proposed Vector Before Staging
                      </span>
                      {(customVvdOverride !== null ||
                        customDoOverride !== null ||
                        customRpmOverride !== null ||
                        customO2Override !== null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomVvdOverride(null);
                            setCustomDoOverride(null);
                            setCustomRpmOverride(null);
                            setCustomO2Override(null);
                          }}
                          className="text-[10px] font-mono text-blue-700 underline cursor-pointer"
                        >
                          Reset to Optimiser Proposal
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                      <div>
                        <label className="block text-slate-600 font-mono text-[10px]">
                          Perfusion Rate (VVD)
                        </label>
                        <input
                          type="number"
                          step={0.05}
                          min={0.8}
                          max={3.8}
                          value={effectiveExp.operatingVector.perfusionRateVvd}
                          onChange={(e) =>
                            setCustomVvdOverride(parseFloat(e.target.value) || 2.0)
                          }
                          className="w-full mt-0.5 px-2 py-1 border border-slate-300 font-mono text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-mono text-[10px]">
                          DO Setpoint (% air sat.)
                        </label>
                        <input
                          type="number"
                          step={1}
                          min={20}
                          max={75}
                          value={effectiveExp.operatingVector.doSetpointPercent}
                          onChange={(e) =>
                            setCustomDoOverride(parseInt(e.target.value, 10) || 48)
                          }
                          className="w-full mt-0.5 px-2 py-1 border border-slate-300 font-mono text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-mono text-[10px]">
                          Agitation Speed (RPM)
                        </label>
                        <input
                          type="number"
                          step={2}
                          min={40}
                          max={220}
                          value={effectiveExp.operatingVector.agitationRpm}
                          onChange={(e) =>
                            setCustomRpmOverride(parseInt(e.target.value, 10) || 105)
                          }
                          className="w-full mt-0.5 px-2 py-1 border border-slate-300 font-mono text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-mono text-[10px]">
                          Inlet O₂ Enrichment (%)
                        </label>
                        <input
                          type="number"
                          step={2}
                          min={21}
                          max={100}
                          value={effectiveExp.operatingVector.inletO2Percent}
                          onChange={(e) =>
                            setCustomO2Override(parseInt(e.target.value, 10) || 55)
                          }
                          className="w-full mt-0.5 px-2 py-1 border border-slate-300 font-mono text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right 7 cols: Human Review Gate & Closed-Loop Surrogate Update */}
                <div className="lg:col-span-7 bg-white p-4 border border-slate-200 flex flex-col justify-between space-y-3 text-xs">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-mono font-bold uppercase text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-emerald-700" />
                        Human Reviewer Safety &amp; Applicability Gate (No Autonomous Wet-Lab Execution)
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Required before logging or approving protocol
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      A computationally feasible Bayesian optimisation proposal is{' '}
                      <strong>not</strong> an approved wet-lab SOP. A qualified bioprocess engineer
                      must verify biological host applicability, vessel pressure/oxygen safety limits,
                      and sparger foaming controls before testing.
                    </p>

                    <div className="space-y-1.5 pt-1">
                      <label className="flex items-start gap-2 text-[11px] text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={humanSafetyChecklist.hostApplicabilityChecked}
                          onChange={(e) =>
                            setHumanSafetyChecklist((prev) => ({
                              ...prev,
                              hostApplicabilityChecked: e.target.checked,
                            }))
                          }
                          className="mt-0.5 accent-blue-600"
                        />
                        <span>
                          I have verified that the CHO-K1 Monod/perfusion surrogate and source
                          parameters (<span className="font-mono">q_p, q_O2, τ_crit</span>) are
                          applicable to this candidate and vessel geometry.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[11px] text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={humanSafetyChecklist.oxygenAndShearLimitsChecked}
                          onChange={(e) =>
                            setHumanSafetyChecklist((prev) => ({
                              ...prev,
                              oxygenAndShearLimitsChecked: e.target.checked,
                            }))
                          }
                          className="mt-0.5 accent-blue-600"
                        />
                        <span>
                          I have inspected the predicted oxygen transfer margin (
                          <span className="font-mono">
                            +{effectiveExp.predictions.oxygenMarginMmolPerLHour.toFixed(1)} mmol
                            O₂/L/h
                          </span>
                          ), shear stress (
                          <span className="font-mono">
                            {effectiveExp.predictions.predictedShearStressPa.toFixed(2)} Pa
                          </span>
                          ), and O₂ enrichment flammability/foaming controls.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[11px] text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={humanSafetyChecklist.notAutonomousExecutionConfirmed}
                          onChange={(e) =>
                            setHumanSafetyChecklist((prev) => ({
                              ...prev,
                              notAutonomousExecutionConfirmed: e.target.checked,
                            }))
                          }
                          className="mt-0.5 accent-blue-600"
                        />
                        <span>
                          I acknowledge that this sign-off records a human-reviewed experimental plan
                          and does not autonomously actuate physical bioreactor hardware.
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-600">
                          Reviewing Engineer Name &amp; Role
                        </label>
                        <input
                          type="text"
                          value={humanReviewerName}
                          onChange={(e) => setHumanReviewerName(e.target.value)}
                          className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-300 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono text-slate-600">
                          Engineering Review Justification / Notes
                        </label>
                        <input
                          type="text"
                          value={humanReviewNotes}
                          onChange={(e) => setHumanReviewNotes(e.target.value)}
                          className="w-full mt-0.5 px-2.5 py-1.5 border border-slate-300 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onApplyExperimentHardwareToStage5(effectiveExp)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 transition-colors cursor-pointer"
                    >
                      Apply Hardware &amp; RPM/O₂ to Stage 5 Vessel
                    </button>

                    <button
                      type="button"
                      disabled={!allChecklistChecked}
                      onClick={() => {
                        const timestamp = new Date().toISOString();
                        setApprovedExperimentIds((prev) => ({
                          ...prev,
                          [effectiveExp.id]: {
                            reviewer: humanReviewerName,
                            timestamp,
                            notes: humanReviewNotes,
                          },
                        }));
                        onExecuteReviewedExperimentInBo(
                          effectiveExp,
                          humanReviewerName,
                          humanReviewNotes
                        );
                        setLastLoggedFeedbackBanner(
                          `Human-reviewed ${effectiveExp.codeLabel} (${effectiveExp.operatingVector.perfusionRateVvd.toFixed(
                            2
                          )} VVD, ${effectiveExp.operatingVector.doSetpointPercent}% DO, ${
                            effectiveExp.operatingVector.agitationRpm
                          } RPM, ${
                            effectiveExp.operatingVector.inletO2Percent
                          }% O₂) signed off by ${humanReviewerName}, evaluated in simulator, and appended to the Gaussian Process observation history.`
                        );
                      }}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold transition-colors ${
                        allChecklistChecked
                          ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Approve &amp; Evaluate in GP Surrogate (Close Loop)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Held-Out Synthetic Simulator GP Uncertainty Calibration Bar & Expandable Table */}
      <div className="border-t border-slate-200 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 border border-slate-200">
          <div className="text-xs">
            <span className="font-mono font-bold text-slate-900 uppercase">
              GP UNCERTAINTY CALIBRATION CHECK (N ={' '}
              {recommendationSuite.calibrationReport.holdoutSampleCount} HELD-OUT SIMULATOR CASES):
            </span>{' '}
            <span className="font-mono text-slate-700">
              Nominal 95% CI Empirical Coverage ={' '}
              <strong className="text-emerald-700">
                {recommendationSuite.calibrationReport.empiricalCoverage95Percent}%
              </strong>{' '}
              · Nominal 68% CI Coverage ={' '}
              <strong>{recommendationSuite.calibrationReport.empiricalCoverage68Percent}%</strong> ·
              RMSE = <strong>{recommendationSuite.calibrationReport.rmseCompositeScore}</strong> ·{' '}
              {recommendationSuite.calibrationReport.calibrationStatus}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowCalibrationTable((prev) => !prev)}
            className="px-2.5 py-1 text-[11px] font-mono font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 cursor-pointer shrink-0"
          >
            {showCalibrationTable
              ? 'Hide Held-Out Calibration Table'
              : 'Inspect 25 Held-Out Calibration Cases'}
          </button>
        </div>

        {showCalibrationTable && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-mono text-slate-600">
              {recommendationSuite.calibrationReport.calibrationMethodDisclosure}
            </p>
            <div className="overflow-x-auto max-h-64 border border-slate-200">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-1.5 px-2">Case #</th>
                    <th className="py-1.5 px-2">D_perf (VVD)</th>
                    <th className="py-1.5 px-2">DO (% air)</th>
                    <th className="py-1.5 px-2">GP Mean μ(x)</th>
                    <th className="py-1.5 px-2">GP Std σ(x)</th>
                    <th className="py-1.5 px-2">95% GP Credible Interval</th>
                    <th className="py-1.5 px-2">True Simulator Outcome</th>
                    <th className="py-1.5 px-2">|z|-Error</th>
                    <th className="py-1.5 px-2">Inside 95% CI?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recommendationSuite.calibrationReport.holdoutPoints.map((pt) => (
                    <tr key={pt.pointId} className="hover:bg-slate-50">
                      <td className="py-1 px-2 text-slate-500">#{pt.pointId}</td>
                      <td className="py-1 px-2">{pt.x1_vvd.toFixed(2)}</td>
                      <td className="py-1 px-2">{pt.x2_do}%</td>
                      <td className="py-1 px-2 font-semibold">{pt.gpMeanScore.toFixed(1)}</td>
                      <td className="py-1 px-2">±{pt.gpStdScore.toFixed(1)}</td>
                      <td className="py-1 px-2">
                        [{pt.ci95Lower.toFixed(1)}, {pt.ci95Upper.toFixed(1)}]
                      </td>
                      <td className="py-1 px-2 font-semibold text-slate-900">
                        {pt.trueSimulatorScore.toFixed(1)}
                      </td>
                      <td className="py-1 px-2">{pt.standardizedZError.toFixed(2)}</td>
                      <td className="py-1 px-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold ${
                            pt.within95Ci
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-900'
                          }`}
                        >
                          {pt.within95Ci ? 'YES (Covered)' : 'OUTSIDE'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
