import asyncio
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import CallSessionRecord, Department, Ticket, get_engine
from constants import QUERY_TYPE, ROLE_TYPE
from sessions import (
    HumanAgentSession,
    SessionBroadcaster,
    get_call,
    register_human,
    unregister_human,
)
from loggers import get_logger, LOG_ENTITIES
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/sessions", tags=["sessions"])
_log = get_logger(LOG_ENTITIES.APP)

# Roles that can interact with live sessions.
_LIVE_SESSION_ROLES = (
    ROLE_TYPE.SUPER_ADMIN,
    ROLE_TYPE.CALL_CENTER_ADMIN,
    ROLE_TYPE.CALL_CENTER_USER,
    ROLE_TYPE.DEPT_ADMIN,
    ROLE_TYPE.DEPT_USER,
)


# ── visibility helper ─────────────────────────────────────────────────────────

def _session_visible(claims: dict, status: dict) -> bool:
    """Return True if the caller (from JWT claims) should see this session status."""
    role    = ROLE_TYPE(claims["role_type"])
    dept_id = claims.get("department_id")
    routed  = status.get("routed_department_id")

    if role == ROLE_TYPE.SUPER_ADMIN:
        return True
    if role in (ROLE_TYPE.CALL_CENTER_ADMIN, ROLE_TYPE.CALL_CENTER_USER):
        return routed is None   # unrouted sessions belong to call center
    if role in (ROLE_TYPE.DEPT_ADMIN, ROLE_TYPE.DEPT_USER):
        return routed == dept_id
    return False


# ── schemas ───────────────────────────────────────────────────────────────────

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
    system_score: float | None = None
    user_score: float | None = None
    urgency_score: float | None = None
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


class TakeoverRequest(BaseModel):
    agent_id: str


class RouteRequest(BaseModel):
    department_id: int


# ── endpoints ─────────────────────────────────────────────────────────────────

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
    query_type: QUERY_TYPE | None = Query(
        default=None,
        description="Filter by query type: GRIEVANCE, ENQUIRY, or OTHERS",
    ),
    limit: int = Query(default=20, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    order: Literal["newest", "oldest"] = Query(default="newest"),
    claims: dict = Depends(require_roles(*_LIVE_SESSION_ROLES)),
) -> list[CallSessionOut]:
    """List completed call sessions with optional date range and query type filters.

    Results are scoped to the caller's role: super_admin sees all; call center
    sees unrouted sessions; dept roles see their department's sessions only.
    """
    role    = ROLE_TYPE(claims["role_type"])
    dept_id = claims.get("department_id")

    with Session(get_engine()) as db:
        q = db.query(CallSessionRecord).join(
            Ticket, CallSessionRecord.ticket_id == Ticket.id, isouter=True
        )

        # Scope by visibility
        if role in (ROLE_TYPE.CALL_CENTER_ADMIN, ROLE_TYPE.CALL_CENTER_USER):
            q = q.filter(Ticket.routed_department_id == None)  # noqa: E711
        elif role in (ROLE_TYPE.DEPT_ADMIN, ROLE_TYPE.DEPT_USER):
            q = q.filter(Ticket.routed_department_id == dept_id)
        # super_admin: no filter

        if start_date:
            q = q.filter(CallSessionRecord.started_at >= start_date.isoformat())
        if end_date:
            q = q.filter(CallSessionRecord.started_at <= end_date.isoformat())
        if query_type:
            q = q.filter(CallSessionRecord.query_type == query_type.value)

        sort_col = (
            CallSessionRecord.id.desc()
            if order == "newest"
            else CallSessionRecord.id.asc()
        )
        rows = q.order_by(sort_col).offset(offset).limit(limit).all()
        return [CallSessionOut.model_validate(row) for row in rows]


@router.get("/history/{session_id}", response_model=CallSessionOut)
def get_completed_session(
    session_id: str,
    claims: dict = Depends(require_roles(*_LIVE_SESSION_ROLES)),
) -> CallSessionOut:
    """Fetch a single completed call session by its session_id."""
    role    = ROLE_TYPE(claims["role_type"])
    dept_id = claims.get("department_id")

    with Session(get_engine()) as db:
        q = db.query(CallSessionRecord).filter(
            CallSessionRecord.session_id == session_id
        ).join(Ticket, CallSessionRecord.ticket_id == Ticket.id, isouter=True)

        if role in (ROLE_TYPE.CALL_CENTER_ADMIN, ROLE_TYPE.CALL_CENTER_USER):
            q = q.filter(Ticket.routed_department_id == None)  # noqa: E711
        elif role in (ROLE_TYPE.DEPT_ADMIN, ROLE_TYPE.DEPT_USER):
            q = q.filter(Ticket.routed_department_id == dept_id)

        row = q.first()
        if row is None:
            raise HTTPException(status_code=404, detail="session not found")
        return CallSessionOut.model_validate(row)


