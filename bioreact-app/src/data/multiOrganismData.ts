import {
  EngineeringConstraints,
  HostRouteEvaluationEntry,
  OrganismMassBalanceResult,
  OrganismProcessModelProfile,
  OrganismSystemId,
  ProductRouteArchetypeId,
  ReactorConfiguration,
  ReactorScreeningEvaluation,
  StirredTankPhysicsParams,
  UploadedExperimentalRow,
} from '../types/bioreact';
import { REACTOR_CONFIGURATIONS } from './bioprocessData';
import { computeImpellerPowerAndRegime } from '../services/bioprocessEngine';

export const ADDITIONAL_ORGANISM_REACTORS: ReactorConfiguration[] = [
  {
    id: 'microbial_high_otr_str',
    name: 'High-Intensity Microbial Stirred-Tank Fermenter (Dual Rushton + Cooling Coils)',
    shortName: 'Microbial High-OTR STR',
    physicalArchitecture: 'High-Intensity Microbial Fermenter',
    operatingMode: 'High-Density Fed-Batch / Chemostat',
    cellRetentionSystem: 'None (Fed-Batch Exponential Feed) or Tangential Microfiltration',
    retentionFactorR: 0.0,
    isShortlistedPrimary: true,
    scaleRangeL: [10, 5000],
    klaRangePerHour: [220, 650],
    typicalShearStressPa: 6.8,
    maxShearStressPa: 14.5,
    peakVcdMillionsPerMl: 180.0,
    volumetricProductivityGPerLDay: 8.4,
    specificPowerInputWPerM3: 2400,
    foulingRiskScore: 2.1,
    massTransferGradientScore: 2.8,
    scalabilityScore: 95,
    oxygenTransferScore: 99,
    shearSafetyScore: 35,
    productivityScore: 98,
    cellRetentionScore: 40,
    costEfficiencyScore: 91,
    howItWorks:
      'High-power dual Rushton radial turbines (P/V = 1.5–3.5 kW/m³) with 0.8–1.5 vvm sparging and internal helical cooling coils + external jacket to remove extreme microbial metabolic heat (40–90 kW/m³).',
    distinctionNote:
      'Designed specifically for rigid-cell-wall microbes (E. coli, K. phaffii) where OUR reaches 180–480 mmol O₂/L/h. Fatal to mammalian or skeletal muscle cells due to high Kolmogorov shear (τ > 6 Pa).',
    mainLimitations: [
      'Extreme hydromechanical shear (τ = 5–14 Pa, λ_K < 12 μm) causes immediate lysis of wall-less mammalian and myoblast cells',
      'Jacket + internal coil heat-transfer area (A/V ∝ V^(-1/3)) becomes the primary scale-up ceiling above 2,000–5,000 L',
      'Requires rigorous antifoam dosing due to high superficial gas velocity',
    ],
    literatureBenchmarkRef:
      'Van’t Riet (1979) & Crater & Lievense (2018) — Industrial microbial fermentation oxygen & heat transfer scale-up.',
  },
  {
    id: 'tubular_helical_pbr',
    name: 'Tubular Helical Photobioreactor (Thin-Channel PAR Illuminated + Degasser Column)',
    shortName: 'Tubular Helical PBR',
    physicalArchitecture: 'Tubular Helical Photobioreactor',
    operatingMode: 'Phototrophic Continuous / Semi-Continuous',
    cellRetentionSystem: 'Closed Recirculating Borosilicate / PMMA Loop with Airlift Degasser',
    retentionFactorR: 0.85,
    isShortlistedPrimary: true,
    scaleRangeL: [20, 1500],
    klaRangePerHour: [25, 85],
    typicalShearStressPa: 0.55,
    maxShearStressPa: 1.1,
    peakVcdMillionsPerMl: 35.0,
    volumetricProductivityGPerLDay: 0.85,
    specificPowerInputWPerM3: 95,
    foulingRiskScore: 5.8,
    massTransferGradientScore: 4.1,
    scalabilityScore: 84,
    oxygenTransferScore: 86,
    shearSafetyScore: 91,
    productivityScore: 88,
    cellRetentionScore: 80,
    costEfficiencyScore: 83,
    howItWorks:
      'Narrow optical-path transparent tubes (d_tube = 0.05 m) maximise surface-to-volume ratio for Photosynthetically Active Radiation (PAR, 400–700 nm), paired with a vertical degassing column to strip photosynthetically evolved O₂ and inject CO₂.',
    distinctionNote:
      'Unlike heterotrophic stirred tanks that supply O₂ to respiring cells, a photobioreactor must supply photons across a short optical path (< 8 cm) while stripping excess O₂ (< 250% air sat.) to prevent Rubisco photo-oxidation.',
    mainLimitations: [
      'Axial dissolved O₂ build-up along tube length if recirculation time between degassers exceeds 3–5 minutes',
      'Biofilm wall fouling reduces PAR photon transmission over multi-week runs',
      'Scale-up achieved by modular numbering-up of tube manifolds rather than increasing tube diameter (Beer-Lambert law)',
    ],
    literatureBenchmarkRef:
      'Molina Grima et al. (Biotechnol. Adv., 2003) & Posten (Eng. Life Sci., 2009) — Photobioreactor design & Beer-Lambert light scaling.',
  },
  {
    id: 'flat_panel_alveolar_pbr',
    name: 'Flat-Panel Alveolar Airlift Photobioreactor (Short Optical Path LED Array)',
    shortName: 'Flat-Panel Alveolar PBR',
    physicalArchitecture: 'Flat-Panel Alveolar Photobioreactor',
    operatingMode: 'Phototrophic Continuous / Semi-Continuous',
    cellRetentionSystem: 'Pneumatic CO₂-Enriched Airlift Recirculation across 3–5 cm Optical Channels',
    retentionFactorR: 0.8,
    isShortlistedPrimary: true,
    scaleRangeL: [10, 500],
    klaRangePerHour: [35, 95],
    typicalShearStressPa: 0.38,
    maxShearStressPa: 0.75,
    peakVcdMillionsPerMl: 45.0,
    volumetricProductivityGPerLDay: 1.15,
    specificPowerInputWPerM3: 75,
    foulingRiskScore: 4.2,
    massTransferGradientScore: 2.5,
    scalabilityScore: 76,
    oxygenTransferScore: 90,
    shearSafetyScore: 96,
    productivityScore: 92,
    cellRetentionScore: 78,
    costEfficiencyScore: 79,
    howItWorks:
      'Ultra-thin flat illuminated panels (optical path L_opt = 0.03–0.05 m) sparged with 2–5% CO₂-enriched air at the base, achieving rapid flash-light mixing cycles between the photic wall zone and core.',
    distinctionNote:
      'Eliminates the dark core of cylindrical vessels and achieves rapid O₂ desorption directly into the headspace without a long closed tube loop.',
    mainLimitations: [
      'Individual panel volume is limited to ~100–500 L; commercial facilities require parallel panel numbering-up',
      'High capital cost per litre for sterilizable dual-sided LED flat-panel modules',
    ],
    literatureBenchmarkRef:
      'Posten (2009) & Sierra et al. (Chem. Eng. Sci., 2008) — Flat-panel photobioreactor mass transfer & hydrodynamics.',
  },
  {
    id: 'open_raceway_pond',
    name: 'Open Paddlewheel Raceway Pond (Non-Axenic Bulk Commodity Algal System)',
    shortName: 'Open Raceway Pond',
    physicalArchitecture: 'Open Raceway Pond',
    operatingMode: 'Phototrophic Continuous / Semi-Continuous',
    cellRetentionSystem: 'Shallow Open Channel (15–30 cm Depth) with Paddlewheel Circulation',
    retentionFactorR: 0.1,
    isShortlistedPrimary: false,
    scaleRangeL: [500, 500000],
    klaRangePerHour: [4, 14],
    typicalShearStressPa: 0.25,
    maxShearStressPa: 0.6,
    peakVcdMillionsPerMl: 4.5,
    volumetricProductivityGPerLDay: 0.12,
    specificPowerInputWPerM3: 15,
    foulingRiskScore: 7.5,
    massTransferGradientScore: 8.4,
    scalabilityScore: 96,
    oxygenTransferScore: 22,
    shearSafetyScore: 92,
    productivityScore: 18,
    cellRetentionScore: 15,
    costEfficiencyScore: 98,
    howItWorks:
      'Shallow oval raceway mixed by a low-speed paddlewheel under natural sunlight. Ultra-low CAPEX for bulk commodity biomass, but open to atmospheric contamination and evaporation.',
    distinctionNote:
      'Included as a negative screening baseline for GMP/recombinant or high-purity algal products: fails axenic containment and exhibits severe self-shading below 5 cm depth.',
    mainLimitations: [
      'Non-axenic open geometry violates cGMP sterility and GMO containment requirements',
      'Poor CO₂ mass transfer (kLa < 14 h⁻¹) and deep dark zone (15–30 cm depth) restrict biomass below 0.5–1.2 g DCW/L',
    ],
    literatureBenchmarkRef:
      'Chisti (Biotechnol. Adv., 2007) — Tubular/flat-panel photobioreactors vs open raceway ponds.',
  },
];

export const ALL_PLATFORM_REACTORS: ReactorConfiguration[] = [
  ...REACTOR_CONFIGURATIONS,
  ...ADDITIONAL_ORGANISM_REACTORS,
];

