from __future__ import annotations

from dataclasses import dataclass
from typing import Any

PRIORITIES = ("immediate", "prompt", "routine", "answered")
LOW_CONFIDENCE_THRESHOLD = 0.75

_CATEGORY_ALIASES = {
    "medical": "clinical",
    "health": "clinical",
    "emergency": "clinical",
    "personal": "personal_care",
    "personal-care": "personal_care",
    "personal care": "personal_care",
    "adl": "personal_care",
    "faq": "information",
    "question": "information",
    "facility_information": "information",
    "activities": "social",
    "social_activity": "social",
    "comfort_request": "comfort",
    "clinical_concern": "clinical",
    "other": "unclear",
    "unknown": "unclear",
}
_KNOWN_CATEGORIES = {
    "clinical",
    "personal_care",
    "information",
    "social",
    "comfort",
    "unclear",
}
_RED_FLAGS = (
    "can't breathe",
    "cannot breathe",
    "difficulty breathing",
    "shortness of breath",
    "chest pain",
    "unresponsive",
    "not waking",
    "face droop",
    "facial droop",
    "arm feels numb",
    "numb arm",
    "trouble speaking",
    "can't speak",
    "cannot speak",
    "new weakness",
    "suddenly confused",
    "one-sided weakness",
    "can't lift my arm",
    "cannot lift my arm",
    "slurred speech",
    "stroke",
    "heavy bleeding",
    "severe bleeding",
    "head injury",
    "i fell",
    "has fallen",
    "severe pain",
    "seizure",
    "overdose",
    "suicidal",
    "atemnot",
    "brustschmerz",
    "schlaganfall",
    "arm ist taub",
    "nicht sprechen",
    "gestürzt",
    "starke schmerzen",
    "nicht ansprechbar",
    "starke blutung",
)
_HUMAN_REQUESTS = (
    "nurse",
    "caregiver",
    "care worker",
    "staff member",
    "i need help",
    "help me",
    "help me stand",
    "help me get up",
    "bathroom",
    "toilet",
    "change me",
    "reposition me",
    "transfer me",
    "pflegekraft",
    "pfleger",
    "toilette",
    "hilfe",
    "medication",
    "medicine",
    "pill",
    "medikament",
)
_VERIFIED_INFORMATION_FACTS = (
    (
        ("breakfast", "frühstück"),
        "Breakfast is served from 7:30 to 9:00 AM.",
    ),
    (
        ("lunch", "mittagessen", "mittag"),
        "Lunch is served at 12:30 PM. Today's lunch is tomato soup, baked chicken, and apple crisp.",
    ),
    (
        ("dinner", "abendessen"),
        "Dinner is served at 5:30 PM. Today's dinner is vegetable lasagna with a side salad.",
    ),
    (
        ("chair yoga", "afternoon activity", "yoga", "nachmittagsprogramm"),
        "Chair yoga starts at 3:30 PM in the garden room.",
    ),
    (
        ("movie", "evening activity", "tonight", "kino", "abendprogramm"),
        "Movie night starts at 6:30 PM in the community lounge. Tonight's film is Singin' in the Rain.",
    ),
)


@dataclass(frozen=True)
class SafetyDecision:
    category: str
    priority: str
    needs_staff: bool
    suggested_action: str
    reasons: tuple[str, ...]


def normalize_category(value: Any) -> str:
    normalized = (
        str(value or "unclear").strip().lower().replace("-", "_").replace(" ", "_")
    )
    normalized = _CATEGORY_ALIASES.get(normalized, normalized)
    return normalized if normalized in _KNOWN_CATEGORIES else "unclear"


def normalize_confidence(value: Any) -> tuple[str, float]:
    if isinstance(value, str):
        normalized = value.strip().lower()
        labels = {"high": 0.95, "medium": 0.8, "low": 0.4}
        if normalized in labels:
            return normalized, labels[normalized]
    try:
        score = float(value)
    except (TypeError, ValueError, OverflowError):
        return "low", 0.0
    if not 0 <= score <= 1:
        return "low", 0.0
    if score >= 0.9:
        return "high", score
    if score >= LOW_CONFIDENCE_THRESHOLD:
        return "medium", score
    return "low", score


