"""
The critics have to be right about molecules whose history we know, and
their rejections have to be usable: a complaint the designer cannot act on
is not feedback, it is noise. These tests pin both.
"""
from __future__ import annotations

import critics

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
# Paclitaxel: a marketed drug, but produced semi-synthetically from a
# plant precursor. De novo total synthesis is a famous multi-year effort,
# which is exactly what the critics are asked to predict against.
PACLITAXEL = (
    "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(c1ccccc1)NC(=O)"
    "c1ccccc1)O)O)OC(=O)c1ccccc1)(CO4)OC(C)=O)O)C)OC(C)=O"
)
ROUND_TWO_CANDIDATE = (
    "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(CNC(=O)c2ccc(F)cc2)cc1"
)


def test_simple_drug_passes_both_critics():
    assessment = critics.assess(ASPIRIN)
    assert assessment["verdict"] == "pass"
    assert assessment["manufacturable"] is True
    assert assessment["estimated_steps"] <= 4


def test_natural_product_is_rejected_with_a_named_blocker():
    assessment = critics.assess(PACLITAXEL)
    assert assessment["verdict"] == "fail"
    assert assessment["manufacturable"] is False
    blockers = [r["criterion"] for r in assessment["rejections"]
                if r["level"] == "fail"]
    assert blockers, "a failing molecule must name at least one blocker"


def test_every_rejection_is_actionable():
    """
    The feedback edge is the point of the project: each rejection has to
    carry the criterion, the value, the threshold it broke and a specific
    change. A vague suggestion would make the loop meaningless.
    """
    assessment = critics.assess(PACLITAXEL)
    assert assessment["rejections"]
    for rejection in assessment["rejections"]:
        for field in ("criterion", "value", "threshold", "level", "reason",
                      "suggest"):
            assert field in rejection, f"{field} missing from {rejection}"
        assert rejection["level"] in ("fail", "flag")
        assert len(rejection["suggest"]) > 20
        assert "simpler" not in rejection["suggest"].lower() or \
            "simplify the scaffold" in rejection["suggest"].lower()


def test_rejections_are_deduplicated_across_the_two_critics():
    """Both critics score sa_score and stereocentres; the designer should
    never be told the same thing twice."""
    assessment = critics.assess(PACLITAXEL)
    seen = [(r["criterion"], str(r["value"])) for r in assessment["rejections"]]
    assert len(seen) == len(set(seen))


def test_failures_are_listed_before_flags():
    assessment = critics.assess(PACLITAXEL)
    levels = [r["level"] for r in assessment["rejections"]]
    assert levels == sorted(levels, key=lambda level: 0 if level == "fail" else 1)


def test_invalid_smiles_fails_without_raising():
    assessment = critics.assess("not a molecule")
    assert assessment["verdict"] == "fail"
    assert assessment["rejections"][0]["criterion"] == "validity"


def test_step_estimate_grows_with_stereocentres():
    simple = critics.descriptors(ROUND_TWO_CANDIDATE)
    chiral = critics.descriptors(PACLITAXEL)
    assert critics.estimate_steps(chiral) > critics.estimate_steps(simple)


def test_rubric_thresholds_are_ordered():
    """flag_above below fail_above for every criterion, or the rubric would
    reject before it warns."""
    for criterion, (flag_at, fail_at) in critics.RUBRIC.items():
        assert flag_at <= fail_at, criterion
