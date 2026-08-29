from __future__ import annotations

from typing import Any

from care_signal.database import Database
from care_signal.policy import apply_safety_policy, normalize_confidence
from care_signal.schemas import IntakeCreate

_STATUS_ORDER = {"new": 0, "acknowledged": 1, "on_the_way": 2, "resolved": 3}


class InvalidStatusTransition(ValueError):
    pass


def create_intake(
    database: Database, payload: IntakeCreate | dict[str, Any], *, status: str = "new"
) -> dict[str, Any]:
    raw = payload.model_dump() if isinstance(payload, IntakeCreate) else dict(payload)
    confidence_label, confidence_score = normalize_confidence(raw.get("confidence"))
    decision = apply_safety_policy(
        raw_request=raw.get("raw_request"),
        summary=raw.get("summary"),
        category=raw.get("category"),
        model_urgency=raw.get("model_urgency"),
        confidence=confidence_score,
        needs_staff=raw.get("needs_staff"),
        suggested_action=raw.get("suggested_action"),
        answer_given=raw.get("answer_given"),
    )
    raw["summary"] = raw.get("summary") or str(raw.get("raw_request", ""))[:240]
    raw["confidence"] = confidence_label
    raw["source"] = raw.get("source") or "voice"
    raw["category"] = decision.category
    raw["priority"] = decision.priority
    raw["needs_staff"] = decision.needs_staff
    raw["suggested_action"] = decision.suggested_action
    raw["policy_reasons"] = list(decision.reasons)
    effective_status = "resolved" if decision.priority == "answered" else status
    return database.create_intake(raw, status=effective_status)


def transition_intake(
    database: Database, intake_id: str, target: str
) -> dict[str, Any] | None:
    allowed = tuple(
        status
        for status, order in _STATUS_ORDER.items()
        if order <= _STATUS_ORDER[target]
    )
    updated = database.update_intake_status(
        intake_id,
        target,
        allowed_current_statuses=allowed,
    )
    if updated is not None:
        return updated

    current = database.get_intake(intake_id)
    if current is None:
        return None
    raise InvalidStatusTransition(
        f"Cannot move an intake from {current['status']} back to {target}"
    )


def dashboard(database: Database) -> dict[str, Any]:
    requests = database.list_intakes()
    notes = database.list_notes()
    active = [request for request in requests if request["status"] != "resolved"]
    stats = {
        "total": len(requests),
        "active": len(active),
        "immediate": sum(request["priority"] == "immediate" for request in active),
        "prompt": sum(request["priority"] == "prompt" for request in active),
        "routine": sum(request["priority"] == "routine" for request in active),
        "answered": sum(request["priority"] == "answered" for request in requests),
        "new": sum(request["status"] == "new" for request in requests),
        "acknowledged": sum(
            request["status"] == "acknowledged" for request in requests
        ),
        "on_the_way": sum(request["status"] == "on_the_way" for request in requests),
        "resolved": sum(request["status"] == "resolved" for request in requests),
        "pending_notes": sum(note["status"] == "pending" for note in notes),
    }
    stats.update(
        waiting=stats["active"],
        answered_today=stats["answered"],
    )
    return {"requests": requests, "notes": notes, "stats": stats}
