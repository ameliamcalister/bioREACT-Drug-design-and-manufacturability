import React, { useEffect, useState } from 'react';
import {
  BiologicCandidate,
  EngineeringConstraints,
  OrganismSystemId,
  ReactorConfiguration,
  ReactorId,
  ReactorScreeningEvaluation,
} from '../types/bioreact';
import { DEFAULT_ENGINEERING_CONSTRAINTS } from '../data/bioprocessData';
import { ORGANISM_PROCESS_MODELS } from '../data/multiOrganismData';
import { ArrowRight, RotateCcw, CheckSquare, Square, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface ReactorScreeningPanelProps {
  candidate: BiologicCandidate;
  evaluations: ReactorScreeningEvaluation[];
  constraints: EngineeringConstraints;
  selectedReactorId: ReactorId;
  isReactorSignedOff: boolean;
  onUpdateConstraints: (next: EngineeringConstraints) => void;
  onSelectReactorForOptimisation: (id: ReactorId, signOff: boolean, navigateToBo?: boolean) => void;
  selectedOrganismId?: OrganismSystemId;
  onSelectOrganismId?: (id: OrganismSystemId) => void;
  onNavigateToMassBalance?: () => void;
}

export const ReactorScreeningPanel: React.FC<ReactorScreeningPanelProps> = ({
  candidate,
  evaluations,
  constraints,
  selectedReactorId,
  isReactorSignedOff,
  onUpdateConstraints,
  onSelectReactorForOptimisation,
  selectedOrganismId = 'cho_mammalian',
  onSelectOrganismId,
  onNavigateToMassBalance,
}) => {
  const [showAllSix, setShowAllSix] = useState<boolean>(true);
  const [comparedReactorId, setComparedReactorId] = useState<ReactorId>('hollow_fibre');

  const activeOrganism = ORGANISM_PROCESS_MODELS[selectedOrganismId];

  const isReactorBiologicallyCompatible = (ev: ReactorScreeningEvaluation): boolean =>
    ev.checks.biologicalCompatibilityOk !== false &&
    activeOrganism.applicableReactorIds.includes(ev.reactor.id);

  const visibleEvaluations = showAllSix
    ? evaluations
    : evaluations.filter(
        (e) => isReactorBiologicallyCompatible(e) && e.reactor.isShortlistedPrimary
      );

  const primaryEval =
    evaluations.find((e) => e.reactor.id === selectedReactorId) || evaluations[0];

  // Helper to pick the best distinct reference reactor whenever primary changes or matches reference
  const pickDistinctReferenceId = (primaryId: ReactorId): ReactorId => {
    if (primaryId === 'str_perfusion') {
      const hf = evaluations.find((e) => e.reactor.id === 'hollow_fibre');
      if (hf) return 'hollow_fibre';
    }
    if (primaryId === 'hollow_fibre') {
      const str = evaluations.find((e) => e.reactor.id === 'str_perfusion');
      if (str) return 'str_perfusion';
    }
    const compatibleAlternative = evaluations.find(
      (e) => e.reactor.id !== primaryId && isReactorBiologicallyCompatible(e)
    );
    if (compatibleAlternative) return compatibleAlternative.reactor.id;
    const anyAlternative = evaluations.find((e) => e.reactor.id !== primaryId);
    return anyAlternative ? anyAlternative.reactor.id : 'hollow_fibre';
  };

  // Automatically update comparison reactor when primary reactor or organism changes so they never match
  useEffect(() => {
    if (comparedReactorId === primaryEval.reactor.id) {
      setComparedReactorId(pickDistinctReferenceId(primaryEval.reactor.id));
    }
  }, [primaryEval.reactor.id, selectedOrganismId]);

  const effectiveComparedId =
    comparedReactorId !== primaryEval.reactor.id
      ? comparedReactorId
      : pickDistinctReferenceId(primaryEval.reactor.id);

  const secondaryEval =
    evaluations.find((e) => e.reactor.id === effectiveComparedId && e.reactor.id !== primaryEval.reactor.id) ||
    evaluations.find((e) => e.reactor.id === 'hollow_fibre' && e.reactor.id !== primaryEval.reactor.id) ||
    evaluations.find((e) => e.reactor.id !== primaryEval.reactor.id) ||
    evaluations[0];

  // Categorise reference dropdown options by biological compatibility and constraint feasibility
  const compatibleFeasibleEvals = evaluations.filter(
    (e) =>
      isReactorBiologicallyCompatible(e) &&
      (e.status === 'Recommended' || e.status === 'Pass with Trade-offs')
  );
  const compatibleViolatingEvals = evaluations.filter(
    (e) => isReactorBiologicallyCompatible(e) && e.status === 'Constraint Violation'
  );
  const biologicallyIncompatibleEvals = evaluations.filter(
    (e) => !isReactorBiologicallyCompatible(e)
  );

  const radarAxes: Array<{
    key: string;
    label: string;
    shortUnit: string;
    getVal: (r: ReactorConfiguration) => number;
  }> = [
    { key: 'prod', label: 'PRODUCTIVITY', shortUnit: '0–100 score', getVal: (r) => r.productivityScore },
    { key: 'kla', label: 'OXYGEN kLa', shortUnit: '0–100 score', getVal: (r) => r.oxygenTransferScore },
    { key: 'shear', label: 'SHEAR SAFETY', shortUnit: '0–100 score', getVal: (r) => r.shearSafetyScore },
    { key: 'scale', label: 'SCALABILITY', shortUnit: '0–100 score', getVal: (r) => r.scalabilityScore },
    { key: 'ret', label: 'CELL RETENTION', shortUnit: '0–100 score', getVal: (r) => r.cellRetentionScore },
    {
      key: 'homog',
      label: 'HOMOGENEITY',
      shortUnit: '0–100 score',
      getVal: (r) => Math.max(15, 100 - r.massTransferGradientScore * 9),
    },
  ];

  const centerX = 190;
  const centerY = 152;
  const maxRadius = 96;

  const getPolygonCoordinates = (reactor: ReactorConfiguration) => {
    return radarAxes.map((axis, idx) => {
      const angle = (Math.PI * 2 * idx) / radarAxes.length - Math.PI / 2;
      const val = Math.min(100, Math.max(0, axis.getVal(reactor))) / 100;
      const r = val * maxRadius;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      return { x, y, score: axis.getVal(reactor) };
    });
  };

  const primaryCoords = getPolygonCoordinates(primaryEval.reactor);
  const secondaryCoords = getPolygonCoordinates(secondaryEval.reactor);

  const primaryPolygonPoints = primaryCoords
    .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');
  const secondaryPolygonPoints = secondaryCoords
    .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');

  const isSecondaryBiologicallyIncompatible = !isReactorBiologicallyCompatible(secondaryEval);
  const isSecondaryConstraintViolation = secondaryEval.status === 'Constraint Violation';

  return (
    <div className="space-y-8">
      {/* Top Section Header & Single-Reactor Sign-Off Enforcement Bar */}
      <div className="bg-white border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono text-slate-500 mb-1">
              02. STAGE 2 · ORGANISM-AWARE UPSTREAM BIOREACTOR SCREENER &amp; HUMAN ENGINEER SIGN-OFF
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              Engineering Trade-Off Evaluation for {activeOrganism.organismName} ({activeOrganism.exemplarProduct})
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Screens reactor architectures (Stirred-Tank Perfusion, Fed-Batch, Rocking, Hollow-Fibre, Packed-Bed, Airlift, Microbial High-OTR Fermenter, and Tubular/Flat-Panel Photobioreactors) against <strong>{activeOrganism.shortBadge}</strong> physics ({activeOrganism.biomassUnit}, τ ≤ {activeOrganism.shearThresholdPa} Pa).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100">
              <button
                type="button"
                onClick={() => setShowAllSix(false)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  !showAllSix
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shortlisted Primary
              </button>
              <button
                type="button"
                onClick={() => setShowAllSix(true)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showAllSix
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All {evaluations.length} Bioreactor Types
              </button>
            </div>
          </div>
        </div>

        {/* Organism Filter Bar inside Reactor Screening */}
        {onSelectOrganismId && (
          <div className="pt-4 pb-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-mono font-semibold text-slate-600 mr-1">
                SCREEN FOR ORGANISM:
              </span>
              {(Object.values(ORGANISM_PROCESS_MODELS) as typeof activeOrganism[]).map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => onSelectOrganismId(org.id)}
                  className={`px-2.5 py-1 text-xs font-mono border transition-colors cursor-pointer whitespace-nowrap ${
                    selectedOrganismId === org.id
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {org.shortBadge}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Readiness: <strong className="text-slate-900">{activeOrganism.modelReadiness}</strong>
            </span>
          </div>
        )}

        {/* Mandatory Human Engineer Sign-Off Strip */}
        <div
          className={`mt-5 p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            isReactorSignedOff
              ? 'bg-slate-900 text-slate-100 border-emerald-600'
              : 'bg-amber-950 text-amber-100 border-amber-500'
          }`}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span
                className={`px-2 py-0.5 font-bold uppercase ${
                  isReactorSignedOff
                    ? 'bg-emerald-700 text-white'
                    : 'bg-amber-500 text-slate-950'
                }`}
              >
                {isReactorSignedOff
                  ? 'GATE 02 HUMAN APPROVAL VERIFIED'
                  : 'PROVISIONAL RECOMMENDATION — AWAITING GATE 02 HUMAN APPROVAL'}
              </span>
              <span className="text-cyan-300">
                SINGLE-REACTOR SIGN-OFF GATE FOR PROCESS OPTIMISATION
              </span>
            </div>
            <div className="text-sm font-semibold text-white mt-1">
              {isReactorSignedOff ? 'Approved Configuration:' : 'Provisional Top Candidate:'}{' '}
              {primaryEval.reactor.name} ({primaryEval.overallWeightedScore.toFixed(1)}/100 ·{' '}
              {primaryEval.status === 'Recommended' && !isReactorSignedOff
                ? 'Provisional Recommendation'
                : primaryEval.status}
              )
            </div>
            {!isReactorSignedOff && (
              <p className="text-xs text-amber-200 mt-0.5">
                All reactor screening rankings remain provisional until a Lead Biochemical Engineer explicitly approves Gate 02 (and closes the 500 L oxygen balance OTR ≥ OUR).
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                onSelectReactorForOptimisation(
                  primaryEval.reactor.id,
                  !isReactorSignedOff,
                  false
                )
              }
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                isReactorSignedOff
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-900 text-amber-300 border-amber-400 hover:bg-slate-800'
              }`}
            >
              {isReactorSignedOff ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>
                {isReactorSignedOff
                  ? 'Gate 02 Approved: 1 Reactor Locked'
                  : 'Approve Gate 02 & Sign Off Reactor'}
              </span>
            </button>

            <button
              type="button"
              disabled={!isReactorSignedOff}
              onClick={() =>
                onSelectReactorForOptimisation(primaryEval.reactor.id, true, true)
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Proceed to Stage 3 Optimiser</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Asymmetric Split Console: Left = Biochemical Engineer Constraint Sliders | Right = Radar Calibration & Ranked Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Control Column (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div>
              <div className="text-xs font-mono text-slate-500">ENGINEER CONTROL PANEL</div>
              <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                Hard Screening Constraints
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onUpdateConstraints(DEFAULT_ENGINEERING_CONSTRAINTS)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Target Working Volume Scale */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="const-scale" className="font-medium text-slate-800">
                  Target Production Scale
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {constraints.targetScaleL} <span className="text-slate-500">L</span>
                </span>
              </div>
              <input
                id="const-scale"
                type="range"
                min={10}
                max={2000}
                step={10}
                value={constraints.targetScaleL}
                onChange={(e) =>
                  onUpdateConstraints({
                    ...constraints,
                    targetScaleL: parseInt(e.target.value, 10),
                  })
                }
                className="w-full mt-1.5 accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Minimum kLa */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="const-kla" className="font-medium text-slate-800">
                  Minimum Oxygen Transfer (<span className="font-mono">kLa</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {constraints.minKlaPerHour} <span className="text-slate-500">h⁻¹</span>
                </span>
              </div>
              <input
                id="const-kla"
                type="range"
                min={12}
                max={75}
                step={1}
                value={constraints.minKlaPerHour}
                onChange={(e) =>
                  onUpdateConstraints({
                    ...constraints,
                    minKlaPerHour: parseInt(e.target.value, 10),
                  })
                }
                className="w-full mt-1.5 accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Maximum Hydrodynamic Shear Stress */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="const-shear" className="font-medium text-slate-800">
                  Max Permissible Shear Stress (<span className="font-mono">τ_max</span>)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {constraints.maxShearStressPa.toFixed(2)} <span className="text-slate-500">Pa</span>
                </span>
              </div>
              <input
                id="const-shear"
                type="range"
                min={0.35}
                max={2.20}
                step={0.05}
                value={constraints.maxShearStressPa}
                onChange={(e) =>
                  onUpdateConstraints({
                    ...constraints,
                    maxShearStressPa: parseFloat(e.target.value),
                  })
                }
                className="w-full mt-1.5 accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Minimum Volumetric Productivity */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="const-prod" className="font-medium text-slate-800">
                  Min Target Volumetric Productivity
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {constraints.minVolumetricProductivityGPerLDay.toFixed(2)}{' '}
                  <span className="text-slate-500">g/L/d</span>
                </span>
              </div>
              <input
                id="const-prod"
                type="range"
                min={0.3}
                max={1.8}
                step={0.05}
                value={constraints.minVolumetricProductivityGPerLDay}
                onChange={(e) =>
                  onUpdateConstraints({
                    ...constraints,
                    minVolumetricProductivityGPerLDay: parseFloat(e.target.value),
                  })
                }
                className="w-full mt-1.5 accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Require Continuous Retention Toggle */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <label
                htmlFor="toggle-retention"
                className="text-xs font-medium text-slate-800 cursor-pointer"
              >
                Require Continuous Cell Retention
              </label>
              <input
                id="toggle-retention"
                type="checkbox"
                checked={constraints.requireContinuousRetention}
                onChange={(e) =>
                  onUpdateConstraints({
                    ...constraints,
                    requireContinuousRetention: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Multi-Criteria Engineering Weights ("Disagree Here") */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <div className="text-xs font-mono text-blue-700 font-semibold">
                DISAGREE HERE · SCORING WEIGHT CALIBRATION (%)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Drag sliders to challenge the relative importance of productivity, kLa, shear protection, scalability, and cell retention.
              </p>
            </div>
            {(
              [
                ['productivity', 'Volumetric Productivity'],
                ['oxygenTransfer', 'Oxygen Mass Transfer (kLa)'],
                ['shearSafety', 'Low-Shear CQA Protection'],
                ['scalability', 'Commercial Scale-Up'],
                ['cellRetention', 'Cell Retention Efficiency'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700">{label}</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {constraints.weights[key]}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={constraints.weights[key]}
                  onChange={(e) =>
                    onUpdateConstraints({
                      ...constraints,
                      weights: {
                        ...constraints.weights,
                        [key]: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full mt-1 accent-slate-700 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Main Viewport (8 cols): Spider Chart + Ranked Reactor Cards */}
        <div className="lg:col-span-8 space-y-6">
          {/* Radar Calibration Comparison Box */}
          <div className="bg-white border border-slate-200 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-mono text-slate-500">
                  RADAR ENVELOPE OVERLAY · 6 NORMALISED ENGINEERING AXES (0–100 SCALE)
                </div>
                <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                  {primaryEval.reactor.shortName} vs. {secondaryEval.reactor.shortName}
                </h3>
              </div>
              {onNavigateToMassBalance && (
                <button
                  type="button"
                  onClick={onNavigateToMassBalance}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
                >
                  <span>Open Animated Bioreactor Cutaway (5. Engineering Feasibility)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Left 6 Cols: Responsive Radar SVG + Attached Legend */}
              <div className="md:col-span-6 flex flex-col items-center bg-slate-50/60 border border-slate-200 p-3">
                <svg
                  viewBox="0 0 380 305"
                  className="w-full max-w-[360px] h-auto"
                  role="img"
                  aria-label={`6-axis bioreactor comparison radar chart: ${primaryEval.reactor.shortName} vs ${secondaryEval.reactor.shortName}`}
                >
                  {/* Concentric 25%, 50%, 75%, 100% Grid Hexagons */}
                  {[0.25, 0.5, 0.75, 1.0].map((level) => {
                    const pts = radarAxes
                      .map((_, idx) => {
                        const angle = (Math.PI * 2 * idx) / radarAxes.length - Math.PI / 2;
                        const r = level * maxRadius;
                        return `${(centerX + r * Math.cos(angle)).toFixed(1)},${(
                          centerY +
                          r * Math.sin(angle)
                        ).toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <g key={level}>
                        <polygon
                          points={pts}
                          fill={level === 1.0 ? '#F8FAFC' : 'none'}
                          fillOpacity={level === 1.0 ? 0.4 : 0}
                          stroke="#CBD5E1"
                          strokeWidth={level === 1.0 ? '1.4' : '1'}
                          strokeDasharray={level < 1 ? '2,2' : undefined}
                        />
                        <text
                          x={centerX + 4}
                          y={centerY - level * maxRadius + 9}
                          className="text-[8px] font-mono fill-slate-400"
                        >
                          {Math.round(level * 100)}
                        </text>
                      </g>
                    );
                  })}

                  {/* 6 Radial Spokes & Unclipped Axis Labels */}
                  {radarAxes.map((axis, idx) => {
                    const angle = (Math.PI * 2 * idx) / radarAxes.length - Math.PI / 2;
                    const xEnd = centerX + maxRadius * Math.cos(angle);
                    const yEnd = centerY + maxRadius * Math.sin(angle);
                    const cosA = Math.cos(angle);
                    const sinA = Math.sin(angle);
                    const labelDist = maxRadius + 22;
                    const xLabel = centerX + labelDist * cosA;
                    const yLabel = centerY + labelDist * sinA;
                    const anchor =
                      cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle';
                    return (
                      <g key={axis.key}>
                        <line
                          x1={centerX}
                          y1={centerY}
                          x2={xEnd}
                          y2={yEnd}
                          stroke="#CBD5E1"
                          strokeWidth="1"
                        />
                        <text
                          x={xLabel}
                          y={yLabel}
                          textAnchor={anchor}
                          dominantBaseline="middle"
                          className="text-[9.5px] font-mono fill-slate-700 font-semibold"
                        >
                          {axis.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Secondary Reference Reactor Polygon (Dashed Amber/Rose) */}
                  <polygon
                    points={secondaryPolygonPoints}
                    fill={
                      isSecondaryBiologicallyIncompatible
                        ? 'rgba(225, 29, 72, 0.14)'
                        : 'rgba(217, 119, 6, 0.16)'
                    }
                    stroke={isSecondaryBiologicallyIncompatible ? '#E11D48' : '#D97706'}
                    strokeWidth="2.2"
                    strokeDasharray="5,3"
                  />
                  {secondaryCoords.map((pt, idx) => (
                    <rect
                      key={`sec-pt-${idx}`}
                      x={pt.x - 3}
                      y={pt.y - 3}
                      width="6"
                      height="6"
                      fill={isSecondaryBiologicallyIncompatible ? '#E11D48' : '#D97706'}
                      stroke="#FFFFFF"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Primary Target Reactor Polygon (Solid Royal Blue) */}
                  <polygon
                    points={primaryPolygonPoints}
                    fill="rgba(37, 99, 235, 0.22)"
                    stroke="#2563EB"
                    strokeWidth="2.5"
                  />
                  {primaryCoords.map((pt, idx) => (
                    <circle
                      key={`pri-pt-${idx}`}
                      cx={pt.x}
                      cy={pt.y}
                      r="3.8"
                      fill="#2563EB"
                      stroke="#FFFFFF"
                      strokeWidth="1.2"
                    />
                  ))}
                </svg>

                {/* Attached Readable Legend */}
                <div className="w-full pt-2 mt-1 border-t border-slate-200 flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono">
                  <div className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                    <span className="font-semibold text-slate-900">
                      Primary: {primaryEval.reactor.shortName} ({primaryEval.overallWeightedScore.toFixed(1)})
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-3 h-3 inline-block border border-dashed ${
                        isSecondaryBiologicallyIncompatible
                          ? 'bg-rose-600 border-rose-800'
                          : 'bg-amber-600 border-amber-800'
                      }`}
                    />
                    <span className="font-semibold text-slate-800">
                      Reference: {secondaryEval.reactor.shortName} ({secondaryEval.overallWeightedScore.toFixed(1)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Right 6 Cols: Selector Controls + Compatibility Warning + 6-Axis Comparison Table */}
              <div className="md:col-span-6 space-y-3.5">
                <div className="space-y-2 text-xs">
                  {/* Primary Target Card */}
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/60 border border-blue-200">
                    <div>
                      <span className="font-mono text-blue-800 font-semibold block">
                        ● {isReactorSignedOff ? 'Approved Primary:' : 'Provisional Primary:'}{' '}
                        {primaryEval.reactor.shortName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-600">
                        Status: {primaryEval.status}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-blue-950 tabular-nums">
                      {primaryEval.overallWeightedScore.toFixed(1)} / 100
                    </span>
                  </div>

                  {/* Reference Configuration Selector */}
                  <div className="p-2.5 bg-amber-50/50 border border-amber-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="ref-reactor-select"
                        className="font-mono text-amber-900 font-semibold"
                      >
                        ■ Compare Against Reference Reactor:
                      </label>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {secondaryEval.overallWeightedScore.toFixed(1)} / 100
                      </span>
                    </div>
                    <select
                      id="ref-reactor-select"
                      value={secondaryEval.reactor.id}
                      onChange={(e) => setComparedReactorId(e.target.value as ReactorId)}
                      aria-label="Select reference bioreactor for radar comparison"
                      className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
                    >
                      {compatibleFeasibleEvals.length > 0 && (
                        <optgroup label="✓ Biologically Compatible & Feasible Alternatives">
                          {compatibleFeasibleEvals.map((ev) => (
                            <option
                              key={ev.reactor.id}
                              value={ev.reactor.id}
                              disabled={ev.reactor.id === primaryEval.reactor.id}
                            >
                              {ev.reactor.shortName} ({ev.overallWeightedScore.toFixed(1)}/100 —{' '}
                              {ev.reactor.id === primaryEval.reactor.id
                                ? 'Active Primary Target'
                                : ev.status}
                              )
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {compatibleViolatingEvals.length > 0 && (
                        <optgroup label="⚠ Compatible Host — Fails Current Scale/kLa/Shear Constraints">
                          {compatibleViolatingEvals.map((ev) => (
                            <option
                              key={ev.reactor.id}
                              value={ev.reactor.id}
                              disabled={ev.reactor.id === primaryEval.reactor.id}
                            >
                              {ev.reactor.shortName} ({ev.overallWeightedScore.toFixed(1)}/100 — Constraint Violation)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {biologicallyIncompatibleEvals.length > 0 && (
                        <optgroup label="✖ Excluded / Biologically Incompatible for Selected Host">
                          {biologicallyIncompatibleEvals.map((ev) => (
                            <option
                              key={ev.reactor.id}
                              value={ev.reactor.id}
                              disabled={ev.reactor.id === primaryEval.reactor.id}
                            >
                              [EXCLUDED] {ev.reactor.shortName} (Incompatible with {activeOrganism.shortBadge})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                {/* Explicit Incompatibility / Constraint Violation Alert for Reference Reactor */}
                {(isSecondaryBiologicallyIncompatible || isSecondaryConstraintViolation) && (
                  <div
                    className={`p-2.5 border text-xs space-y-1 ${
                      isSecondaryBiologicallyIncompatible
                        ? 'bg-rose-50 border-rose-300 text-rose-950'
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                    }`}
                  >
                    <div className="font-mono font-bold text-[11px] flex items-center gap-1.5">
                      {isSecondaryBiologicallyIncompatible ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      )}
                      <span>
                        {isSecondaryBiologicallyIncompatible
                          ? `EXCLUDED CONFIGURATION: ${secondaryEval.reactor.shortName} IS BIOLOGICALLY INCOMPATIBLE`
                          : `REFERENCE CONSTRAINT VIOLATION: ${secondaryEval.reactor.shortName} FAILS HARD CONSTRAINTS`}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {secondaryEval.failOrCautionReasons[0] ||
                        'Shown strictly for architectural comparison; excluded as a viable manufacturing recommendation.'}
                    </p>
                  </div>
                )}

                {/* Side-by-Side Normalised 6-Axis Score Comparison Table */}
                <div className="border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px] font-mono">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-1.5 px-2">Normalised Axis (0–100)</th>
                        <th className="py-1.5 px-2 text-blue-700">
                          {primaryEval.reactor.shortName}
                        </th>
                        <th className="py-1.5 px-2 text-amber-800">
                          {secondaryEval.reactor.shortName}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {radarAxes.map((axis) => {
                        const pScore = axis.getVal(primaryEval.reactor);
                        const sScore = axis.getVal(secondaryEval.reactor);
                        return (
                          <tr key={axis.key}>
                            <td className="py-1 px-2 text-slate-700 font-medium">{axis.label}</td>
                            <td className="py-1 px-2 font-bold text-blue-800 tabular-nums">
                              {pScore.toFixed(0)} / 100
                            </td>
                            <td className="py-1 px-2 text-amber-900 tabular-nums">
                              {sScore.toFixed(0)} / 100
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {primaryEval.reactor.distinctionNote}
                </p>
              </div>
            </div>
          </div>

          {/* Ranked Evaluation Cards */}
          <div className="space-y-4">
            {visibleEvaluations.map((ev, rankIdx) => {
              const isSelected = ev.reactor.id === selectedReactorId;
              return (
                <div
                  key={ev.reactor.id}
                  className={`bg-white border p-5 transition-colors ${
                    isSelected ? 'border-blue-600' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs font-mono">
                        <span className="font-bold text-slate-900">RANK #{rankIdx + 1}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            ev.status === 'Recommended'
                              ? isSelected && isReactorSignedOff
                                ? 'text-emerald-700 font-semibold'
                                : 'text-amber-700 font-semibold'
                              : ev.status === 'Pass with Trade-offs'
                              ? 'text-amber-700 font-semibold'
                              : 'text-rose-700 font-semibold'
                          }
                        >
                          {ev.status === 'Recommended'
                            ? isSelected && isReactorSignedOff
                              ? '● Approved Configuration (Gate 02 Signed Off)'
                              : '◐ Provisional Recommendation (Awaiting Gate 02 Approval)'
                            : ev.status === 'Pass with Trade-offs'
                            ? '▲ Provisional Pass with Engineering Trade-offs'
                            : '✖ Constraint Violation'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">
                          Architecture: {ev.reactor.physicalArchitecture}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">Mode: {ev.reactor.operatingMode}</span>
                      </div>
                      <h4 className="text-base font-semibold text-slate-900 mt-1">
                        {ev.reactor.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] font-mono text-slate-500">WEIGHTED SCORE</div>
                        <div className="text-xl font-mono font-bold text-slate-900 tabular-nums">
                          {ev.overallWeightedScore.toFixed(1)}
                          <span className="text-xs font-normal text-slate-400 ml-1">/100</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectReactorForOptimisation(ev.reactor.id, true, false)
                        }
                        className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isSelected && isReactorSignedOff
                            ? 'bg-emerald-700 text-white'
                            : 'bg-amber-100 text-amber-950 border border-amber-400 hover:bg-amber-200'
                        }`}
                      >
                        {isSelected && isReactorSignedOff
                          ? '✓ Gate 02 Approved (1/1)'
                          : 'Approve Gate 02 for This Reactor'}
                      </button>
                    </div>
                  </div>

                  {/* Quantitative Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-3 border-b border-slate-100 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-500 block text-[11px]">SCALE ENVELOPE</span>
                      <span
                        className={
                          ev.checks.scaleOk
                            ? 'text-slate-900 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {ev.reactor.scaleRangeL[0]}–{ev.reactor.scaleRangeL[1]} L
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">OXYGEN kLa</span>
                      <span
                        className={
                          ev.checks.klaOk
                            ? 'text-slate-900 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {ev.reactor.klaRangePerHour[0]}–{ev.reactor.klaRangePerHour[1]} h⁻¹
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">TYPICAL SHEAR τ</span>
                      <span
                        className={
                          ev.checks.shearOk
                            ? 'text-slate-900 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {ev.reactor.typicalShearStressPa.toFixed(2)} Pa
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">PRODUCTIVITY</span>
                      <span
                        className={
                          ev.checks.productivityOk
                            ? 'text-blue-700 font-semibold'
                            : 'text-amber-700 font-semibold'
                        }
                      >
                        {ev.reactor.volumetricProductivityGPerLDay.toFixed(2)} g/L/d
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">RETENTION R</span>
                      <span className="text-slate-900 font-semibold">
                        {(ev.reactor.retentionFactorR * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Pass & Caution Rationale */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 text-xs">
                    <div>
                      <div className="font-mono text-emerald-800 font-medium mb-1">
                        SATISFIED ENGINEERING RULES:
                      </div>
                      <ul className="space-y-1 text-slate-700">
                        {ev.passReasons.map((r) => (
                          <li key={r}>· {r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-mono text-amber-800 font-medium mb-1">
                        RULE VIOLATIONS &amp; LIMITATIONS:
                      </div>
                      <ul className="space-y-1 text-slate-600">
                        {ev.failOrCautionReasons.map((r) => (
                          <li key={r} className="text-rose-700 font-medium">
                            ✖ {r}
                          </li>
                        ))}
                        {ev.reactor.mainLimitations.slice(0, 2).map((lim) => (
                          <li key={lim}>· {lim}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
