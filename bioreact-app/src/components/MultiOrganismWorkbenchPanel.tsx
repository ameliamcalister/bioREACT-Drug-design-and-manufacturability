import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FlaskConical,
  HelpCircle,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  CandidatePathwayMode,
  ExpressionHostOption,
  ModelReadinessLevel,
  NovelProteinDissertationProfile,
  NovelProteinEvaluationResult,
  OrganismSystemId,
  ResearcherCandidateApprovalState,
  StirredTankPhysicsParams,
  UploadedExperimentalRow,
} from '../types/bioreact';
import {
  ORGANISM_PROCESS_MODELS,
  SAMPLE_DISSERTATION_CSV_TEXT,
  parseExperimentalCsvText,
  solveOrganismSpecificMassBalance,
} from '../data/multiOrganismData';

interface MultiOrganismWorkbenchPanelProps {
  selectedOrganismId: OrganismSystemId;
  onSelectOrganismId: (id: OrganismSystemId) => void;
  candidatePathwayMode: CandidatePathwayMode;
  onChangePathwayMode: (mode: CandidatePathwayMode) => void;
  strParams: StirredTankPhysicsParams;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  novelProfile: NovelProteinDissertationProfile;
  novelPresets: Record<string, NovelProteinDissertationProfile>;
  onUpdateNovelProfile: (next: NovelProteinDissertationProfile) => void;
  novelEvaluation: NovelProteinEvaluationResult;
  uploadedRows: UploadedExperimentalRow[];
  onUpdateUploadedRows: (rows: UploadedExperimentalRow[]) => void;
  researcherApprovals: ResearcherCandidateApprovalState;
  onUpdateResearcherApprovals: (next: ResearcherCandidateApprovalState) => void;
  onNavigateToSection: (
    sec:
      | 'dissertation_3d'
      | 'workflow_safety'
      | 'streams'
      | 'screening'
      | 'mass_balance'
      | 'optimiser'
      | 'brief'
  ) => void;
}

