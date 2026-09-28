"""Agent 3b - Quality Inspector (Nemotron 3 Super, Hermes 4 as fallback): final call + honest score.
Soul & instructions: backend/prompts/quality_inspector.md

Normally reviews the vision judge's top picks. If the judge failed, decides from metadata alone.
"""

import json

from backend import config
from backend.settings import SearchSettings
from backend.utils.llm import Usage, ask_json
from backend.utils.prompts import load


def _brief(label: str, c: dict) -> dict:
    return {
        "id": label,
        "source": c["source"],
        "name": c["name"],
        "license": c.get("license"),
        "tags": c["tags"][:10],
        "faces": c.get("faces"),
        "description": c["description"][:160],
        "judge": c.get("judge"),
    } | ({"past_feedback": c["past_feedback"]} if c.get("past_feedback") else {})


def final_pick(
    prompt: str, settings: SearchSettings, must_have: list[str], look: str, candidates: list[dict], usage: Usage,
    facts: str = "",
) -> dict:
    """`candidates` are best-first (judged) or unordered (fallback). Returns the winner + `quality`."""
    judged = any("judge" in c for c in candidates)
    shortlist = candidates[:3] if judged else candidates
    labels = {f"C{i + 1}": c for i, c in enumerate(shortlist)}

    user = (
        f"Request: {prompt}\nSearch settings: {settings.describe()}\n"
        f"Must-have: {json.dumps(must_have, ensure_ascii=False)}\nLook note: {look}\n"
        + (f"Real-world facts (Tavily research): {facts}\n" if facts else "")
        + "\n"
        f"Candidates:\n{json.dumps([_brief(k, c) for k, c in labels.items()], ensure_ascii=False, indent=2)}"
    )
    # The judge already did the heavy visual work - a quick, non-thinking Super call decides.
    result = ask_json(config.INSPECTOR_MODEL, load("quality_inspector"), user, usage,
                      fast=True, fallback_model=config.HERMES_MODEL)

    best = labels.get(str(result.get("pick", "")).strip(), shortlist[0])
    judge = best.get("judge") or {}
    return {
        **best,
        "quality": {
            "score": int(result.get("score", judge.get("score", 0))),
            "reason": result.get("reason") or judge.get("reason", ""),
            "has": judge.get("has", []),
            "missing": judge.get("missing", []),
        },
    }
