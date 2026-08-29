from __future__ import annotations

import pytest

from care_signal.policy import apply_safety_policy


def evaluate(**overrides):
    values = {
        "raw_request": "What time is lunch?",
        "summary": "Asked about lunch.",
        "category": "information",
        "model_urgency": "answered",
        "confidence": 0.99,
        "needs_staff": False,
        "suggested_action": "",
        "answer_given": (
            "Lunch is served at 12:30 PM. Today's lunch is tomato soup, baked chicken, "
            "and apple crisp."
        ),
    }
    values.update(overrides)
    return apply_safety_policy(**values)


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"raw_request": "I have chest pain."}, "red_flag"),
        ({"category": "clinical"}, "clinical"),
        ({"category": "something-new"}, "unclear"),
        ({"confidence": 0.4}, "low_confidence"),
    ],
)
def test_high_risk_signals_force_immediate(overrides, reason):
    decision = evaluate(**overrides)

    assert decision.priority == "immediate"
    assert decision.needs_staff is True
    assert decision.suggested_action.startswith("Assess the resident immediately")
    assert reason in decision.reasons


def test_red_flag_replaces_unsafe_model_action():
    decision = evaluate(
        raw_request="My arm feels numb and I am having trouble speaking.",
        category="comfort",
        model_urgency="routine",
        suggested_action="Bring water later.",
    )

    assert decision.priority == "immediate"
    assert decision.suggested_action.startswith("Assess the resident immediately")


def test_personal_care_cannot_be_answered_away():
    decision = evaluate(
        raw_request="Please help me get to the bathroom.",
        category="personal_care",
        model_urgency="answered",
    )

    assert decision.priority == "prompt"
    assert decision.needs_staff is True
    assert "human_requested" in decision.reasons


def test_known_information_can_be_answered_without_staff():
    decision = evaluate()

    assert decision.priority == "answered"
    assert decision.needs_staff is False
    assert decision.reasons == ("answered_automatically",)


def test_verified_answer_must_match_the_resident_question():
    decision = evaluate(raw_request="What time is bingo?")

    assert decision.priority == "prompt"
    assert decision.needs_staff is True
    assert "unknown_information" in decision.reasons


def test_only_verified_information_can_be_closed_without_staff():
    decision = evaluate(
        raw_request="Could I have some water?",
        category="comfort",
        model_urgency="answered",
        needs_staff=False,
    )

    assert decision.priority == "routine"
    assert decision.needs_staff is True
    assert "non_information_requires_staff" in decision.reasons


@pytest.mark.parametrize(
    "answer",
    [
        None,
        "",
        "I don't know",
        "Not available today",
        "I do not have a verified answer to that question.",
        "Sorry, I can't help with that.",
    ],
)
def test_unknown_information_reaches_staff(answer):
    decision = evaluate(answer_given=answer)

    assert decision.priority == "prompt"
    assert decision.needs_staff is True
    assert "unknown_information" in decision.reasons


def test_policy_failure_escalates_instead_of_raising():
    decision = evaluate(confidence=object())

    assert decision.priority == "immediate"
    assert decision.needs_staff is True
    assert decision.reasons == ("policy_failure",)
