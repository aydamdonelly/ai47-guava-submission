from __future__ import annotations

from dataclasses import asdict, is_dataclass

import pytest
from guava.commands import SendCallerTextCommand, SendInstructionCommand, SetTaskCommand
from guava.events import BotSessionEnded
from guava.testing import MockCall
from retention_engine.agent_app import (
    REASON_CODES,
    build_agent,
    extract_interview_fields,
    interview_reason_question,
    normalize_choice,
    normalize_text,
    permission_granted,
)


class FakeStore:
    def __init__(self) -> None:
        self.attempt = {"first_name": "Jordan", "trigger": "usage_drop"}
        self.statuses: list[tuple[str, str, str | None]] = []
        self.results: list[tuple[str, object]] = []

    def get_attempt(self, attempt_key: str) -> object:
        assert attempt_key == "attempt-1"
        return self.attempt

    def set_status(
        self,
        attempt_key: str,
        status: str,
        provider_call_id: str | None = None,
    ) -> None:
        self.statuses.append((attempt_key, status, provider_call_id))

    def complete_attempt(self, attempt_key: str, result: object) -> None:
        self.results.append((attempt_key, result))


def result_mapping(result: object) -> dict[str, object]:
    if isinstance(result, dict):
        return result
    if is_dataclass(result):
        return asdict(result)
    return {
        key: getattr(result, key)
        for key in (
            "satisfaction",
            "primary_reason_words",
            "reason_code",
            "biggest_friction",
            "desired_change",
            "return_intent",
            "follow_up_allowed",
        )
    }


def task_commands(call: MockCall) -> list[SetTaskCommand]:
    return [command for command in call._command_queue if isinstance(command, SetTaskCommand)]


def test_normalization_and_extraction_are_closed_and_deterministic() -> None:
    assert normalize_text("  too   much work  ") == "too much work"
    assert normalize_choice(" Tracking effort ", REASON_CODES) == "tracking_effort"
    assert normalize_choice("made_up", REASON_CODES, default="unknown") == "unknown"
    assert permission_granted(" YES ") is True
    assert permission_granted(None) is False

    result = extract_interview_fields(
        {
            "satisfaction": "4",
            "primary_reason_words": "  Logging took too long. ",
            "reason_code": "tracking-effort",
            "biggest_friction": "Too many taps",
            "desired_change": "Faster photo logging",
            "return_intent": "Maybe",
            "follow_up_allowed": "yes",
        }
    )

    assert result == {
        "satisfaction": 4,
        "primary_reason_words": "Logging took too long.",
        "reason_code": "tracking_effort",
        "biggest_friction": "Too many taps",
        "desired_change": "Faster photo logging",
        "return_intent": "maybe",
        "follow_up_allowed": True,
    }


def test_call_start_discloses_ai_and_reaches_named_person() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall(session_id="call-1")

    assert agent._on_call_start is not None
    agent._on_call_start(call)

    reach_task = task_commands(call)[-1]
    assert reach_task.task_id == "reach_person"
    opening = reach_task.action_items[0]
    assert "AI assistant" in opening.statement
    assert "Smartset" in opening.statement
    assert "Jordan" in opening.statement
    availability = next(
        item
        for item in reach_task.action_items
        if getattr(item, "key", "") == "contact_availability"
    )
    assert "do_not_contact" in availability.choices
    assert "hang up" in reach_task.objective.casefold()
    assert not any(
        isinstance(command, SendCallerTextCommand) for command in call._command_queue
    )
    assert store.statuses[-1] == ("attempt-1", "answered", "call-1")


def test_permission_gate_precedes_goal_discovery() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall()
    call.set_field("contact_availability", "available")

    agent._on_task_complete_handlers["reach_person"](call)

    assert [task.task_id for task in task_commands(call)] == ["permission"]
    permission_task = task_commands(call)[0]
    assert "transcribed" in permission_task.action_items[0].question
    assert "stop at any time" in permission_task.action_items[0].question
    assert permission_task.action_items[0].choices == ["yes", "no"]

    call.set_field("interview_permission", "yes")
    agent._on_task_complete_handlers["permission"](call)

    goal_task = task_commands(call)[-1]
    assert goal_task.task_id == "goal_discovery"
    assert [item.key for item in goal_task.action_items if hasattr(item, "field_type")] == [
        "original_goal_words"
    ]
    assert "do not suggest categories" in goal_task.objective.casefold()


def test_relevant_goal_leads_to_one_open_barrier_question() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall()
    call.set_field("original_goal_words", "Eat more consistently during the week.")

    agent._on_task_complete_handlers["goal_discovery"](call)
    relevance_task = task_commands(call)[-1]
    assert relevance_task.task_id == "goal_relevance"
    assert [item.key for item in relevance_task.action_items if hasattr(item, "field_type")] == [
        "goal_relevant"
    ]

    call.set_field("goal_relevant", "yes")
    agent._on_task_complete_handlers["goal_relevance"](call)

    interview_task = task_commands(call)[-1]
    assert interview_task.task_id == "interview"
    assert [item.key for item in interview_task.action_items if hasattr(item, "field_type")] == [
        "primary_reason_words",
        "reason_code",
        "biggest_friction",
    ]
    assert "Never defend the product" in interview_task.objective
    assert "propose an incentive" in interview_task.objective
    friction_field = next(
        item
        for item in interview_task.action_items
        if getattr(item, "key", "") == "biggest_friction"
    )
    assert not friction_field.question


