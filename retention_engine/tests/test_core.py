from __future__ import annotations

import io
import json

import pytest
from retention_engine.core import (
    AttemptConflict,
    Contact,
    InterviewResult,
    RetentionStore,
    ValidationError,
    load_contacts_csv,
    seed_demo_results,
)

CSV_HEADER = (
    "contact_id,first_name,phone_e164,trigger,plan,baseline_weekly_events,"
    "recent_weekly_events,locale,consent_to_call,do_not_call\n"
)


def contact(contact_id: str = "demo-001", first_name: str = "Sam") -> Contact:
    return Contact(
        contact_id=contact_id,
        first_name=first_name,
        phone_e164="+12025550199",
        trigger="usage_drop",
        plan="annual",
        baseline_weekly_events=20,
        recent_weekly_events=5,
        locale="en-US",
        consent_to_call=True,
        do_not_call=False,
    )


def result(
    reason: str = "price", quote: str = "It costs more than I use it."
) -> InterviewResult:
    return InterviewResult(
        satisfaction=2,
        primary_reason_words=quote,
        reason_code=reason,
        biggest_friction="The annual commitment.",
        desired_change="A lighter plan.",
        return_intent="maybe",
        follow_up_allowed=True,
    )


def test_csv_validates_contact_and_call_permissions():
    valid = (
        CSV_HEADER
        + "demo-001,Sam,+12025550199,usage_drop,annual,20,5,en-US,true,false\n"
    )

    contacts = load_contacts_csv(io.StringIO(valid))

    assert contacts == [contact()]

    for consent, do_not_call, message in (
        ("false", "false", "has not consented"),
        ("true", "true", "do-not-call"),
    ):
        blocked = (
            CSV_HEADER
            + f"demo-001,Sam,+12025550199,usage_drop,annual,20,5,en-US,{consent},{do_not_call}\n"
        )
        [blocked_contact] = load_contacts_csv(io.StringIO(blocked))
        with pytest.raises(ValidationError, match=message):
            blocked_contact.assert_callable()


def test_csv_rejects_duplicates_and_invalid_contract():
    duplicate = (
        CSV_HEADER
        + "demo-001,Sam,+12025550199,usage_drop,annual,20,5,en-US,true,false\n"
        + "demo-001,Pat,+12025550198,cancellation,monthly,10,1,en-US,true,false\n"
    )
    with pytest.raises(ValidationError, match="duplicate contact_id"):
        load_contacts_csv(io.StringIO(duplicate))

    invalid_phone = (
        CSV_HEADER + "demo-001,Sam,2025550199,usage_drop,annual,20,5,en-US,true,false\n"
    )
    with pytest.raises(ValidationError, match="E.164"):
        load_contacts_csv(io.StringIO(invalid_phone))


def test_attempt_and_completion_are_idempotent(tmp_path):
    store = RetentionStore(tmp_path / "retention.sqlite3")

    first = store.create_attempt(contact(), "attempt-001")
    repeated = store.create_attempt(contact(), "attempt-001")
    completed = store.complete_attempt("attempt-001", result())
    completed_again = store.complete_attempt("attempt-001", result())

    assert first["id"] == repeated["id"]
    assert completed_again == completed
    assert len(store.list_attempts()) == 1

    with pytest.raises(AttemptConflict, match="different terminal result"):
        store.complete_attempt("attempt-001", result("accuracy", "It felt inaccurate."))


def test_insights_use_completed_interviews_only(tmp_path):
    store = RetentionStore(tmp_path / "retention.sqlite3")
    store.create_attempt(contact("complete"), "complete")
    store.complete_attempt("complete", result())

    store.create_attempt(contact("partial"), "partial")
    partial = InterviewResult.from_mapping(
        {"primary_reason_words": "I was interrupted."}
    )
    assert store.complete_attempt("partial", partial)["status"] == "partial"

    store.create_attempt(contact("no-answer"), "no-answer")
    store.set_status("no-answer", "no_answer")

    insights = store.insights()

    assert insights["scope"] == {
        "attempted": 3,
        "completed": 1,
        "completion_rate": 0.333,
        "synthetic_completed": 0,
        "live_completed": 1,
    }
    assert insights["top_reasons"][0]["reason"] == "price"
    assert insights["top_reasons"][0]["count"] == 1
    assert insights["satisfaction"]["responses"] == 1


def test_seed_is_idempotent_has_no_phone_numbers_and_ties_are_stable(tmp_path):
    store = RetentionStore(tmp_path / "retention.sqlite3")

    first = seed_demo_results(store)
    second = seed_demo_results(store)
    insights = store.insights()

    assert len(first) == len(second) == len(store.list_attempts()) == 8
    assert all(row["phone_e164"] == "" for row in first)
    assert all(row["is_synthetic"] for row in first)
    assert [item["reason"] for item in insights["top_reasons"]] == [
        "price",
        "tracking_effort",
        "accuracy",
    ]
    assert [item["count"] for item in insights["top_reasons"]] == [2, 2, 2]
    assert insights["scope"]["synthetic_completed"] == 8


def test_insights_redact_pii_and_never_emit_contact_fields(tmp_path):
    store = RetentionStore(tmp_path / "retention.sqlite3")
    private_contact = contact(first_name="Avery")
    store.create_attempt(private_contact, "private", source="live_demo")
    store.complete_attempt(
        "private",
        result(
            quote=(
                "Avery can be reached at +1 (202) 555-0199 or avery@example.com; "
                "the price is still too high."
            )
        ),
    )

    insights = store.insights()
    serialized = json.dumps(insights)

    assert "Avery" not in serialized
    assert "202" not in serialized
    assert "avery@example.com" not in serialized
    assert "contact_id" not in serialized
    assert "phone_e164" not in serialized
    assert "first_name" not in serialized
    assert "[name]" in serialized
    assert "[phone]" in serialized
    assert "[email]" in serialized


def test_result_mapping_matches_voice_agent_fields():
    mapped = InterviewResult.from_mapping(
        {
            "satisfaction": "4 out of 5",
            "primary_reason_words": "I need a faster way to reuse meals.",
            "reason_code": "missing_feature",
            "biggest_friction": "Re-entering breakfast every day.",
            "desired_change": "Saved meal templates.",
            "return_intent": "likely",
            "follow_up_allowed": "yes",
        },
        allow_partial=False,
    )

    assert mapped.satisfaction == 4
    assert mapped.reason_code == "missing_feature"
    assert mapped.return_intent == "yes"
    assert mapped.follow_up_allowed is True


def test_do_not_call_overrides_a_terminal_outcome(tmp_path):
    store = RetentionStore(tmp_path / "retention.sqlite3")
    store.create_attempt(contact(), "attempt-dnc")
    store.set_status("attempt-dnc", "no_answer")

    updated = store.set_status("attempt-dnc", "do_not_call")

    assert updated["status"] == "do_not_call"