export const ORGANISM_PROCESS_MODELS: Record<OrganismSystemId, OrganismProcessModelProfile> = {
  cho_mammalian: {
    id: 'cho_mammalian',
    organismName: 'CHO-K1 / CHO-DG44 Mammalian Cells',
    scientificName: 'Cricetulus griseus (Chinese Hamster Ovary)',
    shortBadge: 'CHO Mammalian (Calibrated Demo)',
    category: 'Mammalian Suspension / Perfusion',
    exemplarProduct: 'Trastuzumab / Adalimumab IgG1 Monoclonal Antibodies (145 kDa)',
    modelReadiness: 'Supported computational demonstration',
    modelValidationBanner:
      'SUPPORTED COMPUTATIONAL DEMONSTRATION — Calibrated literature-grounded Monod, Van’t Riet (kLa), Rosseburg (t_m), and Kolmogorov shear equations for CHO suspension perfusion (Level 2 Computational Validation; Level 3 Wet-Lab Pending).',
    quantitativeOptimisationAllowedByDefault: true,
    whyChoParametersCannotBeReused:
      'CHO parameters (μ_max = 0.036 h⁻¹, q_O2 = 0.32 pmol/cell/h, τ_crit = 1.65 Pa) are specific to wall-less mammalian suspension cells at 33.5–37 °C and must NEVER be applied to microbial fermentations, anchorage-dependent myoblasts, or phototrophic algae.',
    engineeringObjectives: [
      'Maximise steady-state volumetric mAb productivity (mg/L/day) via ATF/TFF cell retention',
      'Close dissolved oxygen balance (OTR ≥ OUR) at 30–60×10⁶ cells/mL without exceeding shear ceiling τ_crit ≤ 1.65 Pa',
      'Control N-glycan galactosylation (G1F/G2F ≥ 42%) and lactate accumulation (< 2.8 g/L)',
    ],
    governingEquationsSummary: [
      'OTR = kLa · (C*_O2(y_O2) − C_L) ≥ OUR = q_O2 · X_v',
      'Perfusion Bleed: D_bleed = μ_eff − k_d − (1 − R) · D_perf',
      'Kolmogorov Eddy Scale: λ_K = (ν³ / ε_max)^(1/4) ≥ 18 μm (cell diameter ~14–16 μm)',
      'Gassed Mixing Time: t_m = 2 · 6.34 / [N · (D_i/D_t)^2.3 · (Z/D_t)^(-0.5)] ≤ 60 s',
    ],
    biomassUnit: '10⁶ cells/mL',
    defaultTargetBiomass: 43.5,
    specificGrowthRateMuMaxPerHour: 0.036,
    specificO2RateValue: 0.32,
    specificO2RateUnit: 'pmol/cell/h',
    metabolicHeatPerMmolO2Kj: 0.46,
    shearThresholdPa: 1.65,
    kolmogorovLimitUm: 18.0,
    optimalTempC: 33.5,
    optimalPh: 7.05,
    primaryMetaboliteLimitLabel: 'Lactate Overflow Ceiling',
    primaryMetaboliteLimitValue: '≤ 2.8 g/L (Ammonia ≤ 4.5 mM)',
    parameters: [
      {
        key: 'q_p',
        symbol: 'q_p',
        label: 'Specific mAb Productivity',
        value: 28.4,
        unit: 'pg/cell/day',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Bielser et al. (2018) DOI:10.1016/j.biotechadv.2018.08.008',
      },
      {
        key: 'mu_max',
        symbol: 'μ_max',
        label: 'Max Specific Growth Rate',
        value: 0.036,
        unit: 'h⁻¹',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Clincke et al. / Walther et al. (PMID:25450236)',
      },
      {
        key: 'q_o2',
        symbol: 'q_O2',
        label: 'Specific Oxygen Uptake Rate',
        value: 0.32,
        unit: 'pmol/cell/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Rosseburg et al. (2018) OpenAlex:W298144201',
      },
      {
        key: 'tau_crit',
        symbol: 'τ_crit',
        label: 'Critical Hydrodynamic Shear Ceiling',
        value: 1.65,
        unit: 'Pa',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Nienow (2006) & Clincke et al. ATF lumen threshold',
      },
    ],
    hardConstraints: [
      'Oxygen Balance Closure: OTR ≥ OUR (mmol O₂/L/h)',
      'Impeller & ATF Lumen Shear: τ ≤ 1.65 Pa and λ_K ≥ 18 μm',
      'Gassed Homogeneity: t_m ≤ 60 s and t_m ≤ 2.2 × (1/kLa)',
      'Cell Viability ≥ 88% & Lactate ≤ 2.8 g/L',
    ],
    evidenceRequirements: [
      'Confirmed IgG / Fc-fusion / human-glycosylated construct identity',
      'Literature or ambr250 benchmark for q_p, q_O2, and shear sensitivity',
      'Downstream Protein A + viral inactivation CQA specification',
    ],
    applicableReactorIds: [
      'str_perfusion',
      'str_fed_batch',
      'wave_rocking',
      'hollow_fibre',
      'packed_bed',
      'airlift',
    ],
    inapplicableReactorReasons: {
      microbial_high_otr_str:
        'Rejected: Dual Rushton turbines at P/V > 1,500 W/m³ generate τ > 6 Pa and λ_K < 12 μm, causing immediate CHO cell membrane lysis.',
      tubular_helical_pbr:
        'Rejected: CHO cells are heterotrophic mammalian cells requiring dark/stainless or single-use sterile vessels, not PAR solar/LED tube manifolds.',
      flat_panel_alveolar_pbr:
        'Rejected: Photobioreactor geometry is designed for photoautotrophic light delivery rather than mammalian ATF perfusion.',
      open_raceway_pond:
        'Rejected: Non-axenic open pond violates cGMP sterility and mammalian temperature/pH control.',
    },
  },

  hek293_mammalian: {
    id: 'hek293_mammalian',
    organismName: 'HEK293 Mammalian Cells (Viral Vector / Transient)',
    scientificName: 'Homo sapiens Embryonic Kidney 293 (Suspension 293F / Adherent 293T)',
    shortBadge: 'HEK293 (Research-Stage)',
    category: 'Mammalian Viral Vector / Transient',
    exemplarProduct: 'rAAV9 Gene Therapy Capsid / Transient Human-PTM Glycoprotein',
    modelReadiness: 'Research-stage model with unverified assumptions',
    modelValidationBanner:
      'Conceptual research model — not validated: HEK293 transient triple-transfection / viral vector kinetics exhibit post-transfection metabolic shift and cell lysis that differ from steady-state CHO perfusion. Quantitative Bayesian optimisation is disabled until construct-specific transfection kinetics are uploaded and approved.',
    quantitativeOptimisationAllowedByDefault: false,
    whyChoParametersCannotBeReused:
      'HEK293 cells are more shear-fragile than CHO (τ_crit ≈ 0.95 Pa vs 1.65 Pa), have higher per-cell oxygen demand during plasmid replication (q_O2 ≈ 0.38 pmol/cell/h), and undergo growth arrest 24–72 h post-PEI transfection.',
    engineeringObjectives: [
      'Maintain high transfection-competent cell density (4–12×10⁶ cells/mL) with minimal hydrodynamic shear (τ ≤ 0.95 Pa)',
      'Maximise full-to-empty rAAV capsid ratio (% full capsids ≥ 35%) or human-specific α2,6-sialylated glycoprotein yield',
      'Prevent PEI-DNA polyplex aggregation during large-scale plasmid addition (requiring t_m ≤ 35 s)',
    ],
    governingEquationsSummary: [
      'OTR = kLa · (C*_O2 − C_L) ≥ OUR = q_O2,HEK · X_v (q_O2,HEK = 0.38 pmol/cell/h)',
      'Shear Ceiling: τ ≤ 0.95 Pa and Kolmogorov λ_K ≥ 22 μm (protects post-transfection fragile membranes)',
      'Polyplex Mixing Window: t_m ≤ 35 s required to prevent PEI-DNA particle ripening > 500 nm',
    ],
    biomassUnit: '10⁶ cells/mL',
    defaultTargetBiomass: 12.0,
    specificGrowthRateMuMaxPerHour: 0.029,
    specificO2RateValue: 0.38,
    specificO2RateUnit: 'pmol/cell/h',
    metabolicHeatPerMmolO2Kj: 0.46,
    shearThresholdPa: 0.95,
    kolmogorovLimitUm: 22.0,
    optimalTempC: 37.0,
    optimalPh: 7.15,
    primaryMetaboliteLimitLabel: 'Post-Transfection Ammonia / Lactate',
    primaryMetaboliteLimitValue: 'Ammonia ≤ 3.0 mM · Lactate ≤ 2.2 g/L',
    parameters: [
      {
        key: 'mu_max_hek',
        symbol: 'μ_max',
        label: 'Pre-Transfection Growth Rate (HEK293F)',
        value: 0.029,
        unit: 'h⁻¹',
        sourceTag: 'Engineering Assumption',
        citationOrNote: 'Grieger et al. (Mol. Ther., 2016) suspension HEK293 benchmark',
      },
      {
        key: 'q_o2_hek',
        symbol: 'q_O2',
        label: 'Specific Oxygen Uptake (Post-Transfection)',
        value: 0.38,
        unit: 'pmol/cell/h',
        sourceTag: 'Engineering Assumption',
        citationOrNote: 'Elevated mitochondrial respiration during rAAV replication',
      },
      {
        key: 'tau_crit_hek',
        symbol: 'τ_crit',
        label: 'Maximum Safe Impeller/Sparger Shear',
        value: 0.95,
        unit: 'Pa',
        sourceTag: 'Engineering Assumption',
        citationOrNote: 'Lower membrane integrity post-PEI transfection',
      },
      {
        key: 'q_v_aav',
        symbol: 'q_capsid',
        label: 'Specific Viral Genome Yield (vg/cell)',
        value: null,
        unit: 'vg/cell',
        sourceTag: 'Missing — Requires Wet-Lab Measurement',
        citationOrNote: 'Depends strongly on serotype (AAV2/AAV8/AAV9) and ITR transgene size',
      },
    ],
    hardConstraints: [
      'Strict Shear Ceiling: τ ≤ 0.95 Pa and λ_K ≥ 22 μm',
      'Oxygen Balance Closure: OTR ≥ OUR at 37.0 °C',
      'Rapid Plasmid Addition Mixing: t_m ≤ 40 s',
    ],
    evidenceRequirements: [
      'Empirical post-transfection viability and specific productivity time-series',
      'Plasmid/PEI complexation residence-time sensitivity data',
      'Shear lysis threshold verification at target agitation speed',
    ],
    applicableReactorIds: [
      'wave_rocking',
      'str_fed_batch',
      'packed_bed',
      'str_perfusion',
      'hollow_fibre',
      'airlift',
    ],
    inapplicableReactorReasons: {
      microbial_high_otr_str:
        'Rejected: High-shear Rushton microbial fermenter destroys fragile transfected HEK293 cells (τ > 6 Pa >> 0.95 Pa).',
      tubular_helical_pbr: 'Rejected: Photobioreactor is outside domain for mammalian HEK293 viral vector culture.',
      flat_panel_alveolar_pbr: 'Rejected: Photobioreactor is outside domain for mammalian HEK293 culture.',
      open_raceway_pond: 'Rejected: Violates Biosafety Level 1/2 viral vector containment and sterility.',
    },
  },

  ecoli_microbial: {
    id: 'ecoli_microbial',
    organismName: 'Escherichia coli (Prokaryotic Microbial Fermentation)',
    scientificName: 'Escherichia coli BL21(DE3) / W3110',
    shortBadge: 'E. coli (Research-Stage)',
    category: 'Prokaryotic Microbial Fermentation',
    exemplarProduct: 'Periplasmic Fab / Non-Glycosylated Cytokine / pDNA (g DCW/L scale)',
    modelReadiness: 'Research-stage model with unverified assumptions',
    modelValidationBanner:
      'Conceptual research model — not validated: E. coli mass balance (OTR/OUR in mmol O₂/L/h from g DCW/L and metabolic heat load Q_met in kW) is active for reactor screening, but the CHO mammalian GP surrogate is NOT valid for prokaryotic IPTG induction kinetics. Quantitative BO is disabled until microbial fed-batch datasets are uploaded.',
    quantitativeOptimisationAllowedByDefault: false,
    whyChoParametersCannotBeReused:
      'E. coli grows ~13× faster than CHO (μ_max = 0.48 h⁻¹ vs 0.036 h⁻¹), is tracked in g DCW/L rather than 10⁶ cells/mL, demands 15–30× higher volumetric oxygen transfer (OUR = 250–480 mmol/L/h vs 14 mmol/L/h), and is often limited by jacket cooling capacity (Q_met = 0.46 kJ/mmol O₂) rather than impeller shear.',
    engineeringObjectives: [
      'Control exponential glucose feed rate below critical specific growth rate (μ < μ_crit ≈ 0.25 h⁻¹) to prevent Crabtree-like acetate overflow (< 1.5 g/L)',
      'Satisfy extreme microbial oxygen demand (OUR = q_O2 · X_DCW = 200–480 mmol/L/h) using high-power Rushton turbines (kLa ≥ 300 h⁻¹)',
      'Remove metabolic + agitation heat load (Q_total ≤ Q_jacket,max) to maintain 30–37 °C post-IPTG induction',
    ],
    governingEquationsSummary: [
      'Microbial OUR = q_O2 (mmol O₂/g DCW/h) · X_DCW (g DCW/L) [typically 200–480 mmol/L/h]',
      'Metabolic Heat Generation: Q_met (kW) = OUR (mmol/L/h) · V (L) · 0.46 (kJ/mmol O₂) / 3600',
      'Jacket Heat Removal Limit: Q_cool,max (kW) = U · A_jacket(V) · ΔT_LMTD (where A/V scales as V^(-1/3))',
      'Specific Growth Control: μ(S) = μ_max · S / (K_s + S) ≤ μ_acetate,crit',
    ],
    biomassUnit: 'g DCW/L',
    defaultTargetBiomass: 35.0,
    specificGrowthRateMuMaxPerHour: 0.48,
    specificO2RateValue: 10.5,
    specificO2RateUnit: 'mmol O₂/g DCW/h',
    metabolicHeatPerMmolO2Kj: 0.46,
    shearThresholdPa: 12.0,
    kolmogorovLimitUm: 4.0,
    optimalTempC: 37.0,
    optimalPh: 6.9,
    primaryMetaboliteLimitLabel: 'Acetate Overflow Threshold',
    primaryMetaboliteLimitValue: 'Acetate ≤ 1.5 g/L (keep μ ≤ 0.25 h⁻¹)',
    parameters: [
      {
        key: 'mu_max_ecoli',
        symbol: 'μ_max',
        label: 'Max Specific Growth Rate (37 °C Glucose)',
        value: 0.48,
        unit: 'h⁻¹',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Xu et al. (Biotechnol. Prog., 1999) E. coli W3110/BL21 benchmark',
      },
      {
        key: 'q_o2_ecoli',
        symbol: 'q_O2',
        label: 'Specific Oxygen Uptake Rate (Microbial)',
        value: 10.5,
        unit: 'mmol O₂/g DCW/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'At X = 35 g DCW/L, OUR = 367.5 mmol O₂/L/h',
      },
      {
        key: 'y_xs_ecoli',
        symbol: 'Y_X/S',
        label: 'Biomass Yield on Glucose',
        value: 0.45,
        unit: 'g DCW / g Glc',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Aerobic oxidative phosphorylation yield below acetate threshold',
      },
      {
        key: 'q_p_ecoli',
        symbol: 'q_p,soluble',
        label: 'Soluble Periplasmic Product Rate (vs Inclusion Bodies)',
        value: null,
        unit: 'mg/g DCW/h',
        sourceTag: 'Missing — Requires Wet-Lab Measurement',
        citationOrNote: 'Depends on IPTG concentration, post-induction temp (18–30 °C), and chaperone co-expression',
      },
    ],
    hardConstraints: [
      'Microbial Oxygen Closure: OTR ≥ OUR (typically 200–450 mmol O₂/L/h)',
      'Thermal Balance Closure: Metabolic + Impeller Heat Q_gen ≤ Vessel Jacket Cooling Q_max (kW)',
      'Dissolved Oxygen ≥ 20% air sat. to prevent anaerobic mixed-acid fermentation',
    ],
    evidenceRequirements: [
      'Confirmation that protein requires NO N-glycosylation (or uses engineered glycosylation)',
      'Soluble vs inclusion-body partitioning across induction temperatures (20–37 °C)',
      'Empirical specific oxygen uptake (mmol O₂/g DCW/h) and respiratory quotient',
    ],
    applicableReactorIds: ['microbial_high_otr_str', 'airlift', 'str_fed_batch'],
    inapplicableReactorReasons: {
      str_perfusion:
        'Rejected: Mammalian ATF hollow-fibre perfusion filters rapidly foul under bacterial división (μ = 0.48 h⁻¹) and low-shear marine impellers cannot supply kLa > 300 h⁻¹.',
      hollow_fibre:
        'Rejected: Hollow-fibre lumen oxygen drops to 0% within millimetres at microbial OUR = 350 mmol/L/h.',
      packed_bed:
        'Rejected: Fixed-bed matrices plug rapidly with fast-dividing bacterial biomass.',
      wave_rocking:
        'Rejected: Single-use rocking bags max out at kLa ~ 20–35 h⁻¹ and lack cooling jackets for microbial heat loads.',
      tubular_helical_pbr: 'Rejected: E. coli is a chemoheterotroph; photobioreactor lighting is irrelevant and kLa is too low.',
      flat_panel_alveolar_pbr: 'Rejected: Photobioreactor is outside domain for heterotrophic bacteria.',
      open_raceway_pond: 'Rejected: Non-axenic open pond violates GMO containment.',
    },
  },

  pichia_yeast: {
    id: 'pichia_yeast',
    organismName: 'Komagataella phaffii (Pichia pastoris Yeast)',
    scientificName: 'Komagataella phaffii X-33 / KM71H (Secretory Yeast)',
    shortBadge: 'K. phaffii / Pichia (Research-Stage)',
    category: 'Eukaryotic Methylotrophic / Secretory Yeast',
    exemplarProduct: 'Secreted Disulfide-Rich scFv / Nanobody / Collagen Fragment',
    modelReadiness: 'Research-stage model with unverified assumptions',
    modelValidationBanner:
      'Conceptual research model — not validated: K. phaffii oxygen & heat-transfer mass balances (g DCW/L) are active for reactor screening, but quantitative Bayesian optimisation is disabled until construct-specific secretory q_p and methanol/sorbitol induction kinetics are uploaded and approved.',
    quantitativeOptimisationAllowedByDefault: false,
    whyChoParametersCannotBeReused:
      'K. phaffii operates at 28–30 °C, reaches 40–100 g DCW/L dry cell weight, has a rigid chitin/glucan cell wall (τ_crit ≈ 8.5 Pa), and exhibits high oxygen consumption and heat evolution (0.52 kJ/mmol O₂) during AOX1 or methanol-free induction.',
    engineeringObjectives: [
      'Secretion of properly disulfide-paired recombinant protein into low-endotoxin supernatant without hyper-mannosylation',
      'Satisfy high yeast oxygen demand (OUR = 180–340 mmol O₂/L/h) and remove exothermic heat load at 28 °C',
      'Prevent ER unfolded-protein response (UPR) and proteolytic clipping via controlled carbon-limited feed',
    ],
    governingEquationsSummary: [
      'Yeast OUR = q_O2,yeast (6.8 mmol O₂/g DCW/h) · X_DCW (g DCW/L)',
      'Exothermic Heat Load: Q_met (kW) = OUR · V · 0.52 kJ/mmol O₂ / 3600 (elevated for reduced substrates)',
      'Secretory Productivity: r_p = q_p(μ) · X_DCW (bell-shaped Luedeking-Piret relation)',
    ],
    biomassUnit: 'g DCW/L',
    defaultTargetBiomass: 40.0,
    specificGrowthRateMuMaxPerHour: 0.16,
    specificO2RateValue: 6.8,
    specificO2RateUnit: 'mmol O₂/g DCW/h',
    metabolicHeatPerMmolO2Kj: 0.52,
    shearThresholdPa: 8.5,
    kolmogorovLimitUm: 6.0,
    optimalTempC: 28.5,
    optimalPh: 5.5,
    primaryMetaboliteLimitLabel: 'Methanol / Sorbitol Residual & Proteolysis',
    primaryMetaboliteLimitValue: 'Residual MeOH < 2.0 g/L (or Methanol-Free P_GAP/P_DFG)',
    parameters: [
      {
        key: 'mu_max_pichia',
        symbol: 'μ_max',
        label: 'Max Specific Growth Rate (Glycerol/Sorbitol)',
        value: 0.16,
        unit: 'h⁻¹',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Looser et al. (Biotechnol. Adv., 2015) K. phaffii kinetic review',
      },
      {
        key: 'q_o2_pichia',
        symbol: 'q_O2',
        label: 'Specific Oxygen Uptake Rate (Induction)',
        value: 6.8,
        unit: 'mmol O₂/g DCW/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'At X = 40 g DCW/L, OUR = 272 mmol O₂/L/h',
      },
      {
        key: 'tau_crit_pichia',
        symbol: 'τ_crit',
        label: 'Secreted Protein Interface Shear Limit',
        value: 8.5,
        unit: 'Pa',
        sourceTag: 'Engineering Assumption',
        citationOrNote: 'Cells tolerate high shear, but secreted scFv may aggregate at gas-liquid interfaces',
      },
      {
        key: 'q_p_pichia',
        symbol: 'q_p',
        label: 'Specific Secretory Productivity',
        value: null,
        unit: 'mg/g DCW/h',
        sourceTag: 'Missing — Requires Wet-Lab Measurement',
        citationOrNote: 'Requires empirical fed-batch induction measurement for target construct',
      },
    ],
    hardConstraints: [
      'Oxygen Balance Closure: OTR ≥ OUR (typically 180–340 mmol O₂/L/h)',
      'Cooling Jacket Closure at 28.5 °C: Q_gen ≤ Q_cool,max (smaller ΔT to chilled water makes cooling harder than at 37 °C)',
      'Secreted Protein Stability: Gas-liquid foam interface control',
    ],
    evidenceRequirements: [
      'Confirmation that high-mannose yeast glycosylation (or aglycosylated expression) is acceptable for clinical/research use',
      'Shake-flask / ambr250 secretory titre and SDS-PAGE / SEC-HPLC aggregation profile',
      'Measured specific oxygen uptake rate during promoter induction',
    ],
    applicableReactorIds: ['microbial_high_otr_str', 'str_fed_batch', 'airlift'],
    inapplicableReactorReasons: {
      str_perfusion:
        'Rejected: Yeast fed-batch fermentation requires high-OTR Rushton/pitched-blade fermenters (kLa > 220 h⁻¹) rather than mammalian ATF hollow-fibre filters.',
      hollow_fibre:
        'Rejected: Hollow-fibre cartridge cannot supply OUR > 250 mmol/L/h or remove yeast metabolic heat.',
      wave_rocking:
        'Rejected: Single-use wave bags lack the kLa (> 220 h⁻¹) and cooling capacity required for dense K. phaffii cultures.',
      packed_bed: 'Rejected: Fixed-bed matrices foul under dense budding yeast growth.',
      tubular_helical_pbr: 'Rejected: K. phaffii is a non-photosynthetic yeast.',
      flat_panel_alveolar_pbr: 'Rejected: K. phaffii is a non-photosynthetic yeast.',
      open_raceway_pond: 'Rejected: Non-axenic open pond is unsuitable for recombinant yeast fermentation.',
    },
  },

  saccharomyces_yeast: {
    id: 'saccharomyces_yeast',
    organismName: 'Saccharomyces cerevisiae (Crabtree-Positive Eukaryotic Yeast)',
    scientificName: 'Saccharomyces cerevisiae CEN.PK / S288C (GRAS Secretory Yeast)',
    shortBadge: 'S. cerevisiae (Research-Stage)',
    category: 'Eukaryotic Crabtree-Positive Yeast',
    exemplarProduct: 'Human Insulin Precursor / GLP-1 Analogue / Hepatitis B or HPV VLP Vaccine',
    modelReadiness: 'Research-stage model with unverified assumptions',
    modelValidationBanner:
      'Conceptual research model — not validated: S. cerevisiae oxygen and Crabtree ethanol-overflow constraints (g DCW/L) are active for host and reactor screening, but quantitative Bayesian optimisation is disabled until construct-specific secretory kinetics and respiratory quotient (RQ) data are uploaded and approved.',
    quantitativeOptimisationAllowedByDefault: false,
    whyChoParametersCannotBeReused:
      'S. cerevisiae is a Crabtree-positive budding yeast (μ_max ≈ 0.42 h⁻¹ at 30 °C, rigid β-glucan/mannoprotein cell wall τ_crit ≈ 9.0 Pa) that ferments glucose to ethanol even under aerobic conditions if glucose exceeds ~0.1–0.2 g/L (μ > μ_crit ≈ 0.25 h⁻¹), and attaches immunogenic hyper-mannosylated N-glycans (Man_50–150) unlike human-like CHO G0F/G1F/G2F.',
    engineeringObjectives: [
      'Maintain glucose-limited exponential fed-batch below the Crabtree threshold (μ ≤ 0.22–0.25 h⁻¹, RQ ≈ 1.0–1.05) to prevent aerobic ethanol overflow (< 1.5 g/L)',
      'Secrete properly disulfide-folded single-chain polypeptides (e.g., proinsulin / GLP-1 precursor) or assemble intracellular Virus-Like Particles (VLPs) at 30 °C',
      'Satisfy high aerobic yeast oxygen demand (OUR = 150–290 mmol O₂/L/h) and jacket heat removal',
    ],
    governingEquationsSummary: [
      'Crabtree Critical Growth Rate: μ(S) ≤ μ_crit ≈ 0.25 h⁻¹ (above which pyruvate decarboxylase overflows to ethanol)',
      'Yeast OUR = q_O2,Sc (6.2 mmol O₂/g DCW/h) · X_DCW (g DCW/L)',
      'Exothermic Heat Load: Q_met (kW) = OUR · V · 0.49 kJ/mmol O₂ / 3600',
    ],
    biomassUnit: 'g DCW/L',
    defaultTargetBiomass: 38.0,
    specificGrowthRateMuMaxPerHour: 0.42,
    specificO2RateValue: 6.2,
    specificO2RateUnit: 'mmol O₂/g DCW/h',
    metabolicHeatPerMmolO2Kj: 0.49,
    shearThresholdPa: 9.0,
    kolmogorovLimitUm: 5.5,
    optimalTempC: 30.0,
    optimalPh: 5.2,
    primaryMetaboliteLimitLabel: 'Crabtree Aerobic Ethanol Overflow',
    primaryMetaboliteLimitValue: 'Ethanol ≤ 1.5 g/L · Respiratory Quotient RQ ≤ 1.08',
    parameters: [
      {
        key: 'mu_max_sc',
        symbol: 'μ_max',
        label: 'Max Specific Growth Rate (30 °C Glucose)',
        value: 0.42,
        unit: 'h⁻¹',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Sonnleitner & Käppeli (Biotechnol. Bioeng., 1986) oxidative/reductive yeast model',
      },
      {
        key: 'mu_crit_crabtree',
        symbol: 'μ_crit',
        label: 'Crabtree Ethanol Overflow Growth Threshold',
        value: 0.25,
        unit: 'h⁻¹',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Maximum purely oxidative growth rate before aerobic ethanol formation',
      },
      {
        key: 'q_o2_sc',
        symbol: 'q_O2',
        label: 'Specific Oxygen Uptake Rate (Oxidative Regime)',
        value: 6.2,
        unit: 'mmol O₂/g DCW/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'At X = 38 g DCW/L, OUR = 235.6 mmol O₂/L/h',
      },
      {
        key: 'q_p_sc',
        symbol: 'q_p',
        label: 'Specific Secretory / VLP Productivity',
        value: null,
        unit: 'mg/g DCW/h',
        sourceTag: 'Missing — Requires Wet-Lab Measurement',
        citationOrNote: 'Depends on α-factor leader processing (Kex2p cleavage) and ER folding load',
      },
    ],
    hardConstraints: [
      'Crabtree Control: Specific glucose feed keep μ ≤ 0.25 h⁻¹ and RQ ≤ 1.08',
      'Oxygen Balance Closure: OTR ≥ OUR (typically 150–290 mmol O₂/L/h)',
      'Cooling Jacket Closure at 30.0 °C: Q_gen ≤ Q_cool,max',
    ],
    evidenceRequirements: [
      'Confirmation that product either lacks N-glycosylation sites (e.g., insulin precursor) or tolerates yeast mannosylation',
      'Off-gas mass spectrometry Respiratory Quotient (RQ = CER/OUR) feed-control calibration',
      'Empirical α-factor Kex2 protease cleavage efficiency and secreted titre',
    ],
    applicableReactorIds: ['microbial_high_otr_str', 'str_fed_batch', 'airlift'],
    inapplicableReactorReasons: {
      str_perfusion:
        'Rejected: S. cerevisiae is operated in glucose-limited fed-batch or chemostat fermenters with high kLa (> 180 h⁻¹), not mammalian ATF hollow-fibre perfusion.',
      hollow_fibre:
        'Rejected: Hollow-fibre lumen oxygen depletes immediately at yeast OUR > 200 mmol/L/h.',
      wave_rocking:
        'Rejected: Rocking bags cannot supply kLa > 180 h⁻¹ or remove exothermic yeast fermentation heat.',
      packed_bed: 'Rejected: Fixed-bed matrices plug rapidly with budding yeast biomass and CO₂ gas evolution.',
      tubular_helical_pbr: 'Rejected: S. cerevisiae is a chemoheterotrophic yeast, not phototrophic.',
      flat_panel_alveolar_pbr: 'Rejected: Photobioreactor is outside domain for heterotrophic yeast.',
      open_raceway_pond: 'Rejected: Non-axenic open pond violates pharmaceutical GMP containment.',
    },
  },

  skeletal_muscle_cultivated_meat: {
    id: 'skeletal_muscle_cultivated_meat',
    organismName: 'Skeletal Muscle Satellite Cells (Cultivated Meat)',
    scientificName: 'Bos taurus / Sus scrofa Primary Myoblasts (Pax7+ / MyoD+)',
    shortBadge: 'Skeletal Muscle (Cultivated Meat)',
    category: 'Anchorage-Dependent Cultivated Meat Myoblasts',
    exemplarProduct: 'Structured Cultivated Bovine / Porcine Myotube Biomass',
    modelReadiness: 'Research-stage model with unverified assumptions',
    modelValidationBanner:
      'Conceptual research model — not validated: Cultivated meat myoblast expansion on microcarriers is governed by Kolmogorov eddy-to-microcarrier detachment physics (λ_K ≥ 150 μm, τ ≤ 0.35 Pa) and strict food-grade media cost limits. Quantitative Bayesian optimisation is disabled because validated differentiation/fusion surrogate models are not yet established.',
    quantitativeOptimisationAllowedByDefault: false,
    whyChoParametersCannotBeReused:
      'Unlike free-floating single CHO cells (~15 μm), anchorage-dependent skeletal muscle myoblasts grow on 150–200 μm edible microcarriers or multicellular aggregates. Eddies smaller than the microcarrier diameter (λ_K < 150 μm, τ > 0.35 Pa) strip cells off beads and trigger anoikis, while media cost must be 50–100× lower than pharma mAb media.',
    engineeringObjectives: [
      'Keep Kolmogorov microscale eddy length λ_K ≥ 150 μm (above microcarrier diameter) and hydrodynamic shear τ ≤ 0.35 Pa while keeping microcarriers in just-suspended state (N ≥ N_js)',
      'Supply dissolved oxygen (OTR ≥ OUR) without bubble-burst sparging damage (using headspace/membrane oxygenation or surfactant-protected microsparging)',
      'Minimise serum-free growth factor (FGF-2 / IGF-1 / albumin) media cost toward food-scale targets',
    ],
    governingEquationsSummary: [
      'Microcarrier Eddy Detachment Criterion: λ_K = (ν³ / ε_max)^(1/4) ≥ d_microcarrier (150 μm)',
      'Ultra-Low Shear Ceiling: τ ≤ 0.35 Pa (4.7× stricter than CHO mAb limit of 1.65 Pa)',
      'Zwietering Just-Suspended Speed: N_js = S · ν^0.1 · [g · (ρ_p − ρ_L) / ρ_L]^0.45 · X^0.13 · d_p^0.2 · D_i^(-0.85)',
      'Myoblast Oxygen Balance: OTR ≥ OUR = q_O2,myo (0.14 pmol/cell/h) · X_v',
    ],
    biomassUnit: '10⁶ cells/mL',
    defaultTargetBiomass: 18.0,
    specificGrowthRateMuMaxPerHour: 0.024,
    specificO2RateValue: 0.14,
    specificO2RateUnit: 'pmol/cell/h',
    metabolicHeatPerMmolO2Kj: 0.45,
    shearThresholdPa: 0.35,
    kolmogorovLimitUm: 150.0,
    optimalTempC: 37.5,
    optimalPh: 7.2,
    primaryMetaboliteLimitLabel: 'Lactate & Premature Differentiation',
    primaryMetaboliteLimitValue: 'Lactate ≤ 1.8 g/L · Maintain Pax7+ Stemness during Expansion',
    parameters: [
      {
        key: 'mu_max_myo',
        symbol: 'μ_max',
        label: 'Myoblast Proliferation Rate (Doubling ~28–30 h)',
        value: 0.024,
        unit: 'h⁻¹',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Humbird (2021) & Post et al. (Nat. Food) cultivated meat TEA benchmarks',
      },
      {
        key: 'q_o2_myo',
        symbol: 'q_O2',
        label: 'Specific Oxygen Uptake (Proliferating Myoblasts)',
        value: 0.14,
        unit: 'pmol/cell/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Lower specific respiration than hyper-secreting CHO mAb lines',
      },
      {
        key: 'tau_crit_myo',
        symbol: 'τ_crit',
        label: 'Microcarrier Detachment / Anoikis Shear Limit',
        value: 0.35,
        unit: 'Pa',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Croughan et al. — microcarrier bead-to-bead collision & eddy stripping limit',
      },
      {
        key: 'lambda_k_min',
        symbol: 'λ_K,min',
        label: 'Minimum Safe Kolmogorov Eddy Length',
        value: 150.0,
        unit: 'μm',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Eddies smaller than ~150 μm microcarriers generate high surface shear on attached myoblasts',
      },
    ],
    hardConstraints: [
      'Kolmogorov Microcarrier Protection: λ_K ≥ 150 μm and τ ≤ 0.35 Pa',
      'Oxygen Balance Closure: OTR ≥ OUR at low agitation power',
      'Food-Grade Economics: Media recycling / perfusion exchange must avoid pharma-priced growth factors',
    ],
    evidenceRequirements: [
      'Microcarrier type (edible gelatin/zein vs dissolvable vs single-cell suspension adaptation)',
      'Empirical bead-to-bead transfer efficiency and Pax7+ stemness retention across passages',
      'Myotube fusion index (%) during differentiation phase',
    ],
    applicableReactorIds: [
      'wave_rocking',
      'packed_bed',
      'hollow_fibre',
      'airlift',
      'str_perfusion',
      'str_fed_batch',
    ],
    inapplicableReactorReasons: {
      microbial_high_otr_str:
        'Rejected: Rushton fermenter generates λ_K < 12 μm (far below the 150 μm microcarrier threshold), instantaneously stripping and lysing skeletal muscle cells.',
      tubular_helical_pbr: 'Rejected: Photobioreactor is outside domain for mammalian skeletal muscle cells.',
      flat_panel_alveolar_pbr: 'Rejected: Photobioreactor is outside domain for mammalian skeletal muscle cells.',
      open_raceway_pond: 'Rejected: Non-sterile open pond is unusable for mammalian cell culture.',
    },
  },

  microalgae_phototrophic: {
    id: 'microalgae_phototrophic',
    organismName: 'Microalgae (Photoautotrophic Cultivation)',
    scientificName: 'Haematococcus pluvialis / Chlorella vulgaris / Nannochloropsis',
    shortBadge: 'Microalgae (Photobioreactor)',
    category: 'Photoautotrophic Microalgae',
    exemplarProduct: 'Astaxanthin Carotenoid / Algal Omega-3 / Subunit Vaccine Antigen',
    modelReadiness: 'Research-stage model with unverified assumptions',
    modelValidationBanner:
      'Conceptual research model — not validated: Microalgae photobioreactor physics (Beer-Lambert light attenuation I(z), CO₂ mass transfer CTR ≥ CUR, and photosynthetic O₂ stripping) are modelled for geometry screening, but the heterotrophic CHO Bayesian optimiser is disabled for phototrophic cultivation.',
    quantitativeOptimisationAllowedByDefault: false,
    whyChoParametersCannotBeReused:
      'Photoautotrophic microalgae fix CO₂ using light energy (PAR 400–700 nm) and EVOLVE net O₂ during photosynthesis rather than consuming O₂ like heterotrophic CHO cells. Standard opaque stainless-steel stirred tanks block light transmission (optical path > 0.5 m leaves > 92% of the vessel in darkness).',
    engineeringObjectives: [
      'Maximise photic zone volume fraction via short optical path geometries (L_opt ≤ 0.05–0.08 m in Tubular or Flat-Panel Photobioreactors)',
      'Supply dissolved CO₂ (CTR ≥ CUR) to maintain pH 7.2–7.8 without carbon starvation',
      'Strip photosynthetically evolved O₂ in a degasser column to keep dissolved O₂ < 220–250% air saturation (preventing Rubisco photorespiration and oxidative bleaching)',
    ],
    governingEquationsSummary: [
      'Beer-Lambert Light Attenuation: I(z) = I_0 · exp(−ε_ext · X_DCW · z)',
      'Mean Integrated Irradiance: I_mean = I_0 · [1 − exp(−ε_ext · X_DCW · L_opt)] / (ε_ext · X_DCW · L_opt)',
      'Carbon Dioxide Balance: CTR = kLa_CO2 · (C*_CO2 − C_L,CO2) ≥ CUR = q_CO2 · X_DCW',
      'Photosynthetic O₂ Evolution Desorption: DO_max = DO_in + (|q_O2,evol| · X_DCW · τ_loop) ≤ 250% air sat.',
    ],
    biomassUnit: 'g DCW/L',
    defaultTargetBiomass: 4.8,
    specificGrowthRateMuMaxPerHour: 0.045,
    specificO2RateValue: -2.4, // Negative = Net O2 evolution (2.4 mmol O2 evolved per g DCW per hour)
    specificO2RateUnit: 'mmol O₂/g DCW/h',
    specificCO2FixationRateMmolPerGDcwHour: 2.8,
    metabolicHeatPerMmolO2Kj: 0.12,
    shearThresholdPa: 1.1,
    kolmogorovLimitUm: 20.0,
    optimalTempC: 25.0,
    optimalPh: 7.4,
    primaryMetaboliteLimitLabel: 'Dissolved O₂ Photo-Inhibition & Light Penetration',
    primaryMetaboliteLimitValue: 'DO ≤ 250% Air Sat. · Optical Path L_opt ≤ 0.08 m',
    lightIntensityUmolM2S: 450,
    opticalExtinctionCoeffLPerGDcwM: 18.5,
    maxOpticalPathLengthM: 0.08,
    parameters: [
      {
        key: 'i_0_par',
        symbol: 'I_0',
        label: 'Incident PAR Photon Flux Density',
        value: 450,
        unit: 'μmol photons/m²/s',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Molina Grima et al. (2003) & Posten (2009) PBR illumination benchmark',
      },
      {
        key: 'eps_ext',
        symbol: 'ε_ext',
        label: 'Biomass Specific Light Extinction Coefficient',
        value: 18.5,
        unit: 'm²/kg DCW (L/g·m)',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Pigmented chlorophyte Beer-Lambert attenuation coefficient',
      },
      {
        key: 'q_co2_algae',
        symbol: 'q_CO2',
        label: 'Specific CO₂ Fixation Rate',
        value: 2.8,
        unit: 'mmol CO₂/g DCW/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Stoichiometric 1.83 g CO₂ fixed per g algal dry biomass',
      },
      {
        key: 'q_o2_evol',
        symbol: 'q_O2,evol',
        label: 'Net Photosynthetic O₂ Evolution Rate',
        value: 2.4,
        unit: 'mmol O₂/g DCW/h',
        sourceTag: 'Literature-Grounded Value',
        citationOrNote: 'Must be stripped in degasser to keep DO < 250% air saturation',
      },
    ],
    hardConstraints: [
      'Optical Path Length: L_opt ≤ 0.08 m so photic zone fraction ≥ 35% at target g DCW/L',
      'CO₂ Mass Transfer Closure: CTR ≥ CUR (mmol CO₂/L/h)',
      'Photosynthetic O₂ Desorption: Peak dissolved O₂ ≤ 250% air saturation',
      'Flagellar / Cell Wall Shear Safety: τ ≤ 1.10 Pa',
    ],
    evidenceRequirements: [
      'Strain-specific light saturation constant (I_k) and photoinhibition threshold (I_inh)',
      'Pigment / chlorophyll content variation between green vegetative and carotenoid induction stages',
      'Degasser liquid recirculation residence time validation',
    ],
    applicableReactorIds: [
      'flat_panel_alveolar_pbr',
      'tubular_helical_pbr',
      'airlift',
      'wave_rocking',
      'open_raceway_pond',
    ],
    inapplicableReactorReasons: {
      str_perfusion:
        'Constraint Violation: Standard stainless-steel Stirred-Tank Perfusion vessel has tank diameter D_t ≈ 0.85 m at 500 L (> 93% dark core by Beer-Lambert attenuation) unless converted to an internally illuminated or thin-channel PBR.',
      str_fed_batch:
        'Constraint Violation: Opaque cylindrical stirred tank fails phototrophic PAR delivery (L_opt = D_t >> 0.08 m).',
      microbial_high_otr_str:
        'Constraint Violation: Opaque stainless-steel fermenter blocks PAR light and high Rushton shear (τ > 6 Pa) shears flagellated/vegetative algal cells.',
      hollow_fibre:
        'Constraint Violation: Opaque hollow-fibre cartridge prevents photosynthetic illumination and traps evolved O₂ bubbles.',
      packed_bed:
        'Constraint Violation: Packed-bed matrix blocks light penetration past the outer 2 mm layer.',
    },
  },
};

