import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Activity,
  Atom,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Eye,
  FileCheck2,
  FlaskConical,
  Layers,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  Atom3D,
  CLOSED_LOOP_DATASETS,
  PROTEIN_TARGETS_3D,
  getModesForSmiles,
} from '../data/dissertationDockingData';
import {
  BiologicCandidate,
  CandidatePathwayMode,
  HumanSafetyGate,
  MassBalanceAndPhysicsResult,
  NextExperimentRecommendationSuite,
  NovelProteinDissertationProfile,
  OrganismSystemId,
  ProposedNextExperimentRecipe,
  ReactorScreeningEvaluation,
  StirredTankPhysicsParams,
} from '../types/bioreact';
import { ORGANISM_PROCESS_MODELS } from '../data/multiOrganismData';

export type WorkbenchSectionId =
  | 'home_workbench'
  | 'workflow_safety'
  | 'dissertation_3d'
  | 'streams'
  | 'screening'
  | 'mass_balance'
  | 'optimiser'
  | 'brief';

interface UnifiedWorkbenchHomePanelProps {
  candidate: BiologicCandidate;
  allBiologicCandidates: BiologicCandidate[];
  onSelectBiologicCandidate: (candidateId: string) => void;
  candidatePathwayMode: CandidatePathwayMode;
  onChangePathwayMode: (mode: CandidatePathwayMode) => void;
  selectedOrganismId: OrganismSystemId;
  novelProfile: NovelProteinDissertationProfile;
  strParams: StirredTankPhysicsParams;
  physicsResult: MassBalanceAndPhysicsResult;
  evaluations: ReactorScreeningEvaluation[];
  safetyGates: HumanSafetyGate[];
  recommendationSuite: NextExperimentRecommendationSuite;
  prismaRecordsIncluded: number;
  downstreamCogsPerGramUsd: number;
  onNavigateToSection: (section: WorkbenchSectionId) => void;
  onApplyMicrospargerFixAndInspect: () => void;
}

const ELEMENT_COLORS: Record<string, number> = {
  C: 0x10b981,
  N: 0x2563eb,
  O: 0xef4444,
  S: 0xf59e0b,
  F: 0x06b6d4,
  Cl: 0x22c55e,
  Br: 0x991b1b,
  P: 0xf97316,
};

type HomeShowcaseMode =
  | 'mrp1_manufacturable_lead'
  | 'mrp1_unbuildable_raw_hit'
  | 'her2_trastuzumab_biologic'
  | 'novel_dissertation_protein';

