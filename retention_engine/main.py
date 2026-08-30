from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from uuid import uuid4

from guava import logging_utils

try:
    from .agent_app import build_agent, interview_reason_question
    from .core import Contact, RetentionStore, ValidationError, load_contacts_csv, seed_demo_results
except ImportError:
    from agent_app import build_agent, interview_reason_question
    from core import Contact, RetentionStore, ValidationError, load_contacts_csv, seed_demo_results

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CONTACTS_PATH = BASE_DIR / "contacts.demo.csv"
DEFAULT_DB_PATH = BASE_DIR / "data" / "retention.sqlite3"
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


class JsonlEventSink:
    def __init__(self, path: str | Path):
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.started_at = time.monotonic()
        self.sequence = 0
        self.lock = Lock()

    def __call__(self, event_type: str, payload: dict[str, object]) -> None:
        with self.lock:
            self.sequence += 1
            elapsed_ms = int((time.monotonic() - self.started_at) * 1000)
            event = {
                "type": event_type,
                "timestamp": datetime.now(UTC).isoformat(timespec="milliseconds").replace(
                    "+00:00", "Z"
                ),
                "elapsedMs": elapsed_ms,
                **payload,
            }
            transcript = event.get("transcript")
            if isinstance(transcript, dict):
                transcript.setdefault("id", f"live-{self.sequence}")
                transcript.setdefault("elapsedMs", elapsed_ms)
            with self.path.open("a", encoding="utf-8") as file:
                file.write(json.dumps(event, separators=(",", ":")) + "\n")


def database_path() -> Path:
    configured = Path(os.getenv("RETENTION_DB_PATH", DEFAULT_DB_PATH))
    return configured if configured.is_absolute() else BASE_DIR / configured


def load_contact(contact_id: str, *, first_name: str | None = None) -> Contact:
    contacts = load_contacts_csv(DEFAULT_CONTACTS_PATH)
    try:
        contact = next(item for item in contacts if item.contact_id == contact_id)
    except StopIteration as exc:
        raise ValidationError(f"unknown contact_id: {contact_id}") from exc
    if first_name:
        contact = replace(contact, first_name=first_name.strip())
    contact.assert_callable()
    return contact


def require_e164(value: str | None, *, label: str) -> str:
    normalized = (value or "").strip().replace(" ", "").replace("(", "").replace(")", "")
    normalized = normalized.replace("-", "")
    if not E164.fullmatch(normalized):
        raise ValidationError(f"{label} must be an E.164 phone number")
    return normalized


def new_attempt_key(kind: str) -> str:
    return f"dailyfuel-{kind}-{uuid4().hex}"


def public_attempt(row: dict[str, object] | None) -> dict[str, object] | None:
    if row is None:
        return None
    return {
        "attempt_key": row["attempt_key"],
        "status": row["status"],
        "trigger": row["trigger"],
        "baseline_weekly_events": row["baseline_weekly_events"],
        "recent_weekly_events": row["recent_weekly_events"],
        "satisfaction": row["satisfaction"],
        "reason_code": row["reason_code"],
        "biggest_friction": row["biggest_friction"],
        "desired_change": row["desired_change"],
        "return_intent": row["return_intent"],
        "follow_up_allowed": row["follow_up_allowed"],
        "is_synthetic": row["is_synthetic"],
    }


def print_json(value: object) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def run_seed(store: RetentionStore) -> None:
    seeded = seed_demo_results(store)
    print_json({"seeded": len(seeded), "insights": store.insights()})


def run_latest(store: RetentionStore) -> None:
    attempts = store.list_attempts()
    print_json(public_attempt(attempts[-1]) if attempts else None)


def run_dry_run(contact_id: str, first_name: str | None) -> None:
    contact = load_contact(contact_id, first_name=first_name)
    print_json(
        {
            "brand": "Smartset",
            "call_will_be_placed": False,
            "contact_id": contact.contact_id,
            "consent_gate": "passed",
            "do_not_call_gate": "passed",
            "trigger": contact.trigger,
            "usage_signal": {
                "baseline_weekly_events": contact.baseline_weekly_events,
                "recent_weekly_events": contact.recent_weekly_events,
            },
            "reason_question": interview_reason_question(contact.trigger),
        }
    )


