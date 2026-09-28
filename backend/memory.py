"""NVera's memory: every search and every 👍/👎 is remembered, and fed back to the AI team.

Not model training - just experience:
  • Nemotron gets "lessons" from similar past requests (queries users liked, complaints to avoid).
  • Kimi and the Quality Inspector see if a candidate was rated before, and why.

Stored as JSON lines in memory/history.jsonl (git-ignored). Mock runs go to a separate file.
"""

import json
import re
import threading
import time
import uuid

from backend import config

MEMORY_DIR = config.ROOT / "memory"
MEMORY_DIR.mkdir(exist_ok=True)
FILE = MEMORY_DIR / ("mock-history.jsonl" if config.MOCK else "history.jsonl")

_lock = threading.Lock()
MIN_SIMILARITY = 0.2


def _append(event: dict) -> None:
    with _lock, open(FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def _events() -> list[dict]:
    if not FILE.exists():
        return []
    with _lock:
        lines = FILE.read_text(encoding="utf-8").splitlines()
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower()) if len(w) > 2}


def _similarity(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / len(wa | wb) if wa and wb else 0.0


def _rated_searches() -> list[dict]:
    """Searches joined with their latest feedback (only the rated ones)."""
    searches, feedback = {}, {}
    for e in _events():
        if e.get("type") == "search":
            searches[e["id"]] = e
        elif e.get("type") == "feedback":
            feedback[e["search_id"]] = e
    return [s | {"feedback": feedback[sid]} for sid, s in searches.items() if sid in feedback]


# Writing


def record_search(prompt: str, settings: dict, scene: dict, model: dict) -> str:
    search_id = uuid.uuid4().hex[:12]
    _append({
        "type": "search", "id": search_id, "ts": time.time(),
        "prompt": prompt, "settings": settings,
        "search_query": scene.get("search_query"), "alt_queries": scene.get("alt_queries"),
        "model": {"id": model["id"], "name": model["name"], "source": model["source"]},
        "score": model["quality"]["score"],
    })
    return search_id


def record_feedback(search_id: str, rating: str, note: str = "") -> None:
    _append({"type": "feedback", "search_id": search_id, "rating": rating, "note": note.strip()[:300], "ts": time.time()})


# Reading (fed to the AI team)


def lessons_for(prompt: str, limit: int = 5) -> str:
    """Similar past requests the user rated - for the Scene Analyzer."""
    rated = [(s, _similarity(prompt, s["prompt"])) for s in _rated_searches()]
    rated = sorted([x for x in rated if x[1] >= MIN_SIMILARITY], key=lambda x: -x[1])[:limit]
    lines = []
    for s, _ in rated:
        fb = s["feedback"]
        if fb["rating"] == "up":
            lines.append(f'- LIKED: request "{s["prompt"]}" -> searched "{s["search_query"]}" -> got "{s["model"]["name"]}"')
        else:
            why = f' - user said: "{fb["note"]}"' if fb.get("note") else ""
            lines.append(f'- DISLIKED: request "{s["prompt"]}" -> searched "{s["search_query"]}" -> got "{s["model"]["name"]}"{why}')
    return "\n".join(lines)


def feedback_by_model() -> dict[str, list[str]]:
    """model id -> short notes of how users rated it before - for the judges."""
    out: dict[str, list[str]] = {}
    for s in _rated_searches():
        fb = s["feedback"]
        verdict = "liked" if fb["rating"] == "up" else "disliked"
        note = f': "{fb["note"]}"' if fb.get("note") else ""
        out.setdefault(s["model"]["id"], []).append(f'user {verdict} it for "{s["prompt"]}"{note}')
    return {k: v[-3:] for k, v in out.items()}


def stats() -> dict:
    rated = _rated_searches()
    return {
        "searches": sum(1 for e in _events() if e.get("type") == "search"),
        "liked": sum(1 for s in rated if s["feedback"]["rating"] == "up"),
        "disliked": sum(1 for s in rated if s["feedback"]["rating"] == "down"),
    }
