"""Tiny Upstash Redis client (REST API), so memory and the usage ledger survive restarts.

Free hosts like Render wipe local files on every restart or deploy. When UPSTASH_REDIS_REST_URL
and UPSTASH_REDIS_REST_TOKEN are set, memory.py and usage.py keep their data here instead of in
memory/. Without them everything falls back to local files, as before.
"""

import logging

import requests

from backend import config

log = logging.getLogger("nvera")
enabled = bool(config.UPSTASH_URL and config.UPSTASH_TOKEN)


def cmd(*args):
    """Run one Redis command, e.g. cmd("RPUSH", "key", "value"). Returns Redis' result."""
    r = requests.post(
        config.UPSTASH_URL,
        json=[str(a) for a in args],
        headers={"Authorization": f"Bearer {config.UPSTASH_TOKEN}"},
        timeout=10,
    )
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(f"Upstash: {body['error']}")
    return body.get("result")
