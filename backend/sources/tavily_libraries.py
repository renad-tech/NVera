"""Source: Tavily across several 3D libraries at once (1 credit).

Tavily's web search understands natural language and finds model pages the libraries' own
keyword search misses. Every hit is turned into a real, downloadable candidate:
  sketchfab.com/3d-models/...-<uid>  -> Sketchfab (verified downloadable)
  poly.pizza/m/<id>                -> Poly Pizza model API
  polyhaven.com/a/<id>             -> Poly Haven (CC0)
Candidates are tagged found_by="tavily" so the app can credit Tavily for them.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor

from backend.sources import polyhaven, polypizza, sketchfab
from backend.utils import tavily
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

LIBRARIES = ["sketchfab.com", "poly.pizza", "polyhaven.com", "opengameart.org"]
SKETCHFAB_RE = re.compile(r"sketchfab\.com/3d-models/[^/?#]*-([0-9a-f]{32})")
POLYPIZZA_RE = re.compile(r"poly\.pizza/m/([A-Za-z0-9_-]+)")
POLYHAVEN_RE = re.compile(r"polyhaven\.com/a/([A-Za-z0-9_-]+)")


def _resolve(url: str) -> dict | None:
    try:
        if m := SKETCHFAB_RE.search(url):
            return sketchfab.verified(m.group(1))
        if m := POLYPIZZA_RE.search(url):
            return polypizza.model(m.group(1))
        if m := POLYHAVEN_RE.search(url):
            return polyhaven.candidate(m.group(1))
    except Exception:
        log.info("could not resolve %s", url, exc_info=True)
    return None


def search(query: str, usage: Usage) -> list[dict]:
    data = tavily.search(f"{query} 3D model free download", usage, include_domains=LIBRARIES, max_results=12)
    urls = list(dict.fromkeys(r["url"] for r in data.get("results", []) if r.get("url")))
    with ThreadPoolExecutor(max_workers=8) as pool:
        found = [c for c in pool.map(_resolve, urls) if c]
    return [c | {"found_by": "tavily"} for c in found]