def prepare_attempt(
    store: RetentionStore,
    contact_id: str,
    *,
    first_name: str | None,
    kind: str,
) -> tuple[Contact, str]:
    contact = load_contact(contact_id, first_name=first_name)
    attempt_key = new_attempt_key(kind)
    store.create_attempt(contact, attempt_key, source="live_demo")
    return contact, attempt_key


def run_chat(store: RetentionStore, contact_id: str, first_name: str | None) -> None:
    _, attempt_key = prepare_attempt(
        store,
        contact_id,
        first_name=first_name,
        kind="chat",
    )
    agent = build_agent(store, attempt_key)
    agent.chat(variables={"dailyfuel_attempt_key": attempt_key})
    print_json(public_attempt(store.get_attempt(attempt_key)))


def run_call(
    store: RetentionStore,
    contact_id: str,
    *,
    first_name: str | None,
    to_number: str | None,
    authorized: bool,
) -> None:
    if not authorized:
        raise ValidationError("live calls require --authorized-live-demo")

    target = require_e164(to_number or os.getenv("DEMO_TARGET_PHONE"), label="target number")
    from_number = require_e164(os.getenv("GUAVA_AGENT_NUMBER"), label="GUAVA_AGENT_NUMBER")
    contact, attempt_key = prepare_attempt(
        store,
        contact_id,
        first_name=first_name,
        kind="live",
    )
    if target == contact.phone_e164:
        raise ValidationError("refusing to dial the reserved CSV fixture number")

    store.set_status(attempt_key, "dialing")
    agent = build_agent(store, attempt_key)
    print(f"Starting authorized Guava call for attempt {attempt_key}.", flush=True)
    try:
        agent.call_phone(
            from_number=from_number,
            to_number=target,
            variables={"dailyfuel_attempt_key": attempt_key},
        )
    except Exception:
        current = store.get_attempt(attempt_key)
        if current and current["status"] not in {
            "completed",
            "partial",
            "no_answer",
            "voicemail",
            "do_not_call",
            "failed",
            "declined",
        }:
            store.set_status(attempt_key, "failed")
        raise

    print_json(
        {
            "attempt": public_attempt(store.get_attempt(attempt_key)),
            "insights": store.insights(),
        }
    )


