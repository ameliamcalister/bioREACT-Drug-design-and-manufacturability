"""
The property screen and the cavity analysis.

Both of these are places where it would be easy to overclaim — a rule set
presented as a prediction, or a grid artefact presented as a pocket — so
the tests check the guard rails as much as the arithmetic.
"""
from __future__ import annotations

import json
from pathlib import Path

import admet
import pocket
import poses

HERE = Path(__file__).resolve().parent.parent

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
MK571 = "CC(C)(C)c1ccc(cc1)/C=C/c1cc(ccn1)CSC(CC(=O)O)SCCc1ccccc1"
CANDIDATE = (
    "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(CNC(=O)c2ccc(F)cc2)cc1"
)


# ─── property screen ─────────────────────────────────────────────────────
def test_aspirin_is_within_every_rule_set():
    result = admet.screen(ASPIRIN)
    assert result["ok"]
    assert result["rule_sets_broken"] == []


def test_a_large_lipophilic_molecule_breaks_several_rule_sets():
    result = admet.screen(MK571)
    assert len(result["rule_sets_broken"]) >= 2
    assert result["verdict"] == "fail"


def test_a_structural_alert_alone_does_not_fail_a_molecule():
    """
    PAINS and Brenk are deliberately broad lists — several of their
    patterns match marketed drugs — so an alert is advisory. Aspirin trips
    the Brenk phenol-ester pattern and must not be failed for it.
    """
    result = admet.screen(ASPIRIN)
    assert result["alerts"], "aspirin is expected to trip a Brenk pattern"
    assert result["verdict"] == "flag"


def test_every_rule_set_cites_its_source():
    result = admet.screen(CANDIDATE)
    for rule_set in result["rule_sets"]:
        assert rule_set["citation"]
        assert rule_set["checks"]


def test_proxies_are_labelled_as_expectations_not_predictions():
    result = admet.screen(CANDIDATE)
    assert len(result["proxies"]) == 3
    for proxy in result["proxies"]:
        assert proxy["basis"]
    assert "no trained admet model" in result["disclaimer"].lower()


def test_invalid_smiles_is_handled():
    result = admet.screen("@@@not@@@")
    assert result["ok"] is False
    assert result["verdict"] == "fail"


# ─── cavity analysis ─────────────────────────────────────────────────────
def _committed_pose() -> tuple[str, dict] | tuple[None, None]:
    """A molecule from the committed MRP1 cache whose pose is on disk."""
    cache_file = HERE / "targets" / "mrp1" / "dock_cache.json"
    if not cache_file.exists():
        return None, None
    cache = json.loads(cache_file.read_text())
    for smiles, record in cache.items():
        pose = poses.pose_for(smiles)
        if pose.get("ok"):
            return smiles, pose
    return None, None


def test_voids_are_found_beside_a_committed_pose():
    smiles, pose = _committed_pose()
    assert smiles, "the repository should ship at least one usable pose"

    target_config = json.loads(
        (HERE / "targets" / "mrp1" / "target.json").read_text())
    result = pocket.find_voids(
        HERE / "targets" / "mrp1" / "receptor.pdbqt",
        pose["pdb"],
        target_config["grid"],
    )
    assert result["ok"]
    for region in result["voids"]:
        assert region["volume_a3"] >= pocket.MIN_VOLUME
        assert region["lining_residues"]
        assert region["character"] in ("hydrophobic", "polar", "mixed")
        assert region["suggested_chemistry"]
        # a region has to be reachable from the molecule to be useful
        assert region["gap_to_ligand_a"] <= pocket.SHELL


def test_voids_are_reported_largest_first():
    smiles, pose = _committed_pose()
    target_config = json.loads(
        (HERE / "targets" / "mrp1" / "target.json").read_text())
    result = pocket.find_voids(
        HERE / "targets" / "mrp1" / "receptor.pdbqt",
        pose["pdb"],
        target_config["grid"],
    )
    volumes = [region["volume_a3"] for region in result["voids"]]
    assert volumes == sorted(volumes, reverse=True)


def test_the_result_states_its_own_caveat():
    smiles, pose = _committed_pose()
    target_config = json.loads(
        (HERE / "targets" / "mrp1" / "target.json").read_text())
    result = pocket.find_voids(
        HERE / "targets" / "mrp1" / "receptor.pdbqt",
        pose["pdb"],
        target_config["grid"],
    )
    assert "no energy term" in result["caveat"]


def test_pdbqt_conversion_keeps_every_binding_mode():
    smiles, pose = _committed_pose()
    assert pose["pdb"].count("MODEL") == pose["pdb"].count("ENDMDL")
    assert len(pose["mode_scores"]) >= 1


def test_a_molecule_that_was_never_docked_says_so():
    result = poses.pose_for("CCO")
    assert result["ok"] is False
    assert "docked" in result["error"]
