from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections.abc import Mapping
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TextIO
from uuid import uuid4

BRAND = "Smartset"
TRIGGERS = ("cancellation", "usage_drop")
STATUSES = (
    "queued",
    "dialing",
    "answered",
    "completed",
    "partial",
    "no_answer",
    "voicemail",
    "do_not_call",
    "failed",
    "declined",
)
TERMINAL_STATUSES = frozenset(
    {
        "completed",
        "partial",
        "no_answer",
        "voicemail",
        "do_not_call",
        "failed",
        "declined",
    }
)
REASON_ORDER = (
    "price",
    "tracking_effort",
    "accuracy",
    "technical_issue",
    "missing_feature",
    "privacy",
    "goal_changed",
    "other",
    "unknown",
)
REASON_LABELS = {
    "price": "Price and value",
    "tracking_effort": "Tracking takes too much effort",
    "accuracy": "Accuracy and trust",
    "technical_issue": "Technical issues",
    "missing_feature": "Missing features",
    "privacy": "Privacy concerns",
    "goal_changed": "Goal or need changed",
    "other": "Other",
    "unknown": "Unknown",
}
RETURN_INTENTS = ("yes", "maybe", "no", "unknown")
CSV_COLUMNS = (
    "contact_id",
    "first_name",
    "phone_e164",
    "trigger",
    "plan",
    "baseline_weekly_events",
    "recent_weekly_events",
    "locale",
    "consent_to_call",
    "do_not_call",
)

_E164 = re.compile(r"^\+[1-9]\d{7,14}$")
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE = re.compile(r"(?<!\w)(?:\+?\d[\d ().-]{6,}\d)(?!\w)")
_TRUE = frozenset({"1", "true", "yes", "y"})
_FALSE = frozenset({"0", "false", "no", "n"})
_REASON_ALIASES = {
    "cost": "price",
    "price_value": "price",
    "too_expensive": "price",
    "tracking_friction": "tracking_effort",
    "effort": "tracking_effort",
    "accuracy_trust": "accuracy",
    "trust": "accuracy",
    "technical": "technical_issue",
    "missing_features": "missing_feature",
    "privacy_concern": "privacy",
    "goal_or_need_changed": "goal_changed",
    "changed_goal": "goal_changed",
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS outreach_interviews (
    id TEXT PRIMARY KEY,
    attempt_key TEXT NOT NULL UNIQUE,
    contact_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('cancellation', 'usage_drop')),
    plan TEXT NOT NULL,
    baseline_weekly_events INTEGER,
    recent_weekly_events INTEGER,
    locale TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'queued', 'dialing', 'answered', 'completed', 'partial',
            'no_answer', 'voicemail', 'do_not_call', 'failed', 'declined'
        )
    ),
    provider_call_id TEXT UNIQUE,
    satisfaction INTEGER CHECK (satisfaction BETWEEN 1 AND 5),
    primary_reason_words TEXT NOT NULL DEFAULT '',
    reason_code TEXT CHECK (
        reason_code IN (
            'price', 'tracking_effort', 'accuracy', 'technical_issue',
            'missing_feature', 'privacy', 'goal_changed', 'other', 'unknown'
        )
    ),
    biggest_friction TEXT NOT NULL DEFAULT '',
    desired_change TEXT NOT NULL DEFAULT '',
    return_intent TEXT NOT NULL DEFAULT 'unknown' CHECK (
        return_intent IN ('yes', 'maybe', 'no', 'unknown')
    ),
    follow_up_allowed INTEGER NOT NULL DEFAULT 0 CHECK (follow_up_allowed IN (0, 1)),
    source TEXT NOT NULL CHECK (source IN ('csv', 'live_demo', 'synthetic_seed')),
    is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_outreach_status
