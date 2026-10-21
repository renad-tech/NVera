"""Offline checks for the parts NVera's answers depend on. Run: .venv/Scripts/python -m pytest"""

import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from backend import config, guard, memory
from backend.agents import env_finder, vision_judge
from backend.main import app
from backend.settings import SearchSettings
from backend.trace import Trace
from backend.utils.llm import Usage


def candidate(cid, name, source="polypizza", tags=(), likes=0, **extra):
    return {"id": cid, "name": name, "source": source, "tags": list(tags), "likes": likes,
            "description": "", "thumbnail": None} | extra


# The whole search, end to end (mock mode: no paid calls)

def test_mock_search_then_rating_is_remembered():
    client = TestClient(app)
    r = client.post("/api/find", json={"prompt": "a forest with a waterfall"})
    assert r.status_code == 200
    events = [json.loads(line) for line in r.text.splitlines() if line.strip()]
    assert [e["type"] for e in events][-1] == "result"
    result = events[-1]["data"]
    assert result["model"]["name"] and result["search_id"]

    assert client.post("/api/feedback", json={"search_id": result["search_id"], "rating": "up"}).status_code == 200
    assert memory.stats()["liked"] == 1


def test_bad_requests_are_rejected_before_any_paid_call():
    client = TestClient(app)
    assert client.post("/api/find", json={}).status_code == 422
    assert client.post("/api/find", json={"prompt": "x" * 5000}).status_code == 422


# Learning from ratings

def test_similar_requests_get_past_ratings_as_lessons():
    sid = memory.record_search("forest with waterfall", {}, {"search_query": "forest waterfall scene"},
                               {"id": "m1", "name": "Low Poly Forest", "source": "sketchfab", "quality": {"score": 9}})
    memory.record_feedback(sid, "up")
    lessons = memory.lessons_for("a forest with a lake")
    assert "LIKED" in lessons and "Low Poly Forest" in lessons
    assert memory.lessons_for("a red sports car") == ""  # unrelated requests get nothing


def test_disliked_models_reach_the_judges_with_the_reason():
    sid = memory.record_search("cozy cafe", {}, {"search_query": "cafe"},
                               {"id": "m2", "name": "Empty Room", "source": "polypizza", "quality": {"score": 9}})
    memory.record_feedback(sid, "down", "no tables inside")
    assert memory.feedback_by_model()["m2"] == ['user disliked it for "cozy cafe": "no tables inside"']


# Choosing what the judge sees

def test_relevant_models_beat_popular_unrelated_ones():
    found = [
        candidate("a", "Gorilla skull", likes=900),
        candidate("b", "Vase", likes=800),
        candidate("c", "Castle Fortress", tags=["castle"], likes=5),
        candidate("d", "Medieval castle", tags=["medieval"], likes=3),
        candidate("e", "Stone castle wall", likes=1),
        candidate("f", "Fortress gate", tags=["fortress"], likes=2),
    ]
    picked = env_finder._select(found, env_finder._words("medieval castle fortress"))
    names = [c["name"] for c in picked]
    assert "Gorilla skull" not in names and "Vase" not in names
    assert set(names[:2]) == {"Castle Fortress", "Medieval castle"}  # match two search words each


# The vision judge (NVIDIA first, Kimi as backup)

def test_vision_judge_falls_back_when_the_first_model_fails(monkeypatch):
    asked = []

    def fake_ask(model, content, usage):
        asked.append(model)
        if model == config.JUDGE_MODEL:
            raise TimeoutError("model down")
        return [{"id": "C2", "score": 8, "has": ["trees"], "missing": [], "reason": "matches"},
                {"id": "C1", "score": 3, "has": [], "missing": ["water"], "reason": "no water"}]

    monkeypatch.setattr(vision_judge, "_ask", fake_ask)
    usage = Usage()
    ranked = vision_judge.rank("forest", SearchSettings(), ["trees"], "", [candidate("1", "A"), candidate("2", "B")], usage)
    assert asked == [config.JUDGE_MODEL, config.JUDGE_FALLBACK_MODEL]
    assert usage.judge_model == config.JUDGE_FALLBACK_MODEL
    assert [c["name"] for c in ranked] == ["B", "A"] and ranked[0]["judge"]["score"] == 8


def test_judge_cost_uses_the_model_that_ran():
    usage = Usage()
    usage.add_judge("nvidia/Nemotron-3.5-Super-VL", 1_000_000, 0)
    assert usage.nebius_usd == pytest.approx(0.30)
    usage.add_judge("moonshotai/Kimi-K2.6", 1_000_000, 0)
    assert usage.nebius_usd == pytest.approx(1.25)


