"""
The cost and time model is uncalibrated, so these tests do not check that
any figure is correct — nobody can. They check that it behaves the way a
process chemist would expect it to: longer routes cost more, bigger
campaigns cost less per gram, an impossible route is reported as
impossible rather than priced, and every assumption actually moves the
number it claims to move.
"""
from __future__ import annotations

import manufacture

SHORT_ACHIRAL = (
    "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(CNC(=O)c2ccc(F)cc2)cc1"
)
LONG_CHIRAL = (
    "CS(=O)(=O)c1cc2ccc(F)cc2cc1SC(=O)CCNc1ccc(C(C)[C@@H]2CCCC[C@H]2NC(C)"
    "c2ccc3ccccc3c2)cc1"
)
# Sitagliptin: the chiral amine Merck set with a transaminase, replacing a
# rhodium-catalysed hydrogenation. The route tool should see the motif.
SITAGLIPTIN = "Fc1cc(F)c(C[C@H](N)CC(=O)N2CCn3c(C2)nnc3C(F)(F)F)c(F)c1"
TRIPEPTIDE = "CC(C)C[C@H](NC(=O)[C@@H](N)Cc1ccccc1)C(=O)N[C@@H](C)C(=O)O"


def band_is_ordered(band: dict) -> bool:
    return band["low"] <= band["point"] <= band["high"]


# ─── structure reading ───────────────────────────────────────────────────
def test_profile_reports_steps_and_flags():
    profile = manufacture.read_structure(SHORT_ACHIRAL)
    assert profile["ok"]
    assert profile["estimated_steps"] > 0
    assert profile["metrics"]["stereocentres"] == 0
    assert isinstance(profile["process_flags"], dict)


def test_invalid_smiles_is_reported_not_raised():
    assert manufacture.read_structure("@@@").get("ok") is False


# ─── route choice ────────────────────────────────────────────────────────
def test_chiral_amine_suggests_a_transaminase():
    profile = manufacture.read_structure(SITAGLIPTIN)
    motifs = {hit["key"] for hit in profile["enzyme_motifs"]}
    assert "transaminase" in motifs

    recommended = [option for option in manufacture.route_options(profile)
                   if option["recommended"]]
    assert recommended[0]["route"] == "chemo_enzymatic"


def test_achiral_molecule_stays_with_ordinary_synthesis():
    profile = manufacture.read_structure(SHORT_ACHIRAL)
    recommended = [option for option in manufacture.route_options(profile)
                   if option["recommended"]]
    assert recommended[0]["route"] == "chemical_synthesis"


def test_peptide_goes_to_solid_phase_synthesis():
    profile = manufacture.read_structure(TRIPEPTIDE)
    assert profile["is_peptide_like"]
    recommended = [option for option in manufacture.route_options(profile)
                   if option["recommended"]]
    assert recommended[0]["route"] == "spps"


def test_exactly_one_route_is_recommended():
    for smiles in (SHORT_ACHIRAL, SITAGLIPTIN, LONG_CHIRAL, TRIPEPTIDE):
        profile = manufacture.read_structure(smiles)
        options = manufacture.route_options(profile)
        assert sum(1 for option in options if option["recommended"]) == 1, smiles


def test_a_very_long_route_is_sent_back_for_redesign():
    assessment = manufacture.assess(LONG_CHIRAL, scale_g=1000)
    assert assessment["verdict"] == "redesign_required"
    assert assessment["cost"]["viable"] is False
    assert assessment["cost"]["viability_note"]


# ─── cost behaviour ──────────────────────────────────────────────────────
def test_cost_per_gram_falls_with_scale():
    profile = manufacture.read_structure(SHORT_ACHIRAL)
    small = manufacture.cost(profile, 100)["cost_per_gram_usd"]["point"]
    large = manufacture.cost(profile, 10000)["cost_per_gram_usd"]["point"]
    assert large < small


def test_longer_routes_cost_more():
    short = manufacture.assess(SHORT_ACHIRAL, 1000)["cost"]
    long_route = manufacture.assess(LONG_CHIRAL, 1000)["cost"]
    assert long_route["steps"] > short["steps"]
    assert (long_route["cost_per_gram_usd"]["point"]
            > short["cost_per_gram_usd"]["point"])


