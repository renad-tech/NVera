"""Observability for one search: which agent ran, on which model, how long it took, what it cost,
and every candidate the judges compared. Shown to the user as "How NVera decided".

(The Nebius Agents Blueprint names observability as one of the three things that break agents
in production - this is NVera's per-search execution record.)
"""

import time

from backend.utils.llm import Usage


class Trace:
    def __init__(self, usage: Usage):
        self.usage = usage
        self.steps: list[dict] = []
        self._open: dict | None = None

    def begin(self, key: str, agent: str, model: str) -> None:
        """Close the running step (if any) and start timing a new one."""
        self.end()
        self._open = {
            "key": key, "agent": agent, "model": model, "t0": time.time(),
            "usd0": self.usage.nebius_usd, "credits0": self.usage.tavily_credits,
        }

    def end(self) -> None:
        if not self._open:
            return
        s = self._open
        self.steps.append({
            "key": s["key"], "agent": s["agent"], "model": s["model"],
            "seconds": round(time.time() - s["t0"], 1),
            "usd": round(self.usage.nebius_usd - s["usd0"], 5),
            "tavily_credits": self.usage.tavily_credits - s["credits0"],
        })
        self._open = None

    def export(self, candidates: list[dict], picked_id: str, labels: dict[str, str], editable) -> dict:
        self.end()
        judged = [c for c in candidates if c.get("judge")] or candidates
        return {
            "steps": self.steps,
            "total_seconds": round(sum(s["seconds"] for s in self.steps), 1),
            "candidates": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "source_label": labels.get(c["source"], c["source"]),
                    "found_by": c.get("found_by"),
                    "thumbnail": c.get("thumbnail"),
                    "score": (c.get("judge") or {}).get("score"),
                    "reason": (c.get("judge") or {}).get("reason", ""),
                    "editable": bool(editable(c)),
                    "picked": c["id"] == picked_id,
                }
                for c in judged[:9]
            ],
        }