def test_trace_shows_the_fallback_model():
    trace = Trace(Usage())
    trace.begin("judge", "Vision Judge", "nvidia/Nemotron-3.5-Super-VL")
    trace.set_model("moonshotai/Kimi-K2.6")
    trace.end()
    assert trace.steps[0]["model"] == "moonshotai/Kimi-K2.6"


# Protecting the API credits on the public demo

def _request(ip="1.2.3.4"):
    return Request({"type": "http", "method": "POST", "path": "/api/find", "headers": [], "client": (ip, 1)})


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setattr(config, "MOCK", False)
    monkeypatch.setattr(guard.budget, "spent_today", lambda: 0.0)
    monkeypatch.setattr(guard.budget, "searches_today", lambda: 0)
    guard._hits.clear()


def test_hourly_limit_per_visitor(live, monkeypatch):
    monkeypatch.setattr(config, "SEARCHES_PER_HOUR", 2)
    guard.guard_paid(_request())
    guard.guard_paid(_request())
    with pytest.raises(HTTPException) as e:
        guard.guard_paid(_request())
    assert e.value.status_code == 429
    guard.guard_paid(_request("5.6.7.8"))  # another visitor is not affected


def test_daily_caps_stop_searches(live, monkeypatch):
    monkeypatch.setattr(guard.budget, "spent_today", lambda: config.DAILY_BUDGET_USD)
    with pytest.raises(HTTPException) as e:
        guard.guard_paid(_request())
    assert e.value.status_code == 503

    monkeypatch.setattr(guard.budget, "spent_today", lambda: 0.0)
    monkeypatch.setattr(guard.budget, "searches_today", lambda: config.DAILY_SEARCHES)
    with pytest.raises(HTTPException):
        guard.guard_paid(_request())


# Scene Mode

def test_scene_plan_is_clamped_to_something_the_browser_can_trust():
    from backend import scene_builder
    raw = {
        "title": "Park", "area_m": 500,  # too big -> 40
        "restyle": {"material": "plastic", "lighting": "sunset"},  # unknown material -> original
        "items": [
            {"name": "bench", "query": "park bench", "size_m": 2,
             "placements": [{"x": 999, "z": -999, "rot": 45}]},  # pushed back inside the ground
            {"name": "", "query": ""},  # dropped
        ] + [{"name": f"tree {i}", "query": "tree", "size_m": 5,
              "placements": [{"x": 0, "z": 0, "rot": 0}] * 5} for i in range(5)],
    }
    plan = scene_builder.normalize_plan(raw, "a park")
    assert plan["area_m"] == 40
    assert plan["restyle"]["material"] == "original" and plan["restyle"]["lighting"] == "sunset"
    assert plan["items"][0]["placements"][0] == {"x": 19.0, "z": -19.0, "rot": 45.0}
    assert sum(len(it["placements"]) for it in plan["items"]) <= scene_builder.MAX_PLACEMENTS
    assert len(plan["items"]) <= scene_builder.MAX_ITEMS


def test_scene_endpoints_in_mock_mode():
    client = TestClient(app)
    plan = client.post("/api/scene/plan", json={"prompt": "a small park"}).json()
    assert plan["items"] and plan["area_m"] > 0
    assert client.post("/api/scene/plan", json={"prompt": "x"}).status_code == 422


def test_a_scene_plan_counts_as_a_search(live, monkeypatch):
    monkeypatch.setattr(config, "SEARCHES_PER_HOUR", 1)
    req = Request({"type": "http", "method": "POST", "path": "/api/scene/plan", "headers": [], "client": ("9.9.9.9", 1)})
    guard.guard_paid(req)
    with pytest.raises(HTTPException):
        guard.guard_paid(req)


def test_a_result_remembers_the_next_models_for_when_it_cant_be_displayed(monkeypatch, tmp_path):
    from backend import pipeline
    files = {}

    def fake_download(c):
        path = tmp_path / c["file"]
        path.write_bytes(b"glTF" + b"0" * 100)
        files[c["id"]] = path
        return path

    monkeypatch.setattr(pipeline.downloader, "download", fake_download)
    ranked = [candidate(str(i), f"Model {i}", file=f"m{i}.glb", author="a", license="CC0",
                        quality={"score": 9 - i, "reason": "", "has": [], "missing": []})
              for i in range(3)]
    events = list(pipeline._download_first("a chair", SearchSettings(), {}, ranked, Usage()))
    first = events[-1]["data"]
    assert first["model"]["name"] == "Model 0" and first["next_job_id"]

    events = list(pipeline.resume(first["next_job_id"], "editable"))
    second = events[-1]["data"]
    assert second["model"]["name"] == "Model 1" and second["next_job_id"]  # and it chains on