/**
 * Computes organism-specific mass balance, transport, thermal, shear, and photic constraints
 * using the selected organism's native units and governing physics.
 */
export function solveOrganismSpecificMassBalance(
  organismId: OrganismSystemId,
  strParams: StirredTankPhysicsParams,
  customBiomass?: number,
  customOpticalPathM = 0.05
): OrganismMassBalanceResult {
  const profile = ORGANISM_PROCESS_MODELS[organismId];
  const biomass = customBiomass ?? profile.defaultTargetBiomass;
  const volumeL = strParams.workingVolumeL;
  const volumeM3 = volumeL / 1000.0;

  const rho = 1005;
  const muViscosity = 0.00089;

  const tankDiameterM = Math.pow(
    (4.0 * volumeM3) / (Math.PI * strParams.aspectRatioZDt),
    1 / 3
  );
  const liquidHeightM = strParams.aspectRatioZDt * tankDiameterM;
  const impellerDiameterM = strParams.diameterRatioDiDt * tankDiameterM;
  const crossSectionAreaM2 = (Math.PI / 4.0) * tankDiameterM * tankDiameterM;

  const nRevPerSec = strParams.stirrerSpeedRpm / 60.0;
  const impEval = computeImpellerPowerAndRegime(
    strParams,
    impellerDiameterM,
    volumeM3,
    rho,
    muViscosity
  );
  const {
    gassedPowerW,
    specificPowerWPerM3,
    kolmogorovScaleUm,
    estimatedShearStressPa,
  } = impEval;

  const gasFlowM3PerS = (strParams.spargeRateVvm * volumeM3) / 60.0;
  const superficialGasVelocityMPerS = gasFlowM3PerS / Math.max(1e-4, crossSectionAreaM2);

  const mixingTimeGassedS =
    2.0 *
    (6.34 /
      (Math.max(0.1, nRevPerSec) *
        Math.pow(strParams.diameterRatioDiDt, 2.3) *
        Math.pow(strParams.aspectRatioZDt, -0.5))) *
    impEval.multiImpellerZoningFactor;

  const spargerKlaPrefactor =
    strParams.spargerType === 'sintered_microsparger' ? 96.0 : 18.5;
  const klaPerHour =
    spargerKlaPrefactor *
    Math.pow(Math.max(5.0, specificPowerWPerM3) / 100.0, 0.46) *
    Math.pow(Math.max(1e-5, superficialGasVelocityMPerS) / 0.002, 0.42);

  const hydrostaticFactor = 1.0 + (rho * 9.81 * (liquidHeightM * 0.5)) / 101325.0;
  const cStarAirMmolPerL = 0.214 * hydrostaticFactor;
  const cStarO2MmolPerL =
    cStarAirMmolPerL * (strParams.oxygenEnrichmentFraction / 0.21);
  const cLiquidO2MmolPerL = 0.48 * cStarAirMmolPerL;

  const otrMmolPerLHour = Math.max(0, klaPerHour * (cStarO2MmolPerL - cLiquidO2MmolPerL));

  // Organism-specific OUR calculation:
  // For mammalian/myoblast: q_O2 (pmol/cell/h) * X_v (10^6 cells/mL) = mmol O2/L/h
  // For E. coli / Pichia: q_O2 (mmol O2/g DCW/h) * X_DCW (g DCW/L) = mmol O2/L/h
  // For Microalgae: net photosynthetic O2 evolution (negative uptake), plus CO2 uptake
  const isPhototrophic = organismId === 'microalgae_phototrophic';
  const ourMmolPerLHour = isPhototrophic
    ? Math.abs(profile.specificO2RateValue) * biomass // magnitude of O2 evolved that must be stripped
    : profile.specificO2RateValue * biomass;

  const oxygenBalanceMarginMmolPerLHour = otrMmolPerLHour - ourMmolPerLHour;

  // Thermal balance: Metabolic Heat Load (kW) vs Jacket Cooling Capacity (kW)
  const metabolicHeatLoadKw =
    (ourMmolPerLHour * volumeL * profile.metabolicHeatPerMmolO2Kj) / 3600.0 +
    gassedPowerW / 1000.0;
  // Sidewall + dish jacket area A_jacket ≈ pi * D_t * Z + (pi/4)*D_t^2
  const jacketAreaM2 = Math.PI * tankDiameterM * liquidHeightM + crossSectionAreaM2;
  // Overall heat transfer coefficient U ≈ 650 W/(m^2·K), chilled water at 8 °C -> ΔT = T_opt - 8
  const deltaTCooling = Math.max(8.0, profile.optimalTempC - 8.0);
  const maxJacketCoolingCapacityKw = (0.65 * jacketAreaM2 * deltaTCooling);
  const isCoolingFeasible = metabolicHeatLoadKw <= maxJacketCoolingCapacityKw;

  const violatedConstraints: string[] = [];
  const engineeringRecommendations: string[] = [];

  if (!isPhototrophic) {
    if (oxygenBalanceMarginMmolPerLHour < 0) {
      violatedConstraints.push(
        `Oxygen Deficit (${profile.shortBadge}): OTR (${otrMmolPerLHour.toFixed(1)} mmol/L/h) < OUR (${ourMmolPerLHour.toFixed(1)} mmol/L/h) at ${biomass} ${profile.biomassUnit}.`
      );
      if (
        organismId === 'ecoli_microbial' ||
        organismId === 'pichia_yeast' ||
        organismId === 'saccharomyces_yeast'
      ) {
        engineeringRecommendations.push(
          `Switch to High-OTR Rushton Fermenter (250–380 rpm, 0.8–1.2 vvm, O₂ enrichment) to achieve kLa > 250 h⁻¹ required for ${ourMmolPerLHour.toFixed(0)} mmol/L/h microbial demand.`
        );
      } else {
        engineeringRecommendations.push(
          `Enable 15 μm sintered microsparger + O₂ enrichment to satisfy ${ourMmolPerLHour.toFixed(1)} mmol/L/h demand without raising impeller speed above shear ceiling.`
        );
      }
    }

    if (estimatedShearStressPa > profile.shearThresholdPa) {
      violatedConstraints.push(
        `Shear Stress Violation: τ = ${estimatedShearStressPa.toFixed(2)} Pa exceeds ${profile.organismName} ceiling τ_crit = ${profile.shearThresholdPa.toFixed(2)} Pa.`
      );
      engineeringRecommendations.push(
        `Reduce stirrer speed or switch to low-shear axial marine impeller / rocking / hollow-fibre architecture to bring τ ≤ ${profile.shearThresholdPa.toFixed(2)} Pa.`
      );
    }

    if (kolmogorovScaleUm < profile.kolmogorovLimitUm) {
      violatedConstraints.push(
        `Kolmogorov Eddy Damage: λ_K = ${kolmogorovScaleUm.toFixed(1)} μm < required minimum ${profile.kolmogorovLimitUm.toFixed(0)} μm (${
          organismId === 'skeletal_muscle_cultivated_meat'
            ? 'smaller than 150 μm microcarriers, causing myoblast detachment'
            : 'causes turbulent eddy shear damage'
        }).`
      );
      engineeringRecommendations.push(
        `Lower specific power input P/V so Kolmogorov eddy size λ_K exceeds ${profile.kolmogorovLimitUm.toFixed(0)} μm.`
      );
    }

    if (!isCoolingFeasible) {
      violatedConstraints.push(
        `Exothermic Heat Removal Failure: Metabolic + agitation heat load (${metabolicHeatLoadKw.toFixed(1)} kW) exceeds vessel jacket capacity (${maxJacketCoolingCapacityKw.toFixed(1)} kW at ${profile.optimalTempC} °C).`
      );
      engineeringRecommendations.push(
        `Install internal helical cooling coils, use glycol refrigerant (-5 °C), or reduce fed-batch carbon feed rate to cap OUR.`
      );
    }
  }

  // Phototrophic microalgae calculations (Beer-Lambert light + CO2 + O2 stripping)
  let meanLightIntensityUmolM2S: number | undefined;
  let photicZoneFractionPercent: number | undefined;
  let co2TransferRateMmolPerLHour: number | undefined;
  let co2UptakeRateMmolPerLHour: number | undefined;
  let dissolvedO2AccumulationPercentAir: number | undefined;

  if (isPhototrophic) {
    const i0 = profile.lightIntensityUmolM2S || 450;
    const eps = profile.opticalExtinctionCoeffLPerGDcwM || 18.5;
    const opticalDepth = eps * biomass * customOpticalPathM;
    meanLightIntensityUmolM2S =
      opticalDepth > 0.001
        ? (i0 * (1.0 - Math.exp(-opticalDepth))) / opticalDepth
        : i0;
    // Photic compensation depth where I(z) >= 35 umol/m^2/s
    const zPhoticM = Math.log(Math.max(1.0, i0 / 35.0)) / Math.max(0.01, eps * biomass);
    photicZoneFractionPercent = Math.min(100, (zPhoticM / customOpticalPathM) * 100.0);

    // CO2 mass transfer (kLa_CO2 ≈ 0.89 * kLa_O2, 4% CO2 enriched air -> C*_CO2 ≈ 1.35 mmol/L)
    const klaCo2 = 0.89 * klaPerHour;
    co2TransferRateMmolPerLHour = klaCo2 * 1.15;
    co2UptakeRateMmolPerLHour =
      (profile.specificCO2FixationRateMmolPerGDcwHour || 2.8) * biomass;

    // Dissolved O2 build-up (% air sat.) = 100 + (O2_evolution_rate / (kLa * C*_air)) * 100
    dissolvedO2AccumulationPercentAir =
      100.0 + (ourMmolPerLHour / Math.max(1.5, klaPerHour * cStarAirMmolPerL)) * 100.0;

    if (customOpticalPathM > (profile.maxOpticalPathLengthM || 0.08) || photicZoneFractionPercent < 35) {
      violatedConstraints.push(
        `Beer-Lambert Self-Shading Violation: Optical path L_opt = ${(customOpticalPathM * 100).toFixed(1)} cm yields only ${photicZoneFractionPercent.toFixed(1)}% photic zone (mean PAR = ${meanLightIntensityUmolM2S.toFixed(0)} μmol/m²/s) at ${biomass} g DCW/L.`
      );
      engineeringRecommendations.push(
        `Switch from cylindrical tank (D_t = ${(tankDiameterM * 100).toFixed(0)} cm) to a Flat-Panel Alveolar PBR or Tubular Helical PBR with optical path L_opt ≤ 5 cm.`
      );
    }

    if ((co2TransferRateMmolPerLHour || 0) < (co2UptakeRateMmolPerLHour || 0)) {
      violatedConstraints.push(
        `CO₂ Fixation Deficit: CTR (${co2TransferRateMmolPerLHour.toFixed(1)} mmol CO₂/L/h) < CUR (${co2UptakeRateMmolPerLHour.toFixed(1)} mmol CO₂/L/h).`
      );
      engineeringRecommendations.push(
        `Increase CO₂ sparging rate or switch to micro-bubble CO₂ diffuser in the airlift riser.`
      );
    }

    if ((dissolvedO2AccumulationPercentAir || 100) > 250) {
      violatedConstraints.push(
        `Photosynthetic O₂ Toxicity: Accumulated DO = ${dissolvedO2AccumulationPercentAir.toFixed(0)}% air saturation (> 250% ceiling inhibits Rubisco and triggers photo-oxidative bleaching).`
      );
      engineeringRecommendations.push(
        `Increase airlift degasser stripping rate (kLa ≥ 35 h⁻¹) or shorten tubular loop residence time.`
      );
    }
  }

  return {
    organismId,
    workingVolumeL: volumeL,
    biomassConcentration: biomass,
    biomassUnit: profile.biomassUnit,
    otrMmolPerLHour,
    ourMmolPerLHour,
    oxygenBalanceMarginMmolPerLHour,
    klaPerHour,
    estimatedShearStressPa,
    shearThresholdPa: profile.shearThresholdPa,
    kolmogorovScaleUm,
    kolmogorovLimitUm: profile.kolmogorovLimitUm,
    mixingTimeGassedS,
    metabolicHeatLoadKw,
    maxJacketCoolingCapacityKw,
    isCoolingFeasible,
    isPhototrophic,
    meanLightIntensityUmolM2S,
    photicZoneFractionPercent,
    co2TransferRateMmolPerLHour,
    co2UptakeRateMmolPerLHour,
    dissolvedO2AccumulationPercentAir,
    isFeasible: violatedConstraints.length === 0,
    violatedConstraints,
    engineeringRecommendations,
  };
}

