"""Runs the agents in order and yields progress events for the frontend.

    Nemotron (analyze) -> Tavily (real-world research: photos + facts)
    -> Tavily + Sketchfab + Poly Pizza + three.js [+ web via Tavily Search/Extract] (find)
    -> Kimi (vision judge: previews vs. real photos) -> Nemotron Super (final pick) -> download

The best model always wins, whatever its size. If it is larger than LARGE_MODEL_MB the
stream ends with a `confirm` event; the user answers via `resume(job_id, accept)`,
which downloads it - or the best smaller model - with no new AI calls.

Events (one JSON object per line):
    {"type": "step",    "step": "analyze|research|search|inspect|download", "message": "..."}
    {"type": "confirm", "data": {"job_id", "model", "alternative"}}
    {"type": "result",  "data": {...}}
    {"type": "error",   "message": "..."}
"""

import logging
import queue
import threading
import time
import uuid
from collections.abc import Iterator

from backend import config, memory, restyle
from backend import usage as budget
from backend.agents import downloader, env_finder, quality_checker, researcher, scene_analyzer, vision_judge
from backend.sources import threejs
from backend.settings import SearchSettings
from backend.trace import Trace
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

SOURCE_LABELS = {
    "sketchfab": "Sketchfab",
    "polyhaven": "Poly Haven",
    "smithsonian": "Smithsonian 3D",
    "polypizza": "Poly Pizza",
    "threejs": "three.js examples",
    "web": "Web",
}

LARGE_BYTES = config.LARGE_MODEL_MB * 1_000_000
JOB_TTL = 30 * 60  # pending confirmations expire after 30 minutes
_pending: dict[str, dict] = {}


def step(name: str, message: str) -> dict:
    return {"type": "step", "step": name, "message": message}


def _is_large(c: dict) -> bool:
    return (c.get("size") or 0) > LARGE_BYTES


def _with_judge_verdict(c: dict) -> dict:
    """Candidates other than the inspector's pick carry the judge's verdict as their quality."""
    if "quality" in c:
        return c
    judge = c.get("judge") or {}
    return {**c, "quality": {
        "score": judge.get("score", 0), "reason": judge.get("reason", ""),
        "has": judge.get("has", []), "missing": judge.get("missing", []),
    }}


def _summary(c: dict) -> dict:
    return {
        "name": c["name"],
        "source_label": SOURCE_LABELS[c["source"]],
        "size_mb": round((c.get("size") or 0) / 1e6, 1),
        "score": c["quality"]["score"],
        "reason": c["quality"]["reason"],
    }


# Main run