export const UnifiedWorkbenchHomePanel: React.FC<UnifiedWorkbenchHomePanelProps> = ({
  candidate,
  allBiologicCandidates,
  onSelectBiologicCandidate,
  candidatePathwayMode,
  onChangePathwayMode,
  selectedOrganismId,
  novelProfile,
  strParams,
  physicsResult,
  evaluations,
  safetyGates,
  recommendationSuite,
  prismaRecordsIncluded,
  downstreamCogsPerGramUsd,
  onNavigateToSection,
  onApplyMicrospargerFixAndInspect,
}) => {
  const [showcaseMode, setShowcaseMode] = useState<HomeShowcaseMode>(
    candidatePathwayMode === 'small_molecule_chemical'
      ? 'mrp1_manufacturable_lead'
      : candidatePathwayMode === 'novel_dissertation_protein'
      ? 'novel_dissertation_protein'
      : 'mrp1_manufacturable_lead'
  );
  const [showSurfaceBox, setShowSurfaceBox] = useState<boolean>(true);
  const [showContactLabels, setShowContactLabels] = useState<boolean>(true);
  const [cameraResetCounter, setCameraResetCounter] = useState<number>(0);
  const [isTechnicalDetailsOpen, setIsTechnicalDetailsOpen] = useState<boolean>(false);

  const mountRef = useRef<HTMLDivElement | null>(null);

  // Pull real candidates from CLOSED_LOOP_DATASETS
  const mrp1LeadCandidate = useMemo(() => {
    const shortlist = CLOSED_LOOP_DATASETS.cache.final_shortlist;
    return (
      shortlist.find((c) => c.dock_affinity <= -10.8) ||
      shortlist[0] ||
      CLOSED_LOOP_DATASETS.cache.rounds[1].candidates[0]
    );
  }, []);

  const mrp1UnbuildableCandidate = useMemo(() => {
    const round1 = CLOSED_LOOP_DATASETS.cache.rounds[0]?.candidates || [];
    return (
      round1.find((c) => c.overall_verdict === 'fail') ||
      round1[0] ||
      mrp1LeadCandidate
    );
  }, [mrp1LeadCandidate]);

  const activeTarget3D = useMemo(() => {
    if (
      showcaseMode === 'her2_trastuzumab_biologic' ||
      showcaseMode === 'novel_dissertation_protein'
    ) {
      return PROTEIN_TARGETS_3D.HER2;
    }
    return PROTEIN_TARGETS_3D.MRP1;
  }, [showcaseMode]);

  const activeDockedCandidate = useMemo(() => {
    if (showcaseMode === 'mrp1_unbuildable_raw_hit') {
      return mrp1UnbuildableCandidate;
    }
    return mrp1LeadCandidate;
  }, [showcaseMode, mrp1LeadCandidate, mrp1UnbuildableCandidate]);

  const activePoseMode = useMemo(() => {
    if (
      showcaseMode === 'her2_trastuzumab_biologic' ||
      showcaseMode === 'novel_dissertation_protein'
    ) {
      // Show HER2 reference pocket conformation for structural context
      const modes = getModesForSmiles(
        PROTEIN_TARGETS_3D.HER2,
        PROTEIN_TARGETS_3D.HER2.referenceLigandSmiles,
        PROTEIN_TARGETS_3D.HER2.referenceAffinityKcalMol
      );
      return modes[0];
    }
    const modes = getModesForSmiles(
      PROTEIN_TARGETS_3D.MRP1,
      activeDockedCandidate.smiles,
      activeDockedCandidate.dock_affinity
    );
    return modes[0];
  }, [showcaseMode, activeDockedCandidate]);

  // Interactive Three.js WebGL 3D Viewer
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 390;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);

    const [cx, cy, cz] = activeTarget3D.boxCenter;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(cx + 18.5, cy + 12.5, cz + 21.5);

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
    controls.autoRotateSpeed = 0.55;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight1.position.set(cx + 30, cy + 40, cz + 35);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.55);
    dirLight2.position.set(cx - 30, cy - 25, cz - 20);
    scene.add(dirLight2);

    // 1. Render Transmembrane / Kinase Pocket Helices
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
        opacity: 0.46,
        roughness: 0.3,
        metalness: 0.1,
      });
      const cyl = new THREE.Mesh(geom, mat);
      cyl.position.copy(mid);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      scene.add(cyl);
    });

    // 2. Render Pocket Surface Wireframe & Search Box
    if (showSurfaceBox) {
      const [sx, sy, sz] = activeTarget3D.boxSize;
      const boxGeom = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(boxGeom);
      const lineMat = new THREE.LineBasicMaterial({
        color:
          showcaseMode === 'her2_trastuzumab_biologic' ||
          showcaseMode === 'novel_dissertation_protein'
            ? 0x38bdf8
            : showcaseMode === 'mrp1_unbuildable_raw_hit'
            ? 0xf43f5e
            : 0x10b981,
        transparent: true,
        opacity: 0.35,
      });
      const boxWire = new THREE.LineSegments(edges, lineMat);
      boxWire.position.set(cx, cy, cz);
      scene.add(boxWire);

      const pocketGeom = new THREE.IcosahedronGeometry(7.2, 2);
      const pocketMat = new THREE.MeshBasicMaterial({
        color:
          showcaseMode === 'her2_trastuzumab_biologic' ||
          showcaseMode === 'novel_dissertation_protein'
            ? 0x38bdf8
            : 0x14b8a6,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      });
      const pocketMesh = new THREE.Mesh(pocketGeom, pocketMat);
      pocketMesh.position.set(cx, cy, cz);
      scene.add(pocketMesh);
    }

    // 3. Render Pocket Contact Residues
    activeTarget3D.contactResidues.forEach((res) => {
      res.atoms.forEach((a) => {
        const atomGeom = new THREE.SphereGeometry(0.36, 16, 16);
        const atomMat = new THREE.MeshStandardMaterial({
          color: a.element === 'N' ? 0x60a5fa : a.element === 'O' ? 0xf87171 : 0x94a3b8,
          roughness: 0.35,
        });
        const mesh = new THREE.Mesh(atomGeom, atomMat);
        mesh.position.set(a.x, a.y, a.z);
        scene.add(mesh);
      });
      for (let i = 0; i < res.atoms.length - 1; i++) {
        const p1 = new THREE.Vector3(res.atoms[i].x, res.atoms[i].y, res.atoms[i].z);
        const p2 = new THREE.Vector3(res.atoms[i + 1].x, res.atoms[i + 1].y, res.atoms[i + 1].z);
        const dist = p1.distanceTo(p2);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const bondGeom = new THREE.CylinderGeometry(0.11, 0.11, dist, 10);
        const bondMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
        const bond = new THREE.Mesh(bondGeom, bondMat);
        bond.position.copy(mid);
        bond.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3().subVectors(p2, p1).normalize()
        );
        scene.add(bond);
      }
    });

    // 4. Render Active Ligand / Structural Pose Atoms & Bonds
    if (activePoseMode) {
      const ligAtoms: Atom3D[] = activePoseMode.ligandAtoms;
      ligAtoms.forEach((a: Atom3D) => {
        const radius = a.element === 'S' || a.element === 'Cl' ? 0.56 : 0.45;
        const geom = new THREE.SphereGeometry(radius, 22, 22);
        const baseColor =
          showcaseMode === 'mrp1_unbuildable_raw_hit' && a.element === 'C'
            ? 0xf43f5e
            : showcaseMode === 'her2_trastuzumab_biologic' && a.element === 'C'
            ? 0x38bdf8
            : ELEMENT_COLORS[a.element] || 0x10b981;
        const mat = new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.2,
          metalness: 0.15,
        });
        const sphere = new THREE.Mesh(geom, mat);
        sphere.position.set(a.x, a.y, a.z);
        scene.add(sphere);
      });

      for (let i = 0; i < ligAtoms.length; i++) {
        for (let j = i + 1; j < ligAtoms.length; j++) {
          const p1 = new THREE.Vector3(ligAtoms[i].x, ligAtoms[i].y, ligAtoms[i].z);
          const p2 = new THREE.Vector3(ligAtoms[j].x, ligAtoms[j].y, ligAtoms[j].z);
          const dist = p1.distanceTo(p2);
          if (dist < 1.95) {
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const bondGeom = new THREE.CylinderGeometry(0.16, 0.16, dist, 12);
            const bondMat = new THREE.MeshStandardMaterial({
              color:
                showcaseMode === 'mrp1_unbuildable_raw_hit'
                  ? 0xfda4af
                  : showcaseMode === 'her2_trastuzumab_biologic'
                  ? 0xbae6fd
                  : 0xd1fae5,
              roughness: 0.28,
            });
            const bond = new THREE.Mesh(bondGeom, bondMat);
            bond.position.copy(mid);
            bond.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3().subVectors(p2, p1).normalize()
            );
            scene.add(bond);
          }
        }
      }

      // 5. Render Non-Covalent Polar Contacts / H-Bonds
      if (showContactLabels) {
        activeTarget3D.contactResidues.forEach((res) => {
          const anchor = res.atoms[res.atoms.length - 1];
          const pAnchor = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
          let nearestLig = ligAtoms[0];
          let minD = 999;
          ligAtoms.forEach((la: Atom3D) => {
            const d = pAnchor.distanceTo(new THREE.Vector3(la.x, la.y, la.z));
            if (d < minD) {
              minD = d;
              nearestLig = la;
            }
          });
          if (nearestLig) {
            const pLig = new THREE.Vector3(nearestLig.x, nearestLig.y, nearestLig.z);
            const lineGeom = new THREE.BufferGeometry().setFromPoints([pAnchor, pLig]);
            const lineMat = new THREE.LineDashedMaterial({
              color: 0xfacc15,
              dashSize: 0.35,
              gapSize: 0.2,
            });
            const line = new THREE.Line(lineGeom, lineMat);
            line.computeLineDistances();
            scene.add(line);
          }
        });
      }
    }

    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 390;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(reqId);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    activeTarget3D,
    activePoseMode,
    showcaseMode,
    showSurfaceBox,
    showContactLabels,
    cameraResetCounter,
  ]);

  const approvedGatesCount = safetyGates.filter((g) => g.status === 'Approved').length;
  const topBiologicReactors = evaluations.filter(
    (e) => e.checks.biologicalCompatibilityOk !== false
  );
  const topRankedReactor = topBiologicReactors[0] || evaluations[0];
  const topNextRecipes = recommendationSuite.proposedExperiments.slice(0, 2);

  return (
    <div className="space-y-8">
      {/* 5-Second Hero Banner + Interactive Stage 1 Candidate & 3D Molecular Structure Workbench */}
      <section className="bg-white border border-slate-200 shadow-xs">
        {/* Top Hero Strip */}
        <div className="p-6 lg:p-8 border-b border-slate-200 bg-gradient-to-b from-slate-50/70 to-white">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-700">
              <span className="normal-case">bioREACT</span> · AI-ASSISTED DRUG DEVELOPMENT &amp; MANUFACTURING WORKBENCH
            </span>
            <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1">
              Evidence-aware · Constraint-checked · Scientist-reviewed
            </span>
          </div>

          <div className="max-w-4xl space-y-3">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-950 leading-tight">
              From promising molecules to practical manufacturing.
            </h1>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed max-w-3xl">
              An AI-assisted research workbench that evaluates molecular feasibility, identifies
              manufacturing bottlenecks and recommends what to investigate next — with scientific
              checks and human oversight.
            </p>
          </div>

          {/* Unifying Workbench Concept Strip */}
          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <p className="text-xs sm:text-sm font-medium text-slate-800">
              <strong className="font-semibold text-slate-950">One scientific workbench.</strong>{' '}
              Different manufacturing pathways. Shared evidence, feasibility checks and experiment
              planning.
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onChangePathwayMode('small_molecule_chemical');
                  onNavigateToSection('dissertation_3d');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Atom className="w-3.5 h-3.5 text-emerald-400" />
                <span>Explore Molecular Design (Route A)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangePathwayMode('established_biologic');
                  onNavigateToSection('screening');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Explore Biomanufacturing (Route B)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangePathwayMode('established_biologic');
                  onNavigateToSection('mass_balance');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Open Animated Bioreactor (5. Engineering Feasibility)</span>
              </button>
            </div>
          </div>
        </div>

        {/* STAGE 1 — Candidate Discovery & Interactive 3D Molecular Structure Viewer */}
        <div className="p-6 lg:p-8 bg-slate-950 text-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                STAGE 01 · CANDIDATE DISCOVERY &amp; INTERACTIVE 3D STRUCTURE INSPECTION
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Inspect 3D Molecular Target &amp; Select Candidate Pathway
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Switch between small-molecule docking candidates (Route A) and recombinant biologic
                protein targets (Route B) in the live Three.js WebGL structure viewer.
              </p>
            </div>

            {/* Candidate Switcher Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowcaseMode('mrp1_manufacturable_lead');
                  onChangePathwayMode('small_molecule_chemical');
                }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showcaseMode === 'mrp1_manufacturable_lead'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Route A · MRP1 Lead (−10.82 kcal/mol · PASS)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowcaseMode('mrp1_unbuildable_raw_hit');
                  onChangePathwayMode('small_molecule_chemical');
                }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showcaseMode === 'mrp1_unbuildable_raw_hit'
                    ? 'bg-rose-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Route A · Unbuildable Hit (−12.90 kcal/mol · FAIL)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowcaseMode('her2_trastuzumab_biologic');
                  onChangePathwayMode('established_biologic');
                }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showcaseMode === 'her2_trastuzumab_biologic'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Route B · HER2 / {candidate.genericName} (145.5 kDa IgG1)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowcaseMode('novel_dissertation_protein');
                  onChangePathwayMode('novel_dissertation_protein');
                }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showcaseMode === 'novel_dissertation_protein'
                    ? 'bg-teal-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Route B · Novel Dissertation Protein
              </button>
            </div>
          </div>

          {/* 12-Col Grid: 7 Cols Live 3D Viewer | 5 Cols Candidate Feasibility & Route Handoff */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5 items-stretch">
            {/* Left 7 Columns: Live Three.js WebGL 3D Viewer */}
            <div className="lg:col-span-7 flex flex-col border border-slate-800 bg-[#090d16]">
              {/* Viewer Top Toolbar */}
              <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                    Three.js WebGL 3D Viewer
                  </span>
                  <span className="text-slate-200 font-semibold">
                    {activeTarget3D.symbol} · PDB: {activeTarget3D.pdbId} · UniProt:{' '}
                    {activeTarget3D.uniprotId}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSurfaceBox((v) => !v)}
                    className={`px-2 py-1 text-[11px] border cursor-pointer whitespace-nowrap shrink-0 ${
                      showSurfaceBox
                        ? 'bg-slate-800 text-cyan-300 border-cyan-700'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    Pocket Box: {showSurfaceBox ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowContactLabels((v) => !v)}
                    className={`px-2 py-1 text-[11px] border cursor-pointer whitespace-nowrap shrink-0 ${
                      showContactLabels
                        ? 'bg-slate-800 text-amber-300 border-amber-700'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    H-Bonds: {showContactLabels ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraResetCounter((c) => c + 1)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset View</span>
                  </button>
                </div>
              </div>

              {/* Three.js Canvas Mount */}
              <div className="relative flex-1 min-h-[360px] w-full">
                <div ref={mountRef} className="w-full h-[360px] cursor-grab active:cursor-grabbing" />

                {/* Floating Overlay Legend */}
                <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-slate-950/85 border border-slate-800 px-3 py-2 text-[11px] font-mono">
                  <div className="flex flex-wrap items-center gap-3 text-slate-300">
                    <span>Drag to rotate · Scroll to zoom</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-amber-300">
                      Contacts:{' '}
                      {activeTarget3D.contactResidues
                        .map((r) => `${r.resName}-${r.resSeq}`)
                        .join(', ')}
                    </span>
                  </div>
                  <span className="text-cyan-400">
                    Center: [{activeTarget3D.boxCenter.join(', ')}] Å
                  </span>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Live Candidate Inspection & Scientific Route Separation */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-900 border border-slate-800 p-5 space-y-4">
              {showcaseMode === 'mrp1_manufacturable_lead' ||
              showcaseMode === 'mrp1_unbuildable_raw_hit' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold uppercase text-amber-400">
                      ROUTE A · SMALL-MOLECULE DISCOVERY &amp; CHEMICAL SYNTHESIS
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-mono font-bold uppercase ${
                        showcaseMode === 'mrp1_manufacturable_lead'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}
                    >
                      {showcaseMode === 'mrp1_manufacturable_lead'
                        ? 'CRITICS VERDICT: PASS'
                        : 'CRITICS VERDICT: FAIL (REJECTED)'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">
                      {showcaseMode === 'mrp1_manufacturable_lead'
                        ? 'Manufacturable Lead: Biphenyl Sulfonamide (R2-Lead-1)'
                        : 'Unbuildable Top Raw Docking Hit (Rejected by Critics)'}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {showcaseMode === 'mrp1_manufacturable_lead'
                        ? 'Selected after closed-loop critic feedback on human MRP1 (ABCC1, PDB: 5UJA). Outperforms reference inhibitor MK-571 (−9.10 kcal/mol) while remaining practical to synthesise in 3 steps with zero chiral centres.'
                        : 'Demonstrates why docking score alone is insufficient: despite a −12.90 kcal/mol raw Vina score on MRP1, deterministic synthesisability critics reject this structure due to 7 stereocentres, bridged ring strain, and 18 estimated synthetic steps.'}
                    </p>
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        MRP1 Docking Score (Vina)
                      </div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">
                        {showcaseMode === 'mrp1_manufacturable_lead'
                          ? '−10.82 kcal/mol'
                          : '−12.90 kcal/mol'}
                      </div>
                      <div className="text-[10px] text-slate-400">vs MK-571 ref −9.10 kcal/mol</div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        Synthesisability (SA Score)
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          showcaseMode === 'mrp1_manufacturable_lead'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {showcaseMode === 'mrp1_manufacturable_lead'
                          ? '2.64 / 10 (Easy)'
                          : '6.42 / 10 (Fails > 4.5)'}
                      </div>
                      <div className="text-[10px] text-slate-400">Ertl &amp; Schuffenhauer SA</div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        Stereocentres &amp; Steps
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          showcaseMode === 'mrp1_manufacturable_lead'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {showcaseMode === 'mrp1_manufacturable_lead'
                          ? '0 chiral · 3 steps'
                          : '7 chiral · 18 steps'}
                      </div>
                      <div className="text-[10px] text-slate-400">Process chemistry critic</div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        Manufacturing Route
                      </div>
                      <div className="text-sm font-bold text-amber-300 mt-0.5">
                        Organic Synthesis
                      </div>
                      <div className="text-[10px] text-slate-400">
                        No living cell bioreactor
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <strong className="text-amber-300 font-mono">
                      MANUFACTURING ROUTE SEPARATION:
                    </strong>{' '}
                    As a 412 Da small molecule, this candidate proceeds to{' '}
                    <strong>organic chemical synthesis &amp; crystallisation</strong>. It never
                    enters CHO bioreactor modelling.
                  </div>
                </div>
              ) : showcaseMode === 'her2_trastuzumab_biologic' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold uppercase text-cyan-400">
                      ROUTE B · RECOMBINANT BIOLOGIC &amp; BIOMANUFACTURING
                    </span>
                    <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-950 text-cyan-300 border border-blue-700">
                      145.5 kDa RECOMBINANT mAb
                    </span>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-white">
                        {candidate.genericName} ({candidate.brandName}) · Target: HER2 (ERBB2)
                      </h3>
                      <div className="flex items-center gap-1">
                        {allBiologicCandidates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => onSelectBiologicCandidate(c.id)}
                            className={`px-2 py-0.5 text-[11px] font-mono border cursor-pointer whitespace-nowrap shrink-0 ${
                              c.id === candidate.id
                                ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            {c.genericName}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      3D viewer shows human <strong>HER2 (ERBB2, PDB: 3PP0, UniProt: P04626)</strong>.{' '}
                      {candidate.genericName} requires mammalian suspension culture (CHO-K1) for
                      heterotetrameric disulfide assembly and complex N-linked Fc glycosylation
                      (Asn297).
                    </p>
                  </div>

                  {/* Key Biomanufacturing Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        Expression Host &amp; Route
                      </div>
                      <div className="text-sm font-bold text-cyan-300 mt-0.5">
                        {ORGANISM_PROCESS_MODELS[selectedOrganismId].shortBadge}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Top Reactor: {topRankedReactor?.reactor.shortName}
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        500 L Oxygen Balance
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          physicsResult.otrMmolPerLHour >= physicsResult.ourMmolPerLHour
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        OTR {physicsResult.otrMmolPerLHour.toFixed(1)} vs OUR{' '}
                        {physicsResult.ourMmolPerLHour.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        mmol O₂/L/h · τ = {physicsResult.estimatedShearStressPa.toFixed(2)} Pa
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        Literature Evidence
                      </div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">
                        {prismaRecordsIncluded} PRISMA Records
                      </div>
                      <div className="text-[10px] text-slate-400">8 Databases · Audited Ledger</div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 uppercase">
                        Next-Experiment Gate
                      </div>
                      <div className="text-sm font-bold text-amber-300 mt-0.5">
                        {recommendationSuite.decisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
                          ? '3 Ranked Recipes'
                          : recommendationSuite.decisionLevel ===
                            'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
                          ? 'High-Uncertainty Warning'
                          : 'Abstaining (Out of Domain)'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        5 Gates: {approvedGatesCount}/5 Approved
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <strong className="text-cyan-300 font-mono">
                      SCIENTIFIC INTEGRITY GUARDRAIL:
                    </strong>{' '}
                    Small-molecule MRP1 docking scores (−10.82 kcal/mol) apply exclusively to MRP1
                    chemical ligands and are <strong>never</strong> combined with HER2 or used to
                    predict CHO bioreactor productivity.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold uppercase text-teal-400">
                      ROUTE B · RESEARCH-STAGE NOVEL DISSERTATION PROTEIN
                    </span>
                    <span className="px-2 py-0.5 text-xs font-mono font-bold bg-teal-950 text-teal-300 border border-teal-700">
                      EVIDENCE GATE ACTIVE
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">{novelProfile.proteinName}</h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {novelProfile.intendedApplication} ({novelProfile.molecularWeightKda} kDa,{' '}
                      {novelProfile.ptmAndGlycosylationRequirement}). Evaluates suitable expression
                      hosts and blocks ungrounded quantitative bioreactor optimisation until wet-lab
                      kinetics (<span className="font-mono">q_p, q_O2, μ_max</span>) are supplied.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                    <div className="font-mono text-teal-300 font-bold">
                      NO AUTOMATIC CHO DEFAULT FOR NOVEL PROTEINS:
                    </div>
                    <p>
                      Proposed Host: <strong>{novelProfile.proposedExpressionHost}</strong>. Until
                      researcher-supplied kinetic parameters and human sign-off are completed, the
                      Bayesian recommender triggers <strong>Level 3 Scientific Abstention</strong>{' '}
                      rather than borrowing Trastuzumab kinetics.
                    </p>
                  </div>
                </div>
              )}

              {/* Bottom Action Bar inside Right Column */}
              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {showcaseMode === 'mrp1_manufacturable_lead' ||
                showcaseMode === 'mrp1_unbuildable_raw_hit' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigateToSection('dissertation_3d')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Open Full 3D Docking &amp; Critics Workbench</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChangePathwayMode('small_molecule_chemical');
                        onNavigateToSection('screening');
                      }}
                      className="px-3 py-2 text-xs font-mono text-amber-300 border border-amber-700/70 hover:bg-amber-950/50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Inspect Chemical Synthesis Route →
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigateToSection('screening')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Open Host &amp; Reactor Screening</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToSection('mass_balance')}
                      className="px-3 py-2 text-xs font-mono text-cyan-300 border border-cyan-700/70 hover:bg-cyan-950/50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Inspect 500 L Scale-Up &amp; Next Experiments →
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STAGE 2 — Two Central Clickable Pathway Cards (Route A vs Route B) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
              STAGE 02 · CHOOSE YOUR MANUFACTURING PATHWAY
            </div>
            <h2 className="text-xl font-bold text-slate-950">
              Two Scientific Pathways, One Shared Decision Architecture
            </h2>
          </div>
          <p className="text-xs text-slate-600 font-mono">
            Click either pathway card to launch its dedicated modules
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Card A — Design a Drug Molecule */}
          <div
            onClick={() => {
              onChangePathwayMode('small_molecule_chemical');
              onNavigateToSection('dissertation_3d');
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChangePathwayMode('small_molecule_chemical');
                onNavigateToSection('dissertation_3d');
              }
            }}
            className="group bg-white border border-slate-200 hover:border-slate-900 p-6 lg:p-7 flex flex-col justify-between transition-all cursor-pointer shadow-xs hover:shadow-md"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase bg-amber-50 text-amber-900 border border-amber-300">
                  Route A · Small-Molecule Discovery &amp; Chemical Synthesis
                </span>
                <span className="text-xs font-mono text-slate-500">No Bioreactor Required</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-950 group-hover:text-blue-700 transition-colors">
                  Design a Drug Molecule
                </h3>
                <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                  Explore small-molecule candidates, assess predicted protein interactions and
                  evaluate whether promising compounds are practical to synthesise.
                </p>
              </div>

              {/* Included Capabilities */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs text-slate-700">
                <div className="font-mono text-[11px] font-bold uppercase text-slate-500">
                  Included in Route A:
                </div>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Molecular discovery &amp; 3D docking:</strong> Interactive Three.js
                      pocket inspection &amp; AutoDock Vina poses on human MRP1 (−10.82 kcal/mol vs
                      MK-571 −9.10 kcal/mol).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Docking and chemistry critics:</strong> Deterministic synthesisability
                      (SA score ≤ 4.5, stereocentres ≤ 2) and process-chemistry structural alerts.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Synthesis feasibility:</strong> Routes validated small molecules to
                      3-step organic synthesis &amp; crystallisation (never to CHO bioreactors).
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-slate-900 text-white group-hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0">
                <span>Explore Molecular Design</span>
                <ArrowRight className="w-4 h-4" />
              </span>

              <div
                className="flex flex-wrap items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onNavigateToSection('dissertation_3d')}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  2. Molecular Design
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangePathwayMode('small_molecule_chemical');
                    onNavigateToSection('screening');
                  }}
                  className="px-2.5 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  4. Chemical Route Gate
                </button>
              </div>
            </div>
          </div>

          {/* Card B — Manufacture a Biologic */}
          <div
            onClick={() => {
              onChangePathwayMode('established_biologic');
              onNavigateToSection('screening');
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChangePathwayMode('established_biologic');
                onNavigateToSection('screening');
              }
            }}
            className="group bg-white border border-slate-200 hover:border-blue-700 p-6 lg:p-7 flex flex-col justify-between transition-all cursor-pointer shadow-xs hover:shadow-md"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase bg-blue-50 text-blue-900 border border-blue-300">
                  Route B · Biomanufacturing &amp; Cell Culture
                </span>
                <span className="text-xs font-mono text-slate-500">
                  7 Expression Hosts · 500 L Physics · BO
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-950 group-hover:text-blue-700 transition-colors">
                  Manufacture a Biologic
                </h3>
                <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                  Identify suitable production hosts, compare bioreactor configurations, evaluate
                  engineering feasibility and propose the next experiments.
                </p>
              </div>

              {/* Included Capabilities */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs text-slate-700">
                <div className="font-mono text-[11px] font-bold uppercase text-slate-500">
                  Included in Route B:
                </div>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Host &amp; manufacturing route selection:</strong> Evaluate CHO,
                      HEK293, <em>E. coli</em>, <em>K. phaffii</em> (Pichia),{' '}
                      <em>S. cerevisiae</em>, cultivated muscle &amp; microalgae before choosing a
                      reactor.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Interactive bioreactor visualiser &amp; scale-up physics:</strong>{' '}
                      Model-informed animated reactor schematic showing oxygen deficits, shear
                      vortices, mixing gradients, 1–3 impeller <span className="font-mono">N_P</span>{' '}
                      correlations &amp; <span className="font-mono">OTR ≥ OUR</span> closure.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Bayesian optimisation &amp; experiment recommendations:</strong>{' '}
                      Ranked operating recipes with 95% GP intervals, feasibility probabilities &amp;
                      3-level scientific abstention.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-blue-700 text-white group-hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0">
                <span>Explore Biomanufacturing</span>
                <ArrowRight className="w-4 h-4" />
              </span>

              <div
                className="flex flex-wrap items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChangePathwayMode('established_biologic');
                    onNavigateToSection('streams');
                  }}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  3. Evidence
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangePathwayMode('established_biologic');
                    onNavigateToSection('screening');
                  }}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  4. Host &amp; Reactors
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangePathwayMode('established_biologic');
                    onNavigateToSection('mass_balance');
                  }}
                  className="px-2 py-1 text-[11px] font-mono bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  5. Reactor Visual &amp; Physics
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangePathwayMode('established_biologic');
                    onNavigateToSection('optimiser');
                  }}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  6. Optimiser
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STAGE 3 & STAGE 4 — Unified 4-Stage Architecture Map & Live Next-Experiment Planner Preview */}
      <section className="bg-white border border-slate-200 p-6 lg:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-blue-700">
              STAGE 03 &amp; STAGE 04 · SHARED WORKFLOW &amp; UNIFIED NEXT-EXPERIMENT PLANNER
            </div>
            <h2 className="text-lg font-bold text-slate-950 mt-0.5">
              How Discovery, Manufacturability Critics &amp; Next-Experiment Planning Connect
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToSection('workflow_safety')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>
              Inspect All 5 Human Safety Gates ({approvedGatesCount}/5 Approved) →
            </span>
          </button>
        </div>

        {/* 4-Column Shared Workflow Pipeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                STAGE 1 · EVIDENCE &amp; 3D TARGET
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Candidate Discovery &amp; Provenance
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Inspect 3D protein pockets (MRP1 or HER2), screen 8 literature databases via PRISMA
                deduplication, and audit every kinetic or physical parameter against a 5-tier
                provenance ledger.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
              <button
                type="button"
                onClick={() => onNavigateToSection('dissertation_3d')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                2. 3D Viewer →
              </button>
              <button
                type="button"
                onClick={() => onNavigateToSection('streams')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                3. Evidence Ledger →
              </button>
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                STAGE 2 · ROUTE DECISION GATE
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Chemical Synthesis vs. Biological Host
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Separates small-molecule organic synthesis (Route A) from biological expression
                (Route B). Evaluates 7 biological hosts (CHO, HEK293, <em>E. coli</em>, Pichia,
                yeast, muscle, microalgae) on PTM &amp; disulfide requirements.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Host &amp; Route Gate</span>
              <button
                type="button"
                onClick={() => onNavigateToSection('screening')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                4. Route &amp; Reactors →
              </button>
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                STAGE 3 · DETERMINISTIC CRITICS
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Route-Specific Feasibility Checks
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>Route A:</strong> SA score, stereocentre count &amp; synthetic step critics.{' '}
                <strong>Route B:</strong> Biological reactor filtering (excludes photobioreactors
                for CHO) + 500 L <span className="font-mono">OTR ≥ OUR</span> &amp; shear checks.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
              <span
                className={
                  physicsResult.isScaleUpFeasible
                    ? 'text-emerald-700 font-semibold'
                    : 'text-rose-700 font-semibold'
                }
              >
                500 L: {physicsResult.isScaleUpFeasible ? 'Feasible' : 'OTR Deficit'}
              </span>
              <button
                type="button"
                onClick={() => onNavigateToSection('mass_balance')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                5. Engineering Physics →
              </button>
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                STAGE 4 · NEXT EXPERIMENTS
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Uncertainty-Aware Experiment Planner
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Replaces generic advice with ranked operating combinations, 95% GP intervals (
                <span className="font-mono">μ ± 1.96σ</span>), constraint probabilities{' '}
                <span className="font-mono">P(OTR ≥ OUR)</span>, 3-level abstention &amp; human
                review gates.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
              <button
                type="button"
                onClick={() => onNavigateToSection('optimiser')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                6. BO Recommender →
              </button>
              <button
                type="button"
                onClick={() => onNavigateToSection('brief')}
                className="text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                7. Dossier →
              </button>
            </div>
          </div>
        </div>

        {/* Live Snapshot of Stage 4 Next-Experiment Recommender right on the Homepage */}
        <div className="border border-slate-200 bg-slate-50 p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase text-slate-900">
                  LIVE NEXT-EXPERIMENT PLANNER SNAPSHOT ({candidate.genericName} ·{' '}
                  {strParams.workingVolumeL} L Scale-Up)
                </span>
                <span
                  className={`px-2 py-0.5 text-[11px] font-mono font-bold ${
                    recommendationSuite.decisionLevel === 'LEVEL_1_SUFFICIENT_EVIDENCE'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : recommendationSuite.decisionLevel ===
                        'LEVEL_2_HIGH_UNCERTAINTY_EXPLORATORY'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-rose-100 text-rose-900 border border-rose-300'
                  }`}
                >
                  {recommendationSuite.decisionBadge}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {recommendationSuite.decisionSummary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!physicsResult.isScaleUpFeasible && (
                <button
                  type="button"
                  onClick={onApplyMicrospargerFixAndInspect}
                  className="px-3 py-1.5 text-xs font-mono font-semibold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Apply 15 μm Microsparger + 35% O₂ Fix →
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateToSection('optimiser')}
                className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-900 text-white hover:bg-blue-700 cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Full Next-Experiment Recommender →
              </button>
            </div>
          </div>

          {topNextRecipes.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {topNextRecipes.map((rec: ProposedNextExperimentRecipe) => (
                <div
                  key={rec.id}
                  className="bg-white border border-slate-200 p-4 flex flex-col justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <span className="font-bold text-blue-900">
                        RANK #{rec.rank} · {rec.codeLabel}
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        Joint P(feas) ={' '}
                        {(rec.probabilisticConstraints.jointFeasibilityProbability * 100).toFixed(
                          0
                        )}
                        %
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900">{rec.title}</div>
                    <div className="font-mono text-[11px] text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                      VVD = {rec.operatingVector.perfusionRateVvd} · DO ={' '}
                      {rec.operatingVector.doSetpointPercent}% · N ={' '}
                      {rec.operatingVector.agitationRpm} RPM ({rec.operatingVector.impellerCount}{' '}
                      impellers) · Q_s = {rec.operatingVector.spargeRateVvm} vvm · y_O₂ ={' '}
                      {rec.operatingVector.inletO2Percent.toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 font-mono text-[11px]">
                    <span className="text-slate-700">
                      Pred. Productivity:{' '}
                      <strong className="text-slate-950">
                        {rec.predictions.volumetricProductivityMeanMgLDay.toFixed(1)} ±{' '}
                        {(1.96 * rec.predictions.volumetricProductivityTotalStdMgLDay).toFixed(1)}{' '}
                        mg/L/day
                      </strong>{' '}
                      (95% CI)
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToSection('optimiser')}
                      className="text-blue-700 hover:underline font-semibold cursor-pointer"
                    >
                      Review &amp; Test →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Expandable Progressive Disclosure: "About the Approach & Technical Details" */}
      <section className="bg-white border border-slate-200">
        <button
          type="button"
          onClick={() => setIsTechnicalDetailsOpen((prev) => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="space-y-0.5">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
              PROGRESSIVE DISCLOSURE · TECHNICAL ARCHITECTURE &amp; SCOPE BOUNDARIES
            </div>
            <div className="text-sm font-bold text-slate-900">
              About the Approach &amp; Technical Details (&ldquo;One pattern, applied twice&rdquo;,
              Compute Benchmarks, Synthetic Cost Basis &amp; Future Extensions)
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-300 shrink-0">
            <span>{isTechnicalDetailsOpen ? 'Hide Technical Details' : 'Show Technical Details'}</span>
            {isTechnicalDetailsOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {isTechnicalDetailsOpen && (
          <div className="px-6 pb-6 pt-2 border-t border-slate-200 space-y-6 text-xs text-slate-700 leading-relaxed">
            {/* 1. One pattern, applied twice */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pt-2">
              <div className="lg:col-span-8 space-y-2">
                <h3 className="text-sm font-bold text-slate-950">
                  1. Core Architectural Thesis: &ldquo;One pattern, applied twice&rdquo;
                </h3>
                <p>
                  A generative proposer produces high-scoring candidates; deterministic scientific
                  critics reject the ones that cannot actually be made. Applied to small molecules
                  (Route A), the top raw MRP1 docking hit (
                  <span className="font-mono font-semibold">−12.90 kcal/mol</span>) fails on
                  synthesisability: SA 6.42, 7 stereocentres, and 18 synthetic steps, whereas the
                  critic-guided lead (<span className="font-mono font-semibold">−10.82 kcal/mol</span>
                  ) passes with 0 stereocentres and 3 steps. Applied to biologic bioreactor operating
                  conditions (Route B), highest-cell-density duties fail on oxygen transfer (
                  <span className="font-mono">OUR &gt; OTR</span>), impeller flooding, or
                  hydrodynamic shear (<span className="font-mono">τ &gt; 1.65 Pa</span>). In both
                  domains, unconstrained optimisation selects unbuildable solutions, and deterministic
                  critics make the search physically actionable.
                </p>
              </div>
              <div className="lg:col-span-4 bg-slate-50 border border-slate-200 p-4 font-mono space-y-1.5">
                <div className="font-bold text-emerald-800">
                  Critics-before-docking gate: 65% fewer CPU-seconds
                </div>
                <div className="text-[11px] text-slate-600">
                  Rejecting synthetically infeasible SMILES before 3D AutoDock Vina conformational
                  search saves 65% compute compared to docking all proposed ligands.
                </div>
                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                  Biologic COGS headline:{' '}
                  <strong className="text-slate-900">
                    ~${Math.round(downstreamCogsPerGramUsd)}/g
                  </strong>{' '}
                  (order-of-magnitude synthetic cost model for sensitivity exploration).
                </div>
              </div>
            </div>

            {/* 2. Module-to-Route Mapping Table */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-950">
                2. Complete Module Map Across Manufacturing Routes
              </h3>
              <div className="overflow-x-auto border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[11px] text-slate-700">
                      <th className="p-2.5">Workbench Section</th>
                      <th className="p-2.5">Manufacturing Route Role</th>
                      <th className="p-2.5">Core Scientific Methods &amp; Equations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        1. Workflow &amp; Safety
                      </td>
                      <td className="p-2.5 font-mono text-slate-700">
                        Shared Governance (Routes A &amp; B)
                      </td>
                      <td className="p-2.5 text-slate-600">
                        5 mandatory human-in-the-loop safety gates; post-sign-off oxygen deficit
                        validation; 8-seed BO vs Random Search reproducibility benchmark.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        2. Molecular Design &amp; Feasibility
                      </td>
                      <td className="p-2.5 font-mono text-amber-800">
                        Route A (Small-Molecule Discovery)
                      </td>
                      <td className="p-2.5 text-slate-600">
                        Three.js WebGL 3D structure viewer, AutoDock Vina binding modes, Ertl SA
                        score, stereocentre &amp; process-chemistry critics.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        3. Evidence &amp; Candidate Profile
                      </td>
                      <td className="p-2.5 font-mono text-blue-800">
                        Route B (Biologic Evidence &amp; Audit)
                      </td>
                      <td className="p-2.5 text-slate-600">
                        8-database PRISMA literature pipeline, 5-tier Parameter Provenance Ledger,
                        and interactive Before/After Assumption-Challenge Workbench.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        4. Manufacturing Route &amp; Reactor Screening
                      </td>
                      <td className="p-2.5 font-mono text-blue-800">
                        Route Gate (A vs B) &amp; Host/Reactor Selection
                      </td>
                      <td className="p-2.5 text-slate-600">
                        Evaluates 7 biological hosts + chemical synthesis; enforces hard biological
                        compatibility filter before ranking 8 reactor configurations.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        5. Engineering Feasibility
                      </td>
                      <td className="p-2.5 font-mono text-blue-800">
                        Route B (500 L Scale-Up Physics)
                      </td>
                      <td className="p-2.5 text-slate-600">
                        First-principles <span className="font-mono">OTR = kLa(C* − C_L)</span> vs{' '}
                        <span className="font-mono">OUR = q_O2·X_v</span>, 1–3 impeller{' '}
                        <span className="font-mono">P = n·N_P·ρ·N³·D⁵</span>, Kolmogorov shear, and
                        Resolve Oxygen Limitation simulator.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        6. Process Optimisation
                      </td>
                      <td className="p-2.5 font-mono text-blue-800">
                        Route B (Surrogate BO &amp; Next Experiments)
                      </td>
                      <td className="p-2.5 text-slate-600">
                        Gaussian Process surrogate (<span className="font-mono">μ ± 1.96σ</span>),
                        Constrained Expected Improvement, ranked next-experiment recipes &amp;
                        3-level abstention gate.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">
                        7. Results &amp; Recommendations
                      </td>
                      <td className="p-2.5 font-mono text-slate-700">
                        Shared Dossier &amp; Export (Routes A &amp; B)
                      </td>
                      <td className="p-2.5 text-slate-600">
                        CMC engineering dossier, downstream purification yield &amp; synthetic COGS
                        breakdown, and full JSON/CSV provenance export.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Explicit Distinction: Current Capabilities vs Future Research Extensions */}
            <div className="p-4 bg-slate-50 border border-slate-300 space-y-2">
              <div className="font-mono text-xs font-bold uppercase text-slate-900">
                3. Scientific Scope Transparency: Current Capabilities vs. Future Research Extensions
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold text-emerald-900 mb-1">
                    Implemented &amp; Validated in bioREACT Today:
                  </div>
                  <p className="text-slate-600">
                    Route A evaluates small-molecule protein–ligand docking (MRP1) and organic
                    synthesisability critics. Route B evaluates recombinant biologic expression host
                    suitability, bioreactor compatibility, 500 L oxygen/shear mass-balance closure,
                    and constrained Bayesian next-experiment recommendations for calibrated CHO
                    processes.
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-amber-900 mb-1">
                    Future Research Extension (Not Currently Implemented):
                  </div>
                  <p className="text-slate-600">
                    Extending 3D molecular critics to <strong>recombinant antibody sequence &amp;
                    structural developability</strong> (e.g., CDR hydrophobic surface patches,
                    aggregation propensity, high-concentration viscosity, thermal unfolding{' '}
                    <span className="font-mono">T_m</span>, and Asn deamidation risk) so that 3D
                    biologic design directly parameterises CHO bioreactor shear sensitivity and
                    downstream chromatography recovery is a future research extension and is not
                    claimed as an active model capability.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