ON outreach_interviews(status, completed_at, id);
"""


class ValidationError(ValueError):
    pass


class AttemptConflict(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _text(value: object, *, field: str, required: bool = False) -> str:
    result = "" if value is None else str(value).strip()
    if required and not result:
        raise ValidationError(f"{field} is required")
    return result


def _boolean(value: object, *, field: str) -> bool:
    normalized = _text(value, field=field, required=True).casefold()
    if normalized in _TRUE:
        return True
    if normalized in _FALSE:
        return False
    raise ValidationError(f"{field} must be true or false")


def _optional_integer(value: object, *, field: str) -> int | None:
    normalized = _text(value, field=field)
    if not normalized:
        return None
    try:
        result = int(normalized)
    except ValueError as exc:
        raise ValidationError(f"{field} must be a non-negative integer") from exc
    if result < 0:
        raise ValidationError(f"{field} must be a non-negative integer")
    return result


@dataclass(frozen=True, slots=True)
class Contact:
    contact_id: str
    first_name: str
    phone_e164: str
    trigger: str
    plan: str = ""
    baseline_weekly_events: int | None = None
    recent_weekly_events: int | None = None
    locale: str = "en-US"
    consent_to_call: bool = False
    do_not_call: bool = False

    @classmethod
    def from_row(cls, row: Mapping[str, object], *, row_number: int | None = None) -> Contact:
        prefix = f"row {row_number}: " if row_number is not None else ""
        try:
            contact = cls(
                contact_id=_text(row.get("contact_id"), field="contact_id", required=True),
                first_name=_text(row.get("first_name"), field="first_name", required=True),
                phone_e164=_text(row.get("phone_e164"), field="phone_e164", required=True),
                trigger=_text(row.get("trigger"), field="trigger", required=True).casefold(),
                plan=_text(row.get("plan"), field="plan"),
                baseline_weekly_events=_optional_integer(
                    row.get("baseline_weekly_events"), field="baseline_weekly_events"
                ),
                recent_weekly_events=_optional_integer(
                    row.get("recent_weekly_events"), field="recent_weekly_events"
                ),
                locale=_text(row.get("locale"), field="locale") or "en-US",
                consent_to_call=_boolean(row.get("consent_to_call"), field="consent_to_call"),
                do_not_call=_boolean(row.get("do_not_call"), field="do_not_call"),
            )
            contact.validate()
            return contact
        except ValidationError as exc:
            raise ValidationError(f"{prefix}{exc}") from exc

    def validate(self) -> None:
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", self.contact_id):
            raise ValidationError("contact_id contains unsupported characters")
        if len(self.first_name) > 80:
            raise ValidationError("first_name must be at most 80 characters")
        if not _E164.fullmatch(self.phone_e164):
            raise ValidationError("phone_e164 must be an E.164 number")
        if self.trigger not in TRIGGERS:
            raise ValidationError(f"trigger must be one of: {', '.join(TRIGGERS)}")

    def assert_callable(self) -> None:
        self.validate()
        if not self.consent_to_call:
            raise ValidationError("contact has not consented to a call")
        if self.do_not_call:
            raise ValidationError("contact is on the do-not-call list")


def load_contacts_csv(source: str | Path | TextIO) -> list[Contact]:
    should_close = not hasattr(source, "read")
    file = (
        Path(source).expanduser().open("r", encoding="utf-8-sig", newline="")
        if should_close
        else source
    )
    try:
        reader = csv.DictReader(file)
        headers = tuple(reader.fieldnames or ())
        missing = [column for column in CSV_COLUMNS if column not in headers]
        unknown = [column for column in headers if column not in CSV_COLUMNS]
        if missing:
            raise ValidationError(f"missing CSV columns: {', '.join(missing)}")
        if unknown:
            raise ValidationError(f"unknown CSV columns: {', '.join(unknown)}")

        contacts: list[Contact] = []
        seen: set[str] = set()
        for row_number, row in enumerate(reader, start=2):
            contact = Contact.from_row(row, row_number=row_number)
            if contact.contact_id in seen:
                raise ValidationError(f"row {row_number}: duplicate contact_id")
            seen.add(contact.contact_id)
            contacts.append(contact)
        if not contacts:
            raise ValidationError("CSV contains no contacts")
        return contacts
    finally:
        if should_close:
            file.close()


def _satisfaction(value: object) -> int | None:
    normalized = _text(value, field="satisfaction")
    if not normalized:
        return None
    match = re.search(r"\b([1-5])\b", normalized)
    if not match:
        raise ValidationError("satisfaction must be between 1 and 5")
    return int(match.group(1))


def _reason(value: object) -> str:
    normalized = _text(value, field="reason_code").casefold().replace(" ", "_")
    normalized = _REASON_ALIASES.get(normalized, normalized)
    if not normalized:
        return "unknown"
    if normalized not in REASON_ORDER:
        return "other"
    return normalized


def _return_intent(value: object) -> str:
    normalized = _text(value, field="return_intent").casefold()
    aliases = {"likely": "yes", "possibly": "maybe", "unlikely": "no"}
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in RETURN_INTENTS else "unknown"


@dataclass(frozen=True, slots=True)
class InterviewResult:
    satisfaction: int | None
    primary_reason_words: str
    reason_code: str
    biggest_friction: str = ""
    desired_change: str = ""
    return_intent: str = "unknown"
    follow_up_allowed: bool = False

    @classmethod
    def from_mapping(
        cls, values: Mapping[str, object], *, allow_partial: bool = True
    ) -> InterviewResult:
        satisfaction = _satisfaction(values.get("satisfaction", values.get("satisfaction_score")))
        primary_reason_words = _text(
            values.get(
                "primary_reason_words",
                values.get("reason_summary", values.get("evidence_quote")),
            ),
            field="primary_reason_words",
        )
        reason_code = _reason(values.get("reason_code", values.get("primary_reason")))
        biggest_friction = _text(values.get("biggest_friction"), field="biggest_friction")
        desired_change = _text(
            values.get(
                "desired_change",
                values.get("desired_improvement", values.get("return_condition")),
            ),
            field="desired_change",
        )
        follow_up_value = values.get("follow_up_allowed", False)
        follow_up_allowed = (
            follow_up_value
            if isinstance(follow_up_value, bool)
            else _boolean(follow_up_value, field="follow_up_allowed")
        )
        result = cls(
            satisfaction=satisfaction,
            primary_reason_words=primary_reason_words,
            reason_code=reason_code,
            biggest_friction=biggest_friction,
            desired_change=desired_change,
            return_intent=_return_intent(values.get("return_intent")),
            follow_up_allowed=follow_up_allowed,
        )
        result.validate()
        if not allow_partial and not result.is_complete:
            raise ValidationError("interview result is incomplete")
        return result

    @property
    def is_complete(self) -> bool:
        return bool(
            self.satisfaction is not None
            and self.primary_reason_words
            and self.reason_code != "unknown"
        )

    def validate(self) -> None:
        if self.satisfaction is not None and not 1 <= self.satisfaction <= 5:
            raise ValidationError("satisfaction must be between 1 and 5")
        if self.reason_code not in REASON_ORDER:
            raise ValidationError("invalid reason_code")
        if self.return_intent not in RETURN_INTENTS:
            raise ValidationError("invalid return_intent")
        for field_name in (
            "primary_reason_words",
            "biggest_friction",
            "desired_change",
        ):
            if len(getattr(self, field_name)) > 2000:
                raise ValidationError(f"{field_name} must be at most 2000 characters")


class RetentionStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.executescript(_SCHEMA)
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def create_attempt(
        self,
        contact: Contact,
        attempt_key: str,
        *,
        source: str = "csv",
        is_synthetic: bool = False,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        attempt_key = _text(attempt_key, field="attempt_key", required=True)
        if len(attempt_key) > 160:
            raise ValidationError("attempt_key must be at most 160 characters")
        if source not in {"csv", "live_demo", "synthetic_seed"}:
            raise ValidationError("invalid source")
        if is_synthetic:
            if source != "synthetic_seed" or contact.phone_e164:
                raise ValidationError("synthetic seed contacts must not contain phone numbers")
        else:
            contact.assert_callable()

        now = created_at or utc_now()
        values = (
            str(uuid4()),
            attempt_key,
            contact.contact_id,
            contact.first_name,
            contact.phone_e164,
            contact.trigger,
            contact.plan,
            contact.baseline_weekly_events,
            contact.recent_weekly_events,
            contact.locale,
            source,
            int(is_synthetic),
            now,
            now,
        )
        with closing(self._connect()) as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO outreach_interviews (
                    id, attempt_key, contact_id, first_name, phone_e164, trigger, plan,
                    baseline_weekly_events, recent_weekly_events, locale, status,
                    source, is_synthetic, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
                """,
                values,
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM outreach_interviews WHERE attempt_key = ?", (attempt_key,)
            ).fetchone()
        assert row is not None
        result = self._row(row)
        expected = {
            "contact_id": contact.contact_id,
            "phone_e164": contact.phone_e164,
            "trigger": contact.trigger,
            "source": source,
            "is_synthetic": is_synthetic,
        }
        if any(result[key] != value for key, value in expected.items()):
            raise AttemptConflict("attempt_key already belongs to different input")
        return result

    def get_attempt(self, attempt_key: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM outreach_interviews WHERE attempt_key = ?", (attempt_key,)
            ).fetchone()
        return self._row(row) if row else None

    def list_attempts(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM outreach_interviews ORDER BY created_at, id"
            ).fetchall()
        return [self._row(row) for row in rows]

    def set_status(
        self, attempt_key: str, status: str, *, provider_call_id: str | None = None
    ) -> dict[str, Any]:
        if status not in STATUSES:
            raise ValidationError("invalid status")
        if status in {"completed", "partial"}:
            raise ValidationError("use complete_attempt to persist interview results")
        current = self.get_attempt(attempt_key)
        if current is None:
            raise KeyError(attempt_key)
        if (
            current["status"] in TERMINAL_STATUSES
            and current["status"] != status
            and status != "do_not_call"
        ):
            raise AttemptConflict("cannot change a terminal attempt")

        now = utc_now()
        started_at = now if status in {"dialing", "answered"} else None
        completed_at = now if status in TERMINAL_STATUSES else None
        try:
            with closing(self._connect()) as connection:
                connection.execute(
                    """
                    UPDATE outreach_interviews
                    SET status = ?,
                        provider_call_id = COALESCE(?, provider_call_id),
                        started_at = COALESCE(started_at, ?),
                        completed_at = COALESCE(completed_at, ?),
                        updated_at = ?
                    WHERE attempt_key = ?
                    """,
                    (
                        status,
                        provider_call_id,
                        started_at,
                        completed_at,
                        now,
                        attempt_key,
                    ),
                )
                connection.commit()
        except sqlite3.IntegrityError as exc:
            raise AttemptConflict("provider_call_id already exists") from exc
        result = self.get_attempt(attempt_key)
        assert result is not None
        return result

    def complete_attempt(
        self,
        attempt_key: str,
        result: InterviewResult | Mapping[str, object],
        *,
        completed_at: str | None = None,
    ) -> dict[str, Any]:
        if not isinstance(result, InterviewResult):
            result = InterviewResult.from_mapping(result)
        result.validate()
        target_status = "completed" if result.is_complete else "partial"
        current = self.get_attempt(attempt_key)
        if current is None:
            raise KeyError(attempt_key)

        result_fields = {
            "satisfaction": result.satisfaction,
            "primary_reason_words": result.primary_reason_words,
            "reason_code": result.reason_code,
            "biggest_friction": result.biggest_friction,
            "desired_change": result.desired_change,
            "return_intent": result.return_intent,
            "follow_up_allowed": result.follow_up_allowed,
        }
        if current["status"] == target_status and all(
            current[key] == value for key, value in result_fields.items()
        ):
            return current
        if current["status"] in TERMINAL_STATUSES and not (
            current["status"] == "partial" and target_status == "completed"
        ):
            raise AttemptConflict("attempt already has a different terminal result")

        now = completed_at or utc_now()
        with closing(self._connect()) as connection:
            connection.execute(
                """
                UPDATE outreach_interviews
                SET status = ?, satisfaction = ?, primary_reason_words = ?,
                    reason_code = ?, biggest_friction = ?, desired_change = ?,
                    return_intent = ?, follow_up_allowed = ?, completed_at = ?,
                    updated_at = ?
                WHERE attempt_key = ?
                """,
                (
                    target_status,
                    result.satisfaction,
                    result.primary_reason_words,
                    result.reason_code,
                    result.biggest_friction,
                    result.desired_change,
                    result.return_intent,
                    int(result.follow_up_allowed),
                    now,
                    now,
                    attempt_key,
                ),
            )
            connection.commit()
        completed = self.get_attempt(attempt_key)
        assert completed is not None
        return completed

    def insights(self) -> dict[str, Any]:
        rows = self.list_attempts()
        completed = [row for row in rows if row["status"] == "completed"]
        attempted_count = len(rows)
        completed_count = len(completed)

        by_reason: dict[str, list[dict[str, Any]]] = {}
        for row in sorted(completed, key=lambda item: (item["completed_at"] or "", item["id"])):
            by_reason.setdefault(row["reason_code"], []).append(row)

        reason_rank = {reason: index for index, reason in enumerate(REASON_ORDER)}
        ranked = sorted(
            by_reason.items(),
            key=lambda item: (-len(item[1]), reason_rank[item[0]]),
        )[:3]
        top_reasons = []
        for reason, reason_rows in ranked:
            quote_row = next((row for row in reason_rows if row["primary_reason_words"]), None)
            quote = (
                _redact_pii(
                    quote_row["primary_reason_words"],
                    first_name=quote_row["first_name"],
                    phone_e164=quote_row["phone_e164"],
                )[:240]
                if quote_row
                else ""
            )
            top_reasons.append(
                {
                    "reason": reason,
                    "label": REASON_LABELS[reason],
                    "count": len(reason_rows),
                    "share": _ratio(len(reason_rows), completed_count),
                    "example_quote": quote,
                }
            )

        scores = [row["satisfaction"] for row in completed]
        return_counts = {
            intent: sum(row["return_intent"] == intent for row in completed)
            for intent in RETURN_INTENTS
        }
        follow_up_count = sum(row["follow_up_allowed"] for row in completed)
        return {
            "brand": BRAND,
            "scope": {
                "attempted": attempted_count,
                "completed": completed_count,
                "completion_rate": _ratio(completed_count, attempted_count),
                "synthetic_completed": sum(row["is_synthetic"] for row in completed),
                "live_completed": sum(not row["is_synthetic"] for row in completed),
            },
            "satisfaction": {
                "responses": len(scores),
                "average": round(sum(scores) / len(scores), 2) if scores else None,
                "distribution": {
                    str(score): sum(value == score for value in scores) for score in range(1, 6)
                },
            },
            "top_reasons": top_reasons,
            "return_intent": return_counts,
            "follow_up_opt_in": {
                "count": follow_up_count,
                "share": _ratio(follow_up_count, completed_count),
            },
        }

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["follow_up_allowed"] = bool(result["follow_up_allowed"])
        result["is_synthetic"] = bool(result["is_synthetic"])
        return result


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 3) if denominator else 0.0


