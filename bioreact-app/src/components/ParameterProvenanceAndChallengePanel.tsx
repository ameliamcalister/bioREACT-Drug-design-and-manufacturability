import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FlaskConical,
  GitCompare,
  Layers,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import {
  AuditableParameterId,
  AuditedParameterProvenanceRecord,
  ParameterChallengeSnapshot,
  ScientificConsistencyCheckItem,
  StrictParameterClassification,
} from '../types/bioreact';
import { formatCogsHeadline } from '../services/bioprocessEngine';

interface ParameterProvenanceAndChallengePanelProps {
  provenanceLedger: AuditedParameterProvenanceRecord[];
  consistencyChecks: ScientificConsistencyCheckItem[];
  challengeHistory: ParameterChallengeSnapshot[];
  selectedParamId: AuditableParameterId;
  onSelectParamId: (id: AuditableParameterId) => void;
  onApplyChallenge: (
    parameterId: AuditableParameterId,
    newValue: number,
    justification: string
  ) => void;
  onResetAllChallenges: () => void;
}

const CLASSIFICATION_BADGE_STYLES: Record<StrictParameterClassification, string> = {
  'Directly measured and source-verified':
    'bg-emerald-950/70 text-emerald-300 border-emerald-500/40',
  'Derived from literature with documented calculation':
    'bg-cyan-950/70 text-cyan-300 border-cyan-500/40',
  'Researcher-provided':
    'bg-violet-950/70 text-violet-300 border-violet-500/40',
  'Synthetic demonstration assumption':
    'bg-amber-950/70 text-amber-300 border-amber-500/40',
  'Unverified or unknown':
    'bg-rose-950/70 text-rose-300 border-rose-500/40',
};

const QUICK_CHALLENGE_PRESETS: Array<{
  id: string;
  parameterId: AuditableParameterId;
  label: string;
  newValue: number;
  justification: string;
  summary: string;
}> = [
  {
    id: 'preset_qo2_high',
    parameterId: 'q_o2',
    label: 'Challenge q_O2 → 0.42 pmol/cell/h (Upper CHO Respiration Bound)',
    newValue: 0.42,
    justification:
      'Wet-lab blood-gas / off-gas analyser measurement showing elevated specific oxygen uptake (0.42 pmol/cell/h, within Doran 2013 Table 10.6 upper CHO range of 0.15–0.45 pmol/cell/h).',
    summary:
      'Tests whether 500 L oxygen transfer closes if cellular respiration is at the top of the published CHO range.',
  },
  {
    id: 'preset_qp_conservative',
    parameterId: 'q_p',
    label: 'Challenge q_p → 18.5 pg/cell/day (Early Unamplified CHO Clone)',
    newValue: 18.5,
    justification:
      'Substituted early ambr250 clone measurement (18.5 pg/cell/day, near lower bound of Bielser et al. 2018 Table 1 range of 15–50 pg/cell/day) replacing synthetic 28.4 pg/cell/day default.',
    summary:
      'Quantifies downstream impact of lower specific productivity on volumetric titre and usable Drug Substance COGS ($/g).',
  },
  {
    id: 'preset_kla_gassing_out',
    parameterId: 'kla',
    label: 'Challenge k_La → 24.0 h⁻¹ (Empirical Dynamic Gassing-Out Override)',
    newValue: 24.0,
    justification:
      'Substituted empirical dynamic gassing-out k_La = 24.0 h⁻¹ measured in 500 L vessel with antifoam C (derating synthetic 96.0 h⁻¹ microsparger prefactor).',
    summary:
      'Switches k_La from Van’t Riet correlation to Researcher-provided manual mode and recomputes OTR vs OUR.',
  },
  {
    id: 'preset_tau_sensitive',
    parameterId: 'tau_crit',
    label: 'Challenge τ_crit → 1.15 Pa (Aggregation-Prone Biologic Limit)',
    newValue: 1.15,
    justification:
      'Ultra-scale-down rotating-disk SEC-HPLC assay showing HMW aggregate formation above 1.15 Pa bulk shear proxy.',
    summary:
      'Tightens hydrodynamic shear ceiling in both 500 L scale-up and Stage 6 Constrained Bayesian Optimisation.',
  },
];

