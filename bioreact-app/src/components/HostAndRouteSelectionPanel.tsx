import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  BiologicCandidate,
  CandidatePathwayMode,
  HostRouteEvaluationEntry,
  ManufacturingRouteParadigm,
  NovelProteinDissertationProfile,
  OrganismSystemId,
  ProductRouteArchetypeId,
} from '../types/bioreact';
import {
  evaluateHostAndManufacturingRoutes,
  ORGANISM_PROCESS_MODELS,
  PRODUCT_ROUTE_ARCHETYPES,
} from '../data/multiOrganismData';

interface HostAndRouteSelectionPanelProps {
  candidate: BiologicCandidate;
  candidatePathwayMode: CandidatePathwayMode;
  onChangePathwayMode: (mode: CandidatePathwayMode) => void;
  selectedOrganismId: OrganismSystemId;
  onSelectOrganismId: (id: OrganismSystemId) => void;
  novelProfile: NovelProteinDissertationProfile;
  onUpdateNovelProfile: (next: NovelProteinDissertationProfile) => void;
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

const PARADIGM_META: Array<{
  paradigm: ManufacturingRouteParadigm;
  badgeColor: string;
  hostsSummary: string;
  coreEngineeringPrinciple: string;
  whenRequired: string;
}> = [
  {
    paradigm: 'Mammalian-Cell Cultivation',
    badgeColor: 'bg-blue-50 text-blue-900 border-blue-300',
    hostsSummary:
      'CHO (CHO-K1/DG44), HEK293 (293F/293T), Skeletal Muscle Myoblasts',
    coreEngineeringPrinciple:
      'Wall-less shear-sensitive cells (τ ≤ 0.35–1.65 Pa, λ_K ≥ 18–150 μm), slow doubling (19–30 h), moderate OUR (2–18 mmol O₂/L/h), complex ER/Golgi folding & human-like N-glycosylation.',
    whenRequired:
      'Full-length IgG monoclonal antibodies (Asn-297 Fc glycan), rAAV viral vectors, complex human sialo-proteins, or cultivated muscle tissue.',
  },
  {
    paradigm: 'Microbial Fermentation',
    badgeColor: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    hostsSummary:
      'Escherichia coli, Komagataella phaffii (Pichia), Saccharomyces cerevisiae',
    coreEngineeringPrinciple:
      'Rigid cell walls (τ ≤ 8.5–12 Pa), rapid doubling (20–120 min), high biomass (35–90 g DCW/L), extreme oxygen demand (OUR = 150–480 mmol O₂/L/h, kLa ≥ 180–350 h⁻¹) & exothermic jacket heat load.',
    whenRequired:
      'Aglycosylated scFv/Fab antibody fragments, cytokines, proinsulin / GLP-1 peptide precursors, nanobodies, and VLP vaccines.',
  },
  {
    paradigm: 'Phototrophic Cultivation',
    badgeColor: 'bg-teal-50 text-teal-900 border-teal-300',
    hostsSummary:
      'Microalgae (Haematococcus pluvialis, Chlorella vulgaris, C. reinhardtii)',
    coreEngineeringPrinciple:
      'Photoautotrophic light delivery governed by Beer-Lambert attenuation (requires thin optical path L_opt ≤ 3–8 cm), inorganic CO₂ fixation (CTR ≥ CUR), and stripping of evolved photosynthetic O₂ (< 250% air sat.).',
    whenRequired:
      'Photosynthetic ketocarotenoids (astaxanthin), algal omega-3 PUFAs, or plastid-expressed oral subunit antigens.',
  },
  {
    paradigm: 'Non-Biological Chemical Synthesis',
    badgeColor: 'bg-amber-50 text-amber-900 border-amber-300',
    hostsSummary:
      'Organic Batch / Flow Synthesis (Pd-Catalysed Coupling) & Solid-Phase Peptide Synthesis (SPPS)',
    coreEngineeringPrinciple:
      'No living cells, no ribosomal translation, and no aqueous oxygen transfer. Governed by reaction stoichiometry, Pd catalyst loading, organic solvent recovery, and anti-solvent crystallisation.',
    whenRequired:
      'Small-molecule drug leads (< 1,000 Da, e.g., Round 3 MRP1-Docked 412 Da Biphenyl Sulfonamide) or short synthetic peptides.',
  },
];

export const HostAndRouteSelectionPanel: React.FC<
  HostAndRouteSelectionPanelProps
> = ({
  candidate,
  candidatePathwayMode,
  onChangePathwayMode,
  selectedOrganismId,
  onSelectOrganismId,
  novelProfile,
  onUpdateNovelProfile,
  onNavigateToSection,
}) => {
  const [selectedArchetypeId, setSelectedArchetypeId] =
    useState<ProductRouteArchetypeId>('pharma_igg_mab');
  const [paradigmFilter, setParadigmFilter] = useState<
    ManufacturingRouteParadigm | 'ALL'
  >('ALL');
  const [focusedHostId, setFocusedHostId] = useState<
    OrganismSystemId | 'chemical_synthesis'
  >('cho_mammalian');

  // Synchronize archetype if user switches top-level pathway mode
  const effectiveArchetypeId: ProductRouteArchetypeId = useMemo(() => {
    if (
      candidatePathwayMode === 'small_molecule_chemical' &&
      selectedArchetypeId === 'pharma_igg_mab'
    ) {
      return 'small_molecule_sulfonamide';
    }
    return selectedArchetypeId;
  }, [candidatePathwayMode, selectedArchetypeId]);

  const activeArchetype = PRODUCT_ROUTE_ARCHETYPES[effectiveArchetypeId];

  const hostEvaluations = useMemo(
    () => evaluateHostAndManufacturingRoutes(effectiveArchetypeId),
    [effectiveArchetypeId]
  );

  const filteredEvaluations = useMemo(
    () =>
      paradigmFilter === 'ALL'
        ? hostEvaluations
        : hostEvaluations.filter((h) => h.paradigm === paradigmFilter),
    [hostEvaluations, paradigmFilter]
  );

  const focusedEntry: HostRouteEvaluationEntry =
    hostEvaluations.find((h) => h.hostId === focusedHostId) ??
    hostEvaluations[0];

  const handleSelectProductArchetype = (archId: ProductRouteArchetypeId) => {
    setSelectedArchetypeId(archId);
    if (archId === 'pharma_igg_mab') {
      onChangePathwayMode('established_biologic');
      onSelectOrganismId('cho_mammalian');
      setFocusedHostId('cho_mammalian');
    } else if (archId === 'disulfide_scfv_or_fab') {
      onChangePathwayMode('novel_dissertation_protein');
      onSelectOrganismId('pichia_yeast');
      setFocusedHostId('pichia_yeast');
      onUpdateNovelProfile({
        ...novelProfile,
        proteinName: 'Anti-HER2 Disulfide scFv Fragment (27.5 kDa)',
        molecularWeightKda: 27.5,
        ptmAndGlycosylationRequirement:
          'Simple Disulfide Bonds / Non-Glycosylated',
        proposedExpressionHost: 'Pichia pastoris Yeast',
      });
    } else if (archId === 'peptide_hormone_or_vlp') {
      onChangePathwayMode('novel_dissertation_protein');
      onSelectOrganismId('saccharomyces_yeast');
      setFocusedHostId('saccharomyces_yeast');
      onUpdateNovelProfile({
        ...novelProfile,
        proteinName: 'Recombinant Proinsulin / GLP-1 Precursor (8.2 kDa)',
        molecularWeightKda: 8.2,
        ptmAndGlycosylationRequirement:
          'Simple Disulfide Bonds / Non-Glycosylated',
        proposedExpressionHost: 'Saccharomyces cerevisiae Yeast',
      });
    } else if (archId === 'viral_vector_or_human_sialo') {
      onChangePathwayMode('novel_dissertation_protein');
      onSelectOrganismId('hek293_mammalian');
      setFocusedHostId('hek293_mammalian');
      onUpdateNovelProfile({
        ...novelProfile,
        proteinName: 'rAAV9 Gene Therapy Capsid / Human α2,6-Sialo-Protein',
        molecularWeightKda: 115.0,
        ptmAndGlycosylationRequirement:
          'Complex Human-like N-Glycosylation Required',
        proposedExpressionHost: 'HEK293 Mammalian',
      });
    } else if (archId === 'small_molecule_sulfonamide') {
      onChangePathwayMode('small_molecule_chemical');
      setFocusedHostId('chemical_synthesis');
    } else if (archId === 'cultivated_muscle_biomass') {
      onChangePathwayMode('established_biologic');
      onSelectOrganismId('skeletal_muscle_cultivated_meat');
      setFocusedHostId('skeletal_muscle_cultivated_meat');
    } else if (archId === 'algal_carotenoid_or_antigen') {
      onChangePathwayMode('established_biologic');
      onSelectOrganismId('microalgae_phototrophic');
      setFocusedHostId('microalgae_phototrophic');
    }
  };

  const verdictBadgeStyle = (
    verdict: HostRouteEvaluationEntry['suitabilityVerdict']
  ) => {
    switch (verdict) {
      case 'Primary Recommended Route':
        return 'bg-emerald-700 text-white border-emerald-800';
      case 'Viable Alternative with Trade-Offs':
        return 'bg-amber-100 text-amber-950 border-amber-400';
      case 'Requires Non-Biological Chemical Synthesis':
        return 'bg-purple-100 text-purple-950 border-purple-400';
      case 'Biologically Incompatible for Intended Product':
        return 'bg-rose-100 text-rose-950 border-rose-300';
    }
  };

  const modelStatusBadgeStyle = (
    status: HostRouteEvaluationEntry['modelStatusLabel']
  ) => {
    switch (status) {
      case 'Supported Computational Demo (CHO Perfusion)':
        return 'bg-emerald-50 text-emerald-900 border-emerald-400';
      case 'Research-Stage Model — Quantitative BO Locked':
        return 'bg-amber-50 text-amber-900 border-amber-400';
      case 'Unsupported in Bioprocess Simulator (Chemical Route)':
        return 'bg-slate-200 text-slate-800 border-slate-400';
    }
  };

  return (
    <section
      id="host-and-route-selection-stage"
      className="bg-white border-2 border-slate-300 p-6 space-y-6"
    >
      {/* 1. Stage Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase bg-slate-900 text-cyan-300">
              PRE-REACTOR ASSESSMENT · HOST &amp; MANUFACTURING ROUTE SELECTION
              STAGE
            </span>
            <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-emerald-50 text-emerald-900 border border-emerald-300">
              7 BIOLOGICAL SYSTEMS + NON-BIOLOGICAL CHEMICAL SYNTHESIS
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Expression Host &amp; Manufacturing Route Reasoning Engine (Before
            Reactor Selection)
          </h2>
          <p className="text-xs text-slate-600 max-w-4xl leading-relaxed">
            Before screening reactor geometries or running Bayesian optimisation,{' '}
            <strong>bioREACT</strong> evaluates whether the intended product
            requires <strong>Mammalian-Cell Cultivation</strong> (CHO, HEK293,
            Skeletal Muscle), <strong>Microbial Fermentation</strong> (
            <em>E. coli</em>, <em>Komagataella phaffii</em> / Pichia,{' '}
            <em>Saccharomyces cerevisiae</em>),{' '}
            <strong>Phototrophic Cultivation</strong> (Microalgae), or{' '}
            <strong>Non-Biological Chemical Synthesis</strong>. It never
            defaults to CHO and never reuses CHO kinetic parameters for
            microbial or phototrophic hosts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSelectProductArchetype('pharma_igg_mab')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold bg-blue-700 text-white hover:bg-blue-800 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              Primary Pharma Demo: {candidate.genericName} IgG1 (CHO Perfusion)
            </span>
          </button>
        </div>
      </div>

      {/* 2. Four Manufacturing Paradigms Distinction Strip */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-mono font-bold uppercase text-slate-800 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-700" />
            <span>
              1. Distinguish the Four Fundamental Manufacturing Paradigms
              (Click to Filter):
            </span>
          </div>
          {paradigmFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setParadigmFilter('ALL')}
              className="text-xs font-mono text-blue-700 hover:underline cursor-pointer"
            >
              Show All 8 Routes →
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {PARADIGM_META.map((item) => {
            const isActiveFilter = paradigmFilter === item.paradigm;
            return (
              <button
                key={item.paradigm}
                type="button"
                onClick={() =>
                  setParadigmFilter(
                    isActiveFilter ? 'ALL' : item.paradigm
                  )
                }
                className={`text-left p-3.5 border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                  isActiveFilter
                    ? 'border-2 border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-900'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold border ${
                        isActiveFilter
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                          : item.badgeColor
                      }`}
                    >
                      {item.paradigm.toUpperCase()}
                    </span>
                  </div>
                  <div
                    className={`font-mono text-[11px] font-semibold ${
                      isActiveFilter ? 'text-slate-200' : 'text-slate-800'
                    }`}
                  >
                    {item.hostsSummary}
                  </div>
                  <p
                    className={`text-[11px] leading-snug ${
                      isActiveFilter ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {item.coreEngineeringPrinciple}
                  </p>
                </div>
                <div
                  className={`pt-2 border-t text-[10px] font-mono ${
                    isActiveFilter
                      ? 'border-slate-700 text-cyan-300'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <strong>Target Modalities:</strong> {item.whenRequired}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Intended Product / Modality Selector (Proves bioREACT Does Not Default to CHO) */}
      <div className="p-4 bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-mono font-bold uppercase text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
              <span>
                2. Select Intended Product Profile to Evaluate Host Suitability
                (Never Defaults to CHO):
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Switch between the calibrated pharmaceutical IgG1 demonstration and
              6 other product classes to see how folding, disulfide, and
              glycosylation constraints determine the recommended host.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 bg-white border border-slate-300 text-slate-800 shrink-0">
            Active Product: <strong>{activeArchetype.shortTitle}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {(
            Object.values(PRODUCT_ROUTE_ARCHETYPES) as Array<
              (typeof PRODUCT_ROUTE_ARCHETYPES)[ProductRouteArchetypeId]
            >
          ).map((arch) => {
            const isSelected = effectiveArchetypeId === arch.id;
            return (
              <button
                key={arch.id}
                type="button"
                onClick={() => handleSelectProductArchetype(arch.id)}
                className={`p-2.5 text-left border text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-2 border-blue-700 bg-blue-50/70 font-semibold text-slate-900'
                    : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-bold text-blue-900 truncate">
                    {arch.shortTitle}
                  </span>
                  {arch.isPrimaryPharmaDemo && (
                    <span className="px-1.5 py-0.5 text-[9px] font-mono bg-emerald-700 text-white shrink-0">
                      DEMO
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-600 mt-1 truncate">
                  {arch.modalityBadge}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Product Reasoning Summary Box */}
        <div className="p-3.5 bg-white border border-slate-300 grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
          <div className="lg:col-span-4 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
              INTENDED PRODUCT &amp; MOLECULAR IDENTITY
            </div>
            <div className="font-bold text-slate-900">
              {activeArchetype.productTitle}
            </div>
            <div className="font-mono text-[11px] text-slate-600">
              Mass / Structure: {activeArchetype.molecularWeightDisplay}
            </div>
          </div>
          <div className="lg:col-span-4 space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
              FOLDING &amp; POST-TRANSLATIONAL MODIFICATION (PTM) NEEDS
            </div>
            <p className="text-slate-700 leading-snug">
              {activeArchetype.foldingAndPtmSummary}
            </p>
          </div>
          <div className="lg:col-span-4 space-y-1">
            <div className="text-[10px] font-mono uppercase text-indigo-700 font-semibold">
              AGENT HOST &amp; ROUTE RECOMMENDATION
            </div>
            <div className="font-bold text-emerald-900">
              {activeArchetype.recommendedPrimaryRouteSummary}
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              {activeArchetype.whyNotDefaultToChoNote}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Full 8-System Evaluation Matrix (CHO, HEK293, E. coli, K. phaffii, S. cerevisiae, Muscle Cells, Microalgae, Chemical Synthesis) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              3. Comparative Host &amp; Manufacturing Route Matrix (Click Any
              System for Full 5-Point Engineering Dossier)
            </h3>
            <p className="text-xs text-slate-600">
              Evaluates CHO, HEK293, <em>E. coli</em>,{' '}
              <em>Komagataella phaffii</em> (Pichia),{' '}
              <em>Saccharomyces cerevisiae</em>, Skeletal Muscle Cells,
              Microalgae, and Non-Biological Chemical Synthesis.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Showing {filteredEvaluations.length} of 8 Systems
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredEvaluations.map((entry) => {
            const isFocused = focusedEntry.hostId === entry.hostId;
            const isActiveOrganism =
              entry.hostId !== 'chemical_synthesis' &&
              selectedOrganismId === entry.hostId &&
              candidatePathwayMode !== 'small_molecule_chemical';
            const isPrimaryRec =
              entry.suitabilityVerdict === 'Primary Recommended Route';

            return (
              <div
                key={entry.hostId}
                onClick={() => setFocusedHostId(entry.hostId)}
                className={`p-3.5 border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isFocused
                    ? 'border-2 border-blue-700 bg-blue-50/30 shadow-xs'
                    : isPrimaryRec
                    ? 'border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 truncate">
                      {entry.paradigm}
                    </span>
                    {isActiveOrganism && (
                      <span className="text-[10px] font-mono font-bold text-blue-700 shrink-0">
                        [ACTIVE HOST]
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {entry.hostName}
                    </div>
                    <div className="text-[10px] font-mono italic text-slate-500">
                      {entry.scientificName}
                    </div>
                  </div>

                  <div
                    className={`px-2 py-1 text-[10px] font-mono font-bold border ${verdictBadgeStyle(
                      entry.suitabilityVerdict
                    )}`}
                  >
                    {entry.suitabilityVerdict.toUpperCase()}
                  </div>

                  <div
                    className={`px-2 py-1 text-[10px] font-mono border ${modelStatusBadgeStyle(
                      entry.modelStatusLabel
                    )}`}
                  >
                    {entry.modelStatusLabel}
                  </div>

                  <p className="text-[11px] text-slate-700 leading-snug line-clamp-4">
                    {entry.whyCouldOrCouldNotProduce}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="text-[10px] font-mono text-slate-600 truncate">
                    <strong>Reactors:</strong>{' '}
                    {entry.compatibleReactorConfigurations[0]}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-blue-700 font-semibold">
                      {isFocused ? '▼ Viewing Dossier Below' : 'Inspect Dossier →'}
                    </span>
                    {entry.hostId !== 'chemical_synthesis' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectOrganismId(entry.hostId as OrganismSystemId);
                          setFocusedHostId(entry.hostId);
                          if (
                            candidatePathwayMode === 'small_molecule_chemical'
                          ) {
                            onChangePathwayMode('established_biologic');
                          }
                        }}
                        className="px-2 py-1 text-[10px] font-mono font-semibold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
                      >
                        Load Host Model
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangePathwayMode('small_molecule_chemical');
                          setFocusedHostId('chemical_synthesis');
                        }}
                        className="px-2 py-1 text-[10px] font-mono font-semibold bg-amber-700 text-white hover:bg-amber-800 cursor-pointer"
                      >
                        Route to Synthesis
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Detailed 5-Point Scientific Dossier for the Focused Candidate Host */}
      <div className="border-2 border-slate-800 bg-slate-50 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-300">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="font-bold uppercase text-slate-900">
                DETAILED HOST &amp; ROUTE SCIENTIFIC DOSSIER:
              </span>
              <span className="px-2 py-0.5 bg-slate-900 text-white font-bold">
                {focusedEntry.hostName}
              </span>
              <span
                className={`px-2 py-0.5 border font-bold ${verdictBadgeStyle(
                  focusedEntry.suitabilityVerdict
                )}`}
              >
                {focusedEntry.suitabilityVerdict}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Target Product Context:{' '}
              <strong className="text-slate-900">
                {activeArchetype.productTitle}
              </strong>{' '}
              · Paradigm: <strong>{focusedEntry.paradigm}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {focusedEntry.hostId !== 'chemical_synthesis' ? (
              <button
                type="button"
                onClick={() => {
                  onSelectOrganismId(focusedEntry.hostId as OrganismSystemId);
                  if (candidatePathwayMode === 'small_molecule_chemical') {
                    onChangePathwayMode('established_biologic');
                  }
                  onNavigateToSection('screening');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-semibold bg-blue-700 text-white hover:bg-blue-800 cursor-pointer"
              >
                <span>
                  Screen Compatible Reactors for {focusedEntry.hostName.split(' ')[0]}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onChangePathwayMode('small_molecule_chemical');
                  onNavigateToSection('dissertation_3d');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-semibold bg-amber-700 text-white hover:bg-amber-800 cursor-pointer"
              >
                <span>Open 3D Docking &amp; 3-Step Chemical Synthesis Critics</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
          {/* Point 1 & Point 2 */}
          <div className="lg:col-span-6 space-y-3">
            <div className="p-3.5 bg-white border border-slate-200 space-y-1.5">
              <div className="font-mono font-bold text-slate-900 uppercase text-[11px] flex items-center gap-1.5">
                {focusedEntry.suitabilityVerdict ===
                'Primary Recommended Route' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : focusedEntry.suitabilityVerdict ===
                  'Viable Alternative with Trade-Offs' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
                )}
                <span>
                  1. Why {focusedEntry.hostName.split('(')[0].trim()} Could or
                  Could Not Produce the Intended Product
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {focusedEntry.whyCouldOrCouldNotProduce}
              </p>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 space-y-1.5">
              <div className="font-mono font-bold text-slate-900 uppercase text-[11px] flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-blue-700 shrink-0" />
                <span>
                  2. Protein Folding &amp; Post-Translational Modification (PTM)
                  Capabilities
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                {focusedEntry.proteinFoldingAndPtmRequirements}
              </p>
            </div>

            <div className="p-3.5 bg-slate-900 text-slate-100 space-y-1">
              <div className="font-mono font-bold text-cyan-400 uppercase text-[10px]">
                KINETIC PARAMETER ISOLATION &amp; MODEL COVERAGE GUARDRAIL
              </div>
              <p className="text-[11px] text-slate-200 leading-snug">
                {focusedEntry.choParameterIsolationNote}
              </p>
              <div className="text-[10px] font-mono text-amber-300 pt-1">
                Status: {focusedEntry.modelStatusLabel}
                {focusedEntry.hostId !== 'cho_mammalian' &&
                  ' (Quantitative Bayesian Optimisation is locked until host-specific kinetic evidence is uploaded and approved).'}
              </div>
            </div>
          </div>

          {/* Point 3, Point 4, Point 5 */}
          <div className="lg:col-span-6 space-y-3">
            <div className="p-3.5 bg-white border border-slate-200 space-y-1.5">
              <div className="font-mono font-bold text-slate-900 uppercase text-[11px]">
                3. Likely Cultivation &amp; Downstream-Processing (DSP)
                Challenges
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-700 leading-snug">
                {focusedEntry.cultivationAndDownstreamChallenges.map(
                  (ch, idx) => (
                    <li key={idx}>{ch}</li>
                  )
                )}
              </ul>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 space-y-1.5">
              <div className="font-mono font-bold text-slate-900 uppercase text-[11px]">
                4. Compatible Bioreactor or Fermenter Configurations
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {focusedEntry.compatibleReactorConfigurations.map((rc) => (
                  <span
                    key={rc}
                    className="px-2 py-1 text-[11px] font-mono bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold"
                  >
                    ✓ {rc}
                  </span>
                ))}
              </div>
              <p className="text-[11px] font-mono text-rose-800 pt-1">
                ✖ {focusedEntry.incompatibleReactorsNote}
              </p>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-300 space-y-1.5">
              <div className="font-mono font-bold text-amber-950 uppercase text-[11px] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                <span>
                  5. What Scientific Data Are Missing Before Quantitative
                  Optimisation
                </span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-amber-950 leading-snug">
                {focusedEntry.missingScientificData.map((md, idx) => (
                  <li key={idx}>{md}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
