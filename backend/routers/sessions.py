import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import CallSessionRecord
from ..sessions import (
    HumanAgentSession,
    SessionBroadcaster,
    get_call,
    register_human,
    unregister_human,
)
from database import get_engine
from loggers import get_logger, LOG_ENTITIES

router = APIRouter(prefix="/sessions", tags=["sessions"])
_log = get_logger(LOG_ENTITIES.APP)


class CallSessionOut(BaseModel):
    id: int
    session_id: str
    ticket_id: int | None = None
    caller_id: int | None = None
    taken_over_by: int | None = None
    started_at: str
    ended_at: str
    duration_s: float
    phase: str
    language: str | None = None
    system_score: float | None = None    # was agent_confidence
    user_score: float | None = None      # was user_confidence
    urgency_score: float | None = None   # was urgency_level
    turns: int
    sentiment: str
    transcript: str
    query_type: str | None = None
    human_requested: bool
    audio_url: str | None = None
    audio_mixed_url: str | None = None
    summary: str | None = None
    intent: str | None = None
    key_details: str | None = None

    model_config = {"from_attributes": True}


@router.get("/history", response_model=list[CallSessionOut])
def list_completed_sessions(
    start_date: datetime | None = Query(
        default=None,
        description="Filter sessions started on or after this time (ISO 8601)",
    ),
    end_date: datetime | None = Query(
        default=None,
        description="Filter sessions started on or before this time (ISO 8601)",
    ),
    limit: int = Query(default=20, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    order: Literal["newest", "oldest"] = Query(default="newest"),
) -> list[CallSessionOut]:
    """List completed call sessions, ordered by start time, with optional date range filters."""
    with Session(get_engine()) as db:
        q = db.query(CallSessionRecord)
        if start_date:
            q = q.filter(CallSessionRecord.started_at >= start_date.isoformat())
        if end_date:
            q = q.filter(CallSessionRecord.started_at <= end_date.isoformat())
        sort_col = (
            CallSessionRecord.id.desc()
            if order == "newest"
            else CallSessionRecord.id.asc()
        )
        rows = q.order_by(sort_col).offset(offset).limit(limit).all()
        return [CallSessionOut.model_validate(row) for row in rows]


@router.get("")
async def list_sessions() -> list[dict]:
    """Return a snapshot of all currently active call sessions."""
    return list(SessionBroadcaster.get().active_sessions.values())


@router.websocket("/stream")
async def stream_sessions(websocket: WebSocket) -> None:
    """Stream live session status events to the admin dashboard."""
    await websocket.accept()
    broadcaster = SessionBroadcaster.get()
    queue = broadcaster.subscribe()
    try:
        while True:
            status = await queue.get()
            await websocket.send_text(json.dumps(status))
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unsubscribe(queue)


class TakeoverRequest(BaseModel):
    agent_id: str


@router.post("/{session_id}/takeover")
async def takeover_session(session_id: str, body: TakeoverRequest) -> dict:
    """Claim a live call session for human handling."""
    session = get_call(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found or not active")
    if session.human_takeover:
        raise HTTPException(
            status_code=409, detail=f"session already claimed by {session.claimed_by!r}"
        )
    session.human_takeover = True
    session.claimed_by = body.agent_id
    _log.info(f"session {session_id!r} claimed by agent {body.agent_id!r}")
    session._emit_status("session_updated")
    return {"session_id": session_id, "claimed_by": body.agent_id}


@router.websocket("/{session_id}/audio")
async def human_agent_audio(
    websocket: WebSocket,
    session_id: str,
    agent_id: str = Query(...),
) -> None:
    """Audio stream for the human agent after takeover."""
    await websocket.accept()
    session = get_call(session_id)
    if session is None:
        await websocket.close(code=4004, reason="session not found")
        return
    if not session.human_takeover or session.claimed_by != agent_id:
        await websocket.close(code=4003, reason="not authorized")
        return
    human_session = HumanAgentSession(call_session=session, agent_websocket=websocket)
    register_human(session_id, human_session)
    try:
        await human_session.run()
    finally:
        await unregister_human(session_id)