def test_obsolete_goal_ends_the_call_without_a_retention_attempt() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1", offer={"label": "one free month", "months": 1})
    call = MockCall()
    call.set_field("original_goal_words", "Train for one specific race.")
    call.set_field("goal_relevant", "no")

    agent._on_task_complete_handlers["goal_relevance"](call)
    goal_changed_task = task_commands(call)[-1]
    assert goal_changed_task.task_id == "goal_changed"

    call.set_field("goal_change_reason", "The race is over.")
    agent._on_task_complete_handlers["goal_changed"](call)

    assert [task.task_id for task in task_commands(call)] == ["goal_changed"]
    persisted = result_mapping(store.results[0][1])
    assert persisted["reason_code"] == "goal_changed"
    assert persisted["primary_reason_words"] == "The race is over."


def test_declining_permission_ends_without_starting_interview() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall()
    call.set_field("interview_permission", "no")

    agent._on_task_complete_handlers["permission"](call)

    assert not task_commands(call)
    assert store.statuses[-1][1] == "declined"
    assert any(isinstance(command, SendInstructionCommand) for command in call._command_queue)


def test_interview_validates_the_barrier_before_persisting() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall()
    call.set_field("primary_reason_words", "It took too long to log every meal.")
    call.set_field("reason_code", "tracking_effort")
    call.set_field("biggest_friction", "Manual corrections")

    agent._on_task_complete_handlers["interview"](call)

    validation_task = task_commands(call)[-1]
    assert validation_task.task_id == "causal_validation"
    assert "if that issue were resolved" in validation_task.action_items[0].question.casefold()
    assert not store.results

    call.set_field("return_intent", "maybe")
    agent._on_task_complete_handlers["causal_validation"](call)

    assert len(store.results) == 1
    persisted = result_mapping(store.results[0][1])
    assert persisted["reason_code"] == "tracking_effort"
    assert persisted["return_intent"] == "maybe"
    assert call.get_variable("dailyfuel_result_saved") is True
    assert any(isinstance(command, SendInstructionCommand) for command in call._command_queue)


def test_configured_offer_is_presented_only_when_price_is_causal() -> None:
    offer = {"label": "one free month", "months": 1}

    store = FakeStore()
    agent = build_agent(store, "attempt-1", offer=offer)
    call = MockCall()
    call.set_field("reason_code", "price")
    call.set_field("return_intent", "yes")
    agent._on_task_complete_handlers["causal_validation"](call)

    offer_task = task_commands(call)[-1]
    assert offer_task.task_id == "offer"
    assert "one free month" in offer_task.action_items[0].question

    other = FakeStore()
    other_agent = build_agent(other, "attempt-1", offer=offer)
    other_call = MockCall()
    other_call.set_field("reason_code", "tracking_effort")
    other_call.set_field("return_intent", "yes")
    other_agent._on_task_complete_handlers["causal_validation"](other_call)

    assert not task_commands(other_call)


def test_price_barrier_asks_the_price_specific_validation_question() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1", offer={"label": "one free month", "months": 1})
    call = MockCall()
    call.set_field("reason_code", "price")

    agent._on_task_complete_handlers["interview"](call)

    validation_task = task_commands(call)[-1]
    assert validation_task.task_id == "causal_validation"
    assert "cost less" in validation_task.action_items[0].question.casefold()


def test_session_end_persists_partial_without_call_commands() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall()
    call.set_variable("dailyfuel_stage", "interview")
    call.set_field("primary_reason_words", "The scanner failed sometimes.")
    before = len(call._command_queue)

    assert agent._on_session_end is not None
    agent._on_session_end(
        call,
        BotSessionEnded(termination_reason="user-hangup"),
    )

    assert len(call._command_queue) == before
    assert len(store.results) == 1
    persisted = result_mapping(store.results[0][1])
    assert persisted["satisfaction"] is None
    assert persisted["primary_reason_words"] == "The scanner failed sometimes."
    assert persisted["reason_code"] == "unknown"


def test_question_handler_never_gives_health_or_account_advice() -> None:
    store = FakeStore()
    agent = build_agent(store, "attempt-1")
    call = MockCall()

    assert agent._on_question is not None
    health_answer = agent._on_question(call, "How many calories should I eat?")
    account_answer = agent._on_question(call, "Can you change my subscription?")

    assert "can't provide medical or nutrition advice" in health_answer
    assert "can't access or change your account" in account_answer


def test_trigger_selects_neutral_research_question() -> None:
    assert "cancel" in interview_reason_question("cancellation").casefold()
    assert "less often" in interview_reason_question("usage_drop").casefold()
    assert "less useful" in interview_reason_question("other").casefold()


def test_empty_attempt_key_is_rejected() -> None:
    with pytest.raises(ValueError, match="attempt_key"):
        build_agent(FakeStore(), "  ")