def _normalize_priority(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in PRIORITIES else "immediate"


def _contains_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in text for phrase in phrases)


def _matches_verified_information(raw_request: Any, answer_given: Any) -> bool:
    request = str(raw_request or "").casefold()
    answer = str(answer_given or "").strip().casefold()
    return any(
        any(term in request for term in terms) and answer == verified_answer.casefold()
        for terms, verified_answer in _VERIFIED_INFORMATION_FACTS
    )


def apply_safety_policy(
    *,
    raw_request: Any,
    summary: Any,
    category: Any,
    model_urgency: Any,
    confidence: Any,
    needs_staff: Any,
    suggested_action: Any,
    answer_given: Any,
) -> SafetyDecision:
    """Apply deterministic guardrails, escalating to staff if evaluation fails."""
    try:
        normalized_category = normalize_category(category)
        priority = _normalize_priority(model_urgency)
        confidence_value = float(confidence)
        staff_required = bool(needs_staff)
        action = str(suggested_action or "").strip()
        combined_text = f"{raw_request or ''} {summary or ''}".lower()
        reasons: list[str] = []

        if _contains_any(combined_text, _RED_FLAGS):
            priority = "immediate"
            staff_required = True
            reasons.append("red_flag")
            action = (
                action
                or "Assess the resident immediately and follow emergency protocol."
            )

        if normalized_category == "clinical":
            priority = "immediate"
            staff_required = True
            reasons.append("clinical")
            action = (
                action
                or "Assess the resident immediately and follow clinical protocol."
            )

        if normalized_category == "unclear":
            priority = "immediate"
            staff_required = True
            reasons.append("unclear")
            action = (
                action
                or "Check the resident immediately; the request was not classified safely."
            )

        if (
            not 0 <= confidence_value <= 1
            or confidence_value < LOW_CONFIDENCE_THRESHOLD
        ):
            priority = "immediate"
            staff_required = True
            reasons.append("low_confidence")
            action = (
                action
                or "Check the resident immediately; classification confidence is low."
            )

        human_requested = normalized_category == "personal_care" or _contains_any(
            combined_text, _HUMAN_REQUESTS
        )
        if human_requested:
            if priority in {"routine", "answered"}:
                priority = "prompt"
            staff_required = True
            reasons.append("human_requested")
            action = (
                action or "Acknowledge the request and assist the resident promptly."
            )

        if normalized_category == "information":
            answer_is_verified = _matches_verified_information(
                raw_request, answer_given
            )
            if not answer_is_verified:
                if priority in {"routine", "answered"}:
                    priority = "prompt"
                staff_required = True
                reasons.append("unknown_information")
                action = (
                    action or "Have a staff member verify the answer and follow up."
                )
            elif priority != "immediate" and not staff_required:
                priority = "answered"
                reasons.append("answered_automatically")
                action = (
                    action
                    or "No staff action required; an approved answer was provided."
                )

        if normalized_category != "information" and priority == "answered":
            priority = "routine"
            staff_required = True
            reasons.append("non_information_requires_staff")
            action = (
                action or "A staff member should review and respond to the request."
            )

        if priority in {"immediate", "prompt"}:
            staff_required = True

        if priority == "immediate":
            action = "Assess the resident immediately and follow the facility's emergency protocol."

        return SafetyDecision(
            category=normalized_category,
            priority=priority,
            needs_staff=staff_required,
            suggested_action=action,
            reasons=tuple(dict.fromkeys(reasons)),
        )
    except (TypeError, ValueError, OverflowError):
        return SafetyDecision(
            category="unclear",
            priority="immediate",
            needs_staff=True,
            suggested_action="Check the resident immediately; safety evaluation failed open to staff.",
            reasons=("policy_failure",),
        )
