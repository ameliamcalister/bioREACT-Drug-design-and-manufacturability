import React, { useMemo } from 'react';
import {
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  ImpellerType,
  MassBalanceAndPhysicsResult,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  formatTwoSigFigs,
  solveMassBalanceAndReactorPhysics,
} from '../services/bioprocessEngine';
import { IMPELLER_GEOMETRY_SPECS } from '../data/bioprocessData';
import { AlertTriangle, CheckCircle2, Sliders } from 'lucide-react';

interface ImpellerSensitivityAnalysisPanelProps {
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  groundedParams: GroundedSimulatorParams;
  physics: MassBalanceAndPhysicsResult;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
}

interface SensitivitySweepPoint {
  np0: number;
  deltaNpPercent: number;
  isDefaultRef: boolean;
  isActiveUserPoint: boolean;
  reynoldsNumber: number;
  reCorrectedNp: number;
  totalUngassedNp: number;
  effectiveGassedNpg: number;
  gassingFactorPgP0: number;
  ungassedPvWPerM3: number;
  gassedPvWPerM3: number;
  deltaGassedPvPercent: number;
  mixingTimeUngassedS: number;
  mixingTimeGassedS: number;
  deltaMixingTimePercent: number;
  otrMmolPerLHour: number;
  shearStressPa: number;
  kolmogorovScaleUm: number;
  isReOutOfRange: boolean;
  isTransitionalRe: boolean;
  isFeasible: boolean;
}

export const ImpellerSensitivityAnalysisPanel: React.FC<
  ImpellerSensitivityAnalysisPanelProps
