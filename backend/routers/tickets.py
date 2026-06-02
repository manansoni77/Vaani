from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import CallSessionRecord, Department, Ticket, get_engine
from constants import ROLE_TYPE
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/tickets", tags=["tickets"])

_TICKET_ROLES = (
    ROLE_TYPE.SUPER_ADMIN,
    ROLE_TYPE.CALL_CENTER_ADMIN,
    ROLE_TYPE.CALL_CENTER_USER,
    ROLE_TYPE.DEPT_ADMIN,
    ROLE_TYPE.DEPT_USER,
)

_VALID_STATUSES = {"in_review", "in_progress", "resolved", "closed"}


# ── schemas ───────────────────────────────────────────────────────────────────

class TicketOut(BaseModel):
    id: int
    status: str
    priority: str
    routed_department_id: int | None
    assigned_to: int | None
    caller_id: int
    description: str | None
    created_at: str | None
    updated_at: str | None
    session_id: str | None  # from linked CallSessionRecord


class RerouteRequest(BaseModel):
    department_id: int | None = None  # None = send back to call center


class StatusUpdateRequest(BaseModel):
    status: Literal["in_review", "in_progress", "resolved", "closed"]


# ── helpers ───────────────────────────────────────────────────────────────────

def _apply_visibility(q, role: ROLE_TYPE, caller_id: int, dept_id: int | None):
    """Apply role-based visibility filter to a Ticket query."""
    if role == ROLE_TYPE.SUPER_ADMIN:
        pass  # sees everything
    elif role == ROLE_TYPE.CALL_CENTER_ADMIN:
        q = q.filter(Ticket.routed_department_id == None)  # noqa: E711
    elif role == ROLE_TYPE.CALL_CENTER_USER:
        q = q.filter(Ticket.routed_department_id == None).filter(  # noqa: E711
            or_(Ticket.status == "in_review", Ticket.assigned_to == caller_id)
        )
    elif role == ROLE_TYPE.DEPT_ADMIN:
        q = q.filter(Ticket.routed_department_id == dept_id)
    elif role == ROLE_TYPE.DEPT_USER:
        q = q.filter(Ticket.routed_department_id == dept_id).filter(
            or_(Ticket.status == "in_review", Ticket.assigned_to == caller_id)
        )
    return q


def _ticket_to_out(ticket: Ticket, session_id: str | None) -> TicketOut:
    return TicketOut(
        id=ticket.id,  # type: ignore[arg-type]
        status=str(ticket.status),
        priority=str(ticket.priority),
        routed_department_id=ticket.routed_department_id,  # type: ignore[arg-type]
        assigned_to=ticket.assigned_to,  # type: ignore[arg-type]
        caller_id=ticket.caller_id,  # type: ignore[arg-type]
        description=str(ticket.description) if ticket.description is not None else None,
        created_at=str(ticket.created_at) if ticket.created_at is not None else None,
        updated_at=str(ticket.updated_at) if ticket.updated_at is not None else None,
        session_id=session_id,
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TicketOut])
def list_tickets(
    status: str | None = Query(default=None, description="Filter by status: in_review, in_progress, resolved, closed"),
    limit: int = Query(default=20, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    claims: dict = Depends(require_roles(*_TICKET_ROLES)),
) -> list[TicketOut]:
    """List tickets visible to the caller.

    Visibility per role:
    - super_admin       — all tickets
    - call_center_admin — all tickets with no routed department
    - call_center_user  — unrouted in_review tickets + own in_progress/resolved/closed
    - dept_admin        — all tickets in their department
    - dept_user         — dept in_review tickets + own in_progress/resolved/closed
    """
    if status and status not in _VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"invalid status {status!r}")

    role      = ROLE_TYPE(claims["role_type"])
    caller_id = int(claims["sub"])
    dept_id   = claims.get("department_id")

    with Session(get_engine()) as db:
        q = db.query(Ticket)
        q = _apply_visibility(q, role, caller_id, dept_id)
        if status:
            q = q.filter(Ticket.status == status)

        tickets = q.order_by(Ticket.id.desc()).offset(offset).limit(limit).all()

        # Fetch linked session_id for each ticket
        ticket_ids = [t.id for t in tickets]
        session_map: dict[int, str] = {}
        if ticket_ids:
            rows = (
                db.query(CallSessionRecord.ticket_id, CallSessionRecord.session_id)
                .filter(CallSessionRecord.ticket_id.in_(ticket_ids))
                .all()
            )
            session_map = {row.ticket_id: row.session_id for row in rows}

    return [_ticket_to_out(t, session_map.get(t.id)) for t in tickets]


