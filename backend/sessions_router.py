import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from logger import CallSessionRecord, get_engine
from session_broadcaster import SessionBroadcaster

router = APIRouter(prefix="/sessions", tags=["sessions"])


class CallSessionOut(BaseModel):
    id: int
    session_id: str
    started_at: str
    ended_at: str
    duration_s: float
    phase: str
    turns: int
    sentiment: str
    urgency_level: str
    human_requested: bool
    transcript: str

    model_config = {"from_attributes": True}


@router.get("/history", response_model=list[CallSessionOut])
def list_completed_sessions(
    start_date: datetime | None = Query(default=None, description="Filter sessions started on or after this time (ISO 8601)"),
    end_date:   datetime | None = Query(default=None, description="Filter sessions started on or before this time (ISO 8601)"),
    limit:      int             = Query(default=20, ge=1, le=1000),
    offset:     int             = Query(default=0,  ge=0),
    order:      Literal["newest", "oldest"] = Query(default="newest"),
) -> list[CallSessionOut]:
    """List completed call sessions, ordered by start time, with optional date range filter."""
    with Session(get_engine()) as db:
        q = db.query(CallSessionRecord)
        if start_date:
            q = q.filter(CallSessionRecord.started_at >= start_date.isoformat())
        if end_date:
            q = q.filter(CallSessionRecord.started_at <= end_date.isoformat())
        sort_col = CallSessionRecord.id.desc() if order == "newest" else CallSessionRecord.id.asc()
        rows = q.order_by(sort_col).offset(offset).limit(limit).all()
        return [CallSessionOut.model_validate(row) for row in rows]


@router.get("")
async def list_sessions() -> list[dict]:
    """Return a snapshot of all currently active call sessions."""
    return list(SessionBroadcaster.get().active_sessions.values())


@router.websocket("/stream")
async def stream_sessions(websocket: WebSocket) -> None:
    """Stream live session status events to the admin dashboard.

    New connections receive an immediate snapshot of all currently active
    sessions, then receive incremental updates as sessions start, change
    state, or end.
    """
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
