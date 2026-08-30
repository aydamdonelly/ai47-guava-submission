from __future__ import annotations

import html
import json
import logging
import os
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from typing import Any, Protocol

import guava
from guava.events import BotSessionEnded, OutboundCallFailed

LOGGER = logging.getLogger("dailyfuel.agent")

REASON_CODES = (
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
RETURN_INTENTS = ("yes", "maybe", "no", "unknown")
REACH_PERSON_OUTCOMES = (
    "available",
    "unavailable",
    "voicemail",
    "wrong_number",
    "do_not_contact",
)


class InterviewStore(Protocol):
    """Persistence boundary used by the voice flow."""

    def get_attempt(self, attempt_key: str) -> object: ...

    def set_status(
        self,
        attempt_key: str,
        status: str,
        provider_call_id: str | None = None,
    ) -> None: ...

    def complete_attempt(self, attempt_key: str, result: object) -> None: ...


class FieldSource(Protocol):
    def get_field(self, field_key: str, default: Any = None) -> Any: ...


EventSink = Callable[[str, dict[str, object]], None]


def _emit(
    sink: EventSink | None, event_type: str, **payload: object
) -> None:
    if sink is not None:
        sink(event_type, payload)


def _send_offer_email(label: str) -> bool:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    recipient = os.getenv("DEMO_EMAIL_TO", "").strip()
    if not api_key or not recipient:
        return False
    payload = json.dumps(
        {
            "from": "Smartset <onboarding@resend.dev>",
            "to": [recipient],
            "subject": "Your Smartset retention offer",
            "html": (
                "<p>Thanks for speaking with Smartset.</p>"
                f"<p>Your offer: <strong>{html.escape(label)}</strong></p>"
                "<p>Use code <strong>SMARTSETMONTH</strong>.</p>"
            ),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError):
        LOGGER.exception("Could not send the configured Smartset offer email")
        return False


def normalize_text(value: object) -> str:
    """Return compact human text without inventing a value for missing input."""

    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def normalize_choice(
    value: object,
    choices: Sequence[str],
    *,
    default: str | None = None,
) -> str | None:
    """Normalize Guava choice values while preserving a closed vocabulary."""

    normalized = normalize_text(value).casefold().replace("-", "_").replace(" ", "_")
    allowed = {choice.casefold(): choice for choice in choices}
    return allowed.get(normalized, default)


def _field_value(source: FieldSource | Mapping[str, object], key: str) -> object:
    if isinstance(source, Mapping):
        return source.get(key)
    return source.get_field(key)


def extract_interview_fields(
    source: FieldSource | Mapping[str, object],
) -> dict[str, object]:
    """Extract the stable result contract from a live or mocked Guava call."""

    satisfaction_value = normalize_choice(
        _field_value(source, "satisfaction"),
        ("1", "2", "3", "4", "5"),
    )
    reason_code = normalize_choice(
        _field_value(source, "reason_code"),
        REASON_CODES,
        default="unknown",
    )
    return_intent = normalize_choice(
        _field_value(source, "return_intent"),
        RETURN_INTENTS,
        default="unknown",
    )
    follow_up = normalize_choice(
        _field_value(source, "follow_up_allowed"),
        ("yes", "no"),
        default="no",
    )

    return {
        "satisfaction": int(satisfaction_value) if satisfaction_value else None,
        "primary_reason_words": normalize_text(_field_value(source, "primary_reason_words")),
        "reason_code": reason_code,
        "biggest_friction": normalize_text(_field_value(source, "biggest_friction")),
        "desired_change": normalize_text(_field_value(source, "desired_change")),
        "return_intent": return_intent,
        "follow_up_allowed": follow_up == "yes",
    }


def permission_granted(value: object) -> bool:
    return normalize_choice(value, ("yes", "no"), default="no") == "yes"


def interview_reason_question(trigger: object) -> str:
    normalized = normalize_text(trigger).casefold().replace("-", "_").replace(" ", "_")
    if normalized in {"cancelled", "canceled", "cancellation", "churn"}:
        return "What was the main reason you decided to cancel Smartset?"
    if normalized in {"usage_drop", "low_usage", "inactive", "at_risk"}:
        return "What was the main reason you started using Smartset less often?"
    return "What was the main reason Smartset became less useful for you?"


def _attempt_value(attempt: object, key: str, default: object = "") -> object:
    if isinstance(attempt, Mapping):
        return attempt.get(key, default)
    return getattr(attempt, key, default)


def _result_object(payload: Mapping[str, object]) -> object:
    """Adapt the stable mapping to core.InterviewResult when the core is installed."""

    try:
        from .core import InterviewResult
    except ImportError:
        return dict(payload)
    return InterviewResult.from_mapping(payload, allow_partial=True)


def _set_status(
    store: InterviewStore,
    attempt_key: str,
    status: str,
    *,
    provider_call_id: str | None = None,
) -> bool:
    try:
        store.set_status(attempt_key, status, provider_call_id=provider_call_id)
    except Exception:
        LOGGER.exception("Could not persist status %s for attempt %s", status, attempt_key)
        return False
    return True


def _complete_result(
    store: InterviewStore,
    attempt_key: str,
    source: FieldSource | Mapping[str, object],
) -> bool:
    try:
        store.complete_attempt(attempt_key, _result_object(extract_interview_fields(source)))
    except Exception:
        LOGGER.exception("Could not persist interview result for attempt %s", attempt_key)
        return False
    return True


def _set_stage(call: guava.Call, stage: str) -> None:
    call.set_variable("dailyfuel_stage", stage)


def _start_reach_person(call: guava.Call, first_name: str) -> None:
    """Open the live call immediately, then confirm the intended contact."""
    call.reach_person(
        contact_full_name=first_name,
        greeting=f"Hi, this is Ava, Smartset's AI assistant. May I speak with {first_name}?",
        voicemail_hangup=True,
    )


def _start_permission(call: guava.Call) -> None:
    _set_stage(call, "permission")
    call.set_task(
        "permission",
        objective=(
            "Ask only whether the caller wants to participate in an optional product-research "
            "interview. Do not begin research questions until they clearly agree. Do not "
            "persuade them. If they decline, accept the answer immediately."
        ),
        checklist=[
            guava.Field(
                key="interview_permission",
                field_type="multiple_choice",
                choices=["yes", "no"],
                question=(
                    "This call may be transcribed. Can I ask two quick questions about "
                    "Smartset? You can stop at any time."
                ),
            ),
        ],
        completion_criteria=(
            "Finish as soon as a clear yes or no has been captured. Never treat uncertainty "
            "or silence as consent."
        ),
    )


def _start_interview(call: guava.Call, trigger: object) -> None:
    _set_stage(call, "interview")
    call.set_task(
        "interview",
        objective=(
            "Conduct a short, neutral product-research interview about the caller's experience "
            "with Smartset. Ask each spoken question once and allow the caller to skip any "
            "question or stop. Ask at most one short, neutral clarification when an answer is "
            "unclear. Never defend the product, sell, persuade, propose an incentive, change an "
            "account, or provide medical, health, diet, calorie, or nutrition advice. Never ask "
            "about weight, diagnoses, medication, or eating behavior. Infer reason_code silently "
            "from the caller's own words and never read the taxonomy aloud."
        ),
        checklist=[
            guava.Field(
                key="satisfaction",
                field_type="multiple_choice",
                choices=["1", "2", "3", "4", "5"],
                question=(
                    "Overall, how satisfied were you with Smartset, from one to five, "
                    "where five means very satisfied?"
                ),
                required=False,
            ),
            guava.Field(
                key="primary_reason_words",
                field_type="text",
                question=interview_reason_question(trigger),
                description="Capture the answer closely in the caller's own words.",
                required=False,
            ),
            guava.Field(
                key="reason_code",
                field_type="multiple_choice",
                choices=list(REASON_CODES),
                description=(
                    "Infer one internal category from primary_reason_words. Do not ask the "
                    "caller to choose a category and do not read the choices aloud. Use unknown "
                    "when there is not enough information."
                ),
                required=False,
            ),
            guava.Field(
                key="biggest_friction",
                field_type="text",
                description=(
                    "Infer the single biggest product friction from the caller's answer. "
                    "Do not ask a separate question merely to populate this field."
                ),
                required=False,
            ),
            guava.Field(
                key="desired_change",
                field_type="text",
                question="What one change would have made Smartset more useful for you?",
                required=False,
            ),
            guava.Field(
                key="return_intent",
                field_type="multiple_choice",
                choices=["yes", "maybe", "no", "unknown"],
                question=(
                    "If the issues you mentioned were fixed, would you consider using "
                    "Smartset again?"
                ),
                required=False,
            ),
            guava.Field(
                key="follow_up_allowed",
                field_type="multiple_choice",
                choices=["yes", "no"],
                question=(
                    "Would it be okay for the Smartset team to contact you once about "
                    "this feedback?"
                ),
                required=False,
            ),
        ],
        completion_criteria=(
            "Finish after every spoken question has been answered once, skipped, or declined. "
            "If the caller asks to stop, stop asking questions immediately."
        ),
    )


def _start_offer(call: guava.Call, label: str) -> None:
    _set_stage(call, "offer")
    call.set_task(
        "offer",
        objective=(
            "Present the single configured retention offer once, because the caller confirmed "
            "price as the causal blocker and expressed willingness to return. Never pressure "
            "them and accept no immediately."
        ),
        checklist=[
            guava.Field(
                key="offer_accepted",
                field_type="multiple_choice",
                choices=["yes", "no"],
                question=f"Based on what you shared, I can offer {label}. Would you like that?",
            )
        ],
        completion_criteria="Finish after one clear yes or no. Do not repeat the offer.",
    )


def build_agent(
    store: InterviewStore,
    attempt_key: str,
    *,
    customer_context: Mapping[str, object] | None = None,
    offer: Mapping[str, object] | None = None,
    event_sink: EventSink | None = None,
) -> guava.Agent:
    """Build one native-outbound Smartset research agent for one attempt."""

    if not normalize_text(attempt_key):
        raise ValueError("attempt_key must not be empty")

    offer_policy = (
        "After the interview, present the single configured offer only if the configured "
        "workflow gate confirms price is causal and return intent is positive."
        if offer
        else "Never propose an incentive or change an account."
    )

    agent = guava.Agent(
        name="Ava",
        organization="Smartset",
        purpose=(
            "Conduct an optional two-minute product-research interview about Smartset. "
            f"Be neutral and concise. {offer_policy} Never pressure the caller or give medical, "
            "health, diet, calorie, or nutrition advice."
        ),
    )

    @agent.on_call_start
    def on_call_start(call: guava.Call) -> None:
        attempt = store.get_attempt(attempt_key)
        first_name = normalize_text(_attempt_value(attempt, "first_name")) or "Smartset customer"

        context = dict(customer_context or {})
        context.setdefault("plan", _attempt_value(attempt, "plan"))
        context.setdefault(
            "baseline_weekly_events", _attempt_value(attempt, "baseline_weekly_events")
        )
        context.setdefault(
            "recent_weekly_events", _attempt_value(attempt, "recent_weekly_events")
        )

        call.set_language_mode(primary="english")
        call.set_variable("dailyfuel_attempt_key", attempt_key)
        call.add_info("Known Smartset customer context", context)
        _set_stage(call, "reach_person")
        _set_status(store, attempt_key, "answered", provider_call_id=call.id)
        _emit(
            event_sink,
            "call_started",
            customerId=context.get("customer_id", ""),
            workflowId="churn",
            state={
                "state": "agent_speaking",
                "activeNodeId": "outbound_call",
                "followUpDepth": 0,
            },
        )
        _emit(event_sink, "workflow_node_entered", workflowNodeId="load_context")
        _emit(event_sink, "workflow_node_entered", workflowNodeId="outbound_call")
        _start_reach_person(call, first_name)

    @agent.on_agent_speech
    def on_agent_speech(call: guava.Call, event: object) -> None:
        del call
        _emit(
            event_sink,
            "transcript_update",
            transcript={"speaker": "agent", "text": normalize_text(event.utterance)},
        )

    @agent.on_caller_speech
    def on_caller_speech(call: guava.Call, event: object) -> None:
        del call
        _emit(
            event_sink,
            "transcript_update",
            transcript={"speaker": "customer", "text": normalize_text(event.utterance)},
        )

    @agent.on_reach_person
    def on_reach_person(call: guava.Call, outcome: str) -> None:
        normalized = normalize_choice(
            outcome,
            ("available", "unavailable", "voicemail", "wrong_number", "do_not_contact"),
            default="unavailable",
        )
        if normalized == "available":
            _emit(event_sink, "workflow_node_entered", workflowNodeId="infer_goal")
            _start_permission(call)
            return

        terminal_status = "voicemail" if normalized == "voicemail" else "declined"
        if normalized in {"unavailable", "wrong_number"}:
            terminal_status = "no_answer"
        elif normalized == "do_not_contact":
            terminal_status = "do_not_call"
        _set_stage(call, terminal_status)
        _set_status(store, attempt_key, terminal_status)
        if normalized == "do_not_contact":
            call.hangup(
                "Confirm that the request will be respected, apologize briefly, and end now."
            )
        else:
            call.hangup("End politely without disclosing any customer or account information.")

    @agent.on_task_complete("permission")
    def on_permission_complete(call: guava.Call) -> None:
        if permission_granted(call.get_field("interview_permission")):
            attempt = store.get_attempt(attempt_key)
            _emit(event_sink, "workflow_node_entered", workflowNodeId="goal_relevant")
            _emit(event_sink, "workflow_node_entered", workflowNodeId="identify_barrier")
            _start_interview(call, _attempt_value(attempt, "trigger"))
            return

        _set_stage(call, "declined")
        _set_status(store, attempt_key, "declined")
        call.hangup(
            "Thank them for their time, confirm that no interview will take place, and end."
        )

    @agent.on_task_complete("interview")
    def on_interview_complete(call: guava.Call) -> None:
        fields = extract_interview_fields(call)
        saved = _complete_result(store, attempt_key, call)
        call.set_variable("dailyfuel_result_saved", saved)
        reason_code = normalize_text(fields.get("reason_code")) or "unknown"
        node_by_reason = {
            "price": "price",
            "tracking_effort": "habit",
            "accuracy": "product",
            "technical_issue": "product",
            "missing_feature": "value",
        }
        active_node = node_by_reason.get(reason_code, "deeper_discovery")
        _emit(event_sink, "workflow_node_entered", workflowNodeId=active_node)
        _emit(
            event_sink,
            "state_updated",
            state={
                "state": "thinking",
                "activeNodeId": active_node,
                "goalRelevant": True,
                "barrier": reason_code,
                "followUpDepth": 0,
            },
        )

        offer_label = normalize_text((offer or {}).get("label"))
        offer_months = (offer or {}).get("months")
        return_intent = normalize_text(fields.get("return_intent"))
        if (
            offer_label
            and offer_months == 1
            and reason_code == "price"
            and return_intent in {"yes", "maybe"}
        ):
            _emit(event_sink, "workflow_node_entered", workflowNodeId="price_causal")
            _emit(event_sink, "workflow_node_entered", workflowNodeId="offer")
            _start_offer(call, offer_label)
            return

        _set_stage(call, "closing")
        if saved:
            closing = "Thank them for sharing their feedback and say goodbye."
        else:
            closing = (
                "Thank them for their time and say goodbye. Do not claim that their feedback "
                "was saved."
            )
        call.hangup(closing)

    @agent.on_task_complete("offer")
    def on_offer_complete(call: guava.Call) -> None:
        accepted = permission_granted(call.get_field("offer_accepted"))
        if accepted:
            offer_label = normalize_text((offer or {}).get("label"))
            email_sent = _send_offer_email(offer_label)
            _emit(event_sink, "workflow_node_entered", workflowNodeId="send_email")
            _emit(
                event_sink,
                "action_taken",
                action={
                    "id": "one-free-month",
                    "type": "apply_offer",
                    "label": (
                        f"{offer_label} applied and emailed"
                        if email_sent
                        else f"{offer_label} applied"
                    ),
                    "status": "completed",
                    "offer": {
                        "code": "SMARTSETMONTH",
                        "label": normalize_text((offer or {}).get("label")),
                        "discountPercent": 100,
                        "durationDays": 30,
                        "expiresAt": "2026-09-29T23:59:59Z",
                    },
                    "metadata": {"emailSent": email_sent},
                },
            )
        _set_stage(call, "closing")
        call.hangup(
            "Confirm the offer will be sent by email, thank them, and say goodbye."
            if accepted
            else "Thank them for the feedback and say goodbye without repeating the offer."
        )

    @agent.on_question
    def on_question(call: guava.Call, question: str) -> str:
        del call
        normalized = question.casefold()
        advice_terms = (
            "medical",
            "doctor",
            "diagnos",
            "medication",
            "nutrition",
            "diet",
            "calorie",
            "weight",
            "eat",
        )
        if any(term in normalized for term in advice_terms):
            return (
                "I can't provide medical or nutrition advice. I'm only here to collect "
                "product feedback about Smartset."
            )
        return (
            "This is an optional two-minute product-research interview for Smartset. "
            "I can't access or change your account. You can skip a question or stop at any time."
        )

    @agent.on_session_end
    def on_session_end(call: guava.Call, event: BotSessionEnded) -> None:
        stage = normalize_text(call.get_variable("dailyfuel_stage"))
        already_saved = call.get_variable("dailyfuel_result_saved", False) is True

        if stage in {"interview", "closing"} and not already_saved:
            _complete_result(store, attempt_key, call)
        elif stage == "permission":
            _set_status(store, attempt_key, "declined")
        elif stage == "reach_person":
            status = "voicemail" if event.termination_reason == "voicemail" else "no_answer"
            _set_status(store, attempt_key, status)

        if event.dnc:
            _set_status(store, attempt_key, "do_not_call")
        _emit(event_sink, "workflow_node_entered", workflowNodeId="capture")
        _emit(
            event_sink,
            "call_completed",
            state={
                "state": "completed",
                "activeNodeId": "capture",
                "followUpDepth": 0,
            },
            metrics=[],
        )

    @agent.on_outbound_failed
    def on_outbound_failed(event: OutboundCallFailed) -> None:
        LOGGER.warning("Smartset outbound call failed: %s", event.error_reason)
        _set_status(store, attempt_key, "failed")
        _emit(
            event_sink,
            "call_completed",
            state={
                "state": "completed",
                "activeNodeId": "outbound_call",
                "followUpDepth": 0,
            },
            metrics=[],
            message=normalize_text(event.error_reason),
        )

    return agent


__all__ = [
    "InterviewStore",
    "REACH_PERSON_OUTCOMES",
    "REASON_CODES",
    "RETURN_INTENTS",
    "build_agent",
    "extract_interview_fields",
    "interview_reason_question",
    "normalize_choice",
    "normalize_text",
    "permission_granted",
]
