import React, { useMemo, useState } from 'react';
import {
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  HumanSafetyGate,
  ImpellerType,
  MassBalanceAndPhysicsResult,
  SafetyGateId,
  SafetyGateStatus,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  formatTwoSigFigs,
  solveMassBalanceAndReactorPhysics,
} from '../services/bioprocessEngine';
import {
  DEFAULT_STR_PHYSICS,
  IMPELLER_GEOMETRY_SPECS,
} from '../data/bioprocessData';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
} from 'lucide-react';

interface ResolveOxygenLimitationPanelProps {
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  groundedParams: GroundedSimulatorParams;
  physics: MassBalanceAndPhysicsResult;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  safetyGates?: HumanSafetyGate[];
  onUpdateSafetyGate?: (
    gateId: SafetyGateId,
    status: SafetyGateStatus,
    reviewerName: string,
    justification: string
  ) => void;
}

interface AgentAlternativeProposal {
  id: string;
  title: string;
  strategyBadge: string;
  hardwareChangeSummary: string;
  proposedParams: StirredTankPhysicsParams;
  engineeringRationale: string;
  tradeOffWarning: string;
}

export const ResolveOxygenLimitationPanel: React.FC<
  ResolveOxygenLimitationPanelProps
> = ({
  strParams,
  hfParams,
  groundedParams,
  physics,
  onUpdateStrParams,
  safetyGates = [],
  onUpdateSafetyGate,
}) => {
  const [stagedProposalId, setStagedProposalId] = useState<string>(
    'proposal_microsparger_60o2'
  );
  const [reviewerName, setReviewerName] = useState<string>(
    'Dr. E. Vance (Lead Bioprocess Engineer)'
  );
  const [reviewerNotes, setReviewerNotes] = useState<string>(
    'Verified OTR >= OUR closure, Kolmogorov eddy scale >= 18 um, and gassed mixing time <= 60 s at 500 L.'
  );
  const [humanReviewedProposalId, setHumanReviewedProposalId] = useState<
    string | null
  >(null);

  const isOtrDeficit = physics.otrMmolPerLHour < physics.ourMmolPerLHour;
  const oxygenDeficitMmolPerLHour = Math.max(
    0,
    physics.ourMmolPerLHour - physics.otrMmolPerLHour
  );
  const isOverallFeasible = physics.isScaleUpFeasible && !isOtrDeficit;

  const activeImpellerSpec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];
  const activeTurbulentNp0 =
    strParams.customTurbulentNp !== undefined &&
    Number.isFinite(strParams.customTurbulentNp)
      ? strParams.customTurbulentNp
      : activeImpellerSpec.defaultTurbulentNp0;

  const activeKlaMode = strParams.klaMode ?? 'calculated_vant_riet';
  const displayedAssumedKla =
    strParams.assumedKlaPerHour !== undefined &&
    Number.isFinite(strParams.assumedKlaPerHour)
      ? strParams.assumedKlaPerHour
      : physics.vantRietCalculatedKlaPerHour;

  // Check if any safety gates had prior simulated approvals recorded
  const previouslyApprovedGates = useMemo(
    () => safetyGates.filter((g) => g.status === 'Approved'),
    [safetyGates]
  );

  // Agent-proposed alternative operating conditions evaluated with the exact mechanistic solver
  const agentProposals: Array<{
    proposal: AgentAlternativeProposal;
    evaluatedPhysics: MassBalanceAndPhysicsResult;
  }> = useMemo(() => {
    const rawProposals: AgentAlternativeProposal[] = [
      {
        id: 'proposal_microsparger_60o2',
        title:
          'Option A — 15 μm Sintered Microsparger + 60% O₂ Enrichment (Maintain 43.5×10⁶ cells/mL)',
        strategyBadge: 'Hardware + Gas Enrichment (Preserves Titre)',
        hardwareChangeSummary:
          'Switch Open-Pipe → 15 μm Sintered Microsparger; N = 105 rpm; Sparge = 0.045 vvm; y_O2 = 60%; Dual Marine Impellers (Np,0 = 0.38)',
        proposedParams: {
          ...strParams,
          impellerType: 'marine_axial',
          impellerCount: 2,
          customTurbulentNp: 0.38,
          bafflingMode: 'standard_4_baffles',
          stirrerSpeedRpm: 105,
          spargeRateVvm: 0.045,
          oxygenEnrichmentFraction: 0.6,
          targetVcdE6PerMl: 43.5,
          spargerType: 'sintered_microsparger',
          klaMode: 'calculated_vant_riet',
        },
        engineeringRationale:
          'Fine 15 μm sintered pores raise specific gas–liquid interfacial area (a), increasing Van’t Riet kLa from ~9.3 h⁻¹ to ~36.4 h⁻¹ without requiring destructive impeller tip speeds.',
        tradeOffWarning:
          'Fine microsparger pores increase liquid-film burst foaming risk at the headspace; requires 15–30 ppm medical-grade simethicone antifoam and an open-pipe CO₂ sweep sparger.',
      },
      {
        id: 'proposal_open_pipe_bleed_derate',
        title:
          'Option B — Keep Open-Pipe Sparger + De-Rate VCD via Cell Bleed (10×10⁶ cells/mL, 80% O₂)',
        strategyBadge: 'No Sparger Retrofit (77% Productivity Penalty)',
        hardwareChangeSummary:
          'Retain Open-Pipe Sparger; Reduce X_v: 43.5 → 10.0×10⁶ cells/mL; N = 128 rpm; Sparge = 0.065 vvm; y_O2 = 80%; Dual Marine Impellers',
        proposedParams: {
          ...strParams,
          impellerType: 'marine_axial',
          impellerCount: 2,
          customTurbulentNp: 0.38,
          bafflingMode: 'standard_4_baffles',
          stirrerSpeedRpm: 128,
          spargeRateVvm: 0.065,
          oxygenEnrichmentFraction: 0.8,
          targetVcdE6PerMl: 10.0,
          spargerType: 'open_pipe',
          klaMode: 'calculated_vant_riet',
        },
        engineeringRationale:
          'If vessel hardware is locked to a conventional open-pipe ring sparger (kLa ≈ 7–11 h⁻¹), the only physically valid way to close OTR ≥ OUR is to lower oxygen demand (OUR = q_O2 · X_v) by increasing cell bleed rate and enriching sparge O₂ to 80%.',
        tradeOffWarning:
          'Severe economic trade-off: dropping target VCD from 43.5×10⁶ to 10.0×10⁶ cells/mL cuts volumetric mAb productivity by ~77% and increases media cost per gram (CSPR rises to ~235 pL/cell/day).',
      },
      {
        id: 'proposal_pbt_balanced',
        title:
          'Option C — Dual 4-Blade 45° Pitched-Blade Turbine + Microsparger + 52% O₂ (Rapid Mixing)',
        strategyBadge: 'Mixed Axial/Radial Pumping (t_m ~ 27 s)',
        hardwareChangeSummary:
          '4-Blade 45° PBT (Np,0 = 1.28); N = 82 rpm; Sparge = 0.045 vvm; y_O2 = 52%; 15 μm Sintered Microsparger; X_v = 40.0×10⁶ cells/mL',
        proposedParams: {
          ...strParams,
          impellerType: 'pitched_blade',
          impellerCount: 2,
          customTurbulentNp: 1.28,
          bafflingMode: 'standard_4_baffles',
          stirrerSpeedRpm: 82,
          spargeRateVvm: 0.045,
          oxygenEnrichmentFraction: 0.52,
          targetVcdE6PerMl: 40.0,
          spargerType: 'sintered_microsparger',
          klaMode: 'calculated_vant_riet',
        },
        engineeringRationale:
          'Uses a higher power-number 45° pitched-blade turbine (Np,0 = 1.28 vs 0.38) at lower rotational speed (82 rpm) to achieve higher gassed power input (P_g/V) and faster bulk macromixing while keeping trailing-vortex shear below 1.65 Pa.',
        tradeOffWarning:
          'Higher local trailing-vortex energy dissipation factor (Φ = 12.5× mean ε̄_T vs 6.5× for marine propeller) reduces the margin to the Kolmogorov eddy damage limit.',
      },
    ];

    return rawProposals.map((proposal) => ({
      proposal,
      evaluatedPhysics: solveMassBalanceAndReactorPhysics(
        proposal.proposedParams,
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      ),
    }));
  }, [strParams, hfParams, groundedParams]);

  const selectedStagedEntry =
    agentProposals.find((p) => p.proposal.id === stagedProposalId) ??
    agentProposals[0];

  const handleApplyStagedProposalAfterHumanReview = () => {
    if (!selectedStagedEntry) return;
    onUpdateStrParams(selectedStagedEntry.proposal.proposedParams);
    setHumanReviewedProposalId(selectedStagedEntry.proposal.id);
  };

  const handleSignOffFeasibleOperatingPoint = () => {
    if (!isOverallFeasible || !onUpdateSafetyGate) return;
    const cleanReviewer =
      reviewerName.trim() || 'Lead Bioprocess Engineer (Human Sign-Off)';
    const cleanJustification =
      reviewerNotes.trim() ||
      `Approved ${strParams.workingVolumeL} L scale-up after resolving oxygen balance: OTR (${physics.otrMmolPerLHour.toFixed(1)} mmol/L/h) >= OUR (${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h), shear τ = ${physics.estimatedShearStressPa.toFixed(2)} Pa <= ${groundedParams.shearThresholdPa} Pa.`;
    onUpdateSafetyGate(
      'gate2_reactor',
      'Approved',
      cleanReviewer,
      cleanJustification
    );
    onUpdateSafetyGate(
      'gate4_protocol',
      'Approved',
      cleanReviewer,
      cleanJustification
    );
  };

  const handleBlockAndRevokeInfeasibleGates = () => {
    if (!onUpdateSafetyGate) return;
    const lockMsg = `BLOCKED BY OXYGEN-DEFICIT INTERLOCK: OTR (${physics.otrMmolPerLHour.toFixed(1)} mmol/L/h) < OUR (${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h) at ${strParams.workingVolumeL} L. Cannot approve infeasible operating point.`;
    onUpdateSafetyGate(
      'gate2_reactor',
      'Changes Requested',
      reviewerName || 'Automated Physics Interlock',
      lockMsg
    );
    onUpdateSafetyGate(
      'gate4_protocol',
      'Changes Requested',
      reviewerName || 'Automated Physics Interlock',
      lockMsg
    );
  };

  return (
    <div
      id="resolve-oxygen-limitation-panel"
      className={`border-2 p-6 space-y-6 ${
        isOtrDeficit || !physics.isScaleUpFeasible
          ? 'bg-rose-50/40 border-rose-600'
          : 'bg-emerald-50/30 border-emerald-600'
      }`}
    >
      {/* 1. HEADER & CLEAR CONSTRAINT VIOLATION BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold uppercase ${
                isOtrDeficit
                  ? 'bg-rose-700 text-white'
                  : !physics.isScaleUpFeasible
                  ? 'bg-amber-600 text-white'
                  : 'bg-emerald-700 text-white'
              }`}
            >
              {isOtrDeficit ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    CONSTRAINT VIOLATION: OUR EXCEEDS OTR CAPACITY (−
                    {oxygenDeficitMmolPerLHour.toFixed(1)} mmol/L/h)
                  </span>
                </>
              ) : !physics.isScaleUpFeasible ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    O₂ CLOSED (+{physics.oxygenMarginMmolPerLHour.toFixed(1)}{' '}
                    mmol/L/h) · SECONDARY HYDRODYNAMIC CONSTRAINT ACTIVE
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    OXYGEN LIMITATION RESOLVED: OTR ≥ OUR (+
                    {physics.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h MARGIN)
                  </span>
                </>
              )}
            </span>
            <span className="px-2 py-0.5 text-[11px] font-mono bg-white border border-slate-300 text-slate-700">
              STAGE 03 / 04 · RESOLVE OXYGEN LIMITATION WORKBENCH
            </span>
          </div>

          <h3 className="text-lg font-semibold text-slate-900">
            Resolve Oxygen Limitation — Interactive Engineering Investigation,
            Trade-Off Analysis &amp; Human Gate Interlock
          </h3>
          <p className="text-xs text-slate-700 max-w-4xl leading-relaxed">
            Steady-state dissolved oxygen conservation requires{' '}
            <span className="font-mono font-semibold">
              OTR = k_La · (C*_O2 − C_L) ≥ OUR = q_O2 · X_v
            </span>
            . When cellular oxygen demand (<span className="font-mono">OUR</span>
            ) exceeds vessel mass-transfer capacity (
            <span className="font-mono">OTR</span>), dissolved oxygen collapses
            to zero within{' '}
            <span className="font-mono">
              1/k_La ≈ {formatTwoSigFigs(physics.oxygenTransferTimeConstantS)} s
            </span>
            , triggering anaerobic lactate spike, agalactosylated mAb glycoforms,
            and culture loss. Use the 6 engineering levers below or review an
            agent-proposed redesign.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUpdateStrParams(DEFAULT_STR_PHYSICS)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold bg-rose-700 text-white hover:bg-rose-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Failing 500 L Baseline (OTR 3.2 &lt; OUR 13.9)</span>
          </button>
        </div>
      </div>

      {/* 2. REAL-TIME MASS BALANCE, MIXING, SHEAR, POWER & FEASIBILITY TELEMETRY STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs tabular-nums">
        <div
          className={`p-3 border ${
            isOtrDeficit
              ? 'bg-rose-100/80 border-rose-400'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-600 uppercase">
            1. O₂ Balance (OTR vs OUR)
          </div>
          <div
            className={`text-sm font-bold mt-1 ${
              isOtrDeficit ? 'text-rose-800' : 'text-emerald-800'
            }`}
          >
            {physics.otrMmolPerLHour.toFixed(1)} vs{' '}
            {physics.ourMmolPerLHour.toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-700 mt-0.5">
            {isOtrDeficit
              ? `Deficit: −${oxygenDeficitMmolPerLHour.toFixed(1)} mmol/L/h`
              : `Margin: +${physics.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h`}
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200">
          <div className="text-[10px] text-slate-600 uppercase">
            2. Active k_La &amp; Driving Force
          </div>
          <div className="text-sm font-bold text-blue-800 mt-1">
            k_La = {physics.klaPerHour.toFixed(1)} h⁻¹
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            ΔC_O2 ={' '}
            {Math.max(
              0,
              physics.cStarO2MmolPerL - physics.cLiquidO2MmolPerL
            ).toFixed(3)}{' '}
            mmol/L (
            {physics.klaModeUsed === 'assumed_manual'
              ? 'Assumed'
              : "Van't Riet"}
            )
          </div>
        </div>

        <div
          className={`p-3 border ${
            physics.isMixingRateLimiting
              ? 'bg-amber-50 border-amber-400'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-600 uppercase">
            3. Gassed Mixing Time t_m
          </div>
          <div
            className={`text-sm font-bold mt-1 ${
              physics.isMixingRateLimiting ? 'text-amber-800' : 'text-slate-900'
            }`}
          >
            ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s (limit ≤ 60 s)
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            τ_O2 = 1/k_La ≈{' '}
            {formatTwoSigFigs(physics.oxygenTransferTimeConstantS)} s
          </div>
        </div>

        <div
          className={`p-3 border ${
            physics.estimatedShearStressPa > groundedParams.shearThresholdPa ||
            physics.kolmogorovScaleUm < 18
              ? 'bg-rose-50 border-rose-400'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-600 uppercase">
            4. Hydrodynamic Shear &amp; λ_K
          </div>
          <div
            className={`text-sm font-bold mt-1 ${
              physics.estimatedShearStressPa >
                groundedParams.shearThresholdPa ||
              physics.kolmogorovScaleUm < 18
                ? 'text-rose-800'
                : 'text-slate-900'
            }`}
          >
            τ = {physics.estimatedShearStressPa.toFixed(2)} Pa · λ_K ={' '}
            {physics.kolmogorovScaleUm.toFixed(1)} μm
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            Limits: τ ≤ {groundedParams.shearThresholdPa} Pa, λ_K ≥ 18 μm
          </div>
        </div>

        <div
          className={`p-3 border ${
            physics.isReynoldsOutOfRange
              ? 'bg-rose-50 border-rose-400'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-[10px] text-slate-600 uppercase">
            5. Specific Power (P_0 vs P_g)
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1">
            P_g/V = {physics.specificPowerWPerM3.toFixed(1)} W/m³
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            P_0/V = {physics.ungassedSpecificPowerWPerM3.toFixed(1)} W/m³ · Re ={' '}
            {physics.reynoldsNumber.toLocaleString()}
          </div>
        </div>

        <div
          className={`p-3 border ${
            isOverallFeasible
              ? 'bg-emerald-100/80 border-emerald-500'
              : 'bg-rose-100/80 border-rose-500'
          }`}
        >
          <div className="text-[10px] text-slate-700 uppercase">
            6. Scale-Up Gate Verdict
          </div>
          <div
            className={`text-sm font-bold mt-1 ${
              isOverallFeasible ? 'text-emerald-900' : 'text-rose-900'
            }`}
          >
            {isOverallFeasible ? 'FEASIBLE (UNLOCKED)' : 'INFEASIBLE (BLOCKED)'}
          </div>
          <div className="text-[10px] text-slate-700 mt-0.5">
            {physics.limitingFactors.length === 0
              ? 'All 5 physical bounds satisfied'
              : `${physics.limitingFactors.length} active constraint violation(s)`}
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE 6-PARAMETER ENGINEERING INVESTIGATION WORKBENCH + TRADE-OFF EXPLANATIONS */}
      <div className="bg-white border border-slate-200 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-blue-700 font-semibold uppercase flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>
                Interactive Engineering Variables to Investigate (Defined
                Physical Bounds &amp; Coupled Trade-Offs)
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Adjust any of the 6 reactor engineering parameters below to test
              whether oxygen transfer can be closed without violating shear,
              foaming, mixing, or Reynolds-number bounds.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Vessel Volume: {strParams.workingVolumeL} L (D_T ={' '}
            {physics.tankDiameterM.toFixed(2)} m, D_i ={' '}
            {physics.impellerDiameterM.toFixed(2)} m)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* CONTROL 1: Agitation Speed (RPM) */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="resolve-rpm"
                className="font-semibold text-slate-900"
              >
                1. Agitation Speed (<span className="font-mono">N</span>, RPM)
              </label>
              <span className="font-mono font-bold text-blue-800">
                {strParams.stirrerSpeedRpm} rpm (u_tip ={' '}
                {physics.tipSpeedMPerS.toFixed(2)} m/s)
              </span>
            </div>
            <input
              id="resolve-rpm"
              type="range"
              min={2}
              max={320}
              step={1}
              value={strParams.stirrerSpeedRpm}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  stirrerSpeedRpm: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>Bound Min: 2 rpm (Laminar / Out-of-Range)</span>
              <span>CHO Typical: 65–135 rpm</span>
              <span>Bound Max: 320 rpm</span>
            </div>
            <div className="text-[11px] text-slate-700 bg-white p-2.5 border border-slate-200 leading-snug">
              <strong className="font-mono text-slate-900">
                Mechanistic Effect &amp; Trade-Off:
              </strong>{' '}
              Increasing <span className="font-mono">N</span> raises impeller
              power <span className="font-mono">P_0 ∝ N³</span>, raising{' '}
              <span className="font-mono">
                k_La ∝ (P_g/V)^0.46
              </span>{' '}
              and shortening mixing time{' '}
              <span className="font-mono">t_m ∝ 1/N</span>.{' '}
              <strong className="text-rose-800">Trade-off:</strong> Local
              trailing-vortex dissipation{' '}
              <span className="font-mono">
                ε_T,max = {physics.localMaxEnergyDissipationWPerKg.toFixed(2)}{' '}
                W/kg
              </span>{' '}
              scales as <span className="font-mono">N³</span>; excessive RPM
              shrinks Kolmogorov microscale{' '}
              <span className="font-mono">
                λ_K ({physics.kolmogorovScaleUm.toFixed(1)} μm)
              </span>{' '}
              below CHO cell diameter (~15–18 μm) and breaches the shear ceiling
              (<span className="font-mono">τ ≤ {groundedParams.shearThresholdPa} Pa</span>
              ).
            </div>
          </div>

          {/* CONTROL 2: Aeration Rate (vvm) */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="resolve-vvm"
                className="font-semibold text-slate-900"
              >
                2. Aeration Sparge Rate (
                <span className="font-mono">Q_g / V</span>, vvm)
              </label>
              <span className="font-mono font-bold text-blue-800">
                {strParams.spargeRateVvm.toFixed(3)} vvm (v_s ={' '}
                {physics.superficialGasVelocityMPerS.toFixed(4)} m/s)
              </span>
            </div>
            <input
              id="resolve-vvm"
              type="range"
              min={0.01}
              max={0.115}
              step={0.005}
              value={strParams.spargeRateVvm}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  spargeRateVvm: parseFloat(e.target.value),
                })
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>Min: 0.010 vvm (CO₂ Accumulation &lt; 0.018)</span>
              <span>Optimal: 0.030–0.065 vvm</span>
              <span>Max: 0.115 vvm (Foaming)</span>
            </div>
            <div className="text-[11px] text-slate-700 bg-white p-2.5 border border-slate-200 leading-snug">
              <strong className="font-mono text-slate-900">
                Mechanistic Effect &amp; Trade-Off:
              </strong>{' '}
              Increasing sparge rate raises superficial gas velocity{' '}
              <span className="font-mono">v_s</span>, increasing{' '}
              <span className="font-mono">k_La ∝ v_s^0.42</span> and stripping
              dissolved metabolic <span className="font-mono">CO₂</span>.{' '}
              <strong className="text-rose-800">Trade-off:</strong> High{' '}
              <span className="font-mono">vvm</span> increases aeration flow
              number{' '}
              <span className="font-mono">
                Fl_g = {physics.aerationFlowNumberFlg.toFixed(4)}
              </span>
              , causing impeller gas-cavity flooding (gassed power drop{' '}
              <span className="font-mono">
                P_g/P_0 = {physics.gassingPowerFactorPgP0.toFixed(2)}
              </span>
              ), headspace foaming, and bubble-rupture cell death at the gas–liquid
              interface.
            </div>
          </div>

          {/* CONTROL 3: Gas Oxygen Fraction (y_O2) */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="resolve-yo2"
                className="font-semibold text-slate-900"
              >
                3. Gas Oxygen Mole Fraction (
                <span className="font-mono">y_O2</span>)
              </label>
              <span className="font-mono font-bold text-blue-800">
                {(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% O₂ (C* ={' '}
                {physics.cStarO2MmolPerL.toFixed(3)} mmol/L)
              </span>
            </div>
            <input
              id="resolve-yo2"
              type="range"
              min={0.21}
              max={1.0}
              step={0.01}
              value={strParams.oxygenEnrichmentFraction}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  oxygenEnrichmentFraction: parseFloat(e.target.value),
                })
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>Min: 21% O₂ (Atmospheric Air)</span>
              <span>Enriched: 50–70% O₂</span>
              <span>Max: 100% Pure O₂</span>
            </div>
            <div className="text-[11px] text-slate-700 bg-white p-2.5 border border-slate-200 leading-snug">
              <strong className="font-mono text-slate-900">
                Mechanistic Effect &amp; Trade-Off:
              </strong>{' '}
              By Henry&apos;s Law, enriching inlet gas from{' '}
              <span className="font-mono">21%</span> to{' '}
              <span className="font-mono">
                {(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% O₂
              </span>{' '}
              scales saturation solubility{' '}
              <span className="font-mono">
                C*_O2 = {physics.cStarO2MmolPerL.toFixed(3)} mmol/L
              </span>{' '}
              linearly without adding mechanical shear.{' '}
              <strong className="text-rose-800">Trade-off:</strong> On an
              open-pipe sparger (<span className="font-mono">k_La ≈ 9.3 h⁻¹</span>
              ), even <span className="font-mono">100% O₂</span> only reaches{' '}
              <span className="font-mono">OTR ≈ 8.9 mmol/L/h</span> (still below{' '}
              <span className="font-mono">OUR = 13.9 mmol/L/h</span>!), and{' '}
              <span className="font-mono">y_O2 &gt; 80%</span> risks local
              dissolved-O₂ hyperoxia (ROS oxidative stress on mAb Methionine
              residues).
            </div>
          </div>

          {/* CONTROL 4: kLa (Calculated via Van't Riet vs Assumed + Sparger Hardware) */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <span className="font-semibold text-slate-900">
                4. Volumetric Mass-Transfer Coefficient (
                <span className="font-mono">k_La</span>, Calculated vs. Assumed)
              </span>
              <span className="font-mono font-bold text-blue-800">
                Active k_La = {physics.klaPerHour.toFixed(1)} h⁻¹
              </span>
            </div>

            {/* Mode Toggle: Calculated Van't Riet vs User-Assumed kLa */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateStrParams({
                    ...strParams,
                    klaMode: 'calculated_vant_riet',
                  })
                }
                className={`px-2.5 py-1.5 text-left text-[11px] font-mono border cursor-pointer ${
                  activeKlaMode === 'calculated_vant_riet'
                    ? 'bg-blue-700 text-white border-blue-800 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <div>Calculated (Van&apos;t Riet 1979)</div>
                <div className="text-[10px] opacity-85">
                  k_La = {physics.vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹
                  from (P_g/V, v_s)
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateStrParams({
                    ...strParams,
                    klaMode: 'assumed_manual',
                    assumedKlaPerHour:
                      strParams.assumedKlaPerHour ??
                      Math.round(physics.vantRietCalculatedKlaPerHour),
                  })
                }
                className={`px-2.5 py-1.5 text-left text-[11px] font-mono border cursor-pointer ${
                  activeKlaMode === 'assumed_manual'
                    ? 'bg-amber-700 text-white border-amber-800 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <div>Assumed / Measured k_La Override</div>
                <div className="text-[10px] opacity-85">
                  Set direct k_La (2–180 h⁻¹)
                </div>
              </button>
            </div>

            {activeKlaMode === 'calculated_vant_riet' ? (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      spargerType: 'open_pipe',
                      klaMode: 'calculated_vant_riet',
                    })
                  }
                  className={`p-2 text-left border text-[11px] cursor-pointer ${
                    strParams.spargerType !== 'sintered_microsparger'
                      ? 'border-rose-600 bg-rose-50 font-semibold text-rose-950'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <div>Open-Pipe Sparger (α = 18.5)</div>
                  <div className="font-mono text-[10px] text-slate-600">
                    3–5 mm bubbles · low interfacial area
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      spargerType: 'sintered_microsparger',
                      klaMode: 'calculated_vant_riet',
                    })
                  }
                  className={`p-2 text-left border text-[11px] cursor-pointer ${
                    strParams.spargerType === 'sintered_microsparger'
                      ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-950'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <div>15 μm Sintered Microsparger (α = 96.0)</div>
                  <div className="font-mono text-[10px] text-slate-600">
                    Fine microbubbles · ~5.2× higher k_La
                  </div>
                </button>
              </div>
            ) : (
              <div className="pt-1 space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <label htmlFor="resolve-assumed-kla" className="text-amber-900 font-semibold">
                    Assumed Operating k_La: {displayedAssumedKla.toFixed(1)} h⁻¹
                  </label>
                  <span className="text-slate-600">
                    Van&apos;t Riet Predicts:{' '}
                    {physics.vantRietCalculatedKlaPerHour.toFixed(1)} h⁻¹
                  </span>
                </div>
                <input
                  id="resolve-assumed-kla"
                  type="range"
                  min={2}
                  max={180}
                  step={0.5}
                  value={displayedAssumedKla}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      klaMode: 'assumed_manual',
                      assumedKlaPerHour: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-600 cursor-pointer"
                />
                <div className="text-[10px] font-mono text-amber-900 bg-amber-50 border border-amber-300 px-2 py-1">
                  ⚠ ASSUMPTION FLAG: Direct k_La override decouples k_La from
                  Van&apos;t Riet&apos;s correlation. Requires wet-lab dynamic
                  gassing-out verification at {strParams.workingVolumeL} L.
                </div>
              </div>
            )}

            <div className="text-[11px] text-slate-700 bg-white p-2.5 border border-slate-200 leading-snug">
              <strong className="font-mono text-slate-900">
                Mechanistic Effect &amp; Trade-Off:
              </strong>{' '}
              <span className="font-mono">
                OTR = k_La · (C*_O2 − C_L)
              </span>
              . Switching from an open-pipe sparger to a{' '}
              <span className="font-mono">15 μm sintered microsparger</span> is
              the single highest-leverage hardware change because microbubbles
              dramatically increase specific interfacial area{' '}
              <span className="font-mono">a</span> without increasing impeller
              tip speed.{' '}
              <strong className="text-rose-800">Trade-off:</strong> Microbubbles
              promote stable protein foam and cell entrapment at the gas–liquid
              surface, requiring careful antifoam control (which itself can
              depress <span className="font-mono">k_La</span> by 15–30%).
            </div>
          </div>

          {/* CONTROL 5: Viable Cell Density (X_v) */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="resolve-vcd"
                className="font-semibold text-slate-900"
              >
                5. Viable Cell Density (<span className="font-mono">X_v</span>,
                Controlled via Cell Bleed)
              </label>
              <span className="font-mono font-bold text-blue-800">
                {strParams.targetVcdE6PerMl.toFixed(1)} × 10⁶ cells/mL (OUR ={' '}
                {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h)
              </span>
            </div>
            <input
              id="resolve-vcd"
              type="range"
              min={5}
              max={80}
              step={0.5}
              value={strParams.targetVcdE6PerMl}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  targetVcdE6PerMl: parseFloat(e.target.value),
                })
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>Min: 5×10⁶/mL</span>
              <span>
                Max Supported at Current OTR:{' '}
                {physics.maxSupportedVcdAtCurrentGasE6.toFixed(1)}×10⁶/mL
              </span>
              <span>Max: 80×10⁶/mL</span>
            </div>
            <div className="text-[11px] text-slate-700 bg-white p-2.5 border border-slate-200 leading-snug">
              <strong className="font-mono text-slate-900">
                Mechanistic Effect &amp; Trade-Off:
              </strong>{' '}
              Cellular oxygen uptake scales linearly with biomass:{' '}
              <span className="font-mono">
                OUR = q_O2 ({groundedParams.qO2Specific} pmol/cell/h) × X_v
              </span>
              . At current <span className="font-mono">OTR</span>, the maximum
              sustainable cell density is{' '}
              <span className="font-mono font-bold">
                {physics.maxSupportedVcdAtCurrentGasE6.toFixed(1)} × 10⁶
                cells/mL
              </span>{' '}
              (or{' '}
              <span className="font-mono">
                {physics.maxSupportedVcdOnAirE6.toFixed(1)} × 10⁶/mL
              </span>{' '}
              on air alone).{' '}
              <strong className="text-rose-800">Trade-off:</strong> Lowering{' '}
              <span className="font-mono">X_v</span> via higher cell bleed
              immediately reduces volumetric productivity{' '}
              <span className="font-mono">P_vol = q_p · X_v</span> proportionally.
            </div>
          </div>

          {/* CONTROL 6: Impeller Geometry & Power Number Np,0 */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                6. Impeller Geometry, Staging &amp; Reference{' '}
                <span className="font-mono">N_p,0</span>
              </span>
              <span className="font-mono font-bold text-blue-800">
                {activeImpellerSpec.shortLabel} · N_p,0 ={' '}
                {activeTurbulentNp0.toFixed(2)} ({strParams.impellerCount}×)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  'marine_axial',
                  'pitched_blade',
                  'rushton_radial',
                ] as ImpellerType[]
              ).map((impId) => {
                const spec = IMPELLER_GEOMETRY_SPECS[impId];
                const isSelected = strParams.impellerType === impId;
                return (
                  <button
                    key={impId}
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({
                        ...strParams,
                        impellerType: impId,
                        customTurbulentNp: spec.defaultTurbulentNp0,
                      })
                    }
                    className={`p-1.5 text-left border text-[11px] cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 font-semibold text-blue-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="truncate">{spec.shortLabel}</div>
                    <div className="font-mono text-[10px] text-slate-500">
                      N_p,0 = {spec.defaultTurbulentNp0.toFixed(2)} (
                      {spec.literatureTurbulentNpRange[0].toFixed(2)}–
                      {spec.literatureTurbulentNpRange[1].toFixed(2)})
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1">
                <input
                  aria-label="Impeller turbulent power number Np,0"
                  type="range"
                  min={activeImpellerSpec.literatureTurbulentNpRange[0]}
                  max={activeImpellerSpec.literatureTurbulentNpRange[1]}
                  step={0.01}
                  value={activeTurbulentNp0}
                  onChange={(e) =>
                    onUpdateStrParams({
                      ...strParams,
                      customTurbulentNp: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 shrink-0">
                {[1, 2, 3].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({ ...strParams, impellerCount: cnt })
                    }
                    className={`px-2 py-0.5 text-[10px] font-mono cursor-pointer ${
                      strParams.impellerCount === cnt
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-700'
                    }`}
                  >
                    {cnt} Imp ({cnt}×)
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-700 bg-white p-2.5 border border-slate-200 leading-snug">
              <strong className="font-mono text-slate-900">
                Mechanistic Effect &amp; Multi-Impeller Trade-Off:
              </strong>{' '}
              Single <span className="font-mono">N_p(Re) = {physics.reynoldsCorrectedSingleNp.toFixed(2)}</span>{' '}
              scales across <span className="font-mono">n = {physics.impellerCount}</span> stages to{' '}
              <span className="font-mono font-semibold text-blue-700">
                N_p,total,0 = {physics.ungassedPowerNumberTotalNp.toFixed(2)}
              </span>{' '}
              (<span className="font-mono">P_total,0 ≈ n·N_p·ρ·N³·D_i⁵</span> when <span className="font-mono">ΔC/D_i ≥ 1.5</span>).{' '}
              <strong className="text-rose-800">Trade-off:</strong> Staging 2 or 3 impellers increases{' '}
              <span className="font-mono">P_g/V</span> and <span className="font-mono">k_La</span>, but multiple radial Rushton turbines create separate circulation zones with poor axial exchange (zoning ×{physics.multiImpellerZoningFactor.toFixed(2)}; Vasconcelos et al., 1995), and crowding 3 impellers into a short tank (<span className="font-mono">S_top/D_i = {physics.topImpellerSubmergenceRatioStopDi.toFixed(2)}</span>) or close spacing (<span className="font-mono">ΔC/D_i = {physics.impellerSpacingRatioDeltaCDi.toFixed(2)}</span>) triggers hydrodynamic interference.
            </div>
          </div>
        </div>
      </div>

      {/* 4. ILLUSTRATIVE REFERENCE HARDWARE SCENARIOS (REQUIRES HUMAN REVIEW BEFORE PROCEEDING) */}
      <div className="bg-white border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-indigo-700 font-semibold uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Illustrative Reference Hardware Scenarios (Evaluated by Live Mechanistic Solver — Mandatory Human Review)
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              <strong>Note:</strong> These three hardware configurations are illustrative reference baselines evaluated by the mechanistic mass-balance solver. For <strong>dynamically optimised next-experiment recipes (Experiments A, B, and C)</strong> computed live from the Gaussian Process surrogate with 95% credible intervals and probabilistic constraints, use the <strong>Dynamic Next-Experiment Recommendations</strong> panel directly below.
            </p>
          </div>
          {humanReviewedProposalId && (
            <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
              ✓ Proposal Reviewed &amp; Applied by Human Engineer
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {agentProposals.map(({ proposal, evaluatedPhysics }) => {
            const isSelected = proposal.id === stagedProposalId;
            const proposalFeasible =
              evaluatedPhysics.isScaleUpFeasible &&
              evaluatedPhysics.otrMmolPerLHour >=
                evaluatedPhysics.ourMmolPerLHour;
            return (
              <div
                key={proposal.id}
                onClick={() => setStagedProposalId(proposal.id)}
                className={`p-4 border text-left transition-colors cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-2 border-indigo-600 bg-indigo-50/40'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-indigo-100 text-indigo-900">
                      {proposal.strategyBadge}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        proposalFeasible ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {proposalFeasible ? '● FEASIBLE' : '✖ VIOLATION'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900">
                    {proposal.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-700 bg-white p-2 border border-slate-200">
                    {proposal.hardwareChangeSummary}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {proposal.engineeringRationale}
                  </p>
                  <div className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200 p-2 leading-snug">
                    <strong>Trade-Off:</strong> {proposal.tradeOffWarning}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-700">
                  <div>
                    OTR / OUR:{' '}
                    <strong className="text-emerald-800">
                      {evaluatedPhysics.otrMmolPerLHour.toFixed(1)} /{' '}
                      {evaluatedPhysics.ourMmolPerLHour.toFixed(1)}
                    </strong>
                  </div>
                  <div>
                    Margin:{' '}
                    <strong className="text-emerald-800">
                      +{evaluatedPhysics.oxygenMarginMmolPerLHour.toFixed(1)}{' '}
                      mmol/L/h
                    </strong>
                  </div>
                  <div>
                    Shear τ:{' '}
                    <strong>
                      {evaluatedPhysics.estimatedShearStressPa.toFixed(2)} Pa
                    </strong>
                  </div>
                  <div>
                    Mixing t_m:{' '}
                    <strong>
                      ~{formatTwoSigFigs(evaluatedPhysics.mixingTimeGassedS)} s
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Staged Proposal Comparison & Mandatory Human Confirmation Bar */}
        {selectedStagedEntry && (
          <div className="p-4 bg-slate-900 text-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="font-mono text-indigo-300 font-semibold uppercase">
                STAGED AGENT PROPOSAL FOR HUMAN ENGINEER REVIEW:{' '}
                {selectedStagedEntry.proposal.title}
              </div>
              <div className="font-mono text-[11px] text-slate-300">
                Current Active: OTR = {physics.otrMmolPerLHour.toFixed(1)}{' '}
                mmol/L/h vs OUR = {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h
                (Margin {physics.oxygenMarginMmolPerLHour >= 0 ? '+' : ''}
                {physics.oxygenMarginMmolPerLHour.toFixed(1)}) →{' '}
                <strong className="text-emerald-300">
                  Proposed After Review: OTR ={' '}
                  {selectedStagedEntry.evaluatedPhysics.otrMmolPerLHour.toFixed(
                    1
                  )}{' '}
                  mmol/L/h vs OUR ={' '}
                  {selectedStagedEntry.evaluatedPhysics.ourMmolPerLHour.toFixed(
                    1
                  )}{' '}
                  mmol/L/h (Margin +
                  {selectedStagedEntry.evaluatedPhysics.oxygenMarginMmolPerLHour.toFixed(
                    1
                  )}{' '}
                  mmol/L/h, k_La ={' '}
                  {selectedStagedEntry.evaluatedPhysics.klaPerHour.toFixed(1)}{' '}
                  h⁻¹)
                </strong>
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyStagedProposalAfterHumanReview}
              className="px-4 py-2 text-xs font-mono font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shrink-0 cursor-pointer"
            >
              Confirm &amp; Load Staged Proposal into Active Simulator →
            </button>
          </div>
        )}
      </div>

      {/* 5. HUMAN APPROVAL GATE INTERLOCK (BLOCKS APPROVAL WHEN INFEASIBLE EVEN IF PREVIOUS SIMULATED APPROVALS EXIST) */}
      <div
        className={`p-5 border-2 space-y-4 ${
          isOverallFeasible
            ? 'bg-white border-emerald-600'
            : 'bg-rose-100/70 border-rose-700'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3">
            {isOverallFeasible ? (
              <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <Lock className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-xs font-mono font-bold uppercase text-slate-900">
                {isOverallFeasible
                  ? 'ENGINEERING GATE INTERLOCK SATISFIED — READY FOR HUMAN SIGN-OFF (GATES 02 & 04)'
                  : 'HARD SAFETY INTERLOCK ACTIVE — APPROVAL OF INFEASIBLE OPERATING POINT BLOCKED'}
              </div>
              <p className="text-xs text-slate-700 mt-0.5">
                {isOverallFeasible
                  ? `Oxygen mass balance is closed (OTR = ${physics.otrMmolPerLHour.toFixed(1)} >= OUR = ${physics.ourMmolPerLHour.toFixed(1)} mmol/L/h) and hydrodynamic constraints are within bounds. A human reviewer may now record sign-off.`
                  : `Operating point at ${strParams.workingVolumeL} L violates physical constraints (${physics.limitingFactors.join(' · ')}). Sign-off is hard-blocked until the operating parameters above satisfy OTR >= OUR and shear/mixing limits.`}
              </p>
            </div>
          </div>

          {!isOverallFeasible && previouslyApprovedGates.length > 0 && (
            <button
              type="button"
              onClick={handleBlockAndRevokeInfeasibleGates}
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-rose-800 text-white hover:bg-rose-900 shrink-0 cursor-pointer"
            >
              Revoke Prior Stale Approvals (Gates 02 &amp; 04)
            </button>
          )}
        </div>

        {/* Warning if previous simulated approvals were recorded while currently infeasible */}
        {!isOverallFeasible && previouslyApprovedGates.length > 0 && (
          <div className="p-3 bg-white border border-rose-500 text-xs text-rose-950 font-mono flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <strong>
                PRIOR SIMULATED APPROVAL OVERRIDE NOTICE (
                {previouslyApprovedGates.map((g) => `Gate 0${g.gateNumber}`).join(', ')}
                ):
              </strong>{' '}
              Even though earlier simulated gate approvals were recorded, bioREACT
              blocks downstream approval and protocol release whenever the active
              scale-up operating point fails mass-balance or hydrodynamic
              feasibility (OTR = {physics.otrMmolPerLHour.toFixed(1)} &lt; OUR ={' '}
              {physics.ourMmolPerLHour.toFixed(1)} mmol/L/h).
            </div>
          </div>
        )}

        {/* Human Reviewer Sign-Off Inputs & Action */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label
              htmlFor="resolve-reviewer-name"
              className="block text-[11px] font-mono font-semibold text-slate-700 mb-1"
            >
              Human Reviewer Name &amp; Engineering Role
            </label>
            <input
              id="resolve-reviewer-name"
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 text-slate-900"
            />
          </div>
          <div className="lg:col-span-5">
            <label
              htmlFor="resolve-reviewer-notes"
              className="block text-[11px] font-mono font-semibold text-slate-700 mb-1"
            >
              Engineering Review Justification &amp; Assumed Conditions Note
            </label>
            <input
              id="resolve-reviewer-notes"
              type="text"
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 text-slate-900"
            />
          </div>
          <div className="lg:col-span-3">
            <button
              type="button"
              disabled={!isOverallFeasible}
              onClick={handleSignOffFeasibleOperatingPoint}
              className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono font-bold transition-colors ${
                isOverallFeasible
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer'
                  : 'bg-slate-300 text-slate-600 cursor-not-allowed'
              }`}
            >
              {isOverallFeasible ? (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Approve Feasible Point (Gates 02 &amp; 04)</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Approval Locked (OTR &lt; OUR / Infeasible)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