@router.get("")
async def list_sessions(
    claims: dict = Depends(require_roles(*_LIVE_SESSION_ROLES)),
) -> list[dict]:
    """Return a snapshot of currently active call sessions visible to the caller."""
    all_sessions = list(SessionBroadcaster.get().active_sessions.values())
    return [s for s in all_sessions if _session_visible(claims, s)]


@router.get("/{session_id}")
async def get_live_session(
    session_id: str,
    claims: dict = Depends(require_roles(*_LIVE_SESSION_ROLES)),
) -> dict:
    """Fetch the current status of a single active (live) call session."""
    status = SessionBroadcaster.get().active_sessions.get(session_id)
    if status is None:
        raise HTTPException(status_code=404, detail="session not found or not active")
    if not _session_visible(claims, status):
        raise HTTPException(status_code=403, detail="session not visible to your role")
    return status


@router.websocket("/stream")
async def stream_sessions(websocket: WebSocket) -> None:
    """Stream live session status events filtered by the caller's role.

    New connections receive an immediate snapshot of all visible active sessions,
    then receive incremental updates as sessions start, change state, or end.
    Auth is passed as a query param: ?token=<access_token>
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="missing token")
        return

    from .auth import _decode_token
    try:
        claims = _decode_token(token)
    except Exception:
        await websocket.close(code=4001, reason="invalid token")
        return

    role = ROLE_TYPE(claims["role_type"])
    if role not in set(_LIVE_SESSION_ROLES):
        await websocket.close(code=4003, reason="insufficient permissions")
        return

    await websocket.accept()
    broadcaster = SessionBroadcaster.get()
    queue = broadcaster.subscribe()
    _PING_INTERVAL = 30  # seconds

    try:
        while True:
            try:
                status = await asyncio.wait_for(queue.get(), timeout=_PING_INTERVAL)
                if _session_visible(claims, status):
                    await websocket.send_text(json.dumps(status))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unsubscribe(queue)


@router.post("/{session_id}/takeover")
async def takeover_session(
    session_id: str,
    body: TakeoverRequest,
    claims: dict = Depends(require_roles(*_LIVE_SESSION_ROLES)),
) -> dict:
    """Claim a live call session for human handling. Only one agent can claim at a time."""
    session = get_call(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found or not active")

    status_snapshot = SessionBroadcaster.get().active_sessions.get(session_id, {})
    if not _session_visible(claims, status_snapshot):
        raise HTTPException(status_code=403, detail="session not visible to your role")

    if session.human_takeover:
        raise HTTPException(
            status_code=409, detail=f"session already claimed by {session.claimed_by!r}"
        )
    session.human_takeover    = True
    session.claimed_by        = body.agent_id
    session.taken_over_by_id  = int(claims["sub"])  # staff_users.id from verified JWT
    _log.info(f"session {session_id!r} claimed by agent {body.agent_id!r}")
    session._emit_status("session_updated")
    return {"session_id": session_id, "claimed_by": body.agent_id}


@router.post("/{session_id}/route")
async def route_session(
    session_id: str,
    body: RouteRequest,
    claims: dict = Depends(
        require_roles(ROLE_TYPE.CALL_CENTER_ADMIN, ROLE_TYPE.CALL_CENTER_USER, ROLE_TYPE.SUPER_ADMIN)
    ),
) -> dict:
    """Assign a live session to a department so that dept users can see it.

    Only call center agents and super_admin may call this.
    Once routed, the session disappears from the call center dashboard and
    appears in the target department's live dashboard.
    """
    session = get_call(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found or not active")

    with Session(get_engine()) as db:
        dept = db.query(Department).filter(Department.id == body.department_id).first()
        if dept is None:
            raise HTTPException(status_code=404, detail="department not found")
        if dept.active is False:
            raise HTTPException(status_code=422, detail="department is inactive")

    session.routed_department_id = body.department_id
    session._emit_status("session_updated")
    _log.info(f"session {session_id!r} routed to department {body.department_id}")
    return {"session_id": session_id, "routed_department_id": body.department_id}


@router.websocket("/{session_id}/audio")
async def human_agent_audio(
    websocket: WebSocket,
    session_id: str,
    agent_id: str = Query(...),
) -> None:
    """Audio stream for the human agent after takeover.

    Send binary audio chunks and VAD signals identical to the /call protocol.
    Audio is forwarded live to the caller; VAD false flushes a 'human:' transcript turn.
    """
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