export const ParameterProvenanceAndChallengePanel: React.FC<
  ParameterProvenanceAndChallengePanelProps
> = ({
  provenanceLedger,
  consistencyChecks,
  challengeHistory,
  selectedParamId,
  onSelectParamId,
  onApplyChallenge,
  onResetAllChallenges,
}) => {
  const activeRecord =
    provenanceLedger.find((r) => r.parameterId === selectedParamId) ||
    provenanceLedger[0];

  const [challengeInputVal, setChallengeInputVal] = useState<string>(
    activeRecord.currentValue.toString()
  );
  const [challengeJustification, setChallengeJustification] = useState<string>(
    activeRecord.researcherChallengeJustification ||
      'Substituted documented wet-lab measurement / literature sensitivity value to audit downstream impact.'
  );

  const handleSelectRecord = (rec: AuditedParameterProvenanceRecord) => {
    onSelectParamId(rec.parameterId);
    setChallengeInputVal(rec.currentValue.toString());
    setChallengeJustification(
      rec.researcherChallengeJustification ||
        `Challenging ${rec.symbol} (${rec.name}) with documented experimental or literature boundary value.`
    );
  };

  const handleRunChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(challengeInputVal);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onApplyChallenge(
      activeRecord.parameterId,
      parsed,
      challengeJustification.trim() ||
        `Researcher-supplied override for ${activeRecord.symbol}`
    );
  };

  const latestSnapshot =
    challengeHistory.length > 0 ? challengeHistory[0] : null;

  return (
    <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header & Strict 5-Tier Epistemic Policy Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
              <FileSearch className="w-3.5 h-3.5" />
              Traceable Parameter Provenance & Challenge Workbench
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-950/70 text-amber-300 border border-amber-500/30">
              Zero Unverified &ldquo;Grounded&rdquo; Claims
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-2">
            Clickable Source Evidence, Causal Propagation & Assumption-Challenge Audit
          </h3>
          <p className="text-xs text-slate-300 mt-1 max-w-4xl leading-relaxed">
            A citation identifier next to a slider does not prove that the cited paper measured that exact point value. Every model input below is audited against its primary publication and assigned a strict 5-tier epistemic classification. Click any parameter to inspect what the source actually reports, trace how it propagates from mass balance to COGS, or challenge the assumption and compare before/after pipeline outputs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onResetAllChallenges}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            Reset All to Default Assumptions
          </button>
        </div>
      </div>

      {/* 5-Tier Classification Legend */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
          <span>Strict 5-Tier Parameter Classification Standard (Applied Across All Simulator Inputs)</span>
          <span className="text-cyan-400">Click any parameter card below to audit</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
            <div className="font-semibold text-emerald-300 text-[11px]">
              1. Directly measured and source-verified
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Exact number &amp; units reported verbatim in the cited publication for the chosen biological host.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30">
            <div className="font-semibold text-cyan-300 text-[11px]">
              2. Derived from literature with documented calculation
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Calculated from a published correlation or local-to-bulk scaling rule with explicit equations shown.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-violet-950/30 border border-violet-500/30">
            <div className="font-semibold text-violet-300 text-[11px]">
              3. Researcher-provided
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Substituted by the user/researcher via slider override, CSV upload, or Assumption Challenge.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30">
            <div className="font-semibold text-amber-300 text-[11px]">
              4. Synthetic demonstration assumption
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Representative point value chosen inside a published literature range for computational demonstration.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30">
            <div className="font-semibold text-rose-300 text-[11px]">
              5. Unverified or unknown
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Missing empirical measurement or extrapolated outside calibrated biological/hydrodynamic bounds.
            </p>
          </div>
        </div>
      </div>

      {/* Clickable Parameter Selector Grid (Priority 4 Highlighted) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-semibold">
            Select Parameter to Inspect Provenance, Unit Conversion & Downstream Causal Chain
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Priority Audit Parameters: q_p, q_O2, k_La, τ_crit
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {provenanceLedger.map((rec) => {
            const isSelected = rec.parameterId === activeRecord.parameterId;
            const isModified = Math.abs(rec.currentValue - rec.defaultValue) > 1e-4;
            return (
              <button
                key={rec.parameterId}
                type="button"
                onClick={() => handleSelectRecord(rec)}
                className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-lg shadow-cyan-950/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-bold text-white">
                      {rec.symbol}
                    </span>
                    {rec.isPriorityFourAudit && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        Priority Audit
                      </span>
                    )}
                  </div>
                  {isModified && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/40">
                      Challenged
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-300 font-medium mt-1 truncate">
                  {rec.name}
                </div>

                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-base font-mono font-bold text-cyan-300">
                    {rec.currentValue} <span className="text-[11px] font-normal text-slate-400">{rec.unit}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Default: {rec.defaultValue}
                  </span>
                </div>

                <div className="mt-2.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${
                      CLASSIFICATION_BADGE_STYLES[rec.classification]
                    }`}
                  >
                    {rec.classification}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Provenance & Causal Inspector for Selected Parameter */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-950/90 border border-slate-800 rounded-xl p-5">
        {/* Left 7 columns: Primary Source Evidence & Honest Audit */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <h4 className="text-base font-bold text-white">
                  {activeRecord.symbol} — {activeRecord.name}
                </h4>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Active Value: <strong className="text-cyan-300">{activeRecord.currentValue} {activeRecord.unit}</strong> | Default Demo Value: {activeRecord.defaultValue} {activeRecord.unit} | Valid Calibration Window: [{activeRecord.validCalibrationRange[0]}–{activeRecord.validCalibrationRange[1]} {activeRecord.unit}]
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-md text-xs font-mono border ${
                CLASSIFICATION_BADGE_STYLES[activeRecord.classification]
              }`}
            >
              {activeRecord.classification}
            </span>
          </div>

          {/* Honest Audit Verdict Box */}
          <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/30">
            <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Source Verification vs. Point-Value Audit
            </div>
            <p className="text-xs text-slate-200 mt-1.5 leading-relaxed">
              {activeRecord.exactSourceEvidenceAndAudit}
            </p>
          </div>

          {/* Bibliographic Metadata Table */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-400">
                Primary Publication & Authors
              </div>
              <div className="font-semibold text-white mt-1">
                {activeRecord.publicationTitle}
              </div>
              <div className="text-slate-300 mt-0.5">{activeRecord.authorsAndYear}</div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[11px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {activeRecord.databaseId}
                </span>
                <a
                  href={activeRecord.doiOrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline"
                >
                  Open DOI / Source <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-400">
                Supporting Section, Table / Figure & Original Value
              </div>
              <div className="text-slate-200 font-medium mt-1">
                {activeRecord.supportingSectionOrTable}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Original Reported Value &amp; Units in Source:
                </span>
                <span className="font-mono text-emerald-300 font-semibold">
                  {activeRecord.originalReportedValueAndUnits}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-400">
                Biological System & Experimental Conditions
              </div>
              <div className="text-slate-200 mt-1">
                <strong>Host / System:</strong> {activeRecord.biologicalSystemContext}
              </div>
              <div className="text-slate-300 mt-1">
                <strong>Conditions:</strong> {activeRecord.experimentalConditions}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-400">
                Unit Transformation Formula & Uncertainty
              </div>
              <div className="font-mono text-[11px] text-cyan-200 bg-slate-950 p-2 rounded border border-slate-800 mt-1">
                {activeRecord.unitTransformationFormula}
              </div>
              <div className="text-slate-400 text-[11px] mt-1.5">
                <strong>Uncertainty:</strong> {activeRecord.uncertaintyAndRange}
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 columns: Downstream Causal Influence Chain & Interactive Assumption Challenge */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          {/* 4-Step Downstream Causal Propagation Chain */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Downstream Causal Propagation Chain
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Live Equation Coupling
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                <div className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">
                  Step 1 → Mass Balance &amp; Stoichiometry
                </div>
                <p className="text-slate-200 mt-0.5 leading-snug">
                  {activeRecord.downstreamCausalChain.step1MassBalance}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                <div className="text-[10px] font-mono text-emerald-400 uppercase font-semibold">
                  Step 2 → Reactor &amp; Scale-Up Feasibility Constraints
                </div>
                <p className="text-slate-200 mt-0.5 leading-snug">
                  {activeRecord.downstreamCausalChain.step2FeasibilityConstraint}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                <div className="text-[10px] font-mono text-violet-400 uppercase font-semibold">
                  Step 3 → Constrained Bayesian Optimisation (GP + P_feas)
                </div>
                <p className="text-slate-200 mt-0.5 leading-snug">
                  {activeRecord.downstreamCausalChain.step3OptimisationImpact}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                <div className="text-[10px] font-mono text-amber-400 uppercase font-semibold">
                  Step 4 → Downstream Purification &amp; Usable COGS ($/g)
                </div>
                <p className="text-slate-200 mt-0.5 leading-snug">
                  {activeRecord.downstreamCausalChain.step4CogsEconomicImpact}
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Challenge Form for Selected Parameter */}
          <form
            onSubmit={handleRunChallenge}
            className="p-4 rounded-xl bg-violet-950/20 border border-violet-500/40 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-violet-300 font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Challenge {activeRecord.symbol} Assumption &amp; Rerun Pipeline
              </span>
              <span className="text-[10px] font-mono text-violet-300">
                Reclassifies as Researcher-provided
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  Substituted Value ({activeRecord.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  value={challengeInputVal}
                  onChange={(e) => setChallengeInputVal(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sm font-mono text-white focus:border-violet-400 focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  Apply Challenge &amp; Compare Before/After
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-300 mb-1">
                Documented Justification / Experimental Source Note
              </label>
              <input
                type="text"
                value={challengeJustification}
                onChange={(e) => setChallengeJustification(e.target.value)}
                placeholder="e.g., Ambr250 Run #4 off-gas analyser measurement or literature lower-bound test"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:border-violet-400 focus:outline-none"
              />
            </div>
          </form>
        </div>
      </div>

      {/* One-Click Scientific Challenge Presets */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold mb-2.5 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-violet-400" />
          One-Click Literature &amp; Wet-Lab Challenge Scenarios (Instant Before/After Audit)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_CHALLENGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onSelectParamId(preset.parameterId);
                setChallengeInputVal(preset.newValue.toString());
                setChallengeJustification(preset.justification);
                onApplyChallenge(
                  preset.parameterId,
                  preset.newValue,
                  preset.justification
                );
              }}
              className="text-left p-3 rounded-xl bg-slate-900/90 hover:bg-violet-950/30 border border-slate-800 hover:border-violet-500/40 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="text-xs font-bold text-violet-300 flex items-center justify-between gap-1">
                  <span>{preset.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  {preset.summary}
                </p>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
                Click to substitute &amp; recompute pipeline
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Before / After Assumption-Challenge Impact Comparison Table */}
      {latestSnapshot && (
        <div className="bg-violet-950/20 border border-violet-500/40 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-violet-500/20 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-violet-300" />
                <h4 className="text-sm font-bold text-white">
                  Before vs. After Pipeline Recalculation — Challenged Parameter: {latestSnapshot.symbol} ({latestSnapshot.beforeValue} → {latestSnapshot.afterValue} {latestSnapshot.unit})
                </h4>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                <strong>Researcher Justification:</strong> {latestSnapshot.researcherJustification}
              </p>
            </div>
            <span className="text-[11px] font-mono text-violet-300 bg-violet-950/70 px-2.5 py-1 rounded border border-violet-500/30 shrink-0">
              Recorded {latestSnapshot.timestampUtc}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                  <th className="py-2 pr-3">Downstream Stage &amp; Metric</th>
                  <th className="py-2 px-3">Before Challenge ({latestSnapshot.beforeValue} {latestSnapshot.unit})</th>
                  <th className="py-2 px-3">After Challenge ({latestSnapshot.afterValue} {latestSnapshot.unit})</th>
                  <th className="py-2 pl-3">Net Delta / Feasibility Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 5 Cellular Oxygen Uptake (OUR)
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {latestSnapshot.beforeMetrics.ourMmolPerLHour.toFixed(2)} mmol O₂/L/h
                  </td>
                  <td className="py-2 px-3 text-white font-semibold">
                    {latestSnapshot.afterMetrics.ourMmolPerLHour.toFixed(2)} mmol O₂/L/h
                  </td>
                  <td className="py-2 pl-3 text-cyan-300">
                    {(
                      latestSnapshot.afterMetrics.ourMmolPerLHour -
                      latestSnapshot.beforeMetrics.ourMmolPerLHour
                    ).toFixed(2)}{' '}
                    mmol O₂/L/h
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 5 Oxygen Transfer Capacity (OTR &amp; k_La)
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {latestSnapshot.beforeMetrics.otrMmolPerLHour.toFixed(2)} mmol/L/h (k_La ={' '}
                    {latestSnapshot.beforeMetrics.klaPerHour.toFixed(1)} h⁻¹)
                  </td>
                  <td className="py-2 px-3 text-white font-semibold">
                    {latestSnapshot.afterMetrics.otrMmolPerLHour.toFixed(2)} mmol/L/h (k_La ={' '}
                    {latestSnapshot.afterMetrics.klaPerHour.toFixed(1)} h⁻¹)
                  </td>
                  <td className="py-2 pl-3 text-cyan-300">
                    Margin: {latestSnapshot.beforeMetrics.oxygenMarginMmolPerLHour.toFixed(2)} →{' '}
                    {latestSnapshot.afterMetrics.oxygenMarginMmolPerLHour.toFixed(2)} mmol/L/h
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 5 Hydrodynamic Shear vs. Threshold
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    τ = {latestSnapshot.beforeMetrics.shearStressPa.toFixed(2)} Pa (Limit:{' '}
                    {latestSnapshot.beforeMetrics.shearLimitPa.toFixed(2)} Pa)
                  </td>
                  <td className="py-2 px-3 text-white font-semibold">
                    τ = {latestSnapshot.afterMetrics.shearStressPa.toFixed(2)} Pa (Limit:{' '}
                    {latestSnapshot.afterMetrics.shearLimitPa.toFixed(2)} Pa)
                  </td>
                  <td className="py-2 pl-3 text-cyan-300">
                    Limit Δ:{' '}
                    {(
                      latestSnapshot.afterMetrics.shearLimitPa -
                      latestSnapshot.beforeMetrics.shearLimitPa
                    ).toFixed(2)}{' '}
                    Pa
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 5 500 L Scale-Up Feasibility Verdict
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        latestSnapshot.beforeMetrics.isScaleUpFeasible
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {latestSnapshot.beforeMetrics.isScaleUpFeasible
                        ? 'FEASIBLE'
                        : 'CONSTRAINT VIOLATION'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        latestSnapshot.afterMetrics.isScaleUpFeasible
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {latestSnapshot.afterMetrics.isScaleUpFeasible
                        ? 'FEASIBLE'
                        : 'CONSTRAINT VIOLATION'}
                    </span>
                  </td>
                  <td className="py-2 pl-3 text-amber-300">
                    {latestSnapshot.beforeMetrics.isScaleUpFeasible ===
                    latestSnapshot.afterMetrics.isScaleUpFeasible
                      ? 'Unchanged'
                      : 'FEASIBILITY STATE FLIPPED'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 6 Constrained BO Best Feasible Output
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {latestSnapshot.beforeMetrics.bestBoScoreUnits.toFixed(1)} score units (
                    {latestSnapshot.beforeMetrics.bestPhysicalMgLDay} mg/L/d)
                  </td>
                  <td className="py-2 px-3 text-white font-semibold">
                    {latestSnapshot.afterMetrics.bestBoScoreUnits.toFixed(1)} score units (
                    {latestSnapshot.afterMetrics.bestPhysicalMgLDay} mg/L/d)
                  </td>
                  <td className="py-2 pl-3 text-cyan-300">
                    {(
                      latestSnapshot.afterMetrics.bestPhysicalMgLDay -
                      latestSnapshot.beforeMetrics.bestPhysicalMgLDay
                    ) >= 0
                      ? '+'
                      : ''}
                    {latestSnapshot.afterMetrics.bestPhysicalMgLDay -
                      latestSnapshot.beforeMetrics.bestPhysicalMgLDay}{' '}
                    mg/L/d ({latestSnapshot.afterMetrics.infeasibleTrialsCount} infeasible trials)
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 6 Recommended Setpoints (VVD, DO)
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {latestSnapshot.beforeMetrics.recommendedVvd.toFixed(2)} VVD @{' '}
                    {latestSnapshot.beforeMetrics.recommendedDoPercent}% DO
                  </td>
                  <td className="py-2 px-3 text-white font-semibold">
                    {latestSnapshot.afterMetrics.recommendedVvd.toFixed(2)} VVD @{' '}
                    {latestSnapshot.afterMetrics.recommendedDoPercent}% DO
                  </td>
                  <td className="py-2 pl-3 text-cyan-300">
                    ΔVVD:{' '}
                    {(
                      latestSnapshot.afterMetrics.recommendedVvd -
                      latestSnapshot.beforeMetrics.recommendedVvd
                    ).toFixed(2)}{' '}
                    | ΔDO:{' '}
                    {latestSnapshot.afterMetrics.recommendedDoPercent -
                      latestSnapshot.beforeMetrics.recommendedDoPercent}
                    %
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-sans text-slate-200 font-medium">
                    Stage 7 Estimated Usable Drug Substance COGS
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {formatCogsHeadline(latestSnapshot.beforeMetrics.cogsPerGramUsd)} ($
                    {latestSnapshot.beforeMetrics.cogsPerGramUsd.toFixed(2)}/g)
                  </td>
                  <td className="py-2 px-3 text-emerald-300 font-semibold">
                    {formatCogsHeadline(latestSnapshot.afterMetrics.cogsPerGramUsd)} ($
                    {latestSnapshot.afterMetrics.cogsPerGramUsd.toFixed(2)}/g)
                  </td>
                  <td className="py-2 pl-3 text-amber-300">
                    {(
                      latestSnapshot.afterMetrics.cogsPerGramUsd -
                      latestSnapshot.beforeMetrics.cogsPerGramUsd
                    ) >= 0
                      ? '+'
                      : ''}
                    $
                    {(
                      latestSnapshot.afterMetrics.cogsPerGramUsd -
                      latestSnapshot.beforeMetrics.cogsPerGramUsd
                    ).toFixed(2)}
                    /g
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Automated Scientific Consistency & Extrapolation Checks */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white">
              Automated Scientific Consistency, Dimensional &amp; Extrapolation Audit
            </h4>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Re-evaluated automatically on every parameter edit
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {consistencyChecks.map((chk) => {
            const isPass = chk.status === 'Verified Pass';
            const isWarn = chk.status === 'Warning / Extrapolated';
            return (
              <div
                key={chk.id}
                className={`p-3.5 rounded-xl border text-xs ${
                  isPass
                    ? 'bg-emerald-950/15 border-emerald-500/30'
                    : isWarn
                    ? 'bg-amber-950/20 border-amber-500/30'
                    : 'bg-rose-950/25 border-rose-500/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {chk.category}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 ${
                      isPass
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                        : isWarn
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {isPass ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : isWarn ? (
                      <ShieldAlert className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {chk.status}
                  </span>
                </div>
                <div className="font-bold text-white mt-1">{chk.title}</div>
                <div className="font-mono text-[11px] text-cyan-200/90 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 mt-1.5">
                  {chk.equationOrRule}
                </div>
                <p className="text-slate-300 mt-1.5 leading-snug">{chk.currentDiagnostic}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  <strong>Action:</strong> {chk.remediationAction}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
