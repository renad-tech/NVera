"""Small evaluation: does the vision judge pick better models than a plain title search?

For each request, both methods choose from the SAME candidates NVera found:
  - title search: the candidate whose name shares the most words with the request (no AI)
  - NVera: the full pipeline (Nemotron analysis, Tavily photos, vision judge, final pick)
Results go to eval/results.json; open eval/review.html to mark which picks are right.
Costs about $0.005 and 2 Tavily credits per request.

    .venv/Scripts/python scripts/evaluate.py
"""

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import pipeline  # noqa: E402
from backend.agents import env_finder  # noqa: E402
from backend.settings import SearchSettings  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "eval"

REQUESTS = [
    ("a wooden chair", "small"), ("a red sports car", "small"), ("an old oak tree", "small"),
    ("a medieval sword", "small"), ("a desk lamp", "small"), ("a sailing ship", "small"),
    ("a cactus in a pot", "small"), ("a vintage radio", "small"), ("a fire hydrant", "small"),
    ("a small wooden cabin", "medium"), ("a cozy cafe with wooden tables and plants", "medium"),
    ("a classroom with desks", "medium"), ("a kitchen with an island", "medium"),
    ("a library with tall bookshelves", "medium"), ("a gym with weights", "medium"),
    ("a bedroom with a bed and a desk", "medium"), ("a gas station", "medium"),
    ("a medieval castle on a hill", "large"), ("a forest with a waterfall", "large"),
    ("a cyberpunk city street at night", "large"), ("a desert with dunes and rocks", "large"),
    ("a japanese temple", "large"), ("a small island with palm trees", "large"),
    ("a snowy mountain village", "large"), ("a city made of cardboard", "large"),
    ("a low poly farm with animals", "large"), ("a space station", "large"),
    ("a pirate ship", "medium"), ("مسجد بقبة ومئذنة", "large"), ("سيارة كلاسيكية قديمة", "small"),
]


def words(text: str) -> set[str]:
    return {w.rstrip("s") for w in re.findall(r"\w+", text.lower()) if len(w) > 2}


def title_pick(prompt: str, scene: dict, candidates: list[dict]) -> dict:
    query = words(" ".join([prompt, scene.get("search_query", "")]))
    return max(candidates, key=lambda c: (len(query & words(c["name"])), c.get("likes") or 0))


def summary(c: dict) -> dict:
    return {"id": c["id"], "name": c["name"], "source": c["source"], "thumbnail": c.get("thumbnail"),
            "url": c.get("url"), "score": (c.get("quality") or c.get("judge") or {}).get("score")}


def run_one(prompt: str, size: str) -> dict:
    found: dict = {}
    real_find = env_finder.find

    def capture(scene, usage, on_stage, exclude=frozenset()):
        found["candidates"] = real_find(scene, usage, on_stage, exclude)
        found["scene"] = scene
        return found["candidates"]

    def no_download(prompt, settings, scene, ranked, usage):
        yield {"type": "ranked", "ranked": ranked, "cost": usage.nebius_usd, "credits": usage.tavily_credits}

    # Spend still goes into the usage ledger, but not as public-demo searches, so an evaluation run
    # can't use up the live site's daily search limit.
    real_add = pipeline.budget.add
    env_finder.find, pipeline._deliver = capture, no_download
    pipeline.budget.add = lambda usage, kind: real_add(usage, "eval")
    try:
        t0 = time.time()
        last = None
        for event in pipeline.run(prompt, SearchSettings(space_size=size)):
            last = event
        if not last or last["type"] != "ranked":
            return {"prompt": prompt, "error": (last or {}).get("message", "no result")}
        candidates = found["candidates"]
        return {
            "prompt": prompt, "size": size, "seconds": round(time.time() - t0, 1),
            "cost": round(last["cost"], 5), "credits": last["credits"],
            "title": summary(title_pick(prompt, found["scene"], candidates)),
            "nvera": summary(last["ranked"][0]),
            "candidates": len(candidates),
        }
    finally:
        env_finder.find, pipeline.budget.add = real_find, real_add


def main() -> None:
    OUT.mkdir(exist_ok=True)
    path = OUT / "results.json"
    results = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    done = {r["prompt"] for r in results if "error" not in r}
    for prompt, size in REQUESTS:
        if prompt in done:
            continue
        r = run_one(prompt, size)
        results = [x for x in results if x["prompt"] != prompt] + [r]
        path.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{prompt!r}: title={r.get('title', {}).get('name')!r} nvera={r.get('nvera', {}).get('name')!r} "
              f"${r.get('cost')} {r.get('error', '')}", flush=True)
    spent = sum(r.get("cost") or 0 for r in results)
    print(f"done: {len(results)} requests, ${spent:.3f}, {sum(r.get('credits') or 0 for r in results)} Tavily credits")


if __name__ == "__main__":
    main()
