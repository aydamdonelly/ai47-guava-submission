from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

import smartset_api.app as app_module
from smartset_api import retention_calls
from smartset_api.app import create_app
from smartset_api.schemas import InsightAnswer

CALL_ID = "smartset-0123456789abcdef0123456789abcdef"


def completed_events() -> list[dict[str, object]]:
    return [
        {
            "type": "call_started",
            "state": {"state": "agent_speaking", "activeNodeId": "outbound_call"},
        },
        {
            "type": "transcript_update",
            "transcript": {
                "speaker": "customer",
                "text": "I switched to MyFitnessPal because it already fits my routine.",
            },
        },
        {
            "type": "state_updated",
            "state": {
                "customerGoal": "Build muscle",
                "goalRelevant": True,
                "barrier": "other",
                "reengagementIntent": "maybe",
            },
        },
        {
            "type": "action_taken",
            "action": {"label": "Follow-up insight saved"},
        },
        {"type": "call_completed", "state": {"state": "completed"}, "metrics": []},
    ]


class FakeCallProcess:
    def __init__(self, events: list[dict[str, object]]) -> None:
        self._events = events

    def events(self, cursor: int = 0) -> tuple[list[dict[str, object]], int]:
        return self._events[cursor:], len(self._events)


def test_deterministic_analysis_extracts_grounded_recap() -> None:
    analysis = retention_calls.deterministic_call_analysis(completed_events())

    assert analysis.primary_barrier == "alternative"
    assert analysis.reason_label == "Switched to an alternative"
    assert analysis.customer_goal == "Build muscle"
    assert analysis.goal_relevant is True
    assert analysis.competitor == "MyFitnessPal"
    assert analysis.key_quote == (
        "I switched to MyFitnessPal because it already fits my routine."
    )
    assert analysis.return_intent == "maybe"
    assert analysis.outcome == "Follow-up insight saved"


def test_analysis_uses_fallback_without_anthropic(monkeypatch) -> None:
    monkeypatch.setattr(retention_calls, "_engine_env", dict)

    analysis = retention_calls.analyze_call_events(completed_events())

    assert analysis.primary_barrier == "alternative"
    assert analysis.competitor == "MyFitnessPal"


def test_analysis_endpoint_returns_camel_case_and_caches(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        retention_calls, "_anthropic_call_analysis", lambda events, fallback: None
    )
    app = create_app(frontend_dir=tmp_path)
    app.state.retention_calls[CALL_ID] = FakeCallProcess(completed_events())

    with TestClient(app) as client:
        first = client.get(f"/api/retention/calls/{CALL_ID}/analysis")
        second = client.get(f"/api/retention/calls/{CALL_ID}/analysis")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["primaryBarrier"] == "alternative"
    assert first.json()["customerGoal"] == "Build muscle"
    assert first.json()["goalRelevant"] is True
    assert set(first.json()) == {
        "summary",
        "customerGoal",
        "goalRelevant",
        "primaryBarrier",
        "reasonLabel",
        "competitor",
        "keyQuote",
        "returnIntent",
        "outcome",
        "emergingInsight",
    }
    assert CALL_ID in app.state.retention_analyses


def test_analysis_endpoint_rejects_running_call(tmp_path) -> None:
    app = create_app(frontend_dir=tmp_path)
    app.state.retention_calls[CALL_ID] = FakeCallProcess(completed_events()[:-1])

    with TestClient(app) as client:
        response = client.get(f"/api/retention/calls/{CALL_ID}/analysis")

    assert response.status_code == 409


def test_analysis_endpoint_reads_completed_jsonl_after_restart(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(retention_calls, "CALL_LOG_DIR", tmp_path)
    monkeypatch.setattr(
        retention_calls, "_anthropic_call_analysis", lambda events, fallback: None
    )
    event_path = tmp_path / f"{CALL_ID}.events.jsonl"
    event_path.write_text(
        "\n".join(json.dumps(event) for event in completed_events()) + "\n",
        encoding="utf-8",
    )
    app = create_app(frontend_dir=tmp_path / "missing-frontend")

    with TestClient(app) as client:
        response = client.get(f"/api/retention/calls/{CALL_ID}/analysis")

    assert response.status_code == 200
    assert response.json()["competitor"] == "MyFitnessPal"


def test_insight_question_includes_request_and_cached_analyses(
    monkeypatch, tmp_path
) -> None:
    captured: list[dict[str, object]] = []

    def fake_ask(question, analyses):
        assert question == "What changed?"
        captured.extend(analyses)
        return InsightAnswer(answer="Recent calls point to alternative-app switching.")

    monkeypatch.setattr(app_module, "ask_insights", fake_ask)
    app = create_app(frontend_dir=tmp_path)
    app.state.retention_analyses[CALL_ID] = retention_calls.deterministic_call_analysis(
        completed_events()
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/retention/insights/ask",
            json={
                "question": "What changed?",
                "analyses": [{"callId": "frontend-call", "customer": "Anonymous"}],
            },
        )

    assert response.status_code == 200
    assert len(captured) == 2
    assert captured[0]["callId"] == "frontend-call"
    assert captured[1]["callId"] == CALL_ID
