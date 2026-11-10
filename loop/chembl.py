"""
chembl.py — what is already known about this target, fetched from ChEMBL.

The designer agent should not invent chemistry in a vacuum when a public
database holds measured activities against the same protein. Three queries
cover what it needs:

    target_search(name)     which ChEMBL target is this protein?
    known_actives(id)       the most potent measured binders, with pChEMBL
    analogues(smiles)       published molecules similar to one of ours

The agent calls these as tools and uses the results as design inspiration:
which scaffolds have worked, how potent the best published compounds are,
and whether a molecule it has just drawn is already known.

CACHING AND OFFLINE BEHAVIOUR

Every response is written to targets/<slug>/chembl_cache.json, keyed by the
request. A repeat query is served from there, which keeps a demo fast and
makes the offline mode genuinely offline rather than silently degraded. When
there is no cache entry and no network, the tool returns an explicit
`offline` error instead of an empty list — an agent told "no analogues
found" would draw the wrong conclusion from a network failure.

ATTRIBUTION

ChEMBL data is released by the EBI under CC-BY-SA 3.0. Anything shown in
the interface that came from here is labelled with its ChEMBL ID so it can
be looked up, and the licence is stated in the method notes.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
API = "https://www.ebi.ac.uk/chembl/api/data"
TIMEOUT = 20.0
USER_AGENT = "bioREACT-design-loop/1.0 (research use; contact via repository)"

# Similarity thresholds tried in turn. Dropping to 50% is deliberate: for a
# novel scaffold the useful answer is often "nothing above 60%", and that is
# worth knowing explicitly.
SIMILARITY_STEPS = (80, 70, 60, 50)
CACHE_TTL_S = 14 * 24 * 3600        # a fortnight; ChEMBL moves slowly


def _cache_path() -> Path:
    try:
        import target as tgt
        active = tgt.active_target()
        if active and active.get("slug"):
            return HERE / "targets" / active["slug"] / "chembl_cache.json"
    except Exception:
        pass
    return HERE / "chembl_cache.json"


def _load_cache() -> dict:
    p = _cache_path()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def _store(key: str, payload: dict) -> None:
    p = _cache_path()
    cache = _load_cache()
    cache[key] = {"fetched_at": time.time(), "payload": payload}
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cache, indent=2))


def _cached(key: str) -> dict | None:
    entry = _load_cache().get(key)
    if not entry:
        return None
    payload = dict(entry["payload"])
    payload["from_cache"] = True
    payload["cached_at"] = time.strftime("%Y-%m-%d %H:%M",
                                         time.localtime(entry["fetched_at"]))
    payload["stale"] = (time.time() - entry["fetched_at"]) > CACHE_TTL_S
    return payload


def _get(url: str) -> dict:
    request = urllib.request.Request(url, headers={
        "Accept": "application/json", "User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read())


def _fetch(key: str, url: str, parse, offline: bool = False) -> dict:
    """Cache-first fetch. `parse` turns the raw JSON into our payload."""
    hit = _cached(key)
    if hit is not None and (offline or not hit.get("stale")):
        return hit
    if offline:
        return {"ok": False, "offline": True, "error":
                "no cached ChEMBL result for this query and the tool is "
                "running offline — treat this as 'unknown', not as 'nothing "
                "found'"}
    try:
        payload = parse(_get(url))
    except urllib.error.URLError as e:
        if hit is not None:
            hit["note"] = f"network unavailable ({e.reason}); served from cache"
            return hit
        return {"ok": False, "error": f"ChEMBL unreachable: {e.reason}",
                "offline": True}
    except Exception as e:
        if hit is not None:
            hit["note"] = f"ChEMBL error ({type(e).__name__}); served from cache"
            return hit
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    payload["ok"] = True
    payload["from_cache"] = False
    payload["source"] = "ChEMBL REST API (EBI), CC-BY-SA 3.0"
    _store(key, payload)
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# THE THREE QUERIES
# ─────────────────────────────────────────────────────────────────────────────
def target_search(query: str, limit: int = 5, offline: bool = False) -> dict:
    q = urllib.parse.quote(query.strip())
    url = f"{API}/target/search.json?q={q}&limit={limit}"

    def parse(raw):
        targets = [{
            "chembl_id": t.get("target_chembl_id"),
            "name": t.get("pref_name"),
            "organism": t.get("organism"),
            "type": t.get("target_type"),
        } for t in raw.get("targets", [])]

        # ChEMBL's search ranks "EGFR/PPP1CA" — a protein-protein
        # interaction entry — above the EGFR protein itself. Taking the
        # first human hit would hand the designer activity data for the
        # wrong entity, so a single human protein wins over everything.
        def rank(entry: dict) -> tuple:
            human = entry["organism"] == "Homo sapiens"
            single = (entry["type"] or "").upper() == "SINGLE PROTEIN"
            return (0 if (human and single) else 1 if single else
                    2 if human else 3)

        ordered = sorted(targets, key=rank)
        return {"query": query, "targets": targets,
                "best": ordered[0] if ordered else None}

    return _fetch(f"target:{query.lower()}:{limit}", url, parse, offline)


def known_actives(chembl_target_id: str, limit: int = 8,
                  offline: bool = False) -> dict:
    """
    The most potent measured binders of this target.

    Only activities with a pChEMBL value are requested, which restricts the
    result to measurements ChEMBL could normalise onto a comparable scale.
    """
    url = (f"{API}/activity.json?target_chembl_id={chembl_target_id}"
           f"&standard_type__in=IC50,Ki,Kd,EC50"
           f"&pchembl_value__isnull=false"
           f"&order_by=-pchembl_value&limit={max(limit * 3, 20)}")

    def parse(raw):
        seen, compounds = set(), []
        for a in raw.get("activities", []):
            smiles = a.get("canonical_smiles")
            pchembl = a.get("pchembl_value")
            mol_id = a.get("molecule_chembl_id")
            if not smiles or not pchembl or mol_id in seen:
                continue
            seen.add(mol_id)
            p = float(pchembl)
            compounds.append({
                "chembl_id": mol_id,
                "name": a.get("molecule_pref_name") or mol_id,
                "smiles": smiles,
                "pchembl": round(p, 2),
                "assay_type": a.get("standard_type"),
                # A pChEMBL of 11 is 0.01 nM, which rounds to "0 nM" at
                # one decimal place and reads as a missing value. Keep
                # three significant figures instead.
                "potency_nm": float(f"{10 ** (9 - p):.3g}"),
                "assay_description": (a.get("assay_description") or "")[:160],
            })
            if len(compounds) >= limit:
                break
        return {"target_chembl_id": chembl_target_id, "compounds": compounds,
                "count": len(compounds)}

    return _fetch(f"actives:{chembl_target_id}:{limit}", url, parse, offline)


def analogues(smiles: str, limit: int = 6, offline: bool = False,
              thresholds: tuple[int, ...] = SIMILARITY_STEPS) -> dict:
    """
    Published molecules similar to `smiles`, by Tanimoto on ChEMBL's
    fingerprints. Tries each threshold until something comes back.
    """
    key = f"analogues:{smiles}:{limit}"
    hit = _cached(key)
    if hit is not None and (offline or not hit.get("stale")):
        return hit
    if offline:
        return {"ok": False, "offline": True, "error":
                "no cached analogue search for this molecule and the tool is "
                "running offline"}

    encoded = urllib.parse.quote(smiles.strip(), safe="")
    last_error = None
    for threshold in thresholds:
        url = f"{API}/similarity/{encoded}/{threshold}.json?limit={limit}"
        try:
            raw = _get(url)
        except urllib.error.HTTPError as e:
            # 404 here means "nothing at this threshold", not a failure
            if e.code == 404:
                continue
            last_error = f"HTTP {e.code}"
            continue
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
            continue

        molecules = []
        for m in raw.get("molecules", []):
            structures = m.get("molecule_structures") or {}
            molecules.append({
                "chembl_id": m.get("molecule_chembl_id"),
                "name": m.get("pref_name") or m.get("molecule_chembl_id"),
                "smiles": structures.get("canonical_smiles"),
                "similarity": round(float(m.get("similarity", 0)), 1),
                "max_phase": m.get("max_phase"),
            })
        if molecules:
            payload = {
                "ok": True, "query_smiles": smiles,
                "threshold_used": threshold,
                "molecules": molecules, "count": len(molecules),
                "from_cache": False,
                "source": "ChEMBL REST API (EBI), CC-BY-SA 3.0",
            }
            _store(key, payload)
            return payload

    payload = {
        "ok": True, "query_smiles": smiles, "molecules": [], "count": 0,
        "threshold_used": min(thresholds),
        "note": (f"no ChEMBL molecule within {min(thresholds)}% Tanimoto "
                 f"similarity — on this measure the scaffold is novel, "
                 f"which also means there is no published activity to learn "
                 f"from"),
        "from_cache": False,
        "source": "ChEMBL REST API (EBI), CC-BY-SA 3.0",
    }
    if last_error:
        payload["note"] += f" (last error: {last_error})"
    _store(key, payload)
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# AGENT-FACING SUMMARIES
# ─────────────────────────────────────────────────────────────────────────────
def summarise_actives(result: dict, max_show: int = 5) -> str:
    if not result.get("ok"):
        return f"ChEMBL unavailable: {result.get('error')}"
    compounds = result.get("compounds") or []
    if not compounds:
        return "No normalised activity data for this target in ChEMBL."
    lines = [f"{len(compounds)} published binders of this target, most "
             f"potent first (ChEMBL, CC-BY-SA 3.0):"]
    for c in compounds[:max_show]:
        potency = (f"{c['potency_nm'] * 1000:.3g} pM"
                   if c["potency_nm"] < 1 else f"{c['potency_nm']:g} nM")
        lines.append(f"  {c['name']} ({c['chembl_id']}) "
                     f"{c['assay_type']} {potency} "
                     f"(pChEMBL {c['pchembl']})")
        lines.append(f"      {c['smiles']}")
    lines.append("Use these as structural inspiration — what has been made "
                 "and measured against this protein — not as molecules to "
                 "resubmit.")
    return "\n".join(lines)


def resolve_target_id(name: str, offline: bool = False) -> str | None:
    """
    The ChEMBL id for a target name, remembered in the target's own config
    so the lookup happens once.
    """
    try:
        import target as tgt
        active = tgt.active_target() or {}
        if active.get("chembl_target_id"):
            return active["chembl_target_id"]
    except Exception:
        active = {}

    found = target_search(name, offline=offline)
    best = found.get("best") if found.get("ok") else None
    chembl_id = best.get("chembl_id") if best else None

    if chembl_id and active.get("slug"):
        try:
            config_path = HERE / "targets" / active["slug"] / "target.json"
            config = json.loads(config_path.read_text())
            config["chembl_target_id"] = chembl_id
            config["chembl_target_name"] = best.get("name")
            config_path.write_text(json.dumps(config, indent=2))
        except Exception:
            pass
    return chembl_id


if __name__ == "__main__":
    import sys

    name = sys.argv[1] if len(sys.argv) > 1 else "MRP1"
    found = target_search(name)
    print(json.dumps(found, indent=2)[:900])
    best = found.get("best") or {}
    if best.get("chembl_id"):
        print()
        print(summarise_actives(known_actives(best["chembl_id"], limit=5)))
    print()
    print(json.dumps(analogues(
        "CS(=O)(=O)c1cc(F)ccc1C(=O)N1CCN(CC1)c1ccc(Cc2ccccc2)cc1",
        limit=4), indent=2)[:900])
