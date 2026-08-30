from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RetentionOffer(BaseModel):
    """The single incentive a workflow edit may configure."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    months: Literal[1]
    condition: str = Field(min_length=1, max_length=500)


class RetentionCallCreate(BaseModel):
    """Customer context for the allowlisted Smartset demo call."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    customer_id: str = Field(
        alias="customerId",
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    name: str = Field(min_length=1, max_length=120)
    plan: str = Field(min_length=1, max_length=80)
    goal: str = Field(min_length=1, max_length=120)
    baseline: int = Field(ge=0, le=10_000)
    recent: int = Field(ge=0, le=10_000)
    days_inactive: int = Field(alias="daysInactive", ge=0, le=3_650)
    churn_risk: int = Field(alias="churnRisk", ge=0, le=100)
    workflow_rule: str | None = Field(
        default=None, alias="workflowRule", max_length=500
    )
    offer: RetentionOffer | None = None

    @field_validator("customer_id", "name", "plan", "goal")
    @classmethod
    def strip_retention_text(cls, value: str) -> str:
        return value.strip()


class RetentionCallAccepted(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    call_id: str = Field(alias="callId")
    status: Literal["starting"]


class RetentionCallStatus(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    call_id: str = Field(alias="callId")
    status: Literal["starting", "in_progress", "completed", "failed"]
    events: list[dict[str, object]] = Field(default_factory=list)
    next_cursor: int = Field(alias="nextCursor", ge=0)


class WorkflowInterpretRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1, max_length=1000)


class WorkflowInterpretation(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    summary: str = Field(min_length=1, max_length=240)
    offer_label: str | None = Field(default=None, alias="offerLabel", max_length=120)
    offer_months: int = Field(alias="offerMonths", ge=0, le=1)
    condition: str = Field(min_length=1, max_length=500)


class InsightQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=1000)


class InsightAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1, max_length=2000)
