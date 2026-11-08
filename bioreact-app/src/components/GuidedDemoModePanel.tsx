import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  AcquisitionStrategy,
  AuditedParameterProvenanceRecord,
  BiologicCandidate,
  CandidatePathwayMode,
  DatabaseStreamRecord,
  DownstreamCogsResult,
  DownstreamEconomicParams,
  ExperimentObservation,
  GroundedSimulatorParams,
  HollowFibrePhysicsParams,
  HumanSafetyGate,
  ImpellerType,
  LiveEightSeedBenchmarkSummary,
  MassBalanceAndPhysicsResult,
  ProposedReactorConfiguration,
  ReactorConfiguration,
  ReactorOptimisationObjectivePresetId,
  ReactorOptimisationObjectiveWeights,
  SafetyGateId,
  SafetyGateStatus,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import {
  DEFAULT_HF_PHYSICS,
  DEFAULT_STR_PHYSICS,
  IMPELLER_GEOMETRY_SPECS,
} from '../data/bioprocessData';
import {
  CLOSED_LOOP_DATASETS,
  PROTEIN_TARGETS_3D,
  getModesForSmiles,
} from '../data/dissertationDockingData';
import {
  computeRadarLoadPercentages,
  formatCogsHeadline,
  optimiseUnifiedReactorConfiguration,
  solveMassBalanceAndReactorPhysics,
} from '../services/bioprocessEngine';
import { WorkbenchSectionId } from './UnifiedWorkbenchHomePanel';

export type GuidedDemoStep = 1 | 2 | 3 | 4;

interface GuidedDemoModePanelProps {
  candidate: BiologicCandidate;
  allBiologicCandidates: BiologicCandidate[];
  onSelectCandidate: (candidateId: string) => void;
  candidatePathwayMode: CandidatePathwayMode;
  onChangePathwayMode: (mode: CandidatePathwayMode) => void;
  groundedParams: GroundedSimulatorParams;
  strParams: StirredTankPhysicsParams;
  hfParams: HollowFibrePhysicsParams;
  physicsResult: MassBalanceAndPhysicsResult;
  onUpdateStrParams: (next: StirredTankPhysicsParams) => void;
  onUpdateHfParams: (next: HollowFibrePhysicsParams) => void;
  onTriggerOxygenDeficitDemo: () => void;
  selectedReactor: ReactorConfiguration;
  observations: ExperimentObservation[];
  onRunNextExperiment: (
    strategy: AcquisitionStrategy,
    manualCoords?: { x1_vvd: number; x2_do: number; tempC?: number }
  ) => void;
  downstreamEcon: DownstreamEconomicParams;
  downstreamCogs: DownstreamCogsResult;
  safetyGates: HumanSafetyGate[];
  onUpdateSafetyGate: (
    gateId: SafetyGateId,
    status: SafetyGateStatus,
    reviewerName: string,
    justification: string
  ) => void;
  onApproveAllDemoGates: () => void;
  records: DatabaseStreamRecord[];
  prismaIncludedCount: number;
  provenanceLedger: AuditedParameterProvenanceRecord[];
  liveEightSeedSummary: LiveEightSeedBenchmarkSummary;
  onSwitchToWorkbenchSection: (section: WorkbenchSectionId) => void;
}

const ELEMENT_COLORS: Record<string, number> = {
  C: 0x00e5ff,
  N: 0x3b82f6,
  O: 0xf43f5e,
  S: 0xfacc15,
  F: 0x4ade80,
  Cl: 0x22c55e,
  Br: 0xd97706,
  P: 0xf97316,
};

type Step1ShowcaseSelection =
  | 'route_a_mrp1_lead'
  | 'route_a_mrp1_failed_hit'
  | 'route_b_her2_trastuzumab';

const DEMO_OBJECTIVE_PRESETS: Record<
  ReactorOptimisationObjectivePresetId,
  {
    label: string;
    plainDesc: string;
    weights: ReactorOptimisationObjectiveWeights;
  }
> = {
  balanced_all_constraints: {
    label: 'Balanced All-Round (Recommended)',
    plainDesc:
      'Solves oxygen supply while reducing mixing time, filter pressure drop, and cell shear together.',
    weights: {
      minimiseMixingTime: 85,
      minimiseFilterPressureDrop: 85,
      maximiseOxygenTransfer: 85,
      minimiseShearStress: 80,
      balanceProductivityAndCost: 75,
    },
  },
  minimise_mixing_and_filter_dp: {
    label: 'Fastest Mixing & Lowest Filter Pressure',
    plainDesc:
      'Prioritises rapid vessel homogenisation (t_m < 35 s) and low hollow-fibre pressure drop.',
    weights: {
      minimiseMixingTime: 100,
      minimiseFilterPressureDrop: 100,
      maximiseOxygenTransfer: 65,
      minimiseShearStress: 65,
      balanceProductivityAndCost: 50,
    },
  },
  maximise_otr_and_productivity: {
    label: 'Maximum Oxygen Margin & Output',
    plainDesc:
      'Maximises dissolved oxygen headroom (OTR − OUR) for high-density perfusion.',
    weights: {
      minimiseMixingTime: 65,
      minimiseFilterPressureDrop: 65,
      maximiseOxygenTransfer: 100,
      minimiseShearStress: 60,
      balanceProductivityAndCost: 95,
    },
  },
  minimise_shear_cell_protection: {
    label: 'Gentlest Cell Shear Protection',
    plainDesc:
      'Keeps impeller tip shear and hollow-fibre wall stress as low as possible for fragile CHO cells.',
    weights: {
      minimiseMixingTime: 55,
      minimiseFilterPressureDrop: 85,
      maximiseOxygenTransfer: 70,
      minimiseShearStress: 100,
      balanceProductivityAndCost: 60,
    },
  },
  balance_productivity_energy_cost: {
    label: 'Lowest Power & Gas Cost',
    plainDesc:
      'Minimises agitation power per litre, pure O₂ consumption, and downstream $/g cost.',
    weights: {
      minimiseMixingTime: 55,
      minimiseFilterPressureDrop: 70,
      maximiseOxygenTransfer: 65,
      minimiseShearStress: 75,
      balanceProductivityAndCost: 100,
    },
  },
};

