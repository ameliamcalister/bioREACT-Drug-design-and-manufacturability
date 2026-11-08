import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  HelpCircle,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  XCircle,
} from 'lucide-react';
import {
  BiologicCandidate,
  CandidatePathwayMode,
  DownstreamCogsResult,
  GroundedSimulatorParams,
  HumanSafetyGate,
  MassBalanceAndPhysicsResult,
  NovelProteinDissertationProfile,
  NovelProteinEvaluationResult,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import { DEFAULT_STR_PHYSICS, FEASIBLE_500L_STR_PHYSICS } from '../data/bioprocessData';
import { formatCogsHeadline, formatTwoSigFigs } from '../services/bioprocessEngine';

interface ManufacturingRouteGatePanelProps {
  candidatePathwayMode: CandidatePathwayMode;
  onChangePathwayMode: (mode: CandidatePathwayMode) => void;
  candidate: BiologicCandidate;
  groundedParams: GroundedSimulatorParams;
  onUpdateGroundedParams: (next: GroundedSimulatorParams) => void;
  strParams: StirredTankPhysicsParams;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  physics: MassBalanceAndPhysicsResult;
  downstreamCogs: DownstreamCogsResult;
  novelProfile: NovelProteinDissertationProfile;
  novelEvaluation: NovelProteinEvaluationResult;
  safetyGates: HumanSafetyGate[];
  onApproveGate2AfterEngineeringFix: () => void;
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

export const ManufacturingRouteGatePanel: React.FC<ManufacturingRouteGatePanelProps> = ({
  candidatePathwayMode,
  onChangePathwayMode,
  candidate,
  groundedParams,
  onUpdateGroundedParams,
  strParams,
  onUpdateStrParams,
  physics,
  downstreamCogs,
  novelProfile,
  novelEvaluation,
  safetyGates,
  onApproveGate2AfterEngineeringFix,
  onNavigateToSection,
}) => {
  const oxygenDeficit = Math.max(0, physics.ourMmolPerLHour - physics.otrMmolPerLHour);
  const isOxygenInfeasible = physics.otrMmolPerLHour < physics.ourMmolPerLHour;
  const isExtremeNoSolution =
    strParams.targetVcdE6PerMl >= 80 && groundedParams.qO2Specific >= 0.42;

  const gate2 = safetyGates.find((g) => g.id === 'gate2_reactor');
  const gate4 = safetyGates.find((g) => g.id === 'gate4_protocol');

  // Determine the 3-way Epistemic Decision Outcome for the active candidate & operating point
  const currentDecisionOutcome: {
    outcomeType: 'PASS SCREENING' | 'INSUFFICIENT EVIDENCE' | 'FAIL CONSTRAINT';
    badgeColor: string;
    meaning: string;
    agentAction: string;
  } =
    candidatePathwayMode === 'small_molecule_chemical'
      ? {
          outcomeType: 'INSUFFICIENT EVIDENCE',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          meaning:
            'Docked small molecule (Round 3 Biphenyl Sulfonamide, −10.82 kcal/mol, SA = 2.34) passes computational binding & 3-step synthesisability filters, but requires chemical process development — NOT a cell-culture bioreactor.',
          agentAction:
            'Route to Chemical Production Assessment. Refuse & block CHO perfusion bioreactor simulation. Request wet-lab chemical synthesis, solubility, IC50, and off-target toxicity testing.',
        }
      : candidatePathwayMode === 'novel_dissertation_protein' &&
        novelEvaluation.abstainsFromOptimisationClaim
      ? {
          outcomeType: 'INSUFFICIENT EVIDENCE',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          meaning: `Important biological and kinetic characteristics remain unknown (${novelEvaluation.missingParametersList.join(', ') || 'non-CHO expression host'}).`,
          agentAction: `Abstain from CHO perfusion Bayesian optimisation. Route to ${novelEvaluation.recommendedExpressionRoute} and request shake-flask / Ambr® 15 parameter characterisation.`,
        }
      : !physics.isScaleUpFeasible || isOxygenInfeasible
      ? {
          outcomeType: 'FAIL CONSTRAINT',
          badgeColor: 'bg-rose-100 text-rose-900 border-rose-400',
          meaning: isExtremeNoSolution
            ? 'No feasible solution identified within the evaluated model and parameter bounds (extreme cellular oxygen demand exceeds shear-safe mass transfer ceiling).'
            : `Violates hard engineering constraint at ${strParams.workingVolumeL} L: OTR (${physics.otrMmolPerLHour.toFixed(1)} mmol/L/h) < OUR (${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h), Oxygen deficit = ${oxygenDeficit.toFixed(1)} mmol/L/h.`,
          agentAction:
            'Reject present operating point and block Safety Gates 02 & 04. Evaluate candidate engineering modifications across oxygen, shear, mixing, foaming, and cost before requesting human engineer review.',
        }
      : {
          outcomeType: 'PASS SCREENING',
          badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-400',
          meaning: `Meets explicitly tested computational mass-balance & hydrodynamic criteria at ${strParams.workingVolumeL} L (OTR ${physics.otrMmolPerLHour.toFixed(1)} ≥ OUR ${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h, τ = ${physics.estimatedShearStressPa.toFixed(2)} Pa ≤ ${groundedParams.shearThresholdPa} Pa, t_m ~${formatTwoSigFigs(physics.mixingTimeGassedS)} s ≤ 60 s).`,
          agentAction:
            'Proceed to next human engineering review checkpoint. Do not equate computational model pass with confirmed clinical efficacy or real-world manufacturing validation.',
        };

  return (
    <div className="bg-white border border-slate-200 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-teal-700 font-semibold">
            PRE-SCREENING DECISION GATE · MANUFACTURING ROUTE &amp; PHYSICAL FEASIBILITY TRIAGE
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
            Manufacturing Route Selection, Epistemic Abstention &amp; 500 L Oxygen-Balance Gate
          </h2>
          <p className="text-xs text-slate-600 mt-1 max-w-4xl">
            Every drug needs a scalable manufacturing process, but <strong>not every drug needs a bioreactor</strong>,
            and <strong>not every bioreactor operating point is physically feasible</strong>. Before screening
            reactors or running surrogate optimisation, <strong>bioREACT</strong> classifies the candidate&apos;s
            production route and checks hard mass-balance constraints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span
            className={`px-3 py-1.5 text-xs font-mono font-bold border ${currentDecisionOutcome.badgeColor}`}
          >
            AGENT VERDICT: {currentDecisionOutcome.outcomeType}
          </span>
        </div>
      </div>

      {/* STEP 1: Three Contrasting Manufacturing Pathways Selector (Judge Live Demo Switcher) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-mono font-semibold text-slate-800 uppercase">
            1. Select Candidate Modality to Test Manufacturing Route &amp; Agent Boundaries:
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Click any of the 3 contrasting cases below to demonstrate how bioREACT routes or abstains
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pathway Card 1: Monoclonal Antibody (Needs Bioreactor = YES) */}
          <button
            type="button"
            onClick={() => onChangePathwayMode('established_biologic')}
            className={`text-left p-4 border transition-all cursor-pointer flex flex-col justify-between ${
              candidatePathwayMode === 'established_biologic'
                ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="font-bold text-blue-800">PATHWAY A · RECOMBINANT mAb</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-semibold">
                  Needs Bioreactor: YES
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1.5">
                {candidate.genericName} ({candidate.brandName}) — 145.5 kDa IgG1
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Requires mammalian CHO-K1 suspension culture for conserved Asn-297 Fc N-glycosylation
                and heterotetrameric disulfide assembly.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-[11px] font-mono text-slate-700 flex items-center justify-between">
              <span>Route: Biological Production (CHO)</span>
              <span className="text-blue-700 font-semibold">Screen 6 Bioreactors →</span>
            </div>
          </button>

          {/* Pathway Card 2: Recombinant Protein / Peptide (Needs Bioreactor = DEPENDS) */}
          <button
            type="button"
            onClick={() => onChangePathwayMode('novel_dissertation_protein')}
            className={`text-left p-4 border transition-all cursor-pointer flex flex-col justify-between ${
              candidatePathwayMode === 'novel_dissertation_protein'
                ? 'border-teal-600 bg-teal-50/40 ring-1 ring-teal-600'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="font-bold text-teal-800">PATHWAY B · NOVEL PROTEIN / PEPTIDE</span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-semibold">
                  Needs Bioreactor: DEPENDS
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1.5">
                {novelProfile.proteinName} ({novelProfile.molecularWeightKda} kDa)
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Could require microbial fermentation (<em>Pichia</em> / <em>E. coli</em>), mammalian
                culture, or peptide synthesis depending on PTM &amp; folding needs.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-[11px] font-mono text-slate-700 flex items-center justify-between">
              <span>Route: Host &amp; Evidence Triage</span>
              <span className="text-teal-700 font-semibold">Abstain if Missing Data →</span>
            </div>
          </button>

          {/* Pathway Card 3: Synthetic Small Molecule from Docking (Needs Bioreactor = NO) */}
          <button
            type="button"
            onClick={() => onChangePathwayMode('small_molecule_chemical')}
            className={`text-left p-4 border transition-all cursor-pointer flex flex-col justify-between ${
              candidatePathwayMode === 'small_molecule_chemical'
                ? 'border-amber-600 bg-amber-50/50 ring-1 ring-amber-600'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="font-bold text-amber-900">PATHWAY C · SMALL-MOLECULE LIGAND</span>
                <span className="px-2 py-0.5 bg-rose-100 text-rose-900 font-semibold">
                  Needs Bioreactor: NO
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1.5">
                Docked MRP1 (ABCC1) Biphenyl Sulfonamide (MW 412 Da)
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Discovered via AutoDock Vina against MRP1 (−10.82 kcal/mol vs MK-571 −9.10 kcal/mol). Manufactured via 3-step organic
                chemical synthesis &amp; crystallisation—not cell culture.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-[11px] font-mono text-slate-700 flex items-center justify-between">
              <span>Route: Chemical Synthesis</span>
              <span className="text-rose-700 font-semibold">Block CHO Simulator →</span>
            </div>
          </button>
        </div>
      </div>

      {/* Conditional Panel when Small-Molecule Chemical Pathway is selected */}
      {candidatePathwayMode === 'small_molecule_chemical' && (
        <div className="p-5 bg-amber-50/90 border-2 border-amber-500 space-y-4 text-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-amber-200 pb-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div>
                <div className="font-mono font-bold uppercase text-amber-950">
                  BIOREACTOR WORKFLOW BLOCKED — CANDIDATE ROUTED TO CHEMICAL SYNTHESIS ASSESSMENT
                </div>
                <p className="text-amber-900 mt-0.5">
                  <strong>bioREACT</strong> correctly refuses to send the small-molecule MRP1 (ABCC1) biphenyl sulfonamide ligand
                  into the CHO mammalian bioreactor simulator. Small molecules are manufactured by organic
                  synthesis, reaction workup, and crystallisation.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToSection('dissertation_3d')}
              className="px-3.5 py-2 text-xs font-mono font-semibold bg-slate-900 text-white hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              Inspect 3D Docking &amp; Synthesis Critics →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-white border border-amber-200 space-y-1">
              <div className="font-mono font-semibold text-slate-900">
                1. What the Docking &amp; Critics Tested (Pass Screening)
              </div>
              <p className="text-slate-600">
                AutoDock Vina binding pose (<span className="font-mono">−10.82 kcal/mol</span> vs MK-571{' '}
                <span className="font-mono">−9.25 kcal/mol</span>), RDKit SA score (<span className="font-mono">2.34</span>),
                0 chiral centres, and a 3-step Suzuki + sulfonamide synthetic route (£1–10/g estimated API
                starting material cost).
              </p>
            </div>
            <div className="p-3 bg-white border border-amber-200 space-y-1">
              <div className="font-mono font-semibold text-amber-900">
                2. What Docking Does NOT Prove (Insufficient Evidence)
              </div>
              <p className="text-slate-600">
                A favourable docking score or SA score is <strong>not proof</strong> of actual biological
                inhibition, aqueous solubility, metabolic stability, absence of off-target toxicity, or
                successful scale-up crystallisation purity.
              </p>
            </div>
            <div className="p-3 bg-white border border-amber-200 space-y-1">
              <div className="font-mono font-semibold text-rose-800">
                3. Scope Limitation Reported by bioREACT
              </div>
              <p className="text-slate-600">
                No validated continuous-flow or batch chemical reactor kinetic simulator (e.g. palladium
                catalyst poisoning, impurity purging, solvent recovery) is active in this mammalian
                bioprocess workbench. Next step: wet-lab 3-step synthesis &amp; SPR/IC50 assay.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: 500 L Oxygen-Transfer Feasibility Check & Multi-Constraint Engineering Trade-Off Console */}
      {candidatePathwayMode !== 'small_molecule_chemical' && (
        <div
          className={`p-5 border-2 space-y-4 ${
            isOxygenInfeasible || !physics.isScaleUpFeasible
              ? 'bg-rose-50/70 border-rose-500'
              : 'bg-emerald-50/40 border-emerald-500'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-start gap-2.5">
              {isOxygenInfeasible || !physics.isScaleUpFeasible ? (
                <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900">
                  2. {strParams.workingVolumeL} L OXYGEN-TRANSFER &amp; MULTI-CONSTRAINT FEASIBILITY CHECK (
                  {strParams.spargerType === 'sintered_microsparger'
                    ? 'SINTERED MICROSPARGER ACTIVE'
                    : 'OPEN-PIPE SPARGER BASELINE'}
                  )
                </div>
                <p className="text-xs text-slate-700 mt-0.5">
                  {isExtremeNoSolution ? (
                    <strong className="text-rose-800 font-mono">
                      NO FEASIBLE SOLUTION IDENTIFIED WITHIN THE EVALUATED MODEL AND PARAMETER BOUNDS:
                      Cellular oxygen demand (OUR = {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h) exceeds
                      maximum shear-safe oxygen transfer capacity.
                    </strong>
                  ) : isOxygenInfeasible ? (
                    <>
                      Under present conditions (<span className="font-mono">{strParams.workingVolumeL} L</span>,{' '}
                      <span className="font-mono">
                        {strParams.spargerType === 'sintered_microsparger'
                          ? 'microsparger'
                          : 'open-pipe sparger'}
                      </span>
                      , <span className="font-mono">{strParams.targetVcdE6PerMl}×10⁶ cells/mL</span>),{' '}
                      <strong className="text-rose-800 font-mono">
                        OTR = {physics.otrMmolPerLHour.toFixed(1)} mmol/L/h &lt; OUR ={' '}
                        {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h (Oxygen deficit:{' '}
                        {oxygenDeficit.toFixed(1)} mmol/L/h)
                      </strong>
                      . <strong>bioREACT</strong> rejects this operating point and blocks approval at Gates
                      02 &amp; 04.
                    </>
                  ) : (
                    <>
                      All modelled constraints satisfied at{' '}
                      <span className="font-mono">{strParams.workingVolumeL} L</span>:{' '}
                      <strong className="text-emerald-800 font-mono">
                        OTR = {physics.otrMmolPerLHour.toFixed(1)} mmol/L/h ≥ OUR ={' '}
                        {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h (Margin: +
                        {physics.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h)
                      </strong>
                      . Requires human Bioprocess Engineer sign-off at Gate 02 before experimental testing.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isOxygenInfeasible &&
                physics.isScaleUpFeasible &&
                gate2 &&
                gate2.status !== 'Approved' && (
                  <button
                    type="button"
                    onClick={onApproveGate2AfterEngineeringFix}
                    className="px-3.5 py-2 text-xs font-mono font-semibold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    Bioprocess Engineer: Approve Redesigned 500 L Point (Gate 2)
                  </button>
                )}
            </div>
          </div>

          {/* 6 Simultaneous Constraint Telemetry Cards (OTR, OUR, Deficit, Shear, Mixing, COGS) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs tabular-nums">
            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">OXYGEN AVAILABLE (OTR)</span>
              <span className="text-base font-bold text-blue-700">
                {physics.otrMmolPerLHour.toFixed(1)}
              </span>
              <span className="text-[11px] text-slate-500 block">
                mmol/L/h (kLa={physics.klaPerHour.toFixed(1)} h⁻¹)
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">OXYGEN REQUIRED (OUR)</span>
              <span className="text-base font-bold text-slate-900">
                {physics.ourMmolPerLHour.toFixed(1)}
              </span>
              <span className="text-[11px] text-slate-500 block">
                mmol/L/h ({strParams.targetVcdE6PerMl}×10⁶/mL)
              </span>
            </div>

            <div
              className={`p-3 border ${
                isOxygenInfeasible
                  ? 'bg-rose-100/80 border-rose-400 text-rose-950'
                  : 'bg-emerald-100/70 border-emerald-400 text-emerald-950'
              }`}
            >
              <span className="text-[10px] font-semibold block">
                {isOxygenInfeasible ? 'OXYGEN DEFICIT' : 'NET OXYGEN MARGIN'}
              </span>
              <span className="text-base font-bold">
                {isOxygenInfeasible
                  ? `−${oxygenDeficit.toFixed(1)}`
                  : `+${physics.oxygenMarginMmolPerLHour.toFixed(1)}`}
              </span>
              <span className="text-[11px] block">
                {isOxygenInfeasible ? 'FAIL (OTR < OUR)' : 'PASS (OTR ≥ OUR)'}
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">HYDRODYNAMIC SHEAR τ</span>
              <span
                className={`text-base font-bold ${
                  physics.estimatedShearStressPa <= groundedParams.shearThresholdPa
                    ? 'text-slate-900'
                    : 'text-rose-700'
                }`}
              >
                {physics.estimatedShearStressPa.toFixed(2)} Pa
              </span>
              <span className="text-[11px] text-slate-500 block">
                Limit ≤ {groundedParams.shearThresholdPa.toFixed(2)} Pa
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">GASSED MIXING TIME t_m</span>
              <span
                className={`text-base font-bold ${
                  !physics.isMixingRateLimiting ? 'text-slate-900' : 'text-rose-700'
                }`}
              >
                ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s
              </span>
              <span className="text-[11px] text-slate-500 block">Limit ≤ 60 s (Einsele 1978, Nienow 1997)</span>
            </div>

            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">POWER &amp; DRUG COGS</span>
              <span className="text-base font-bold text-slate-900">
                {formatCogsHeadline(downstreamCogs.cogsPerGramUsd)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                order-of-magnitude, synthetic cost basis (P/V ~{formatTwoSigFigs(physics.specificPowerWPerM3)} W/m³)
              </span>
            </div>
          </div>

          {/* Interactive Engineering Modification Scenarios (Recalculates OTR, Shear, Mixing, Foaming, Cost Together) */}
          <div className="pt-2 space-y-2.5">
            <div className="text-xs font-mono font-semibold text-slate-800">
               TEST ENGINEERING INTERVENTIONS (RECALCULATES OXYGEN, SHEAR, MIXING, FOAMING &amp; COST TOGETHER):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Scenario 1: Unmodified 500 L Open-Pipe Deficit (OTR = 3.2 vs OUR = 13.9) */}
              <button
                type="button"
                onClick={() => {
                  onUpdateGroundedParams({
                    ...groundedParams,
                    qO2Specific: 0.32,
                  });
                  onUpdateStrParams(DEFAULT_STR_PHYSICS);
                }}
                className={`text-left p-3 border transition-colors cursor-pointer ${
                  strParams.spargerType === 'open_pipe' &&
                  strParams.targetVcdE6PerMl === 43.5 &&
                  !isExtremeNoSolution
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                <div className="font-mono font-bold text-[11px] text-rose-500">
                  SCENARIO 1 · UNMODIFIED 500 L BASELINE
                </div>
                <div className="font-semibold mt-0.5">
                  Open-Pipe Sparger (OTR 3.2 vs OUR 13.9)
                </div>
                <p className="text-[11px] opacity-80 mt-1">
                  Fails oxygen balance by −10.7 mmol/L/h. Automatically rejects &amp; blocks Gates 02 &amp; 04.
                </p>
              </button>

              {/* Scenario 2: Sintered Microsparger + 60% O2 Enrichment Redesign */}
              <button
                type="button"
                onClick={() => {
                  onUpdateGroundedParams({
                    ...groundedParams,
                    qO2Specific: 0.32,
                  });
                  onUpdateStrParams(FEASIBLE_500L_STR_PHYSICS);
                }}
                className={`text-left p-3 border transition-colors cursor-pointer ${
                  strParams.spargerType === 'sintered_microsparger' &&
                  strParams.targetVcdE6PerMl === 43.5
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                <div className="font-mono font-bold text-[11px] text-emerald-500">
                  SCENARIO 2 · MICROSPARGER + 60% O₂ FIX
                </div>
                <div className="font-semibold mt-0.5">
                  15 μm Sintered Frit + 120 rpm (OTR 18.6 ≥ OUR 13.9)
                </div>
                <p className="text-[11px] opacity-80 mt-1">
                  Raises kLa (6.6 → 35.1 h⁻¹) while keeping τ = 0.72 Pa &lt; 1.65 Pa and t_m = 34.8 s.
                </p>
              </button>

              {/* Scenario 3: Lower Cell Density via Higher Bleed on Open-Pipe Sparger */}
              <button
                type="button"
                onClick={() => {
                  onUpdateGroundedParams({
                    ...groundedParams,
                    qO2Specific: 0.32,
                  });
                  onUpdateStrParams({
                    ...DEFAULT_STR_PHYSICS,
                    targetVcdE6PerMl: 9.5,
                    spargerType: 'open_pipe',
                  });
                }}
                className={`text-left p-3 border transition-colors cursor-pointer ${
                  strParams.spargerType === 'open_pipe' && strParams.targetVcdE6PerMl === 9.5
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                <div className="font-mono font-bold text-[11px] text-amber-500">
                  SCENARIO 3 · LOWER VCD (9.5×10⁶/mL)
                </div>
                <div className="font-semibold mt-0.5">
                  Open-Pipe Sparger + High Bleed (OTR 3.2 ≥ OUR 3.0)
                </div>
                <p className="text-[11px] opacity-80 mt-1">
                  Satisfies O₂ balance without hardware change, but cuts productivity by 78%.
                </p>
              </button>

              {/* Scenario 4: Extreme Demand -> "No feasible solution identified..." */}
              <button
                type="button"
                onClick={() => {
                  onUpdateGroundedParams({
                    ...groundedParams,
                    qO2Specific: 0.48,
                  });
                  onUpdateStrParams({
                    ...FEASIBLE_500L_STR_PHYSICS,
                    targetVcdE6PerMl: 95.0,
                    stirrerSpeedRpm: 165,
                  });
                }}
                className={`text-left p-3 border transition-colors cursor-pointer ${
                  isExtremeNoSolution
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                <div className="font-mono font-bold text-[11px] text-rose-500">
                  SCENARIO 4 · NO FEASIBLE SOLUTION
                </div>
                <div className="font-semibold mt-0.5">
                  95×10⁶ cells/mL &amp; q_O2 = 0.48 (OUR = 45.6)
                </div>
                <p className="text-[11px] opacity-80 mt-1">
                  Demonstrates agent abstention when no feasible operating point exists in bounds.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Three-Outcome Decision Taxonomy Table (Pass Screening vs Insufficient Evidence vs Fail Constraint) */}
      <div className="border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 text-xs">
        <div className="font-mono font-semibold text-slate-800 uppercase text-[11px]">
          3. Epistemic Decision Taxonomy Enforced Across All <span className="normal-case">bioREACT</span> Modules:
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            className={`p-3 bg-white border ${
              currentDecisionOutcome.outcomeType === 'PASS SCREENING'
                ? 'border-emerald-500 ring-1 ring-emerald-500'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between font-mono font-bold text-emerald-800">
              <span>1. PASS SCREENING</span>
              {currentDecisionOutcome.outcomeType === 'PASS SCREENING' && (
                <span className="text-[10px] uppercase">[ACTIVE NOW]</span>
              )}
            </div>
            <p className="text-slate-600 mt-1">
              <strong>Meaning:</strong> Meets the explicitly tested computational mass-balance, shear, or
              medicinal-chemistry criteria.
            </p>
            <p className="text-slate-800 font-medium mt-1">
              <strong>Agent Action:</strong> Proceed to next human review gate (never equate computational
              pass with confirmed clinical efficacy or real-world manufacturability).
            </p>
          </div>

          <div
            className={`p-3 bg-white border ${
              currentDecisionOutcome.outcomeType === 'INSUFFICIENT EVIDENCE'
                ? 'border-amber-500 ring-1 ring-amber-500'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between font-mono font-bold text-amber-800">
              <span>2. INSUFFICIENT EVIDENCE</span>
              {currentDecisionOutcome.outcomeType === 'INSUFFICIENT EVIDENCE' && (
                <span className="text-[10px] uppercase">[ACTIVE NOW]</span>
              )}
            </div>
            <p className="text-slate-600 mt-1">
              <strong>Meaning:</strong> Important characteristics remain unknown, or candidate belongs to a
              different manufacturing domain (e.g. small molecule or uncharacterised host).
            </p>
            <p className="text-slate-800 font-medium mt-1">
              <strong>Agent Action:</strong> Abstain from claiming an optimal process and request specific
              wet-lab characterisation experiments.
            </p>
          </div>

          <div
            className={`p-3 bg-white border ${
              currentDecisionOutcome.outcomeType === 'FAIL CONSTRAINT'
                ? 'border-rose-500 ring-1 ring-rose-500'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between font-mono font-bold text-rose-800">
              <span>3. FAIL CONSTRAINT</span>
              {currentDecisionOutcome.outcomeType === 'FAIL CONSTRAINT' && (
                <span className="text-[10px] uppercase">[ACTIVE NOW]</span>
              )}
            </div>
            <p className="text-slate-600 mt-1">
              <strong>Meaning:</strong> Violates a specified hard constraint (e.g. 500 L OTR = 3.2 &lt; OUR
              = 13.9 mmol/L/h, or τ &gt; τ_crit).
            </p>
            <p className="text-slate-800 font-medium mt-1">
              <strong>Agent Action:</strong> Reject proposal, block safety gate sign-off, and evaluate
              multi-constraint engineering modifications. Failure in one model does not mean the drug is
              fundamentally impossible—only that the current operating assumptions are unsuitable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