def _redact_pii(text: str, *, first_name: str, phone_e164: str) -> str:
    redacted = _EMAIL.sub("[email]", text)
    redacted = _PHONE.sub("[phone]", redacted)
    if phone_e164:
        redacted = redacted.replace(phone_e164, "[phone]")
    if first_name:
        redacted = re.sub(rf"\b{re.escape(first_name)}\b", "[name]", redacted, flags=re.I)
    return " ".join(redacted.split())


_SEED_RESULTS = (
    (
        "Jordan",
        "usage_drop",
        24,
        4,
        InterviewResult(
            2,
            "The yearly plan stopped feeling worth it once I used the app less.",
            "price",
            "Paying for a full year when motivation changes.",
            "A flexible pause option or a lighter plan.",
            "maybe",
            True,
        ),
    ),
    (
        "Taylor",
        "cancellation",
        18,
        2,
        InterviewResult(
            3,
            "I liked it, but the subscription costs more than I use it now.",
            "price",
            "The annual commitment felt too large.",
            "A lower-usage plan.",
            "maybe",
            False,
        ),
    ),
    (
        "Morgan",
        "usage_drop",
        28,
        6,
        InterviewResult(
            2,
            "Logging every ingredient became too much work on busy days.",
            "tracking_effort",
            "Correcting portions took too many taps.",
            "A faster one-tap correction flow.",
            "yes",
            True,
        ),
    ),
    (
        "Casey",
        "cancellation",
        20,
        3,
        InterviewResult(
            2,
            "I stopped because tracking dinner took longer than eating it.",
            "tracking_effort",
            "Multi-item meals were slow to edit.",
            "Reusable meal templates.",
            "yes",
            True,
        ),
    ),
    (
        "Riley",
        "usage_drop",
        21,
        5,
        InterviewResult(
            3,
            "The photo estimates changed too much for the same meal.",
            "accuracy",
            "Inconsistent portions reduced trust.",
            "Clearer confidence ranges and easier corrections.",
            "maybe",
            True,
        ),
    ),
    (
        "Avery",
        "cancellation",
        16,
        1,
        InterviewResult(
            2,
            "I could not trust calories when restaurant meals looked wrong.",
            "accuracy",
            "Restaurant estimates were hard to verify.",
            "Show the source and confidence for every estimate.",
            "yes",
            False,
        ),
    ),
    (
        "Quinn",
        "usage_drop",
        14,
        4,
        InterviewResult(
            4,
            "I needed shared household recipes and could not find that feature.",
            "missing_feature",
            "Recipes could not be shared with family.",
            "Shared recipe collections.",
            "yes",
            True,
        ),
    ),
    (
        "Cameron",
        "cancellation",
        12,
        0,
        InterviewResult(
            4,
            "I reached my goal and no longer needed daily calorie tracking.",
            "goal_changed",
            "The app did not offer a maintenance mode.",
            "A lightweight maintenance check-in.",
            "maybe",
            False,
        ),
    ),
)


def seed_demo_results(store: RetentionStore) -> list[dict[str, Any]]:
    seeded = []
    for index, (first_name, trigger, baseline, recent, result) in enumerate(_SEED_RESULTS, start=1):
        contact = Contact(
            contact_id=f"synthetic-{index:03d}",
            first_name=first_name,
            phone_e164="",
            trigger=trigger,
            plan="annual",
            baseline_weekly_events=baseline,
            recent_weekly_events=recent,
            locale="en-US",
            consent_to_call=False,
            do_not_call=True,
        )
        attempt_key = f"dailyfuel-seed-{index:03d}"
        store.create_attempt(
            contact,
            attempt_key,
            source="synthetic_seed",
            is_synthetic=True,
            created_at=f"2026-08-29T17:{index:02d}:00Z",
        )
        seeded.append(
            store.complete_attempt(
                attempt_key,
                result,
                completed_at=f"2026-08-29T17:{index:02d}:30Z",
            )
        )
    return seeded


def insights_json(store: RetentionStore) -> str:
    return json.dumps(store.insights(), indent=2, sort_keys=True)
