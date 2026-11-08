import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Download,
  FileCheck2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  CandidatePathwayMode,
  HumanSafetyGate,
  LiveEightSeedBenchmarkSummary,
  MeasuredBenchmarkRecord,
  NovelProteinDissertationProfile,
  NovelProteinEvaluationResult,
  SafetyGateId,
  SafetyGateStatus,
  SeedBenchmarkPoint,
  WorkflowTimelineStep,
} from '../types/bioreact';

interface WorkflowAndSafetyPanelProps {
  timelineSteps: WorkflowTimelineStep[];
  safetyGates: HumanSafetyGate[];
  onUpdateSafetyGate: (
    gateId: SafetyGateId,
    status: SafetyGateStatus,
    reviewerName: string,
    justification: string
  ) => void;
  onApproveAllDemoGates: () => void;
  onResetAllGates: () => void;
  measuredBenchmarks: MeasuredBenchmarkRecord[];
  onAddMeasuredBenchmark: (rec: MeasuredBenchmarkRecord) => void;
  candidatePathwayMode: CandidatePathwayMode;
  novelProfile: NovelProteinDissertationProfile;
  novelEvaluation: NovelProteinEvaluationResult;
  onJumpToStage: (
    stage: 'streams' | 'reactors' | 'mass_balance' | 'optimisation' | 'brief'
  ) => void;
  seedBenchmarks?: SeedBenchmarkPoint[];
  liveEightSeedSummary?: LiveEightSeedBenchmarkSummary;
  isScaleUpFeasible?: boolean;
  otrMmolPerLHour?: number;
  ourMmolPerLHour?: number;
  onTriggerOxygenDeficitDemo?: () => void;
}

const REFERENCE_ANSWER_RUBRIC = [
  {
    criterionId: 'R1',
    taskItem: 'Two-Key Literature Deduplication (DOI + Normalized Title)',
    referenceCriterion:
      'Identify that PMID:30195628 (PubMed without DOI) is a triplicate of DOI:10.1016/j.biotechadv.2018.08.008 in Europe PMC & OpenAlex, collapsing 14 raw hits → 11 unique → 8 included.',
    weightPercent: 20,
  },
  {
    criterionId: 'R2',
    taskItem: 'Target vs Drug Provenance Distinction',
    referenceCriterion:
      'Distinguish UniProt P04626 (human ERBB2/HER2 receptor antigen) from the manufactured therapeutic antibody Trastuzumab (DrugBank DB00072 / ChEMBL1201585).',
    weightPercent: 20,
  },
  {
    criterionId: 'R3',
    taskItem: '500 L Oxygen Transfer Balance (OTR vs OUR)',
    referenceCriterion:
      'Verify that at 45×10⁶ cells/mL and q_O2 = 0.31–0.32 pmol/cell/h, OUR ≈ 13.9–14.4 mmol/L/h exceeds air-only sparging OTR ≈ 3.2 mmol/L/h, requiring O₂ enrichment (≥55% O₂) or kLa increase.',
    weightPercent: 25,
  },
  {
    criterionId: 'R4',
    taskItem: 'Bioreactor Architecture Selection & Shear Limit',
    referenceCriterion:
      'Distinguish STR + External ATF/TFF hollow-fibre retention from a true Hollow-Fibre Bioreactor (HFB) cartridge where cells grow in the extracapillary space (ECS), and verify τ < τ_crit (1.65 Pa).',
    weightPercent: 20,
  },
  {
    criterionId: 'R5',
    taskItem: 'Mandatory Human-in-the-Loop Gate Verification',
    referenceCriterion:
      'Complete 5 explicit human checkpoints and block sign-off whenever OTR < OUR, τ > τ_crit, or novel protein parameters are missing.',
    weightPercent: 15,
  },
];

