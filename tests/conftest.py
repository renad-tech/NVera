"""Tests run offline and free: mock mode on, Upstash off, memory in a temp file."""

import os

# Before anything imports backend.config (load_dotenv never overrides variables that are already set).
os.environ["NVERA_MOCK"] = "1"
os.environ["UPSTASH_REDIS_REST_URL"] = ""
os.environ["UPSTASH_REDIS_REST_TOKEN"] = ""
os.environ["NVERA_ACCESS_CODE"] = ""

import pytest  # noqa: E402

from backend import memory  # noqa: E402


@pytest.fixture(autouse=True)
def temp_memory(tmp_path, monkeypatch):
    monkeypatch.setattr(memory, "FILE", tmp_path / "history.jsonl")
    monkeypatch.setattr(memory.kv, "enabled", False)
