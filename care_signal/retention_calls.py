from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from care_signal.schemas import (
    InsightAnswer,
    RetentionCallCreate,
    WorkflowInterpretation,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENGINE_DIR = PROJECT_ROOT / "retention_engine"
ENGINE_ENV = ENGINE_DIR / ".env"
ENGINE_PYTHON = ENGINE_DIR / ".venv" / "bin" / "python"
CALL_LOG_DIR = ENGINE_DIR / "data" / "call_logs"
ENV_KEYS = frozenset(
    {
        "GUAVA_AGENT_NUMBER",
        "DEMO_TARGET_PHONE",
        "RETENTION_DB_PATH",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_MODEL",
        "RESEND_API_KEY",
        "DEMO_EMAIL_TO",
    }
)
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


@dataclass(slots=True)
class RetentionCallProcess:
    process: subprocess.Popen[bytes]
    started_at: float
    event_path: Path

    def status(self) -> str:
        return_code = self.process.poll()
        if return_code is None:
            return "starting" if time.monotonic() - self.started_at < 2 else "in_progress"
        return "completed" if return_code == 0 else "failed"

    def events(self, cursor: int = 0) -> tuple[list[dict[str, object]], int]:
        if not self.event_path.is_file():
            return [], cursor
        parsed: list[dict[str, object]] = []
        for line in self.event_path.read_text(encoding="utf-8").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                parsed.append(event)
        safe_cursor = min(max(cursor, 0), len(parsed))
        return parsed[safe_cursor:], len(parsed)


def _dotenv_values(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in ENV_KEYS:
            continue
        values[key] = value.strip().strip("'\"")
    return values


def retention_runtime_env() -> dict[str, str]:
    env = os.environ.copy()
    for key, value in _dotenv_values(ENGINE_ENV).items():
        if value and not env.get(key):
            env[key] = value

    missing = [key for key in ("GUAVA_AGENT_NUMBER", "DEMO_TARGET_PHONE") if not env.get(key)]
    if missing:
        raise RuntimeError(f"missing retention call configuration: {', '.join(missing)}")
    for key in ("GUAVA_AGENT_NUMBER", "DEMO_TARGET_PHONE"):
        if not E164.fullmatch(env[key]):
            raise RuntimeError(f"{key} must be an E.164 phone number")
    if not ENGINE_PYTHON.is_file():
        raise RuntimeError("retention_engine virtual environment is not installed")
    env.pop("ANTHROPIC_API_KEY", None)
    env.pop("ANTHROPIC_MODEL", None)
    return env


def start_retention_call(payload: RetentionCallCreate) -> tuple[str, RetentionCallProcess]:
    """Spawn one Guava call. The recipient can only come from DEMO_TARGET_PHONE."""

    env = retention_runtime_env()
    call_id = f"smartset-{uuid4().hex}"
    event_path = (CALL_LOG_DIR / f"{call_id}.events.jsonl").resolve()
    first_name = payload.name.split(maxsplit=1)[0]
    command = [
        str(ENGINE_PYTHON),
        "-m",
        "retention_engine.main",
        "call-context",
        f"--customer-id={payload.customer_id}",
        f"--first-name={first_name}",
        f"--plan={payload.plan}",
        f"--goal={payload.goal}",
        f"--baseline={payload.baseline}",
        f"--recent={payload.recent}",
        f"--days-inactive={payload.days_inactive}",
        f"--churn-risk={payload.churn_risk}",
        f"--event-log={event_path}",
        "--authorized-live-demo",
    ]
    if payload.workflow_rule:
        command.append(f"--workflow-rule={payload.workflow_rule}")
    if payload.offer:
        command.extend(
            (
                f"--offer-label={payload.offer.label}",
                f"--offer-months={payload.offer.months}",
                f"--offer-condition={payload.offer.condition}",
            )
        )

    CALL_LOG_DIR.mkdir(parents=True, exist_ok=True)
    with (CALL_LOG_DIR / f"{call_id}.log").open("ab") as call_log:
        process = subprocess.Popen(
            command,
            cwd=PROJECT_ROOT,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=call_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    return call_id, RetentionCallProcess(
        process=process,
        started_at=time.monotonic(),
        event_path=event_path,
    )


def interpret_workflow(instruction: str) -> WorkflowInterpretation:
    env = os.environ.copy()
    for key, value in _dotenv_values(ENGINE_ENV).items():
        if value and not env.get(key):
            env[key] = value
    api_key = env.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    body = json.dumps(
        {
            "model": env.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            "max_tokens": 250,
            "system": (
                "Convert a Smartset retention-workflow edit into JSON only. Return exactly "
                "{summary, offerLabel, offerMonths, condition}. offerMonths must be 0 or 1. "
                "Use 1 only for an explicitly requested one-free-month offer; otherwise 0 and "
                "offerLabel null. Conditions must require a confirmed causal root reason and "
                "must avoid premature incentives."
            ),
            "messages": [{"role": "user", "content": instruction}],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response_body = json.load(response)
        text = "".join(
            block.get("text", "")
            for block in response_body.get("content", [])
            if block.get("type") == "text"
        ).strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return WorkflowInterpretation.model_validate_json(text)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
        raise ConnectionError("workflow interpretation failed") from exc


def ask_insights(question: str) -> InsightAnswer:
    env = os.environ.copy()
    for key, value in _dotenv_values(ENGINE_ENV).items():
        if value and not env.get(key):
            env[key] = value
    api_key = env.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    body = json.dumps(
        {
            "model": env.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            "max_tokens": 220,
            "system": (
                "You are Smartset's customer-intelligence analyst. Answer only from this "
                "current dashboard snapshot: 100 customers; 38 contacted; 29 completed "
                "conversations; 11 reactivated; 7 subscriptions saved; $1,258 ARR retained. "
                "Disengagement reasons: habit broken 31%, product friction 24%, price 18%, "
                "low perceived value 15%, switched to an alternative 12%. The top competitor "
                "mentioned is MyFitnessPal. A recurring insight is that users lose their "
                "tracking habit after 7-14 inactive days. Answer in at most two concise "
                "sentences. If the snapshot cannot support the answer, say that plainly."
            ),
            "messages": [{"role": "user", "content": question}],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response_body = json.load(response)
        answer = "".join(
            block.get("text", "")
            for block in response_body.get("content", [])
            if block.get("type") == "text"
        ).strip()
        if not answer:
            raise ValueError("empty Anthropic response")
        return InsightAnswer(answer=answer)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
        raise ConnectionError("insight question failed") from exc
