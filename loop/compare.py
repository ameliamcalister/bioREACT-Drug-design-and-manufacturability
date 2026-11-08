"""
compare.py — the decision table.

The loop produces candidates. A researcher then has to answer one question:
**which of these do I actually make first?**

Scattered verdicts and rejection lists do not answer that. This turns every
candidate into an explicit set of pros and cons, ranked so the strongest makeable candidate
is the top row. It states the evidence and leaves the call to the chemist.

Deliberately NOT here: anything about cost or price per gram. Costing a
route is the process chemist's job, informed by the actual route, the scale
and supplier quotes — not something to guess from a SMILES string. What we
report is how demanding the synthesis looks, and we stop there.

Ranking: binding is what the molecule is for, so affinity leads — but only
among molecules that can actually be made. An unmakeable molecule is not a
better candidate than a makeable one, however well it docks, so every
`fail` sorts below every `pass` and `flag`.
"""
from __future__ import annotations

VERDICT_RANK = {"pass": 0, "flag": 1, "fail": 2}

RECOMMENDATION = {
    "make_first": ("MAKE FIRST",
                   "best binding among the molecules you can actually make"),
    "make":       ("MAKE",
                   "solid candidate, no blocking manufacturability concern"),
    "backup":     ("BACKUP",
                   "workable, but weaker binding or a route caveat"),
    "redesign":   ("REDESIGN",
                   "needs a structural change before it is worth making"),
    "drop":       ("DO NOT MAKE",
                   "cannot be made at a practical scale"),
}


def _pros(a: dict, ref_aff: float | None) -> list[str]:
    out = []
    m = a.get("metrics") or a.get("synthesisability", {}).get("metrics", {})
    aff = a.get("affinity")

    if aff is not None and ref_aff is not None and aff < ref_aff:
        out.append(f"binds better than the reference "
                   f"({aff:.2f} vs {ref_aff:.2f} kcal/mol)")
    elif aff is not None and aff <= -9.0:
        out.append(f"strong predicted binding ({aff:.2f} kcal/mol)")

    if a.get("verdict") == "pass":
        out.append("no manufacturability concerns flagged")

    sc = m.get("stereocentres")
    if sc == 0:
        out.append("achiral — no asymmetric synthesis or resolution needed")
    elif sc == 1:
        out.append("only one stereocentre")

    steps = a.get("estimated_steps")
    if steps is not None and 0 < steps <= 6:
        out.append(f"short estimated route (~{steps} steps)")

    sa = a.get("sa_score")
    if sa is not None and 0 < sa <= 2.5:
        out.append(f"low synthetic complexity (SA {sa})")

    if m.get("macrocycle_size") == 0 and (m.get("spiro_atoms") or 0) == 0:
        out.append("no macrocycle or spiro centre")

    rb = m.get("rotatable_bonds")
    if rb is not None and rb <= 6:
        out.append(f"rigid ({rb} rotatable bonds) — more reproducible docking")

    sd = a.get("affinity_sd")
    if sd is not None and sd <= 0.3:
        out.append(f"reproducible score (sd {sd:.2f} over "
                   f"{a.get('affinity_n', '?')} runs)")

    return out or ["no particular strengths stood out"]


def _cons(a: dict, ref_aff: float | None) -> list[str]:
    out = []
    aff = a.get("affinity")

    if aff is None:
        out.append("not docked — no binding estimate")
    elif ref_aff is not None and aff > ref_aff:
        out.append(f"binds worse than the reference "
                   f"({aff:.2f} vs {ref_aff:.2f} kcal/mol)")

    seen = set()
    for r in a.get("rejections", []):
        if r["criterion"] in seen:
            continue
        seen.add(r["criterion"])
        mark = "blocker" if r["level"] == "fail" else "caution"
        out.append(f"{mark}: {r['reason']}")

    for f in (a.get("synthesisability", {}).get("metrics", {}) and
              a.get("admet_flags", [])):
        out.append(f"property flag: {f}")

    sd = a.get("affinity_sd")
    if sd is not None and sd > 0.5:
        out.append(f"docking score is noisy (sd {sd:.2f}) — treat the "
                   f"ranking as approximate")

    return out or ["none identified"]


def _recommend(a: dict, rank: int, ref_aff: float | None) -> str:
    v = a.get("verdict")
    aff = a.get("affinity")
    if v == "fail":
        # Distinguish "hopeless" from "good molecule, fixable route".
        fatal = [r for r in a.get("rejections", []) if r["level"] == "fail"]
        soft = {"estimated_steps", "heavy_atoms", "rotatable_bonds"}
        if aff is not None and aff <= -9.5 and all(
                r["criterion"] in soft for r in fatal):
            return "redesign"
        return "drop"
    if rank == 0 and aff is not None:
        return "make_first"
    if v == "pass" and aff is not None and aff <= -9.0:
        return "make"
    return "backup"


