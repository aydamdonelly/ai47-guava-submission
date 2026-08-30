from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from smartset_api.retention_calls import (
    RetentionCallProcess,
    analyze_call_events,
    ask_insights,
    call_is_complete,
    interpret_workflow,
    load_call_events,
    retention_call_readiness,
    start_retention_call,
)
from smartset_api.schemas import (
    CallAnalysis,
    InsightAnswer,
    InsightQuestion,
    RetentionCallAccepted,
    RetentionCallCreate,
    RetentionCallStatus,
    WorkflowInterpretation,
    WorkflowInterpretRequest,
)


def _default_frontend_dir() -> Path | None:
    configured = os.getenv("SMARTSET_FRONTEND_DIR")
    candidates = [Path(configured)] if configured else []
    project_root = Path(__file__).resolve().parents[1]
    candidates.append(project_root / "web" / "dist")
    return next(
        (path.resolve() for path in candidates if (path / "index.html").is_file()), None
    )


def create_app(*, frontend_dir: str | Path | None = None) -> FastAPI:
    selected_frontend = (
        Path(frontend_dir).resolve() if frontend_dir else _default_frontend_dir()
    )
    has_frontend = bool(
        selected_frontend and (selected_frontend / "index.html").is_file()
    )

    app = FastAPI(
        title="Smartset Retention API",
        version="0.1.0",
        description=(
            "Backend for the Smartset retention demo: natural-language workflow edits, "
            "authorized live Guava calls, live call events, and insight questions."
        ),
    )
    app.state.frontend_dir = selected_frontend if has_frontend else None
    app.state.retention_calls: dict[str, RetentionCallProcess] = {}
    app.state.retention_analyses: dict[str, CallAnalysis] = {}
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    @app.get("/health", include_in_schema=False)
    def health() -> dict[str, object]:
        """Report whether a live call could start, without dialing anyone."""

        ready, blockers = retention_call_readiness()
        return {
            "status": "ok",
            "version": app.version,
            "callReady": ready,
            "blockers": blockers,
        }

    @app.post(
        "/api/retention/calls",
        response_model=RetentionCallAccepted,
        status_code=status.HTTP_202_ACCEPTED,
    )
    def post_retention_call(
        payload: RetentionCallCreate, request: Request
    ) -> dict[str, str]:
        try:
            call_id, process = start_retention_call(payload)
        except (OSError, RuntimeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        request.app.state.retention_calls[call_id] = process
        return {"callId": call_id, "status": "starting"}

    @app.get(
        "/api/retention/calls/{call_id}",
        response_model=RetentionCallStatus,
    )
    def get_retention_call(
        call_id: str, request: Request, cursor: Annotated[int, Query(ge=0)] = 0
    ) -> dict[str, object]:
        process = request.app.state.retention_calls.get(call_id)
        if process is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="retention call not found",
            )
        events, next_cursor = process.events(cursor)
        return {
            "callId": call_id,
            "status": process.status(),
            "events": events,
            "nextCursor": next_cursor,
        }

    @app.get(
        "/api/retention/calls/{call_id}/analysis",
        response_model=CallAnalysis,
    )
    def get_retention_call_analysis(call_id: str, request: Request) -> CallAnalysis:
        cached = request.app.state.retention_analyses.get(call_id)
        if cached is not None:
            return cached

        process = request.app.state.retention_calls.get(call_id)
        try:
            events = (
                process.events(0)[0]
                if process is not None
                else load_call_events(call_id)
            )
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="retention call not found",
            ) from exc
        if not call_is_complete(events):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="retention call has not completed",
            )

        analysis = analyze_call_events(events)
        request.app.state.retention_analyses[call_id] = analysis
        return analysis

    @app.post(
        "/api/retention/workflows/interpret",
        response_model=WorkflowInterpretation,
    )
    def post_workflow_interpret(
        payload: WorkflowInterpretRequest,
    ) -> WorkflowInterpretation:
        try:
            return interpret_workflow(payload.instruction)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        except ConnectionError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="workflow interpretation failed",
            ) from exc

    @app.post(
        "/api/retention/insights/ask",
        response_model=InsightAnswer,
    )
    def post_insight_question(
        payload: InsightQuestion, request: Request
    ) -> InsightAnswer:
        cached_analyses = [
            {"callId": call_id, **analysis.model_dump(by_alias=True)}
            for call_id, analysis in request.app.state.retention_analyses.items()
        ]
        try:
            return ask_insights(
                payload.question,
                [*payload.analyses, *cached_analyses][-20:],
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        except ConnectionError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="insight question failed",
            ) from exc

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