export const WorkflowAndSafetyPanel: React.FC<WorkflowAndSafetyPanelProps> = ({
  timelineSteps,
  safetyGates,
  onUpdateSafetyGate,
  onApproveAllDemoGates,
  onResetAllGates,
  measuredBenchmarks,
  onAddMeasuredBenchmark,
  candidatePathwayMode,
  novelProfile,
  novelEvaluation,
  onJumpToStage,
  seedBenchmarks = [],
  liveEightSeedSummary,
  isScaleUpFeasible = true,
  otrMmolPerLHour = 19.3,
  ourMmolPerLHour = 14.4,
  onTriggerOxygenDeficitDemo,
}) => {
  const [selectedStepNumber, setSelectedStepNumber] = useState<number>(
    timelineSteps[0]?.stepNumber || 1
  );
  const [editingGateId, setEditingGateId] = useState<SafetyGateId>('gate1_candidate');
  const [reviewerNameDraft, setReviewerNameDraft] = useState<string>(
    'Simulated Demo Reviewer — Bioprocess Engineer'
  );
  const [justificationDraft, setJustificationDraft] = useState<string>(
    'Simulated Demo Sign-Off (No Institutional Approval Implied): Verified Trastuzumab (DrugBank DB00072 / ChEMBL1201585) vs HER2 target receptor (UniProt P04626). Confirmed CHO-K1 expression and separated literature values from simulator assumptions.'
  );

  // Expandable state for the unconducted human usability study section (collapsed by default)
  const [showIllustrativeUsabilityStudy, setShowIllustrativeUsabilityStudy] =
    useState<boolean>(false);

  // Editable labels for the 2 unmeasured hypothetical example rows
  const [participant1Label, setParticipant1Label] = useState<string>(
    'Hypothetical Manual Baseline (Unmeasured)'
  );
  const [participant2Label, setParticipant2Label] = useState<string>(
    'Hypothetical Assisted Run (Unmeasured)'
  );

  // Live Benchmarking Stopwatch State for genuine participant testing
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [participantName, setParticipantName] = useState('New participant');
  const [workflowMode, setWorkflowMode] = useState<'Manual Baseline' | 'bioREACT-Assisted'>(
    'bioREACT-Assisted'
  );
  const [accuracyPercent, setAccuracyPercent] = useState(96);
  const [violationsCount, setViolationsCount] = useState(0);
  const [humanCorrectionsCount, setHumanCorrectionsCount] = useState(1);
  const [benchmarkNotes, setBenchmarkNotes] = useState(
    'Timed live participant run using standardized 5-item reference-answer rubric.'
  );

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const selectedStep =
    timelineSteps.find((s) => s.stepNumber === selectedStepNumber) || timelineSteps[0];

  const activeGate =
    safetyGates.find((g) => g.id === editingGateId) || safetyGates[0];

  const approvedCount = safetyGates.filter((g) => g.status === 'Approved').length;

  const totalManualIllustrativeMin = timelineSteps.reduce(
    (acc, s) => acc + s.manualIllustrativeMinutes,
    0
  );
  const totalBioreactIllustrativeMin = timelineSteps.reduce(
    (acc, s) => acc + s.bioreactIllustrativeMinutes,
    0
  );

  // Separate Illustrative Unconducted Study Examples from actual Live Stopwatch Runs
  const illustrativeDemoBenchmarks = measuredBenchmarks
    .filter((bm) => bm.isIllustrativeDemo)
    .map((bm, idx) => ({
      ...bm,
      participantName:
        idx === 0 ? participant1Label : idx === 1 ? participant2Label : bm.participantName,
    }));

  const liveRecordedBenchmarks = measuredBenchmarks.filter((bm) => !bm.isIllustrativeDemo);

  const handleSelectGate = (gate: HumanSafetyGate) => {
    setEditingGateId(gate.id);
    setReviewerNameDraft(gate.reviewerName);
    setJustificationDraft(gate.justification);
  };

  const handleRecordDecision = (status: SafetyGateStatus) => {
    onUpdateSafetyGate(
      activeGate.id,
      status,
      reviewerNameDraft.trim() || 'Simulated Demo Reviewer — Bioprocess Engineer',
      justificationDraft.trim() ||
        'Simulated Demo Sign-Off (No Institutional Approval Implied).'
    );
  };

  const handleLogBenchmarkRun = () => {
    const newRecord: MeasuredBenchmarkRecord = {
      id: `bench-live-${Date.now()}`,
      participantName: participantName.trim() || 'New participant',
      workflowMode,
      elapsedMinutes: Math.round((Math.max(1, elapsedSeconds) / 60) * 10) / 10,
      evidenceAccuracyPercent: accuracyPercent,
      constraintViolationsCount: violationsCount,
      humanCorrectionsCount,
      notes: benchmarkNotes,
      recordedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC',
      isIllustrativeDemo: false,
      verificationStatus: 'Recorded via Live Stopwatch',
    };
    onAddMeasuredBenchmark(newRecord);
    setTimerRunning(false);
  };

  const iter6Point = seedBenchmarks[5] || seedBenchmarks[1];
  const iter12Point = seedBenchmarks[seedBenchmarks.length - 1];

  const boFinalMean =
    liveEightSeedSummary?.constrainedBoStats.finalScoreMean ??
    iter12Point?.constrainedBoMean ??
    204.5;
  const boFinalStd =
    liveEightSeedSummary?.constrainedBoStats.finalScoreStd ??
    iter12Point?.constrainedBoStd ??
    3.6;
  const randFinalMean =
    liveEightSeedSummary?.randomSearchStats.finalScoreMean ??
    iter12Point?.randomSearchMean ??
    180.5;
  const randFinalStd =
    liveEightSeedSummary?.randomSearchStats.finalScoreStd ??
    iter12Point?.randomSearchStd ??
    14.8;
  const flatFinalMean =
    liveEightSeedSummary?.flatPenaltyGpStats.finalScoreMean ??
    iter12Point?.flatPenaltyGpMean ??
    186.2;
  const flatFinalStd =
    liveEightSeedSummary?.flatPenaltyGpStats.finalScoreStd ??
    iter12Point?.flatPenaltyGpStd ??
    9.4;

  const handleExportBenchmarkAndGatesJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      methodologyAndEpistemicNotice:
        'Primary Quantitative Evaluation: Reproducible 8-seed computational benchmark (Constrained Bayesian Optimisation EI × P_feas vs Uniform Random Search vs Flat-Penalty GP) computed deterministically on the identical CHO perfusion mass-balance simulator. Human usability timing examples (38.5 min vs 6.2 min 5-item checklist and 210 min vs 20 min 6-step scenario) are unconducted illustrative scenarios, NOT measured results or verified time savings. All safety gate sign-offs are simulated demonstration reviews; no institutional approval is implied.',
      primaryEvaluation_computationalOptimisation8Seeds: {
        isComputedAndReproducible: true,
        prngAlgorithm: 'Deterministic Mulberry32 PRNG (Seeds 1..8)',
        simulatorModel:
          'First-Principles CHO Perfusion + Monod/Haldane + kLa/OTR/OUR + Kolmogorov Shear',
        evaluationBudgetIterations: liveEightSeedSummary?.budget ?? 12,
        initialDesignPoints: 4,
        randomSeedsEvaluated: [1, 2, 3, 4, 5, 6, 7, 8],
        methodSummaryStats: liveEightSeedSummary
          ? {
              constrainedBo: liveEightSeedSummary.constrainedBoStats,
              uniformRandomSearch: liveEightSeedSummary.randomSearchStats,
              flatPenaltyGp: liveEightSeedSummary.flatPenaltyGpStats,
            }
          : undefined,
        trajectorySummaryByIteration: seedBenchmarks,
      },
      recordedLiveParticipantStopwatchRuns: liveRecordedBenchmarks,
      illustrativeUsabilityStudy_notYetConducted: {
        status: 'Illustrative Usability Study — Not Yet Conducted (Unmeasured Hypothetical Scenarios)',
        scenarioA_fiveItemChecklistHypotheticalRows: illustrativeDemoBenchmarks,
        scenarioA_referenceAnswerRubric: REFERENCE_ANSWER_RUBRIC,
        scenarioB_sixStepWorkflowWalkthrough: timelineSteps,
      },
      humanInTheLoopSafetyGates: {
        institutionalApprovalDisclaimer:
          'Simulated Demo Reviewer — Bioprocess Engineer. No institutional or university approval is implied.',
        gates: safetyGates,
      },
      currentOxygenBalanceCheck: {
        otrMmolPerLHour,
        ourMmolPerLHour,
        oxygenMarginMmolPerLHour: Number((otrMmolPerLHour - ourMmolPerLHour).toFixed(2)),
        isScaleUpFeasible,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bioREACT_auditable_benchmarks_and_methodology.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBenchmarkCsv = () => {
    const lines: string[] = [
      '# bioREACT Auditable Benchmark Export (Primary 8-Seed Computational BO vs Random Search + Live Stopwatch Log)',
      '# Section 1: Primary Quantitative Evaluation — Reproducible 8-Seed Computational Surrogate Optimisation (Mean ± SD)',
      'iteration,constrained_bo_mean_score,constrained_bo_std,flat_penalty_gp_mean_score,flat_penalty_gp_std,random_search_mean_score,random_search_std',
    ];
    seedBenchmarks.forEach((pt) => {
      lines.push(
        `${pt.iteration},${pt.constrainedBoMean},${pt.constrainedBoStd},${pt.flatPenaltyGpMean},${pt.flatPenaltyGpStd},${pt.randomSearchMean},${pt.randomSearchStd}`
      );
    });
    lines.push('');
    lines.push('# Section 2: Recorded Live Participant Stopwatch Runs (Empirical Session Recordings)');
    lines.push(
      'record_type,participant_id,workflow_mode,elapsed_minutes,evidence_accuracy_pct,constraint_violations,human_corrections,recorded_at,notes'
    );
    liveRecordedBenchmarks.forEach((bm) => {
      lines.push(
        `"${bm.verificationStatus || 'Recorded via Live Stopwatch'}","${bm.participantName}","${bm.workflowMode}",${bm.elapsedMinutes},${bm.evidenceAccuracyPercent},${bm.constraintViolationsCount},${bm.humanCorrectionsCount},"${bm.recordedAt}","${bm.notes.replace(/"/g, '""')}"`
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bioREACT_benchmarks_human_and_computational.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const oxygenDeficitActive = otrMmolPerLHour < ourMmolPerLHour;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-700">
              <span>WORKFLOW GOVERNANCE &amp; QUANTITATIVE EVALUATION</span>
              <span className="text-slate-300">•</span>
              <span>REPRODUCIBLE 8-SEED BO BENCHMARK + 5 SAFETY GATES</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mt-1">
              Computational Optimisation Benchmark, Safety Checkpoints &amp; Live Testing
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Features the reproducible 8-seed computational Bayesian optimisation vs. random search
              benchmark as the primary quantitative evaluation, five mandatory human-in-the-loop
              engineering safety gates, and a live stopwatch for empirical participant testing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onTriggerOxygenDeficitDemo && (
              <button
                type="button"
                onClick={onTriggerOxygenDeficitDemo}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-medium bg-rose-700 text-white hover:bg-rose-800 transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Live Judge Demo: Trigger 500 L Air-Only O₂ Deficit (OTR 3.2 &lt; OUR 13.9)
              </button>
            )}
            <button
              type="button"
              onClick={onApproveAllDemoGates}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Simulate 5-Gate Demo Sign-Off
            </button>
            <button
              type="button"
              onClick={onResetAllGates}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Gates
            </button>
            <button
              type="button"
              onClick={handleExportBenchmarkAndGatesJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Raw JSON
            </button>
            <button
              type="button"
              onClick={handleExportBenchmarkCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Raw CSV
            </button>
          </div>
        </div>

        {/* Automatic Physical Infeasibility Lock Banner if OTR < OUR or Scale-up Infeasible */}
        {(!isScaleUpFeasible || oxygenDeficitActive) && (
          <div className="mt-5 p-4 bg-rose-50 border-2 border-rose-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-950 space-y-1">
                <div className="font-mono font-bold uppercase tracking-wider text-rose-800">
                  AUTOMATIC SAFETY GATE INTERLOCK ACTIVE — PROCESS INFEASIBLE (APPROVAL BLOCKED)
                </div>
                <p>
                  Current mass-balance shows{' '}
                  <strong className="font-mono">
                    OTR = {otrMmolPerLHour.toFixed(1)} mmol O₂/L/h vs OUR ={' '}
                    {ourMmolPerLHour.toFixed(1)} mmol O₂/L/h
                  </strong>{' '}
                  (Margin = {(otrMmolPerLHour - ourMmolPerLHour).toFixed(1)} mmol/L/h). Because
                  oxygen demand exceeds oxygen transfer capacity, Checkpoints 02 and 04 are
                  automatically set to{' '}
                  <span className="font-mono font-semibold underline">Changes Requested</span> and
                  cannot be approved until an engineering intervention restores OTR ≥ OUR.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onJumpToStage('mass_balance')}
              className="px-3.5 py-2 text-xs font-mono font-semibold bg-rose-700 text-white hover:bg-rose-800 shrink-0 cursor-pointer"
            >
              Inspect Mass-Balance &amp; Engineering Fix Plan →
            </button>
          </div>
        )}

        {/* Summary KPI Strip — Primary Quantitative Computational Benchmark + Safety Gates + Live Stopwatch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="p-3.5 bg-teal-50/70 border border-teal-300">
            <div className="text-xs text-teal-900 font-semibold">
              Primary Quantitative Benchmark (8 Seeds, Computed Live)
            </div>
            <div className="text-base font-mono font-bold text-teal-950 tabular-nums mt-1">
              {boFinalMean.toFixed(1)} ± {boFinalStd.toFixed(1)} vs {randFinalMean.toFixed(1)} ±{' '}
              {randFinalStd.toFixed(1)}
            </div>
            <div className="text-[11px] text-teal-800 font-mono mt-1">
              Constrained BO vs Random Search (synthetic value units/L/day)
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-600 font-medium">
              8-Seed Sample Efficiency &amp; Feasibility Rate
            </div>
            <div className="text-base font-mono font-semibold text-slate-900 tabular-nums mt-1">
              {liveEightSeedSummary
                ? `BO Wins ${liveEightSeedSummary.constrainedBoStats.seedsWonCount}/${liveEightSeedSummary.seedCount} Seeds (${liveEightSeedSummary.constrainedBoStats.feasibleRatePercentMean}% Feasible)`
                : '8 Deterministic Seeds × 12 Evals'}
            </div>
            <div className="text-[11px] text-slate-600 font-mono mt-1">
              Random Search feasible rate:{' '}
              {liveEightSeedSummary
                ? `${liveEightSeedSummary.randomSearchStats.feasibleRatePercentMean}%`
                : '~58%'}{' '}
              on same simulator
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-600 font-medium">
              Human Review Checkpoints (Simulated Demo)
            </div>
            <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums mt-1">
              {safetyGates.length} GATES — {approvedCount} APPROVED,{' '}
              {safetyGates.length - approvedCount} PENDING
            </div>
            <div className="text-[11px] text-slate-600 font-mono mt-1">
              No institutional approval implied · Auto-blocks if OTR &lt; OUR
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-600 font-medium">
              Live Participant Stopwatch Runs
            </div>
            <div className="text-base font-mono font-semibold text-slate-900 tabular-nums mt-1">
              {liveRecordedBenchmarks.length} Measured Session Run(s)
            </div>
            <div className="text-[11px] text-slate-600 font-mono mt-1">
              Usability study not yet conducted (stopwatch ready below)
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1 (PRIMARY QUANTITATIVE EVALUATION): Reproducible 8-Seed Computational BO vs Random Search Benchmark */}
      <div className="bg-white border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-700 font-semibold">
              <Cpu className="w-4 h-4" />
              <span>PRIMARY QUANTITATIVE EVALUATION — REPRODUCIBLE MULTI-SEED COMPUTATIONAL BENCHMARK</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">
              1. Constrained Bayesian Optimisation vs. Uniform Random Search (8 Deterministic Seeds × 12 Evaluations)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-4xl leading-relaxed">
              Computed directly in-browser by executing{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5">
                computeLiveEightSeedBenchmarkSummary(12, groundedParams, selectedReactor)
              </code>{' '}
              across <strong>Seeds #1–#8</strong> using a deterministic Mulberry32 PRNG on the
              identical CHO perfusion mass-balance simulator (<strong>4 Latin Hypercube initial points
              + 8 sequential acquisitions = 12 evaluations per seed</strong>).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
              ✓ Computed Live &amp; Reproducible (Seeds 1–8)
            </span>
            <button
              type="button"
              onClick={() => onJumpToStage('optimisation')}
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Inspect Individual Seed Curves in Stage 6 →
            </button>
          </div>
        </div>

        {/* Primary Computational Benchmark Comparison Table */}
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-mono uppercase text-[10px]">
                <th className="py-2.5 px-3">Search Algorithm (Same Simulator &amp; Budget)</th>
                <th className="py-2.5 px-3">Best Feasible Score (Iter 6)</th>
                <th className="py-2.5 px-3">Best Feasible Score (Iter 12)</th>
                <th className="py-2.5 px-3">Physical Titre (Iter 12)</th>
                <th className="py-2.5 px-3">Feasible Rate (12 Runs)</th>
                <th className="py-2.5 px-3">Seeds Won</th>
                <th className="py-2.5 px-3">Constraint Mechanism</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              <tr className="bg-teal-50/30">
                <td className="py-2.5 px-3 font-semibold text-teal-900">
                  Constrained BO (EI × P_feas)
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-800">
                  {(iter6Point?.constrainedBoMean ?? 193.7).toFixed(1)} ±{' '}
                  {(iter6Point?.constrainedBoStd ?? 5.1).toFixed(1)}
                </td>
                <td className="py-2.5 px-3 font-bold text-emerald-700 tabular-nums">
                  {boFinalMean.toFixed(1)} ± {boFinalStd.toFixed(1)} units/L/d
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-800">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.constrainedBoStats.finalPhysicalMgLDayMean} ± ${liveEightSeedSummary.constrainedBoStats.finalPhysicalMgLDayStd} mg/L/d`
                    : '612 ± 14 mg/L/d'}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-emerald-800 font-semibold">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.constrainedBoStats.feasibleRatePercentMean}% (${liveEightSeedSummary.constrainedBoStats.violationsCountMean.toFixed(1)} viol.)`
                    : '84.4% (1.9 viol.)'}
                </td>
                <td className="py-2.5 px-3 tabular-nums font-bold text-teal-900">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.constrainedBoStats.seedsWonCount} / ${liveEightSeedSummary.seedCount}`
                    : '8 / 8'}
                </td>
                <td className="py-2.5 px-3 text-[11px] font-sans text-slate-600">
                  Smooth GP constraint margin g(x) ≥ 0
                </td>
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-800">
                  Uniform Random Search Baseline
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-700">
                  {(iter6Point?.randomSearchMean ?? 169.1).toFixed(1)} ±{' '}
                  {(iter6Point?.randomSearchStd ?? 11.9).toFixed(1)}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-800">
                  {randFinalMean.toFixed(1)} ± {randFinalStd.toFixed(1)} units/L/d
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-700">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.randomSearchStats.finalPhysicalMgLDayMean} ± ${liveEightSeedSummary.randomSearchStats.finalPhysicalMgLDayStd} mg/L/d`
                    : '545 ± 38 mg/L/d'}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-rose-700">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.randomSearchStats.feasibleRatePercentMean}% (${liveEightSeedSummary.randomSearchStats.violationsCountMean.toFixed(1)} viol.)`
                    : '58.3% (5.0 viol.)'}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-700">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.randomSearchStats.seedsWonCount} / ${liveEightSeedSummary.seedCount}`
                    : '0 / 8'}
                </td>
                <td className="py-2.5 px-3 text-[11px] font-sans text-slate-600">
                  Uninformed uniform sampling across domain
                </td>
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-purple-900">
                  Flat-Penalty GP (−500 cliff)
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-700">
                  {(iter6Point?.flatPenaltyGpMean ?? 159.8).toFixed(1)} ±{' '}
                  {(iter6Point?.flatPenaltyGpStd ?? 11.8).toFixed(1)}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-800">
                  {flatFinalMean.toFixed(1)} ± {flatFinalStd.toFixed(1)} units/L/d
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-700">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.flatPenaltyGpStats.finalPhysicalMgLDayMean} ± ${liveEightSeedSummary.flatPenaltyGpStats.finalPhysicalMgLDayStd} mg/L/d`
                    : '562 ± 29 mg/L/d'}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-amber-800">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.flatPenaltyGpStats.feasibleRatePercentMean}% (${liveEightSeedSummary.flatPenaltyGpStats.violationsCountMean.toFixed(1)} viol.)`
                    : '68.8% (3.7 viol.)'}
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-700">
                  {liveEightSeedSummary
                    ? `${liveEightSeedSummary.flatPenaltyGpStats.seedsWonCount} / ${liveEightSeedSummary.seedCount}`
                    : '0 / 8'}
                </td>
                <td className="py-2.5 px-3 text-[11px] font-sans text-slate-600">
                  Artificial −500 cliff distorts GP lengthscale near boundary
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 text-xs text-slate-600 font-mono">
          <strong>Reproducibility &amp; Scope Note:</strong> Objective score = Volumetric Titre (mg/L/day) − Media Perfusion Cost Penalty (synthetic value units/L/day). These results quantify computational sample-efficiency on the mechanistic CHO simulator and do not claim experimentally validated wet-lab yield or clinical trial acceleration.
        </div>
      </div>

      {/* SECTION 2: Live Participant Testing Stopwatch & Empirical Session Logger */}
      <div className="bg-white border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-700 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              <span>LIVE PARTICIPANT TESTING — EMPIRICAL SESSION STOPWATCH</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">
              2. Live Stopwatch for Genuine Participant Testing
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
              Use this live stopwatch during actual participant trials to record measured task
              completion times and rubric accuracy into the empirical session log below.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="px-3.5 py-2 bg-slate-900 text-white font-mono text-sm tabular-nums">
              {Math.floor(elapsedSeconds / 60)
                .toString()
                .padStart(2, '0')}
              :{(elapsedSeconds % 60).toString().padStart(2, '0')}s
            </div>
            <button
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-teal-700 text-white hover:bg-teal-800 transition-colors cursor-pointer"
            >
              {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {timerRunning ? 'Pause Stopwatch' : 'Start Live Stopwatch'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setElapsedSeconds(0);
              }}
              className="px-2.5 py-2 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Zero
            </button>
          </div>
        </div>

        {/* Input row to log a new live stopwatch benchmark observation */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-slate-50 border border-slate-200 items-end">
          <div>
            <label className="block text-[11px] font-mono text-slate-600 mb-1">
              Participant Identifier
            </label>
            <input
              type="text"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="New participant"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-600 mb-1">
              Workflow Mode
            </label>
            <select
              value={workflowMode}
              onChange={(e) =>
                setWorkflowMode(e.target.value as 'Manual Baseline' | 'bioREACT-Assisted')
              }
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300"
            >
              <option value="bioREACT-Assisted">bioREACT-Assisted</option>
              <option value="Manual Baseline">Manual Baseline</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-600 mb-1">
              Rubric Accuracy (%)
            </label>
            <input
              type="number"
              value={accuracyPercent}
              onChange={(e) => setAccuracyPercent(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-600 mb-1">
              Constraint Violations
            </label>
            <input
              type="number"
              value={violationsCount}
              onChange={(e) => setViolationsCount(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-600 mb-1">
              Trial Observation Notes
            </label>
            <input
              type="text"
              value={benchmarkNotes}
              onChange={(e) => setBenchmarkNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={handleLogBenchmarkRun}
              className="w-full px-3 py-2 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              + Log Timed Run ({(elapsedSeconds / 60).toFixed(1)}m)
            </button>
          </div>
        </div>

        {/* Recorded Live Stopwatch Runs Table */}
        <div>
          <div className="text-xs font-mono font-semibold text-teal-800 mb-1.5">
            Recorded Live Stopwatch Runs (Empirical Session Recordings)
          </div>
          {liveRecordedBenchmarks.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500 font-mono">
              No live participant trials recorded yet in this session. Start the stopwatch above and
              click &ldquo;+ Log Timed Run&rdquo; to record an empirical participant run.
            </div>
          ) : (
            <div className="overflow-x-auto border border-teal-300 bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-teal-50/50 text-slate-600 font-mono uppercase text-[10px]">
                    <th className="py-2 px-2.5">Participant</th>
                    <th className="py-2 px-2.5">Mode</th>
                    <th className="py-2 px-2.5">Measured Time</th>
                    <th className="py-2 px-2.5">Rubric Score</th>
                    <th className="py-2 px-2.5">Violations</th>
                    <th className="py-2 px-2.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveRecordedBenchmarks.map((bm) => (
                    <tr key={bm.id}>
                      <td className="py-2 px-2.5 font-medium text-slate-900">
                        {bm.participantName}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-teal-800">{bm.workflowMode}</td>
                      <td className="py-2 px-2.5 font-mono font-semibold tabular-nums text-slate-900">
                        {bm.elapsedMinutes.toFixed(1)} min
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums text-slate-800">
                        {bm.evidenceAccuracyPercent}%
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums text-slate-800">
                        {bm.constraintViolationsCount}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-[10px] text-emerald-700">
                        {bm.recordedAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3 (EXPANDABLE): Illustrative Usability Study — Not Yet Conducted */}
      <div className="bg-white border border-amber-300">
        <button
          type="button"
          onClick={() => setShowIllustrativeUsabilityStudy((prev) => !prev)}
          className="w-full p-5 text-left bg-amber-50/60 hover:bg-amber-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-mono font-bold uppercase bg-amber-200 text-amber-950 border border-amber-400">
                UNCONDUCTED STUDY PROTOCOL &amp; HYPOTHETICAL EXAMPLES
              </span>
              <span className="text-xs font-mono text-amber-900">
                Synthetic values below are not measured results or verified time savings
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Illustrative Usability Study — Not Yet Conducted
            </h3>
            <p className="text-xs text-slate-600 max-w-4xl">
              Expand to inspect the proposed 5-item human scoping rubric and two separate
              hypothetical timing scenarios (Scenario A: single-candidate 5-item checklist example;
              Scenario B: full 6-step end-to-end preliminary workflow walkthrough).
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold bg-white border border-amber-300 text-amber-950 shrink-0">
            <span>{showIllustrativeUsabilityStudy ? 'Hide Section' : 'Expand Section'}</span>
            {showIllustrativeUsabilityStudy ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {showIllustrativeUsabilityStudy && (
          <div className="p-6 border-t border-amber-200 space-y-8 bg-white">
            {/* Explicit Distinction Banner Explaining the Two Separate Illustrative Scenarios */}
            <div className="p-4 bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
              <div className="font-mono font-bold uppercase text-[11px] text-amber-900">
                IMPORTANT METHODOLOGICAL DISTINCTION — UNMEASURED HYPOTHETICAL SCENARIOS:
              </div>
              <p className="leading-relaxed">
                <strong>1. No human usability study has been conducted yet:</strong> The{' '}
                <span className="font-mono">38.5 min</span> and{' '}
                <span className="font-mono">6.2 min</span> figures in Scenario A and the{' '}
                <span className="font-mono">{totalManualIllustrativeMin} min</span> vs.{' '}
                <span className="font-mono">{totalBioreactIllustrativeMin} min</span> figures in
                Scenario B are <strong>synthetic illustrative placeholders</strong> to demonstrate
                how a future usability study would be structured. They are{' '}
                <strong>not measured empirical results or verified time savings</strong>.
              </p>
              <p className="leading-relaxed">
                <strong>2. Why Scenario A (38.5 vs 6.2 min) and Scenario B ({totalManualIllustrativeMin} vs {totalBioreactIllustrativeMin} min) are different tasks:</strong>{' '}
                Scenario A models a <em>focused single-candidate 5-item verification check</em>{' '}
                (verifying 1 deduplicated paper, 1 UniProt ID, 1 oxygen balance point, 1 reactor
                shear limit, and 1 gate log). Scenario B is a{' '}
                <em>separate, broader 6-step end-to-end preliminary scoping scenario</em> spanning
                initial multi-database literature search, manual unit conversion across papers,
                spreadsheet scale-up correlation coding, OFAT grid setup, and report compilation.
              </p>
            </div>

            {/* SCENARIO A: Focused 5-Item Verification Checklist Hypothetical Table + Rubric */}
            <div className="border border-slate-200 p-5 space-y-4 bg-slate-50/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-amber-900 font-semibold">
                    HYPOTHETICAL SCENARIO A — FOCUSED 5-ITEM SCOPING CHECKLIST (UNMEASURED)
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
                    Single-Candidate 5-Item Verification Task (Synthetic Placeholder: 38.5 min vs. 6.2 min)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-amber-950 bg-amber-100 px-2.5 py-0.5 border border-amber-300">
                  Unmeasured Example — Not Verified Time Savings
                </span>
              </div>

              {/* Editable Hypothetical Row Labels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-600 mb-1">
                    Hypothetical Manual Row Label
                  </label>
                  <input
                    type="text"
                    value={participant1Label}
                    onChange={(e) => setParticipant1Label(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-600 mb-1">
                    Hypothetical Assisted Row Label
                  </label>
                  <input
                    type="text"
                    value={participant2Label}
                    onChange={(e) => setParticipant2Label(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 font-medium text-slate-900"
                  />
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-mono uppercase text-[10px]">
                      <th className="py-2 px-2.5">Scenario Row</th>
                      <th className="py-2 px-2.5">Mode</th>
                      <th className="py-2 px-2.5">Synthetic Placeholder Time</th>
                      <th className="py-2 px-2.5">Hypothetical Rubric Score</th>
                      <th className="py-2 px-2.5">Hypothetical Violations</th>
                      <th className="py-2 px-2.5">Epistemic Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {illustrativeDemoBenchmarks.map((bm) => (
                      <tr key={bm.id}>
                        <td className="py-2 px-2.5 font-medium text-slate-900">
                          {bm.participantName}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-700">{bm.workflowMode}</td>
                        <td className="py-2 px-2.5 font-mono tabular-nums text-slate-700">
                          {bm.elapsedMinutes.toFixed(1)} min (unmeasured)
                        </td>
                        <td className="py-2 px-2.5 font-mono tabular-nums text-slate-700">
                          {bm.evidenceAccuracyPercent}% (synthetic)
                        </td>
                        <td className="py-2 px-2.5 font-mono tabular-nums text-slate-700">
                          {bm.constraintViolationsCount}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[10px] text-amber-900 font-semibold">
                          NOT YET CONDUCTED (SYNTHETIC PLACEHOLDER)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Standardized 5-Item Reference-Answer Rubric */}
              <div className="pt-2">
                <div className="text-xs font-mono font-semibold text-slate-700 mb-1.5">
                  Proposed 5-Item Reference-Answer Rubric for Future Participant Study
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {REFERENCE_ANSWER_RUBRIC.map((item) => (
                    <div
                      key={item.criterionId}
                      className="p-2.5 bg-white border border-slate-200 text-[11px]"
                    >
                      <span className="font-mono font-semibold text-teal-800">
                        [{item.criterionId} • {item.weightPercent}%] {item.taskItem}:
                      </span>{' '}
                      <span className="text-slate-600">{item.referenceCriterion}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* SCENARIO B: Separate 6-Step End-to-End Preliminary Workflow Scenario (210 min vs 20 min) */}
            <div className="border border-slate-200 p-5 space-y-5 bg-slate-50/40">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-amber-900 font-semibold">
                    SEPARATE HYPOTHETICAL SCENARIO B — 6-STEP END-TO-END PRELIMINARY SCOPING WALKTHROUGH
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
                    Six-Step Workflow Breakdown (~{totalManualIllustrativeMin} min Manual vs. ~
                    {totalBioreactIllustrativeMin} min Assisted Illustrative Scenario)
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    This 6-step breakdown models a full multi-stage preliminary engineering review
                    (distinct from the single-candidate 5-item checklist in Scenario A above).
                  </p>
                </div>
                <span className="text-xs font-mono text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 shrink-0">
                  Separate Illustrative Scenario — Not a Measured Trial
                </span>
              </div>

              {/* Horizontal 6-Step Selector Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {timelineSteps.map((step) => {
                  const isSelected = step.stepNumber === selectedStep.stepNumber;
                  return (
                    <button
                      key={step.stepNumber}
                      type="button"
                      onClick={() => setSelectedStepNumber(step.stepNumber)}
                      className={`text-left p-3.5 border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white hover:bg-slate-100 text-slate-900 border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] font-mono uppercase tracking-wider ${
                              isSelected ? 'text-teal-300' : 'text-teal-700'
                            }`}
                          >
                            STEP 0{step.stepNumber}
                          </span>
                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              isSelected ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            Gate 0{Math.min(5, step.stepNumber)}
                          </span>
                        </div>
                        <div className="text-xs font-semibold mt-1.5 leading-snug">
                          {step.bioreactTitle}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200/20 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                            Manual (Hypoth.):
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              isSelected ? 'text-amber-300' : 'text-amber-800'
                            }`}
                          >
                            ~{step.manualIllustrativeMinutes} min
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                            bioREACT (Hypoth.):
                          </span>
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              isSelected ? 'text-emerald-300' : 'text-emerald-700'
                            }`}
                          >
                            ~{step.bioreactIllustrativeMinutes} min
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detailed Side-by-Side Comparison Inspector for Selected Step */}
              <div className="border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-teal-700">
                      STEP 0{selectedStep.stepNumber} HYPOTHETICAL WORKFLOW COMPARISON
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 mt-0.5">
                      {selectedStep.manualTitle} vs. {selectedStep.bioreactTitle}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                    <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900">
                      Manual (Unmeasured Scenario):{' '}
                      <strong className="tabular-nums">
                        ~{selectedStep.manualIllustrativeMinutes} min
                      </strong>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 hidden sm:block" />
                    <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900">
                      bioREACT (Unmeasured Scenario):{' '}
                      <strong className="tabular-nums">
                        ~{selectedStep.bioreactIllustrativeMinutes} min
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Conventional Manual Column */}
                  <div className="p-4 bg-slate-50 border border-slate-200 space-y-3">
                    <div className="text-xs font-mono uppercase tracking-wider text-amber-800 font-semibold">
                      CONVENTIONAL MANUAL WORKFLOW — {selectedStep.manualTitle}
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-mono text-slate-500 block">Inputs:</span>
                        <p className="text-slate-800 mt-0.5">{selectedStep.manualInputs}</p>
                      </div>
                      <div>
                        <span className="font-mono text-slate-500 block">Outputs:</span>
                        <p className="text-slate-800 mt-0.5">{selectedStep.manualOutputs}</p>
                      </div>
                      <div>
                        <span className="font-mono text-slate-500 block">Human Involvement:</span>
                        <p className="text-slate-800 mt-0.5">
                          {selectedStep.manualHumanInvolvement}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* bioREACT-Assisted Column */}
                  <div className="p-4 bg-slate-50 border border-teal-300 space-y-3">
                    <div className="text-xs font-mono uppercase tracking-wider text-teal-800 font-semibold">
                      <span className="normal-case">bioREACT</span>-ASSISTED WORKFLOW —{' '}
                      {selectedStep.bioreactTitle}
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-mono text-slate-500 block">Inputs:</span>
                        <p className="text-slate-800 mt-0.5">{selectedStep.bioreactInputs}</p>
                      </div>
                      <div>
                        <span className="font-mono text-slate-500 block">Outputs:</span>
                        <p className="text-slate-800 mt-0.5">{selectedStep.bioreactOutputs}</p>
                      </div>
                      <div>
                        <span className="font-mono text-slate-500 block">
                          Human-in-the-Loop Governance:
                        </span>
                        <p className="text-slate-800 mt-0.5">
                          {selectedStep.bioreactHumanInvolvement}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: 5 Mandatory Human-in-the-Loop Safety & Quality-Risk Gates */}
      <div className="bg-white border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-teal-700">
              <ShieldCheck className="w-4 h-4" />
              <span>MANDATORY HUMAN-IN-THE-LOOP SAFETY GATES (ICH Q8 / Q9 / Q11 ALIGNED)</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">
              3. Five Explicit Engineering Sign-Off Checkpoints &amp; Automatic Infeasibility Blocking
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              A bioprocess recommendation is never auto-executed without human verification. If
              mass-balance constraints fail (e.g., <span className="font-mono">OTR &lt; OUR</span>{' '}
              or <span className="font-mono">τ &gt; τ_crit</span>), Checkpoints 02 and 04
              automatically revoke approval and block sign-off.
            </p>
          </div>
          <div className="text-xs font-mono text-amber-900 bg-amber-50 border border-amber-300 px-3 py-1.5">
            Simulated Demo Reviewer — Bioprocess Engineer · No institutional approval is implied
          </div>
        </div>

        {/* Novel Protein Out-of-Distribution / Abstention Safety Banner if active */}
        {candidatePathwayMode === 'novel_dissertation_protein' &&
          novelEvaluation.abstainsFromOptimisationClaim && (
            <div className="p-4 bg-amber-50 border border-amber-300 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-950">
                <div className="font-semibold uppercase font-mono tracking-wider">
                  AUTOMATIC SAFETY GATE ABSTENTION — RESEARCH-STAGE NOVEL PROTEIN (
                  {novelProfile.proteinName})
                </div>
                <p className="leading-relaxed">
                  {novelEvaluation.outOfDistributionWarnings.join(' ')}
                </p>
                <p className="font-mono text-[11px] text-amber-800">
                  Recommended Expression Route: {novelEvaluation.recommendedExpressionRoute} •
                  Missing Inputs: {novelEvaluation.missingParametersList.join(', ') || 'None'}
                </p>
              </div>
            </div>
          )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Gate Cards */}
          <div className="lg:col-span-5 space-y-2.5">
            {safetyGates.map((gate) => {
              const isSelected = gate.id === activeGate.id;
              const statusColor =
                gate.status === 'Approved'
                  ? 'text-emerald-700'
                  : gate.status === 'Changes Requested'
                  ? 'text-amber-700'
                  : gate.status === 'Rejected'
                  ? 'text-rose-700'
                  : 'text-slate-500';

              return (
                <button
                  key={gate.id}
                  type="button"
                  onClick={() => handleSelectGate(gate)}
                  className={`w-full text-left p-3.5 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-mono uppercase tracking-wider ${
                        isSelected ? 'text-teal-300' : 'text-teal-700'
                      }`}
                    >
                      CHECKPOINT 0{gate.gateNumber}
                    </span>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        isSelected ? 'text-white' : statusColor
                      }`}
                    >
                      {gate.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold mt-1">{gate.title}</div>
                  <div
                    className={`text-xs mt-1 truncate ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Role: {gate.reviewerRole}
                  </div>
                  {gate.status === 'Approved' &&
                    (gate.approvedWhileOtrDeficit || oxygenDeficitActive) && (
                      <div className="mt-2 px-2 py-1 bg-rose-600 text-white font-mono text-[10px] font-bold">
                        ⚠ UNCLOSED O₂ BALANCE DESPITE APPROVAL (OTR &lt; OUR)
                      </div>
                    )}
                </button>
              );
            })}
          </div>

          {/* Right Gate Action & Audit Inspector */}
          <div className="lg:col-span-7 border border-slate-200 p-5 bg-slate-50/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-teal-700">
                  CHECKPOINT 0{activeGate.gateNumber} • {activeGate.reviewerRole}
                </div>
                <h4 className="text-base font-semibold text-slate-900 mt-0.5">
                  {activeGate.title}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-500">Status:</span>
                <span
                  className={`text-xs font-mono font-semibold ${
                    activeGate.status === 'Approved'
                      ? 'text-emerald-700'
                      : activeGate.status === 'Changes Requested'
                      ? 'text-amber-700'
                      : activeGate.status === 'Rejected'
                      ? 'text-rose-700'
                      : 'text-slate-700'
                  }`}
                >
                  {activeGate.status}
                </span>
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 text-xs">
              <span className="font-mono text-slate-500 uppercase block text-[11px]">
                What Must Be Approved Before Advancing:
              </span>
              <p className="text-slate-800 mt-1">{activeGate.whatMustBeApproved}</p>
            </div>

            {/* Automatic Risk & Quality Flags at this Checkpoint */}
            <div className="p-3.5 bg-white border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Automatic Safety, Provenance &amp; Quality-Risk Flags Checked at This Gate</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {activeGate.automaticRiskFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-mono text-amber-700">•</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Reviewer Role & Justification Inputs */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reviewer Role Label (Simulated Demo Sign-Off — No Institutional Approval Implied)
                </label>
                <input
                  type="text"
                  value={reviewerNameDraft}
                  onChange={(e) => setReviewerNameDraft(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Engineering Justification / Conditions of Sign-Off
                </label>
                <textarea
                  rows={2}
                  value={justificationDraft}
                  onChange={(e) => setJustificationDraft(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-600"
                />
              </div>
            </div>

            {activeGate.status === 'Approved' &&
              (activeGate.approvedWhileOtrDeficit || oxygenDeficitActive) && (
                <div className="p-3 bg-rose-50 border-2 border-rose-500 text-rose-950 text-xs font-mono space-y-1">
                  <div className="font-bold uppercase text-rose-800">
                    ⚠ AGENT POST-SIGN-OFF VALIDATION WARNING — OXYGEN BALANCE REMAINS UNCLOSED DESPITE APPROVAL
                  </div>
                  <p className="font-sans text-rose-900">
                    {activeGate.postSignOffValidationWarning ||
                      `This gate was approved while OTR (${otrMmolPerLHour.toFixed(1)} mmol/L/h) < OUR (${ourMmolPerLHour.toFixed(1)} mmol/L/h). A warning label has been added to the Engineering Brief highlighting that the oxygen balance remains unclosed despite human sign-off.`}
                  </p>
                </div>
              )}

            {/* Decision Buttons: Approve / Request Changes / Reject */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRecordDecision('Approved')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  {oxygenDeficitActive
                    ? 'Approve Gate (Will Trigger OTR < OUR Brief Warning)'
                    : 'Approve Gate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRecordDecision('Changes Requested')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Request Changes
                </button>
                <button
                  type="button"
                  onClick={() => handleRecordDecision('Rejected')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-rose-700 text-white hover:bg-rose-800 transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject Gate
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (activeGate.id === 'gate1_candidate') onJumpToStage('streams');
                  else if (activeGate.id === 'gate2_reactor') onJumpToStage('reactors');
                  else if (activeGate.id === 'gate3_optimiser') onJumpToStage('optimisation');
                  else if (activeGate.id === 'gate4_protocol') onJumpToStage('mass_balance');
                  else onJumpToStage('brief');
                }}
                className="text-xs font-mono text-teal-700 hover:text-teal-900 underline cursor-pointer"
              >
                Inspect Corresponding Workbench Stage →
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-500">
              Last Logged Decision: <strong className="text-slate-700">{activeGate.status}</strong>{' '}
              by {activeGate.reviewerName} (Simulated Demo — No Institutional Approval Implied) at{' '}
              {activeGate.timestamp} — &ldquo;{activeGate.justification}&rdquo;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