def run(prompt: str, settings: SearchSettings) -> Iterator[dict]:
    if config.MOCK:
        yield from run_mock(prompt, settings)
        return

    usage = Usage()
    trace = Trace(usage)
    try:
        yield step("analyze", "Nemotron is analyzing your scene")
        trace.begin("analyze", "Scene Analyzer", config.NEMOTRON_MODEL)
        scene = scene_analyzer.analyze(prompt, settings, usage, lessons=memory.lessons_for(prompt))

        yield step("research", f"Tavily is researching what a {scene.get('subject') or 'scene'} really looks like")
        trace.begin("research", "Real-world research", "Tavily search + images")
        scene["research"] = researcher.research(scene, usage)
        trace.begin("search", "Library search", "Tavily + Poly Haven, Sketchfab/Objaverse, Poly Pizza, Smithsonian, three.js")

        # env_finder reports sub-stages through a callback; relay them as events.
        stages: queue.Queue = queue.Queue()
        box: dict = {}

        def find() -> None:
            try:
                box["candidates"] = env_finder.find(scene, usage, stages.put)
            except Exception as e:
                box["error"] = e
            finally:
                stages.put(None)

        threading.Thread(target=find, daemon=True).start()
        while (msg := stages.get()) is not None:
            yield step("search", msg)
        if "error" in box:
            raise box["error"]
        candidates = box["candidates"]

        if not candidates:
            yield {"type": "error", "message": "No downloadable model found. Try a simpler description."}
            return

        look = scene_analyzer.look_note(scene)
        past = memory.feedback_by_model()

        def judge(cands: list[dict]) -> list[dict]:
            for c in cands:
                if c["id"] in past:
                    c["past_feedback"] = past[c["id"]]
            return vision_judge.rank(
                prompt, settings, scene["must_have"], look, cands, usage,
                real_photos=[img["url"] for img in scene["research"]["images"]],
            )

        sources = sorted({SOURCE_LABELS[c["source"]] for c in candidates})
        yield step("inspect", f"Kimi is comparing {len(candidates)} previews from {', '.join(sources)}")
        trace.begin("judge", "Vision Judge", config.JUDGE_MODEL)
        try:
            candidates = judge(candidates)

            # Round 2: no good *downloadable* model yet -> search broader before settling for a
            # view-only Sketchfab result, and judge the newcomers against the best 3.
            best_score = max((c["judge"]["score"] for c in candidates if c.get("judge") and _downloadable(c)), default=0)
            if best_score < config.MIN_SCORE:
                yield step("search", f"Best downloadable match was only {best_score}/10 - searching again with broader words")
                trace.begin("round2", "Second round (weak results)", "Tavily + libraries, then Vision Judge")
                more = env_finder.find_more(scene, usage, lambda _msg: None, exclude={c["id"] for c in candidates})
                if more:
                    yield step("inspect", f"Kimi is comparing {len(more)} new previews with the best so far")
                    rejudged = judge(candidates[:3] + more)
                    candidates = rejudged + [c for c in candidates[3:] if c not in rejudged]
                    candidates.sort(key=lambda c: -(c.get("judge") or {}).get("score", 0))
        except Exception:
            log.warning("vision judge failed - the inspector will decide from metadata", exc_info=True)

        yield step("inspect", "Nemotron Super is making the final call")
        trace.begin("inspect", "Quality Inspector", config.INSPECTOR_MODEL)
        best = quality_checker.final_pick(
            prompt, settings, scene["must_have"], look, candidates, usage, facts=scene["research"]["answer"],
        )
        ranked = [best] + [_with_judge_verdict(c) for c in candidates if c["id"] != best["id"]]

        # View-only Sketchfab is the last resort: any downloadable model that's good enough (6+) wins,
        # and otherwise the view-only one still has to be clearly better (2+ points).
        if not _downloadable(best):
            editable = next((c for c in ranked[1:] if _downloadable(c)), None)
            score = editable["quality"]["score"] if editable else 0
            if editable and (score >= config.MIN_SCORE or score >= best["quality"]["score"] - 1):
                log.info("preferring editable %s over view-only %s", editable["id"], best["id"])
                ranked = [editable] + [c for c in ranked if c is not editable]

        scene["trace"] = trace.export(candidates, ranked[0]["id"], SOURCE_LABELS, _downloadable)
        yield from _deliver(prompt, settings, scene, ranked, usage)
    except Exception as e:
        log.exception("pipeline failed")
        yield {"type": "error", "message": f"Something went wrong: {e}"}
    finally:
        budget.add(usage, "search")
        log.info(
            "prompt=%r cost=$%.4f llm=%d/%d judge=%d/%d tavily=%d",
            prompt, usage.nebius_usd, usage.tokens_in, usage.tokens_out,
            usage.judge_in, usage.judge_out, usage.tavily_credits,
        )


def _downloadable(c: dict) -> bool:
    """Sketchfab API terms 4.6: no downloads with the owner's token unless the owner is the user.
    Sketchfab models are still editable when Objaverse has the same model (see env_finder)."""
    return c["source"] != "sketchfab" or env_finder.mark_editable(c)["editable"]


def _remember_job(prompt: str, settings: SearchSettings, scene: dict, ranked: list[dict]) -> str:
    now = time.time()
    for job_id in [j for j, v in _pending.items() if now - v["at"] > JOB_TTL]:
        del _pending[job_id]
    job_id = uuid.uuid4().hex
    _pending[job_id] = {"prompt": prompt, "settings": settings, "scene": scene, "ranked": ranked, "at": now}
    return job_id


def _deliver(prompt: str, settings: SearchSettings, scene: dict, ranked: list[dict], usage: Usage) -> Iterator[dict]:
    """Best model -> embed (Sketchfab, no download rights) · size question (large) · download."""
    best = ranked[0]
    if not _downloadable(best):
        job_id = _remember_job(prompt, settings, scene, ranked)
        editable = next((c for c in ranked[1:] if _downloadable(c)), None)
        data = result_payload(prompt, settings, scene, best, best.get("size") or 0, usage, embed=True)
        yield {"type": "result", "data": data | {
            "job_id": job_id,
            "alternative": _summary(editable) if editable else None,
        }}
        return
    if _is_large(best):
        yield _ask_confirmation(prompt, settings, scene, ranked)
        return
    yield from _download_first(prompt, settings, scene, [c for c in ranked if _downloadable(c)], usage)


