"""Agent 1b - Real-world Researcher (Tavily): what does the requested thing actually look like?

One Tavily search with images + a short answer (1 credit). The results ground the whole team:
  • Kimi compares candidate models against these real photos (when the user gave no reference),
  • the Quality Inspector gets the facts, and the user sees what Tavily found in the result card.
"""

import logging

from backend import config
from backend.utils import tavily
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

MAX_IMAGES = 4


def research(scene: dict, usage: Usage) -> dict:
    """Returns {"query", "answer", "images": [{url, description}], "sources": [{title, url}]}."""
    subject = scene.get("subject") or scene["search_query"]
    if scene.get("setting"):
        subject += f" in a {scene['setting']}"
    details = ", ".join(scene.get("must_have", [])[:3])
    query = f"What does a {subject} look like{' with ' + details if details else ''}? Architecture, layout and visual details."

    if config.MOCK:
        return MOCK_RESEARCH | {"query": query}

    try:
        data = tavily.search(
            query, usage,
            include_answer="basic",
            include_images=True,
            include_image_descriptions=True,
            max_results=5,
        )
    except Exception:
        log.warning("Tavily research failed", exc_info=True)
        return {"query": query, "answer": "", "images": [], "sources": []}

    images = []
    for img in data.get("images", []):
        url = img.get("url") if isinstance(img, dict) else img
        if isinstance(url, str) and url.startswith("http"):
            images.append({"url": url, "description": (img.get("description") if isinstance(img, dict) else "") or ""})
    return {
        "query": query,
        "answer": (data.get("answer") or "").strip()[:600],
        "images": images[:MAX_IMAGES],
        "sources": [{"title": r.get("title", ""), "url": r["url"]} for r in data.get("results", [])[:4] if r.get("url")],
    }


MOCK_RESEARCH = {
    "answer": "(mock) Desert palaces typically have thick sand-colored walls, domes, arched windows, "
              "inner courtyards and flat roofs - built to stay cool in the heat.",
    "images": [
        {"url": "https://media.sketchfab.com/models/9914a3d3592646909a866573a48b90fd/thumbnails/"
                "51ae5aac0122449581f35e4292fa9160/65a2e81479804fc79f550f0a1dd0fc35.jpeg",
         "description": "(mock) palace reference"},
    ],
    "sources": [{"title": "(mock) Tavily source", "url": "https://tavily.com"}],
}