/**
 * Organism-aware Reactor Configuration Screener:
 * Screens all 10 platform reactor configurations against the selected organism's
 * physics, light requirements, shear limits, oxygen/CO2 demands, and scale.
 */
export function screenReactorsForOrganism(
  organismId: OrganismSystemId,
  constraints: EngineeringConstraints
): ReactorScreeningEvaluation[] {
  const org = ORGANISM_PROCESS_MODELS[organismId];

  const evals: ReactorScreeningEvaluation[] = ALL_PLATFORM_REACTORS.map((reactor) => {
    const isApplicable = org.applicableReactorIds.includes(reactor.id);
    const inapplicableReason = org.inapplicableReactorReasons[reactor.id];

    const scaleOk =
      constraints.targetScaleL >= reactor.scaleRangeL[0] &&
      constraints.targetScaleL <= reactor.scaleRangeL[1];

    // Organism-aware kLa & shear thresholds
    const requiredKla =
      organismId === 'ecoli_microbial'
        ? 250
        : organismId === 'pichia_yeast' || organismId === 'saccharomyces_yeast'
        ? 180
        : organismId === 'microalgae_phototrophic'
        ? 25
        : constraints.minKlaPerHour;

    const klaOk = reactor.klaRangePerHour[1] >= requiredKla;
    const effectiveShearLimit = Math.min(constraints.maxShearStressPa, org.shearThresholdPa);
    const shearOk = reactor.typicalShearStressPa <= effectiveShearLimit;
    const productivityOk =
      reactor.volumetricProductivityGPerLDay >= constraints.minVolumetricProductivityGPerLDay ||
      organismId === 'microalgae_phototrophic' ||
      organismId === 'skeletal_muscle_cultivated_meat';
    const retentionOk = !constraints.requireContinuousRetention || reactor.retentionFactorR >= 0.7;

    const passReasons: string[] = [];
    const failOrCautionReasons: string[] = [];

    if (!isApplicable && inapplicableReason) {
      failOrCautionReasons.push(inapplicableReason);
    }

    if (scaleOk) {
      passReasons.push(
        `Supports target ${constraints.targetScaleL} L working volume (range ${reactor.scaleRangeL[0]}–${reactor.scaleRangeL[1]} L).`
      );
    } else {
      failOrCautionReasons.push(
        `Target scale ${constraints.targetScaleL} L lies outside verified geometry range (${reactor.scaleRangeL[0]}–${reactor.scaleRangeL[1]} L).`
      );
    }

    if (klaOk) {
      passReasons.push(
        `Mass transfer capacity (kLa ${reactor.klaRangePerHour[0]}–${reactor.klaRangePerHour[1]} h⁻¹) satisfies ${org.shortBadge} requirement (≥ ${requiredKla} h⁻¹).`
      );
    } else {
      failOrCautionReasons.push(
        `Peak kLa (${reactor.klaRangePerHour[1]} h⁻¹) is insufficient for ${org.shortBadge} demand (requires ≥ ${requiredKla} h⁻¹).`
      );
    }

    if (shearOk) {
      passReasons.push(
        `Typical hydrodynamic shear (${reactor.typicalShearStressPa.toFixed(2)} Pa) stays within ${org.shortBadge} ceiling (≤ ${effectiveShearLimit.toFixed(2)} Pa).`
      );
    } else {
      failOrCautionReasons.push(
        `Typical shear (${reactor.typicalShearStressPa.toFixed(2)} Pa) exceeds ${org.shortBadge} tolerance (≤ ${effectiveShearLimit.toFixed(2)} Pa).`
      );
    }

    let rawScore =
      (reactor.productivityScore * constraints.weights.productivity +
        reactor.oxygenTransferScore * constraints.weights.oxygenTransfer +
        reactor.shearSafetyScore * constraints.weights.shearSafety +
        reactor.scalabilityScore * constraints.weights.scalability +
        reactor.cellRetentionScore * constraints.weights.cellRetention) /
      Math.max(
        1,
        constraints.weights.productivity +
          constraints.weights.oxygenTransfer +
          constraints.weights.shearSafety +
          constraints.weights.scalability +
          constraints.weights.cellRetention
      );

    if (!scaleOk) rawScore -= 18;
    if (!klaOk) rawScore -= 22;
    if (!shearOk) rawScore -= 25;

    // Exclude biologically incompatible reactors BEFORE ranking so they never receive high scores
    const overallWeightedScore = !isApplicable
      ? 0.0
      : Math.max(5, Math.min(99, Math.round(rawScore * 10) / 10));

    let status: ReactorScreeningEvaluation['status'] = 'Recommended';
    if (!isApplicable || !shearOk || !klaOk) {
      status = 'Constraint Violation';
    } else if (!scaleOk || !retentionOk) {
      status = 'Pass with Trade-offs';
    }

    return {
      reactor,
      overallWeightedScore,
      status,
      checks: {
        biologicalCompatibilityOk: isApplicable,
        scaleOk,
        klaOk,
        shearOk,
        productivityOk,
        retentionOk: isApplicable && retentionOk,
      },
      passReasons: isApplicable ? passReasons : [],
      failOrCautionReasons,
    };
  });

  return evals.sort((a, b) => {
    const aCompat = a.checks.biologicalCompatibilityOk !== false;
    const bCompat = b.checks.biologicalCompatibilityOk !== false;
    if (aCompat !== bCompat) return aCompat ? -1 : 1;
    return b.overallWeightedScore - a.overallWeightedScore;
  });
}