@router.post("/{ticket_id}/claim", response_model=TicketOut)
def claim_ticket(
    ticket_id: int,
    claims: dict = Depends(require_roles(*_TICKET_ROLES)),
) -> TicketOut:
    """Claim an in_review ticket: assign it to yourself and move it to in_progress."""
    role      = ROLE_TYPE(claims["role_type"])
    caller_id = int(claims["sub"])
    dept_id   = claims.get("department_id")
    now       = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        q = db.query(Ticket).filter(Ticket.id == ticket_id)
        q = _apply_visibility(q, role, caller_id, dept_id)
        ticket = q.first()

        if ticket is None:
            raise HTTPException(status_code=404, detail="ticket not found")
        if ticket.status != "in_review":
            raise HTTPException(
                status_code=409,
                detail=f"ticket is {ticket.status!r} — only in_review tickets can be claimed",
            )

        ticket.assigned_to = caller_id  # type: ignore[assignment]
        ticket.status      = "in_progress"  # type: ignore[assignment]
        ticket.updated_at  = now  # type: ignore[assignment]
        db.commit()
        db.refresh(ticket)

        rec = db.query(CallSessionRecord).filter(CallSessionRecord.ticket_id == ticket_id).first()
        session_id = str(rec.session_id) if rec else None

    return _ticket_to_out(ticket, session_id)


@router.post("/{ticket_id}/reroute", response_model=TicketOut)
def reroute_ticket(
    ticket_id: int,
    body: RerouteRequest,
    claims: dict = Depends(
        require_roles(ROLE_TYPE.SUPER_ADMIN, ROLE_TYPE.CALL_CENTER_ADMIN, ROLE_TYPE.CALL_CENTER_USER)
    ),
) -> TicketOut:
    """Reroute a ticket to a different department (or back to call center with department_id=null).

    Resets status to in_review and clears assigned_to regardless of current state.
    Only allowed when ticket is not already closed.
    """
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if ticket is None:
            raise HTTPException(status_code=404, detail="ticket not found")
        if ticket.status == "closed":
            raise HTTPException(status_code=409, detail="closed tickets cannot be rerouted")

        if body.department_id is not None:
            dept = db.query(Department).filter(Department.id == body.department_id).first()
            if dept is None:
                raise HTTPException(status_code=404, detail="department not found")
            if dept.active is False:
                raise HTTPException(status_code=422, detail="department is inactive")

        ticket.routed_department_id = body.department_id  # type: ignore[assignment]
        ticket.assigned_to          = None  # type: ignore[assignment]
        ticket.status               = "in_review"  # type: ignore[assignment]
        ticket.updated_at           = now  # type: ignore[assignment]
        db.commit()
        db.refresh(ticket)

        rec = db.query(CallSessionRecord).filter(CallSessionRecord.ticket_id == ticket_id).first()
        session_id = str(rec.session_id) if rec else None

    return _ticket_to_out(ticket, session_id)


@router.patch("/{ticket_id}/status", response_model=TicketOut)
def update_ticket_status(
    ticket_id: int,
    body: StatusUpdateRequest,
    claims: dict = Depends(require_roles(*_TICKET_ROLES)),
) -> TicketOut:
    """Update ticket status.

    Allowed transitions per role:
    - dept_user / call_center_user  → resolved (own tickets only)
    - dept_admin / call_center_admin → resolved, closed (dept tickets)
    - super_admin                    → any status
    """
    role      = ROLE_TYPE(claims["role_type"])
    caller_id = int(claims["sub"])
    dept_id   = claims.get("department_id")
    now       = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        q = db.query(Ticket).filter(Ticket.id == ticket_id)
        q = _apply_visibility(q, role, caller_id, dept_id)
        ticket = q.first()

        if ticket is None:
            raise HTTPException(status_code=404, detail="ticket not found")

        new_status = body.status

        # Enforce transition rules
        _user_roles  = {ROLE_TYPE.DEPT_USER, ROLE_TYPE.CALL_CENTER_USER}
        _admin_roles = {ROLE_TYPE.DEPT_ADMIN, ROLE_TYPE.CALL_CENTER_ADMIN}

        if role in _user_roles:
            if new_status != "resolved":
                raise HTTPException(status_code=403, detail="users can only set status to resolved")
            if ticket.assigned_to != caller_id:
                raise HTTPException(status_code=403, detail="you can only update your own tickets")
        elif role in _admin_roles:
            if new_status not in ("resolved", "closed"):
                raise HTTPException(status_code=403, detail="admins can only set resolved or closed")
        # super_admin: unrestricted

        ticket.status     = new_status  # type: ignore[assignment]
        ticket.updated_at = now  # type: ignore[assignment]
        db.commit()
        db.refresh(ticket)

        rec = db.query(CallSessionRecord).filter(CallSessionRecord.ticket_id == ticket_id).first()
        session_id = str(rec.session_id) if rec else None

    return _ticket_to_out(ticket, session_id)
