import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Atom3D,
  CLOSED_LOOP_DATASETS,
  CRITIC_EVAL_BENCHMARK,
  CRITIC_RUBRIC,
  CombinedCandidateAssessment,
  CriticVerdict,
   DOCK_CACHE_DATA,
  DockedCandidateEntry,
  PROTEIN_TARGETS_3D,
  ProteinTarget3DConfig,
  evaluateSmilesWithCritics,
  getModesForSmiles,
} from '../data/dissertationDockingData';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Play,
  Box,
  Layers,
  Sparkles,
  Upload,
  ArrowRight,
  Sliders,
  Terminal,
} from 'lucide-react';

interface DissertationClosedLoopPanelProps {
  onSendTargetToBioprocess?: (targetSymbol: string, uniprotId: string) => void;
  onRouteSmallMoleculeToGate?: () => void;
}

const CPK_COLORS: Record<string, number> = {
  C: 0x00e5ff, // Cyan ligand carbons (PyMOL classic)
  N: 0x3b82f6, // Nitrogen blue
  O: 0xf43f5e, // Oxygen red
  S: 0xfacc15, // Sulfur yellow
  F: 0x4ade80, // Fluorine light green
  Cl: 0x22c55e, // Chlorine green
  Br: 0xd97706, // Bromine amber
  P: 0xf97316, // Phosphorus orange
};

const CONTACT_CARBON_COLOR = 0xfacc15; // PyMOL yellow contact residue carbons

/**
 * Clean 2D Medicinal Chemistry Skeletal SVG Renderer for candidate cards
 */
const Molecule2DSvg: React.FC<{ smiles: string; verdict: CriticVerdict }> = ({
  smiles,
  verdict,
}) => {
  const isGlycosideMonster = smiles.includes('[C@H]1O[C@H](CO)');
  const isBridgedEpoxy = smiles.includes('[C@H]2O[C@@H]12');
  const hasCf3 = smiles.includes('C(F)(F)F');
  const hasNaphthyl = smiles.includes('c3ccc4ccccc4c3');
  const hasPiperidine = smiles.includes('N4CCCCC4');

  const borderStroke =
    verdict === 'pass' ? '#cbd5e1' : verdict === 'flag' ? '#fcd34d' : '#fda4af';

  return (
    <svg
      viewBox="0 0 260 110"
      className="w-full h-28 bg-slate-950 border"
      style={{ borderColor: borderStroke }}
      role="img"
      aria-label={`2D chemical structure for ${smiles}`}
    >
      {/* Subtle coordinate grid */}
      <line x1="0" y1="55" x2="260" y2="55" stroke="#1e293b" strokeWidth="0.7" />
      <line x1="130" y1="0" x2="130" y2="110" stroke="#1e293b" strokeWidth="0.7" />

      {isGlycosideMonster ? (
        <g stroke="#e2e8f0" strokeWidth="1.6" fill="none">
          {/* Fused polyphenolic benzothiazole + chiral glycoside + dipeptide */}
          <polygon points="35,40 52,30 69,40 69,60 52,70 35,60" stroke="#f87171" />
          <polygon points="69,40 86,30 103,40 103,60 86,70 69,60" stroke="#f87171" />
          <polygon points="103,40 120,30 137,40 137,60 120,70 103,60" stroke="#fbbf24" />
          {/* Chiral pyranose sugar ring */}
          <polygon points="155,28 173,20 190,28 190,48 173,56 155,48" stroke="#38bdf8" />
          {/* Chiral dipeptide tail */}
          <polyline points="137,60 158,74 180,62 202,76 225,64 242,75" stroke="#c084fc" />
          <text x="14" y="24" fill="#f87171" fontSize="9" fontFamily="monospace">
            HO-Ar (Fused×3)
          </text>
          <text x="152" y="15" fill="#38bdf8" fontSize="9" fontFamily="monospace">
            C-Glycoside (5★)
          </text>
          <text x="145" y="96" fill="#c084fc" fontSize="9" fontFamily="monospace">
            Tyr-Arg Tail (7 Stereocentres)
          </text>
        </g>
      ) : isBridgedEpoxy ? (
        <g stroke="#e2e8f0" strokeWidth="1.6" fill="none">
          {/* Bridged epoxy tetrahydropyridine */}
          <polygon points="45,45 65,33 85,45 85,68 65,80 45,68" stroke="#f87171" />
          {/* Bridgehead epoxide */}
          <polyline points="45,45 65,56 85,45" stroke="#fbbf24" strokeWidth="2" />
          <circle cx="65" cy="56" r="3" fill="#f43f5e" stroke="none" />
          {/* Sulfonamide + benzothiazole */}
          <polyline points="85,56 112,56 132,42 155,56" stroke="#38bdf8" />
          <polygon points="155,42 175,32 195,42 195,65 175,75 155,65" stroke="#e2e8f0" />
          <polygon points="195,42 215,32 232,42 232,65 215,75 195,65" stroke="#e2e8f0" />
          <text x="26" y="25" fill="#fbbf24" fontSize="9" fontFamily="monospace">
            Bridged Epoxy (4★ Stereo)
          </text>
          <text x="148" y="96" fill="#94a3b8" fontSize="9" fontFamily="monospace">
            -SO₂NH-Benzothiazole + ArBr
          </text>
        </g>
      ) : (
        <g stroke="#e2e8f0" strokeWidth="1.6" fill="none">
          {/* Clean Achiral Biphenyl-Sulfonamide-Carboxylate Pharmacophore */}
          {/* Carboxylate HOOC- */}
          <line x1="18" y1="55" x2="36" y2="55" stroke="#f43f5e" />
          <text x="6" y="46" fill="#f43f5e" fontSize="9" fontFamily="monospace">
            HOOC
          </text>
          {/* Phenyl Ring 1 */}
          <polygon points="36,42 54,32 72,42 72,66 54,76 36,66" stroke="#38bdf8" />
          <circle cx="54" cy="54" r="9" stroke="#38bdf8" strokeDasharray="3 2" />
          {/* Biaryl C-C bond */}
          <line x1="72" y1="54" x2="92" y2="54" stroke="#e2e8f0" />
          {/* Phenyl Ring 2 */}
          <polygon points="92,42 110,32 128,42 128,66 110,76 92,66" stroke="#38bdf8" />
          <circle cx="110" cy="54" r="9" stroke="#38bdf8" strokeDasharray="3 2" />
          {/* Sulfonamide -SO2-NH- Linker */}
          <polyline points="128,54 148,54 162,42 178,54" stroke="#facc15" />
          <text x="137" y="72" fill="#facc15" fontSize="9" fontFamily="monospace">
            SO₂NH
          </text>
          {/* Terminal Cap Ring 3 */}
          <polygon points="178,42 196,32 214,42 214,66 196,76 178,66" stroke="#4ade80" />
          {hasNaphthyl && (
            <polygon points="214,42 232,32 248,42 248,66 232,76 214,66" stroke="#4ade80" />
          )}
          {hasCf3 && (
            <>
              <line x1="214" y1="42" x2="234" y2="30" stroke="#4ade80" />
              <text x="235" y="29" fill="#4ade80" fontSize="9" fontFamily="monospace">
                CF₃
              </text>
              <line x1="214" y1="66" x2="234" y2="76" stroke="#22c55e" />
              <text x="236" y="81" fill="#22c55e" fontSize="9" fontFamily="monospace">
                Cl
              </text>
            </>
          )}
          {!hasCf3 && !hasNaphthyl && (
            <text x="218" y="57" fill="#38bdf8" fontSize="9" fontFamily="monospace">
              {hasPiperidine ? 'Piperidine' : 'Morpholine'}
            </text>
          )}
          <text x="36" y="98" fill="#34d399" fontSize="9" fontFamily="monospace">
            Achiral Biaryl Sulfonamide (0 Stereocentres · 3 Steps)
          </text>
        </g>
      )}
    </svg>
  );
};