> = ({ strParams, hfParams, groundedParams, physics, onUpdateStrParams }) => {
  const activeSpec = IMPELLER_GEOMETRY_SPECS[strParams.impellerType];
  const [minNp, maxNp] = activeSpec.literatureTurbulentNpRange;
  const refNp = activeSpec.defaultTurbulentNp0;

  const currentNp0 =
    strParams.customTurbulentNp !== undefined &&
    Number.isFinite(strParams.customTurbulentNp)
      ? Math.min(maxNp, Math.max(minNp, strParams.customTurbulentNp))
      : refNp;

  // Baseline physics at the reference default Np,0 for percentage delta calculation
  const referencePhysics = useMemo(
    () =>
      solveMassBalanceAndReactorPhysics(
        {
          ...strParams,
          customTurbulentNp: refNp,
        },
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      ),
    [strParams, refNp, hfParams, groundedParams]
  );

  // Continuous 21-point curve across the literature Np,0 range [minNp, maxNp]
  const continuousCurvePoints = useMemo((): SensitivitySweepPoint[] => {
    const steps = 20;
    const pts: SensitivitySweepPoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const npVal =
        Math.round((minNp + (i / steps) * (maxNp - minNp)) * 100) / 100;
      const evalPhys = solveMassBalanceAndReactorPhysics(
        {
          ...strParams,
          customTurbulentNp: npVal,
        },
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      );

      const deltaNpPercent = ((npVal - refNp) / refNp) * 100;
      const deltaGassedPvPercent =
        ((evalPhys.specificPowerWPerM3 - referencePhysics.specificPowerWPerM3) /
          Math.max(0.1, referencePhysics.specificPowerWPerM3)) *
        100;
      const deltaMixingTimePercent =
        ((evalPhys.mixingTimeGassedS - referencePhysics.mixingTimeGassedS) /
          Math.max(0.1, referencePhysics.mixingTimeGassedS)) *
        100;

      pts.push({
        np0: npVal,
        deltaNpPercent,
        isDefaultRef: Math.abs(npVal - refNp) < 0.008,
        isActiveUserPoint: Math.abs(npVal - currentNp0) < 0.008,
        reynoldsNumber: evalPhys.reynoldsNumber,
        reCorrectedNp: evalPhys.reynoldsCorrectedSingleNp,
        totalUngassedNp: evalPhys.ungassedPowerNumberTotalNp,
        effectiveGassedNpg: evalPhys.effectiveGassedPowerNumberNpg,
        gassingFactorPgP0: evalPhys.gassingPowerFactorPgP0,
        ungassedPvWPerM3: evalPhys.ungassedSpecificPowerWPerM3,
        gassedPvWPerM3: evalPhys.specificPowerWPerM3,
        deltaGassedPvPercent,
        mixingTimeUngassedS: evalPhys.mixingTimeUngassedS,
        mixingTimeGassedS: evalPhys.mixingTimeGassedS,
        deltaMixingTimePercent,
        otrMmolPerLHour: evalPhys.otrMmolPerLHour,
        shearStressPa: evalPhys.estimatedShearStressPa,
        kolmogorovScaleUm: evalPhys.kolmogorovScaleUm,
        isReOutOfRange: evalPhys.isReynoldsOutOfRange,
        isTransitionalRe:
          !evalPhys.isReynoldsOutOfRange && evalPhys.reynoldsNumber < 10000,
        isFeasible: evalPhys.isScaleUpFeasible,
      });
    }
    return pts;
  }, [strParams, hfParams, groundedParams, minNp, maxNp, refNp, currentNp0, referencePhysics]);

  // 7-point structured table across the literature Np,0 range (always includes min, ref, current, max)
  const tableSweepPoints = useMemo((): SensitivitySweepPoint[] => {
    const rawCandidates = [
      minNp,
      Math.round((minNp + 0.2 * (maxNp - minNp)) * 100) / 100,
      refNp,
      currentNp0,
      Math.round((minNp + 0.55 * (maxNp - minNp)) * 100) / 100,
      Math.round((minNp + 0.8 * (maxNp - minNp)) * 100) / 100,
      maxNp,
    ];
    const uniqueSorted = Array.from(new Set(rawCandidates)).sort((a, b) => a - b);

    return uniqueSorted.map((npVal) => {
      const evalPhys = solveMassBalanceAndReactorPhysics(
        {
          ...strParams,
          customTurbulentNp: npVal,
        },
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      );

      return {
        np0: npVal,
        deltaNpPercent: ((npVal - refNp) / refNp) * 100,
        isDefaultRef: Math.abs(npVal - refNp) < 0.005,
        isActiveUserPoint: Math.abs(npVal - currentNp0) < 0.005,
        reynoldsNumber: evalPhys.reynoldsNumber,
        reCorrectedNp: evalPhys.reynoldsCorrectedSingleNp,
        totalUngassedNp: evalPhys.ungassedPowerNumberTotalNp,
        effectiveGassedNpg: evalPhys.effectiveGassedPowerNumberNpg,
        gassingFactorPgP0: evalPhys.gassingPowerFactorPgP0,
        ungassedPvWPerM3: evalPhys.ungassedSpecificPowerWPerM3,
        gassedPvWPerM3: evalPhys.specificPowerWPerM3,
        deltaGassedPvPercent:
          ((evalPhys.specificPowerWPerM3 - referencePhysics.specificPowerWPerM3) /
            Math.max(0.1, referencePhysics.specificPowerWPerM3)) *
          100,
        mixingTimeUngassedS: evalPhys.mixingTimeUngassedS,
        mixingTimeGassedS: evalPhys.mixingTimeGassedS,
        deltaMixingTimePercent:
          ((evalPhys.mixingTimeGassedS - referencePhysics.mixingTimeGassedS) /
            Math.max(0.1, referencePhysics.mixingTimeGassedS)) *
          100,
        otrMmolPerLHour: evalPhys.otrMmolPerLHour,
        shearStressPa: evalPhys.estimatedShearStressPa,
        kolmogorovScaleUm: evalPhys.kolmogorovScaleUm,
        isReOutOfRange: evalPhys.isReynoldsOutOfRange,
        isTransitionalRe:
          !evalPhys.isReynoldsOutOfRange && evalPhys.reynoldsNumber < 10000,
        isFeasible: evalPhys.isScaleUpFeasible,
      };
    });
  }, [strParams, hfParams, groundedParams, minNp, maxNp, refNp, currentNp0, referencePhysics]);

  // Cross-impeller family comparison at current vessel volume, rpm, D_i/D_T, and sparging
  const crossImpellerComparison = useMemo(() => {
    const types: ImpellerType[] = ['marine_axial', 'pitched_blade', 'rushton_radial'];
    return types.map((impType) => {
      const spec = IMPELLER_GEOMETRY_SPECS[impType];
      const useNp =
        impType === strParams.impellerType ? currentNp0 : spec.defaultTurbulentNp0;
      const minPhys = solveMassBalanceAndReactorPhysics(
        {
          ...strParams,
          impellerType: impType,
          customTurbulentNp: spec.literatureTurbulentNpRange[0],
        },
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      );
      const refPhys = solveMassBalanceAndReactorPhysics(
        {
          ...strParams,
          impellerType: impType,
          customTurbulentNp: useNp,
        },
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      );
      const maxPhys = solveMassBalanceAndReactorPhysics(
        {
          ...strParams,
          impellerType: impType,
          customTurbulentNp: spec.literatureTurbulentNpRange[1],
        },
        hfParams,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      );

      return {
        spec,
        activeNp: useNp,
        minPhys,
        refPhys,
        maxPhys,
      };
    });
  }, [strParams, hfParams, groundedParams, currentNp0]);

  // SVG Dual-Axis Coordinate Mapping for Np Sensitivity Plot
  // X-axis: Np,0 from minNp to maxNp -> x in [64, 556]
  // Left Y-axis: Specific Power P/V (W/m^3)
  // Right Y-axis: Gassed Mixing Time t_m,gas (s)
  const plotLeft = 64;
  const plotRight = 556;
  const plotTop = 32;
  const plotBottom = 238;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const maxPvScale = Math.max(
    60,
    Math.ceil(
      Math.max(...continuousCurvePoints.map((p) => p.ungassedPvWPerM3)) * 1.18
    )
  );
  const maxTmScale = Math.max(
    75,
    Math.ceil(
      Math.max(...continuousCurvePoints.map((p) => p.mixingTimeGassedS)) * 1.18
    )
  );

  const mapNpToX = (npVal: number) =>
    plotLeft + ((npVal - minNp) / Math.max(0.01, maxNp - minNp)) * plotWidth;
  const mapPvToY = (pvVal: number) =>
    plotBottom - (Math.min(maxPvScale, Math.max(0, pvVal)) / maxPvScale) * plotHeight;
  const mapTmToY = (tmVal: number) =>
    plotBottom - (Math.min(maxTmScale, Math.max(0, tmVal)) / maxTmScale) * plotHeight;

  const gassedPvPolyline = continuousCurvePoints
    .map((p) => `${mapNpToX(p.np0).toFixed(1)},${mapPvToY(p.gassedPvWPerM3).toFixed(1)}`)
    .join(' ');
  const ungassedPvPolyline = continuousCurvePoints
    .map((p) => `${mapNpToX(p.np0).toFixed(1)},${mapPvToY(p.ungassedPvWPerM3).toFixed(1)}`)
    .join(' ');
  const mixingTimePolyline = continuousCurvePoints
    .map((p) => `${mapNpToX(p.np0).toFixed(1)},${mapTmToY(p.mixingTimeGassedS).toFixed(1)}`)
    .join(' ');

  const activeX = mapNpToX(currentNp0);
  const refX = mapNpToX(refNp);
  const activeGassedPvY = mapPvToY(physics.specificPowerWPerM3);
  const activeTmY = mapTmToY(physics.mixingTimeGassedS);

  const deltaPvVsRefPct =
    ((physics.specificPowerWPerM3 - referencePhysics.specificPowerWPerM3) /
      Math.max(0.1, referencePhysics.specificPowerWPerM3)) *
    100;
  const deltaTmVsRefPct =
    ((physics.mixingTimeGassedS - referencePhysics.mixingTimeGassedS) /
      Math.max(0.1, referencePhysics.mixingTimeGassedS)) *
    100;

  return (
    <div className="bg-white border border-slate-200 p-6 space-y-6">
      {/* Top Header & Correlation Validity Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="text-xs font-mono text-blue-700 font-semibold">
            IMPELLER POWER-NUMBER (N_p) SENSITIVITY ANALYSIS · P/V, MIXING TIME &amp; REYNOLDS REGIME AUDIT
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
            Literature-Range <span className="font-mono">N_p,0</span> Sensitivity Sweep &amp; Reynolds-Number Correlation Validator
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
            Quantifies how literature-reported geometric variations in turbulent power number (
            <span className="font-mono">N_p,0</span>) for <strong>Marine Propellers</strong>,{' '}
            <strong>Pitched-Blade Turbines</strong>, and <strong>Rushton Turbines</strong> propagate into{' '}
            <strong>ungassed/gassed specific power (<span className="font-mono">P_0/V</span>, <span className="font-mono">P_g/V</span>)</strong> and{' '}
            <strong>bulk mixing time (<span className="font-mono">t_m,gas</span>)</strong>, while automatically flagging operating inputs that fall outside valid Reynolds-number-dependent correlations (<span className="font-mono">Re &lt; 200</span>).
          </p>
        </div>

        {/* Live Reynolds Correlation Status Pill */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold border ${
              physics.isReynoldsOutOfRange
                ? 'bg-rose-50 text-rose-900 border-rose-500'
                : physics.reynoldsNumber < 10000
                ? 'bg-amber-50 text-amber-900 border-amber-400'
                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
            }`}
          >
            {physics.isReynoldsOutOfRange ? (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            )}
            <span>
              Re = {physics.reynoldsNumber.toLocaleString()} · {physics.flowRegimeClassification}
            </span>
          </span>
        </div>
      </div>

      {/* Prominent Warning Banner When Inputs Fall Outside Valid Reynolds-Number Correlation Range */}
      {physics.isReynoldsOutOfRange && (
        <div className="p-4 bg-rose-50 border-2 border-rose-600 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 text-xs text-rose-950">
            <div className="font-mono font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>
                CORRELATION OUT-OF-RANGE FLAG: IMPELLER REYNOLDS NUMBER Re ={' '}
                {physics.reynoldsNumber.toLocaleString()} &lt; 200 (INVALID REGIME)
              </span>
            </div>
            <p>
              At <strong className="font-mono">N = {strParams.stirrerSpeedRpm} rpm</strong>,{' '}
              <strong className="font-mono">V = {strParams.workingVolumeL} L</strong>, and{' '}
              <strong className="font-mono">
                D_i = {physics.impellerDiameterM.toFixed(3)} m (D_i/D_T ={' '}
                {strParams.diameterRatioDiDt.toFixed(2)})
              </strong>
              , the impeller Reynolds number (<strong className="font-mono">Re = {physics.reynoldsNumber}</strong>) falls below the minimum calibrated transitional threshold (<strong className="font-mono">Re_min = 200</strong>; Rushton, Costich &amp; Everett 1950; Bates et al. 1963; Doran 2013). Turbulent and transitional <span className="font-mono">N_p(Re)</span> and Einsele/Cooke mixing-time correlations are <strong>not valid</strong> in this creeping/laminar regime.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateStrParams({
                ...strParams,
                stirrerSpeedRpm: strParams.workingVolumeL <= 10 ? 220 : 115,
                diameterRatioDiDt: 0.4,
              })
            }
            className="px-3.5 py-2 text-xs font-mono font-semibold bg-rose-700 text-white hover:bg-rose-800 shrink-0 cursor-pointer"
          >
            Restore Valid Turbulent Regime (Re ≥ 10,000) →
          </button>
        </div>
      )}

      {/* Transitional Regime Notice Banner When 200 <= Re < 10,000 */}
      {!physics.isReynoldsOutOfRange && physics.reynoldsNumber < 10000 && (
        <div className="p-3.5 bg-amber-50 border border-amber-400 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs text-amber-950">
          <div className="space-y-0.5">
            <div className="font-mono font-bold text-amber-900 uppercase">
              TRANSITIONAL FLOW REGIME DETECTED (200 ≤ Re = {physics.reynoldsNumber.toLocaleString()} &lt; 10,000) — Re-DEPENDENT CORRELATION ACTIVE
            </div>
            <p>
              Outside the fully turbulent regime (<span className="font-mono">Re &lt; 10,000</span>), asymptotic <span className="font-mono">N_p,0 = {currentNp0.toFixed(2)}</span> is automatically corrected to{' '}
              <strong className="font-mono">
                N_p(Re) = {physics.reynoldsCorrectedSingleNp.toFixed(2)}
              </strong>{' '}
              ({activeSpec.transitionalCorrelationDescription}) and viscous circulation penalty is applied to mixing time (<strong className="font-mono">t_m,gas ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s</strong>).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateStrParams({
                ...strParams,
                stirrerSpeedRpm: strParams.workingVolumeL <= 10 ? 240 : 115,
                diameterRatioDiDt: 0.4,
              })
            }
            className="px-3 py-1.5 text-xs font-mono font-semibold bg-amber-800 text-white hover:bg-amber-900 shrink-0 cursor-pointer"
          >
            Return to Fully Turbulent Re
          </button>
        </div>
      )}

      {/* Interactive Controls Bar: Impeller Family Switcher, Np,0 Slider, D_i/D_T Ratio & Re Regime Stress-Test Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Columns: Sensitivity Controls & Re-Regime Probe */}
        <div className="lg:col-span-5 bg-slate-50 border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-xs font-mono font-semibold text-slate-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span>SENSITIVITY PARAMETER CONTROLS</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Auto-Recomputes P/V &amp; t_m
            </span>
          </div>

          {/* 1. Impeller Family Selection */}
          <div>
            <span className="block text-xs font-medium text-slate-800 mb-1.5">
              1. Select Impeller Family &amp; Literature <span className="font-mono">N_p,0</span> Domain
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['marine_axial', 'pitched_blade', 'rushton_radial'] as ImpellerType[]).map(
                (impId) => {
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
                      className={`p-2 text-left border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-semibold">{spec.shortLabel.split(' ')[1]}</div>
                      <div
                        className={`text-[10px] font-mono ${
                          isSelected ? 'text-blue-100' : 'text-blue-700 font-semibold'
                        }`}
                      >
                        Ref: {spec.defaultTurbulentNp0.toFixed(2)}
                      </div>
                      <div
                        className={`text-[10px] font-mono ${
                          isSelected ? 'text-blue-100' : 'text-slate-500'
                        }`}
                      >
                        [{spec.literatureTurbulentNpRange[0].toFixed(2)}–
                        {spec.literatureTurbulentNpRange[1].toFixed(2)}]
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* 2. Literature-Supported Np,0 Sensitivity Slider & Direct Numeric Input */}
          <div className="p-3 bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="sens-np0-slider" className="font-semibold text-slate-900">
                2. Adjust Turbulent <span className="font-mono">N_p,0</span> ({activeSpec.shortLabel})
              </label>
              <div className="flex items-center gap-1.5 font-mono">
                <input
                  id="sens-np0-number"
                  type="number"
                  min={minNp}
                  max={maxNp}
                  step={0.01}
                  value={currentNp0}
                  aria-label="Turbulent power number Np,0"
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    if (Number.isFinite(parsed)) {
                      onUpdateStrParams({
                        ...strParams,
                        customTurbulentNp: Math.min(maxNp, Math.max(minNp, parsed)),
                      });
                    }
                  }}
                  className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold text-blue-700 border border-slate-300 bg-slate-50 text-right"
                />
                <span className="text-[10px] text-slate-500">
                  ({deltaNpPercentDisplay(currentNp0, refNp)})
                </span>
              </div>
            </div>

            <input
              id="sens-np0-slider"
              type="range"
              min={minNp}
              max={maxNp}
              step={0.01}
              value={currentNp0}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  customTurbulentNp: parseFloat(e.target.value),
                })
              }
              className="w-full accent-blue-600 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>Min: {minNp.toFixed(2)}</span>
              <span className="text-blue-700 font-semibold">
                Ref Default: {refNp.toFixed(2)}
              </span>
              <span>Max: {maxNp.toFixed(2)}</span>
            </div>
          </div>

          {/* 3. Impeller Diameter Ratio (Di/Dt) & Reynolds Regime Stress-Test Probe */}
          <div className="p-3 bg-white border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="sens-didt" className="font-medium text-slate-800">
                3. Impeller-to-Tank Ratio (<span className="font-mono">D_i / D_T</span>)
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                D_i/D_T = {strParams.diameterRatioDiDt.toFixed(2)} (D_i ={' '}
                {physics.impellerDiameterM.toFixed(3)} m)
              </span>
            </div>
            <input
              id="sens-didt"
              type="range"
              min={0.18}
              max={0.52}
              step={0.01}
              value={strParams.diameterRatioDiDt}
              onChange={(e) =>
                onUpdateStrParams({
                  ...strParams,
                  diameterRatioDiDt: parseFloat(e.target.value),
                })
              }
              className="w-full accent-blue-600 cursor-pointer"
            />

            {/* Impeller Staging (1, 2, or 3 Impellers) inside Sensitivity Panel */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-medium text-slate-800 block">
                  Impeller Staging (<span className="font-mono">n = 1, 2, 3</span>)
                </span>
                <span className="text-[10px] font-mono text-slate-600">
                  Single {physics.reynoldsCorrectedSingleNp.toFixed(2)} → Total N_p,0 ={' '}
                  <strong className="text-blue-700">
                    {physics.ungassedPowerNumberTotalNp.toFixed(2)}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 shrink-0">
                {[1, 2, 3].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({
                        ...strParams,
                        impellerCount: cnt,
                      })
                    }
                    className={`px-2 py-1 text-[10px] font-mono cursor-pointer ${
                      strParams.impellerCount === cnt
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    {cnt} Imp ({cnt}×)
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] font-mono font-semibold text-slate-600 mb-1.5 uppercase">
                Test Reynolds Regime &amp; Correlation Boundaries:
              </div>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      workingVolumeL: 500,
                      stirrerSpeedRpm: 115,
                      diameterRatioDiDt: 0.4,
                    })
                  }
                  className={`p-1.5 border text-center cursor-pointer ${
                    physics.reynoldsNumber >= 10000
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>Turbulent</div>
                  <div className="text-[9px] text-emerald-700">Re ≥ 10,000</div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      workingVolumeL: 3,
                      stirrerSpeedRpm: 28,
                      diameterRatioDiDt: 0.28,
                    })
                  }
                  className={`p-1.5 border text-center cursor-pointer ${
                    !physics.isReynoldsOutOfRange && physics.reynoldsNumber < 10000
                      ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>Transitional</div>
                  <div className="text-[9px] text-amber-700">200 ≤ Re &lt; 10⁴</div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      workingVolumeL: 3,
                      stirrerSpeedRpm: 3,
                      diameterRatioDiDt: 0.2,
                    })
                  }
                  className={`p-1.5 border text-center cursor-pointer ${
                    physics.isReynoldsOutOfRange
                      ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>Out of Range</div>
                  <div className="text-[9px] text-rose-700">Flag Re &lt; 200</div>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Instantaneous Delta Summary Cards vs Reference Np,0 */}
          <div className="grid grid-cols-2 gap-2.5 font-mono text-xs tabular-nums">
            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">
                RECOMPUTED GASSED P_g / V
              </span>
              <span className="text-base font-bold text-blue-700">
                {physics.specificPowerWPerM3.toFixed(1)} W/m³
              </span>
              <span className="text-[10px] text-slate-600 block">
                P_0/V: {physics.ungassedSpecificPowerWPerM3.toFixed(1)} W/m³ (
                {deltaPvVsRefPct >= 0 ? '+' : ''}
                {deltaPvVsRefPct.toFixed(0)}% vs Ref)
              </span>
            </div>

            <div className="p-3 bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 block">
                RECOMPUTED MIXING TIME t_m
              </span>
              <span
                className={`text-base font-bold ${
                  physics.isMixingRateLimiting ? 'text-rose-700' : 'text-teal-800'
                }`}
              >
                ~{formatTwoSigFigs(physics.mixingTimeGassedS)} s
              </span>
              <span className="text-[10px] text-slate-600 block">
                θ_95%: ~{formatTwoSigFigs(physics.mixingTimeUngassedS)} s (
                {deltaTmVsRefPct >= 0 ? '+' : ''}
                {deltaTmVsRefPct.toFixed(0)}% vs Ref)
              </span>
            </div>
          </div>
        </div>

        {/* Right 7 Columns: Dual-Curve SVG Sensitivity Plot (P/V and Mixing Time vs Np,0) */}
        <div className="lg:col-span-7 bg-slate-50 border border-slate-200 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div>
              <div className="text-[11px] font-mono text-slate-500 uppercase">
                COUPLED RESPONSE SURFACE ACROSS LITERATURE N_p,0 RANGE [{minNp.toFixed(2)}–{maxNp.toFixed(2)}]
              </div>
              <h4 className="text-sm font-semibold text-slate-900">
                Specific Power (<span className="font-mono">P_g/V</span>, <span className="font-mono">P_0/V</span>) &amp; Gassed Mixing Time (<span className="font-mono">t_m,gas</span>) vs. Impeller Power Number (<span className="font-mono">N_p,0</span>)
              </h4>
            </div>
            <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-1 border border-slate-200">
              Click any point on curve to set N_p,0
            </span>
          </div>

          <svg
            viewBox="0 0 620 275"
            className="w-full h-auto bg-white border border-slate-200 select-none overflow-visible"
            role="img"
            aria-label="Sensitivity chart showing specific power P/V and gassed mixing time tm across the literature power number range"
          >
            {/* Horizontal Grid Lines & Left/Right Axis Ticks */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
              const y = plotBottom - frac * plotHeight;
              const pvTick = Math.round(frac * maxPvScale);
              const tmTick = Math.round(frac * maxTmScale);
              return (
                <g key={frac}>
                  <line
                    x1={plotLeft}
                    y1={y}
                    x2={plotRight}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                  {/* Left Y-Axis: Specific Power P/V (W/m^3) */}
                  <text
                    x={plotLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] font-mono fill-blue-700 font-semibold"
                  >
                    {pvTick}
                  </text>
                  {/* Right Y-Axis: Mixing Time t_m (s) */}
                  <text
                    x={plotRight + 8}
                    y={y + 3}
                    textAnchor="start"
                    className="text-[9px] font-mono fill-teal-800 font-semibold"
                  >
                    {tmTick} s
                  </text>
                </g>
              );
            })}

            {/* X-Axis Ticks (Np,0 values across literature range) */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
              const npVal = minNp + frac * (maxNp - minNp);
              const x = mapNpToX(npVal);
              return (
                <g key={frac}>
                  <line
                    x1={x}
                    y1={plotTop}
                    x2={x}
                    y2={plotBottom}
                    stroke="#F1F5F9"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={plotBottom + 14}
                    textAnchor="middle"
                    className="text-[9px] font-mono fill-slate-700"
                  >
                    {npVal.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={(plotLeft + plotRight) / 2}
              y={268}
              textAnchor="middle"
              className="text-[10px] font-mono fill-slate-800 font-semibold"
            >
              TURBULENT REFERENCE POWER NUMBER N_p,0 ({activeSpec.name.toUpperCase()})
            </text>
            <text
              x={16}
              y={(plotTop + plotBottom) / 2}
              textAnchor="middle"
              transform={`rotate(-90, 16, ${(plotTop + plotBottom) / 2})`}
              className="text-[10px] font-mono fill-blue-700 font-semibold"
            >
              SPECIFIC POWER P/V [W/m³]
            </text>
            <text
              x={606}
              y={(plotTop + plotBottom) / 2}
              textAnchor="middle"
              transform={`rotate(90, 606, ${(plotTop + plotBottom) / 2})`}
              className="text-[10px] font-mono fill-teal-800 font-semibold"
            >
              GASSED MIXING TIME t_m,gas [s]
            </text>

            {/* 60 s Mixing Time Limit Horizontal Line (if within scale) */}
            {maxTmScale >= 60 && (
              <g>
                <line
                  x1={plotLeft}
                  y1={mapTmToY(60)}
                  x2={plotRight}
                  y2={mapTmToY(60)}
                  stroke="#D97706"
                  strokeWidth="1.5"
                  strokeDasharray="4,3"
                />
                <text
                  x={plotRight - 6}
                  y={mapTmToY(60) - 5}
                  textAnchor="end"
                  className="text-[9px] font-mono fill-amber-700 font-semibold"
                >
                  Max Safe Mixing Time (t_m ≤ 60 s)
                </text>
              </g>
            )}

            {/* Reference Default Np,0 Vertical Line */}
            <line
              x1={refX}
              y1={plotTop}
              x2={refX}
              y2={plotBottom}
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
            <text
              x={refX}
              y={plotTop - 6}
              textAnchor="middle"
              className="text-[9px] font-mono fill-slate-600 font-semibold"
            >
              Ref N_p,0 = {refNp.toFixed(2)}
            </text>

            {/* Active User Np,0 Vertical Highlight Line */}
            <line
              x1={activeX}
              y1={plotTop}
              x2={activeX}
              y2={plotBottom}
              stroke="#1D4ED8"
              strokeWidth="2"
            />

            {/* Curve 1A: Ungassed Specific Power P_0/V (Dashed Slate) */}
            <polyline
              fill="none"
              stroke="#64748B"
              strokeWidth="1.8"
              strokeDasharray="4,3"
              points={ungassedPvPolyline}
            />

            {/* Curve 1B: Gassed Specific Power P_g/V (Solid Blue) */}
            <polyline
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.6"
              points={gassedPvPolyline}
            />

            {/* Curve 2: Gassed Mixing Time t_m,gas (Solid Teal) */}
            <polyline
              fill="none"
              stroke="#0F766E"
              strokeWidth="2.6"
              points={mixingTimePolyline}
            />

            {/* Clickable Sample Points Along Curves */}
            {continuousCurvePoints.map((pt) => {
              const cxPt = mapNpToX(pt.np0);
              const cyPv = mapPvToY(pt.gassedPvWPerM3);
              const cyTm = mapTmToY(pt.mixingTimeGassedS);
              return (
                <g
                  key={pt.np0}
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      customTurbulentNp: pt.np0,
                    })
                  }
                  className="cursor-pointer"
                >
                  <circle
                    cx={cxPt}
                    cy={cyPv}
                    r={3.5}
                    fill="#2563EB"
                    stroke="#FFFFFF"
                    strokeWidth="1"
                  />
                  <circle
                    cx={cxPt}
                    cy={cyTm}
                    r={3.5}
                    fill="#0F766E"
                    stroke="#FFFFFF"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

            {/* Active User Operating Markers */}
            <circle
              cx={activeX}
              cy={activeGassedPvY}
              r={6.5}
              fill={physics.isReynoldsOutOfRange ? '#E11D48' : '#1D4ED8'}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <circle
              cx={activeX}
              cy={activeTmY}
              r={6.5}
              fill={physics.isMixingRateLimiting ? '#E11D48' : '#0F766E'}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </svg>

          {/* Chart Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-700 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-600 inline-block" />
              <strong>Solid Blue:</strong> Gassed P_g/V (W/m³)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-slate-500 inline-block" />
              <strong>Dashed Slate:</strong> Ungassed P_0/V (W/m³)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-teal-700 inline-block" />
              <strong>Solid Teal:</strong> Gassed Mixing Time t_m,gas (s)
            </span>
          </div>
        </div>
      </div>

      {/* 7-Point Literature Range Sensitivity Matrix Table */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Sensitivity Matrix Across Literature <span className="font-mono">N_p,0</span> Range for{' '}
              {activeSpec.name} ({strParams.workingVolumeL} L, {strParams.stirrerSpeedRpm} rpm)
            </h4>
            <p className="text-xs text-slate-600">
              Click any row to apply that <span className="font-mono">N_p,0</span> value to the reactor mass-balance and operating window. Rows with <span className="font-mono">Re &lt; 200</span> are flagged as outside valid correlation bounds.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Staging: {strParams.impellerCount} Impeller{strParams.impellerCount > 1 ? 's' : ''} (×{physics.multiImpellerStagingFactor.toFixed(2)}) · Baffling: ×{physics.bafflingFactor.toFixed(2)}
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-600">
                <th className="py-2 px-3">Turbulent N_p,0 (Δ vs Ref)</th>
                <th className="py-2 px-3">Re &amp; Correlation Status</th>
                <th className="py-2 px-3">Single N_p(Re) → Total N_p,0</th>
                <th className="py-2 px-3">Ungassed P_0/V</th>
                <th className="py-2 px-3">Gassed P_g/V (P_g/P_0)</th>
                <th className="py-2 px-3">Mixing Time t_m,gas (θ_95%)</th>
                <th className="py-2 px-3">OTR &amp; Shear τ</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {tableSweepPoints.map((row) => (
                <tr
                  key={row.np0}
                  onClick={() =>
                    onUpdateStrParams({
                      ...strParams,
                      customTurbulentNp: row.np0,
                    })
                  }
                  className={`cursor-pointer transition-colors ${
                    row.isActiveUserPoint
                      ? 'bg-blue-50/90 text-slate-950 font-semibold'
                      : row.isReOutOfRange
                      ? 'bg-rose-50/60 hover:bg-rose-100/60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">
                        {row.np0.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ({row.deltaNpPercent >= 0 ? '+' : ''}
                        {row.deltaNpPercent.toFixed(0)}%)
                      </span>
                      {row.isDefaultRef && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-slate-200 text-slate-800 font-bold">
                          REF
                        </span>
                      )}
                      {row.isActiveUserPoint && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-blue-600 text-white font-bold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    {row.isReOutOfRange ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-rose-100 text-rose-900 border border-rose-300 font-bold">
                        ✖ OUT OF RANGE (Re={row.reynoldsNumber})
                      </span>
                    ) : row.isTransitionalRe ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                        ▲ TRANSITIONAL (Re={row.reynoldsNumber.toLocaleString()})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                        ● TURBULENT (Re={row.reynoldsNumber.toLocaleString()})
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {row.reCorrectedNp.toFixed(2)} →{' '}
                    <strong>{row.totalUngassedNp.toFixed(2)}</strong>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">
                    {row.ungassedPvWPerM3.toFixed(1)} W/m³
                  </td>
                  <td className="py-2.5 px-3 text-blue-700 font-bold">
                    {row.gassedPvWPerM3.toFixed(1)} W/m³{' '}
                    <span className="text-[10px] font-normal text-slate-500">
                      (×{row.gassingFactorPgP0.toFixed(2)})
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={
                        row.mixingTimeGassedS > 60
                          ? 'text-rose-700 font-bold'
                          : 'text-teal-800 font-bold'
                      }
                    >
                      ~{formatTwoSigFigs(row.mixingTimeGassedS)} s
                    </span>{' '}
                    <span className="text-[10px] text-slate-500">
                      (θ_95% ~{formatTwoSigFigs(row.mixingTimeUngassedS)} s)
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span>OTR {row.otrMmolPerLHour.toFixed(1)}</span> ·{' '}
                    <span
                      className={
                        row.shearStressPa > groundedParams.shearThresholdPa
                          ? 'text-rose-700 font-bold'
                          : 'text-slate-700'
                      }
                    >
                      τ {row.shearStressPa.toFixed(2)} Pa
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateStrParams({
                          ...strParams,
                          customTurbulentNp: row.np0,
                        });
                      }}
                      className={`px-2 py-1 text-[10px] font-mono border cursor-pointer ${
                        row.isActiveUserPoint
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {row.isActiveUserPoint ? 'Selected' : 'Apply N_p,0'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross-Impeller Family Literature Envelope Summary (Marine vs Pitched-Blade vs Rushton) */}
      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="text-xs font-semibold text-slate-900">
          Cross-Impeller Family Envelope Comparison at Current Vessel Conditions ({strParams.workingVolumeL} L, {strParams.stirrerSpeedRpm} rpm, D_i/D_T = {strParams.diameterRatioDiDt.toFixed(2)})
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {crossImpellerComparison.map(({ spec, activeNp, minPhys, refPhys, maxPhys }) => {
            const isCurrentFamily = spec.id === strParams.impellerType;
            return (
              <div
                key={spec.id}
                className={`p-3.5 border space-y-1.5 ${
                  isCurrentFamily
                    ? 'bg-blue-50/40 border-blue-500'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{spec.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStrParams({
                        ...strParams,
                        impellerType: spec.id,
                        customTurbulentNp: activeNp,
                      })
                    }
                    className={`px-2 py-0.5 text-[10px] font-mono border cursor-pointer ${
                      isCurrentFamily
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {isCurrentFamily ? 'Active Family' : 'Select'}
                  </button>
                </div>
                <div className="font-mono text-[11px] text-slate-700 space-y-0.5 tabular-nums">
                  <div>
                    Lit. N_p,0 Range:{' '}
                    <strong>
                      {spec.literatureTurbulentNpRange[0].toFixed(2)}–
                      {spec.literatureTurbulentNpRange[1].toFixed(2)}
                    </strong>{' '}
                    (Ref {spec.defaultTurbulentNp0.toFixed(2)})
                  </div>
                  <div>
                    Gassed P_g/V Span:{' '}
                    <strong className="text-blue-700">
                      {minPhys.specificPowerWPerM3.toFixed(1)}–
                      {maxPhys.specificPowerWPerM3.toFixed(1)} W/m³
                    </strong>{' '}
                    (Ref {refPhys.specificPowerWPerM3.toFixed(1)} W/m³)
                  </div>
                  <div>
                    Mixing Time t_m,gas Span:{' '}
                    <strong className="text-teal-800">
                      ~{formatTwoSigFigs(maxPhys.mixingTimeGassedS)}–
                      {formatTwoSigFigs(minPhys.mixingTimeGassedS)} s
                    </strong>
                  </div>
                  <div>
                    Local ε_T,max Span:{' '}
                    <strong>
                      {minPhys.localMaxEnergyDissipationWPerKg.toFixed(2)}–
                      {maxPhys.localMaxEnergyDissipationWPerKg.toFixed(2)} W/kg
                    </strong>{' '}
                    (Φ = {spec.trailingVortexEnergyFactorPhi}×)
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function deltaNpPercentDisplay(current: number, ref: number): string {
  const pct = ((current - ref) / Math.max(0.01, ref)) * 100;
  if (Math.abs(pct) < 0.5) return 'Ref Default';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs Ref`;
}
