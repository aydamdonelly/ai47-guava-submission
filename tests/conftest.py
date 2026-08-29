from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from care_signal.app import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(
        database_path=tmp_path / "test.sqlite3",
        frontend_dir=tmp_path / "missing-frontend",
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def base_intake():
    return {
        "room": "101",
        "resident": "Test Resident",
        "raw_request": "What time is lunch?",
        "summary": "Asked about lunch time.",
        "category": "information",
        "model_urgency": "answered",
        "confidence": 0.98,
        "needs_staff": False,
        "suggested_action": "",
        "answer_given": (
            "Lunch is served at 12:30 PM. Today's lunch is tomato soup, baked chicken, "
            "and apple crisp."
        ),
        "note_candidate": None,
    }
