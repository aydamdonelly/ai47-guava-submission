from __future__ import annotations

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

Priority = Literal["immediate", "prompt", "routine", "answered"]
IntakeStatus = Literal["new", "acknowledged", "on_the_way", "resolved"]
NoteStatus = Literal["pending", "approved", "rejected"]


class IntakeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    room: str = Field(min_length=1, max_length=40)
    resident: str = Field(
        min_length=1,
        max_length=120,
        validation_alias=AliasChoices("resident", "resident_name"),
    )
    raw_request: str = Field(min_length=1, max_length=4000)
    summary: str | None = Field(default=None, max_length=500)
    category: str = Field(default="unclear", max_length=80)
    model_urgency: str = Field(default="immediate", max_length=40)
    confidence: float | Literal["high", "medium", "low"] = "low"
    needs_staff: bool = False
    suggested_action: str | None = Field(default=None, max_length=500)
    answer_given: str | None = Field(default=None, max_length=2000)
    note_candidate: str | None = Field(default=None, max_length=2000)
    source: str = Field(default="voice", max_length=80)
    created_at: str | None = None

    @field_validator(
        "room",
        "resident",
        "raw_request",
        "summary",
        "category",
        "model_urgency",
        "suggested_action",
        "answer_given",
        "note_candidate",
        "source",
        "created_at",
    )
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class IntakeRecord(BaseModel):
    id: str
    room: str
    resident: str
    resident_name: str
    raw_request: str
    summary: str
    category: str
    model_urgency: str
    confidence: Literal["high", "medium", "low"]
    needs_staff: bool
    suggested_action: str
    answer_given: str | None
    note_candidate: str | None
    priority: Priority
    policy_reasons: list[str]
    rationale: str
    source: str
    status: IntakeStatus
    created_at: str
    updated_at: str


class IntakeStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: IntakeStatus


class NoteRecord(BaseModel):
    id: str
    intake_id: str
    room: str
    resident: str
    resident_name: str
    note_candidate: str
    content: str
    source_quote: str
    status: NoteStatus
    created_at: str
    reviewed_at: str | None


class NoteStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected"]


class DashboardResponse(BaseModel):
    requests: list[IntakeRecord]
    notes: list[NoteRecord]
    stats: dict[str, int]
