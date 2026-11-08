import React, { useState } from 'react';
import {
  AuditableParameterId,
  AuditedParameterProvenanceRecord,
  BiologicCandidate,
  CandidatePathwayMode,
  DatabaseStreamName,
  DatabaseStreamRecord,
  ExpressionHostOption,
  GroundedSimulatorParams,
  NovelProteinDissertationProfile,
  NovelProteinEvaluationResult,
  ParameterChallengeSnapshot,
  PrismaScreeningSummary,
  ScientificConsistencyCheckItem,
  StreamStatusTelemetry,
} from '../types/bioreact';
import {
  RefreshCw,
  ExternalLink,
  Sliders,
  Check,
  Search,
  AlertTriangle,
  FlaskConical,
  ShieldAlert,
  BookOpenCheck,
} from 'lucide-react';
import { ParameterProvenanceAndChallengePanel } from './ParameterProvenanceAndChallengePanel';

interface DatabaseStreamsPanelProps {
  candidate: BiologicCandidate;
  records: DatabaseStreamRecord[];
  telemetry: StreamStatusTelemetry[];
  prisma: PrismaScreeningSummary;
  isLoadingStreams: boolean;
  offlineFixtureMode: boolean;
  groundedParams: GroundedSimulatorParams;
  onToggleOfflineFixture: (val: boolean) => void;
  onRefreshStreams: (customQuery?: string) => void;
  onUpdateGroundedParams: (next: GroundedSimulatorParams) => void;
  onResetGroundedParams: () => void;
  candidatePathwayMode: CandidatePathwayMode;
  onChangePathwayMode: (mode: CandidatePathwayMode) => void;
  novelProfile: NovelProteinDissertationProfile;
  novelPresets: Record<string, NovelProteinDissertationProfile>;
  onUpdateNovelProfile: (profile: NovelProteinDissertationProfile) => void;
  novelEvaluation: NovelProteinEvaluationResult;
  provenanceLedger: AuditedParameterProvenanceRecord[];
  consistencyChecks: ScientificConsistencyCheckItem[];
  challengeHistory: ParameterChallengeSnapshot[];
  onApplyParameterChallenge: (
    parameterId: AuditableParameterId,
    newValue: number,
    researcherJustification: string
  ) => void;
  onResetAllChallenges: () => void;
}

