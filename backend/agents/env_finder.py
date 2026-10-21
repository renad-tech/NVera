"""Agent 2 - Environment Finder: searches every source in parallel and merges the candidates.

Sources (all free except Tavily):
  Tavily across Sketchfab, Poly Pizza, Poly Haven, OpenGameArt (1 credit) · Sketchfab search API
  · Poly Pizza · Poly Haven (CC0) · Smithsonian 3D · three.js index - open web as a last resort.

Priority: models NVera may download and edit come first. Sketchfab models are editable when
Objaverse has a copy (or when you run locally as the account owner); otherwise they are
view-only and get the fewest seats.

Round 2 - only if the judges found nothing good (see pipeline.py): broader queries.
"""

import logging
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from backend import config
from backend.sources import objaverse, polyhaven, polypizza, sketchfab, smithsonian, tavily_libraries, threejs, web
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

MAX_FOR_JUDGE = 9
ENOUGH = 4
# Seats in front of the judge, best first. Leftover seats go to the best remaining models.
QUOTAS = [
    ("polyhaven", 2),         # CC0, photoscanned, top quality
    ("sketchfab-editable", 3),  # via Objaverse (or your own token locally)
    ("polypizza", 2),
    ("smithsonian", 1),
    ("threejs", 1),
    ("web", 1),
    ("sketchfab-view", 1),    # view-only: lowest priority
]
# Models only Tavily found (natural-language web search) always get some seats at the table.
TAVILY_SEATS = 2


def _safe(fn: Callable[[str, Usage], list[dict]], query: str, usage: Usage) -> list[dict]:
    try:
        return fn(query, usage)
    except Exception:
        log.warning("source %s.%s failed for %r", fn.__module__, fn.__name__, query, exc_info=True)
        return []


def _run(jobs: list[tuple[Callable, str]], usage: Usage) -> list[dict]:
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        results = pool.map(lambda j: _safe(j[0], j[1], usage), jobs)
    return [c for batch in results for c in batch]


def _merge(into: dict[str, dict], new: list[dict], exclude: set[str]) -> None:
    for c in new:
        if c["id"] not in exclude:
            into.setdefault(c["id"], c)


def mark_editable(c: dict) -> dict:
    """Sketchfab models: editable locally (owner's token) or when Objaverse has the same model."""
    if c["source"] == "sketchfab" and "editable" not in c:
        c["via_objaverse"] = not config.SKETCHFAB_DOWNLOAD and objaverse.url(c["uid"]) is not None
        c["editable"] = config.SKETCHFAB_DOWNLOAD or c["via_objaverse"]
    return c


def _bucket(c: dict) -> str:
    if c["source"] == "sketchfab":
        return "sketchfab-editable" if c.get("editable") else "sketchfab-view"
    return c["source"]


GENERIC = {"and", "the", "with", "for", "environment", "scene", "model", "free", "pack", "asset"}


def _words(text: str) -> set[str]:
    return {w.rstrip("s") for w in re.findall(r"[a-z]+", text.lower()) if len(w) > 2 and w not in GENERIC}


def _select(candidates: list[dict], words: set[str], n: int = MAX_FOR_JUDGE) -> list[dict]:
    """Best mix for the judge: Tavily seats, then per-source quotas, then fill up.

    Inside each source, models whose name or tags match more of the search words go first
    (then popularity), and models that match none are left out when there are enough others.
    """
    candidates = [mark_editable(c) for c in candidates]

    def hits(c: dict) -> int:
        return len(words & _words(" ".join([c.get("name") or "", *(c.get("tags") or [])])))

    relevant = [c for c in candidates if hits(c)]
    if len(relevant) >= ENOUGH:
        candidates = relevant + [c for c in candidates if c.get("found_by") == "tavily" and c not in relevant]
    candidates.sort(key=lambda c: (-hits(c), -(c.get("likes") or 0)))

    by_bucket: dict[str, list[dict]] = {}
    for c in candidates:
        by_bucket.setdefault(_bucket(c), []).append(c)

    picked = [c for c in candidates if c.get("found_by") == "tavily"][:TAVILY_SEATS]
    for bucket, quota in QUOTAS:
        picked += [c for c in by_bucket.get(bucket, []) if c not in picked][:quota]
    rest = [c for c in candidates if c not in picked and _bucket(c) != "sketchfab-view"]
    return (picked + rest)[:n]


def find(scene: dict, usage: Usage, on_stage: Callable[[str], None], exclude: set[str] = frozenset(),
         use_tavily: bool = True) -> list[dict]:
    """`use_tavily=False` searches only the free libraries (used for each object of a scene)."""
    found: dict[str, dict] = {}
    query, alts = scene["search_query"], scene["alt_queries"]

    on_stage(f"Searching Poly Haven, Sketchfab, Poly Pizza, Smithsonian and three.js for '{query}'")
    _merge(found, _run([
        *([(tavily_libraries.search, query)] if use_tavily else []),  # Tavily across the libraries (1 credit)
        (polyhaven.search, query),         # free, CC0
        (sketchfab.search_api, query),     # free
        (polypizza.search, query),
        (smithsonian.search, query),
        (threejs.search, query),
    ], usage), exclude)

    # Long scene queries ("forest river mountain environment") often only match one part, so the
    # broader queries always run too. They only hit the free libraries, so they cost nothing.
    if alts:
        on_stage(f"Also searching: {', '.join(alts)}")
        jobs = [(fn, a) for a in alts for fn in (sketchfab.search_api, polypizza.search, polyhaven.search)]
        _merge(found, _run(jobs, usage), exclude)

    if len(found) < 2 and use_tavily:
        on_stage("Searching the open web")
        _merge(found, _run([(web.search, query)], usage), exclude)

    return _select(list(found.values()), _words(" ".join([query, *alts])))


def find_more(scene: dict, usage: Usage, on_stage: Callable[[str], None], exclude: set[str]) -> list[dict]:
    """Second round when round 1 was weak: broader queries, new models only."""
    alts = scene["alt_queries"] or [scene.get("subject") or scene["search_query"]]
    found: dict[str, dict] = {}
    on_stage(f"Results were weak - searching again: {', '.join(alts)}")
    jobs = [(fn, a) for a in alts for fn in (sketchfab.search_api, polypizza.search, polyhaven.search)]
    jobs.append((tavily_libraries.search, alts[0]))  # one Tavily credit
    _merge(found, _run(jobs, usage), exclude)
    return _select(list(found.values()), _words(" ".join(alts)), n=6)
