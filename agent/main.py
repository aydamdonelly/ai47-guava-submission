# SDK conformance: guava-sdk 0.40.0 (2026-08-26)
import argparse
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import guava
from guava import logging_utils

from facility import answer_facility_question

LOGGER = logging.getLogger("caresignal.agent")
API_URL = os.getenv("CARESIGNAL_API_URL", "http://127.0.0.1:8000").rstrip("/")
DEMO_TOKEN = os.getenv("CARESIGNAL_DEMO_TOKEN", "")
ROOM = os.getenv("DEMO_ROOM", "204")
RESIDENT_NAME = os.getenv("DEMO_RESIDENT_NAME", "Evelyn Carter")
FALLBACK_PATH = Path(__file__).with_name("fallback_intakes.jsonl")
CALLBACK_ANSWERS: dict[int, str] = {}

agent = guava.Agent(
    name="Clara",
    organization="Northstar Senior Living",
    purpose=(
        "Turn a resident's spoken room call into a concise, structured handoff for the care "
        "team, while answering only verified non-clinical facility questions. Never diagnose, "
        "rule out danger, or make a care decision."
    ),
)


def post_intake(payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if DEMO_TOKEN:
        headers["X-CareSignal-Token"] = DEMO_TOKEN
    request = Request(
        f"{API_URL}/api/intakes",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=5) as response:
            return json.loads(response.read())
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        fallback = {**payload, "delivery_failed_at": datetime.now(timezone.utc).isoformat()}
        with FALLBACK_PATH.open("a", encoding="utf-8") as file:
            file.write(json.dumps(fallback) + "\n")
        raise RuntimeError("CareSignal dashboard handoff failed") from exc


def field(call: guava.Call, key: str, default: str = "") -> str:
    value = call.get_field(key)
    return str(value).strip() if value is not None else default


@agent.on_call_received
def on_call_received(call_info: guava.CallInfo) -> guava.IncomingCallAction:
    return guava.AcceptCall()


@agent.on_call_start
def on_call_start(call: guava.Call) -> None:
    call.set_language_mode(primary="english", secondary=["german"])
    call.add_info(
        "resident_and_room",
        {"resident_name": RESIDENT_NAME, "room": ROOM},
    )
    call.read_script(
        "Hello, this is Clara, an AI voice assistant for CareSignal. This call may be "
        "recorded for this demonstration. Tell me what you need."
    )
    call.set_task(
        "room_request",
        objective=(
            "Listen to one resident request, help only with verified facility information, "
            "and create a structured handoff whenever a person may be needed. The caller must "
            "never have to choose a category or judge severity. Infer fields silently from their "
            "words. Ask at most one short clarifying question, and only when that cannot delay a "
            "possible care need. Any symptom, fall, pain, medication issue, explicit request for "
            "a person, unclear speech, or uncertainty requires staff. Never diagnose, reassure "
            "the caller that they are safe, or claim an emergency has been ruled out. For every "
            "facility-information question, use the expert question callback and repeat its "
            "answer exactly; never answer a facility question from memory."
        ),
        checklist=[
            guava.Field(
                key="raw_request",
                field_type="text",
                description=(
                    "Capture the resident's request in their own words as closely as possible. "
                    "Do not ask them to repeat it merely for this field."
                ),
            ),
            guava.Field(
                key="category",
                field_type="multiple_choice",
                choices=[
                    "facility_information",
                    "comfort_request",
                    "personal_care",
                    "clinical_concern",
                    "unclear",
                ],
                description="Infer the closest routing category without asking the caller.",
            ),
            guava.Field(
                key="summary",
                field_type="text",
                description="Write a factual one-sentence handoff. Do not include a diagnosis.",
            ),
            guava.Field(
                key="needs_staff",
                field_type="multiple_choice",
                choices=["yes", "no"],
                description=(
                    "Infer whether staff are needed. Choose yes for any care need, unknown "
                    "facility answer, ambiguity, symptom, or when the resident asks for a person."
                ),
            ),
            guava.Field(
                key="model_urgency",
                field_type="multiple_choice",
                choices=["immediate", "prompt", "routine", "answered"],
                description=(
                    "Suggest routing speed without diagnosing: immediate for possible danger or "
                    "uncertainty, prompt for personal assistance, routine for comfort, answered "
                    "only for a verified facility question that was fully answered."
                ),
            ),
            guava.Field(
                key="confidence",
                field_type="multiple_choice",
                choices=["high", "medium", "low"],
                description="Rate transcription and intent confidence. Do not ask the caller.",
            ),
            guava.Field(
                key="suggested_action",
                field_type="text",
                description="Suggest the next practical staff action without medical advice.",
                required=False,
            ),
            guava.Field(
                key="note_candidate",
                field_type="text",
                description=(
                    "Capture a durable preference the resident volunteered, if useful later. "
                    "Never treat it as confirmed clinical data; otherwise leave blank."
                ),
                required=False,
            ),
        ],
        completion_criteria=(
            "Complete as soon as the fields can be inferred from the resident's initial request "
            "and, for a verified facility question, after giving the answer. Do not conduct a "
            "medical interview."
        ),
    )


@agent.on_question
def on_question(call: guava.Call, question: str) -> str:
    answer = answer_facility_question(question)
    CALLBACK_ANSWERS[id(call)] = answer
    return answer


@agent.on_task_complete("room_request")
def on_room_request_complete(call: guava.Call) -> None:
    callback_answer = CALLBACK_ANSWERS.pop(id(call), "")
    payload = {
        "room": ROOM,
        "resident_name": RESIDENT_NAME,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": "guava_phone",
        "raw_request": field(call, "raw_request", "Speech was not captured clearly"),
        "summary": field(call, "summary", "Resident request needs review"),
        "category": field(call, "category", "unclear"),
        "model_urgency": field(call, "model_urgency", "immediate"),
        "confidence": field(call, "confidence", "low"),
        "needs_staff": field(call, "needs_staff", "yes").casefold() == "yes",
        "suggested_action": field(call, "suggested_action", "Check on the resident"),
        # Only code captured from the deterministic expert callback can close a request.
        # A model-populated task field must never count as a verified facility answer.
        "answer_given": callback_answer or None,
        "note_candidate": field(call, "note_candidate") or None,
    }

    try:
        intake = post_intake(payload)
    except RuntimeError:
        LOGGER.exception("Could not deliver room request to dashboard")
        call.hangup(
            final_instructions=(
                "Say that the digital handoff could not be confirmed. Tell the resident to use "
                "their physical call button, and to contact emergency services if they believe "
                "they are in immediate danger. Do not say the request was delivered."
            )
        )
        return

    priority = intake.get("priority", "immediate")
    if priority == "answered":
        closing = (
            "Confirm that their facility question was answered. Remind them they can ask for the "
            "care team or use the physical call button if they still need a person."
        )
    elif priority == "immediate":
        closing = (
            "Say that the request was sent to the care team for immediate review. Ask them to "
            "stay where they are if it is safe to do so. If they believe they are in immediate "
            "danger, tell them to use their physical emergency control or contact emergency "
            "services. Do not name a diagnosis."
        )
    else:
        closing = (
            "Say that their request was sent to the care team and will remain visible until a "
            "staff member resolves it. Do not promise an exact response time."
        )

    call.hangup(final_instructions=closing)


def main() -> None:
    logging_utils.configure_logging()
    parser = argparse.ArgumentParser(description="Run the CareSignal Guava agent.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--phone",
        metavar="PHONE_NUMBER",
        nargs="?",
        const="",
        help="Listen for incoming calls, using GUAVA_AGENT_NUMBER when omitted.",
    )
    group.add_argument(
        "--webrtc",
        metavar="WEBRTC_CODE",
        nargs="?",
        const="",
        help="Listen on a WebRTC code, generating one when omitted.",
    )
    group.add_argument("--local", action="store_true", help="Use this laptop's microphone.")
    group.add_argument("--chat", action="store_true", help="Use terminal text chat.")
    args = parser.parse_args()

    if args.phone is not None:
        phone = args.phone or os.environ.get("GUAVA_AGENT_NUMBER")
        if not phone:
            parser.error("Set GUAVA_AGENT_NUMBER or pass --phone +1...")
        agent.listen_phone(phone)
    elif args.webrtc is not None:
        agent.listen_webrtc(args.webrtc or None)
    elif args.local:
        agent.call_local()
    else:
        agent.chat()


if __name__ == "__main__":
    main()