def run_context_call(
    store: RetentionStore,
    *,
    customer_id: str,
    first_name: str,
    plan: str,
    goal: str,
    baseline: int,
    recent: int,
    days_inactive: int,
    churn_risk: int,
    workflow_rule: str | None,
    offer_label: str | None,
    offer_months: int,
    offer_condition: str | None,
    event_log: str,
    authorized: bool,
) -> None:
    if not authorized:
        raise ValidationError("live calls require --authorized-live-demo")

    target = require_e164(os.getenv("DEMO_TARGET_PHONE"), label="DEMO_TARGET_PHONE")
    from_number = require_e164(os.getenv("GUAVA_AGENT_NUMBER"), label="GUAVA_AGENT_NUMBER")
    fixture = load_contact("demo-dropoff")
    contact = replace(
        fixture,
        contact_id=customer_id,
        first_name=first_name.strip().split(maxsplit=1)[0],
        plan=plan,
        baseline_weekly_events=baseline,
        recent_weekly_events=recent,
    )
    contact.assert_callable()
    if target == contact.phone_e164:
        raise ValidationError("refusing to dial the reserved CSV fixture number")

    attempt_key = new_attempt_key("live")
    store.create_attempt(contact, attempt_key, source="live_demo")
    store.set_status(attempt_key, "dialing")
    sink = JsonlEventSink(event_log)
    context = {
        "customer_id": customer_id,
        "first_name": contact.first_name,
        "plan": plan,
        "baseline_weekly_events": baseline,
        "recent_weekly_events": recent,
        "days_inactive": days_inactive,
        "churn_risk_percent": churn_risk,
        "workflow_rule": workflow_rule or "Understand the causal churn reason before acting.",
    }
    configured_offer = None
    if offer_label and offer_months == 1:
        configured_offer = {
            "label": offer_label,
            "months": 1,
            "condition": offer_condition or "Only when price is the confirmed root cause.",
        }
    agent = build_agent(
        store,
        attempt_key,
        customer_context=context,
        offer=configured_offer,
        event_sink=sink,
    )
    try:
        agent.call_phone(
            from_number=from_number,
            to_number=target,
            variables={
                "dailyfuel_attempt_key": attempt_key,
                "smartset_customer_id": customer_id,
                "smartset_plan": plan,
                "smartset_baseline": baseline,
                "smartset_recent": recent,
            },
        )
    except Exception:
        current = store.get_attempt(attempt_key)
        if current and current["status"] not in {
            "completed",
            "partial",
            "no_answer",
            "voicemail",
            "do_not_call",
            "failed",
            "declined",
        }:
            store.set_status(attempt_key, "failed")
        raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smartset qualitative retention engine")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("seed", help="Seed eight deterministic synthetic interviews")
    subparsers.add_parser("insights", help="Print aggregate PII-free insights")
    subparsers.add_parser("latest", help="Print the latest sanitized attempt")

    for command, help_text in (
        ("dry-run", "Validate a contact without placing a call"),
        ("chat", "Run the agent as a terminal chat"),
    ):
        child = subparsers.add_parser(command, help=help_text)
        child.add_argument("--contact", default="demo-dropoff")
        child.add_argument("--first-name", default=os.getenv("DEMO_FIRST_NAME"))

    call = subparsers.add_parser("call", help="Place one authorized native Guava call")
    call.add_argument("--contact", default="demo-dropoff")
    call.add_argument("--first-name", default=os.getenv("DEMO_FIRST_NAME"))
    call.add_argument("--to", help="Authorized recipient in E.164; defaults to DEMO_TARGET_PHONE")
    call.add_argument("--authorized-live-demo", action="store_true")

    context_call = subparsers.add_parser(
        "call-context", help="Place one allowlisted call with selected customer context"
    )
    context_call.add_argument("--customer-id", required=True)
    context_call.add_argument("--first-name", required=True)
    context_call.add_argument("--plan", required=True)
    context_call.add_argument("--goal", required=True)
    context_call.add_argument("--baseline", type=int, required=True)
    context_call.add_argument("--recent", type=int, required=True)
    context_call.add_argument("--days-inactive", type=int, required=True)
    context_call.add_argument("--churn-risk", type=int, required=True)
    context_call.add_argument("--workflow-rule")
    context_call.add_argument("--offer-label")
    context_call.add_argument("--offer-months", type=int, default=0, choices=(0, 1))
    context_call.add_argument("--offer-condition")
    context_call.add_argument("--event-log", required=True)
    context_call.add_argument("--authorized-live-demo", action="store_true")
    return parser


def main() -> int:
    logging_utils.configure_logging()
    args = build_parser().parse_args()
    store = RetentionStore(database_path())
    try:
        if args.command == "seed":
            run_seed(store)
        elif args.command == "insights":
            print_json(store.insights())
        elif args.command == "latest":
            run_latest(store)
        elif args.command == "dry-run":
            run_dry_run(args.contact, args.first_name)
        elif args.command == "chat":
            run_chat(store, args.contact, args.first_name)
        elif args.command == "call":
            run_call(
                store,
                args.contact,
                first_name=args.first_name,
                to_number=args.to,
                authorized=args.authorized_live_demo,
            )
        else:
            run_context_call(
                store,
                customer_id=args.customer_id,
                first_name=args.first_name,
                plan=args.plan,
                goal=args.goal,
                baseline=args.baseline,
                recent=args.recent,
                days_inactive=args.days_inactive,
                churn_risk=args.churn_risk,
                workflow_rule=args.workflow_rule,
                offer_label=args.offer_label,
                offer_months=args.offer_months,
                offer_condition=args.offer_condition,
                event_log=args.event_log,
                authorized=args.authorized_live_demo,
            )
    except ValidationError as exc:
        print(f"Error: {exc}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