def _ask_confirmation(prompt: str, settings: SearchSettings, scene: dict, ranked: list[dict]) -> dict:
    job_id = _remember_job(prompt, settings, scene, ranked)
    smaller = next((c for c in ranked[1:] if not _is_large(c) and _downloadable(c)), None)
    return {"type": "confirm", "data": {
        "job_id": job_id,
        "model": _summary(ranked[0]),
        "alternative": _summary(smaller) if smaller else None,
    }}


def resume(job_id: str, choice: str) -> Iterator[dict]:
    """User's follow-up on a remembered ranking. No AI calls - just downloads.
    choice: "large" (download the big best model) · "smaller" · "editable" (best downloadable)."""
    job = _pending.pop(job_id, None)
    if not job:
        yield {"type": "error", "message": "This choice expired. Please search again."}
        return
    ranked = [c for c in job["ranked"] if _downloadable(c)]
    if choice == "smaller":
        ranked = [c for c in ranked if not _is_large(c)]
    if not ranked:
        yield {"type": "error", "message": "No other downloadable model was found for this scene."}
        return
    try:
        yield from _download_first(job["prompt"], job["settings"], job["scene"], ranked, Usage())
    except Exception as e:
        log.exception("resume failed")
        yield {"type": "error", "message": f"Something went wrong: {e}"}


def _download_first(
    prompt: str, settings: SearchSettings, scene: dict, ranked: list[dict], usage: Usage,
) -> Iterator[dict]:
    """Download the first model in `ranked` that works; fall back down the list."""
    last_error = ""
    for pick in ranked:
        size = f" ({pick['size'] / 1e6:.0f} MB)" if pick.get("size") else ""
        yield step("download", f"Downloading {pick['name']} from {SOURCE_LABELS[pick['source']]}{size}")
        t0 = time.time()
        try:
            path = downloader.download(pick)
        except Exception as e:
            last_error = str(e)
            log.warning("download failed for %s (%s)", pick["id"], pick.get("download_url"), exc_info=True)
            continue
        pick = _with_judge_verdict(pick)
        if scene.get("trace"):
            scene["trace"]["steps"].append({
                "key": "download", "agent": "Downloader", "model": SOURCE_LABELS[pick["source"]],
                "seconds": round(time.time() - t0, 1), "usd": 0, "tavily_credits": 0,
            })
            scene["trace"]["total_seconds"] = round(sum(x["seconds"] for x in scene["trace"]["steps"]), 1)
        yield {"type": "result", "data": result_payload(prompt, settings, scene, pick, path.stat().st_size, usage)}
        return
    yield {"type": "error", "message": f"Found models, but none could be downloaded ({last_error})."}


def result_payload(
    prompt: str, settings: SearchSettings, scene: dict, model: dict, size: int, usage: Usage, embed: bool = False,
) -> dict:
    """`embed=True`: show the model in Sketchfab's official viewer instead of downloading it."""
    return {
        "search_id": memory.record_search(prompt, settings.public(), scene, model),  # for 👍/👎
        "prompt": prompt,
        "settings": settings.public(),
        "scene": scene,
        "model": {
            k: model.get(k)
            for k in ("id", "source", "found_by", "via_objaverse", "name", "author", "author_url",
                      "license", "faces", "url")
        } | {"source_label": SOURCE_LABELS[model["source"]], "size_mb": round(size / 1e6, 1)},
        "glb_path": None if embed else f"/models/{model['file']}",
        "embed_url": f"https://sketchfab.com/models/{model['uid']}/embed?autostart=1&ui_theme=dark" if embed else None,
        "quality": model["quality"],
        "cost": {"nebius_usd": round(usage.nebius_usd, 4), "tavily_credits": usage.tavily_credits},
        "mock": config.MOCK,
    }


# Mock mode: no API calls, for UI work
# Tip: include the word "large" in a mock prompt to preview the size-confirmation card.

MOCK_RESEARCH_THUMB = ("https://media.sketchfab.com/models/9914a3d3592646909a866573a48b90fd/thumbnails/"
                       "51ae5aac0122449581f35e4292fa9160/65a2e81479804fc79f550f0a1dd0fc35.jpeg")

