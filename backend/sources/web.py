"""Source: the open web via Tavily Search + Extract (last-resort fallback, ~2 credits).

1. Tavily Search finds pages that offer free 3D models (outside the big libraries).
2. Tavily Extract reads the top pages in full and pulls out direct .glb links -
   links that never appear in a search snippet.
Every link is HEAD-checked; licenses are unknown, so the judges are told to be cautious.
"""

import hashlib
import logging
import re
from urllib.parse import urlparse

import requests

from backend.sources.tavily_libraries import LIBRARIES
from backend.utils import tavily
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

GLB_RE = re.compile(r"https?://[^\s\"'<>()\[\]]+\.glb\b", re.I)
PAGES_TO_READ = 3


def _reachable(url: str) -> int | None:
    """Free HEAD check: file size in bytes (0 if unknown) when the link answers 200, else None."""
    try:
        r = requests.head(url, allow_redirects=True, timeout=10)
        return int(r.headers.get("content-length") or 0) if r.status_code == 200 else None
    except Exception:
        return None


def _candidate(url: str, page_url: str, page_title: str, size: int) -> dict:
    key = hashlib.sha1(url.encode()).hexdigest()[:12]
    return {
        "id": f"web:{key}",
        "source": "web",
        "found_by": "tavily",
        "name": url.rsplit("/", 1)[-1].removesuffix(".glb").replace("_", " ").replace("-", " "),
        "author": urlparse(url).netloc,
        "author_url": page_url,
        "license": "Unknown",
        "url": page_url,
        "thumbnail": None,
        "tags": [],
        "description": page_title[:200],
        "faces": None,
        "likes": None,
        "views": None,
        "file": f"web_{key}.glb",
        "download_url": url,
        "size": size,
    }


def search(query: str, usage: Usage, limit: int = 3) -> list[dict]:
    data = tavily.search(f"{query} free 3D model glb download", usage, exclude_domains=LIBRARIES, max_results=8)
    results = [r for r in data.get("results", []) if r.get("url")]
    titles = {r["url"]: r.get("title", "") for r in results}

    # Links visible in the snippets first; then let Tavily Extract read the top pages in full.
    links = [(u, r["url"]) for r in results for u in GLB_RE.findall(r.get("content", ""))]
    if len(links) < limit:
        try:
            for page in tavily.extract([r["url"] for r in results[:PAGES_TO_READ]], usage):
                links += [(u, page["url"]) for u in GLB_RE.findall(page.get("raw_content") or "")]
        except Exception:
            log.info("Tavily extract failed", exc_info=True)

    out, seen = [], set()
    for url, page in links:
        if url in seen:
            continue
        seen.add(url)
        size = _reachable(url)
        if size is not None:
            out.append(_candidate(url, page, titles.get(page, ""), size))
        if len(out) >= limit:
            break
    return out
