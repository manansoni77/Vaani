import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from log_broadcaster import LogBroadcaster, levels_at_or_above, parse_level
from logger import LogEntry, get_engine

router = APIRouter(prefix="/logs", tags=["logs"])


class LogEntryOut(BaseModel):
    id: int
    level: str
    entity: str
    session_id: str
    timestamp: str
    message: str

    model_config = {"from_attributes": True}


@router.websocket("/stream")
async def stream_logs(
    websocket: WebSocket,
    entity: str | None = Query(default=None),
    level:  str | None = Query(default=None),
) -> None:
    """Stream live log entries as they are emitted. Filters apply immediately."""
    await websocket.accept()
    broadcaster = LogBroadcaster.get()
    queue = broadcaster.subscribe(entity=entity, min_level=parse_level(level))
    try:
        while True:
            entry = await queue.get()
            await websocket.send_text(json.dumps(entry))
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unsubscribe(queue)


@router.get("", response_model=list[LogEntryOut])
def list_logs(
    entity:     str | None              = Query(default=None,      description="Filter by log entity"),
    level:      str | None              = Query(default=None,      description="Minimum log level (DEBUG/INFO/WARNING/ERROR/CRITICAL)"),
    session_id: str | None              = Query(default=None,      description="Filter by session ID"),
    start_date: datetime | None         = Query(default=None,      description="Window start — defaults to oldest entry"),
    end_date:   datetime | None         = Query(default=None,      description="Window end — defaults to newest entry"),
    limit:      int                     = Query(default=10, ge=1, le=1000, description="Max entries to return"),
    offset:     int                     = Query(default=0,  ge=0,        description="Number of entries to skip (for pagination)"),
    order:      Literal["newest", "oldest"] = Query(default="newest", description="Return newest or oldest first"),
) -> list[LogEntryOut]:
    """List and search log entries with optional filters and a date window."""
    with Session(get_engine()) as session:
        q = session.query(LogEntry)

        if entity:
            q = q.filter(LogEntry.entity == entity)
        if level:
            q = q.filter(LogEntry.level.in_(levels_at_or_above(parse_level(level))))
        if session_id:
            q = q.filter(LogEntry.session_id == session_id)
        if start_date:
            q = q.filter(LogEntry.timestamp >= start_date.isoformat())
        if end_date:
            q = q.filter(LogEntry.timestamp <= end_date.isoformat())

        sort_col = LogEntry.id.desc() if order == "newest" else LogEntry.id.asc()
        rows = q.order_by(sort_col).offset(offset).limit(limit).all()
        return [LogEntryOut.model_validate(row) for row in rows]