export const SAMPLE_DISSERTATION_CSV_TEXT = `run_id,time_h,biomass_val,biomass_unit,titer_mg_L,do_percent,q_o2_measured,q_p_measured,byproduct_g_L,viability_pct
AMBR-RUN-01,24,4.2,10^6 cells/mL,38.5,52.0,0.29,11.2,0.8,97.4
AMBR-RUN-01,48,9.6,10^6 cells/mL,112.0,48.5,0.31,12.4,1.3,96.1
AMBR-RUN-01,72,18.4,10^6 cells/mL,246.0,46.0,0.33,12.8,1.9,94.8
AMBR-RUN-02,96,26.2,10^6 cells/mL,395.0,44.2,0.34,13.1,2.2,93.5`;

export function parseExperimentalCsvText(csvText: string): UploadedExperimentalRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) return [];

  const rows: UploadedExperimentalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 10) continue;
    rows.push({
      runId: cols[0] || `RUN-${i}`,
      timeHours: Number(cols[1]) || 0,
      biomassValue: Number(cols[2]) || 0,
      biomassUnit: cols[3] || '10^6 cells/mL',
      titerOrProductMgL: Number(cols[4]) || 0,
      dissolvedOxygenPercent: Number(cols[5]) || 50,
      specificO2UptakeMeasured: Number(cols[6]) || 0,
      specificProductivityMeasured: Number(cols[7]) || 0,
      lactateOrByproductGPerL: Number(cols[8]) || 0,
      viabilityPercent: Number(cols[9]) || 95,
    });
  }
  return rows;
}