def decision_table(assessed: list[dict], ref: dict | None = None) -> list[dict]:
    """
    Rank candidates and attach their pros and cons.

    `assessed` is a list of critics.assess() results with `affinity` added
    (and optionally `affinity_sd` / `affinity_n` from replicate docking).
    """
    ref = ref or {}
    ref_aff = ref.get("affinity")

    rows = sorted(
        assessed,
        key=lambda a: (
            VERDICT_RANK.get(a.get("verdict"), 3),
            a["affinity"] if a.get("affinity") is not None else 1e9,
        ),
    )

    out = []
    for i, a in enumerate(rows):
        m = a.get("metrics") or a.get("synthesisability", {}).get("metrics", {})
        key = _recommend(a, i, ref_aff)
        label, why = RECOMMENDATION[key]
        out.append({
            "rank": i + 1,
            "smiles": a["smiles"],
            "verdict": a.get("verdict"),
            "affinity": a.get("affinity"),
            "affinity_sd": a.get("affinity_sd"),
            "affinity_n": a.get("affinity_n"),
            "sa_score": a.get("sa_score"),
            "estimated_steps": a.get("estimated_steps"),
            "stereocentres": m.get("stereocentres"),
            "rotatable_bonds": m.get("rotatable_bonds"),
            "mw": m.get("mw"),
            "route_complexity": a.get("route_complexity"),
            "recommendation": key,
            "recommendation_label": label,
            "recommendation_why": why,
            "pros": _pros(a, ref_aff),
            "cons": _cons(a, ref_aff),
            "rationale": a.get("rationale", ""),
        })
    return out


# ─────────────────────────────────────────────────────────────────────────────
# TERMINAL RENDERING
# ─────────────────────────────────────────────────────────────────────────────
def render(table: list[dict], ref: dict | None = None, colour=None) -> str:
    C = colour or {k: "" for k in
                   ("b", "d", "r", "green", "yellow", "red", "cyan")}
    L = []
    L.append(f"{C['b']}WHICH ONE SHOULD YOU MAKE?{C['r']}")
    if ref and ref.get("affinity") is not None:
        L.append(f"{C['d']}reference {ref.get('name', 'ligand')} "
                 f"{ref['affinity']} kcal/mol · more negative binds better "
                 f"· steps and complexity are estimates{C['r']}")
    L.append("")

    head = (f"{'#':<3}{'critics':<8}{'affinity':>12}{'SA':>6}"
            f"{'steps':>7}{'chiral':>8}  {'route':<15}")
    L.append(f"{C['b']}{head}{C['r']}")
    L.append(C["d"] + "-" * 70 + C["r"])

    for row in table:
        aff = (f"{row['affinity']:.2f}" if row["affinity"] is not None
               else "n/a")
        if row.get("affinity_sd") is not None:
            aff += f"±{row['affinity_sd']:.2f}"
        vt = {"pass": C["green"], "flag": C["yellow"],
              "fail": C["red"]}.get(row["verdict"], "")
        L.append(f"{row['rank']:<3}{vt}{(row['verdict'] or '-'):<8}{C['r']}"
                 f"{aff:>12}{str(row['sa_score']):>6}"
                 f"{str(row['estimated_steps']):>7}"
                 f"{str(row['stereocentres']):>8}  "
                 f"{row['route_complexity'] or '-':<15}")
    L.append("")

    for row in table:
        vt = {"pass": C["green"], "flag": C["yellow"],
              "fail": C["red"]}.get(row["verdict"], "")
        L.append(f"{C['b']}[{row['rank']}]{C['r']} "
                 f"{vt}{(row['verdict'] or '').upper()}{C['r']}")
        L.append(f"    {C['d']}{row['smiles'][:70]}{C['r']}")
        for p in row["pros"]:
            L.append(f"    {C['green']}+{C['r']} {p}")
        for c in row["cons"]:
            L.append(f"    {C['red']}-{C['r']} {c}")
        L.append("")
    return "\n".join(L)


def to_csv(table: list[dict]) -> str:
    """For the slides, or to hand to a colleague."""
    import csv
    import io
    buf = io.StringIO()
    cols = ["rank", "smiles", "affinity",
            "affinity_sd", "affinity_n", "sa_score", "estimated_steps",
            "stereocentres", "rotatable_bonds", "mw", "route_complexity",
            "verdict"]
    w = csv.writer(buf)
    w.writerow(cols + ["pros", "cons"])
    for r in table:
        w.writerow([r.get(c, "") for c in cols] +
                   ["; ".join(r["pros"]), "; ".join(r["cons"])])
    return buf.getvalue()
