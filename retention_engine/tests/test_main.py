from __future__ import annotations

import pytest
from retention_engine.core import ValidationError
from retention_engine.main import load_contact, public_attempt, require_e164, run_call


def test_contact_selection_enforces_consent_and_dnc() -> None:
    assert load_contact("demo-dropoff").contact_id == "demo-dropoff"

    with pytest.raises(ValidationError, match="has not consented"):
        load_contact("demo-cancelled")
    with pytest.raises(ValidationError, match="do-not-call"):
        load_contact("demo-dnc")


def test_phone_normalization_requires_e164() -> None:
    assert require_e164("+1 (202) 555-0198", label="target") == "+12025550198"
    with pytest.raises(ValidationError, match="E.164"):
        require_e164("2025550198", label="target")


def test_public_attempt_excludes_contact_pii() -> None:
    row = {
        "attempt_key": "opaque-attempt",
        "status": "completed",
        "trigger": "usage_drop",
        "baseline_weekly_events": 18,
        "recent_weekly_events": 4,
        "satisfaction": 2,
        "reason_code": "tracking_effort",
        "biggest_friction": "Too many taps",
        "desired_change": "Faster logging",
        "return_intent": "maybe",
        "follow_up_allowed": False,
        "is_synthetic": False,
        "first_name": "Private",
        "phone_e164": "+12025550198",
        "contact_id": "private-contact",
    }

    public = public_attempt(row)

    assert public is not None
    assert "first_name" not in public
    assert "phone_e164" not in public
    assert "contact_id" not in public


def test_live_call_requires_explicit_authorization_before_any_store_access() -> None:
    with pytest.raises(ValidationError, match="authorized-live-demo"):
        run_call(
            object(),
            "demo-dropoff",
            first_name=None,
            to_number="+12025550198",
            authorized=False,
        )