export interface ProductRouteArchetypeSpec {
  id: ProductRouteArchetypeId;
  shortTitle: string;
  productTitle: string;
  modalityBadge: string;
  isPrimaryPharmaDemo?: boolean;
  molecularWeightDisplay: string;
  foldingAndPtmSummary: string;
  recommendedPrimaryRouteSummary: string;
  whyNotDefaultToChoNote: string;
}

export const PRODUCT_ROUTE_ARCHETYPES: Record<
  ProductRouteArchetypeId,
  ProductRouteArchetypeSpec
> = {
  pharma_igg_mab: {
    id: 'pharma_igg_mab',
    shortTitle: '1. Full-Length IgG1 mAb (Pharma Demo)',
    productTitle: 'Trastuzumab / Adalimumab Full-Length IgG1 Monoclonal Antibody (145.5 kDa)',
    modalityBadge: 'Mammalian-Cell Cultivation (Calibrated Demo)',
    isPrimaryPharmaDemo: true,
    molecularWeightDisplay: '145.5 kDa (Heterotetramer: 2 Heavy + 2 Light Chains)',
    foldingAndPtmSummary:
      '16 inter/intra-chain disulfide bonds + conserved Fc Asn-297 human-like complex biantennary N-glycosylation (G0F/G1F/G2F) required for FcγRIIIa ADCC and neonatal FcRn half-life.',
    recommendedPrimaryRouteSummary:
      'CHO-K1 / CHO-DG44 Mammalian Suspension Perfusion (Supported Computational Demonstration).',
    whyNotDefaultToChoNote:
      'CHO is selected here ONLY because full-length IgG1 requires mammalian ER chaperones (BiP/PDI) and human-compatible Fc N-glycosylation that E. coli lacks and wild-type yeasts hyper-mannosylate.',
  },
  disulfide_scfv_or_fab: {
    id: 'disulfide_scfv_or_fab',
    shortTitle: '2. Aglycosylated scFv / Fab Fragment (27–48 kDa)',
    productTitle: 'Anti-HER2 Disulfide-Bonded Single-Chain Fv (scFv) or Fab Fragment (No Fc Glycan)',
    modalityBadge: 'Microbial Fermentation Preferred Over CHO',
    molecularWeightDisplay: '27.5 kDa (2 canonical V_H / V_L intradomain disulfide bonds)',
    foldingAndPtmSummary:
      'Requires oxidative disulfide bond formation in ER or bacterial periplasm, but NO Fc domain and NO N-glycosylation required for antigen binding.',
    recommendedPrimaryRouteSummary:
      'Komagataella phaffii (Pichia) Secretory Yeast OR E. coli Periplasmic Fermentation (Research-Stage Models).',
    whyNotDefaultToChoNote:
      'Defaulting to CHO for a 27 kDa aglycosylated scFv wastes 14–21 day mammalian campaign times and expensive media when K. phaffii or periplasmic E. coli achieves 5–10× faster doubling and lower COGS.',
  },
  peptide_hormone_or_vlp: {
    id: 'peptide_hormone_or_vlp',
    shortTitle: '3. Insulin / GLP-1 Precursor or VLP Antigen',
    productTitle: 'Recombinant Proinsulin / GLP-1 Polypeptide Precursor (6–9 kDa) or VLP Vaccine',
    modalityBadge: 'Eukaryotic Yeast / Microbial Fermentation',
    molecularWeightDisplay: '6.0–9.5 kDa (3 disulfide bonds, non-glycosylated polypeptide)',
    foldingAndPtmSummary:
      'Requires accurate 3-disulfide pairing and Kex2/trypsin pro-peptide cleavage without N-glycosylation.',
    recommendedPrimaryRouteSummary:
      'Saccharomyces cerevisiae OR Komagataella phaffii Glucose/Glycerol-Limited Fed-Batch (Research-Stage Models).',
    whyNotDefaultToChoNote:
      'Over 50% of global human insulin/GLP-1 precursors are manufactured in S. cerevisiae or E. coli; CHO perfusion is biologically unnecessary and economically uncompetitive for small non-glycosylated peptides.',
  },
  viral_vector_or_human_sialo: {
    id: 'viral_vector_or_human_sialo',
    shortTitle: '4. rAAV9 Viral Vector / α2,6-Sialo-Protein',
    productTitle: 'Recombinant Adeno-Associated Virus (rAAV9) Capsid or Human α2,6-Sialylated Glycoprotein',
    modalityBadge: 'Human Mammalian-Cell Cultivation (HEK293)',
    molecularWeightDisplay: '~3.8 MDa 60-mer icosahedral viral capsid (VP1:VP2:VP3 = 1:1:10)',
    foldingAndPtmSummary:
      'Requires human cellular helper factors, nuclear ITR rescue/packaging, or exclusively human α2,6-linked sialic acid without non-human Neu5Gc or α-Gal epitopes.',
    recommendedPrimaryRouteSummary:
      'HEK293 Suspension Mammalian Cells (Research-Stage Model — Quantitative BO Locked Until Transfection Kinetics Uploaded).',
    whyNotDefaultToChoNote:
      'CHO cells can express trace immunogenic Neu5Gc/α-Gal and lack efficient human adenovirus E1A/E1B helper functions present in HEK293 for triple-plasmid rAAV packaging.',
  },
  small_molecule_sulfonamide: {
    id: 'small_molecule_sulfonamide',
    shortTitle: '5. Small-Molecule MRP1 (ABCC1) Ligand (412 Da)',
    productTitle: 'Round 3 MRP1-Docked Biphenyl Sulfonamide Lead (C₂₁H₁₉F₂NO₃S, 412.4 Da)',
    modalityBadge: 'Non-Biological Chemical Synthesis (Bioreactor Blocked)',
    molecularWeightDisplay: '412.4 Da (0.41 kDa synthetic organic molecule, 0 chiral centres)',
    foldingAndPtmSummary:
      'Not a protein: has no amino-acid chain, no folding, and no post-translational modifications. Synthesised via Pd-catalysed Suzuki coupling + sulfonylation.',
    recommendedPrimaryRouteSummary:
      'Non-Biological 3-Step Organic Chemical Synthesis & Crystallisation (All Cell-Culture Bioreactors Blocked).',
    whyNotDefaultToChoNote:
      'A small-molecule docking hit from AutoDock Vina cannot be produced by CHO or microbial fermentation; bioREACT blocks all biological reactor workflows and routes to chemical process synthesis.',
  },
  cultivated_muscle_biomass: {
    id: 'cultivated_muscle_biomass',
    shortTitle: '6. Cultivated Skeletal Muscle Biomass',
    productTitle: 'Bovine / Porcine Pax7+ Myoblast Expansion & Differentiated Myotube Tissue',
    modalityBadge: 'Anchorage-Dependent Mammalian Cultivation',
    molecularWeightDisplay: 'Whole-Cell Differentiated Myotube Biomass (150–200 μm Microcarriers)',
    foldingAndPtmSummary:
      'Product is intact anchorage-dependent muscle cells and sarcomeric actomyosin fibres rather than a secreted pharmaceutical protein.',
    recommendedPrimaryRouteSummary:
      'Skeletal Muscle Satellite Cells on Edible/Dissolvable Microcarriers in Ultra-Low-Shear Reactors (Research-Stage Model).',
    whyNotDefaultToChoNote:
      'CHO suspension parameters (τ_crit = 1.65 Pa, λ_K = 18 μm) would strip anchorage-dependent myoblasts off 150 μm microcarriers (which require λ_K ≥ 150 μm and τ ≤ 0.35 Pa).',
  },
  algal_carotenoid_or_antigen: {
    id: 'algal_carotenoid_or_antigen',
    shortTitle: '7. Microalgal Carotenoid / Subunit Antigen',
    productTitle: 'Haematococcus / Chlorella Phototrophic Astaxanthin or Chloroplast Subunit Antigen',
    modalityBadge: 'Phototrophic Cultivation (Light + CO₂ Driven)',
    molecularWeightDisplay: '596.8 Da Terpenoid Carotenoid / 35 kDa Plastid-Expressed Subunit Protein',
    foldingAndPtmSummary:
      'Synthesised via plastidial MEP isoprenoid pathway or chloroplast ribosomes coupled to photosynthetic light harvesting (PAR 400–700 nm) and CO₂ fixation.',
    recommendedPrimaryRouteSummary:
      'Microalgae in Thin-Channel Flat-Panel or Tubular Helical Photobioreactors (Research-Stage Model).',
    whyNotDefaultToChoNote:
      'Heterotrophic CHO stirred tanks are opaque (optical path > 80 cm blocks PAR light) and sparge O₂ for respiration, whereas photoautotrophic microalgae fix CO₂ and evolve O₂.',
  },
};

/**
 * Evaluates all 7 candidate biological hosts (CHO, HEK293, E. coli, K. phaffii,
 * S. cerevisiae, Skeletal Muscle Cells, Microalgae) plus Non-Biological Chemical Synthesis
 * for the selected product archetype, explaining:
 * 1. Why it could or could not produce the intended product
 * 2. Protein folding and post-translational modification requirements
 * 3. Likely cultivation and downstream-processing challenges
 * 4. Compatible bioreactor or fermenter configurations
 * 5. What scientific data are missing
 */
