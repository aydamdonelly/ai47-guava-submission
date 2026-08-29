from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

_SCHEMA = """
CREATE TABLE IF NOT EXISTS intakes (
    id TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    resident TEXT NOT NULL,
    raw_request TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT NOT NULL,
    model_urgency TEXT NOT NULL,
    confidence TEXT NOT NULL,
    needs_staff INTEGER NOT NULL,
    suggested_action TEXT NOT NULL,
    answer_given TEXT,
    note_candidate TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('immediate', 'prompt', 'routine', 'answered')),
    policy_reasons TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('new', 'acknowledged', 'on_the_way', 'resolved')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    intake_id TEXT NOT NULL UNIQUE REFERENCES intakes(id) ON DELETE CASCADE,
    room TEXT NOT NULL,
    resident TEXT NOT NULL,
    note_candidate TEXT NOT NULL,
    source_quote TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_intakes_queue ON intakes(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status, created_at);
"""


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path).expanduser().resolve()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=5, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def initialize(self) -> None:
        with closing(self._connect()) as connection:
            connection.executescript(_SCHEMA)
            connection.commit()

    def ping(self) -> bool:
        try:
            with closing(self._connect()) as connection:
                return connection.execute("SELECT 1").fetchone()[0] == 1
        except sqlite3.Error:
            return False

    def create_intake(
        self, values: dict[str, Any], *, status: str = "new"
    ) -> dict[str, Any]:
        now = values.get("created_at") or utc_now()
        intake_id = str(uuid4())
        fields = (
            "room",
            "resident",
            "raw_request",
            "summary",
            "category",
            "model_urgency",
            "confidence",
            "needs_staff",
            "suggested_action",
            "answer_given",
            "note_candidate",
            "priority",
            "policy_reasons",
            "source",
        )
        parameters = [values[field] for field in fields]
        parameters[7] = int(bool(parameters[7]))
        parameters[12] = json.dumps(parameters[12], separators=(",", ":"))

        with closing(self._connect()) as connection:
            connection.execute(
                f"""
                INSERT INTO intakes (id, {", ".join(fields)}, status, created_at, updated_at)
                VALUES (?, {", ".join("?" for _ in fields)}, ?, ?, ?)
                """,
                (intake_id, *parameters, status, now, now),
            )
            if values.get("note_candidate"):
                connection.execute(
                    """
                    INSERT INTO notes (
                        id, intake_id, room, resident, note_candidate, source_quote,
                        status, created_at, reviewed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
                    """,
                    (
                        str(uuid4()),
                        intake_id,
                        values["room"],
                        values["resident"],
                        values["note_candidate"],
                        values["raw_request"],
                        now,
                    ),
                )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM intakes WHERE id = ?", (intake_id,)
            ).fetchone()
        return self._intake_dict(row)

    def get_intake(self, intake_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM intakes WHERE id = ?", (intake_id,)
            ).fetchone()
        return self._intake_dict(row) if row else None

    def list_intakes(
        self, *, status: str | None = None, priority: str | None = None
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        parameters: list[str] = []
        if status:
            clauses.append("status = ?")
            parameters.append(status)
        if priority:
            clauses.append("priority = ?")
            parameters.append(priority)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        query = f"""
            SELECT * FROM intakes
            {where}
            ORDER BY
                CASE status WHEN 'resolved' THEN 1 ELSE 0 END,
                CASE priority
                    WHEN 'immediate' THEN 0
                    WHEN 'prompt' THEN 1
                    WHEN 'routine' THEN 2
                    ELSE 3
                END,
                created_at DESC,
                id DESC
        """
        with closing(self._connect()) as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [self._intake_dict(row) for row in rows]

    def update_intake_status(
        self,
        intake_id: str,
        status: str,
        *,
        allowed_current_statuses: tuple[str, ...] | None = None,
    ) -> dict[str, Any] | None:
        now = utc_now()
        allowed_clause = ""
        parameters: list[str] = [status, now, intake_id]
        if allowed_current_statuses:
            placeholders = ", ".join("?" for _ in allowed_current_statuses)
            allowed_clause = f" AND status IN ({placeholders})"
            parameters.extend(allowed_current_statuses)
        with closing(self._connect()) as connection:
            cursor = connection.execute(
                f"UPDATE intakes SET status = ?, updated_at = ? WHERE id = ?{allowed_clause}",
                parameters,
            )
            connection.commit()
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                "SELECT * FROM intakes WHERE id = ?", (intake_id,)
            ).fetchone()
        return self._intake_dict(row)

    def get_note(self, note_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM notes WHERE id = ?", (note_id,)
            ).fetchone()
        return self._note_dict(row) if row else None

    def list_notes(self, *, status: str | None = None) -> list[dict[str, Any]]:
        where = "WHERE status = ?" if status else ""
        parameters = (status,) if status else ()
        with closing(self._connect()) as connection:
            rows = connection.execute(
                f"""
                SELECT * FROM notes
                {where}
                ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id DESC
                """,
                parameters,
            ).fetchall()
        return [self._note_dict(row) for row in rows]

    def update_note_status(self, note_id: str, status: str) -> dict[str, Any] | None:
        reviewed_at = utc_now()
        with closing(self._connect()) as connection:
            cursor = connection.execute(
                "UPDATE notes SET status = ?, reviewed_at = ? WHERE id = ?",
                (status, reviewed_at, note_id),
            )
            connection.commit()
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                "SELECT * FROM notes WHERE id = ?", (note_id,)
            ).fetchone()
        return self._note_dict(row)

    def clear_demo_data(self) -> None:
        with closing(self._connect()) as connection:
            connection.execute("DELETE FROM notes")
            connection.execute("DELETE FROM intakes")
            connection.commit()

    def clear_seeded_demo_data(self) -> None:
        with closing(self._connect()) as connection:
            connection.execute("DELETE FROM intakes WHERE source = 'demo_seed'")
            connection.commit()

    @staticmethod
    def _intake_dict(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["needs_staff"] = bool(result["needs_staff"])
        try:
            result["policy_reasons"] = json.loads(result["policy_reasons"])
        except (TypeError, json.JSONDecodeError):
            result["policy_reasons"] = ["policy_failure"]
        result["resident_name"] = result["resident"]
        result["rationale"] = Database._rationale(result["policy_reasons"])
        return result

    @staticmethod
    def _note_dict(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["resident_name"] = result["resident"]
        result["content"] = result["note_candidate"]
        return result

    @staticmethod
    def _rationale(reasons: list[str]) -> str:
        messages = {
            "red_flag": "Possible safety red flag detected; immediate staff review is required.",
            "clinical": "Clinical concerns always route to immediate staff review.",
            "unclear": "The request was unclear, so it was escalated instead of guessed.",
            "low_confidence": "Classification confidence was low, so staff must verify it.",
            "human_requested": "The resident requested hands-on or human assistance.",
            "unknown_information": "No verified answer was available, so staff follow-up is required.",
            "answered_automatically": "A verified facility answer was provided without a staff trip.",
            "non_information_requires_staff": "Only verified facility questions can be closed without staff review.",
            "policy_failure": "Safety evaluation failed open to immediate staff review.",
        }
        selected = [messages[reason] for reason in reasons if reason in messages]
        return " ".join(selected) or "Routed from the voice agent's structured handoff."
