"""
The agents, without calling an API.

The important property is the one that keeps the figures honest: an agent
cannot report a cost or a duration it did not obtain from a tool. These
tests drive the tool layer directly and check that the submission is
refused when that rule is broken, that the deterministic fallback produces
the same shape, and that the ranking puts an unmakeable molecule last.
"""
from __future__ import annotations

import manufacture
import manufacture_agent as agents

SHORT_ACHIRAL = (
    "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(CNC(=O)c2ccc(F)cc2)cc1"
)
LONG_CHIRAL = (
    "CS(=O)(=O)c1cc2ccc(F)cc2cc1SC(=O)CCNc1ccc(C(C)[C@@H]2CCCC[C@H]2NC(C)"
    "c2ccc3ccccc3c2)cc1"
)


def tools(smiles: str = SHORT_ACHIRAL, scale: float = 1000.0) -> agents.Tools:
    return agents.Tools(smiles, scale, None)


# ─── the rule that keeps the numbers honest ──────────────────────────────
def test_submission_is_refused_before_the_route_is_costed():
    box = tools()
    result = box.run("submit_assessment", {
        "route": "chemical_synthesis",
        "justification": "it looks fine",
        "risks": ["one", "two"],
        "headline": "cheap and quick",
    })
    assert "error" in result
    assert "estimate_cost" in result["error"]
    assert box.submission is None


def test_submission_is_refused_before_the_route_is_timed():
    box = tools()
    box.run("estimate_cost", {"route": "chemical_synthesis"})
    result = box.run("submit_assessment", {
        "route": "chemical_synthesis",
        "justification": "costed but not timed",
        "risks": ["one", "two"],
        "headline": "…",
    })
    assert "error" in result and "estimate_time" in result["error"]


def test_submission_requires_real_risks():
    box = tools()
    box.run("estimate_cost", {"route": "chemical_synthesis"})
    box.run("estimate_time", {"route": "chemical_synthesis"})
    result = box.run("submit_assessment", {
        "route": "chemical_synthesis",
        "justification": "…",
        "risks": ["only one"],
        "headline": "…",
    })
    assert "error" in result


def test_a_complete_submission_is_accepted():
    box = tools()
    box.run("estimate_cost", {"route": "chemical_synthesis"})
    box.run("estimate_time", {"route": "chemical_synthesis"})
    result = box.run("submit_assessment", {
        "route": "chemical_synthesis",
        "justification": "short achiral route from commercial building blocks",
        "risks": ["palladium removal", "crystallinity of the final amide"],
        "headline": "make it by ordinary synthesis",
    })
    assert result.get("accepted") is True
    assert box.submission["route"] == "chemical_synthesis"


def test_an_unknown_route_is_rejected():
    box = tools()
    assert "error" in box.run("estimate_cost", {"route": "alchemy"})


def test_tools_never_raise_on_a_bad_input():
    box = tools()
    assert "error" in box.run("no_such_tool", {})


# ─── the deterministic path ──────────────────────────────────────────────
def test_rule_based_assessment_has_the_same_shape_as_an_agent_one():
    assessment = agents.assess_deterministically(SHORT_ACHIRAL, 1000)
    assert assessment["mode"] == "rule_based"
    for field in ("route", "cost", "time", "agent", "limitations", "verdict"):
        assert field in assessment
    for field in ("headline", "justification", "risks",
                  "redesign_recommended"):
        assert field in assessment["agent"]
    assert len(assessment["agent"]["risks"]) >= 2


def test_rule_based_assessment_flags_a_molecule_needing_redesign():
    assessment = agents.assess_deterministically(LONG_CHIRAL, 1000)
    assert assessment["verdict"] == "redesign_required"
    assert assessment["agent"]["redesign_recommended"] is True


# ─── the shortlist ───────────────────────────────────────────────────────
def test_shortlist_ranks_makeable_candidates_above_unmakeable_ones():
    report = agents.assess_shortlist(
        [{"smiles": LONG_CHIRAL, "affinity": -12.9},
         {"smiles": SHORT_ACHIRAL, "affinity": -9.5}],
        scale_g=1000, use_agent=False)
    assert report["ok"]
    assert [row["rank"] for row in report["candidates"]] == [1, 2]
    # the molecule that docks best cannot be made, so it sorts last
    assert report["candidates"][0]["smiles"] == SHORT_ACHIRAL
    assert report["candidates"][-1]["verdict"] == "redesign_required"


def test_shortlist_carries_its_assumptions_and_method():
    report = agents.assess_shortlist(
        [{"smiles": SHORT_ACHIRAL}], scale_g=100, use_agent=False)
    assert report["scale_label"] == "100 g"
    assert len(report["assumptions"]) == len(manufacture.ASSUMPTIONS)
    assert "uncalibrated" in report["method"]


def test_overrides_reach_the_figures():
    cheap = agents.assess_shortlist(
        [{"smiles": SHORT_ACHIRAL}], scale_g=1000, use_agent=False,
        overrides={"operator_day_cost": 900})
    dear = agents.assess_shortlist(
        [{"smiles": SHORT_ACHIRAL}], scale_g=1000, use_agent=False,
        overrides={"operator_day_cost": 3000})
    assert (cheap["candidates"][0]["cost"]["cost_per_gram_usd"]["point"]
            < dear["candidates"][0]["cost"]["cost_per_gram_usd"]["point"])


def test_progress_is_reported_while_the_shortlist_is_assessed():
    seen = []
    agents.assess_shortlist(
        [{"smiles": SHORT_ACHIRAL}, {"smiles": LONG_CHIRAL}],
        scale_g=1000, use_agent=False,
        on_update=lambda report: seen.append(
            (report["status"], report["progress"]["done"])))
    assert seen[0] == ("running", 0)
    assert seen[-1][0] == "finished"
    assert seen[-1][1] == 2