export const DatabaseStreamsPanel: React.FC<DatabaseStreamsPanelProps> = ({
  candidate,
  records,
  telemetry,
  prisma,
  isLoadingStreams,
  offlineFixtureMode,
  groundedParams,
  onToggleOfflineFixture,
  onRefreshStreams,
  onUpdateGroundedParams,
  onResetGroundedParams,
  candidatePathwayMode,
  onChangePathwayMode,
  novelProfile,
  novelPresets,
  onUpdateNovelProfile,
  novelEvaluation,
  provenanceLedger,
  consistencyChecks,
  challengeHistory,
  onApplyParameterChallenge,
  onResetAllChallenges,
}) => {
  const [selectedSource, setSelectedSource] = useState<'ALL' | DatabaseStreamName>('ALL');
  const [customSearchInput, setCustomSearchInput] = useState<string>(candidate.genericName);
  const [showDedupeAudit, setShowDedupeAudit] = useState<boolean>(false);
  const [selectedProvenanceParamId, setSelectedProvenanceParamId] =
    useState<AuditableParameterId>('q_o2');

  const filteredRecords =
    selectedSource === 'ALL'
      ? records
      : records.filter(
          (r) => r.source === selectedSource || r.mergedSources?.includes(selectedSource)
        );

  const sources: Array<'ALL' | DatabaseStreamName> = [
    'ALL',
    'Europe PMC',
    'OpenAlex',
    'PubMed',
    'Crossref',
    'Semantic Scholar',
    'UniProt',
    'ChEMBL',
    'ClinicalTrials.gov',
  ];

  const handleParamChange = (key: keyof GroundedSimulatorParams, val: number) => {
    onUpdateGroundedParams({
      ...groundedParams,
      [key]: val,
    });
  };

  return (
    <div className="space-y-8">
      {/* DUAL CANDIDATE PATHWAY SWITCHER: Established Benchmark vs Novel Dissertation Protein */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-teal-700 uppercase tracking-wider">
              CANDIDATE INPUT PATHWAY SELECTION • BENCHMARK VALIDATION VS. EARLY-STAGE DISCOVERY
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
              Select Biologic Input Mode: Literature-Grounded Benchmark or Novel Dissertation Protein
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Demonstrate bioREACT on an established reference biologic (<span className="font-mono">Trastuzumab</span>) where public literature validates our models, or switch to the{' '}
              <strong>Research-Stage Novel Protein — Dissertation Case Study</strong> pathway where public bioprocess kinetics do not yet exist.
            </p>
          </div>

          <div className="inline-flex p-1 bg-slate-100 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => onChangePathwayMode('established_biologic')}
              className={`px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                candidatePathwayMode === 'established_biologic'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              1. Established Benchmark ({candidate.genericName})
            </button>
            <button
              type="button"
              onClick={() => onChangePathwayMode('novel_dissertation_protein')}
              className={`px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                candidatePathwayMode === 'novel_dissertation_protein'
                  ? 'bg-teal-900 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              2. Novel Protein — Dissertation Case Study
            </button>
          </div>
        </div>

        {/* NOVEL DISSERTATION PROTEIN WORKBENCH PANEL */}
        {candidatePathwayMode === 'novel_dissertation_protein' && (
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-xs font-mono text-teal-800 uppercase">
                  RESEARCH-STAGE NOVEL PROTEIN • NON-DEFAULT HOST ROUTING &amp; EPISTEMIC ABSTENTION
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                  {novelProfile.proteinName} — {novelProfile.researcherNameAndLab}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-slate-500">Load Dissertation Preset:</span>
                {Object.entries(novelPresets).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onUpdateNovelProfile(preset)}
                    className={`px-3 py-1.5 text-xs font-mono border transition-colors cursor-pointer ${
                      novelProfile.proteinName === preset.proteinName
                        ? 'bg-teal-50 border-teal-700 text-teal-950 font-semibold'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {key === 'dissertation_scfv'
                      ? 'Case A: scFv-HER3 (Pichia Host)'
                      : 'Case B: Sialo-Fc-Neurotrophin (CHO Host)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Out-of-Distribution / Abstention Banner */}
            <div
              className={`p-4 border flex items-start gap-3 ${
                novelEvaluation.abstainsFromOptimisationClaim
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              }`}
            >
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
              <div className="space-y-1 text-xs">
                <div className="font-mono font-semibold uppercase">
                  {novelEvaluation.abstainsFromOptimisationClaim
                    ? 'EPISTEMIC SAFETY GUARDRAIL: ABSTAINS FROM CLAIMING A VALIDATED CHO OPTIMUM'
                    : 'EXPLORATORY CLONAL POOL PARAMETERS SUPPLIED — WET-LAB VERIFICATION REQUIRED'}
                </div>
                <ul className="space-y-1 leading-relaxed">
                  {novelEvaluation.outOfDistributionWarnings.map((w, idx) => (
                    <li key={idx}>• {w}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Structured Researcher Input Form + Host Routing Output */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Researcher Biophysical & Kinetic Inputs */}
              <div className="lg:col-span-7 p-5 bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="text-xs font-mono font-semibold text-slate-900 uppercase">
                    RESEARCHER-SUPPLIED BIOPHYSICAL &amp; EARLY WET-LAB INPUTS
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Editable Dissertation Construct Properties
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 font-mono text-[11px] mb-1">
                      Novel Construct Name
                    </label>
                    <input
                      type="text"
                      value={novelProfile.proteinName}
                      onChange={(e) =>
                        onUpdateNovelProfile({
                          ...novelProfile,
                          proteinName: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-mono text-[11px] mb-1">
                      Molecular Weight (kDa)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={novelProfile.molecularWeightKda}
                      onChange={(e) =>
                        onUpdateNovelProfile({
                          ...novelProfile,
                          molecularWeightKda: Number(e.target.value),
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 font-mono tabular-nums"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 font-mono text-[11px] mb-1">
                      PTM &amp; Glycosylation Requirement
                    </label>
                    <select
                      value={novelProfile.ptmAndGlycosylationRequirement}
                      onChange={(e) =>
                        onUpdateNovelProfile({
                          ...novelProfile,
                          ptmAndGlycosylationRequirement: e.target
                            .value as NovelProteinDissertationProfile['ptmAndGlycosylationRequirement'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 font-mono text-xs"
                    >
                      <option value="Simple Disulfide Bonds / Non-Glycosylated">
                        Simple Disulfide Bonds / Non-Glycosylated
                      </option>
                      <option value="Complex Human-like N-Glycosylation Required">
                        Complex Human-like N-Glycosylation Required
                      </option>
                      <option value="High-Mannose Acceptable">High-Mannose Acceptable</option>
                      <option value="Unknown PTM Profile">Unknown PTM Profile</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-mono text-[11px] mb-1">
                      Proposed Expression Host
                    </label>
                    <select
                      value={novelProfile.proposedExpressionHost}
                      onChange={(e) =>
                        onUpdateNovelProfile({
                          ...novelProfile,
                          proposedExpressionHost: e.target.value as ExpressionHostOption,
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 font-mono text-xs"
                    >
                      <option value="Pichia pastoris Yeast">Pichia pastoris Yeast</option>
                      <option value="CHO Mammalian">CHO Mammalian</option>
                      <option value="E. coli Microbial">E. coli Microbial</option>
                      <option value="Insect Sf9 / Baculovirus">Insect Sf9 / Baculovirus</option>
                      <option value="Unknown / Uncharacterised">Unknown / Uncharacterised</option>
                    </select>
                  </div>
                </div>

                {/* Optional Empirical Wet-Lab Kinetics (Can be Null / Unmeasured) */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-medium text-slate-800">
                      Empirical Bioprocess Kinetics (Unmeasured = NULL triggers Abstention)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNovelProfile({
                          ...novelProfile,
                          researcherSuppliedQp:
                            novelProfile.researcherSuppliedQp === null ? 11.5 : null,
                          researcherSuppliedQO2:
                            novelProfile.researcherSuppliedQO2 === null ? 0.33 : null,
                          researcherSuppliedMuMax:
                            novelProfile.researcherSuppliedMuMax === null ? 0.029 : null,
                        })
                      }
                      className="text-[11px] font-mono text-teal-800 underline cursor-pointer"
                    >
                      {novelProfile.researcherSuppliedQp === null
                        ? 'Simulate Entering Scout Run Data'
                        : 'Reset to Unmeasured (NULL)'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 bg-white border border-slate-200">
                      <span className="block text-[11px] font-mono text-slate-500">
                        Measured q_p (pg/cell/d)
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {novelProfile.researcherSuppliedQp !== null
                          ? `${novelProfile.researcherSuppliedQp} pg/cell/d`
                          : 'UNMEASURED (NULL)'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-200">
                      <span className="block text-[11px] font-mono text-slate-500">
                        Measured q_O2 (pmol/cell/h)
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {novelProfile.researcherSuppliedQO2 !== null
                          ? `${novelProfile.researcherSuppliedQO2} pmol/cell/h`
                          : 'UNMEASURED (NULL)'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-200">
                      <span className="block text-[11px] font-mono text-slate-500">
                        Measured μ_max (h⁻¹)
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {novelProfile.researcherSuppliedMuMax !== null
                          ? `${novelProfile.researcherSuppliedMuMax} h⁻¹`
                          : 'UNMEASURED (NULL)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Non-Default Host Routing & Required Next Wet-Lab Assays */}
              <div className="lg:col-span-5 p-5 bg-slate-50 border border-slate-200 space-y-4">
                <div>
                  <div className="text-xs font-mono text-teal-800 uppercase">
                    BIOLOGICAL EXPRESSION SYSTEM &amp; REACTOR ROUTING
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-1">
                    {novelEvaluation.recommendedExpressionRoute}
                  </div>
                  <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                    {novelProfile.experimentalNotes}
                  </p>
                  <div className="mt-2.5 p-2.5 bg-white border border-slate-200 text-xs font-mono text-slate-800">
                    Primary Reactor Track: {novelEvaluation.recommendedReactorArchitecture}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-900 uppercase">
                    <FlaskConical className="w-3.5 h-3.5 text-teal-700" />
                    <span>Recommended Next Wet-Lab Measurements to Unlock BO</span>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {novelEvaluation.requiredNextWetLabMeasurements.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-mono text-teal-700">{idx + 1}.</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Epistemic Provenance Separation Table */}
            <div className="border border-slate-200 overflow-hidden">
              <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-slate-900">
                  EPISTEMIC PROVENANCE LEDGER: LITERATURE VS. RESEARCHER-SUPPLIED VS. ASSUMPTION VS. MISSING
                </span>
                <span className="text-[11px] font-mono text-slate-600">
                  Zero-Hallucination Audit Trail
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-500">
                      <th className="py-2 px-4">Bioprocess / Construct Parameter</th>
                      <th className="py-2 px-4">Current Value</th>
                      <th className="py-2 px-4">Epistemic Provenance Tag</th>
                      <th className="py-2 px-4">Verification Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {novelEvaluation.parameterProvenanceTable.map((row) => (
                      <tr key={row.parameter}>
                        <td className="py-2.5 px-4 font-medium text-slate-900">{row.parameter}</td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">
                          {row.valueDisplay}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold">
                          <span
                            className={
                              row.epistemicTag === 'Researcher-Supplied Value'
                                ? 'text-teal-800'
                                : row.epistemicTag === 'Missing — Requires Wet-Lab Measurement'
                                ? 'text-rose-700'
                                : row.epistemicTag === 'Engineering Assumption'
                                ? 'text-amber-800'
                                : 'text-blue-800'
                            }
                          >
                            {row.epistemicTag}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Offline Fixture Banner if active */}
      {offlineFixtureMode && (
        <div className="bg-amber-50 border border-amber-300 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-amber-900">
          <span>
            ▲ OFFLINE VERIFIED FIXTURE ACTIVE: Displaying deterministic PRISMA scoping dataset (14 identified → 3 duplicates collapsed → 8 included) without live outbound HTTP requests.
          </span>
          <button
            type="button"
            onClick={() => onToggleOfflineFixture(false)}
            className="underline font-semibold text-amber-950 cursor-pointer whitespace-nowrap"
          >
            Switch to Live 8-API Retrieval
          </button>
        </div>
      )}

      {/* Top Section Header & 8-Database Query Controls */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-slate-500 mb-1">
              01. 8-DATABASE SCOPING SCREENING, TWO-KEY DEDUPLICATION &amp; PROVENANCE AUDIT
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              Multi-Stream Scientific Screening ({candidate.genericName} / {candidate.brandName})
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Queries 8 open-access scientific streams in parallel (Europe PMC, OpenAlex, PubMed, Crossref, Semantic Scholar, UniProtKB, ChEMBL, ClinicalTrials.gov), deduplicates via a Two-Key (DOI + Normalized Title) index, audits accession provenance (separating <span className="font-mono">DrugBank:DB00072</span> mAb from <span className="font-mono">UniProt:P04626</span> HER2 target), and maps CHO sensitivity ranges (<span className="font-mono">q_p</span>, <span className="font-mono">q_O2</span>, <span className="font-mono">μ_max</span>, <span className="font-mono">τ_crit</span>). Note: An HTTP 200 API response indicates successful metadata retrieval—not automatic numerical parameter grounding.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs font-mono text-slate-700 bg-slate-100 px-3 py-2 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={offlineFixtureMode}
                onChange={(e) => onToggleOfflineFixture(e.target.checked)}
                className="accent-blue-600 cursor-pointer"
              />
              <span>Offline Fixture</span>
            </label>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRefreshStreams(customSearchInput);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={customSearchInput}
                  onChange={(e) => setCustomSearchInput(e.target.value)}
                  placeholder="Biologic or target query..."
                  aria-label="Search query across 8 scientific databases"
                  className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 w-48 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isLoadingStreams}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStreams ? 'animate-spin' : ''}`} />
                <span>{isLoadingStreams ? 'Screening 8 Streams...' : 'Screen All 8 Databases'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* PRISMA Scoping Review Funnel Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-4 border-b border-slate-200 font-mono text-xs tabular-nums">
          <div className="p-3 bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">1. IDENTIFIED (8 STREAMS)</span>
            <span className="text-lg font-bold text-slate-900">{prisma.totalIdentifiedRaw}</span>
            <span className="text-[11px] text-slate-500 block">Raw API records</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">2. DUPLICATES REMOVED</span>
            <span className="text-lg font-bold text-blue-700">−{prisma.duplicatesRemovedTwoKey}</span>
            <span className="text-[11px] text-slate-500 block">Two-Key (DOI + Title)</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">3. RECORDS SCREENED</span>
            <span className="text-lg font-bold text-slate-900">{prisma.recordsScreened}</span>
            <span className="text-[11px] text-slate-500 block">Rule-based classifier</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">4. OUT-OF-SCOPE EXCLUDED</span>
            <span className="text-lg font-bold text-rose-700">−{prisma.recordsExcluded}</span>
            <span className="text-[11px] text-slate-500 block">Incl. NCT05002127 oncology</span>
          </div>
          <div className="p-3 bg-emerald-50/50 border border-emerald-200">
            <span className="text-emerald-800 block text-[10px]">5. INCLUDED IN LEDGER</span>
            <span className="text-lg font-bold text-emerald-700">{prisma.recordsIncluded}</span>
            <span className="text-[11px] text-emerald-800 block">Licence-stamped &amp; audited</span>
          </div>
        </div>

        {/* Toggleable Two-Key Deduplication & Exclusion Log */}
        <div className="pt-3 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-mono">
            Provenance Audit: Clinical trial NCT05002127 automatically excluded (oncology combination dosing without CMC bioreactor parameters); UniProt P04626 explicitly flagged as HER2 target antigen.
          </span>
          <button
            type="button"
            onClick={() => setShowDedupeAudit(!showDedupeAudit)}
            className="font-mono text-blue-700 hover:underline font-medium cursor-pointer whitespace-nowrap"
          >
            {showDedupeAudit
              ? 'Hide PRISMA Deduplication & Exclusion Log ▲'
              : 'Inspect Two-Key Dedupe & Exclusion Log ▼'}
          </button>
        </div>

        {showDedupeAudit && (
          <div className="mt-3 p-4 bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div>
              <div className="font-mono font-semibold text-slate-900 mb-2">
                TWO-KEY (DOI + NORMALIZED TITLE) DEDUPLICATION MERGES:
              </div>
              <div className="space-y-2.5">
                {prisma.dedupeExamples.map((ex) => (
                  <div key={ex.doi} className="p-2.5 bg-white border border-slate-200">
                    <div className="font-semibold text-slate-900">{ex.canonicalTitle}</div>
                    <div className="font-mono text-[11px] text-blue-700 mt-0.5">
                      Merged: {ex.sourcesMerged.join(' + ')} · DOI: {ex.doi}
                    </div>
                    <p className="text-slate-600 mt-1">{ex.note}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono font-semibold text-rose-800 mb-2">
                PRISMA EXCLUDED RECORDS (WITH RECORDED REASONS):
              </div>
              <div className="space-y-2">
                {prisma.exclusionLog.map((ex) => (
                  <div key={ex.title} className="p-2.5 bg-white border border-slate-200">
                    <div className="font-semibold text-slate-800">{ex.title}</div>
                    <div className="font-mono text-[11px] text-rose-700 mt-0.5">
                      Source: {ex.source} · {ex.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 8-Stream Live Connection Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-5">
          {telemetry.map((stream) => (
            <div
              key={stream.source}
              className="bg-slate-50 border border-slate-200 p-3.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">{stream.source}</span>
                  <span
                    className={`text-[11px] font-mono ${
                      stream.status === 'online'
                        ? 'text-emerald-700'
                        : stream.status === 'fallback_active'
                        ? 'text-blue-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {stream.status === 'online'
                      ? '● OK (Live 200)'
                      : stream.status === 'fallback_active'
                      ? '● OK (Fixture)'
                      : '▲ Querying'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate" title={stream.endpointUrl}>
                  {stream.endpointUrl}
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-baseline justify-between text-[11px] font-mono text-slate-600 tabular-nums">
                <span>{stream.latencyMs} ms</span>
                <span>{stream.license}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Split Grid: Left = Retrieved Database Records | Right = Literature-to-Simulator Parameter Grounding */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Normalised Multi-Stream Evidence Records */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-6">
          <div className="flex flex-col gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Multi-Database Screened Evidence Ledger ({filteredRecords.length} Records)
              </h3>
              <span className="text-xs font-mono text-slate-500">
                Two-Key Deduplicated &amp; Provenance Audited
              </span>
            </div>

            {/* Interactive Filter Tabs (Segmented Button Control) */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
              {sources.map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSelectedSource(src)}
                  className={`px-2 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedSource === src
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {src === 'ALL' ? 'All 8 Streams' : src}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-200 mt-2">
            {filteredRecords.map((rec) => (
              <article key={rec.id} className="py-5 first:pt-4 last:pb-1">
                {/* Clean unboxed metadata line with typographic separators */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500">
                  <span className="font-semibold text-blue-700">
                    {rec.mergedSources ? rec.mergedSources.join(' + ') : rec.source}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-800">{rec.accessionId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-800 font-medium">{rec.classification}</span>
                  <span aria-hidden="true">·</span>
                  <span>Licence: {rec.license}</span>
                </div>

                <h4 className="text-base font-semibold text-slate-900 mt-1.5 leading-snug">
                  <a
                    href={rec.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 transition-colors inline-flex items-baseline gap-1.5"
                  >
                    <span>{rec.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 translate-y-0.5 text-slate-400" />
                  </a>
                </h4>

                <div className="text-xs text-slate-500 mt-1">
                  {rec.authorsOrSponsor} · Published {rec.publicationDate}
                </div>

                {rec.exclusionOrMergeReason && (
                  <div className="mt-1.5 text-xs font-mono text-blue-800">
                    ● {rec.exclusionOrMergeReason}
                  </div>
                )}

                {rec.provenanceAuditNote && (
                  <div className="mt-1.5 p-2 bg-amber-50/70 border border-amber-200/80 text-[11px] font-mono text-amber-950 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <span>{rec.provenanceAuditNote}</span>
                  </div>
                )}

                <p className="text-sm text-slate-700 mt-2 leading-relaxed">{rec.summary}</p>

                {rec.extractedParameters.length > 0 && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                    <div className="text-xs font-mono font-medium text-slate-700 flex items-center gap-1.5">
                      <BookOpenCheck className="w-3.5 h-3.5 text-blue-700" />
                      <span>EXTRACTED CHO BIOPROCESS PARAMETERS &amp; SOURCE PASSAGES:</span>
                    </div>
                    {rec.extractedParameters.map((ep) => (
                      <div
                        key={ep.parameterKey}
                        className="pt-2 border-t border-slate-200/80 text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-slate-900">{ep.label}:</span>{' '}
                            <span className="font-mono font-semibold text-blue-700 tabular-nums">
                              {ep.value} {ep.unit}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-teal-800">
                            Origin: {ep.dataOrigin}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 bg-white px-2.5 py-1.5 border border-slate-200/80">
                          Verbatim Source Passage: {ep.sourcePassageQuote}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        {/* Right 5 Columns: Stage 1 Candidate Profile & Literature-to-Simulator Grounding */}
        <div className="lg:col-span-5 space-y-6">
          {/* Candidate Profile Brief */}
          <div className="bg-white border border-slate-200 p-6">
            <div className="text-xs font-mono text-slate-500 mb-1">
              STAGE 1 OUTPUT · CANDIDATE MANUFACTURING BRIEF (PROVENANCE AUDITED)
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              {candidate.genericName} ({candidate.brandName}) — {candidate.expressionSystem} Profile
            </h3>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-slate-200 text-xs">
              <div>
                <dt className="text-slate-500">Modality</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{candidate.modality}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Molecular Weight</dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                  {candidate.molecularWeightKda.toFixed(1)} kDa
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Host Expression System</dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                  {candidate.expressionSystem} Mammalian
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Manufactured mAb ID</dt>
                <dd className="font-mono text-slate-900 font-semibold mt-0.5">
                  {candidate.drugbankOrMabId} · {candidate.chemblId}
                </dd>
              </div>
              <div className="col-span-2 p-2.5 bg-slate-50 border border-slate-200">
                <dt className="text-slate-500 font-mono text-[11px]">
                  TARGET RECEPTOR ACCESSION (DISTINGUISHED FROM mAb PRODUCT)
                </dt>
                <dd className="font-mono text-slate-800 mt-0.5">
                  UniProtKB {candidate.targetUniprotId} → {candidate.targetAntigen}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Therapeutic Indication</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {candidate.therapeuticIndication}
                </dd>
              </div>
            </dl>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="text-xs font-mono text-slate-500 mb-2">
                CRITICAL QUALITY ATTRIBUTES (CQAs) &amp; PROCESS CONSTRAINTS
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {candidate.criticalQualityAttributes.map((cqa) => (
                  <li key={cqa} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{cqa}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Interactive Sensitivity Analysis & Source-to-Parameter Provenance Bridge */}
          <div className="bg-white border border-slate-200 p-6">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-mono text-blue-700">
                  SENSITIVITY ANALYSIS &amp; SOURCE-TO-PARAMETER EVIDENCE BRIDGE
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                  CHO Kinetic &amp; Hydrodynamic Sensitivity Assumptions
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Moving a slider modifies <strong>model assumptions for sensitivity testing</strong>—it
                  does not alter experimental literature truth. Out-of-calibration values trigger explicit
                  warnings.
                </p>
              </div>
              <button
                type="button"
                onClick={onResetGroundedParams}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset Defaults
              </button>
            </div>

            <div className="space-y-4 mt-4">
              {/* Specific Productivity q_p */}
              <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="param-qp" className="font-semibold text-slate-900">
                    1. Specific Productivity <span className="font-mono">q_p</span> ({groundedParams.qpSourceId})
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {groundedParams.qpBase.toFixed(1)} <span className="text-slate-500">pg/cell/day</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Meaning: Mass of recombinant protein secreted per viable cell per day. Bielser et al. (2018, Table 1) reports a CHO range of <span className="font-mono">15.0–50.0 pg/cell/day</span> (typical 20–35); default <span className="font-mono">{candidate.defaultGroundedParams.qpBase}</span> is a synthetic point assumption within that range.
                </div>
                <input
                  id="param-qp"
                  type="range"
                  min={14}
                  max={45}
                  step={0.5}
                  value={groundedParams.qpBase}
                  onChange={(e) => handleParamChange('qpBase', parseFloat(e.target.value))}
                  className="w-full mt-1 accent-blue-600 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={
                      Math.abs(groundedParams.qpBase - candidate.defaultGroundedParams.qpBase) > 0.05
                        ? 'text-violet-800 font-semibold'
                        : 'text-amber-800'
                    }
                  >
                    {Math.abs(groundedParams.qpBase - candidate.defaultGroundedParams.qpBase) > 0.05
                      ? '● Classification: Researcher-provided (Challenged Value)'
                      : '● Classification: Synthetic demonstration assumption (Within Bielser 2018 15–50 range)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProvenanceParamId('q_p')}
                    className="text-blue-700 hover:underline font-semibold cursor-pointer"
                  >
                    Audit Provenance ↓
                  </button>
                </div>
              </div>

              {/* Specific Oxygen Uptake Rate q_O2 */}
              <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="param-qo2" className="font-semibold text-slate-900">
                    2. Specific Oxygen Uptake <span className="font-mono">q_O2</span> ({groundedParams.qO2SourceId})
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {groundedParams.qO2Specific.toFixed(2)} <span className="text-slate-500">pmol/cell/h</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Meaning: Cellular O₂ consumption rate driving <span className="font-mono">OUR = q_O2 · X_v</span>. Audit Note: <span className="font-mono">OPENALEX-W298144201</span> (Rosseburg 2018) is an abiotic mixing paper and does NOT measure <span className="font-mono">q_O2</span>. Published CHO respiration (Doran 2013; Jorjani 1999) spans <span className="font-mono">0.15–0.45 pmol/cell/h</span>.
                </div>
                <input
                  id="param-qo2"
                  type="range"
                  min={0.18}
                  max={0.55}
                  step={0.01}
                  value={groundedParams.qO2Specific}
                  onChange={(e) => handleParamChange('qO2Specific', parseFloat(e.target.value))}
                  className="w-full mt-1 accent-blue-600 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={
                      Math.abs(
                        groundedParams.qO2Specific - candidate.defaultGroundedParams.qO2Specific
                      ) > 0.005
                        ? 'text-violet-800 font-semibold'
                        : 'text-amber-800'
                    }
                  >
                    {Math.abs(
                      groundedParams.qO2Specific - candidate.defaultGroundedParams.qO2Specific
                    ) > 0.005
                      ? '● Classification: Researcher-provided (Challenged Value)'
                      : '● Classification: Synthetic demonstration assumption (Within 0.15–0.45 CHO range)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProvenanceParamId('q_o2')}
                    className="text-blue-700 hover:underline font-semibold cursor-pointer"
                  >
                    Audit Provenance ↓
                  </button>
                </div>
              </div>

              {/* Max Specific Growth Rate mu_max */}
              <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="param-mumax" className="font-semibold text-slate-900">
                    3. Max Specific Growth Rate <span className="font-mono">μ_max</span> ({groundedParams.muMaxSourceId})
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {groundedParams.muMax.toFixed(3)} <span className="text-slate-500">h⁻¹</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Meaning: Exponential cell division rate (<span className="font-mono">t_d = ln(2)/μ_max ≈ {(Math.LN2 / groundedParams.muMax).toFixed(1)} h</span>), governing perfusion cell bleed demand.
                </div>
                <input
                  id="param-mumax"
                  type="range"
                  min={0.022}
                  max={0.055}
                  step={0.001}
                  value={groundedParams.muMax}
                  onChange={(e) => handleParamChange('muMax', parseFloat(e.target.value))}
                  className="w-full mt-1 accent-blue-600 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={
                      Math.abs(groundedParams.muMax - candidate.defaultGroundedParams.muMax) > 0.0005
                        ? 'text-violet-800 font-semibold'
                        : 'text-amber-800'
                    }
                  >
                    {Math.abs(groundedParams.muMax - candidate.defaultGroundedParams.muMax) > 0.0005
                      ? '● Classification: Researcher-provided (Challenged Value)'
                      : '● Classification: Synthetic demonstration assumption (Within CHO doubling range)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProvenanceParamId('mu_max')}
                    className="text-blue-700 hover:underline font-semibold cursor-pointer"
                  >
                    Audit Provenance ↓
                  </button>
                </div>
              </div>

              {/* Critical Hydrodynamic Shear Threshold */}
              <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="param-shear" className="font-semibold text-slate-900">
                    4. Critical Shear Limit <span className="font-mono">τ_crit</span> ({groundedParams.shearSourceId})
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {groundedParams.shearThresholdPa.toFixed(2)} <span className="text-slate-500">Pa</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Meaning: Bulk shear proxy derived (~1/20×) from Neunstoecklin et al. (2015) local maximum stress limit (<span className="font-mono">τ_max,local = 32.4 ± 4.4 Pa</span>).
                </div>
                <input
                  id="param-shear"
                  type="range"
                  min={0.85}
                  max={2.40}
                  step={0.05}
                  value={groundedParams.shearThresholdPa}
                  onChange={(e) => handleParamChange('shearThresholdPa', parseFloat(e.target.value))}
                  className="w-full mt-1 accent-blue-600 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={
                      Math.abs(
                        groundedParams.shearThresholdPa -
                          candidate.defaultGroundedParams.shearThresholdPa
                      ) > 0.01
                        ? 'text-violet-800 font-semibold'
                        : 'text-cyan-800'
                    }
                  >
                    {Math.abs(
                      groundedParams.shearThresholdPa -
                        candidate.defaultGroundedParams.shearThresholdPa
                    ) > 0.01
                      ? '● Classification: Researcher-provided (Challenged Value)'
                      : '● Classification: Derived from literature with documented calculation (PMID:25450236)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProvenanceParamId('tau_crit')}
                    className="text-blue-700 hover:underline font-semibold cursor-pointer"
                  >
                    Audit Provenance ↓
                  </button>
                </div>
              </div>
            </div>

            {/* Live Sensitivity & Oxygen-Balance Stress Test Calculator */}
            {(() => {
              const refVcd = 45; // 45 x 10^6 cells/mL
              const ourCurrent = groundedParams.qO2Specific * refVcd; // mmol/L/h
              const ourPlus20Pct = groundedParams.qO2Specific * 1.2 * refVcd;
              const otr500LAirOnly = 3.2; // mmol/L/h at 500 L on 21% O2 air
              const otr500LEnriched55 = 19.3; // mmol/L/h at 500 L on 55% O2
              const airMargin = otr500LAirOnly - ourCurrent;
              const enrichedMargin = otr500LEnriched55 - ourCurrent;
              const isRobustAtPlus20 = otr500LEnriched55 >= ourPlus20Pct;

              return (
                <div className="mt-5 p-3.5 bg-slate-900 text-white space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-2">
                    <span className="font-mono uppercase tracking-wider text-teal-300 text-[11px]">
                      LIVE SENSITIVITY &amp; OXYGEN-BALANCE STRESS TEST (AT 45×10⁶ CELLS/ML, 500 L)
                    </span>
                    <span
                      className={`font-mono text-[11px] font-semibold ${
                        isRobustAtPlus20 ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {isRobustAtPlus20
                        ? 'ROBUST TO +20% q_O2 UNCERTAINTY'
                        : 'SENSITIVE TO +20% q_O2 SHIFT'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono">
                    <div className="p-2 bg-slate-800 border border-slate-700">
                      <div className="text-[10px] text-slate-400">CELLULAR O₂ DEMAND (OUR)</div>
                      <div className="text-sm font-semibold text-white tabular-nums mt-0.5">
                        {ourCurrent.toFixed(1)} mmol/L/h
                      </div>
                      <div className="text-[10px] text-slate-400">
                        +20% stress: {ourPlus20Pct.toFixed(1)} mmol/L/h
                      </div>
                    </div>
                    <div className="p-2 bg-rose-950/70 border border-rose-700/70">
                      <div className="text-[10px] text-rose-300">500 L AIR-ONLY (21% O₂)</div>
                      <div className="text-sm font-semibold text-rose-200 tabular-nums mt-0.5">
                        OTR 3.2 vs OUR {ourCurrent.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-rose-300">
                        Deficit: {airMargin.toFixed(1)} mmol/L/h (INFEASIBLE)
                      </div>
                    </div>
                    <div
                      className={`p-2 border ${
                        enrichedMargin >= 0
                          ? 'bg-emerald-950/60 border-emerald-700/70'
                          : 'bg-rose-950/70 border-rose-700/70'
                      }`}
                    >
                      <div className="text-[10px] text-slate-300">500 L ENRICHED (55% O₂)</div>
                      <div className="text-sm font-semibold text-white tabular-nums mt-0.5">
                        OTR 19.3 vs OUR {ourCurrent.toFixed(1)}
                      </div>
                      <div
                        className={`text-[10px] ${
                          enrichedMargin >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        Margin: {enrichedMargin >= 0 ? '+' : ''}
                        {enrichedMargin.toFixed(1)} mmol/L/h (
                        {enrichedMargin >= 0 ? 'FEASIBLE' : 'INFEASIBLE'})
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Interactive Parameter Provenance Inspector, Downstream Causal Chain & Assumption-Challenge Workbench */}
      <ParameterProvenanceAndChallengePanel
        provenanceLedger={provenanceLedger}
        consistencyChecks={consistencyChecks}
        challengeHistory={challengeHistory}
        selectedParamId={selectedProvenanceParamId}
        onSelectParamId={setSelectedProvenanceParamId}
        onApplyChallenge={onApplyParameterChallenge}
        onResetAllChallenges={onResetAllChallenges}
      />
    </div>
  );
};