export const MultiOrganismWorkbenchPanel: React.FC<MultiOrganismWorkbenchPanelProps> = ({
  selectedOrganismId,
  onSelectOrganismId,
  candidatePathwayMode,
  onChangePathwayMode,
  strParams,
  onUpdateStrParams,
  novelProfile,
  novelPresets,
  onUpdateNovelProfile,
  novelEvaluation,
  uploadedRows,
  onUpdateUploadedRows,
  researcherApprovals,
  onUpdateResearcherApprovals,
  onNavigateToSection,
}) => {
  const [customBiomassByOrg, setCustomBiomassByOrg] = useState<Record<OrganismSystemId, number>>({
    cho_mammalian: 43.5,
    hek293_mammalian: 12.0,
    ecoli_microbial: 35.0,
    pichia_yeast: 40.0,
    saccharomyces_yeast: 38.0,
    skeletal_muscle_cultivated_meat: 18.0,
    microalgae_phototrophic: 4.8,
  });

  const [opticalPathM, setOpticalPathM] = useState<number>(0.05);
  const [csvInputText, setCsvInputText] = useState<string>(SAMPLE_DISSERTATION_CSV_TEXT);
  const [showCsvEditor, setShowCsvEditor] = useState<boolean>(false);

  const activeOrganism = ORGANISM_PROCESS_MODELS[selectedOrganismId];
  const currentBiomass = customBiomassByOrg[selectedOrganismId] ?? activeOrganism.defaultTargetBiomass;

  const orgMassBalance = useMemo(
    () =>
      solveOrganismSpecificMassBalance(
        selectedOrganismId,
        strParams,
        currentBiomass,
        opticalPathM
      ),
    [selectedOrganismId, strParams, currentBiomass, opticalPathM]
  );

  // Determine effective Model-Readiness Level for the current state
  const effectiveReadiness: ModelReadinessLevel = useMemo(() => {
    if (candidatePathwayMode === 'small_molecule_chemical') {
      return 'Outside supported model domain';
    }
    if (candidatePathwayMode === 'novel_dissertation_protein') {
      const allApproved =
        researcherApprovals.molecularIdentityApproved &&
        researcherApprovals.expressionHostApproved &&
        researcherApprovals.literatureReferencesApproved &&
        researcherApprovals.experimentalParametersApproved;
      const hasAllKinetics =
        novelProfile.researcherSuppliedQp !== null &&
        novelProfile.researcherSuppliedQO2 !== null &&
        novelProfile.researcherSuppliedMuMax !== null &&
        novelProfile.proposedExpressionHost !== 'Unassigned — Requires Human Host Selection' &&
        novelProfile.proposedExpressionHost !== 'Unknown / Uncharacterised';

      if (!hasAllKinetics || !allApproved) {
        return 'Insufficient data for quantitative optimisation';
      }
      return novelProfile.proposedExpressionHost === 'CHO Mammalian'
        ? 'Supported computational demonstration'
        : 'Research-stage model with unverified assumptions';
    }
    return activeOrganism.modelReadiness;
  }, [candidatePathwayMode, researcherApprovals, novelProfile, activeOrganism]);

  const allFourResearcherGatesApproved =
    researcherApprovals.molecularIdentityApproved &&
    researcherApprovals.expressionHostApproved &&
    researcherApprovals.literatureReferencesApproved &&
    researcherApprovals.experimentalParametersApproved;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvInputText(text);
    const parsed = parseExperimentalCsvText(text);
    if (parsed.length > 0) {
      onUpdateUploadedRows(parsed);
      applyUploadedRowsToNovelProfile(parsed);
    }
  };

  const applyUploadedRowsToNovelProfile = (rows: UploadedExperimentalRow[]) => {
    if (rows.length === 0) return;
    const last = rows[rows.length - 1];
    const first = rows[0];
    const deltaHours = Math.max(1, last.timeHours - first.timeHours);
    const estMuMax =
      first.biomassValue > 0 && last.biomassValue > first.biomassValue
        ? Number((Math.log(last.biomassValue / first.biomassValue) / deltaHours).toFixed(3))
        : 0.031;

    onUpdateNovelProfile({
      ...novelProfile,
      researcherSuppliedQp: last.specificProductivityMeasured,
      researcherSuppliedQO2: last.specificO2UptakeMeasured,
      researcherSuppliedMuMax: estMuMax,
    });
  };

  const handleLoadSampleExperimentalDataset = () => {
    const parsed = parseExperimentalCsvText(csvInputText);
    onUpdateUploadedRows(parsed);
    applyUploadedRowsToNovelProfile(parsed);
  };

  const readinessBadgeColor = (level: ModelReadinessLevel) => {
    switch (level) {
      case 'Supported computational demonstration':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700';
      case 'Research-stage model with unverified assumptions':
        return 'bg-amber-950 text-amber-300 border-amber-700';
      case 'Insufficient data for quantitative optimisation':
        return 'bg-rose-950 text-rose-300 border-rose-700';
      case 'Outside supported model domain':
        return 'bg-slate-800 text-slate-300 border-slate-600';
    }
  };

  return (
    <section className="bg-white border border-slate-200 p-6 space-y-6">
      {/* 1. Modular 6-Layer Architecture Header & Model-Readiness Indicator */}
      <div className="bg-slate-900 text-slate-100 p-5 border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cyan-400">
              <span>MODULAR MULTI-ORGANISM ARCHITECTURE</span>
              <span>·</span>
              <span>BIOLOGY DECOUPLED FROM OPTIMISATION</span>
              <span>·</span>
              <span>NO CROSS-ORGANISM PARAMETER REUSE</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Multi-Organism Process Models, Model-Readiness Transparency &amp; Research Protein Gate
            </h2>
            <p className="text-xs text-slate-300 max-w-4xl leading-relaxed">
              bioREACT separates <strong className="text-white">Biological Process Models</strong> (6
              distinct organisms with native units, stoichiometry, and constraints) from{' '}
              <strong className="text-white">Reactor Configuration Screening</strong> and the{' '}
              <strong className="text-white">Constrained Bayesian Optimisation Engine</strong>. CHO
              kinetic parameters are never reused for unrelated organisms, and quantitative
              optimisation is automatically disabled whenever a model is unvalidated or evidence is
              incomplete.
            </p>
          </div>

          {/* Transparent Model-Readiness Indicator */}
          <div className="p-3.5 border bg-slate-950 border-slate-700 shrink-0 min-w-[300px]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              ACTIVE PATHWAY MODEL-READINESS INDICATOR
            </div>
            <div
              className={`mt-1.5 px-2.5 py-1.5 border text-xs font-mono font-bold inline-flex items-center gap-1.5 ${readinessBadgeColor(
                effectiveReadiness
              )}`}
            >
              {effectiveReadiness === 'Supported computational demonstration' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : effectiveReadiness === 'Research-stage model with unverified assumptions' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <Lock className="w-4 h-4 shrink-0" />
              )}
              <span>{effectiveReadiness}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1.5">
              {effectiveReadiness === 'Supported computational demonstration'
                ? 'Quantitative BO Unlocked (Literature-Calibrated Simulation — Not Wet-Lab Validated)'
                : effectiveReadiness === 'Research-stage model with unverified assumptions'
                ? 'Status: "Conceptual research model — not validated" · Quantitative BO Disabled'
                : effectiveReadiness === 'Insufficient data for quantitative optimisation'
                ? 'Status: "Insufficient data" · Quantitative BO Disabled Until Data & Host Approved'
                : 'Status: Outside Cellular Bioprocess Domain · Routed to Organic Synthesis'}
            </div>
          </div>
        </div>

        {/* 6-Layer Modular Architecture Pipeline Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-800 text-xs">
          {[
            {
              step: 'MODULE 01',
              title: 'Candidate Profiling',
              desc: 'Construct MW, PTMs, disulfide & glycosylation needs',
            },
            {
              step: 'MODULE 02',
              title: 'Host / Cell Selection',
              desc: 'Explicit human selection (never auto-assigned)',
            },
            {
              step: 'MODULE 03',
              title: 'Organism Process Model',
              desc: 'Native units (10⁶ cells/mL vs g DCW/L vs PAR)',
            },
            {
              step: 'MODULE 04',
              title: 'Reactor Screening',
              desc: 'STR, Rocking, HF, Microbial STR & Photobioreactors',
            },
            {
              step: 'MODULE 05',
              title: 'Constrained BO Engine',
              desc: 'Shared EI × P(feas) engine (locks if unvalidated)',
            },
            {
              step: 'MODULE 06',
              title: 'Human Approval Gates',
              desc: '5 mandatory safety gates + OTR ≥ OUR interlock',
            },
          ].map((mod) => (
            <div key={mod.step} className="p-2.5 bg-slate-950 border border-slate-800">
              <div className="text-[10px] font-mono text-cyan-400 font-semibold">{mod.step}</div>
              <div className="font-semibold text-white mt-0.5">{mod.title}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{mod.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Selector for the 6 Supported Biological Systems */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Supported Biological Systems (1 Calibrated Demonstration + 5 Research-Stage Pathways)
            </h3>
            <p className="text-xs text-slate-600">
              Select any organism below to inspect its dedicated mass balances, kinetic parameters,
              applicable reactor geometries, and model-readiness classification.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Active System: <strong className="text-slate-900">{activeOrganism.organismName}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.values(ORGANISM_PROCESS_MODELS) as typeof activeOrganism[]).map((org) => {
            const isSelected = selectedOrganismId === org.id;
            const isCalibrated = org.modelReadiness === 'Supported computational demonstration';
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  onSelectOrganismId(org.id);
                  if (candidatePathwayMode === 'small_molecule_chemical') {
                    onChangePathwayMode('established_biologic');
                  }
                }}
                className={`text-left p-4 border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span
                      className={
                        isCalibrated
                          ? 'text-emerald-700 font-bold'
                          : 'text-amber-800 font-semibold'
                      }
                    >
                      {isCalibrated
                        ? '● SUPPORTED DEMO PATHWAY'
                        : '▲ CONCEPTUAL RESEARCH MODEL'}
                    </span>
                    <span className="text-slate-500">Units: {org.biomassUnit}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{org.organismName}</div>
                  <div className="text-[11px] font-mono text-slate-500">{org.scientificName}</div>
                  <p className="text-xs text-slate-700 leading-relaxed pt-1">
                    <strong>Exemplar:</strong> {org.exemplarProduct}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-600">
                    μ_max={org.specificGrowthRateMuMaxPerHour} h⁻¹ · τ_crit={org.shearThresholdPa} Pa
                  </span>
                  <span className="text-blue-700 font-semibold">
                    {isSelected ? 'Selected' : 'Inspect →'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Explicit Model Validation / Epistemic Guardrail Banner for Selected Organism */}
      <div
        className={`p-4 border ${
          activeOrganism.quantitativeOptimisationAllowedByDefault
            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
            : 'bg-amber-50/90 border-amber-300 text-amber-950'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 text-xs">
            <div className="font-mono font-bold uppercase flex flex-wrap items-center gap-2">
              <span>ORGANISM MODEL COVERAGE: {activeOrganism.organismName.toUpperCase()}</span>
              <span>·</span>
              <span>[{activeOrganism.modelReadiness.toUpperCase()}]</span>
            </div>
            <p className="leading-relaxed">{activeOrganism.modelValidationBanner}</p>
            <p className="font-mono text-[11px] pt-1">
              <strong>Why CHO Parameters Are Blocked Here:</strong>{' '}
              {activeOrganism.whyChoParametersCannotBeReused}
            </p>
          </div>
          {!activeOrganism.quantitativeOptimisationAllowedByDefault && (
            <div className="shrink-0 p-2.5 bg-white border border-amber-400 text-xs font-mono text-rose-900 font-semibold">
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-rose-700 shrink-0" />
                <span>Quantitative BO Disabled</span>
              </div>
              <div className="text-[10px] text-slate-600 font-normal mt-0.5">
                First-principles mass balance &amp; reactor screening active
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Selected Organism Process Model Details + Live Native-Unit Mass Balance Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 cols: Engineering Objectives, Governing Equations, Parameters & Evidence Requirements */}
        <div className="lg:col-span-6 border border-slate-200 p-5 space-y-4 bg-slate-50/40">
          <div className="border-b border-slate-200 pb-3">
            <div className="text-[11px] font-mono text-slate-500 uppercase">
              ORGANISM-SPECIFIC PROCESS MODEL SPECIFICATION
            </div>
            <h4 className="text-base font-bold text-slate-900 mt-0.5">
              {activeOrganism.organismName} ({activeOrganism.category})
            </h4>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-mono font-semibold text-slate-800 uppercase text-[11px]">
              Primary Engineering Objectives
            </div>
            <ul className="space-y-1 text-slate-700 list-disc pl-4">
              {activeOrganism.engineeringObjectives.map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-mono font-semibold text-slate-800 uppercase text-[11px]">
              Governing Mass-Balance &amp; Transport Equations
            </div>
            <div className="p-3 bg-white border border-slate-200 font-mono text-[11px] text-slate-800 space-y-1">
              {activeOrganism.governingEquationsSummary.map((eq, i) => (
                <div key={i}>{eq}</div>
              ))}
            </div>
          </div>

          {/* Organism-Specific Kinetic Parameters Table */}
          <div className="space-y-2 text-xs">
            <div className="font-mono font-semibold text-slate-800 uppercase text-[11px]">
              Organism-Specific Kinetic &amp; Physical Parameters (Never Reused Across Taxa)
            </div>
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[10px] font-mono uppercase text-slate-600">
                    <th className="py-2 px-2.5">Parameter</th>
                    <th className="py-2 px-2.5">Value &amp; Native Unit</th>
                    <th className="py-2 px-2.5">Epistemic Provenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeOrganism.parameters.map((p) => (
                    <tr key={p.key}>
                      <td className="py-2 px-2.5 font-medium text-slate-900">
                        <span className="font-mono font-bold text-blue-800">{p.symbol}</span> ·{' '}
                        {p.label}
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums">
                        {p.value !== null ? (
                          <span className="font-semibold text-slate-900">
                            {p.value} {p.unit}
                          </span>
                        ) : (
                          <span className="text-rose-700 font-semibold">
                            Insufficient data ({p.unit})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-[11px] text-slate-600">
                        <div className="font-mono font-semibold text-slate-800">{p.sourceTag}</div>
                        <div>{p.citationOrNote}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-3 bg-white border border-slate-200 space-y-1">
              <div className="font-mono font-semibold text-slate-800 uppercase text-[10px]">
                Hard Engineering Constraints
              </div>
              <ul className="space-y-1 text-slate-700 list-disc pl-4 text-[11px]">
                {activeOrganism.hardConstraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="p-3 bg-white border border-slate-200 space-y-1">
              <div className="font-mono font-semibold text-slate-800 uppercase text-[10px]">
                Required Experimental Evidence Before Validation
              </div>
              <ul className="space-y-1 text-slate-700 list-disc pl-4 text-[11px]">
                {activeOrganism.evidenceRequirements.map((ev, i) => (
                  <li key={i}>{ev}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right 6 cols: Live Organism-Specific Mass Balance, Transport & Feasibility Solver */}
        <div className="lg:col-span-6 border border-slate-200 p-5 space-y-4 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <div className="text-[11px] font-mono text-slate-500 uppercase">
                LIVE ORGANISM-SPECIFIC MASS BALANCE &amp; TRANSPORT AUDIT
              </div>
              <h4 className="text-base font-bold text-slate-900 mt-0.5">
                {activeOrganism.shortBadge} @ {strParams.workingVolumeL} L Working Volume
              </h4>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-mono font-bold border ${
                orgMassBalance.isFeasible
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              {orgMassBalance.isFeasible ? '● MASS BALANCE FEASIBLE' : '✖ CONSTRAINT VIOLATION'}
            </span>
          </div>

          {/* Interactive Controls for Biomass (in native units) & Optical Path (for Microalgae) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between font-mono">
                <label htmlFor="org-biomass-slider" className="font-semibold text-slate-700">
                  Target Biomass ({activeOrganism.biomassUnit}):
                </label>
                <span className="font-bold text-slate-900 tabular-nums">
                  {currentBiomass.toFixed(1)} {activeOrganism.biomassUnit}
                </span>
              </div>
              <input
                id="org-biomass-slider"
                type="range"
                min={selectedOrganismId === 'microalgae_phototrophic' ? 0.5 : 2.0}
                max={selectedOrganismId === 'ecoli_microbial' || selectedOrganismId === 'pichia_yeast' ? 85.0 : selectedOrganismId === 'microalgae_phototrophic' ? 12.0 : 70.0}
                step={0.5}
                value={currentBiomass}
                onChange={(e) =>
                  setCustomBiomassByOrg((prev) => ({
                    ...prev,
                    [selectedOrganismId]: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="text-[10px] font-mono text-slate-500">
                Native unit: {activeOrganism.biomassUnit} (never conflated across organisms)
              </div>
            </div>

            {selectedOrganismId === 'microalgae_phototrophic' ? (
              <div className="space-y-1">
                <div className="flex justify-between font-mono">
                  <label htmlFor="pbr-optical-path" className="font-semibold text-slate-700">
                    Photobioreactor Optical Path L_opt:
                  </label>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {(opticalPathM * 100).toFixed(1)} cm ({opticalPathM.toFixed(2)} m)
                  </span>
                </div>
                <input
                  id="pbr-optical-path"
                  type="range"
                  min={0.02}
                  max={0.45}
                  step={0.01}
                  value={opticalPathM}
                  onChange={(e) => setOpticalPathM(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="text-[10px] font-mono text-slate-500">
                  Flat-panel/Tubular PBR: 3–8 cm vs Stirred Tank: 45–85 cm
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex justify-between font-mono">
                  <label htmlFor="org-scale-slider" className="font-semibold text-slate-700">
                    Vessel Working Volume (L):
                  </label>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {strParams.workingVolumeL} L
                  </span>
                </div>
                <input
                  id="org-scale-slider"
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={strParams.workingVolumeL}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      workingVolumeL: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="text-[10px] font-mono text-slate-500">
                  Tests geometric scale-up of kLa, mixing time t_m, and jacket cooling area
                </div>
              </div>
            )}
          </div>

          {/* Telemetry Readout Cards (Adapts to Phototrophic vs Heterotrophic/Microbial/Myoblast) */}
          {orgMassBalance.isPhototrophic ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  PHOTIC ZONE FRACTION
                </div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                    (orgMassBalance.photicZoneFractionPercent || 0) >= 35
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {(orgMassBalance.photicZoneFractionPercent || 0).toFixed(1)}%
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Mean PAR: {(orgMassBalance.meanLightIntensityUmolM2S || 0).toFixed(0)} μmol/m²/s
                </div>
              </div>

              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  CO₂ TRANSFER vs DEMAND
                </div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                    (orgMassBalance.co2TransferRateMmolPerLHour || 0) >=
                    (orgMassBalance.co2UptakeRateMmolPerLHour || 0)
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {(orgMassBalance.co2TransferRateMmolPerLHour || 0).toFixed(1)} vs{' '}
                  {(orgMassBalance.co2UptakeRateMmolPerLHour || 0).toFixed(1)}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  CTR vs CUR (mmol CO₂/L/h)
                </div>
              </div>

              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  EVOLVED O₂ ACCUMULATION
                </div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                    (orgMassBalance.dissolvedO2AccumulationPercentAir || 100) <= 250
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {(orgMassBalance.dissolvedO2AccumulationPercentAir || 100).toFixed(0)}% Air
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Photo-inhibition limit ≤ 250%
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  O₂ SUPPLY vs DEMAND
                </div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                    orgMassBalance.oxygenBalanceMarginMmolPerLHour >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {orgMassBalance.otrMmolPerLHour.toFixed(1)} vs{' '}
                  {orgMassBalance.ourMmolPerLHour.toFixed(1)}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  OTR vs OUR (mmol O₂/L/h)
                </div>
              </div>

              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  SHEAR τ &amp; EDDY λ_K
                </div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                    orgMassBalance.estimatedShearStressPa <= orgMassBalance.shearThresholdPa &&
                    orgMassBalance.kolmogorovScaleUm >= orgMassBalance.kolmogorovLimitUm
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {orgMassBalance.estimatedShearStressPa.toFixed(2)} Pa ·{' '}
                  {orgMassBalance.kolmogorovScaleUm.toFixed(0)} μm
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Limits: τ ≤ {orgMassBalance.shearThresholdPa} Pa, λ_K ≥{' '}
                  {orgMassBalance.kolmogorovLimitUm} μm
                </div>
              </div>

              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  METABOLIC HEAT vs JACKET
                </div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                    orgMassBalance.isCoolingFeasible ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {orgMassBalance.metabolicHeatLoadKw.toFixed(1)} /{' '}
                  {orgMassBalance.maxJacketCoolingCapacityKw.toFixed(1)} kW
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Q_gen vs Q_jacket,max ({activeOrganism.optimalTempC} °C)
                </div>
              </div>
            </div>
          )}

          {/* Violated Constraints & Organism-Aware Engineering Actions */}
          {orgMassBalance.violatedConstraints.length > 0 ? (
            <div className="p-3.5 bg-rose-50 border border-rose-300 space-y-2 text-xs">
              <div className="font-mono font-bold text-rose-900 uppercase">
                Active Constraint Violations for {activeOrganism.shortBadge}:
              </div>
              <ul className="space-y-1 text-rose-900 list-disc pl-4">
                {orgMassBalance.violatedConstraints.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
              <div className="pt-1 border-t border-rose-200 font-mono text-[11px] text-rose-800">
                <strong>Required Engineering Action:</strong>{' '}
                {orgMassBalance.engineeringRecommendations.join(' ')}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-xs text-emerald-900">
              <strong>All First-Principles Balances Satisfied:</strong> Oxygen/CO₂ transfer,
              Kolmogorov eddy length, shear stress, and jacket heat removal are within bounds for{' '}
              <strong>{activeOrganism.organismName}</strong> at {currentBiomass}{' '}
              {activeOrganism.biomassUnit}.
            </div>
          )}

          {/* Applicable vs Rejected Reactor Architectures for Selected Organism */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-semibold uppercase text-slate-700">
                Organism-Filtered Reactor Configurations ({activeOrganism.applicableReactorIds.length}{' '}
                Compatible)
              </span>
              <button
                type="button"
                onClick={() => onNavigateToSection('screening')}
                className="text-xs font-mono font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Open Full 10-Reactor Matrix →
              </button>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div>
                <span className="font-mono font-semibold text-emerald-800">
                  Compatible Geometries:{' '}
                </span>
                <span className="font-mono text-slate-800">
                  {activeOrganism.applicableReactorIds.join(' · ')}
                </span>
              </div>
              {Object.entries(activeOrganism.inapplicableReactorReasons)
                .slice(0, 2)
                .map(([rId, reason]) => (
                  <div key={rId} className="text-[11px] text-rose-800">
                    <span className="font-mono font-semibold">[{rId}]</span> {reason}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Researcher-Supplied New Research Protein Profile + Structured Experimental Data Upload + 4-Part Approval Gate */}
      <div className="border-t border-slate-200 pt-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase text-teal-700 font-semibold">
              NEW RESEARCH PROTEIN &amp; STRUCTURED EXPERIMENTAL DATA INGESTION
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Researcher-Supplied Dissertation Candidate Profile, CSV/JSON Experimental Upload &amp;
              Mandatory 4-Part Pre-Modelling Approval
            </h3>
            <p className="text-xs text-slate-600 max-w-4xl">
              bioREACT never automatically assigns an expression host or claims that a novel protein
              is manufacturable. Quantitative modelling requires explicit human verification of (1)
              Molecular Identity, (2) Expression Host, (3) Literature References, and (4)
              Experimentally Measured Kinetics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onChangePathwayMode('novel_dissertation_protein');
                onUpdateNovelProfile(novelPresets.dissertation_unassigned);
                onUpdateResearcherApprovals({
                  ...researcherApprovals,
                  molecularIdentityApproved: false,
                  expressionHostApproved: false,
                  literatureReferencesApproved: false,
                  experimentalParametersApproved: false,
                  approvedTimestamp: null,
                });
              }}
              className="px-3 py-1.5 text-xs font-mono bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            >
              Load Case C: Unassigned Host De-Novo Protein
            </button>
            <button
              type="button"
              onClick={() => {
                onChangePathwayMode('novel_dissertation_protein');
                onUpdateNovelProfile(novelPresets.dissertation_scfv);
              }}
              className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer"
            >
              Load Case A: K. phaffii scFv
            </button>
            <button
              type="button"
              onClick={() => {
                onChangePathwayMode('novel_dissertation_protein');
                onUpdateNovelProfile(novelPresets.dissertation_glyco);
              }}
              className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer"
            >
              Load Case B: CHO Sialo-Fc
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 cols: Candidate Profile Form + Structured Experimental CSV Upload */}
          <div className="lg:col-span-7 border border-slate-200 p-4 bg-slate-50/50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-mono text-[11px] font-semibold text-slate-700 mb-1">
                  Research Protein / Construct Name
                </label>
                <input
                  type="text"
                  value={novelProfile.proteinName}
                  onChange={(e) =>
                    onUpdateNovelProfile({ ...novelProfile, proteinName: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-slate-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold text-slate-700 mb-1">
                  Expression Host Selection (Never Auto-Assigned)
                </label>
                <select
                  value={novelProfile.proposedExpressionHost}
                  onChange={(e) => {
                    const nextHost = e.target.value as ExpressionHostOption;
                    onUpdateNovelProfile({
                      ...novelProfile,
                      proposedExpressionHost: nextHost,
                    });
                    if (nextHost === 'CHO Mammalian') onSelectOrganismId('cho_mammalian');
                    else if (nextHost === 'HEK293 Mammalian') onSelectOrganismId('hek293_mammalian');
                    else if (nextHost === 'E. coli Microbial') onSelectOrganismId('ecoli_microbial');
                    else if (nextHost === 'Pichia pastoris Yeast') onSelectOrganismId('pichia_yeast');
                    else if (nextHost === 'Saccharomyces cerevisiae Yeast')
                      onSelectOrganismId('saccharomyces_yeast');
                    else if (nextHost === 'Skeletal Muscle (Cultivated Meat)')
                      onSelectOrganismId('skeletal_muscle_cultivated_meat');
                    else if (nextHost === 'Microalgae Phototrophic')
                      onSelectOrganismId('microalgae_phototrophic');
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-slate-900 font-mono text-xs"
                >
                  <option value="Unassigned — Requires Human Host Selection">
                    -- Unassigned (Requires Explicit Human Selection) --
                  </option>
                  <option value="CHO Mammalian">CHO Mammalian (CHO-K1 / DG44)</option>
                  <option value="HEK293 Mammalian">HEK293 Mammalian (Research-Stage)</option>
                  <option value="E. coli Microbial">E. coli Microbial (BL21 / W3110)</option>
                  <option value="Pichia pastoris Yeast">
                    Komagataella phaffii / Pichia (Secretory Yeast)
                  </option>
                  <option value="Saccharomyces cerevisiae Yeast">
                    Saccharomyces cerevisiae (Crabtree-Positive Yeast)
                  </option>
                  <option value="Skeletal Muscle (Cultivated Meat)">
                    Skeletal Muscle Satellite Cells (Cultivated Meat)
                  </option>
                  <option value="Microalgae Phototrophic">
                    Microalgae Phototrophic (H. pluvialis / Chlorella)
                  </option>
                  <option value="Insect Sf9 / Baculovirus">Insect Sf9 / Baculovirus</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold text-slate-700 mb-1">
                  Molecular Weight (kDa)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={novelProfile.molecularWeightKda}
                  onChange={(e) =>
                    onUpdateNovelProfile({
                      ...novelProfile,
                      molecularWeightKda: parseFloat(e.target.value) || 25,
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-slate-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold text-slate-700 mb-1">
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
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-slate-900 font-mono text-xs"
                >
                  <option value="Unknown PTM Profile">Unknown PTM Profile</option>
                  <option value="Complex Human-like N-Glycosylation Required">
                    Complex Human-like N-Glycosylation Required
                  </option>
                  <option value="Simple Disulfide Bonds / Non-Glycosylated">
                    Simple Disulfide Bonds / Non-Glycosylated
                  </option>
                  <option value="High-Mannose Acceptable">High-Mannose Acceptable</option>
                </select>
              </div>
            </div>

            {/* Structured Experimental Data Upload Box */}
            <div className="p-3.5 bg-white border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-900">
                  <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                  <span>Structured Experimental Data Upload (CSV / Time-Series Kinetics)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .CSV</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadSampleExperimentalDataset}
                    className="px-2.5 py-1 text-xs font-mono bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
                  >
                    Ingest Sample ambr250 Dataset (4 Timepoints)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCsvEditor((v) => !v)}
                    className="px-2 py-1 text-xs font-mono text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    {showCsvEditor ? 'Hide Raw CSV' : 'Edit Raw CSV'}
                  </button>
                </div>
              </div>

              {showCsvEditor && (
                <div className="space-y-1.5">
                  <textarea
                    rows={5}
                    value={csvInputText}
                    onChange={(e) => setCsvInputText(e.target.value)}
                    className="w-full p-2 font-mono text-[11px] bg-slate-950 text-emerald-300 border border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleLoadSampleExperimentalDataset}
                    className="px-3 py-1 text-xs font-mono bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    Parse &amp; Apply Edited CSV Rows
                  </button>
                </div>
              )}

              {uploadedRows.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200">
                  <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600">
                        <th className="py-1.5 px-2">Run ID</th>
                        <th className="py-1.5 px-2">Time (h)</th>
                        <th className="py-1.5 px-2">Biomass</th>
                        <th className="py-1.5 px-2">Titre (mg/L)</th>
                        <th className="py-1.5 px-2">q_O2</th>
                        <th className="py-1.5 px-2">q_p</th>
                        <th className="py-1.5 px-2">Viability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {uploadedRows.map((r, idx) => (
                        <tr key={idx}>
                          <td className="py-1 px-2 font-semibold text-slate-900">{r.runId}</td>
                          <td className="py-1 px-2">{r.timeHours} h</td>
                          <td className="py-1 px-2">
                            {r.biomassValue} {r.biomassUnit}
                          </td>
                          <td className="py-1 px-2">{r.titerOrProductMgL}</td>
                          <td className="py-1 px-2 text-blue-800 font-semibold">
                            {r.specificO2UptakeMeasured}
                          </td>
                          <td className="py-1 px-2 text-emerald-800 font-semibold">
                            {r.specificProductivityMeasured}
                          </td>
                          <td className="py-1 px-2">{r.viabilityPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs font-mono text-slate-500">
                  No structured experimental dataset ingested yet. Click &ldquo;Ingest Sample
                  ambr250 Dataset&rdquo; or upload a CSV to populate empirical kinetics.
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono">
                <div className="p-2 bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500">Measured q_p</div>
                  <div className="font-bold text-slate-900">
                    {novelProfile.researcherSuppliedQp !== null
                      ? `${novelProfile.researcherSuppliedQp} pg/cell/d`
                      : 'MISSING (null)'}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500">Measured q_O2</div>
                  <div className="font-bold text-slate-900">
                    {novelProfile.researcherSuppliedQO2 !== null
                      ? `${novelProfile.researcherSuppliedQO2} pmol/cell/h`
                      : 'MISSING (null)'}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500">Measured μ_max</div>
                  <div className="font-bold text-slate-900">
                    {novelProfile.researcherSuppliedMuMax !== null
                      ? `${novelProfile.researcherSuppliedMuMax} h⁻¹`
                      : 'MISSING (null)'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 cols: Mandatory 4-Part Pre-Modelling Human Approval Checklist */}
          <div className="lg:col-span-5 border border-slate-200 p-4 bg-white space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-500">
                    SCIENTIFIC SAFEGUARD · PRE-MODELLING GATE
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Mandatory 4-Point Researcher Sign-Off
                  </h4>
                </div>
                <span
                  className={`px-2 py-0.5 text-[11px] font-mono font-bold border ${
                    allFourResearcherGatesApproved
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-900 border-amber-300'
                  }`}
                >
                  {
                    [
                      researcherApprovals.molecularIdentityApproved,
                      researcherApprovals.expressionHostApproved,
                      researcherApprovals.literatureReferencesApproved,
                      researcherApprovals.experimentalParametersApproved,
                    ].filter(Boolean).length
                  }
                  /4 Verified
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  {
                    key: 'molecularIdentityApproved' as const,
                    label: '1. Approve Molecular Identity & Construct Sequence',
                    sub: `Confirms ${novelProfile.proteinName} (${novelProfile.molecularWeightKda} kDa, ${novelProfile.ptmAndGlycosylationRequirement}).`,
                    disabled: false,
                  },
                  {
                    key: 'expressionHostApproved' as const,
                    label: '2. Approve Expression Host Selection',
                    sub:
                      novelProfile.proposedExpressionHost ===
                      'Unassigned — Requires Human Host Selection'
                        ? 'BLOCKED: Select an expression host first (bioREACT never auto-assigns a host).'
                        : `Confirms ${novelProfile.proposedExpressionHost} as the target biological system.`,
                    disabled:
                      novelProfile.proposedExpressionHost ===
                      'Unassigned — Requires Human Host Selection',
                  },
                  {
                    key: 'literatureReferencesApproved' as const,
                    label: '3. Approve Literature Provenance & Prior Boundaries',
                    sub: 'Confirms source-level provenance and acknowledges unverified assumptions.',
                    disabled: false,
                  },
                  {
                    key: 'experimentalParametersApproved' as const,
                    label: '4. Approve Experimentally Measured Parameters (q_p, q_O2, μ_max)',
                    sub:
                      novelProfile.researcherSuppliedQp === null ||
                      novelProfile.researcherSuppliedQO2 === null ||
                      novelProfile.researcherSuppliedMuMax === null
                        ? 'BLOCKED: Missing empirical parameters (q_p, q_O2, or μ_max). Upload CSV dataset above first.'
                        : `Verified: q_p=${novelProfile.researcherSuppliedQp}, q_O2=${novelProfile.researcherSuppliedQO2}, μ_max=${novelProfile.researcherSuppliedMuMax}.`,
                    disabled:
                      novelProfile.researcherSuppliedQp === null ||
                      novelProfile.researcherSuppliedQO2 === null ||
                      novelProfile.researcherSuppliedMuMax === null,
                  },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-start gap-2.5 p-2.5 border transition-colors ${
                      item.disabled
                        ? 'bg-rose-50/50 border-rose-200 opacity-80 cursor-not-allowed'
                        : researcherApprovals[item.key]
                        ? 'bg-emerald-50/60 border-emerald-300 cursor-pointer'
                        : 'bg-slate-50 border-slate-200 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={item.disabled}
                      checked={researcherApprovals[item.key]}
                      onChange={(e) =>
                        onUpdateResearcherApprovals({
                          ...researcherApprovals,
                          [item.key]: e.target.checked,
                          approvedTimestamp: new Date().toISOString(),
                        })
                      }
                      className="mt-0.5 accent-emerald-700"
                    />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{item.label}</div>
                      <div className="text-[11px] font-mono text-slate-600">{item.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
              {!allFourResearcherGatesApproved ? (
                <div className="p-2.5 bg-amber-50 border border-amber-300 font-mono text-[11px] text-amber-950">
                  <strong>Quantitative Modelling Locked:</strong> Until all 4 checkpoints above are
                  approved with measured data, bioREACT labels this candidate{' '}
                  <strong>&ldquo;Insufficient data for quantitative optimisation&rdquo;</strong> and
                  abstains from claiming manufacturability.
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 font-mono text-[11px] text-emerald-950">
                  <strong>4/4 Pre-Modelling Checkpoints Verified:</strong> Candidate parameters and
                  host ({novelProfile.proposedExpressionHost}) signed off by{' '}
                  {researcherApprovals.approverName}.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