def test_overall_yield_follows_the_step_yield_assumption():
    profile = manufacture.read_structure(SHORT_ACHIRAL)
    base = manufacture.cost(profile, 1000)
    worse = manufacture.cost(profile, 1000,
                             overrides={"step_yield": 0.65})
    assert worse["overall_yield"] < base["overall_yield"]
    assert (worse["cost_per_gram_usd"]["point"]
            > base["cost_per_gram_usd"]["point"])


def test_every_band_is_ordered_and_positive():
    assessment = manufacture.assess(SHORT_ACHIRAL, 1000)
    for band in (assessment["cost"]["cost_per_gram_usd"],
                 assessment["cost"]["batch_total_usd"],
                 assessment["time"]["total_weeks"],
                 assessment["time"]["total_months"]):
        assert band_is_ordered(band)
        assert band["low"] > 0


def test_breakdown_adds_up_to_the_headline():
    assessment = manufacture.assess(SHORT_ACHIRAL, 1000)
    cost = assessment["cost"]
    total = sum(item["usd_per_gram"] for item in cost["breakdown"])
    assert abs(total - cost["cost_per_gram_usd"]["point"]) < 1.0


def test_fermentation_cost_depends_on_titre():
    profile = manufacture.read_structure(SHORT_ACHIRAL)
    poor = manufacture.cost(profile, 1000, "fermentation",
                            {"fermentation_titre_g_per_l": 0.1})
    good = manufacture.cost(profile, 1000, "fermentation",
                            {"fermentation_titre_g_per_l": 5.0})
    assert (good["cost_per_gram_usd"]["point"]
            < poor["cost_per_gram_usd"]["point"])


def test_biocatalysis_carries_a_one_off_development_cost():
    profile = manufacture.read_structure(SITAGLIPTIN)
    enzymatic = manufacture.cost(profile, 1000, "chemo_enzymatic")
    chemical = manufacture.cost(profile, 1000, "chemical_synthesis")
    assert enzymatic["one_off_development_usd"] > 0
    assert chemical["one_off_development_usd"] == 0


# ─── time behaviour ──────────────────────────────────────────────────────
def test_timeline_phases_sum_to_the_total():
    timing = manufacture.time_to_manufacture(
        manufacture.read_structure(SHORT_ACHIRAL), 1000)
    assert abs(sum(phase["weeks"] for phase in timing["phases"])
               - timing["total_weeks"]["point"]) < 0.05


def test_enzyme_route_takes_longer_to_develop():
    profile = manufacture.read_structure(SITAGLIPTIN)
    chemical = manufacture.time_to_manufacture(profile, 1000,
                                               "chemical_synthesis")
    enzymatic = manufacture.time_to_manufacture(profile, 1000,
                                                "chemo_enzymatic")
    assert (enzymatic["total_weeks"]["point"]
            > chemical["total_weeks"]["point"])


def test_fermentation_is_dominated_by_strain_work():
    profile = manufacture.read_structure(SHORT_ACHIRAL)
    timing = manufacture.time_to_manufacture(profile, 1000, "fermentation")
    longest = max(timing["phases"], key=lambda phase: phase["weeks"])
    assert "strain" in longest["phase"]


# ─── assumptions ─────────────────────────────────────────────────────────
def test_assumptions_table_is_complete_and_self_describing():
    table = manufacture.assumptions_table()
    assert len(table) == len(manufacture.ASSUMPTIONS)
    for row in table:
        assert row["unit"]
        assert row["note"]
        assert row["provenance"] in ("rule of thumb", "convention",
                                     "uncalibrated")
        assert row["min"] <= row["value"] <= row["max"]


def test_an_override_is_reported_as_overridden():
    table = manufacture.assumptions_table({"step_yield": 0.7})
    row = next(item for item in table if item["key"] == "step_yield")
    assert row["overridden"] and row["value"] == 0.7


def test_assessment_always_states_its_limitations():
    assessment = manufacture.assess(SHORT_ACHIRAL, 1000)
    assert len(assessment["limitations"]) >= 4
    assert any("retrosynthesis" in line for line in assessment["limitations"])