export const DissertationClosedLoopPanel: React.FC<DissertationClosedLoopPanelProps> = ({
  onSendTargetToBioprocess,
  onRouteSmallMoleculeToGate,
}) => {
  // Active sub-tab inside the Dissertation Workflow
  const [subTab, setSubTab] = useState<'closed_loop' | 'eval_benchmark' | 'rubric_sandbox'>(
    'closed_loop'
  );

  // Selected Target Receptor (MRP1 default from dissertation, or HER2 linking to Trastuzumab)
  const [selectedTargetId, setSelectedTargetId] = useState<string>('MRP1');
  const [customTargetConfig, setCustomTargetConfig] = useState<ProteinTarget3DConfig | null>(
    null
  );

  const activeTarget: ProteinTarget3DConfig = useMemo(() => {
    if (selectedTargetId === 'CUSTOM' && customTargetConfig) {
      return customTargetConfig;
    }
    return PROTEIN_TARGETS_3D[selectedTargetId] || PROTEIN_TARGETS_3D.MRP1;
  }, [selectedTargetId, customTargetConfig]);

  // Run mode selector
  const [runMode, setRunMode] = useState<'cache' | 'gate_first'>('cache');
  const activeDataset = CLOSED_LOOP_DATASETS[runMode] || CLOSED_LOOP_DATASETS.cache;

  // Selected Candidate SMILES for the 3D PyMOL Viewer
  const [selectedSmiles, setSelectedSmiles] = useState<string>(
    'O=C(O)c1ccc(-c2ccc(S(=O)(=O)Nc3ccc(Cl)c(C(F)(F)F)c3)cc2)cc1'
  );
  const [selectedPoseMode, setSelectedPoseMode] = useState<number>(1);

  // 3D Viewer Visual Controls (matching index_6f513035.html + PyMOL presets)
  const [showPocketSurface, setShowPocketSurface] = useState<boolean>(true);
  const [showContactSticks, setShowContactSticks] = useState<boolean>(true);
  const [showGridBox, setShowGridBox] = useState<boolean>(false);
  const [autoRotate3D, setAutoRotate3D] = useState<boolean>(true);
  const [pymolStylePreset, setPymolStylePreset] = useState<
    'cartoon_sticks' | 'surface_pocket' | 'all_atom_spheres'
  >('cartoon_sticks');

  // + New Target Upload Drawer State
  const [isNewTargetOpen, setIsNewTargetOpen] = useState<boolean>(false);
  const [newTargetName, setNewTargetName] = useState<string>('EGFR_T790M');
  const [newTargetRefSmiles, setNewTargetRefSmiles] = useState<string>(
    'COc1cc(N(C)CCN(C)C)c(NC(=O)C=C)cc1Nc1nccc(-c2cn(C)c3ccccc23)n1'
  );
  const [uploadedPdbStats, setUploadedPdbStats] = useState<{
    fileName: string;
    atomCount: number;
    center: [number, number, number];
    size: [number, number, number];
    blindWarning: boolean;
  } | null>(null);

  // Critic Sandbox Live SMILES Evaluator
  const [sandboxSmiles, setSandboxSmiles] = useState<string>(
    'O=C(O)c1ccc(-c2ccc(S(=O)(=O)Nc3ccc(Cl)c(C(F)(F)F)c3)cc2)cc1'
  );
  const sandboxAssessment: CombinedCandidateAssessment = useMemo(
    () => evaluateSmilesWithCritics(sandboxSmiles),
    [sandboxSmiles]
  );

  // Critic Benchmark Policy Toggle (lenient vs strict)
  const [criticPolicy, setCriticPolicy] = useState<'lenient' | 'strict'>('lenient');

  // Resolve all 9 Vina modes for the currently selected SMILES
  const currentSmilesEntry: DockedCandidateEntry | undefined = useMemo(() => {
    for (const r of CLOSED_LOOP_DATASETS.cache.rounds) {
      const match = r.candidates.find((c) => c.smiles === selectedSmiles);
      if (match) return match;
    }
    return undefined;
  }, [selectedSmiles]);

  const currentAffinityFallback =
    currentSmilesEntry?.dock_affinity ||
    DOCK_CACHE_DATA[selectedSmiles]?.affinity ||
    activeTarget.referenceAffinityKcalMol;

  const poseModes = useMemo(
    () => getModesForSmiles(activeTarget, selectedSmiles, currentAffinityFallback),
    [activeTarget, selectedSmiles, currentAffinityFallback]
  );

  const activePose = useMemo(
    () => poseModes.find((m) => m.mode === selectedPoseMode) || poseModes[0],
    [poseModes, selectedPoseMode]
  );

  // ==========================================================================
  // THREE.JS 3D PYMOL-STYLE ROTATABLE POCKET VIEWER
  // ==========================================================================
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 500);
    camera.position.set(0, 4, 34);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // Enables 1-click PyMOL PNG export
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = autoRotate3D;
    controls.autoRotateSpeed = 1.1;
    controls.minDistance = 10;
    controls.maxDistance = 85;
    controlsRef.current = controls;

    // Studio & Rim Lighting for PyMOL Specular Highlights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(18, 24, 28);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-20, -15, -18);
    scene.add(rimLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const [cx, cy, cz] = activeTarget.boxCenter;
    const toLocal = (x: number, y: number, z: number) =>
      new THREE.Vector3(x - cx, y - cy, z - cz);

    // 1. Render Protein α-Helices (Procedural 3D Helical Ribbon + Cylinder Core)
    activeTarget.helices.forEach((hx) => {
      const startVec = toLocal(...hx.start);
      const endVec = toLocal(...hx.end);
      const dir = new THREE.Vector3().subVectors(endVec, startVec);
      const len = dir.length();

      // Translucent PyMOL cartoon cylinder axis
      const cylGeo = new THREE.CylinderGeometry(hx.radius * 0.72, hx.radius * 0.72, len, 20);
      const cylMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(hx.color),
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0.38,
      });
      const cylMesh = new THREE.Mesh(cylGeo, cylMat);
      const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
      cylMesh.position.copy(mid);
      cylMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize()
      );
      rootGroup.add(cylMesh);

      // Spiral α-helix ribbon curve around the axis
      const spiralPoints: THREE.Vector3[] = [];
      const up = dir.clone().normalize();
      const arbitrary =
        Math.abs(up.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const ortho1 = new THREE.Vector3().crossVectors(up, arbitrary).normalize();
      const ortho2 = new THREE.Vector3().crossVectors(up, ortho1).normalize();

      const turns = Math.max(3.5, len / 3.6);
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * turns * Math.PI * 2;
        const pointOnAxis = new THREE.Vector3().lerpVectors(startVec, endVec, t);
        const offset = ortho1
          .clone()
          .multiplyScalar(Math.cos(angle) * hx.radius)
          .add(ortho2.clone().multiplyScalar(Math.sin(angle) * hx.radius));
        spiralPoints.push(pointOnAxis.add(offset));
      }
      const curve = new THREE.CatmullRomCurve3(spiralPoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.36, 10, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hx.color),
        roughness: 0.28,
        metalness: 0.15,
      });
      rootGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
    });

    // Helper to draw a cylinder bond between two 3D points
    const addBondCylinder = (
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      radius: number,
      colorHex: number
    ) => {
      const diff = new THREE.Vector3().subVectors(p2, p1);
      const dist = diff.length();
      if (dist < 0.1) return;
      const geo = new THREE.CylinderGeometry(radius, radius, dist, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.25,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        diff.clone().normalize()
      );
      rootGroup.add(mesh);
    };

    // 2. Render 4.5 Å Contact Residues (Yellow Sticks + Non-Covalent Dashed H-Bonds/Salt-Bridges)
    if (showContactSticks) {
      activeTarget.contactResidues.forEach((res) => {
        const localAtoms = res.atoms.map((a) => ({
          atom: a,
          pos: toLocal(a.x, a.y, a.z),
        }));

        localAtoms.forEach(({ atom, pos }, idx) => {
          const elemColor =
            atom.element === 'C'
              ? CONTACT_CARBON_COLOR
              : CPK_COLORS[atom.element] || CONTACT_CARBON_COLOR;
          const sphereRadius = pymolStylePreset === 'all_atom_spheres' ? 0.42 : 0.26;
          const spGeo = new THREE.SphereGeometry(sphereRadius, 16, 16);
          const spMat = new THREE.MeshStandardMaterial({
            color: elemColor,
            roughness: 0.3,
          });
          const sp = new THREE.Mesh(spGeo, spMat);
          sp.position.copy(pos);
          rootGroup.add(sp);

          if (idx > 0) {
            addBondCylinder(localAtoms[idx - 1].pos, pos, 0.12, CONTACT_CARBON_COLOR);
          }
        });
      });
    }

    // 3. Render Docked Ligand Pose (Cyan Carbons + Heteroatoms + Interatomic Bonds)
    const ligandLocal = activePose.ligandAtoms.map((a) => ({
      atom: a,
      pos: toLocal(a.x, a.y, a.z),
    }));

    const atomRadius =
      pymolStylePreset === 'all_atom_spheres'
        ? 0.58
        : pymolStylePreset === 'surface_pocket'
          ? 0.38
          : 0.34;
    const bondRadius = pymolStylePreset === 'all_atom_spheres' ? 0.2 : 0.16;

    ligandLocal.forEach(({ atom, pos }) => {
      const colorHex = CPK_COLORS[atom.element] || 0x00e5ff;
      const geo = new THREE.SphereGeometry(atomRadius, 20, 20);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.2,
        metalness: 0.15,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.copy(pos);
      rootGroup.add(sphere);
    });

    // Connect covalent bonds between ligand atoms within 1.95 Å
    for (let i = 0; i < ligandLocal.length; i++) {
      for (let j = i + 1; j < ligandLocal.length; j++) {
        const d = ligandLocal[i].pos.distanceTo(ligandLocal[j].pos);
        if (d > 0.4 && d <= 1.98) {
          const mid = new THREE.Vector3()
            .addVectors(ligandLocal[i].pos, ligandLocal[j].pos)
            .multiplyScalar(0.5);
          const c1 = CPK_COLORS[ligandLocal[i].atom.element] || 0x00e5ff;
          const c2 = CPK_COLORS[ligandLocal[j].atom.element] || 0x00e5ff;
          addBondCylinder(ligandLocal[i].pos, mid, bondRadius, c1);
          addBondCylinder(mid, ligandLocal[j].pos, bondRadius, c2);
        }
      }
    }

    // 4. Dashed Yellow Interaction Lines between Contact Residue Terminal Atoms and Closest Ligand Atom
    if (showContactSticks && ligandLocal.length > 0) {
      activeTarget.contactResidues.forEach((res) => {
        const tipAtom = res.atoms[res.atoms.length - 1];
        const tipPos = toLocal(tipAtom.x, tipAtom.y, tipAtom.z);
        let nearestLigPos = ligandLocal[0].pos;
        let minDist = tipPos.distanceTo(nearestLigPos);
        for (const l of ligandLocal) {
          const d = tipPos.distanceTo(l.pos);
          if (d < minDist) {
            minDist = d;
            nearestLigPos = l.pos;
          }
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints([tipPos, nearestLigPos]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xfde047,
          dashSize: 0.35,
          gapSize: 0.22,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        rootGroup.add(line);
      });
    }

    // 5. Optional Translucent VDW Binding Pocket Surface
    if (showPocketSurface || pymolStylePreset === 'surface_pocket') {
      const surfGroup = new THREE.Group();
      const surfOpacity = pymolStylePreset === 'surface_pocket' ? 0.28 : 0.14;
      ligandLocal.forEach(({ atom, pos }, idx) => {
        if (idx % 2 !== 0) return;
        const sGeo = new THREE.SphereGeometry(2.35, 18, 18);
        const sMat = new THREE.MeshPhysicalMaterial({
          color: atom.element === 'O' ? 0xf43f5e : atom.element === 'N' ? 0x3b82f6 : 0xcbd5e1,
          transparent: true,
          opacity: surfOpacity,
          roughness: 0.4,
          depthWrite: false,
        });
        const sMesh = new THREE.Mesh(sGeo, sMat);
        sMesh.position.copy(pos);
        surfGroup.add(sMesh);
      });
      rootGroup.add(surfGroup);
    }

    // 6. Optional AutoDock Vina Search Grid Box Wireframe (24 x 24 x 24 Å)
    if (showGridBox) {
      const [sx, sy, sz] = activeTarget.boxSize;
      const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const boxLines = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x38bdf8 })
      );
      rootGroup.add(boxLines);
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
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    activeTarget,
    activePose,
    showPocketSurface,
    showContactSticks,
    showGridBox,
    autoRotate3D,
    pymolStylePreset,
  ]);

  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 4, 34);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const handleExportPng = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `bioREACT_ThreeJS_3DPose_${activeTarget.id}_mode${selectedPoseMode}.png`;
    a.click();
  };

  // Parse uploaded .pdb / .pdbqt file to compute 3D docking grid box (port of target.py)
  const handlePdbFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];

    for (const line of lines) {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const x = parseFloat(line.slice(30, 38));
        const y = parseFloat(line.slice(38, 46));
        const z = parseFloat(line.slice(46, 54));
        if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
          xs.push(x);
          ys.push(y);
          zs.push(z);
        }
      }
    }

    if (xs.length === 0) return;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    const cx = Number(((minX + maxX) / 2).toFixed(2));
    const cy = Number(((minY + maxY) / 2).toFixed(2));
    const cz = Number(((minZ + maxZ) / 2).toFixed(2));

    const sx = Number(Math.min(30, Math.max(18, maxX - minX + 10)).toFixed(1));
    const sy = Number(Math.min(30, Math.max(18, maxY - minY + 10)).toFixed(1));
    const sz = Number(Math.min(30, Math.max(18, maxZ - minZ + 10)).toFixed(1));

    setUploadedPdbStats({
      fileName: file.name,
      atomCount: xs.length,
      center: [cx, cy, cz],
      size: [sx, sy, sz],
      blindWarning: maxX - minX > 35,
    });
  };

  const handleSaveCustomTarget = () => {
    const base = PROTEIN_TARGETS_3D.MRP1;
    const center = uploadedPdbStats?.center || [22.5, 18.0, 28.4];
    const size = uploadedPdbStats?.size || [24.0, 24.0, 24.0];

    const customCfg: ProteinTarget3DConfig = {
      ...base,
      id: 'CUSTOM',
      symbol: `${newTargetName.toUpperCase()} (Custom Receptor)`,
      fullName: `User-Configured Receptor Target (${uploadedPdbStats?.fileName || 'receptor.pdbqt'})`,
      pdbId: uploadedPdbStats?.fileName || 'CUSTOM-PDB',
      uniprotId: 'CUSTOM-TARGET',
      referenceLigandName: 'Custom Reference Ligand',
      referenceLigandSmiles: newTargetRefSmiles,
      referenceAffinityKcalMol: -9.4,
      boxCenter: center,
      boxSize: size,
      blindDockingWarning: uploadedPdbStats?.blindWarning ?? false,
    };

    setCustomTargetConfig(customCfg);
    setSelectedTargetId('CUSTOM');
    setIsNewTargetOpen(false);
  };

  const verdictBadgeClass = (v: CriticVerdict) =>
    v === 'pass'
      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
      : v === 'flag'
        ? 'bg-amber-950 text-amber-300 border-amber-700'
        : 'bg-rose-950 text-rose-300 border-rose-700';

  return (
    <div className="space-y-6">
      {/* Header Banner Connecting Biochemistry Dissertation + Bioprocess Engineering */}
      <div className="bg-slate-900 text-slate-100 border border-slate-800 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cyan-400">
              <span>02. MOLECULAR DESIGN &amp; FEASIBILITY MODULE</span>
              <span>·</span>
              <span>CLOSED-LOOP PROTEIN–LIGAND DOCKING &amp; MANUFACTURABILITY CRITICS</span>
              <span>·</span>
              <span>THREE.JS WEBGL 3D POSE VIEWER (PYMOL-INSPIRED CPK PALETTE)</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Target Protein Pocket Screening, Synthesisability Critics &amp; Three.js 3D Pose Inspector
            </h1>
            <p className="text-xs text-slate-300 max-w-4xl leading-relaxed">
              In generative drug discovery, raw docking affinity and chemical manufacturability are{' '}
              <strong className="text-white">anti-correlated</strong>: top-scoring generative poses
              in the <strong className="text-white">MRP1 (ABCC1)</strong> pocket (e.g.{' '}
              <span className="font-mono text-rose-300">−12.90 kcal/mol</span> in{' '}
              <span className="font-mono">runs.db</span>) pack pockets with unmanufacturable chiral
              sugars and bridged rings (18 steps, 7 stereocentres). This closed-loop orchestrator pairs a{' '}
              <strong className="text-cyan-300">Designer Agent</strong> with deterministic{' '}
              <strong className="text-emerald-300">
                Synthesisability &amp; Process-Chemistry Critics
              </strong>{' '}
              to converge on achiral, 3-step biphenyl sulfonamides for{' '}
              <strong className="text-white">MRP1 (ABCC1)</strong> (
              <span className="font-mono text-emerald-300">−10.82 kcal/mol</span>,{' '}
              <span className="font-mono">£1–10/g</span>) vs MRP1 reference inhibitor{' '}
              <strong className="text-white">MK-571</strong> (
              <span className="font-mono">−9.10 kcal/mol</span>).
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="px-2.5 py-1 bg-amber-950/90 border border-amber-500/60 text-amber-200">
                Affinity difference vs MK-571 is within Vina&apos;s scoring error (~2-3 kcal/mol). The defensible claim is manufacturability at equal affinity: 18 steps and 7 stereocentres down to 3 steps and 0.
              </span>
              <span className="px-2.5 py-1 bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 font-semibold">
                Critics-before-docking gate: 65% fewer CPU-seconds
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {onRouteSmallMoleculeToGate && (
                <button
                  type="button"
                  onClick={onRouteSmallMoleculeToGate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                >
                  <span>Route Docked Small-Molecule Lead → Manufacturing Gate (No Bioreactor)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {onSendTargetToBioprocess && (
                <button
                  type="button"
                  onClick={() =>
                    onSendTargetToBioprocess(activeTarget.symbol, activeTarget.uniprotId)
                  }
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors cursor-pointer"
                >
                  <span>
                    Route Recombinant {activeTarget.id} Protein / Biologic → Bioreactor Gate
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-[11px] font-mono text-amber-300">
              Manufacturing Route Gate: Small molecules route to 3-step chemical synthesis (never CHO perfusion); docking scores ≠ clinical proof
            </span>
          </div>
        </div>

        {/* Explicit Modality & Manufacturing Route Separation Strip */}
        <div className="mt-4 p-3.5 bg-slate-950 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 bg-slate-900 border-l-2 border-cyan-400 space-y-1">
            <div className="font-mono font-semibold text-cyan-300 uppercase text-[11px]">
              MODALITY ROUTE A · SMALL-MOLECULE LIGAND CANDIDATES (THIS MODULE)
            </div>
            <p className="text-slate-300 leading-relaxed">
              Docked small-molecule inhibitors (e.g., Round 3 biphenyl sulfonamide, MW 412 Da,{' '}
              <span className="font-mono text-emerald-300">−10.82 kcal/mol</span>) are manufactured by{' '}
              <strong className="text-white">Organic Chemical Synthesis</strong> (3-step Suzuki +
              sulfonamide coupling, 0 stereocentres, £1–10/g API). Small molecules are{' '}
              <strong className="text-rose-300">never</strong> passed into a CHO perfusion bioreactor.
            </p>
          </div>
          <div className="p-2.5 bg-slate-900 border-l-2 border-teal-400 space-y-1">
            <div className="font-mono font-semibold text-teal-300 uppercase text-[11px]">
              MODALITY ROUTE B · RECOMBINANT TARGET PROTEINS &amp; BIOLOGIC mAbs (STAGES 1–4)
            </div>
            <p className="text-slate-300 leading-relaxed">
              Recombinant protein therapeutics (e.g., <strong className="text-white">Trastuzumab IgG1</strong>,
              145.5 kDa) or recombinant target proteins expressed for biophysical/crystallography assays
              (e.g., <strong className="text-white">human {activeTarget.id} receptor</strong>) route to{' '}
              <strong className="text-white">Upstream Cell-Culture Bioreactor Screening</strong> (CHO /
              Sf9 / Pichia, kLa, OTR/OUR, shear τ_crit).
            </p>
          </div>
        </div>

        {/* Target Receptor Selector + Sub-Tab Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-slate-400">ACTIVE TARGET RECEPTOR:</span>
            {Object.values(PROTEIN_TARGETS_3D).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedTargetId(t.id);
                  setSelectedPoseMode(1);
                  if (t.id !== 'MRP1') {
                    setSelectedSmiles(t.referenceLigandSmiles);
                  } else {
                    setSelectedSmiles('O=C(O)c1ccc(-c2ccc(S(=O)(=O)Nc3ccc(Cl)c(C(F)(F)F)c3)cc2)cc1');
                  }
                }}
                className={`px-3 py-1.5 text-xs font-mono border transition-colors cursor-pointer ${
                  selectedTargetId === t.id
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {t.symbol} · PDB {t.pdbId} (Ref {t.referenceAffinityKcalMol.toFixed(1)} kcal/mol)
              </button>
            ))}
            {customTargetConfig && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTargetId('CUSTOM');
                  setSelectedSmiles(customTargetConfig.referenceLigandSmiles);
                }}
                className={`px-3 py-1.5 text-xs font-mono border transition-colors cursor-pointer ${
                  selectedTargetId === 'CUSTOM'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {customTargetConfig.symbol}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsNewTargetOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ New Target (.pdb / .pdbqt)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 border border-slate-800">
            {(
              [
                {
                  id: 'closed_loop',
                  label: '01 · Three.js 3D Viewer & Closed-Loop Rounds',
                },
                {
                  id: 'eval_benchmark',
                  label: '02 · Critic Validation (34-Molecule Benchmark)',
                },
                {
                  id: 'rubric_sandbox',
                  label: '03 · Live SMILES Critic & Rubric Sandbox',
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                  subTab === tab.id
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Optional + New Target Setup Drawer (port of target.py + index.html modal) */}
      {isNewTargetOpen && (
        <div className="bg-white border border-slate-300 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Configure New Protein Target &amp; Auto-Compute 3D Docking Grid Box (target.py)
              </h2>
              <p className="text-xs text-slate-600">
                Upload a receptor <code className="font-mono">.pdb</code> or{' '}
                <code className="font-mono">.pdbqt</code> file to compute the 3D bounding box (
                <code className="font-mono">center_x, center_y, center_z</code> + 10 Å padding,
                clamped to 18–30 Å per side).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsNewTargetOpen(false)}
              className="px-2.5 py-1 text-xs font-mono text-slate-600 hover:text-slate-900 border border-slate-300 cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Symbol
              </label>
              <input
                type="text"
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Upload Receptor (.pdb / .pdbqt)
              </label>
              <input
                type="file"
                accept=".pdb,.pdbqt,.ent"
                onChange={handlePdbFileUpload}
                className="w-full text-xs font-mono text-slate-700 file:mr-3 file:px-3 file:py-1.5 file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reference Inhibitor SMILES
              </label>
              <input
                type="text"
                value={newTargetRefSmiles}
                onChange={(e) => setNewTargetRefSmiles(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 bg-slate-50"
              />
            </div>
          </div>

          {uploadedPdbStats && (
            <div className="p-3 bg-slate-50 border border-slate-200 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
              <div>
                Parsed <strong>{uploadedPdbStats.fileName}</strong> ({uploadedPdbStats.atomCount}{' '}
                atoms) · Grid Center:{' '}
                <strong>
                  ({uploadedPdbStats.center[0]}, {uploadedPdbStats.center[1]},{' '}
                  {uploadedPdbStats.center[2]}) Å
                </strong>{' '}
                · Box Size:{' '}
                <strong>
                  {uploadedPdbStats.size[0]} × {uploadedPdbStats.size[1]} ×{' '}
                  {uploadedPdbStats.size[2]} Å
                </strong>
              </div>
              {uploadedPdbStats.blindWarning && (
                <span className="text-amber-800 font-semibold">
                  ▲ Whole-receptor box clamped to 30 Å (provide reference ligand for pocket-specific
                  box)
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleSaveCustomTarget}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            >
              Activate Target &amp; Compute Grid Box
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 1: 3D PYMOL VIEWER & CLOSED-LOOP DESIGNER ↔ CRITICS ROUNDS
         ===================================================================== */}
      {subTab === 'closed_loop' && (
        <div className="space-y-6">
          {/* Interactive Three.js WebGL 3D Docked Pose Viewer */}
          <div className="bg-slate-950 text-slate-100 border border-slate-800 overflow-hidden">
            {/* Top Three.js 3D Control Bar */}
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                    THREE.JS WEBGL 3D PROTEIN–LIGAND POCKET VIEWER (PYMOL-STYLE CPK REPRESENTATION)
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    · Target: <strong className="text-white">{activeTarget.symbol}</strong> (PDB:{' '}
                    {activeTarget.pdbId})
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400 truncate max-w-3xl">
                  Active Ligand SMILES: <span className="text-cyan-300">{selectedSmiles}</span>
                </p>
              </div>

              {/* Pose Mode Dropdown + Style Presets + Screenshot */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                  <span>Vina Pose ({activeTarget.id === 'MRP1' || selectedSmiles === activeTarget.referenceLigandSmiles ? activeTarget.id : 'MRP1-only score'}):</span>
                  <select
                    value={selectedPoseMode}
                    onChange={(e) => setSelectedPoseMode(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 text-cyan-300 text-xs font-mono px-2.5 py-1.5"
                  >
                    {poseModes.map((m) => (
                      <option key={m.mode} value={m.mode}>
                        Mode {m.mode} — {m.affinityKcalMol.toFixed(2)} kcal/mol
                        {m.mode > 1 ? ` (RMSD ${m.rmsdLb} Å vs Mode 1)` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <select
                  value={pymolStylePreset}
                  onChange={(e) =>
                    setPymolStylePreset(
                      e.target.value as 'cartoon_sticks' | 'surface_pocket' | 'all_atom_spheres'
                    )
                  }
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono px-2.5 py-1.5"
                >
                  <option value="cartoon_sticks">Three.js Cartoon Cylinders + Sticks</option>
                  <option value="surface_pocket">Electrostatic VDW Pocket Surface</option>
                  <option value="all_atom_spheres">CPK Ball-and-Stick Spheres</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowPocketSurface((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono border cursor-pointer ${
                    showPocketSurface
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>VDW Surface</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowContactSticks((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono border cursor-pointer ${
                    showContactSticks
                      ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>4.5 Å Contacts</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGridBox((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono border cursor-pointer ${
                    showGridBox
                      ? 'bg-blue-500/20 border-blue-500 text-blue-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Grid Box (24 Å)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAutoRotate3D((v) => !v)}
                  className={`px-2.5 py-1.5 text-xs font-mono border cursor-pointer ${
                    autoRotate3D
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {autoRotate3D ? 'Orbit: ON' : 'Orbit: OFF'}
                </button>

                <button
                  type="button"
                  onClick={handleResetCamera}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                  title="Reset 3D camera orientation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset View</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPng}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Export PNG</span>
                </button>
              </div>
            </div>

            {/* Main 3D Canvas + Right-Hand Pocket Interaction Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-8 relative">
                <div
                  ref={mountRef}
                  className="w-full h-[460px] cursor-grab active:cursor-grabbing"
                />

                {/* Overlay Legend in Bottom-Left of 3D Viewport */}
                <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 border border-slate-800 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-cyan-300">■ Cyan Sticks: Docked Ligand</span>
                    <span className="text-amber-300">
                      ■ Yellow Sticks + Dashed Lines: Pocket Residues ≤ 4.5 Å
                    </span>
                    <span className="text-blue-400">■ Blue/Teal Ribbons: TMD Helices</span>
                  </div>
                  <span className="text-slate-400">
                    Left-drag: Rotate 360° · Scroll: Zoom · Right-drag: Pan
                  </span>
                </div>
              </div>

              {/* Pocket Interaction & Pose Telemetry Sidebar */}
              <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-800 p-4 space-y-4 bg-slate-900/70 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">
                        ACTIVE DOCKED POSE ({activeTarget.id === 'MRP1' || selectedSmiles === activeTarget.referenceLigandSmiles ? activeTarget.symbol : 'MRP1-ONLY SCORE'})
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {activeTarget.id === 'MRP1' || selectedSmiles === activeTarget.referenceLigandSmiles
                          ? `Mode ${activePose.mode} · ${activePose.affinityKcalMol.toFixed(2)} kcal/mol`
                          : 'Not Docked vs HER2 (MRP1 score only)'}
                      </span>
                    </div>
                    {activeTarget.id !== 'MRP1' && selectedSmiles !== activeTarget.referenceLigandSmiles ? (
                      <p className="text-[11px] font-mono text-rose-300 leading-snug">
                        TARGET ATTRIBUTION GUARD: The closed-loop biphenyl sulfonamide docking scores (−12.90 to −10.82 kcal/mol) were computed strictly for MRP1 (ABCC1, PDB 5UJA), NOT for {activeTarget.symbol}. Switch back to MRP1 or click &ldquo;Load {activeTarget.referenceLigandName.split(' ')[0]}&rdquo; below to view the {activeTarget.id} reference pose ({activeTarget.referenceAffinityKcalMol.toFixed(2)} kcal/mol).
                      </p>
                    ) : (
                      <p className="text-[11px] font-mono text-amber-300/90 leading-snug">
                        {activeTarget.id === 'MRP1'
                          ? "MRP1 (ABCC1) target: Affinity difference vs MK-571 (−9.10 kcal/mol) is within Vina's scoring error (~2-3 kcal/mol). The defensible claim is manufacturability at equal affinity: 18 steps and 7 stereocentres down to 3 steps and 0."
                          : `${activeTarget.symbol} reference pocket (${activeTarget.pdbId}): Showing reference kinase inhibitor ${activeTarget.referenceLigandName} (${activeTarget.referenceAffinityKcalMol.toFixed(2)} kcal/mol). Note: Trastuzumab IgG1 is an extracellular biologic mAb targeting HER2 subdomain IV (bioprocess route), distinct from small-molecule kinase docking.`}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                      <div className="bg-slate-900 p-2 border border-slate-800">
                        <div className="text-slate-400">
                          ΔG vs {activeTarget.referenceLigandName.split(' ')[0]} Ref
                        </div>
                        <div
                          className={
                            activeTarget.id === 'MRP1' || selectedSmiles === activeTarget.referenceLigandSmiles
                              ? activePose.affinityKcalMol < activeTarget.referenceAffinityKcalMol
                                ? 'text-emerald-400 font-bold'
                                : 'text-amber-400 font-bold'
                              : 'text-rose-400 font-bold'
                          }
                        >
                          {activeTarget.id === 'MRP1' || selectedSmiles === activeTarget.referenceLigandSmiles
                            ? `${(
                                activePose.affinityKcalMol - activeTarget.referenceAffinityKcalMol
                              ).toFixed(2)} kcal/mol`
                            : 'N/A (MRP1 ligand)'}
                        </div>
                      </div>
                      <div className="bg-slate-900 p-2 border border-slate-800">
                        <div className="text-slate-400">Grid Box</div>
                        <div className="text-slate-200 font-bold">
                          {activeTarget.boxSize[0]}³ Å³
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Key Non-Covalent Pocket Interactions */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono uppercase text-slate-400 font-semibold">
                      Key Pocket Interactions (Mode {activePose.mode})
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                      {activePose.keyInteractions.map((inter, i) => (
                        <li
                          key={i}
                          className="p-2 bg-slate-950 border border-slate-800 leading-relaxed"
                        >
                          {inter}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 4.5 Å Contact Residues Table */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono uppercase text-slate-400 font-semibold">
                      4.5 Å Binding-Pocket Contact Residues (Yellow Sticks)
                    </div>
                    <div className="max-h-44 overflow-y-auto border border-slate-800 divide-y divide-slate-800 text-[11px] font-mono">
                      {activeTarget.contactResidues.map((res) => (
                        <div
                          key={`${res.resName}-${res.resSeq}`}
                          className="p-2 bg-slate-950 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="text-amber-300 font-bold">
                              {res.resName}-{res.resSeq}
                            </span>{' '}
                            <span className="text-slate-400">({res.role})</span>
                          </div>
                          <span className="text-cyan-300 shrink-0">
                            {res.distanceAngstrom.toFixed(2)} Å
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Reference Ligand Switcher */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Compare against Reference Inhibitor:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSmiles(activeTarget.referenceLigandSmiles);
                      setSelectedPoseMode(1);
                    }}
                    className="px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
                  >
                    Load {activeTarget.referenceLigandName.split(' ')[0]} (
                    {activeTarget.referenceAffinityKcalMol.toFixed(2)} kcal/mol)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Closed-Loop Execution Controls & Telemetry Strip */}
          <div className="bg-white border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  MRP1 (ABCC1) Closed-Loop Designer Agent ↔ Synthesisability &amp; Process-Chemistry Critics
                </h2>
                <p className="text-xs text-slate-600">
                  All closed-loop AutoDock Vina affinities below (<span className="font-mono">runs.db</span>) were calculated exclusively for <strong>MRP1 (ABCC1, PDB 5UJA)</strong> against reference inhibitor MK-571 (−9.10 kcal/mol). Click any candidate card to load its 3D conformation into the Three.js WebGL viewer above.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-slate-500">ORCHESTRATOR ARCHITECTURE:</span>
                <button
                  type="button"
                  onClick={() => setRunMode('cache')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border cursor-pointer ${
                    runMode === 'cache'
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Multi-Round Feedback Loop (Round 1 Reject → Round 2 Fix)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRunMode('gate_first')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border cursor-pointer ${
                    runMode === 'gate_first'
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Critics-Before-Docking Gate (run_loop.py — Saves 65% CPU)</span>
                </button>
              </div>
            </div>

            {/* Summary KPI Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">STATUS</div>
                <div className="text-emerald-700 font-bold mt-0.5">
                  {activeDataset.converged ? 'CONVERGED (3/3 PASS)' : 'MAX ROUNDS'}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">ROUNDS USED</div>
                <div className="text-slate-900 font-bold mt-0.5">
                  {activeDataset.total_rounds} / 3 max
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">AGENT TOOL CALLS</div>
                <div className="text-slate-900 font-bold mt-0.5">
                  {activeDataset.tool_calls_used} / 18 cap
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">VINA DOCKS RUN</div>
                <div className="text-slate-900 font-bold mt-0.5">
                  {activeDataset.docks_used} / 4 cap
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">BEST PASSING AFFINITY</div>
                <div className="text-emerald-700 font-bold mt-0.5">
                  −10.82 kcal/mol (vs −9.10 Ref)
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">ESTIMATED API COST BAND</div>
                <div className="text-blue-700 font-bold mt-0.5">£1–10/g (3 LLS steps)</div>
              </div>
            </div>

            {/* Round-by-Round Cards + Feedback Edge Banner */}
            <div className="space-y-6 pt-2">
              {activeDataset.rounds.map((roundLog) => (
                <div
                  key={roundLog.round}
                  className="border border-slate-200 bg-slate-50/60 p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-900 text-white">
                        ROUND {roundLog.round}
                      </span>
                      <span className="text-xs font-mono text-slate-700">
                        Submitted: <strong>{roundLog.submitted_count}</strong> ·{' '}
                        <strong className="text-emerald-700">{roundLog.pass_count} PASS</strong> ·{' '}
                        <strong className="text-amber-700">{roundLog.flag_count} FLAG</strong> ·{' '}
                        <strong className="text-rose-700">{roundLog.fail_count} FAIL</strong>
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      Click any molecule card to inspect its 3D pose above ↑
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 italic bg-white p-3 border border-slate-200">
                    <strong className="not-italic font-semibold text-slate-900">
                      Designer Agent Notes:{' '}
                    </strong>
                    {roundLog.agent_notes}
                  </p>

                  {/* 3-Column Candidate Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {roundLog.candidates.map((cand) => {
                      const isSelected = selectedSmiles === cand.smiles;
                      return (
                        <div
                          key={cand.smiles}
                          onClick={() => {
                            setSelectedTargetId('MRP1');
                            setSelectedSmiles(cand.smiles);
                            setSelectedPoseMode(1);
                          }}
                          className={`bg-white border p-4 space-y-3 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-600 ring-2 ring-blue-500/20'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {/* Top Verdict + Affinity Header */}
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`px-2 py-0.5 text-xs font-mono font-bold uppercase border ${verdictBadgeClass(
                                cand.overall_verdict
                              )}`}
                            >
                              {cand.overall_verdict}
                            </span>
                            <div className="text-right font-mono">
                              <span className="text-sm font-bold text-slate-900">
                                {cand.dock_affinity.toFixed(2)} kcal/mol
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                source: {cand.dock_source} (vs −9.10 ref)
                              </span>
                            </div>
                          </div>

                          <div className="text-xs font-bold text-slate-900">
                            {cand.label || 'Candidate Molecule'}
                          </div>

                          {/* 2D Chemical Structure SVG */}
                          <Molecule2DSvg smiles={cand.smiles} verdict={cand.overall_verdict} />

                          <div className="p-2 bg-slate-900 text-cyan-300 font-mono text-[10px] break-all">
                            {cand.smiles}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">{cand.rationale}</p>

                          {/* Synthesisability & Process-Chemistry Metrics Grid */}
                          <div className="grid grid-cols-4 gap-1.5 pt-1 text-[11px] font-mono">
                            <div className="p-1.5 bg-slate-50 border border-slate-200">
                              <div className="text-slate-400 text-[10px]">SA Score</div>
                              <div
                                className={`font-bold ${
                                  cand.sa_score > 6
                                    ? 'text-rose-700'
                                    : cand.sa_score > 4
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }`}
                              >
                                {cand.sa_score.toFixed(2)}
                              </div>
                            </div>
                            <div className="p-1.5 bg-slate-50 border border-slate-200">
                              <div className="text-slate-400 text-[10px]">Stereo</div>
                              <div
                                className={`font-bold ${
                                  cand.stereocentres > 4
                                    ? 'text-rose-700'
                                    : cand.stereocentres > 2
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }`}
                              >
                                {cand.stereocentres}
                              </div>
                            </div>
                            <div className="p-1.5 bg-slate-50 border border-slate-200">
                              <div className="text-slate-400 text-[10px]">LLS Steps</div>
                              <div
                                className={`font-bold ${
                                  cand.estimated_steps > 14
                                    ? 'text-rose-700'
                                    : cand.estimated_steps > 10
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }`}
                              >
                                ~{cand.estimated_steps}
                              </div>
                            </div>
                            <div className="p-1.5 bg-slate-50 border border-slate-200">
                              <div className="text-slate-400 text-[10px]">Cost/g</div>
                              <div className="font-bold text-slate-900">{cand.cost_band}</div>
                            </div>
                          </div>

                          {/* Critic Rejections & Actionable Suggestions */}
                          {cand.rejections.length > 0 ? (
                            <div className="space-y-1.5 pt-2 border-t border-slate-200">
                              <div className="text-[11px] font-mono font-bold text-rose-800">
                                CRITIC REJECTIONS ({cand.rejections.length}):
                              </div>
                              {cand.rejections.map((rej, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 bg-rose-50 border border-rose-200 text-[11px] space-y-0.5"
                                >
                                  <div className="font-mono font-semibold text-rose-900">
                                    [{rej.level.toUpperCase()}] {rej.criterion}: {String(rej.value)}{' '}
                                    (limit {String(rej.threshold)})
                                  </div>
                                  <div className="text-slate-700">{rej.reason}</div>
                                  <div className="text-emerald-800 font-medium">
                                    → Fix: {rej.suggest}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-2 bg-emerald-50 border border-emerald-200 text-[11px] font-mono text-emerald-900 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>
                                Passed all Synthesisability &amp; Process-Chemistry Critics
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* The Feedback Edge Banner sent from Critics back to the Designer Agent */}
                  {roundLog.feedback_sent && (
                    <div className="p-4 bg-amber-50 border border-amber-300 space-y-1">
                      <div className="text-xs font-mono font-bold text-amber-950 uppercase">
                        ⚡ THE FEEDBACK EDGE (Structured Critic Rejection Injected into Round{' '}
                        {roundLog.round + 1} Designer Prompt)
                      </div>
                      <p className="text-xs font-mono text-amber-900 leading-relaxed">
                        {roundLog.feedback_sent}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Expandable Agent Tool-Call Trace */}
            <details className="border border-slate-200 bg-slate-50 p-4">
              <summary className="text-xs font-mono font-bold text-slate-800 cursor-pointer flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-600" />
                <span>
                  Inspect Complete Agent Tool-Call Trace ({activeDataset.tool_trace.length} calls ·
                  seed_scaffolds → properties → dock → submit)
                </span>
              </summary>
              <div className="mt-3 space-y-1.5 font-mono text-xs">
                {activeDataset.tool_trace.map((ev, i) => (
                  <div
                    key={i}
                    className="p-2 bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[10px] mr-2">
                        R{ev.round}
                      </span>
                      <strong className="text-blue-700">{ev.tool}</strong>
                      <span className="text-slate-500 ml-2">
                        ({JSON.stringify(ev.args)})
                      </span>
                    </div>
                    <span className="text-slate-800">{ev.result_summary}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: 34-MOLECULE GROUND-TRUTH CRITIC VALIDATION BENCHMARK
         ===================================================================== */}
      {subTab === 'eval_benchmark' && (
        <div className="bg-white border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Ground-Truth Critic Validation Benchmark (eval_set.py · 34 Molecules Across Two
                Difficulty Tiers)
              </h2>
              <p className="text-xs text-slate-600 max-w-3xl">
                Unlike an LLM grading its own homework, the Synthesisability and Process-Chemistry
                Critics are deterministic RDKit/structural rule engines validated against ground-truth
                synthesisability labels: <strong>Tier 1 (Easy Sanity Check: 23/23 = 100%)</strong>{' '}
                and <strong>Tier 2 (Hard Boundary Set: 7/11 = 63.6%)</strong> with all 4 boundary
                misses named transparently.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-slate-500">POLICY DIAL:</span>
              <button
                type="button"
                onClick={() => setCriticPolicy('lenient')}
                className={`px-3 py-1.5 text-xs font-mono border cursor-pointer ${
                  criticPolicy === 'lenient'
                    ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Lenient (FLAG = Pass with Warning · 63.6%)
              </button>
              <button
                type="button"
                onClick={() => setCriticPolicy('strict')}
                className={`px-3 py-1.5 text-xs font-mono border cursor-pointer ${
                  criticPolicy === 'strict'
                    ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Strict (FLAG = Reject · 0 False Passes on Flagged)
              </button>
            </div>
          </div>

          {/* Tier 1 vs Tier 2 Confusion Matrix Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tier 1 Summary Card */}
            <div className="border border-slate-200 p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-emerald-800">
                  TIER 1 — EASY SANITY CHECK (23 MOLECULES)
                </span>
                <span className="text-sm font-mono font-bold text-emerald-700">
                  23 / 23 (100.0% Accuracy)
                </span>
              </div>
              <p className="text-xs text-slate-600">
                13 classic oral small-molecule drugs (aspirin, ibuprofen, imatinib, erlotinib,
                celecoxib, sorafenib) vs 10 fermentation natural products &amp; reactive warheads
                (paclitaxel, erythromycin, vancomycin, benzoyl chloride).
              </p>
              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs pt-1">
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Expected PASS → Got PASS</div>
                  <div className="text-emerald-700 font-bold text-sm">13 / 13</div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Expected FAIL → Got FAIL</div>
                  <div className="text-emerald-700 font-bold text-sm">10 / 10</div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">False Passes / Rejects</div>
                  <div className="text-slate-900 font-bold text-sm">0</div>
                </div>
              </div>
            </div>

            {/* Tier 2 Summary Card */}
            <div className="border border-slate-200 p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-blue-800">
                  TIER 2 — HARD BOUNDARY SET (11 MOLECULES · {criticPolicy.toUpperCase()})
                </span>
                <span className="text-sm font-mono font-bold text-blue-700">
                  {criticPolicy === 'lenient'
                    ? '7 / 11 (63.6% Accuracy)'
                    : '6 / 11 (54.5% · Tightened Reject Gate)'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                6 complex marketed drugs with intentional warheads, high F-density, or chiral cores
                (apixaban, lenalidomide, osimertinib, sitagliptin, nirmatrelvir, sofosbuvir) vs 5
                plausible-looking generative outputs.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs pt-1">
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Expected PASS (2P / 3Fl / 1F)</div>
                  <div className="text-blue-700 font-bold text-sm">
                    {criticPolicy === 'lenient' ? '5 / 6 Pass' : '2 / 6 Pass'}
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Expected FAIL (1P / 2Fl / 2F)</div>
                  <div className="text-amber-700 font-bold text-sm">
                    {criticPolicy === 'lenient' ? '2 / 5 Caught' : '4 / 5 Caught'}
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Named Boundary Misses</div>
                  <div className="text-rose-700 font-bold text-sm">4 Analyzed Below</div>
                </div>
              </div>
            </div>
          </div>

          {/* Complete Tier 2 Per-Molecule Table with Honest Miss Explanations */}
          <div className="space-y-2">
            <h3 className="text-xs font-mono font-bold uppercase text-slate-700">
              Tier 2 Hard Boundary Per-Molecule Breakdown (Including All 4 Named Misses)
            </h3>
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[11px] text-slate-700">
                    <th className="p-2.5">Molecule</th>
                    <th className="p-2.5">Ground Truth</th>
                    <th className="p-2.5">3-Way Verdict</th>
                    <th className="p-2.5">Policy Outcome ({criticPolicy})</th>
                    <th className="p-2.5">SA / Stereo / Steps</th>
                    <th className="p-2.5">Engineering &amp; Process-Chemistry Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {CRITIC_EVAL_BENCHMARK.tier2_lenient.per_molecule.map((m) => {
                    const binaryPred =
                      criticPolicy === 'lenient'
                        ? m.predicted === 'fail'
                          ? 'fail'
                          : 'pass'
                        : m.predicted === 'pass'
                          ? 'pass'
                          : 'fail';
                    const isCorrect = binaryPred === m.expected;
                    return (
                      <tr
                        key={m.name}
                        className={isCorrect ? 'bg-white' : 'bg-rose-50/50'}
                      >
                        <td className="p-2.5 font-mono font-semibold text-slate-900">
                          {m.name}
                        </td>
                        <td className="p-2.5 font-mono uppercase">{m.expected}</td>
                        <td className="p-2.5 font-mono">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold uppercase border ${verdictBadgeClass(
                              m.predicted
                            )}`}
                          >
                            {m.predicted}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono">
                          {isCorrect ? (
                            <span className="text-emerald-700 font-bold">✓ Correct</span>
                          ) : (
                            <span className="text-rose-700 font-bold">✗ Boundary Miss</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono tabular-nums">
                          SA {m.sa_score} · {m.stereo}★ · {m.steps} steps ({m.cost})
                        </td>
                        <td className="p-2.5 text-slate-700">{m.why}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: LIVE SMILES CRITIC & RUBRIC SANDBOX
         ===================================================================== */}
      {subTab === 'rubric_sandbox' && (
        <div className="bg-white border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4 space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              Live SMILES Synthesisability &amp; Process-Chemistry Critic Sandbox (critics.py)
            </h2>
              <p className="text-xs text-slate-600">
              Paste or edit any SMILES string below (or pick a preset) to run the deterministic
              Synthesisability Critic and Process-Chemistry Critic in real time and send it to the
              Three.js WebGL 3D Pocket Viewer.
            </p>
          </div>

          {/* Preset SMILES Buttons + Input Box */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-slate-500">QUICK TEST PRESETS:</span>
              {[
                {
                  label: 'MRP1 R2-Lead-1 (−10.82 kcal/mol vs MRP1 · PASS)',
                  smiles: 'O=C(O)c1ccc(-c2ccc(S(=O)(=O)Nc3ccc(Cl)c(C(F)(F)F)c3)cc2)cc1',
                },
                {
                  label: 'MRP1 R1-Monster (−12.90 kcal/mol vs MRP1 · 7★ Stereo FAIL)',
                  smiles:
                    'COc1ccc(-c2nc3c(O)c4c(O)ccc(O)c4c(C(=O)N[C@@H](Cc4ccc(O)cc4)C(=O)N[C@@H](CCCNC(=N)N)C(=O)O)c3s2)cc1[C@H]1O[C@H](CO)[C@@H](O)[C@H](O)[C@H]1O',
                },
                {
                  label: 'Unquenched Sulfonyl Chloride Warhead (FAIL)',
                  smiles: 'O=C(O)c1ccc(-c2ccc(S(=O)(=O)Cl)cc2)cc1',
                },
                {
                  label: 'Osimertinib Covalent Acrylamide (FLAG)',
                  smiles: 'COc1cc(N(C)CCN(C)C)c(NC(=O)C=C)cc1Nc1nccc(-c2cn(C)c3ccccc23)n1',
                },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSandboxSmiles(p.smiles)}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={sandboxSmiles}
                onChange={(e) => setSandboxSmiles(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-mono border border-slate-300 bg-slate-50"
                placeholder="Enter SMILES string..."
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedTargetId('MRP1');
                  setSelectedSmiles(sandboxSmiles);
                  setSelectedPoseMode(1);
                  setSubTab('closed_loop');
                }}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shrink-0"
              >
                Dock &amp; View in Three.js 3D Viewer →
              </button>
            </div>
          </div>

          {/* Live Critic Assessment Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-slate-200 p-4 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-slate-700">
                  COMBINED CRITIC VERDICT
                </span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-mono font-bold uppercase border ${verdictBadgeClass(
                    sandboxAssessment.overall_verdict
                  )}`}
                >
                  {sandboxAssessment.summary}
                </span>
              </div>

              <Molecule2DSvg
                smiles={sandboxAssessment.smiles}
                verdict={sandboxAssessment.overall_verdict}
              />

              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">SA Score</div>
                  <div className="font-bold text-slate-900">
                    {sandboxAssessment.synthesisability.sa_score} (flag &gt;4, fail &gt;6)
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Stereocentres</div>
                  <div className="font-bold text-slate-900">
                    {sandboxAssessment.synthesisability.stereocentres} (flag &gt;2, fail &gt;4)
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Est. Steps &amp; Cost</div>
                  <div className="font-bold text-slate-900">
                    ~{sandboxAssessment.process_chemistry.estimated_steps} steps (
                    {sandboxAssessment.process_chemistry.cost_per_g_band})
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">MW / Heavy Atoms</div>
                  <div className="font-bold text-slate-900">
                    {sandboxAssessment.process_chemistry.mw} Da /{' '}
                    {sandboxAssessment.process_chemistry.heavy_atoms} HA
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">LogP / TPSA</div>
                  <div className="font-bold text-slate-900">
                    {sandboxAssessment.process_chemistry.logp} /{' '}
                    {sandboxAssessment.process_chemistry.tpsa} Å²
                  </div>
                </div>
                <div className="p-2 bg-white border border-slate-200">
                  <div className="text-slate-500 text-[10px]">Halogen Density</div>
                  <div className="font-bold text-slate-900">
                    {sandboxAssessment.process_chemistry.halogen_density}
                  </div>
                </div>
              </div>

              {sandboxAssessment.all_rejections.length > 0 ? (
                <div className="space-y-1.5">
                  {sandboxAssessment.all_rejections.map((r, i) => (
                    <div
                      key={i}
                      className="p-2.5 bg-rose-50 border border-rose-200 text-xs space-y-1"
                    >
                      <div className="font-mono font-bold text-rose-900 flex items-center gap-1.5">
                        {r.level === 'fail' ? (
                          <XCircle className="w-3.5 h-3.5 text-rose-700" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        )}
                        <span>
                          [{r.level.toUpperCase()}] {r.criterion} = {String(r.value)} (threshold{' '}
                          {String(r.threshold)})
                        </span>
                      </div>
                      <div className="text-slate-700">{r.reason}</div>
                      <div className="text-emerald-800 font-medium">→ Actionable Fix: {r.suggest}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-900">
                  ✓ Zero synthesisability or process-chemistry rejections. Ready for scale-up
                  synthesis.
                </div>
              )}
            </div>

            {/* Explicit Rubric Threshold Reference Table */}
            <div className="border border-slate-200 p-4 space-y-3">
              <div className="text-xs font-mono font-bold uppercase text-slate-700">
                Explicit Critic Rubric Thresholds (critics.py · Literature-Grounded)
              </div>
              <div className="overflow-x-auto border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[11px]">
                      <th className="p-2">Criterion</th>
                      <th className="p-2">FLAG (&gt;)</th>
                      <th className="p-2">FAIL (&gt;)</th>
                      <th className="p-2">Literature / Process Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    {Object.entries(CRITIC_RUBRIC).map(([key, val]) => (
                      <tr key={key}>
                        <td className="p-2 font-bold text-slate-900">{key}</td>
                        <td className="p-2 text-amber-700 font-bold">{val.flag}</td>
                        <td className="p-2 text-rose-700 font-bold">{val.fail}</td>
                        <td className="p-2 font-sans text-slate-600">{val.cite}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
