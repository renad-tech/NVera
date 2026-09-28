"""The one place NVera talks to Tavily (search + extract), with credit counting.

Credits (Tavily pricing): basic search = 1 · advanced search = 2 · basic extract = 1 per 5 URLs.
"""

import math

import requests

from backend import config
from backend.utils.llm import Usage

BASE = "https://api.tavily.com"


def _post(path: str, body: dict) -> dict:
    r = requests.post(
        f"{BASE}/{path}",
        headers={"Authorization": f"Bearer {config.TAVILY_API_KEY}"},
        json=body,
        timeout=40,
    )
    r.raise_for_status()
    return r.json()


def search(query: str, usage: Usage, **options) -> dict:
    """Tavily /search. `options` are passed through (include_domains, include_images...)."""
    body = {"query": query, "search_depth": "basic", "max_results": 10} | options
    data = _post("search", body)
    usage.tavily_credits += 2 if body["search_depth"] == "advanced" else 1
    return data


def extract(urls: list[str], usage: Usage) -> list[dict]:
    """Tavily /extract: full page content for each URL ([{url, raw_content}])."""
    if not urls:
        return []
    data = _post("extract", {"urls": urls[:20], "extract_depth": "basic"})
    usage.tavily_credits += math.ceil(len(urls[:20]) / 5)
    return data.get("results", [])