export const GuidedDemoModePanel: React.FC<GuidedDemoModePanelProps> = ({
  candidate,
  allBiologicCandidates,
  onSelectCandidate,
  candidatePathwayMode,
  onChangePathwayMode,
  groundedParams,
  strParams,
  hfParams,
  physicsResult,
  onUpdateStrParams,
  onUpdateHfParams,
  onTriggerOxygenDeficitDemo,
  onRunNextExperiment,
  downstreamEcon,
  downstreamCogs,
  safetyGates,
  onUpdateSafetyGate,
  onApproveAllDemoGates,
  records,
  prismaIncludedCount,
  provenanceLedger,
  liveEightSeedSummary,
  onSwitchToWorkbenchSection,
}) => {
  const [activeStep, setActiveStep] = useState<GuidedDemoStep>(1);

  // Expandable "Scientific Details" / "Show Scientific Reasoning" toggles per step
  const [showStep1Details, setShowStep1Details] = useState<boolean>(false);
  const [showStep2Reasoning, setShowStep2Reasoning] = useState<boolean>(false);
  const [showStep3Details, setShowStep3Details] = useState<boolean>(false);
  const [showStep4Details, setShowStep4Details] = useState<boolean>(false);

  // Step 1: 3D Viewer & Candidate Showcase State
  const [step1Selection, setStep1Selection] = useState<Step1ShowcaseSelection>(
    candidatePathwayMode === 'small_molecule_chemical'
      ? 'route_a_mrp1_lead'
      : 'route_b_her2_trastuzumab'
  );
  const [selectedPoseMode, setSelectedPoseMode] = useState<number>(1);
  const [showPocketSurface, setShowPocketSurface] = useState<boolean>(true);
  const [showContactSticks, setShowContactSticks] = useState<boolean>(true);
  const [cameraResetTick, setCameraResetTick] = useState<number>(0);
  const viewerMountRef = useRef<HTMLDivElement | null>(null);

  // Step 3: "Ask bioREACT What to Test Next" State
  const [activePresetId, setActivePresetId] =
    useState<ReactorOptimisationObjectivePresetId>('balanced_all_constraints');
  const [recalcCount, setRecalcCount] = useState<number>(1);
  const [lastAppliedConfigId, setLastAppliedConfigId] = useState<string | null>(null);

  // Step 4: Reviewer Name for Human Approval Gate
  const [reviewerName, setReviewerName] = useState<string>(
    'Simulated Demo Reviewer — Bioprocess Engineer'
  );

  // Baseline 500 L Open-Pipe Air Deficit Reference for Before/After comparison
  const baseline500LStrParams: StirredTankPhysicsParams = useMemo(
    () => ({
      ...DEFAULT_STR_PHYSICS,
      workingVolumeL: 500,
      spargerType: 'open_pipe',
      impellerType: 'marine_axial',
      impellerCount: 2,
      stirrerSpeedRpm: 115,
      spargeRateVvm: 0.04,
      oxygenEnrichmentFraction: 0.21,
      targetVcdE6PerMl: 43.5,
    }),
    []
  );

  const baselinePhysics = useMemo(
    () =>
      solveMassBalanceAndReactorPhysics(
        baseline500LStrParams,
        DEFAULT_HF_PHYSICS,
        groundedParams,
        groundedParams.optimalVvd,
        groundedParams.optimalDoPercent
      ),
    [baseline500LStrParams, groundedParams]
  );

  const currentRadarLoads = useMemo(
    () => computeRadarLoadPercentages(strParams, groundedParams, physicsResult),
    [strParams, groundedParams, physicsResult]
  );

  // Live Unified Multi-Objective Optimiser Suite (Step 3)
  const activeWeights = DEMO_OBJECTIVE_PRESETS[activePresetId].weights;
  const unifiedSuite = useMemo(
    () =>
      optimiseUnifiedReactorConfiguration(
        strParams,
        hfParams,
        groundedParams,
        activeWeights,
        downstreamEcon
      ),
    [strParams, hfParams, groundedParams, activeWeights, downstreamEcon]
  );

  // Pull real MRP1 docked small molecules from CLOSED_LOOP_DATASETS
  const mrp1LeadCandidate = useMemo(() => {
    const shortlist = CLOSED_LOOP_DATASETS.cache.final_shortlist;
    return (
      shortlist.find((c) => c.dock_affinity <= -10.8) ||
      shortlist[0] ||
      CLOSED_LOOP_DATASETS.cache.rounds[1].candidates[0]
    );
  }, []);

  const mrp1FailedHit = useMemo(() => {
    const round1 = CLOSED_LOOP_DATASETS.cache.rounds[0]?.candidates || [];
    return (
      round1.find((c) => c.overall_verdict === 'fail') ||
      round1[0] ||
      mrp1LeadCandidate
    );
  }, [mrp1LeadCandidate]);

  const activeTarget3D = useMemo(() => {
    if (step1Selection === 'route_b_her2_trastuzumab') {
      return PROTEIN_TARGETS_3D.HER2;
    }
    return PROTEIN_TARGETS_3D.MRP1;
  }, [step1Selection]);

  const activePoseModes = useMemo(() => {
    if (step1Selection === 'route_b_her2_trastuzumab') {
      return getModesForSmiles(
        PROTEIN_TARGETS_3D.HER2,
        PROTEIN_TARGETS_3D.HER2.referenceLigandSmiles,
        PROTEIN_TARGETS_3D.HER2.referenceAffinityKcalMol
      );
    }
    const entry =
      step1Selection === 'route_a_mrp1_failed_hit' ? mrp1FailedHit : mrp1LeadCandidate;
    return getModesForSmiles(
      PROTEIN_TARGETS_3D.MRP1,
      entry.smiles,
      entry.dock_affinity
    );
  }, [step1Selection, mrp1LeadCandidate, mrp1FailedHit]);

  const currentPose =
    activePoseModes.find((m) => m.mode === selectedPoseMode) || activePoseModes[0];

  // Render Three.js WebGL 3D Molecular Viewer in Step 1
  useEffect(() => {
    if (activeStep !== 1) return;
    const container = viewerMountRef.current;
    if (!container) return;

    const width = container.clientWidth || 560;
    const height = container.clientHeight || 340;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);

    const [cx, cy, cz] = activeTarget3D.boxCenter;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(cx + 17.5, cy + 11.5, cz + 20.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, cy, cz);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.65;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.15);
    dirLight1.position.set(cx + 28, cy + 36, cz + 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.55);
    dirLight2.position.set(cx - 28, cy - 22, cz - 18);
    scene.add(dirLight2);

    // 1. Target receptor helices
    activeTarget3D.helices.forEach((h) => {
      const startVec = new THREE.Vector3(...h.start);
      const endVec = new THREE.Vector3(...h.end);
      const dir = new THREE.Vector3().subVectors(endVec, startVec);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

      const geom = new THREE.CylinderGeometry(h.radius, h.radius, len, 20);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(h.color),
        transparent: true,
        opacity: 0.48,
        roughness: 0.3,
        metalness: 0.1,
      });
      const cyl = new THREE.Mesh(geom, mat);
      cyl.position.copy(mid);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      scene.add(cyl);
    });

    // 2. Pocket Surface & Docking Box
    if (showPocketSurface) {
      const [sx, sy, sz] = activeTarget3D.boxSize;
      const boxGeom = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(boxGeom);
      const lineMat = new THREE.LineBasicMaterial({
        color:
          step1Selection === 'route_b_her2_trastuzumab'
            ? 0x38bdf8
            : step1Selection === 'route_a_mrp1_failed_hit'
            ? 0xf43f5e
            : 0x10b981,
        transparent: true,
        opacity: 0.4,
      });
      const boxLines = new THREE.LineSegments(edges, lineMat);
      boxLines.position.set(cx, cy, cz);
      scene.add(boxLines);

      const pocketGeom = new THREE.SphereGeometry(6.8, 24, 24);
      const pocketMat = new THREE.MeshBasicMaterial({
        color:
          step1Selection === 'route_b_her2_trastuzumab'
            ? 0x38bdf8
            : step1Selection === 'route_a_mrp1_failed_hit'
            ? 0xf43f5e
            : 0x10b981,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      });
      const pocketMesh = new THREE.Mesh(pocketGeom, pocketMat);
      pocketMesh.position.set(cx, cy, cz);
      scene.add(pocketMesh);
    }

    // 3. Binding Pocket Contact Residues
    if (showContactSticks) {
      activeTarget3D.contactResidues.forEach((res) => {
        res.atoms.forEach((a) => {
          const sphereGeom = new THREE.SphereGeometry(0.26, 12, 12);
          const sphereMat = new THREE.MeshStandardMaterial({
            color: a.element === 'C' ? 0xfacc15 : ELEMENT_COLORS[a.element] || 0x94a3b8,
            roughness: 0.35,
          });
          const mesh = new THREE.Mesh(sphereGeom, sphereMat);
          mesh.position.set(a.x, a.y, a.z);
          scene.add(mesh);
        });
      });
    }

    // 4. Ligand Atoms & Covalent Bonds
    if (currentPose) {
      const atoms = currentPose.ligandAtoms;
      atoms.forEach((atom) => {
        const radius = atom.element === 'C' ? 0.38 : 0.44;
        const geom = new THREE.SphereGeometry(radius, 18, 18);
        const mat = new THREE.MeshPhysicalMaterial({
          color: ELEMENT_COLORS[atom.element] || 0x00e5ff,
          roughness: 0.2,
          metalness: 0.15,
        });
        const sphere = new THREE.Mesh(geom, mat);
        sphere.position.set(atom.x, atom.y, atom.z);
        scene.add(sphere);
      });

      for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const a = atoms[i];
          const b = atoms[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          if (dist > 0.4 && dist < 1.95) {
            const vA = new THREE.Vector3(a.x, a.y, a.z);
            const vB = new THREE.Vector3(b.x, b.y, b.z);
            const dir = new THREE.Vector3().subVectors(vB, vA);
            const mid = new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5);
            const cylGeom = new THREE.CylinderGeometry(0.12, 0.12, dist, 10);
            const cylMat = new THREE.MeshStandardMaterial({
              color: 0xe2e8f0,
              roughness: 0.3,
            });
            const bond = new THREE.Mesh(cylGeom, cylMat);
            bond.position.copy(mid);
            bond.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              dir.clone().normalize()
            );
            scene.add(bond);
          }
        }
      }
    }

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 560;
      const h = container.clientHeight || 340;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    activeStep,
    activeTarget3D,
    currentPose,
    showPocketSurface,
    showContactSticks,
    step1Selection,
    cameraResetTick,
  ]);

  const isO2Starved = physicsResult.otrMmolPerLHour < physicsResult.ourMmolPerLHour;
  const isShearViolated =
    physicsResult.estimatedShearStressPa > groundedParams.shearThresholdPa ||
    physicsResult.kolmogorovScaleUm <= 18;
  const isMixingSlow = physicsResult.mixingTimeGassedS > 60;
  const isFilterViolated =
    physicsResult.hfPressureDropKpa > 25 ||
    physicsResult.hfWallShearStressPa > groundedParams.shearThresholdPa;
  const isAllPhysicsFeasible =
    physicsResult.isScaleUpFeasible &&
    !isO2Starved &&
    !isShearViolated &&
    !isMixingSlow &&
    !isFilterViolated;

  const gate2 = safetyGates.find((g) => g.id === 'gate2_reactor');
  const gate4 = safetyGates.find((g) => g.id === 'gate4_protocol');
  const isHumanApproved =
    gate2?.status === 'Approved' && gate4?.status === 'Approved';

  const handleApplyProposedConfig = (cfg: ProposedReactorConfiguration) => {
    onUpdateStrParams(cfg.strParams);
    onUpdateHfParams(cfg.hfParams);
    setLastAppliedConfigId(cfg.id);
  };

  // Animated Bioreactor SVG visual helpers for Step 2
  const rotationDurationSec = Math.max(
    0.35,
    Math.min(3.0, 60 / Math.max(20, strParams.stirrerSpeedRpm))
  );
  const impellerStageYs =
    strParams.impellerCount === 1
      ? [235]
      : strParams.impellerCount === 2
      ? [180, 240]
      : [130, 185, 240];
  const bladeHalfSpanPx = Math.round(28 + (strParams.diameterRatioDiDt - 0.3) * 110);

  return (
    <section
      aria-label="Guided Demo Mode — 4-Minute Hackathon Pitch Flow"
      className="space-y-4"
    >
      {/* Top 4-Step Guided Stepper Bar */}
      <div className="bg-white border border-slate-300 shadow-xs p-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider bg-blue-600 text-white">
              GUIDED DEMO MODE · 4-MINUTE PITCH FLOW
            </span>
            <span className="text-xs text-slate-600">
              Connected to the live <strong>bioREACT</strong> physics, docking, and Bayesian optimisation engine — changes sync immediately with Research Workbench.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={activeStep === 1}
              onClick={() =>
                setActiveStep((prev) => Math.max(1, prev - 1) as GuidedDemoStep)
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Prev Step
            </button>
            <button
              type="button"
              disabled={activeStep === 4}
              onClick={() =>
                setActiveStep((prev) => Math.min(4, prev + 1) as GuidedDemoStep)
              }
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-mono font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
            >
              Next Step
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Step 1 Tab */}
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`text-left p-2.5 border transition-colors cursor-pointer ${
              activeStep === 1
                ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-bold text-blue-800">STEP 1 · 0:00–1:00</span>
              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-800 font-semibold">
                {candidatePathwayMode === 'small_molecule_chemical'
                  ? 'Route A (Small Mol)'
                  : `Route B (${candidate.genericName})`}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1">
              1. Choose a Medicine
            </div>
            <div className="text-[11px] text-slate-600 truncate">
              3D Molecular Viewer &amp; Manufacturing Route
            </div>
          </button>

          {/* Step 2 Tab */}
          <button
            type="button"
            onClick={() => {
              if (candidatePathwayMode === 'small_molecule_chemical') {
                onChangePathwayMode('established_biologic');
              }
              setActiveStep(2);
            }}
            className={`text-left p-2.5 border transition-colors cursor-pointer ${
              activeStep === 2
                ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-bold text-blue-800">STEP 2 · 1:00–2:00</span>
              <span
                className={`px-1.5 py-0.5 font-semibold ${
                  isO2Starved || !isAllPhysicsFeasible
                    ? 'bg-rose-100 text-rose-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                {isO2Starved
                  ? `O₂ Deficit (${physicsResult.otrMmolPerLHour.toFixed(1)} < ${physicsResult.ourMmolPerLHour.toFixed(1)})`
                  : isAllPhysicsFeasible
                  ? '500 L Feasible'
                  : 'Constraint Alert'}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1">
              2. Discover the Bottleneck
            </div>
            <div className="text-[11px] text-slate-600 truncate">
              Interactive 500 L CHO Bioreactor Cutaway
            </div>
          </button>

          {/* Step 3 Tab */}
          <button
            type="button"
            onClick={() => {
              if (candidatePathwayMode === 'small_molecule_chemical') {
                onChangePathwayMode('established_biologic');
              }
              setActiveStep(3);
            }}
            className={`text-left p-2.5 border transition-colors cursor-pointer ${
              activeStep === 3
                ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-bold text-blue-800">STEP 3 · 2:00–3:15</span>
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-900 font-semibold">
                {unifiedSuite.rankedConfigurations.length} Ranked Recipes
              </span>
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1">
              3. Ask bioREACT What to Test Next
            </div>
            <div className="text-[11px] text-slate-600 truncate">
              Live Multi-Objective Next Experiments
            </div>
          </button>

          {/* Step 4 Tab */}
          <button
            type="button"
            onClick={() => setActiveStep(4)}
            className={`text-left p-2.5 border transition-colors cursor-pointer ${
              activeStep === 4
                ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-bold text-blue-800">STEP 4 · 3:15–4:00</span>
              <span
                className={`px-1.5 py-0.5 font-semibold ${
                  isHumanApproved && isAllPhysicsFeasible
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {isHumanApproved && isAllPhysicsFeasible
                  ? 'Human Approved'
                  : 'Sign-Off Required'}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-900 mt-1">
              4. Review the Decision
            </div>
            <div className="text-[11px] text-slate-600 truncate">
              Before/After, Evidence &amp; Human Gate
            </div>
          </button>
        </div>
      </div>

      {/* =====================================================================
          STEP 1 — CHOOSE A MEDICINE
         ===================================================================== */}
      {activeStep === 1 && (
        <div className="bg-white border border-slate-300 shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700">
                STEP 1 OF 4 · CANDIDATE &amp; MANUFACTURING PATHWAY
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                Step 1 — Choose a Medicine
              </h1>
              <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
                Inspect the candidate in 3D and verify how it is manufactured. Small-molecule drugs (412 Da) are built via organic chemical synthesis (Route A), whereas large monoclonal antibodies (145.5 kDa) require living CHO mammalian cells in a bioreactor (Route B).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onSwitchToWorkbenchSection('dissertation_3d')}
                className="px-2.5 py-1.5 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 cursor-pointer"
              >
                Open Full 3D Docking Workbench →
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangePathwayMode('established_biologic');
                  setStep1Selection('route_b_her2_trastuzumab');
                  setActiveStep(2);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              >
                Continue to Step 2 (Bioreactor)
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Primary 2-Column Visual & Candidate Profile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left 7 Cols: Prominent Interactive 3D Molecular Viewer */}
            <div className="lg:col-span-7 bg-slate-950 border border-slate-800 text-slate-100 flex flex-col justify-between">
              <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStep1Selection('route_a_mrp1_lead');
                      onChangePathwayMode('small_molecule_chemical');
                      setSelectedPoseMode(1);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-mono border cursor-pointer transition-colors ${
                      step1Selection === 'route_a_mrp1_lead'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Route A · MRP1 Lead (−10.82 kcal/mol · PASS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep1Selection('route_a_mrp1_failed_hit');
                      onChangePathwayMode('small_molecule_chemical');
                      setSelectedPoseMode(1);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-mono border cursor-pointer transition-colors ${
                      step1Selection === 'route_a_mrp1_failed_hit'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Route A · Raw Hit (−11.40 kcal/mol · FAIL Critic)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep1Selection('route_b_her2_trastuzumab');
                      onChangePathwayMode('established_biologic');
                      onSelectCandidate('trastuzumab');
                      setSelectedPoseMode(1);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-mono border cursor-pointer transition-colors ${
                      step1Selection === 'route_b_her2_trastuzumab'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Route B · HER2 Target ({candidate.genericName} Biologic)
                  </button>
                </div>

                <span className="text-[10px] font-mono text-slate-400">
                  Interactive Three.js / WebGL 3D Viewer
                </span>
              </div>

              {/* 3D Canvas Container */}
              <div className="relative w-full h-[340px] bg-[#090d16]">
                <div ref={viewerMountRef} className="w-full h-full" />

                {/* Top-Left Target & Pose Overlay */}
                <div className="absolute top-2.5 left-2.5 bg-slate-950/85 border border-slate-800 px-2.5 py-1.5 text-[11px] font-mono space-y-0.5 pointer-events-none">
                  <div className="text-sky-300 font-bold">
                    {step1Selection === 'route_b_her2_trastuzumab'
                      ? 'Target: Human HER2 / ERBB2 Kinase & Extracellular Domain (UniProt P04626)'
                      : 'Target: Human MRP1 / ABCC1 Efflux Transporter (UniProt P33527)'}
                  </div>
                  <div className="text-slate-300">
                    {step1Selection === 'route_b_her2_trastuzumab'
                      ? `Biologic Drug: ${candidate.genericName} (${candidate.brandName}) · 145.5 kDa IgG1 mAb`
                      : step1Selection === 'route_a_mrp1_failed_hit'
                      ? `Docked Small Molecule: R1-Glycoside-Hit · Vina ${currentPose?.affinityKcalMol.toFixed(2)} kcal/mol (7 Stereocentres — Rejected)`
                      : `Docked Small Molecule: R2-Lead-1 · Vina ${currentPose?.affinityKcalMol.toFixed(2)} kcal/mol (0 Stereocentres — Buildable)`}
                  </div>
                </div>

                {/* Bottom Controls Bar */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 border border-slate-800 px-2.5 py-1.5 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Vina Mode:</span>
                    {[1, 2, 3, 4, 5].map((mNum) => (
                      <button
                        key={mNum}
                        type="button"
                        onClick={() => setSelectedPoseMode(mNum)}
                        className={`px-1.5 py-0.5 border cursor-pointer ${
                          selectedPoseMode === mNum
                            ? 'bg-sky-600 text-white border-sky-400 font-bold'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        #{mNum}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPocketSurface((v) => !v)}
                      className={`px-2 py-0.5 border cursor-pointer ${
                        showPocketSurface
                          ? 'border-emerald-500/60 text-emerald-300 bg-emerald-950/40'
                          : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      Pocket Box
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowContactSticks((v) => !v)}
                      className={`px-2 py-0.5 border cursor-pointer ${
                        showContactSticks
                          ? 'border-amber-500/60 text-amber-300 bg-amber-950/40'
                          : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      Residues
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraResetTick((t) => t + 1)}
                      className="px-2 py-0.5 border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      Reset View
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Concise Candidate Profile & Pathway Distinction */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 bg-slate-900 text-white">
                    {step1Selection === 'route_b_her2_trastuzumab'
                      ? 'ROUTE B · RECOMBINANT BIOLOGIC (CHO BIOREACTOR)'
                      : 'ROUTE A · SMALL MOLECULE (CHEMICAL SYNTHESIS)'}
                  </span>
                  {step1Selection === 'route_b_her2_trastuzumab' && (
                    <div className="flex items-center gap-1">
                      {allBiologicCandidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onChangePathwayMode('established_biologic');
                            onSelectCandidate(c.id);
                          }}
                          className={`px-2 py-0.5 text-[10px] font-mono border cursor-pointer ${
                            candidate.id === c.id
                              ? 'bg-blue-600 text-white border-blue-600 font-bold'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          {c.genericName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {step1Selection === 'route_b_her2_trastuzumab' ? (
                  <div className="bg-white border border-slate-200 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          {candidate.genericName} ({candidate.brandName})
                        </h2>
                        <p className="text-xs text-slate-600">
                          {candidate.modality} · 145.5 kDa Glycosylated Protein · Target:{' '}
                          <span className="font-mono font-semibold text-slate-800">
                            {candidate.targetAntigen} (UniProt {candidate.targetUniprotId.slice(0, 6)})
                          </span>
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-blue-100 text-blue-900 border border-blue-300">
                        CHO Bioreactor Route
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <strong>Why a Bioreactor is Required:</strong> Full-length IgG1 antibodies cannot be made by organic chemistry. Living <strong>CHO-K1 mammalian cells</strong> must fold the heavy/light chains and attach N-glycans in a temperature-, pH-, and oxygen-controlled stirred-tank bioreactor.
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                      <div className="bg-slate-50 border border-slate-200 p-2">
                        <div className="text-slate-500">Specific Output q_p</div>
                        <div className="font-bold text-slate-900">
                          {groundedParams.qpBase} pg/cell/d
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2">
                        <div className="text-slate-500">O₂ Demand q_O2</div>
                        <div className="font-bold text-slate-900">
                          {groundedParams.qO2Specific} pmol/cell/h
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2">
                        <div className="text-slate-500">Shear Limit τ_crit</div>
                        <div className="font-bold text-slate-900">
                          ≤ {groundedParams.shearThresholdPa} Pa
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          {step1Selection === 'route_a_mrp1_lead'
                            ? 'R2-Lead-1 (Achiral Biaryl Sulfonamide)'
                            : 'R1-Raw-Hit-1 (Polyphenolic C-Glycoside)'}
                        </h2>
                        <p className="text-xs text-slate-600">
                          Small-Molecule Inhibitor · 412 Da · Target:{' '}
                          <span className="font-mono font-semibold text-slate-800">
                            MRP1 / ABCC1 (UniProt P33527)
                          </span>
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-mono font-bold border ${
                          step1Selection === 'route_a_mrp1_lead'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}
                      >
                        {step1Selection === 'route_a_mrp1_lead'
                          ? 'PASS Critics (3 Steps)'
                          : 'FAIL Critics (7 Stereo)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {step1Selection === 'route_a_mrp1_lead' ? (
                        <>
                          <strong>Why Chemical Synthesis is Used:</strong> Although the raw docking winner had a slightly stronger score (−11.40 kcal/mol), it had 7 chiral centres and failed synthesis critics. <strong>bioREACT</strong>&apos;s closed-loop critic selected <strong>R2-Lead-1 (−10.82 kcal/mol)</strong>, which is achiral and buildable in <strong>3 chemical steps</strong> (Suzuki coupling + sulfonamide cap) — no cell bioreactor needed.
                        </>
                      ) : (
                        <>
                          <strong>Why Docking Score Alone Fails:</strong> This raw docking hit scores −11.40 kcal/mol in MRP1, but our Synthesisability Critic flags <strong>7 chiral centres and &gt;9 steps</strong>. <strong>bioREACT</strong> rejects it in Round 1 and guides the generator toward buildable achiral leads.
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Scientific Separation Guardrail */}
                <div className="p-3 bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1">
                  <div className="font-mono font-bold text-[11px] uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    Manufacturing Route Separation Guardrail
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Small-molecule docking scores (−10.82 kcal/mol on <strong>MRP1</strong>) evaluate ligand binding and organic synthesis feasibility (Route A). They <strong>do not predict biologic CHO bioreactor performance</strong> and are never combined with <strong>HER2</strong> antibody manufacturing (Route B).
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                {step1Selection !== 'route_b_her2_trastuzumab' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStep1Selection('route_b_her2_trastuzumab');
                      onChangePathwayMode('established_biologic');
                      onSelectCandidate('trastuzumab');
                    }}
                    className="w-full py-2 px-3 text-xs font-mono font-bold bg-slate-900 text-white hover:bg-blue-700 cursor-pointer text-center"
                  >
                    Switch to Route B ({candidate.genericName} Biologic) for Bioreactor Scale-Up →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveStep(2)}
                    className="w-full py-2 px-3 text-xs font-mono font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Proceed to Step 2: Inspect 500 L CHO Bioreactor Bottleneck</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Expandable Scientific Details */}
          <div className="border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowStep1Details((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Scientific Details — Docking Critics, Target Provenance &amp; Route Gate Rules
              </span>
              {showStep1Details ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {showStep1Details && (
              <div className="p-4 border-t border-slate-200 bg-white grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
                <div>
                  <div className="font-mono font-bold text-slate-900 mb-1">
                    1. 3D Viewer &amp; AutoDock Vina Poses
                  </div>
                  <p>
                    Rendered in real time via <strong>Three.js / WebGL</strong> (not static screenshots or external desktop PyMOL). Coordinates use genuine 9-mode Vina docking trajectories inside MRP1 (boxCenter: [114.2, 128.5, 96.4] Å) and structural kinase/ectodomain context for HER2 (UniProt P04626).
                  </p>
                </div>
                <div>
                  <div className="font-mono font-bold text-slate-900 mb-1">
                    2. Synthesisability &amp; Process Critics (Route A)
                  </div>
                  <p>
                    Evaluates SA Score (≤ 3.5 pass), chiral centres (≤ 2 pass), estimated longest linear sequence (≤ 6 steps), and process-chemistry hazards (bridged epoxides, acyl halides). Closed-loop gating lifts joint pass rate from 12.5% to 87.5%.
                  </p>
                </div>
                <div>
                  <div className="font-mono font-bold text-slate-900 mb-1">
                    3. Biologic CQA &amp; CHO Grounding (Route B)
                  </div>
                  <p>
                    Grounded from {prismaIncludedCount} PRISMA-screened records: {candidate.genericName} ({candidate.drugbankOrMabId}) requires afucosylation/galactosylation control, q_p = {groundedParams.qpBase} pg/cell/day, q_O2 = {groundedParams.qO2Specific} pmol/cell/h, and τ_crit = {groundedParams.shearThresholdPa} Pa.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 2 — DISCOVER THE MANUFACTURING BOTTLENECK
         ===================================================================== */}
      {activeStep === 2 && (
        <div className="bg-white border border-slate-300 shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700">
                STEP 2 OF 4 · 500 L BIOREACTOR ENGINEERING FEASIBILITY
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                Step 2 — Discover the Manufacturing Bottleneck
              </h1>
              <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
                Scaling {candidate.genericName} CHO perfusion culture to a 500 L stirred-tank bioreactor reveals a critical physical bottleneck when operated with standard open-pipe air sparging.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onTriggerOxygenDeficitDemo();
                  onUpdateHfParams(DEFAULT_HF_PHYSICS);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Initial 500 L O₂ Deficit
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              >
                Ask bioREACT What to Test Next (Step 3)
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Plain-English Bottleneck Headline Banner */}
          <div
            className={`p-4 border-l-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isO2Starved
                ? 'bg-rose-50 border-rose-600 text-rose-950'
                : !isAllPhysicsFeasible
                ? 'bg-amber-50 border-amber-600 text-amber-950'
                : 'bg-emerald-50 border-emerald-600 text-emerald-950'
            }`}
          >
            <div className="space-y-1">
              <div className="text-base font-bold flex items-center gap-2">
                {isO2Starved ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>
                      “The cells need more oxygen than the reactor can currently deliver.”
                    </span>
                  </>
                ) : !isAllPhysicsFeasible ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>
                      “Oxygen supply is met, but shear or mixing constraints are currently exceeded.”
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>
                      “All 500 L bioreactor constraints pass: oxygen supply exceeds cell demand with safe shear and fast mixing.”
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs leading-relaxed">
                {isO2Starved ? (
                  <>
                    At <strong>{strParams.workingVolumeL} L</strong> with{' '}
                    <strong>
                      {strParams.spargerType === 'open_pipe'
                        ? 'open-pipe sparging'
                        : '15 μm sintered microsparger'}
                    </strong>{' '}
                    and <strong>{(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% inlet O₂</strong>, the{' '}
                    <strong>{strParams.targetVcdE6PerMl.toFixed(1)}×10⁶ cells/mL</strong> consume{' '}
                    <strong className="underline">
                      OUR = {physicsResult.ourMmolPerLHour.toFixed(1)} mmol O₂/L/h
                    </strong>
                    , but the reactor only transfers{' '}
                    <strong className="underline">
                      OTR = {physicsResult.otrMmolPerLHour.toFixed(1)} mmol O₂/L/h
                    </strong>{' '}
                    (shortfall of{' '}
                    <strong>
                      {Math.abs(physicsResult.oxygenMarginMmolPerLHour).toFixed(1)} mmol/L/h
                    </strong>
                    ). Simply spinning the impeller faster damages fragile CHO cells via hydrodynamic shear.
                  </>
                ) : (
                  <>
                    Live 500 L model delivers{' '}
                    <strong>OTR = {physicsResult.otrMmolPerLHour.toFixed(1)} mmol O₂/L/h</strong> vs{' '}
                    <strong>OUR = {physicsResult.ourMmolPerLHour.toFixed(1)} mmol O₂/L/h</strong> (margin{' '}
                    <strong>+{physicsResult.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h</strong>), bulk mixing time{' '}
                    <strong>{physicsResult.mixingTimeGassedS.toFixed(1)} s</strong> (≤ 60 s), impeller shear{' '}
                    <strong>{physicsResult.estimatedShearStressPa.toFixed(2)} Pa</strong> (≤{' '}
                    {groundedParams.shearThresholdPa} Pa), and filter ΔP{' '}
                    <strong>{physicsResult.hfPressureDropKpa.toFixed(1)} kPa</strong> (≤ 25 kPa).
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Primary 2-Column Visual & Interactive Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left 7 Cols: Interactive Animated Bioreactor + Hollow-Fibre Cutaway */}
            <div className="lg:col-span-7 bg-slate-950 border border-slate-800 text-slate-100 p-4 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase text-sky-400">
                    LIVE 500 L STIRRED-TANK PERFUSION + ATF HOLLOW-FIBRE CUTAWAY
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[11px] font-mono font-bold ${
                    isAllPhysicsFeasible
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {isAllPhysicsFeasible ? 'ALL CONSTRAINTS FEASIBLE' : 'BOTTLENECK DETECTED'}
                </span>
              </div>

              <div className="my-2 flex items-center justify-center">
                <svg
                  viewBox="0 0 600 310"
                  className="w-full max-h-[300px]"
                  role="img"
                  aria-label="Interactive 500 L Stirred-Tank Bioreactor and Hollow-Fibre Filter Cutaway"
                >
                  <defs>
                    <style>{`
                      @keyframes demoImpellerSpin {
                        0% { transform: scaleX(1); }
                        50% { transform: scaleX(0.18); }
                        100% { transform: scaleX(1); }
                      }
                      @keyframes demoBubbleRise {
                        0% { transform: translateY(0px); opacity: 0.85; }
                        100% { transform: translateY(-165px); opacity: 0.15; }
                      }
                    `}</style>
                  </defs>

                  {/* External ATF Hollow-Fibre Filter Module (Left) */}
                  <g>
                    <rect
                      x="28"
                      y="78"
                      width="68"
                      height="168"
                      rx="8"
                      fill="#0f172a"
                      stroke={isFilterViolated ? '#f43f5e' : '#38bdf8'}
                      strokeWidth="2"
                    />
                    {[42, 54, 66, 78].map((fx) => (
                      <line
                        key={fx}
                        x1={fx}
                        y1="88"
                        x2={fx}
                        y2="236"
                        stroke={isFilterViolated ? '#fb7185' : '#38bdf8'}
                        strokeWidth={Math.max(1.4, (hfParams.fibreInnerDiameterUm - 200) / 95)}
                        strokeDasharray="4 2"
                      />
                    ))}
                    {/* Recirculation Lines to Vessel */}
                    <path
                      d="M 96 105 L 155 105"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      fill="none"
                    />
                    <path
                      d="M 155 225 L 96 225"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      fill="none"
                    />
                    <text x="30" y="66" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                      ATF Filter ({hfParams.fibreInnerDiameterUm} μm)
                    </text>
                    <text
                      x="30"
                      y="262"
                      fill={isFilterViolated ? '#fda4af' : '#6ee7b7'}
                      fontSize="9.5"
                      fontFamily="monospace"
                    >
                      ΔP: {physicsResult.hfPressureDropKpa.toFixed(1)} kPa
                    </text>
                  </g>

                  {/* Main 500 L Vessel Shell */}
                  <rect
                    x="155"
                    y="36"
                    width="220"
                    height="238"
                    rx="22"
                    fill="#0f172a"
                    stroke={isO2Starved || isShearViolated ? '#f43f5e' : '#10b981'}
                    strokeWidth="2.5"
                  />

                  {/* Culture Medium Broth Fill */}
                  <rect
                    x="158"
                    y="76"
                    width="214"
                    height="195"
                    rx="18"
                    fill={
                      isO2Starved
                        ? 'rgba(244, 63, 94, 0.22)'
                        : isShearViolated
                        ? 'rgba(245, 158, 11, 0.22)'
                        : 'rgba(16, 185, 129, 0.20)'
                    }
                  />

                  {/* Liquid Level Line */}
                  <line
                    x1="158"
                    y1="76"
                    x2="372"
                    y2="76"
                    stroke={isO2Starved ? '#fb7185' : '#34d399'}
                    strokeWidth="2"
                    strokeDasharray="5 3"
                  />

                  {/* Central Agitator Shaft */}
                  <line
                    x1="265"
                    y1="22"
                    x2="265"
                    y2="252"
                    stroke="#cbd5e1"
                    strokeWidth="4"
                  />

                  {/* Impeller Stages (1, 2, or 3 impellers) */}
                  {impellerStageYs.map((yPos, idx) => (
                    <g
                      key={idx}
                      style={{
                        transformOrigin: `265px ${yPos}px`,
                        animation: `demoImpellerSpin ${rotationDurationSec.toFixed(2)}s infinite linear`,
                      }}
                    >
                      <rect
                        x={265 - bladeHalfSpanPx}
                        y={yPos - 6}
                        width={bladeHalfSpanPx * 2}
                        height="12"
                        rx={strParams.impellerType === 'rushton_radial' ? 1 : 6}
                        fill={isShearViolated ? '#f43f5e' : '#38bdf8'}
                      />
                      <circle cx="265" cy={yPos} r="6" fill="#f8fafc" />
                    </g>
                  ))}

                  {/* Bottom Sparger Assembly */}
                  <rect
                    x="210"
                    y="256"
                    width="110"
                    height="8"
                    rx="4"
                    fill={
                      strParams.spargerType === 'sintered_microsparger'
                        ? '#38bdf8'
                        : '#94a3b8'
                    }
                  />

                  {/* Rising Oxygen Bubbles */}
                  {(strParams.spargerType === 'sintered_microsparger'
                    ? [185, 200, 215, 230, 245, 260, 275, 290, 305, 320, 335, 345]
                    : [215, 245, 275, 305, 330]
                  ).map((bx, i) => (
                    <circle
                      key={i}
                      cx={bx}
                      cy={248 - (i % 4) * 18}
                      r={strParams.spargerType === 'sintered_microsparger' ? 2.6 : 6.2}
                      fill={
                        strParams.oxygenEnrichmentFraction > 0.25 ? '#38bdf8' : '#cbd5e1'
                      }
                      style={{
                        animation: `demoBubbleRise ${(1.6 + (i % 3) * 0.45).toFixed(2)}s infinite linear`,
                      }}
                    />
                  ))}

                  {/* Right-Side Live Diagnostic Callouts */}
                  <g>
                    {/* Callout 1: Oxygen Balance */}
                    <rect
                      x="392"
                      y="42"
                      width="195"
                      height="54"
                      rx="4"
                      fill="#0f172a"
                      stroke={isO2Starved ? '#f43f5e' : '#10b981'}
                      strokeWidth="1.5"
                    />
                    <text x="400" y="58" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                      1. OXYGEN SUPPLY vs DEMAND
                    </text>
                    <text
                      x="400"
                      y="74"
                      fill={isO2Starved ? '#fda4af' : '#6ee7b7'}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      OTR {physicsResult.otrMmolPerLHour.toFixed(1)} vs OUR{' '}
                      {physicsResult.ourMmolPerLHour.toFixed(1)}
                    </text>
                    <text x="400" y="88" fill="#cbd5e1" fontSize="9.5" fontFamily="monospace">
                      {isO2Starved
                        ? 'FAIL: Cells starved of O₂'
                        : `PASS: +${physicsResult.oxygenMarginMmolPerLHour.toFixed(1)} mmol/L/h margin`}
                    </text>

                    {/* Callout 2: Cell Shear Stress */}
                    <rect
                      x="392"
                      y="106"
                      width="195"
                      height="52"
                      rx="4"
                      fill="#0f172a"
                      stroke={isShearViolated ? '#f43f5e' : '#10b981'}
                      strokeWidth="1.5"
                    />
                    <text x="400" y="122" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                      2. IMPELLER CELL SHEAR
                    </text>
                    <text
                      x="400"
                      y="138"
                      fill={isShearViolated ? '#fda4af' : '#6ee7b7'}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      τ = {physicsResult.estimatedShearStressPa.toFixed(2)} Pa (≤{' '}
                      {groundedParams.shearThresholdPa} Pa)
                    </text>
                    <text x="400" y="151" fill="#cbd5e1" fontSize="9.5" fontFamily="monospace">
                      Eddy λ_K = {physicsResult.kolmogorovScaleUm.toFixed(1)} μm (&gt; 18 μm)
                    </text>

                    {/* Callout 3: Bulk Mixing Time */}
                    <rect
                      x="392"
                      y="168"
                      width="195"
                      height="52"
                      rx="4"
                      fill="#0f172a"
                      stroke={isMixingSlow ? '#f43f5e' : '#38bdf8'}
                      strokeWidth="1.5"
                    />
                    <text x="400" y="184" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                      3. GASSED MIXING TIME
                    </text>
                    <text
                      x="400"
                      y="200"
                      fill={isMixingSlow ? '#fda4af' : '#7dd3fc'}
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      t_m = {physicsResult.mixingTimeGassedS.toFixed(1)} s (≤ 60 s limit)
                    </text>
                    <text x="400" y="213" fill="#cbd5e1" fontSize="9.5" fontFamily="monospace">
                      {strParams.impellerCount}× {IMPELLER_GEOMETRY_SPECS[strParams.impellerType].shortLabel} (D/T={strParams.diameterRatioDiDt.toFixed(2)})
                    </text>

                    {/* Callout 4: Power & Sparger */}
                    <rect
                      x="392"
                      y="230"
                      width="195"
                      height="46"
                      rx="4"
                      fill="#0f172a"
                      stroke="#475569"
                      strokeWidth="1.2"
                    />
                    <text x="400" y="246" fill="#94a3b8" fontSize="9.5" fontFamily="monospace">
                      4. SPECIFIC POWER &amp; k_La
                    </text>
                    <text x="400" y="263" fill="#e2e8f0" fontSize="10.5" fontFamily="monospace">
                      P_g/V = {physicsResult.specificPowerWPerM3.toFixed(0)} W/m³ · k_La ={' '}
                      {physicsResult.klaPerHour.toFixed(1)} h⁻¹
                    </text>
                  </g>
                </svg>
              </div>

              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                <span>
                  Model-informed explanatory visualisation — not validated CFD or experimentally measured flow behaviour.
                </span>
                <button
                  type="button"
                  onClick={() => onSwitchToWorkbenchSection('mass_balance')}
                  className="text-sky-400 hover:underline cursor-pointer"
                >
                  Open Full Engineering Workbench →
                </button>
              </div>
            </div>

            {/* Right 5 Cols: Interactive Engineering Sliders & Live Constraint Bars */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase font-mono text-slate-900 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-600" />
                    Try Adjusting Reactor Settings Live
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Volume: {strParams.workingVolumeL} L
                  </span>
                </div>

                {/* Sparger Type Toggle */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono font-semibold text-slate-700">
                    1. Sparger Hardware (Bubble Size &amp; k_La Multiplier)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateStrParams({ ...strParams, spargerType: 'open_pipe' })
                      }
                      className={`py-1.5 px-2 text-xs font-mono border cursor-pointer ${
                        strParams.spargerType === 'open_pipe'
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Open-Pipe (6 mm · 1.0×)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateStrParams({
                          ...strParams,
                          spargerType: 'sintered_microsparger',
                        })
                      }
                      className={`py-1.5 px-2 text-xs font-mono border cursor-pointer ${
                        strParams.spargerType === 'sintered_microsparger'
                          ? 'bg-blue-600 text-white border-blue-600 font-bold'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      15 μm Microsparger (3.4×)
                    </button>
                  </div>
                </div>

                {/* Impeller Type & Count */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-mono font-semibold text-slate-700 mb-1">
                      2. Impeller Type
                    </label>
                    <select
                      aria-label="Impeller Type"
                      value={strParams.impellerType}
                      onChange={(e) =>
                        onUpdateStrParams({
                          ...strParams,
                          impellerType: e.target.value as ImpellerType,
                        })
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 text-slate-900"
                    >
                      <option value="marine_axial">Marine Propeller (N_P=0.35)</option>
                      <option value="pitched_blade">Pitched-Blade (N_P=1.27)</option>
                      <option value="rushton_radial">Rushton Turbine (N_P=5.0)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono font-semibold text-slate-700 mb-1">
                      3. Impeller Count (n)
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {([1, 2, 3] as const).map((nVal) => (
                        <button
                          key={nVal}
                          type="button"
                          onClick={() =>
                            onUpdateStrParams({ ...strParams, impellerCount: nVal })
                          }
                          className={`py-1.5 text-xs font-mono border cursor-pointer ${
                            strParams.impellerCount === nVal
                              ? 'bg-slate-900 text-white border-slate-900 font-bold'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          {nVal}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RPM & Inlet O2 Sliders */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-white border border-slate-200 p-2.5">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-600">Agitation RPM</span>
                      <span className="font-bold text-slate-900">
                        {strParams.stirrerSpeedRpm} RPM
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Agitation RPM"
                      min={60}
                      max={220}
                      step={5}
                      value={strParams.stirrerSpeedRpm}
                      onChange={(e) =>
                        onUpdateStrParams({
                          ...strParams,
                          stirrerSpeedRpm: Number(e.target.value),
                        })
                      }
                      className="w-full mt-1 accent-blue-600 cursor-pointer"
                    />
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                      Higher RPM speeds mixing but raises cell shear τ.
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-2.5">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-600">Inlet Gas O₂ %</span>
                      <span className="font-bold text-slate-900">
                        {(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% O₂
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Inlet Gas Oxygen Percentage"
                      min={21}
                      max={65}
                      step={1}
                      value={Math.round(strParams.oxygenEnrichmentFraction * 100)}
                      onChange={(e) =>
                        onUpdateStrParams({
                          ...strParams,
                          oxygenEnrichmentFraction: Number(e.target.value) / 100,
                        })
                      }
                      className="w-full mt-1 accent-blue-600 cursor-pointer"
                    />
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                      21% = Air; &gt;21% = O₂-enriched sparge gas.
                    </div>
                  </div>
                </div>

                {/* Live 4-Bar Constraint Load Summary */}
                <div className="bg-white border border-slate-200 p-3 space-y-2">
                  <div className="text-[11px] font-mono font-bold text-slate-800 uppercase">
                    Live Constraint Load (% of Maximum Safe Limit — ≤ 100% Required)
                  </div>
                  {[
                    {
                      label: 'Oxygen Demand / Supply (OUR/OTR)',
                      pct: currentRadarLoads.oxygenLoadPct,
                      val: `${physicsResult.otrMmolPerLHour.toFixed(1)} vs ${physicsResult.ourMmolPerLHour.toFixed(1)} mmol/L/h`,
                    },
                    {
                      label: 'Impeller Shear Stress (τ / τ_crit)',
                      pct: currentRadarLoads.shearLoadPct,
                      val: `${physicsResult.estimatedShearStressPa.toFixed(2)} / ${groundedParams.shearThresholdPa} Pa`,
                    },
                    {
                      label: 'Gassed Bulk Mixing Time (t_m / 60 s)',
                      pct: currentRadarLoads.mixingLoadPct,
                      val: `${physicsResult.mixingTimeGassedS.toFixed(1)} / 60.0 s`,
                    },
                    {
                      label: 'Hollow-Fibre Filter Hydraulics',
                      pct: currentRadarLoads.filterHydraulicsLoadPct,
                      val: `ΔP ${physicsResult.hfPressureDropKpa.toFixed(1)} kPa · τ_w ${physicsResult.hfWallShearStressPa.toFixed(2)} Pa`,
                    },
                  ].map((item) => (
                    <div key={item.label} className="space-y-0.5">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-700">{item.label}</span>
                        <span
                          className={`font-bold ${
                            item.pct > 100
                              ? 'text-rose-700'
                              : item.pct > 80
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {item.val} ({item.pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            item.pct > 100
                              ? 'bg-rose-600'
                              : item.pct > 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                          }`}
                          style={{ width: `${Math.min(100, item.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="w-full py-2 px-3 text-xs font-mono font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Step 3: Ask bioREACT What to Test Next →</span>
              </button>
            </div>
          </div>

          {/* Expandable "Show Scientific Reasoning" Drawer */}
          <div className="border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowStep2Reasoning((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Show Scientific Reasoning — First-Principles Mass Balance, Van&apos;t Riet k_La &amp; Kolmogorov Shear Equations
              </span>
              {showStep2Reasoning ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {showStep2Reasoning && (
              <div className="p-4 border-t border-slate-200 bg-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-700 font-mono">
                <div className="p-3 bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">1. Oxygen Balance</div>
                  <div>OUR = q_O2 × X_v</div>
                  <div>OTR = k_La × (C*_O2(y_O2) − C_L)</div>
                  <div className="text-[11px] font-sans text-slate-600 pt-1">
                    At 43.5×10⁶ cells/mL and q_O2 = {groundedParams.qO2Specific} pmol/cell/h, OUR = {physicsResult.ourMmolPerLHour.toFixed(1)} mmol/L/h.
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">2. Multi-Impeller Power &amp; k_La</div>
                  <div>P_0 = n × N_p0 × ρ × N³ × D_i⁵</div>
                  <div>k_La = α_sparger × 0.026 × (P_g/V)^0.4 × v_s^0.5</div>
                  <div className="text-[11px] font-sans text-slate-600 pt-1">
                    Van&apos;t Riet (1979) correlation; 15 μm microsparger increases interfacial area α by 3.4×.
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">3. Kolmogorov Shear &amp; Mixing</div>
                  <div>λ_K = (ν³ / ε_max)^(1/4) &gt; 18 μm</div>
                  <div>θ_95% ∝ N⁻¹ × (D_i/D_T)^(-2.3) × (Z/D_T)^1.5</div>
                  <div className="text-[11px] font-sans text-slate-600 pt-1">
                    Widening D_i/D_T reduces mixing time rapidly (exponent −2.3) without excessive tip speed.
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">4. Hollow-Fibre Hydraulics</div>
                  <div>ΔP_HF = (128 μ L_f Q_f) / (π d_f⁴)</div>
                  <div>τ_w = (32 μ Q_f) / (π d_f³)</div>
                  <div className="text-[11px] font-sans text-slate-600 pt-1">
                    Hagen–Poiseuille lumen flow: widening fibre ID d_f reduces ΔP by the 4th power.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 3 — ASK bioREACT WHAT TO TEST NEXT
         ===================================================================== */}
      {activeStep === 3 && (
        <div className="bg-white border border-slate-300 shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700">
                STEP 3 OF 4 · MULTI-OBJECTIVE EXPERIMENT GENERATOR
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                Step 3 — Ask bioREACT What to Test Next
              </h1>
              <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
                Instead of adjusting one variable at a time, <strong>bioREACT</strong> evaluates discrete equipment choices and continuous operating settings together to propose up to three feasible configurations to test next.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRecalcCount((c) => c + 1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Find Next Experiments (Live Run #{recalcCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              >
                Step 4: Review the Decision
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Judge Control Bar: Priority Selection + Live Parameter Challenge */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900 font-mono uppercase flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                1. Choose Optimisation Priority (or Let a Judge Change Inputs &amp; Rerun Live)
              </div>
              <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5">
                Evaluated {unifiedSuite.evaluatedTotalConfigurationsCount} equipment × operating combinations ({unifiedSuite.feasibleConfigurationsCount} passed all hard safety limits)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1.5">
              {(
                Object.keys(
                  DEMO_OBJECTIVE_PRESETS
                ) as ReactorOptimisationObjectivePresetId[]
              ).map((presetKey) => {
                const p = DEMO_OBJECTIVE_PRESETS[presetKey];
                const isSelected = activePresetId === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => {
                      setActivePresetId(presetKey);
                      setRecalcCount((c) => c + 1);
                    }}
                    className={`text-left p-2 border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/80 ring-1 ring-indigo-600'
                        : 'border-slate-300 bg-white hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-900">{p.label}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">
                      {p.plainDesc}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Judge Interactive Input Row — Change any supported input and immediately see live model recalculation */}
            <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-700 mb-1">
                  JUDGE INPUT: TARGET CELL DENSITY
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    aria-label="Judge Target Cell Density"
                    min={20}
                    max={65}
                    step={1.5}
                    value={strParams.targetVcdE6PerMl}
                    onChange={(e) => {
                      onUpdateStrParams({
                        ...strParams,
                        targetVcdE6PerMl: Number(e.target.value),
                      });
                      setRecalcCount((c) => c + 1);
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-slate-900 shrink-0">
                    {strParams.targetVcdE6PerMl.toFixed(1)}M/mL
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-700 mb-1">
                  JUDGE INPUT: IMPELLER RATIO (D_i/D_T)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    aria-label="Judge Impeller Diameter Ratio"
                    min={0.32}
                    max={0.48}
                    step={0.02}
                    value={strParams.diameterRatioDiDt}
                    onChange={(e) => {
                      onUpdateStrParams({
                        ...strParams,
                        diameterRatioDiDt: Number(e.target.value),
                      });
                      setRecalcCount((c) => c + 1);
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-slate-900 shrink-0">
                    {strParams.diameterRatioDiDt.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-700 mb-1">
                  JUDGE INPUT: AGITATION RPM
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    aria-label="Judge Agitation Speed RPM"
                    min={65}
                    max={200}
                    step={5}
                    value={strParams.stirrerSpeedRpm}
                    onChange={(e) => {
                      onUpdateStrParams({
                        ...strParams,
                        stirrerSpeedRpm: Number(e.target.value),
                      });
                      setRecalcCount((c) => c + 1);
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-slate-900 shrink-0">
                    {strParams.stirrerSpeedRpm} RPM
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-700 mb-1">
                  JUDGE INPUT: INLET OXYGEN %
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    aria-label="Judge Inlet Oxygen Percentage"
                    min={21}
                    max={60}
                    step={1}
                    value={Math.round(strParams.oxygenEnrichmentFraction * 100)}
                    onChange={(e) => {
                      onUpdateStrParams({
                        ...strParams,
                        oxygenEnrichmentFraction: Number(e.target.value) / 100,
                      });
                      setRecalcCount((c) => c + 1);
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-slate-900 shrink-0">
                    {(strParams.oxygenEnrichmentFraction * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-mono">
                <div className="text-slate-500">Current Manual State:</div>
                <div
                  className={`font-bold ${
                    isAllPhysicsFeasible ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {isAllPhysicsFeasible
                    ? `FEASIBLE (t_m=${physicsResult.mixingTimeGassedS.toFixed(0)}s, ΔP=${physicsResult.hfPressureDropKpa.toFixed(1)}kPa)`
                    : isO2Starved
                    ? 'INFEASIBLE: OTR < OUR'
                    : 'INFEASIBLE: Shear/Mixing Limit'}
                </div>
              </div>
            </div>
          </div>

          {/* 3 Calculated Candidate Operating Configurations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {unifiedSuite.rankedConfigurations.map((cfg) => {
              const isApplied = lastAppliedConfigId === cfg.id;
              return (
                <div
                  key={cfg.id}
                  className={`border p-4 flex flex-col justify-between space-y-3 transition-all ${
                    isApplied
                      ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                      : cfg.rank === 1
                      ? 'border-blue-600 bg-blue-50/25'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-slate-900 text-white">
                          RANK #{cfg.rank} CANDIDATE · SCORE {cfg.compositeObjectiveScore.toFixed(1)}/100
                        </span>
                        <h2 className="text-sm font-bold text-slate-900 mt-1">
                          {cfg.title}
                        </h2>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0">
                        All Limits Pass
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {cfg.summaryRationale}
                    </p>

                    {/* Proposed Hardware & Operating Changes */}
                    <div className="bg-slate-50 border border-slate-200 p-2.5 text-[11px] font-mono space-y-1">
                      <div className="font-bold text-slate-900 uppercase">
                        Proposed Operating Settings:
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-700">
                        <div>
                          • Sparger:{' '}
                          <strong>
                            {cfg.strParams.spargerType === 'sintered_microsparger'
                              ? '15 μm Micro'
                              : 'Open-Pipe'}
                          </strong>
                        </div>
                        <div>
                          • Impeller:{' '}
                          <strong>
                            {cfg.strParams.impellerCount}×{' '}
                            {
                              IMPELLER_GEOMETRY_SPECS[cfg.strParams.impellerType]
                                .shortLabel
                            }
                          </strong>
                        </div>
                        <div>
                          • Speed &amp; D/T:{' '}
                          <strong>
                            {cfg.strParams.stirrerSpeedRpm} RPM · D/T=
                            {cfg.strParams.diameterRatioDiDt.toFixed(2)}
                          </strong>
                        </div>
                        <div>
                          • Gas &amp; O₂:{' '}
                          <strong>
                            {cfg.strParams.spargeRateVvm} vvm ·{' '}
                            {(cfg.strParams.oxygenEnrichmentFraction * 100).toFixed(0)}% O₂
                          </strong>
                        </div>
                        <div className="col-span-2">
                          • Filter Cartridge:{' '}
                          <strong>
                            d_f = {cfg.hfParams.fibreInnerDiameterUm} μm, L ={' '}
                            {cfg.hfParams.fibreLengthM.toFixed(2)} m (
                            {cfg.hfParams.numberOfFibres.toLocaleString()} fibres)
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Recalculated Physics Outcomes */}
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                      <div className="p-2 bg-white border border-slate-200">
                        <div className="text-slate-500">Oxygen (OTR vs OUR)</div>
                        <div className="font-bold text-emerald-700">
                          {cfg.evalPhysics.otrMmolPerLHour.toFixed(1)} vs{' '}
                          {cfg.evalPhysics.ourMmolPerLHour.toFixed(1)} mmol/L/h
                        </div>
                      </div>
                      <div className="p-2 bg-white border border-slate-200">
                        <div className="text-slate-500">Gassed Mixing Time</div>
                        <div className="font-bold text-blue-700">
                          t_m = {cfg.evalPhysics.mixingTimeGassedS.toFixed(1)} s (≤ 60 s)
                        </div>
                      </div>
                      <div className="p-2 bg-white border border-slate-200">
                        <div className="text-slate-500">Impeller Shear &amp; λ_K</div>
                        <div className="font-bold text-slate-900">
                          {cfg.evalPhysics.estimatedShearStressPa.toFixed(2)} Pa ·{' '}
                          {cfg.evalPhysics.kolmogorovScaleUm.toFixed(0)} μm
                        </div>
                      </div>
                      <div className="p-2 bg-white border border-slate-200">
                        <div className="text-slate-500">Filter ΔP &amp; Cost</div>
                        <div className="font-bold text-slate-900">
                          {cfg.evalPhysics.hfPressureDropKpa.toFixed(1)} kPa · $
                          {cfg.evalCogs.cogsPerGramUsd.toFixed(0)}/g
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 bg-amber-50/70 border border-amber-200 p-2">
                      <strong>Predicted Trade-off:</strong>{' '}
                      {cfg.competingObjectiveTradeOffs[0] ||
                        'Balances mixing speed, filter pressure drop, and oxygen transfer margin.'}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyProposedConfig(cfg)}
                      className={`w-full py-2 px-3 text-xs font-mono font-bold cursor-pointer transition-colors ${
                        isApplied
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-900 text-white hover:bg-blue-600'
                      }`}
                    >
                      {isApplied
                        ? '✓ Applied to Live Bioreactor Model'
                        : 'Apply Configuration to Live Bioreactor'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyProposedConfig(cfg);
                        onRunNextExperiment('Constrained BO (EI × P_feas)', {
                          x1_vvd: groundedParams.optimalVvd,
                          x2_do: groundedParams.optimalDoPercent,
                          tempC: 33.5,
                        });
                        setActiveStep(4);
                      }}
                      className="w-full py-1.5 px-3 text-[11px] font-mono font-semibold border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100 cursor-pointer"
                    >
                      Apply &amp; Proceed to Step 4 Decision Review →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expandable Scientific Details */}
          <div className="border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowStep3Details((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Scientific Details — Constrained Bayesian Optimisation Benchmark &amp; Mixing/Filter Levers
              </span>
              {showStep3Details ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {showStep3Details && (
              <div className="p-4 border-t border-slate-200 bg-white space-y-3 text-xs text-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-200">
                    <div className="font-mono font-bold text-slate-900 mb-1">
                      1. Why Mixing &amp; Filter ΔP Improve Together
                    </div>
                    <p>
                      Increasing impeller diameter ratio (D_i/D_T = 0.38 → 0.44) reduces gassed mixing time via θ_95% ∝ (D_i/D_T)^(-2.30) without high tip shear, while switching hollow-fibre lumen ID from 280 μm to 360 μm cuts ΔP_HF by (280/360)⁴ ≈ 63%.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200">
                    <div className="font-mono font-bold text-slate-900 mb-1">
                      2. Reproducible 8-Seed BO vs Random Benchmark
                    </div>
                    <p>
                      Across {liveEightSeedSummary.seedCount} deterministic seeds ({liveEightSeedSummary.budget} evaluations/seed), Constrained BO (EI × P_feas) achieves{' '}
                      <strong>
                        {liveEightSeedSummary.constrainedBoStats.finalScoreMean.toFixed(1)} ±{' '}
                        {liveEightSeedSummary.constrainedBoStats.finalScoreStd.toFixed(1)}
                      </strong>{' '}
                      vs Random Search{' '}
                      <strong>
                        {liveEightSeedSummary.randomSearchStats.finalScoreMean.toFixed(1)} ±{' '}
                        {liveEightSeedSummary.randomSearchStats.finalScoreStd.toFixed(1)}
                      </strong>{' '}
                      synthetic objective units (wins {liveEightSeedSummary.constrainedBoStats.seedsWonCount}/
                      {liveEightSeedSummary.seedCount} seeds).
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200">
                    <div className="font-mono font-bold text-slate-900 mb-1">
                      3. Unsupported Model Effects (Explicitly Flagged)
                    </div>
                    <p>
                      Fine-tuning inter-impeller spacing (ΔC/D_i) or hybrid dissimilar impellers requires 3D CFD/PIV or dual-probe conductivity tracer calibration; <strong>bioREACT</strong> abstains from inventing uncalibrated spacing optima.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 4 — REVIEW THE DECISION
         ===================================================================== */}
      {activeStep === 4 && (
        <div className="bg-white border border-slate-300 shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700">
                STEP 4 OF 4 · BEFORE/AFTER REVIEW, UNCERTAINTY &amp; HUMAN APPROVAL GATE
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                Step 4 — Review the Decision
              </h1>
              <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
                Verify the before/after engineering feasibility, inspect remaining scientific uncertainties and literature evidence, and record mandatory human sign-off before any experimental execution.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onSwitchToWorkbenchSection('brief')}
                className="px-3 py-1.5 text-xs font-mono font-semibold border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                Open Full CMC Dossier &amp; Export →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left 7 Cols: Before/After Feasibility Table + Remaining Uncertainty */}
            <div className="lg:col-span-7 space-y-3 flex flex-col justify-between">
              <div className="border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 text-white px-3.5 py-2 text-xs font-mono font-bold uppercase flex items-center justify-between">
                  <span>Before vs. After 500 L Engineering Feasibility Comparison</span>
                  <span
                    className={`px-2 py-0.5 text-[10px] ${
                      isAllPhysicsFeasible
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                    }`}
                  >
                    {isAllPhysicsFeasible ? 'ACTIVE CONFIG FEASIBLE' : 'ACTIVE CONFIG INFEASIBLE'}
                  </span>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[11px] text-slate-700">
                      <th className="py-2 px-3">Engineering Metric</th>
                      <th className="py-2 px-3">Initial 500 L Air Baseline</th>
                      <th className="py-2 px-3">Active Live Configuration</th>
                      <th className="py-2 px-3">Safety Limit &amp; Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        Oxygen Supply (OTR vs OUR)
                      </td>
                      <td className="py-2 px-3 text-rose-700 font-bold">
                        {baselinePhysics.otrMmolPerLHour.toFixed(1)} vs{' '}
                        {baselinePhysics.ourMmolPerLHour.toFixed(1)} mmol/L/h (FAIL)
                      </td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          isO2Starved ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {physicsResult.otrMmolPerLHour.toFixed(1)} vs{' '}
                        {physicsResult.ourMmolPerLHour.toFixed(1)} mmol/L/h
                      </td>
                      <td className="py-2 px-3">
                        OTR ≥ OUR ({isO2Starved ? 'FAIL' : 'PASS'})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        Gassed Bulk Mixing Time (t_m)
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {baselinePhysics.mixingTimeGassedS.toFixed(1)} s (86% load)
                      </td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          isMixingSlow ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {physicsResult.mixingTimeGassedS.toFixed(1)} s (
                        {currentRadarLoads.mixingLoadPct.toFixed(0)}% load)
                      </td>
                      <td className="py-2 px-3">
                        ≤ 60.0 s ({isMixingSlow ? 'FAIL' : 'PASS'})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        Impeller Shear Stress (τ_imp)
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {baselinePhysics.estimatedShearStressPa.toFixed(2)} Pa
                      </td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          isShearViolated ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {physicsResult.estimatedShearStressPa.toFixed(2)} Pa (λ_K ={' '}
                        {physicsResult.kolmogorovScaleUm.toFixed(1)} μm)
                      </td>
                      <td className="py-2 px-3">
                        ≤ {groundedParams.shearThresholdPa} Pa ({isShearViolated ? 'FAIL' : 'PASS'})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        Hollow-Fibre Filter ΔP &amp; Wall Shear
                      </td>
                      <td className="py-2 px-3 text-amber-800">
                        {baselinePhysics.hfPressureDropKpa.toFixed(1)} kPa ·{' '}
                        {baselinePhysics.hfWallShearStressPa.toFixed(2)} Pa (81% load)
                      </td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          isFilterViolated ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {physicsResult.hfPressureDropKpa.toFixed(1)} kPa ·{' '}
                        {physicsResult.hfWallShearStressPa.toFixed(2)} Pa (
                        {currentRadarLoads.filterHydraulicsLoadPct.toFixed(0)}% load)
                      </td>
                      <td className="py-2 px-3">
                        ≤ 25 kPa &amp; ≤ {groundedParams.shearThresholdPa} Pa (
                        {isFilterViolated ? 'FAIL' : 'PASS'})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        Gassed Power &amp; Est. COGS/g
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {baselinePhysics.specificPowerWPerM3.toFixed(0)} W/m³ ·{' '}
                        {formatCogsHeadline(downstreamCogs.cogsPerGramUsd)}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {physicsResult.specificPowerWPerM3.toFixed(0)} W/m³ ·{' '}
                        {formatCogsHeadline(downstreamCogs.cogsPerGramUsd)}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        Synthetic cost basis
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Remaining Constraints & Scientific Uncertainty Box */}
              <div className="p-3.5 bg-amber-50/90 border border-amber-300 text-xs text-amber-950 space-y-1.5">
                <div className="font-mono font-bold uppercase text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  Remaining Constraints &amp; Scientific Uncertainty Statement
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                  {!isAllPhysicsFeasible && (
                    <li className="font-bold text-rose-800">
                      ACTIVE CONSTRAINT FAILURE: {physicsResult.limitingFactors.join('; ') || 'Oxygen transfer or hydrodynamic limit violated.'} Return to Step 3 and apply a feasible configuration before signing off.
                    </li>
                  )}
                  <li>
                    <strong>1D Empirical Correlations vs. 3D CFD:</strong> Mass-balance and hydrodynamic predictions use validated 1D scale-up correlations (Van&apos;t Riet 1979; Nienow 1998; Rosseburg et al. 2018), not 3D Navier–Stokes CFD or physical 500 L wet-lab runs.
                  </li>
                  <li>
                    <strong>Uncalibrated Effects Requiring Wet-Lab Data:</strong> Continuous inter-impeller spacing (ΔC/D_i) flow merging and Pluronic/antifoam k_La depression (α_surfactant = 0.55–0.85) require dual-probe conductivity tracer and dynamic gassing-out calibration prior to GMP lock.
                  </li>
                </ul>
              </div>
            </div>

            {/* Right 5 Cols: Evidence Summary + Mandatory Human Approval Gate */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
              {/* Concise Evidence Summary */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase text-slate-900">
                    Literature Evidence &amp; Provenance Summary
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-100 text-blue-900">
                    {prismaIncludedCount} PRISMA Records Included
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Every biological and physical parameter is linked to licence-verified open sources (Europe PMC, PubMed, OpenAlex, UniProt, ChEMBL):
                </p>
                <div className="space-y-1 text-[11px] font-mono">
                  {records.slice(0, 3).map((rec) => (
                    <div
                      key={rec.id}
                      className="p-1.5 bg-white border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-slate-800">
                        <strong>{rec.source}:</strong> {rec.title}
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {rec.accessionId}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mandatory Human-in-the-Loop Approval Gate */}
              <div
                className={`p-4 border-2 space-y-3 ${
                  isHumanApproved && isAllPhysicsFeasible
                    ? 'bg-emerald-50/70 border-emerald-500'
                    : 'bg-white border-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isHumanApproved && isAllPhysicsFeasible ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-mono font-bold uppercase text-slate-900">
                        Mandatory Human-in-the-Loop Sign-Off
                      </div>
                      <div className="text-[11px] text-slate-600">
                        No experimental protocol can be exported or executed without human approval.
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                      isHumanApproved && isAllPhysicsFeasible
                        ? 'bg-emerald-200 text-emerald-950'
                        : 'bg-amber-200 text-amber-950'
                    }`}
                  >
                    {isHumanApproved && isAllPhysicsFeasible
                      ? 'APPROVED (SIMULATED)'
                      : 'PENDING HUMAN SIGN-OFF'}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-700 mb-1">
                    REVIEWER ROLE (SIMULATED DEMO — NO INSTITUTIONAL APPROVAL IMPLIED)
                  </label>
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 text-slate-900"
                  />
                </div>

                {!isAllPhysicsFeasible && (
                  <div className="p-2.5 bg-rose-100 border border-rose-400 text-rose-950 text-[11px] font-mono font-semibold">
                    ▲ HARD SAFETY INTERLOCK ACTIVE: Approval is blocked because the current 500 L operating point fails physical constraints (OTR = {physicsResult.otrMmolPerLHour.toFixed(1)} vs OUR = {physicsResult.ourMmolPerLHour.toFixed(1)} mmol/L/h). Go to Step 3 and apply a feasible configuration first.
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!isAllPhysicsFeasible}
                    onClick={() => {
                      const note = `Simulated Demo Sign-Off (No Institutional Approval Implied): Verified 500 L oxygen balance closure (OTR = ${physicsResult.otrMmolPerLHour.toFixed(1)} >= OUR = ${physicsResult.ourMmolPerLHour.toFixed(1)} mmol/L/h), mixing t_m = ${physicsResult.mixingTimeGassedS.toFixed(1)} s, shear τ = ${physicsResult.estimatedShearStressPa.toFixed(2)} Pa, filter ΔP = ${physicsResult.hfPressureDropKpa.toFixed(1)} kPa.`;
                      onUpdateSafetyGate('gate2_reactor', 'Approved', reviewerName, note);
                      onUpdateSafetyGate('gate4_protocol', 'Approved', reviewerName, note);
                      onApproveAllDemoGates();
                    }}
                    className={`flex-1 py-2 px-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 ${
                      !isAllPhysicsFeasible
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {!isAllPhysicsFeasible
                        ? 'Approval Blocked by Safety Interlock'
                        : 'Approve 500 L Next-Experiment Protocol'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSafetyGate(
                        'gate4_protocol',
                        'Changes Requested',
                        reviewerName,
                        'Reviewer requested additional wet-lab k_La and mixing-time tracer verification.'
                      );
                    }}
                    className="py-2 px-2.5 text-xs font-mono font-semibold bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
                  >
                    Request Changes
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Scientific Details */}
          <div className="border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowStep4Details((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Scientific Details — Full Parameter Provenance Ledger &amp; Epistemic Classification
              </span>
              {showStep4Details ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {showStep4Details && (
              <div className="p-4 border-t border-slate-200 bg-white overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[11px] text-slate-700">
                      <th className="py-1.5 px-2.5">Parameter</th>
                      <th className="py-1.5 px-2.5">Active Value</th>
                      <th className="py-1.5 px-2.5">Epistemic Class</th>
                      <th className="py-1.5 px-2.5">Primary Source ID / DOI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {provenanceLedger.slice(0, 6).map((item) => (
                      <tr key={item.parameterId}>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900">
                          {item.name} ({item.symbol})
                        </td>
                        <td className="py-1.5 px-2.5 text-blue-800 font-semibold">
                          {item.currentValue} {item.unit}
                        </td>
                        <td className="py-1.5 px-2.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-slate-800">
                            {item.classification}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-600">
                          {item.databaseId} · {item.doiOrUrl}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
