from __future__ import annotations

import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from care_signal.database import Database
from care_signal.demo import seed_demo
from care_signal.policy import LOW_CONFIDENCE_THRESHOLD, PRIORITIES
from care_signal.schemas import (
    DashboardResponse,
    IntakeCreate,
    IntakeRecord,
    IntakeStatusUpdate,
    NoteRecord,
    NoteStatusUpdate,
)
from care_signal.service import (
    InvalidStatusTransition,
    create_intake,
    dashboard,
    transition_intake,
)

STATUSES = ("new", "acknowledged", "on_the_way", "resolved")
NOTE_STATUSES = ("pending", "approved", "rejected")


def _default_frontend_dir() -> Path | None:
    configured = os.getenv("CARE_SIGNAL_FRONTEND_DIR")
    candidates = [Path(configured)] if configured else []
    project_root = Path(__file__).resolve().parents[1]
    candidates.extend((project_root / "web" / "dist", project_root / "web" / "build"))
    return next(
        (path.resolve() for path in candidates if (path / "index.html").is_file()), None
    )


def create_app(
    *,
    database_path: str | Path | None = None,
    frontend_dir: str | Path | None = None,
    demo_token: str | None = None,
) -> FastAPI:
    database = Database(
        database_path or os.getenv("CARE_SIGNAL_DB_PATH", "care_signal.sqlite3")
    )
    selected_frontend = (
        Path(frontend_dir).resolve() if frontend_dir else _default_frontend_dir()
    )
    has_frontend = bool(
        selected_frontend and (selected_frontend / "index.html").is_file()
    )
    selected_token = (
        demo_token if demo_token is not None else os.getenv("CARESIGNAL_DEMO_TOKEN", "")
    )

    def require_staff_token(
        x_caresignal_token: Annotated[str | None, Header()] = None,
    ) -> None:
        if selected_token and not (
            x_caresignal_token
            and secrets.compare_digest(x_caresignal_token, selected_token)
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="missing or invalid CareSignal demo token",
            )

    staff_only = [Depends(require_staff_token)]

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        database.initialize()
        yield

    app = FastAPI(
        title="CareSignal API",
        version="0.1.0",
        description="Safety-first resident request routing for the Guava Build Night demo.",
        lifespan=lifespan,
    )
    app.state.database = database
    app.state.frontend_dir = selected_frontend if has_frontend else None
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ],
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "X-CareSignal-Token"],
    )

    @app.get("/api/health")
    @app.get("/health", include_in_schema=False)
    def health(request: Request) -> dict[str, object]:
        healthy = request.app.state.database.ping()
        if not healthy:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="database unavailable",
            )
        return {"status": "ok", "database": "sqlite", "version": app.version}

    @app.get("/api/config")
    def config() -> dict[str, object]:
        return {
            "app_name": "CareSignal",
            "facility_name": os.getenv("FACILITY_NAME", "Northstar Senior Living"),
            "resident_name": os.getenv("DEMO_RESIDENT_NAME", "Evelyn Carter"),
            "room": os.getenv("DEMO_ROOM", "204"),
            "agent_phone": os.getenv("GUAVA_AGENT_NUMBER") or None,
            "demo_mode": True,
            "priorities": list(PRIORITIES),
            "statuses": list(STATUSES),
            "note_statuses": list(NOTE_STATUSES),
            "low_confidence_threshold": LOW_CONFIDENCE_THRESHOLD,
            "safety_policy": [
                "Red flags, clinical requests, unclear classifications, and low confidence are immediate.",
                "Personal-care or explicit human requests are at least prompt.",
                "Unknown information is routed to staff instead of invented.",
            ],
        }

    @app.get("/api/intakes", response_model=list[IntakeRecord], dependencies=staff_only)
    def list_intakes(
        request: Request,
        intake_status: Annotated[
            Literal["new", "acknowledged", "on_the_way", "resolved"] | None,
            Query(alias="status"),
        ] = None,
        priority: Literal["immediate", "prompt", "routine", "answered"] | None = None,
    ) -> list[dict[str, object]]:
        return request.app.state.database.list_intakes(
            status=intake_status, priority=priority
        )

    @app.post(
        "/api/intakes",
        response_model=IntakeRecord,
        status_code=status.HTTP_201_CREATED,
        dependencies=staff_only,
    )
    def post_intake(payload: IntakeCreate, request: Request) -> dict[str, object]:
        return create_intake(request.app.state.database, payload)

    @app.get(
        "/api/intakes/{intake_id}", response_model=IntakeRecord, dependencies=staff_only
    )
    def get_intake(intake_id: str, request: Request) -> dict[str, object]:
        intake = request.app.state.database.get_intake(intake_id)
        if intake is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="intake not found"
            )
        return intake

    @app.patch(
        "/api/intakes/{intake_id}/status",
        response_model=DashboardResponse,
        dependencies=staff_only,
    )
    def patch_intake_status(
        intake_id: str, payload: IntakeStatusUpdate, request: Request
    ) -> dict[str, object]:
        try:
            intake = transition_intake(
                request.app.state.database, intake_id, payload.status
            )
        except InvalidStatusTransition as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=str(exc)
            ) from exc
        if intake is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="intake not found"
            )
        return dashboard(request.app.state.database)

    @app.get("/api/notes", response_model=list[NoteRecord], dependencies=staff_only)
    def list_notes(
        request: Request,
        note_status: Annotated[
            Literal["pending", "approved", "rejected"] | None, Query(alias="status")
        ] = None,
    ) -> list[dict[str, object]]:
        return request.app.state.database.list_notes(status=note_status)

    @app.patch(
        "/api/notes/{note_id}/status",
        response_model=DashboardResponse,
        dependencies=staff_only,
    )
    def patch_note_status(
        note_id: str, payload: NoteStatusUpdate, request: Request
    ) -> dict[str, object]:
        note = request.app.state.database.update_note_status(note_id, payload.status)
        if note is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="note not found"
            )
        return dashboard(request.app.state.database)

    @app.get(
        "/api/dashboard", response_model=DashboardResponse, dependencies=staff_only
    )
    def get_dashboard(request: Request) -> dict[str, object]:
        return dashboard(request.app.state.database)

    @app.post("/api/demo/seed", dependencies=staff_only)
    def post_demo_seed(request: Request, reset: bool = True) -> dict[str, object]:
        seeded = seed_demo(request.app.state.database, reset=reset)
        return {"seeded": len(seeded), **dashboard(request.app.state.database)}

    if has_frontend and selected_frontend is not None:

        @app.get("/", include_in_schema=False)
        def frontend_index() -> FileResponse:
            return FileResponse(selected_frontend / "index.html")

        @app.get("/{frontend_path:path}", include_in_schema=False)
        def frontend_fallback(frontend_path: str) -> FileResponse:
            if frontend_path.startswith("api/"):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="not found"
                )
            candidate = (selected_frontend / frontend_path).resolve()
            if candidate.is_relative_to(selected_frontend) and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(selected_frontend / "index.html")

    else:

        @app.get("/", include_in_schema=False)
        def api_docs() -> RedirectResponse:
            return RedirectResponse(url="/docs")

    return app


app = create_app()
