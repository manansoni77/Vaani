import asyncio
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, WebSocket
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from database import CallSessionRecord, Caller, Ticket, get_engine
from sessions import CallSession, register_call, unregister_call

router = APIRouter()

_PHONE_RE = re.compile(r"^\d{10}$")


# ── schemas ───────────────────────────────────────────────────────────────────

class TicketInfo(BaseModel):
    id: int
    status: str
    priority: str
    description: str | None
    created_at: str | None
    updated_at: str | None
    session_ids: list[str]


class SessionInfo(BaseModel):
    session_id: str
    started_at: str
    ended_at: str
    duration_s: float
    phase: str
    query_type: str | None
    summary: str | None


# ── endpoints ─────────────────────────────────────────────────────────────────

def _resolve_caller_id(phone: str, db: DBSession) -> int:
    if not _PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="phone must be exactly 10 digits")
    caller = db.query(Caller).filter_by(phone_number=phone).first()
    if caller is None:
        raise HTTPException(status_code=404, detail="caller not found")
    return int(caller.id)  # type: ignore[arg-type]


@router.get("/caller/{phone}/tickets", response_model=list[TicketInfo])
def list_caller_tickets(phone: str) -> list[TicketInfo]:
    """All tickets for a caller across all statuses, newest first.

    Each ticket includes the session IDs linked to it so the caller can
    fetch session details individually. No authentication required.
    """
    with DBSession(get_engine()) as db:
        caller_id = _resolve_caller_id(phone, db)

        tickets = (
            db.query(Ticket)
            .filter(Ticket.caller_id == caller_id)
            .order_by(Ticket.id.desc())
            .all()
        )

        result = []
        for t in tickets:
            sessions = (
                db.query(CallSessionRecord.session_id)
                .filter(CallSessionRecord.ticket_id == t.id)
                .all()
            )
            result.append(
                TicketInfo(
                    id=int(t.id),  # type: ignore[arg-type]
                    status=str(t.status),
                    priority=str(t.priority),
                    description=str(t.description) if t.description else None,
                    created_at=str(t.created_at) if t.created_at else None,
                    updated_at=str(t.updated_at) if t.updated_at else None,
                    session_ids=[row[0] for row in sessions],
                )
            )
        return result


@router.get("/caller/{phone}/sessions/{session_id}", response_model=SessionInfo)
def get_caller_session(phone: str, session_id: str) -> SessionInfo:
    """Minimal info for a single completed session. Scoped to the caller's phone for privacy.

    No authentication required.
    """
    with DBSession(get_engine()) as db:
        caller_id = _resolve_caller_id(phone, db)

        row = (
            db.query(CallSessionRecord)
            .filter(
                CallSessionRecord.session_id == session_id,
                CallSessionRecord.caller_id == caller_id,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="session not found")

        return SessionInfo(
            session_id=str(row.session_id),
            started_at=str(row.started_at),
            ended_at=str(row.ended_at),
            duration_s=float(row.duration_s),
            phase=str(row.phase),
            query_type=str(row.query_type) if row.query_type else None,
            summary=str(row.summary) if row.summary else None,
        )


@router.websocket("/call")
async def call(websocket: WebSocket, phone: str = Query(...)):
    if not _PHONE_RE.match(phone):
        await websocket.close(code=4000, reason="phone must be exactly 10 digits")
        return

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    with DBSession(get_engine()) as db:
        caller = db.query(Caller).filter_by(phone_number=phone).first()
        if caller is None:
            caller = Caller(phone_number=phone, created_at=now, updated_at=now)
            db.add(caller)
            db.commit()
            db.refresh(caller)
        caller_id = int(caller.id)  # type: ignore[arg-type]

    await websocket.accept()

    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "metadata", "session_id": session_id})

    loop = asyncio.get_running_loop()

    session = CallSession(
        session_id=session_id,
        websocket=websocket,
        loop=loop,
        session_start=loop.time(),
        phone_number=phone,
        caller_id=caller_id,
    )
    register_call(session_id, session)
    session._emit_status("session_started")
    try:
        await session.run()
    finally:
        await unregister_call(session_id)
        session._emit_status("session_ended")
