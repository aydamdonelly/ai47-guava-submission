from __future__ import annotations

from typing import Any

from care_signal.database import Database
from care_signal.service import create_intake

DEMO_INTAKES: tuple[dict[str, Any], ...] = (
    {
        "room": "108",
        "resident": "Frank Miller",
        "raw_request": "Could I have a glass of water?",
        "summary": "Requests a glass of water.",
        "category": "comfort",
        "model_urgency": "routine",
        "confidence": 0.97,
        "needs_staff": True,
        "suggested_action": "Bring water on the next room round.",
        "answer_given": "The request was sent to the care team.",
        "note_candidate": None,
        "source": "demo_seed",
        "status": "new",
    },
    {
        "room": "214",
        "resident": "Evelyn Brooks",
        "raw_request": "I need help getting to the bathroom.",
        "summary": "Requests transfer assistance to the bathroom.",
        "category": "personal_care",
        "model_urgency": "prompt",
        "confidence": 0.97,
        "needs_staff": True,
        "suggested_action": "Assist with a bathroom transfer.",
        "answer_given": "A caregiver has been notified.",
        "note_candidate": None,
        "source": "demo_seed",
        "status": "acknowledged",
    },
    {
        "room": "302",
        "resident": "June Park",
        "raw_request": "What time is lunch today?",
        "summary": "Asked for today's lunch time.",
        "category": "information",
        "model_urgency": "answered",
        "confidence": 0.99,
        "needs_staff": False,
        "suggested_action": "",
        "answer_given": (
            "Lunch is served at 12:30 PM. Today's lunch is tomato soup, baked chicken, "
            "and apple crisp."
        ),
        "note_candidate": None,
        "source": "demo_seed",
        "status": "resolved",
    },
    {
        "room": "225",
        "resident": "Arthur Chen",
        "raw_request": "I prefer decaf coffee after three in the afternoon.",
        "summary": "Shared an afternoon beverage preference.",
        "category": "comfort",
        "model_urgency": "routine",
        "confidence": 0.96,
        "needs_staff": False,
        "suggested_action": "Review and save the preference to the resident profile.",
        "answer_given": "I noted that for staff to review.",
        "note_candidate": "Resident prefers decaf coffee after 3 PM.",
        "source": "demo_seed",
        "status": "resolved",
    },
)


def seed_demo(database: Database, *, reset: bool = True) -> list[dict[str, Any]]:
    if reset:
        database.clear_demo_data()
    else:
        database.clear_seeded_demo_data()

    seeded: list[dict[str, Any]] = []
    for item in DEMO_INTAKES:
        values = dict(item)
        status = values.pop("status")
        seeded.append(create_intake(database, values, status=status))
    return seeded