export function evaluateHostAndManufacturingRoutes(
  archetypeId: ProductRouteArchetypeId
): HostRouteEvaluationEntry[] {
  const isMab = archetypeId === 'pharma_igg_mab';
  const isScfv = archetypeId === 'disulfide_scfv_or_fab';
  const isPeptide = archetypeId === 'peptide_hormone_or_vlp';
  const isViral = archetypeId === 'viral_vector_or_human_sialo';
  const isSmallMol = archetypeId === 'small_molecule_sulfonamide';
  const isMeat = archetypeId === 'cultivated_muscle_biomass';
  const isAlgae = archetypeId === 'algal_carotenoid_or_antigen';

  return [
    {
      hostId: 'cho_mammalian',
      hostName: 'CHO Mammalian Cells (CHO-K1 / DG44 / CHO-S)',
      scientificName: 'Cricetulus griseus',
      paradigm: 'Mammalian-Cell Cultivation',
      suitabilityVerdict: isMab
        ? 'Primary Recommended Route'
        : isScfv || isViral
        ? 'Viable Alternative with Trade-Offs'
        : isSmallMol
        ? 'Requires Non-Biological Chemical Synthesis'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Supported Computational Demo (CHO Perfusion)',
      whyCouldOrCouldNotProduce: isMab
        ? 'COULD PRODUCE (Gold-Standard Industrial Host): Possesses mammalian ER folding machinery (BiP, PDI, calnexin/calreticulin) to assemble 145.5 kDa heterotetramers (2H+2L chains, 16 disulfide bonds) and Golgi glycosyltransferases to attach human-like biantennary Fc N-glycans at Asn-297.'
        : isScfv
        ? 'COULD PRODUCE BUT OVER-ENGINEERED: Can secrete folded 27 kDa scFv/Fab, but 28-hour doubling times and expensive chemically defined media yield higher COGS than microbial yeast/periplasmic systems since no Fc N-glycan is needed.'
        : isPeptide
        ? 'NOT RECOMMENDED: Capable of secreting small peptides, but economically uncompetitive against S. cerevisiae, K. phaffii, or E. coli for non-glycosylated 6–9 kDa hormones.'
        : isViral
        ? 'LIMITED FOR rAAV / HUMAN SIALYLATION: Lacks endogenous human Adenovirus E1A/E1B genes required for helper-free rAAV triple transfection and can attach trace non-human Neu5Gc sialic acids.'
        : isSmallMol
        ? 'CANNOT PRODUCE: A 412 Da synthetic biphenyl sulfonamide contains aryl-fluorine and sulfonamide bonds formed via Pd-catalysed organic chemistry, not ribosomal translation.'
        : isMeat
        ? 'CANNOT PRODUCE: Chinese hamster ovary cells are transformed ovarian suspension cells used for secreted recombinant proteins, not edible bovine/porcine skeletal muscle myotubes.'
        : 'CANNOT PRODUCE: CHO cells lack chloroplasts, photosynthetic light-harvesting complexes, and carotenoid ketolase/hydroxylase pathways.',
      proteinFoldingAndPtmRequirements:
        'Oxidative ER disulfide bond formation (PDI/Ero1), full-length tetrameric chaperone assembly, and complex N-linked glycosylation (G0F/G1F/G2F, α2,3-sialylation) with <1% high-mannose.',
      cultivationAndDownstreamChallenges: [
        'Low specific growth rate (μ_max ≈ 0.036 h⁻¹, doubling ~19–24 h) requiring 14–28 day sterile campaigns and viral barrier filtration',
        'Wall-less mammalian membrane shear sensitivity (τ ≤ 1.65 Pa, Kolmogorov λ_K ≥ 18 μm) and oxygen transfer deficit at 500 L unless sintered microspargers + O₂ enrichment are used',
        'Downstream processing requires expensive Protein A affinity chromatography, low-pH viral inactivation, 20 nm nanofiltration, and AEX/CEX polishing',
      ],
      compatibleReactorConfigurations: [
        'Stirred-Tank Perfusion (ATF/TFF, Marine Axial Impeller)',
        'Stirred-Tank Fed-Batch',
        'Single-Use Wave Rocking Bag (Seed Train)',
        'Hollow-Fibre / Packed-Bed (Small-Scale)',
      ],
      incompatibleReactorsNote:
        'Rejects High-OTR Rushton Microbial Fermenters (τ > 6 Pa causes cell lysis) and Photobioreactors.',
      missingScientificData: [
        'Clone-specific ambr250 / 500 L dynamic kLa and antifoam mass-transfer depression factor',
        'Empirical shear-induced LDH release and Fc galactosylation (G1F/G2F) sensitivity vs DO/pCO₂',
      ],
      choParameterIsolationNote:
        'Calibrated CHO parameters (μ_max = 0.036 h⁻¹, q_O2 = 0.32 pmol/cell/h, τ_crit = 1.65 Pa) are strictly isolated to this pathway and never copied to microbial or phototrophic hosts.',
    },
    {
      hostId: 'hek293_mammalian',
      hostName: 'HEK293 Human Mammalian Cells (293F / 293T)',
      scientificName: 'Homo sapiens Embryonic Kidney 293',
      paradigm: 'Mammalian-Cell Cultivation',
      suitabilityVerdict: isViral
        ? 'Primary Recommended Route'
        : isMab || isScfv
        ? 'Viable Alternative with Trade-Offs'
        : isSmallMol
        ? 'Requires Non-Biological Chemical Synthesis'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Research-Stage Model — Quantitative BO Locked',
      whyCouldOrCouldNotProduce: isViral
        ? 'COULD PRODUCE (Primary Host): Contains integrated human Adenovirus 5 E1A/E1B genes enabling helper-free rAAV triple-plasmid transfection and produces authentic human α2,6-sialylated PTMs free of non-human Neu5Gc or α-Gal.'
        : isMab
        ? 'COULD PRODUCE AT RESEARCH SCALE: Excellent for rapid transient expression of human IgGs with native human glycosylation, but achieves lower stable fed-batch/perfusion titres (1–3 g/L) than industrial CHO-K1/DG44 lines (5–12 g/L).'
        : isSmallMol
        ? 'CANNOT PRODUCE: Cannot synthesise non-biological 412 Da fluorinated sulfonamide small molecules.'
        : 'CANNOT PRODUCE: Human embryonic kidney cells are unsuitable for non-glycosylated bulk microbial peptides, cultivated meat muscle fibres, or phototrophic algal metabolites.',
      proteinFoldingAndPtmRequirements:
        'Authentic human ER/Golgi PTM machinery: α2,6- and α2,3-sialylation, human tyrosine sulfation, γ-carboxylation, and nuclear viral capsid assembly (VP1/VP2/VP3 stoichiometry).',
      cultivationAndDownstreamChallenges: [
        'Higher hydrodynamic shear fragility than CHO (τ_crit ≤ 0.95 Pa, λ_K ≥ 22 μm), especially 24–72 h after PEI-DNA polyplex transfection',
        'Large-scale mixing challenge: plasmid + PEI complexation is residence-time sensitive (particles aggregate > 500 nm if mixing time t_m > 35–40 s)',
        'Downstream viral vector purification requires cell lysis (detergent/microfluidisation), benzonase host-cell DNA digestion, and CsCl/iodixanol ultracentrifugation or AEX full-vs-empty capsid separation',
      ],
      compatibleReactorConfigurations: [
        'Single-Use Wave Rocking Bioreactor',
        'Low-Shear Axial Stirred-Tank Fed-Batch / Perfusion (Marine Impeller)',
        'Fixed-Bed / Packed-Bed Bioreactor (Adherent 293T)',
      ],
      incompatibleReactorsNote:
        'Rejects High-Intensity Rushton Microbial Fermenters (destroys fragile transfected membranes) and Photobioreactors.',
      missingScientificData: [
        'Construct-specific post-transfection viability decay and specific capsid/protein productivity time-series',
        'Full-to-empty rAAV capsid ratio (%vg) vs dissolved oxygen and shear stress',
      ],
      choParameterIsolationNote:
        'Uses distinct HEK293 constraints (τ_crit = 0.95 Pa, q_O2 = 0.38 pmol/cell/h); steady-state CHO perfusion GP surrogate is locked.',
    },
    {
      hostId: 'ecoli_microbial',
      hostName: 'Escherichia coli (BL21(DE3) / W3110)',
      scientificName: 'Escherichia coli',
      paradigm: 'Microbial Fermentation',
      suitabilityVerdict: isScfv
        ? 'Primary Recommended Route'
        : isPeptide
        ? 'Viable Alternative with Trade-Offs'
        : isSmallMol
        ? 'Requires Non-Biological Chemical Synthesis'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Research-Stage Model — Quantitative BO Locked',
      whyCouldOrCouldNotProduce: isMab
        ? 'CANNOT PRODUCE FUNCTIONAL FULL-LENGTH IgG1: Prokaryotic E. coli lacks an endoplasmic reticulum, Golgi apparatus, and N-glycosylation machinery. Full-length 145 kDa IgG1 chains misfold into insoluble cytoplasmic inclusion bodies, and aglycosylated Fc lacks ADCC effector function.'
        : isScfv
        ? 'COULD PRODUCE (Fast, Low-Cost Microbial Host): Using a PelB/OmpA signal peptide, 27–48 kDa scFv or Fab fragments translocate to the oxidising periplasmic space where DsbA/DsbC catalyse intradomain disulfide bonds without requiring N-glycosylation.'
        : isPeptide
        ? 'COULD PRODUCE VIA INCLUSION-BODY REFOLDING: Widely used for human insulin precursors expressed as high-titre cytoplasmic inclusion bodies, followed by in-vitro sulfitolysis, chaotropic refolding, and enzymatic cleavage.'
        : isSmallMol
        ? 'CANNOT PRODUCE: Cannot synthesise synthetic fluorinated biphenyl sulfonamides lacking a biosynthetic gene cluster.'
        : 'CANNOT PRODUCE: Prokaryotic bacterium cannot assemble eukaryotic viral vectors, mammalian muscle fibres, or photosynthetic carotenoids.',
      proteinFoldingAndPtmRequirements:
        'Reducing cytoplasm (misfolds multi-disulfide proteins into inclusion bodies unless exported to the oxidising periplasm via Sec/SRP pathways); ZERO N- or O-linked mammalian glycosylation; retains N-terminal formyl-methionine if cytoplasmic.',
      cultivationAndDownstreamChallenges: [
        'Extreme oxygen demand (OUR = 250–480 mmol O₂/L/h at 35–60 g DCW/L — 20–35× higher than CHO) requiring high-power Rushton turbines (P/V = 1.5–3.5 kW/m³, kLa ≥ 300 h⁻¹)',
        'Metabolic heat removal bottleneck (Q_met = 0.46 kJ/mmol O₂) and Crabtree-like acetate overflow if glucose growth rate μ > 0.25 h⁻¹',
        'Downstream processing requires high-pressure homogenisation/osmotic shock, chaotropic urea/guanidine inclusion-body refolding (if cytoplasmic), and rigorous Gram-negative lipopolysaccharide (LPS) endotoxin removal (< 0.1 EU/mg)',
      ],
      compatibleReactorConfigurations: [
        'High-Intensity Microbial Stirred-Tank Fermenter (Dual Rushton Turbines + Internal Cooling Coils)',
        'Pneumatic Airlift Fermenter',
      ],
      incompatibleReactorsNote:
        'Rejects Mammalian ATF Hollow-Fibre Perfusion (rapid bacterial biofouling & insufficient kLa) and Low-Shear Wave Bags (lack cooling and kLa > 300 h⁻¹).',
      missingScientificData: [
        'Soluble periplasmic vs insoluble inclusion-body partitioning across post-induction temperatures (18–30 °C) and IPTG levels',
        'Empirical microbial fed-batch specific productivity (mg/g DCW/h) and jacket heat-transfer coefficient U',
      ],
      choParameterIsolationNote:
        'Never reuses CHO kinetics: E. coli uses g DCW/L biomass units, μ_max = 0.48 h⁻¹, and q_O2 = 10.5 mmol O₂/g DCW/h.',
    },
    {
      hostId: 'pichia_yeast',
      hostName: 'Komagataella phaffii (Pichia pastoris Yeast)',
      scientificName: 'Komagataella phaffii X-33 / KM71H',
      paradigm: 'Microbial Fermentation',
      suitabilityVerdict:
        isScfv || isPeptide
          ? 'Primary Recommended Route'
          : isMab
          ? 'Viable Alternative with Trade-Offs'
          : isSmallMol
          ? 'Requires Non-Biological Chemical Synthesis'
          : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Research-Stage Model — Quantitative BO Locked',
      whyCouldOrCouldNotProduce:
        isScfv || isPeptide
          ? 'COULD PRODUCE (Ideal Eukaryotic Secretory Host): Possesses eukaryotic ER disulfide isomerases (Pdi1p) and Kex2 secretory processing, secreting folded disulfide-rich scFv, nanobodies, or peptide precursors directly into low-protein, endotoxin-free minimal media at high cell density (40–90 g DCW/L).'
          : isMab
          ? 'VIABLE ONLY IF GLYCOENGINEERED: Wild-type K. phaffii attaches high-mannose N-glycans (Man_8–14) that trigger rapid hepatic clearance via human mannose receptors and alter ADCC; requires humanised GlycoSwitch® strains to produce human-like G0/G2 IgG1.'
          : isSmallMol
          ? 'CANNOT PRODUCE: Cannot synthesise synthetic 412 Da fluorinated biphenyl sulfonamides.'
          : 'CANNOT PRODUCE: Methylotrophic yeast cannot package human rAAV capsids or form mammalian skeletal muscle myotubes.',
      proteinFoldingAndPtmRequirements:
        'Eukaryotic ER oxidative folding & disulfide bond pairing + extracellular secretion via S. cerevisiae α-mating factor signal; wild-type attaches oligomannose (Man_8–14) N-glycans and O-mannosylation (lacks native human sialylation).',
      cultivationAndDownstreamChallenges: [
        'Very high oxygen demand (OUR = 180–340 mmol O₂/L/h) and high exothermic heat evolution (0.52 kJ/mmol O₂ during AOX1 methanol induction; requires ATEX explosion-proof handling or methanol-free P_GAP promoters)',
        'Challenging jacket heat removal at 28.5 °C (smaller ΔT to chilled water than 37 °C bacterial/mammalian runs)',
        'Downstream challenge: secreted host vacuolar proteases (Pep4/Prb1) can clip target proteins unless pH is controlled (5.0–6.0) or protease-deficient SMD1168 strains are used; high-biomass centrifugation (> 30% wet packed cell volume)',
      ],
      compatibleReactorConfigurations: [
        'High-Intensity Microbial Stirred-Tank Fermenter (Rushton / Pitched-Blade + Helical Cooling Coils)',
        'Stainless-Steel Fed-Batch Fermenter with O₂ Enrichment',
      ],
      incompatibleReactorsNote:
        'Rejects Hollow-Fibre Cartridges, Wave Rocking Bags (insufficient kLa and cooling), and Photobioreactors.',
      missingScientificData: [
        'Construct-specific secretory q_p vs specific growth rate μ (Luedeking-Piret bell curve)',
        'Site-occupancy of O-mannosylation and proteolytic clipping rate in fermentation supernatant',
      ],
      choParameterIsolationNote:
        'Uses native yeast parameters (g DCW/L, μ_max = 0.16 h⁻¹, q_O2 = 6.8 mmol O₂/g DCW/h, ΔH_O2 = 0.52 kJ/mmol); CHO parameters are blocked.',
    },
    {
      hostId: 'saccharomyces_yeast',
      hostName: 'Saccharomyces cerevisiae (Baker’s / Brewer’s Yeast)',
      scientificName: 'Saccharomyces cerevisiae CEN.PK / S288C',
      paradigm: 'Microbial Fermentation',
      suitabilityVerdict: isPeptide
        ? 'Primary Recommended Route'
        : isScfv
        ? 'Viable Alternative with Trade-Offs'
        : isSmallMol
        ? 'Requires Non-Biological Chemical Synthesis'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Research-Stage Model — Quantitative BO Locked',
      whyCouldOrCouldNotProduce: isPeptide
        ? 'COULD PRODUCE (Proven Industrial Host for Insulin/GLP-1 & VLPs): GRAS eukaryotic host with extensive genetic tools, ER disulfide folding, and Kex2 endoprotease processing; used commercially for human insulin precursors, liraglutide/semaglutide backbones, and Hepatitis B / HPV VLP vaccines.'
        : isScfv
        ? 'COULD PRODUCE WITH LOWER TITRE THAN PICHIA: Can fold and secrete small aglycosylated scFvs, but reaches lower dry cell weight (30–50 g DCW/L) than K. phaffii due to the Crabtree ethanol effect and ER retention of larger >30 kDa proteins.'
        : isMab
        ? 'CANNOT PRODUCE THERAPEUTIC IgG1: Wild-type S. cerevisiae hyper-mannosylates N-glycans with outer chains of 50–150 mannose residues (Man_50–150), which are strongly immunogenic in humans and abolish FcγR effector function.'
        : isSmallMol
        ? 'CANNOT PRODUCE: Cannot synthesise synthetic 412 Da fluorinated biphenyl sulfonamides.'
        : 'CANNOT PRODUCE: Unsuitable for human rAAV gene therapy vectors, mammalian myotubes, or phototrophic algal products.',
      proteinFoldingAndPtmRequirements:
        'Eukaryotic ER disulfide bond formation and α-factor leader secretion, but severe Golgi hyper-mannosylation (α-1,6 and immunogenic terminal α-1,3 mannose outer chains of 50–150 residues) on any N-X-S/T sequon.',
      cultivationAndDownstreamChallenges: [
        'Crabtree effect: even under fully aerobic conditions, if dissolved glucose exceeds ~0.15 g/L (μ > μ_crit ≈ 0.25 h⁻¹), pyruvate overflows to ethanol, reducing biomass yield Y_X/S from 0.50 to 0.15 g/g and suppressing recombinant protein expression',
        'Requires real-time off-gas mass spectrometry Respiratory Quotient (RQ = CER/OUR ≈ 1.02) feedback control of exponential glucose feed',
        'Downstream challenge: hyper-mannosylated host glycoproteins co-secrete or release upon cell lysis; VLP vaccines require high-pressure mechanical bead/homogeniser cell disruption',
      ],
      compatibleReactorConfigurations: [
        'High-Intensity Microbial Stirred-Tank Fermenter (RQ-Controlled Glucose Fed-Batch)',
        'Stainless-Steel Stirred-Tank Fed-Batch / Chemostat',
      ],
      incompatibleReactorsNote:
        'Rejects Mammalian ATF Perfusion, Hollow-Fibre Cartridges, Wave Bags, and Photobioreactors.',
      missingScientificData: [
        'Strain-specific critical oxidative growth rate μ_crit and ethanol re-assimilation kinetics',
        'Secretory α-factor leader Kex2p cleavage efficiency and ER unfolded-protein stress threshold',
      ],
      choParameterIsolationNote:
        'Isolated Crabtree yeast model (g DCW/L, μ_max = 0.42 h⁻¹, μ_crit = 0.25 h⁻¹, q_O2 = 6.2 mmol O₂/g DCW/h); never uses CHO parameters.',
    },
    {
      hostId: 'skeletal_muscle_cultivated_meat',
      hostName: 'Skeletal Muscle Satellite Cells (Bovine / Porcine Myoblasts)',
      scientificName: 'Bos taurus / Sus scrofa Pax7+ Myoblasts',
      paradigm: 'Mammalian-Cell Cultivation',
      suitabilityVerdict: isMeat
        ? 'Primary Recommended Route'
        : isSmallMol
        ? 'Requires Non-Biological Chemical Synthesis'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Research-Stage Model — Quantitative BO Locked',
      whyCouldOrCouldNotProduce: isMeat
        ? 'COULD PRODUCE (Required Primary Cell Type): Self-renewing Pax7+/MyoD+ satellite myoblasts proliferate on edible or dissolvable microcarriers and fuse into multinucleated actomyosin myotubes upon serum/FGF-2 withdrawal.'
        : isSmallMol
        ? 'CANNOT PRODUCE: Cannot synthesise synthetic organic small molecules.'
        : 'CANNOT PRODUCE: Primary finite-lifespan skeletal muscle cells are anchorage-dependent cells grown for food biomass—not immortalised hyper-secreting hosts for pharmaceutical antibodies, cytokines, or viral vectors.',
      proteinFoldingAndPtmRequirements:
        'Intracellular assembly of sarcomeric myosin heavy chain (MyHC), actin, and troponin complexes plus extracellular collagen/fibronectin matrix alignment during myogenic fusion.',
      cultivationAndDownstreamChallenges: [
        'Extreme hydrodynamic fragility on 150–200 μm microcarriers: Kolmogorov eddy length must remain λ_K ≥ 150 μm and shear stress τ ≤ 0.35 Pa (4.7× stricter than CHO) to prevent bead-to-bead collision stripping and anoikis',
        'Hayflick replicative senescence (loss of Pax7+ stemness after 30–50 population doublings) and premature differentiation if lactate exceeds 1.8 g/L',
        'Downstream & economic challenge: harvesting intact cells via enzymatic/thermal detachment or direct edible microcarrier structuring while keeping media cost < $1–2/L (food-grade vs pharma media)',
      ],
      compatibleReactorConfigurations: [
        'Single-Use Wave Rocking Bioreactor',
        'Packed-Bed / Fixed-Bed Perfusion Bioreactor',
        'Hollow-Fibre Bioreactor',
        'Pneumatic Airlift or Ultra-Low-RPM Axial Stirred Tank (N ≈ N_js)',
      ],
      incompatibleReactorsNote:
        'Rejects High-Shear Microbial Fermenters (λ_K < 12 μm strips cells immediately) and Photobioreactors.',
      missingScientificData: [
        'Bead-to-bead transfer efficiency and Zwietering just-suspended speed (N_js) vs eddy detachment margin at ≥ 500 L',
        'Differentiation fusion index (%) and amino-acid conversion efficiency in food-grade hydrolysate media',
      ],
      choParameterIsolationNote:
        'Uses microcarrier-specific limits (λ_K ≥ 150 μm, τ_crit = 0.35 Pa, q_O2 = 0.14 pmol/cell/h) rather than single-cell suspension CHO limits.',
    },
    {
      hostId: 'microalgae_phototrophic',
      hostName: 'Microalgae (Haematococcus / Chlorella / Chlamydomonas)',
      scientificName: 'Haematococcus pluvialis / Chlorella vulgaris',
      paradigm: 'Phototrophic Cultivation',
      suitabilityVerdict: isAlgae
        ? 'Primary Recommended Route'
        : isPeptide || isScfv
        ? 'Viable Alternative with Trade-Offs'
        : isSmallMol
        ? 'Requires Non-Biological Chemical Synthesis'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Research-Stage Model — Quantitative BO Locked',
      whyCouldOrCouldNotProduce: isAlgae
        ? 'COULD PRODUCE (Native Photoautotrophic Producer): Fixes inorganic CO₂ using PAR light energy (400–700 nm) to biosynthesise high-value ketocarotenoids (astaxanthin, β-carotene), PUFA lipids, or chloroplast-expressed oral subunit antigens.'
        : isScfv || isPeptide
        ? 'EXPERIMENTAL NICHE ONLY: Chloroplast transformation in Chlamydomonas reinhardtii can fold disulfide-bonded immunotoxins/scFvs without endotoxins, but volumetric productivity (< 0.05 g/L/d) is 20–100× lower than CHO or K. phaffii due to Beer-Lambert light shading.'
        : isMab
        ? 'CANNOT PRODUCE CLINICAL IgG1: Microalgal N-glycans contain plant/algal xylose and fucose motifs that are immunogenic in parenteral human therapeutics, and opaque stirred tanks cannot illuminate dense algal cultures.'
        : isSmallMol
        ? 'CANNOT PRODUCE: Cannot synthesise synthetic fluorinated biphenyl sulfonamides.'
        : 'CANNOT PRODUCE: Cannot produce mammalian viral vectors or skeletal muscle tissue.',
      proteinFoldingAndPtmRequirements:
        'Chloroplast stroma contains prokaryotic-like 70S ribosomes plus oxidative disulfide isomerases; nuclear/secretory pathway attaches non-human oligomannose and xylosylated/methylated N-glycans.',
      cultivationAndDownstreamChallenges: [
        'Beer-Lambert light attenuation: above 3–5 g DCW/L, PAR photons penetrate only 3–8 cm, requiring thin-channel Flat-Panel or Tubular Photobioreactors rather than cylindrical stirred tanks',
        'Photosynthetic O₂ evolution build-up (> 250% air saturation) causes Rubisco photorespiration and oxidative cell bleaching unless stripped in an airlift degasser',
        'Downstream challenge: refractory trilaminar sporopollenin/cellulose cell wall requires high-energy mechanical bead milling or high-pressure homogenisation (> 1,000 bar) plus supercritical CO₂ extraction',
      ],
      compatibleReactorConfigurations: [
        'Flat-Panel Alveolar Photobioreactor (3–5 cm Optical Path)',
        'Tubular Helical Photobioreactor with Airlift Degasser',
        'Illuminated Airlift / Wave Bag (Seed Train)',
      ],
      incompatibleReactorsNote:
        'Rejects Opaque Stainless-Steel Stirred-Tank Fermenters (> 92% dark zone at 500 L) and Non-Axenic Open Raceway Ponds (for GMP/high-purity products).',
      missingScientificData: [
        'Strain-specific Haldane photoinhibition curve parameters (I_k, I_inh) and specific extinction coefficient ε_ext across induction stages',
        'Degasser O₂ desorption mass-transfer coefficient vs loop residence time',
      ],
      choParameterIsolationNote:
        'Uses phototrophic governing equations (Beer-Lambert light I(z), CO₂ fixation CTR ≥ CUR, net O₂ evolution −2.4 mmol O₂/g DCW/h); heterotrophic CHO equations do not apply.',
    },
    {
      hostId: 'chemical_synthesis',
      hostName: 'Non-Biological Chemical Synthesis (Organic / Flow / SPPS)',
      scientificName: 'Synthetic Organic Process Chemistry (No Living Host)',
      paradigm: 'Non-Biological Chemical Synthesis',
      suitabilityVerdict: isSmallMol
        ? 'Primary Recommended Route'
        : isPeptide
        ? 'Viable Alternative with Trade-Offs'
        : 'Biologically Incompatible for Intended Product',
      modelStatusLabel: 'Unsupported in Bioprocess Simulator (Chemical Route)',
      whyCouldOrCouldNotProduce: isSmallMol
        ? 'COULD PRODUCE (Required Route for 412 Da MRP1-Docked Lead): The MRP1 (ABCC1) biphenyl sulfonamide ligand (C₂₁H₁₉F₂NO₃S, SA = 2.34, 0 chiral centres, −10.82 kcal/mol against MRP1) is synthesised via a 3-step convergent route: (1) Pd(PPh₃)₄ Suzuki-Miyaura cross-coupling, (2) ester deprotection, and (3) sulfonamide coupling & crystallisation.'
        : isPeptide
        ? 'VIABLE FOR SHORT PEPTIDES (< 40–50 aa): Solid-Phase Peptide Synthesis (SPPS) or hybrid fragment condensation is used for short synthetic peptides, though recombinant yeast fermentation (S. cerevisiae / K. phaffii) is preferred at multi-tonne scale or > 50 amino acids.'
        : 'CANNOT PRODUCE: Organic chemical synthesis cannot assemble 145 kDa glycosylated IgG1 antibodies (> 1,300 amino acids), 3.8 MDa viral capsids, or living cell biomass.',
      proteinFoldingAndPtmRequirements:
        'No biological folding or enzymatic PTMs; regioselectivity and stereochemistry are controlled by catalyst selection, protecting groups, and solvent temperature.',
      cultivationAndDownstreamChallenges: [
        'Requires organic solvents (DMF, THF, toluene), inert N₂ headspace, and glass-lined or Hastelloy jacketed chemical reactors rather than aqueous sparged bioreactors',
        'Downstream purification relies on liquid–liquid extraction, residual Pd heavy-metal scavenging (< 10 ppm ICH Q3D limit), and anti-solvent crystallisation polymorph control',
        'Environmental Process Mass Intensity (PMI) and hazardous solvent recovery',
      ],
      compatibleReactorConfigurations: [
        'Jacketed Glass-Lined Chemical Batch Reactor + Crystalliser (External to Cell-Culture Bioreactor Screening)',
        'Continuous-Flow Tubular Microreactor (Suzuki Coupling)',
      ],
      incompatibleReactorsNote:
        'Blocks all 10 biological cell-culture bioreactors (STR Perfusion, Wave, Hollow-Fibre, Microbial Fermenter, Photobioreactor).',
      missingScientificData: [
        'Empirical 3-step isolated yield (%), impurity profile, and residual palladium scavenging kinetics',
        'Aqueous solubility, microsomal clearance, and wet-lab SPR/IC50 binding confirmation',
      ],
      choParameterIsolationNote:
        'Completely decoupled from biological growth/oxygen kinetics; bioREACT refuses to run CHO perfusion or Bayesian optimisation on small molecules.',
    },
  ];
}