MOCK_MODEL = {
    "id": "sketchfab:9914a3d3592646909a866573a48b90fd",
    "uid": "9914a3d3592646909a866573a48b90fd",
    "source": "sketchfab",
    "name": "Palace",
    "author": "hnanw",
    "author_url": "https://sketchfab.com/hnanw",
    "license": "CC Attribution",
    "faces": 287990,
    "url": "https://sketchfab.com/3d-models/palace-9914a3d3592646909a866573a48b90fd",
    "file": "9914a3d3592646909a866573a48b90fd.glb",
    "size": 19_764_268,
    "quality": {
        "score": 7,
        "reason": "A detailed palace, but the scene has no desert around it.",
        "has": ["palace", "domes"],
        "missing": ["desert sand"],
    },
}
MOCK_SCENE = {
    "subject": "palace",
    "setting": "desert",
    "search_query": "palace desert",
    "alt_queries": ["desert palace", "arabian palace"],
    "must_have": ["palace", "domes", "desert sand"],
    "restyle": {"material": "original", "palette": [], "ground": "sand", "sky": "#1c130b",
                "lighting": "sunset", "fog": False, "bloom": False, "view": "exterior"},
}


def run_mock(prompt: str, settings: SearchSettings) -> Iterator[dict]:
    for name, msg in [
        ("analyze", "Nemotron is analyzing your scene"),
        ("research", "Tavily is researching what a palace really looks like"),
        ("search", "Searching Sketchfab, Poly Pizza and three.js for 'palace desert'"),
        ("inspect", "Kimi is comparing 8 previews from Poly Pizza, Sketchfab"),
        ("inspect", "Nemotron Super is making the final call"),
    ]:
        yield step(name, f"{msg} (mock)")
        time.sleep(0.7)

    if not downloader.glb_path(MOCK_MODEL["file"]).exists():
        yield {"type": "error", "message": f"Mock model missing: {MOCK_MODEL['file']}. Run scripts/try_pipeline.py once."}
        return

    # Keywords in the prompt ("cardboard", "night"...) set the look - free way to try materials.
    look, _ = restyle.mock_edit(MOCK_SCENE["restyle"], prompt)
    scene = {**MOCK_SCENE, "restyle": restyle.normalize(look, monochrome=settings.color_mode == "monochrome")}
    scene["research"] = researcher.research(scene, Usage())

    # A free, downloadable runner-up (three.js example) so every delivery path can be tried.
    runner_up = threejs.search("horse", Usage())[0] | {
        "quality": {"score": 5, "reason": "(mock) Editable stand-in from three.js.", "has": [], "missing": ["palace"]},
    }
    ranked = [MOCK_MODEL, runner_up]
    scene["trace"] = {
        "steps": [
            {"key": "analyze", "agent": "Scene Analyzer", "model": config.NEMOTRON_MODEL, "seconds": 3.1, "usd": 0.0021, "tavily_credits": 0},
            {"key": "research", "agent": "Real-world research", "model": "Tavily search + images", "seconds": 1.4, "usd": 0, "tavily_credits": 1},
            {"key": "search", "agent": "Library search", "model": "Tavily + 5 libraries", "seconds": 2.6, "usd": 0, "tavily_credits": 1},
            {"key": "judge", "agent": "Vision Judge", "model": config.JUDGE_MODEL, "seconds": 6.8, "usd": 0.0049, "tavily_credits": 0},
            {"key": "inspect", "agent": "Quality Inspector", "model": config.INSPECTOR_MODEL, "seconds": 1.9, "usd": 0.0006, "tavily_credits": 0},
        ],
        "total_seconds": 15.8,
        "candidates": [
            {"id": MOCK_MODEL["id"], "name": "Palace", "source_label": "Sketchfab", "found_by": None,
             "thumbnail": MOCK_RESEARCH_THUMB, "score": 7, "reason": "Detailed palace, no desert.", "editable": True, "picked": True},
            {"id": runner_up["id"], "name": "Horse", "source_label": "three.js examples", "found_by": None,
             "thumbnail": None, "score": 5, "reason": "Not a palace.", "editable": True, "picked": False},
        ],
        "mock": True,
    }
    if "large" in prompt.lower():
        big = {**MOCK_MODEL, "id": "mock:big", "name": "Palace (pretend 120 MB)", "size": 120_000_000,
               "quality": {**MOCK_MODEL["quality"], "score": 9}}
        ranked = [big, MOCK_MODEL, runner_up]
    yield from _deliver(prompt, settings, scene, ranked, Usage())
