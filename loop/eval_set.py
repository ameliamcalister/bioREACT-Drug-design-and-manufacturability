"""
eval_set.py — ground truth for the critics, and the confusion matrix.

THE QUESTION THIS ANSWERS: "how do you know your critic is right?"

What the critics claim to predict, stated precisely so the labels are
defensible:

    Could a medicinal chemistry team make this de novo, at gram scale,
    in a short campaign using commercial building blocks?

That is deliberately narrower than "does this molecule exist". Paclitaxel is
a marketed drug, but it is produced semi-synthetically from a plant-derived
precursor — a de novo total synthesis is a famous multi-year effort, not a
med-chem campaign. So it is labelled NOT makeable here, and that is the
honest label for what the critic is actually predicting. Say this out loud
in the pitch; a scientist judge will respect the distinction and will catch
you if you blur it.

Labels:
    True  -> makeable de novo at gram scale (expect verdict pass/flag)
    False -> not makeable this way (expect verdict fail)

AMBIGUOUS entries are listed separately and excluded from the headline
matrix. Reporting them honestly is better than hiding them.

Run:  python3 eval_set.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import critics

HERE = Path(__file__).resolve().parent

C = {"b": "\033[1m", "d": "\033[2m", "r": "\033[0m",
     "green": "\033[32m", "red": "\033[31m", "yellow": "\033[33m"}
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    C = {k: "" for k in C}


# ─────────────────────────────────────────────────────────────────────────────
# POSITIVES — small-molecule drugs made at scale by ordinary synthesis
# ─────────────────────────────────────────────────────────────────────────────
MAKEABLE = [
    ("aspirin", "CC(=O)Oc1ccccc1C(=O)O",
     "2-step acetylation, tonne scale"),
    ("ibuprofen", "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
     "BHC process, 3 steps, tonne scale"),
    ("paracetamol", "CC(=O)Nc1ccc(O)cc1",
     "2 steps from aminophenol"),
    ("metformin", "CN(C)C(=N)NC(=N)N",
     "1-step, tonne scale"),
    ("celecoxib", "Cc1ccc(cc1)-c1cc(nn1-c1ccc(cc1)S(=O)(=O)N)C(F)(F)F",
     "pyrazole condensation, 3 steps"),
    ("sildenafil", "CCCc1nn(C)c2c1nc([nH]c2=O)-c1cc(ccc1OCC)S(=O)(=O)N1CCN(C)CC1",
     "Pfizer commercial route, ~5 steps"),
    ("losartan", "CCCCc1nc(Cl)c(CO)n1Cc1ccc(cc1)-c1ccccc1-c1nnn[nH]1",
     "biaryl coupling, scaled"),
    ("gefitinib", "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1",
     "quinazoline, scaled"),
    ("imatinib", "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(n1)-c1cccnc1",
     "amide + SNAr, scaled"),
    ("sulfasalazine", "OC(=O)c1cc(ccc1O)/N=N/c1ccc(cc1)S(=O)(=O)Nc1ccccn1",
     "azo coupling, scaled"),
    # MRP1 / efflux-transporter relevant, which matters for your target
    ("MK-571 (MRP1 inhibitor)",
     "CC(C)(C)c1ccc(cc1)/C=C/c1cc(ccn1)CSC(CC(=O)O)SCCc1ccccc1",
     "the reference MRP1 inhibitor; made at research scale"),
    ("probenecid (MRP inhibitor)", "CCCN(CCC)S(=O)(=O)c1ccc(cc1)C(=O)O",
     "1-step sulfonamide, scaled"),
    ("verapamil (efflux inhibitor)",
     "COc1ccc(cc1OC)CCN(C)CCCC(C#N)(C(C)C)c1ccc(OC)c(OC)c1",
     "scaled, one stereocentre sold as racemate"),
]

# ─────────────────────────────────────────────────────────────────────────────
# NEGATIVES — not makeable de novo at gram scale in a med-chem campaign
# ─────────────────────────────────────────────────────────────────────────────
NOT_MAKEABLE = [
    ("paclitaxel", "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(c1ccccc1)NC(=O)c1ccccc1)O)O)OC(=O)c1ccccc1)(CO4)OC(C)=O)O)C)OC(C)=O",
     "11 stereocentres; marketed but semi-synthetic, not de novo"),
    ("erythromycin", "CCC1OC(=O)C(C)C(OC2CC(C)(O)C(O)C(C)O2)C(C)C(OC2OC(C)CC(N(C)C)C2O)C(C)(O)CC(C)C(=O)C(C)C(O)C1C",
     "14-membered macrolide, fermentation product"),
    ("rapamycin", "CC1CCC2CC(C(=CC=CC=CC(CC(C(=O)C(C(C(=CC(C(=O)CC(OC(=O)C3CCCCN3C(=O)C(=O)C1(O)O2)C(C)CC4CCC(O)C(C4)OC)C)C)O)OC)C)C)C)OC",
     "31-membered macrocycle, 15 stereocentres, fermentation"),
    ("cyclosporin A", "CCC1NC(=O)C(C(O)C(C)CC=CC)N(C)C(=O)C(C(C)C)N(C)C(=O)C(CC(C)C)N(C)C(=O)C(CC(C)C)NC(=O)C(C)NC(=O)C(C)N(C)C(=O)C(CC(C)C)N(C)C(=O)C(C(C)C)NC(=O)C(CC(C)C)N(C)C(=O)C1C",
     "cyclic undecapeptide, fermentation"),
    ("amphotericin B", "CC1C=CC=CC=CC=CC=CC=CC1OC1CC(O)C(N)C(C)O1",
     "polyene macrolide, fermentation (simplified SMILES)"),
    ("vinblastine", "CCC1(O)CC2CN(CCc3c([nH]c4ccccc34)C(C(=O)OC)(c3cc4c(cc3OC)N(C)C3C(O)(C(=O)OC)C(OC(C)=O)C5(CC)C=CCN6CCC43C56)C2)C1",
     "8 stereocentres, two fused alkaloid halves, plant extraction"),
    ("eribulin-like fragment", "CC1CC2OC3CC4OC5CC(O)C6OC(CC7OC(CC8OC(C)C(O)C8)CC7)CC6OC5CC4OC3CC2OC1",
     "polyether ladder, many stereocentres"),
    ("spiro/macrocycle generative output",
     "O=C1NCCOCCOCCOCCNC(=O)C2(CC2)c2ccc(cc2)C1",
     "21-membered macrocycle plus spirocyclopropane"),
    ("over-decorated generative output",
     "CC(C)(C)c1ccc(NC2CCCCC2C(=O)CCSC(SCCc2ccc(F)c(S(=O)(=O)O)c2C(=O)O)c2ccc3ccccc3c2/C=C/C2=CC=CC3=CC=CC4=C(C(=O)O)C=CC(=C23)C4)cc1",
     "from your own runs.db: 4 fused aromatics, sulfonic acid, 2 acids"),
    ("selenium/silicon exotic",
     "C[Si](C)(C)c1ccc(cc1)-c1ccc(cc1)[Se]c1ccc(cc1)B1OC(C)(C)C(C)(C)O1",
     "selenoether plus silyl plus boronate — no building-block supply chain"),
]

# ─────────────────────────────────────────────────────────────────────────────
# HARD TIER — the set that actually tests the rubric.
#
# The easy set above scores 100%, and you should say so AND say why that is
# not impressive: marketed aspirin-likes versus fermentation-derived
# macrolides are separable on molecular weight alone. A judge will spot that.
#
# These are the real test: marketed drugs that are genuinely hard to make
# (so the critic is tempted to reject them), and compounds that look
# tractable but are not. Expect misses here. Report them.
# ─────────────────────────────────────────────────────────────────────────────
HARD_MAKEABLE = [
    ("montelukast", "CC(C)(O)c1ccccc1CCC(SCC1(CC(=O)O)CC1)c1cccc(/C=C/c2ccc3ccccc3n2)c1",
     "MRP1-adjacent leukotriene antagonist, marketed at scale, 1 stereocentre"),
    ("sitagliptin", "N[C@@H](CC(=O)N1CCn2c(nnc2C(F)(F)F)C1)Cc1cc(F)c(F)cc1F",
     "marketed; asymmetric hydrogenation at scale"),
    ("oseltamivir", "CCOC(=O)C1=C[C@@H](OC(CC)CC)[C@H](NC(C)=O)[C@@H](N)C1",
     "marketed at scale despite 3 contiguous stereocentres"),
    ("ezetimibe", "O[C@H](CC[C@H]1N(c2ccc(F)cc2)C(=O)[C@@H]1c1ccc(O)cc1)c1ccc(F)cc1",
     "marketed; beta-lactam plus 3 stereocentres"),
    ("dolutegravir", "C[C@H]1CCO[C@@H]2N1C(=O)C1=C(O)C(=O)C=CN1C2C(=O)NCc1ccc(F)cc1F",
     "marketed; fused tricyclic, 2 stereocentres"),
    ("sofosbuvir", "CC(C)OC(=O)[C@H](C)N[P](=O)(OC[C@H]1O[C@](C)([C@@H](O)[C@@H]1F)n1ccc(=O)[nH]c1=O)Oc1ccccc1",
     "marketed; phosphoramidate prodrug, 6 stereocentres"),
]

HARD_NOT_MAKEABLE = [
    ("mid-size generative output (runs.db)",
     "O=C1NC(=O)c2[nH]c(-c3cccc(CCC(=O)NCc4ccc(C(C)[C@@H]5CCCC[C@H]5N)cc4)c3)cc2N1",
     "from your own runs.db: docks at -10.5 but fused heterocycle plus "
     "2 stereocentres plus a long sequence"),
    ("thioester generative output (runs.db)",
     "O=C(O)c1cc2ccc(F)cc2cc1SC(=S)CCNC1CCCCC1Nc1ccc(C(C)C)cc1",
     "from your own runs.db: dithioester is not isolable at scale"),
    ("strained bicyclic",
     "O=C(O)C1(c2ccc(Cl)cc2)C2CC3CC(C2)CC13",
     "looks small, but the bridged adamantane-like core is specialist"),
    ("polyfluorinated dense core",
     "FC1(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C1(F)C(=O)Nc1ccc(cc1)S(=O)(=O)N",
     "perfluorocyclohexyl building blocks are not routinely available"),
    ("four contiguous stereocentres, small",
     "C[C@H](O)[C@@H](N)[C@H](O)[C@@H](C)C(=O)Nc1ccccc1",
     "only 18 heavy atoms, but 4 contiguous stereocentres"),
]

AMBIGUOUS = [
    ("atorvastatin",
     "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CC[C@@H](O)C[C@@H](O)CC(=O)O",
     True, "marketed at tonne scale, but 2 stereocentres and a long route — "
           "sits right on the rubric boundary"),
    ("artemisinin",
     "CC1CCC2C(C)C(=O)OC3OC4(C)CCC1C32OO4",
     False, "semi-synthetic from plant/yeast precursor; endoperoxide and "
            "5 stereocentres make de novo impractical"),
]


# The operating point: does a `flag` verdict count as makeable?
#   "lenient" -> pass + flag are makeable (default; progress anything not fatal)
#   "strict"  -> only pass is makeable (reject anything with any flag)
# This is a policy dial, not a rubric change, and it is the right answer to
# "how do you know your critic is right": you choose where to sit on it
# depending on whether a false pass or a false reject costs you more.
POLICY = os.environ.get("CRITIC_POLICY", "lenient").lower()


def classify(smiles: str, policy: str = "") -> tuple[bool, dict]:
    """Our prediction: True = critics say makeable."""
    a = critics.assess(smiles)
    pol = policy or POLICY
    makeable = (a["verdict"] == "pass" if pol == "strict"
                else a["verdict"] != "fail")
    return makeable, a


def operating_points() -> None:
    """
    Score both policies on both tiers. A false pass progresses a molecule
    nobody can make (wastes a campaign); a false reject bins a real drug
    (costs an opportunity). The dial trades one for the other.
    """
    print(f"\n{C['b']}OPERATING POINT — where to put the flag boundary{C['r']}")
    print(f"  {C['d']}false pass   = we progress an unmakeable molecule")
    print(f"  false reject = we bin a molecule that could have been made{C['r']}\n")
    print(f"  {'policy':<10}{'tier':<8}{'accuracy':>10}{'false pass':>13}"
          f"{'false reject':>14}")
    print(f"  {'-' * 55}")
    for pol in ("lenient", "strict"):
        for tier in ("easy", "hard"):
            pos, neg = TIERS[tier]
            cases = ([(s, True) for _, s, _ in pos] +
                     [(s, False) for _, s, _ in neg])
            fp = fn = ok = 0
            for smiles, truth in cases:
                pred, _ = classify(smiles, pol)
                if pred == truth:
                    ok += 1
                elif pred and not truth:
                    fp += 1
                else:
                    fn += 1
            acc = ok / len(cases)
            print(f"  {pol:<10}{tier:<8}{acc:>9.0%}{fp:>13}{fn:>14}")
    print(f"\n  {C['yellow']}Pick one and justify it. For a design loop, "
          f"'strict' is usually right:{C['r']}")
    print(f"  {C['yellow']}a false pass wastes a synthesis campaign, a false "
          f"reject just costs one idea{C['r']}")
    print(f"  {C['yellow']}and the designer can generate more ideas "
          f"cheaply.{C['r']}")


TIERS = {
    "easy": (MAKEABLE, NOT_MAKEABLE),
    "hard": (HARD_MAKEABLE, HARD_NOT_MAKEABLE),
}


def run_eval(verbose: bool = True, tier: str = "easy") -> dict:
    pos, neg = TIERS[tier]
    cases = ([(n, s, True, w) for n, s, w in pos] +
             [(n, s, False, w) for n, s, w in neg])

    tp = tn = fp = fn = 0
    misses = []
    rows = []

    for name, smiles, truth, why in cases:
        pred, a = classify(smiles)
        correct = pred == truth
        if truth and pred:
            tp += 1
        elif not truth and not pred:
            tn += 1
        elif not truth and pred:
            fp += 1          # we said makeable, it is not — the dangerous one
        else:
            fn += 1          # we rejected something real — over-strict

        rows.append({
            "name": name, "smiles": smiles, "truth": truth,
            "predicted": pred, "correct": correct,
            "verdict": a["verdict"], "sa_score": a["sa_score"],
            "estimated_steps": a["estimated_steps"],
            "route_complexity": a["route_complexity"], "note": why,
            "top_rejection": (a["rejections"][0]["criterion"]
                              if a["rejections"] else None),
        })
        if not correct:
            misses.append(rows[-1])

        if verbose:
            mark = f"{C['green']}✓{C['r']}" if correct else f"{C['red']}✗{C['r']}"
            exp = "makeable" if truth else "NOT makeable"
            print(f"  {mark} {name:<34} truth={exp:<13} "
                  f"verdict={a['verdict']:<5} SA={a['sa_score']:<5} "
                  f"~{a['estimated_steps']:>2} steps")

    n = len(cases)
    correct = tp + tn
    accuracy = correct / n if n else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0

    if verbose:
        print(f"\n{C['b']}CONFUSION MATRIX{C['r']}  (n={n})")
        print(f"                        {C['d']}predicted{C['r']}")
        print("                   makeable    not makeable")
        print(f"  {C['d']}truth{C['r']} makeable        {tp:>4}        {fn:>8}")
        print(f"        not makeable    {fp:>4}        {tn:>8}")
        print(f"\n  accuracy  {correct}/{n} = {accuracy:.0%}")
        print(f"  precision {precision:.0%}  {C['d']}(of those we passed, how "
              f"many are really makeable){C['r']}")
        print(f"  recall    {recall:.0%}  {C['d']}(of real drugs, how many we "
              f"let through){C['r']}")

        if misses:
            print(f"\n{C['b']}{C['yellow']}THE {len(misses)} MISSES — report "
                  f"these honestly{C['r']}")
            for m in misses:
                kind = ("FALSE PASS (worse: we would progress an unmakeable "
                        "molecule)" if m["truth"] is False
                        else "FALSE REJECT (over-strict: we would bin a real drug)")
                print(f"  {C['red']}{m['name']}{C['r']} — {kind}")
                print(f"    {C['d']}{m['note']}{C['r']}")
                print(f"    verdict={m['verdict']} SA={m['sa_score']} "
                      f"~{m['estimated_steps']} steps "
                      f"top_rejection={m['top_rejection']}")
        else:
            print(f"\n  {C['green']}no misses on this set{C['r']}")

    if verbose and tier == "easy":
        print(f"\n{C['b']}AMBIGUOUS — excluded from the matrices{C['r']}")
        for name, smiles, truth, why in AMBIGUOUS:
            pred, a = classify(smiles)
            agree = "agrees" if pred == truth else "disagrees"
            print(f"  {name:<20} verdict={a['verdict']:<5} "
                  f"~{a['estimated_steps']:>2} steps  ({agree} with our label)")
            print(f"    {C['d']}{why}{C['r']}")

    return {
        "tier": tier,
        "n": n, "tp": tp, "tn": tn, "fp": fp, "fn": fn,
        "accuracy": round(accuracy, 3),
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "misses": misses,
        "rows": rows,
    }


def run_all(verbose: bool = True) -> dict:
    print(f"{C['b']}CRITIC EVALUATION{C['r']}")
    print(f"{C['d']}predicting: makeable de novo, gram scale, short "
          f"med-chem campaign{C['r']}")

    results = {}
    for tier, label in (
        ("easy", "TIER 1 — classic drugs vs natural products"),
        ("hard", "TIER 2 — HARD: complex marketed drugs vs plausible-looking rejects"),
    ):
        print(f"\n{C['b']}{'═' * 72}{C['r']}")
        print(f"{C['b']}{label}{C['r']}")
        print(f"{C['b']}{'═' * 72}{C['r']}")
        results[tier] = run_eval(verbose, tier)

    e, h = results["easy"], results["hard"]
    total_n = e["n"] + h["n"]
    total_ok = e["tp"] + e["tn"] + h["tp"] + h["tn"]

    print(f"\n{C['b']}{'═' * 72}{C['r']}")
    print(f"{C['b']}HEADLINE{C['r']}")
    print(f"  tier 1 (easy): {e['tp'] + e['tn']}/{e['n']} = {e['accuracy']:.0%}")
    print(f"  tier 2 (hard): {h['tp'] + h['tn']}/{h['n']} = {h['accuracy']:.0%}")
    print(f"  combined     : {total_ok}/{total_n} = {total_ok / total_n:.0%}")
    print(f"  policy       : {POLICY} (flag counts as "
          f"{'reject' if POLICY == 'strict' else 'makeable'})")
    print(f"\n  {C['yellow']}Say this out loud: tier 1 at 100% is not "
          f"impressive — marketed aspirin-likes versus fermentation-derived")
    print(f"  macrolides separate on molecular weight alone. Tier 2 is the "
          f"honest number.{C['r']}")

    operating_points()

    out = {
        "tiers": results,
        "combined": {"n": total_n, "correct": total_ok,
                     "accuracy": round(total_ok / total_n, 3)},
    }
    (HERE / "eval_results.json").write_text(json.dumps(out, indent=2))
    print(f"\n  {C['d']}written: {HERE / 'eval_results.json'}{C['r']}")
    return out


if __name__ == "__main__":
    run_all()
