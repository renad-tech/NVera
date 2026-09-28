"""Agent 1 - Scene Analyzer (Nemotron): request + settings -> shape to search for + look to apply.
Soul & instructions: backend/prompts/scene_analyzer.md"""

from backend import config, restyle
from backend.settings import SearchSettings
from backend.utils.llm import Usage, ask_json
from backend.utils.prompts import load


def analyze(prompt: str, settings: SearchSettings, usage: Usage, lessons: str = "") -> dict:
    user = f"Request: {prompt}\n\nSearch settings: {settings.describe()}"
    if lessons:
        user += f"\n\nLessons from past searches (rated by users):\n{lessons}"
    scene = ask_json(config.NEMOTRON_MODEL, load("scene_analyzer"), user, usage)

    # Normalize so the rest of the pipeline and the frontend can trust the shape.
    scene["restyle"] = restyle.normalize(
        scene.get("restyle") or scene.get("style"),  # "style" = older prompt versions
        monochrome=settings.color_mode == "monochrome",
    )
    scene.pop("style", None)
    scene["search_query"] = scene.get("search_query") or scene.get("subject") or prompt
    scene["alt_queries"] = [q for q in (scene.get("alt_queries") or []) if isinstance(q, str)][:2]
    scene["must_have"] = [m for m in (scene.get("must_have") or []) if isinstance(m, str)][:5]
    return scene


def look_note(scene: dict) -> str:
    """Tells the judges which look NVera will paint on, so they don't penalize its absence."""
    m = scene["restyle"]["material"]
    if m == "original":
        return "NVera keeps the model's own materials."
    return (
        f"NVera will repaint the chosen model as '{m}' afterwards - judge shape, layout and detail; "
        f"do NOT penalize a candidate for lacking the {m} look."
    )
