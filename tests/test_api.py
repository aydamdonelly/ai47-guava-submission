from __future__ import annotations

from fastapi.testclient import TestClient

from care_signal.app import create_app


def test_health_and_config(client):
    health = client.get("/api/health")
    config = client.get("/api/config")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert config.status_code == 200
    assert config.json()["low_confidence_threshold"] == 0.75
    assert config.json()["statuses"] == [
        "new",
        "acknowledged",
        "on_the_way",
        "resolved",
    ]


def test_staff_api_requires_demo_token(tmp_path, base_intake):
    app = create_app(
        database_path=tmp_path / "protected.sqlite3",
        frontend_dir=tmp_path / "missing-frontend",
        demo_token="demo-secret",
    )
    headers = {"X-CareSignal-Token": "demo-secret"}

    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/config").status_code == 200
        assert client.get("/api/dashboard").status_code == 401
        assert (
            client.get(
                "/api/dashboard", headers={"X-CareSignal-Token": "wrong"}
            ).status_code
            == 401
        )
        assert client.get("/api/dashboard", headers=headers).status_code == 200
        assert client.post("/api/intakes", json=base_intake).status_code == 401
        assert (
            client.post("/api/intakes", json=base_intake, headers=headers).status_code
            == 201
        )


def test_create_list_and_persist_intake(tmp_path, base_intake):
    database_path = tmp_path / "persistent.sqlite3"
    with TestClient(create_app(database_path=database_path)) as client:
        created = client.post("/api/intakes", json=base_intake)
        assert created.status_code == 201
        assert created.json()["priority"] == "answered"
        assert created.json()["status"] == "resolved"
        assert client.get("/api/dashboard").json()["stats"]["waiting"] == 0

    with TestClient(create_app(database_path=database_path)) as restarted_client:
        records = restarted_client.get("/api/intakes").json()

    assert len(records) == 1
    assert records[0]["raw_request"] == base_intake["raw_request"]


def test_red_flag_overrides_model_output(client, base_intake):
    payload = {
        **base_intake,
        "raw_request": "I have chest pain and cannot breathe.",
        "summary": "Resident says this is probably nothing.",
    }

    response = client.post("/api/intakes", json=payload)

    assert response.status_code == 201
    record = response.json()
    assert record["priority"] == "immediate"
    assert record["needs_staff"] is True
    assert "red_flag" in record["policy_reasons"]


def test_status_progression_and_regression_guard(client, base_intake):
    payload = {
        **base_intake,
        "raw_request": "Could I have a glass of water?",
        "summary": "Requests water.",
        "category": "comfort",
        "model_urgency": "routine",
        "needs_staff": True,
        "answer_given": None,
    }
    intake_id = client.post("/api/intakes", json=payload).json()["id"]

    assert (
        client.patch(
            f"/api/intakes/{intake_id}/status", json={"status": "on_the_way"}
        ).json()["requests"][0]["status"]
        == "on_the_way"
    )
    conflict = client.patch(
        f"/api/intakes/{intake_id}/status", json={"status": "acknowledged"}
    )
    assert conflict.status_code == 409
    assert (
        client.patch(
            f"/api/intakes/{intake_id}/status", json={"status": "resolved"}
        ).json()["requests"][0]["status"]
        == "resolved"
    )


def test_note_candidate_enters_review_queue(client, base_intake):
    payload = {**base_intake, "note_candidate": "Resident prefers lunch by the window."}
    intake = client.post("/api/intakes", json=payload).json()

    notes = client.get("/api/notes").json()
    assert len(notes) == 1
    assert notes[0]["intake_id"] == intake["id"]
    assert notes[0]["status"] == "pending"

    reviewed = client.patch(
        f"/api/notes/{notes[0]['id']}/status", json={"status": "approved"}
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["notes"][0]["status"] == "approved"
    assert reviewed.json()["notes"][0]["reviewed_at"] is not None


def test_seed_is_deterministic_and_dashboard_has_stats(client, base_intake):
    client.post("/api/intakes", json=base_intake)

    first = client.post("/api/demo/seed").json()
    second = client.post("/api/demo/seed").json()

    assert first["seeded"] == 4
    assert len(first["requests"]) == 4
    assert len(second["requests"]) == 4
    assert second["stats"] == {
        "total": 4,
        "active": 2,
        "immediate": 0,
        "prompt": 1,
        "routine": 1,
        "answered": 1,
        "new": 1,
        "acknowledged": 1,
        "on_the_way": 0,
        "resolved": 2,
        "pending_notes": 1,
        "waiting": 2,
        "answered_today": 1,
    }


def test_non_reset_seed_refreshes_only_synthetic_cases(client, base_intake):
    live = client.post(
        "/api/intakes",
        json={
            **base_intake,
            "raw_request": "Please send a nurse.",
            "summary": "Explicitly requests a nurse.",
            "category": "personal_care",
            "model_urgency": "prompt",
            "needs_staff": True,
            "answer_given": None,
            "source": "guava_phone",
        },
    ).json()

    first = client.post("/api/demo/seed?reset=false").json()
    second = client.post("/api/demo/seed?reset=false").json()

    assert first["seeded"] == 4
    assert second["seeded"] == 4
    assert len(second["requests"]) == 5
    assert any(request["id"] == live["id"] for request in second["requests"])


def test_validation_and_missing_records(client, base_intake):
    invalid = client.post("/api/intakes", json={**base_intake, "room": ""})

    assert invalid.status_code == 422
    assert client.get("/api/intakes/999").status_code == 404
    assert (
        client.patch("/api/intakes/999/status", json={"status": "resolved"}).status_code
        == 404
    )
    assert (
        client.patch("/api/notes/999/status", json={"status": "approved"}).status_code
        == 404
    )


def test_guava_agent_payload_matches_api_contract(client):
    payload = {
        "room": "204",
        "resident_name": "Evelyn Carter",
        "created_at": "2026-08-29T22:47:00+00:00",
        "source": "guava_phone",
        "raw_request": "Please help me get to the bathroom.",
        "summary": "Resident requests bathroom assistance.",
        "category": "personal_care",
        "model_urgency": "prompt",
        "confidence": "high",
        "needs_staff": True,
        "suggested_action": "Assist with a safe transfer.",
        "answer_given": None,
        "note_candidate": "Resident prefers the hall light left on.",
    }

    response = client.post("/api/intakes", json=payload)

    assert response.status_code == 201
    record = response.json()
    assert record["resident_name"] == "Evelyn Carter"
    assert record["confidence"] == "high"
    assert record["priority"] == "prompt"
    assert record["source"] == "guava_phone"
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["notes"][0]["content"] == payload["note_candidate"]
    assert dashboard["notes"][0]["source_quote"] == payload["raw_request"]


def test_root_redirects_to_docs_without_frontend(client):
    response = client.get("/", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_built_frontend_and_spa_fallback_are_served(tmp_path):
    frontend = tmp_path / "dist"
    frontend.mkdir()
    (frontend / "index.html").write_text("<h1>CareSignal</h1>", encoding="utf-8")
    (frontend / "app.js").write_text("console.log('ready')", encoding="utf-8")

    with TestClient(
        create_app(database_path=tmp_path / "frontend.sqlite3", frontend_dir=frontend)
    ) as client:
        assert "CareSignal" in client.get("/").text
        assert "ready" in client.get("/app.js").text
        assert "CareSignal" in client.get("/queue/214").text
        assert client.get("/api/does-not-exist").status_code == 404
