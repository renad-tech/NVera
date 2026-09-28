"""Agent 5 - Restyler (Nemotron 3 Nano, Ultra as fallback): edits the look from a chat instruction.
Soul & instructions: backend/prompts/restyler.md

Cheap: one short Nano call (~$0.0001). The shape never changes - only material, colors,
ground, sky and light, which the viewer applies and the GLB export keeps.
"""

import json

from backend import config, restyle
from backend.utils.llm import Usage, ask_json
from backend.utils.prompts import load


def edit(prompt: str, subject: str, current: dict, instruction: str, usage: Usage) -> tuple[dict, str]:
    if config.MOCK:
        return restyle.mock_edit(current, instruction)

    user = (
        f"Original request: {prompt}\n"
        f"The model is: {subject}\n"
        f"Current look: {json.dumps(current)}\n\n"
        f"Edit instruction: {instruction}"
    )
    # Fast everyday call -> Nemotron Nano; Ultra takes over if Nano ever fails.
    result = ask_json(config.RESTYLER_MODEL, load("restyler"), user, usage,
                      fast=True, fallback_model=config.NEMOTRON_MODEL)
    merged = {**current, **(result.get("restyle") or {})}  # anything missing stays as it was
    return restyle.normalize(merged), str(result.get("message") or "Updated the look.")
