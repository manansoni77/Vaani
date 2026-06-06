from sqlalchemy.orm import Session
from loggers import get_logger, LOG_ENTITIES
from .engine import get_engine
from .models import CallSessionRecord, Caller, Ticket

_default_logger = get_logger(LOG_ENTITIES.APP)


def save_call_session(
    session_id: str,
    phone_number: str,
    started_at: str,
    ended_at: str,
    duration_s: float,
    phase: str,
    turns: int,
    sentiment: str,
    human_requested: bool = False,
    transcript: str = "",
    audio_url: str | None = None,
    language: str | None = None,
    audio_mixed_url: str | None = None,
    summary: str | None = None,
    intent: str | None = None,
    key_details: str | None = None,
    system_score: float | None = None,
    user_score: float | None = None,
    urgency_score: float | None = None,
    query_type: str | None = None,
    routed_department_id: int | None = None,
    taken_over_by: int | None = None,
) -> None:
    try:
        with Session(get_engine()) as db:
            # 1. get or create caller by phone number
            caller = db.query(Caller).filter_by(phone_number=phone_number).first()
            if caller is None:
                caller = Caller(
                    phone_number=phone_number,
                    last_call_language=language,
                    created_at=started_at,
                    updated_at=ended_at,
                )
                db.add(caller)
                db.flush()  # get caller.id before using it
            else:
                caller.last_call_language = language # type: ignore
                caller.updated_at = ended_at # type: ignore

            # 2. create ticket — status and assignment depend on whether a human handled the call
            if taken_over_by is not None:
                ticket_status   = "in_progress"
                ticket_assigned = taken_over_by
            else:
                ticket_status   = "in_review"
                ticket_assigned = None

            ticket = Ticket(
                caller_id=caller.id,
                routed_department_id=routed_department_id,
                assigned_to=ticket_assigned,
                status=ticket_status,
                priority="normal",
                created_at=started_at,
                updated_at=ended_at,
            )
            db.add(ticket)
            db.flush()  # get ticket.id before using it

            # 3. create session linked to caller + ticket
            db.add(
                CallSessionRecord(
                    session_id=session_id,
                    ticket_id=ticket.id,
                    caller_id=caller.id,
                    taken_over_by=taken_over_by,
                    started_at=started_at,
                    ended_at=ended_at,
                    duration_s=duration_s,
                    phase=phase,
                    language=language,
                    system_score=system_score,
                    user_score=user_score,
                    urgency_score=urgency_score,
                    turns=turns,
                    sentiment=sentiment,
                    transcript=transcript,
                    query_type=query_type,
                    human_requested=human_requested,
                    audio_url=audio_url,
                    audio_mixed_url=audio_mixed_url,
                    summary=summary,
                    intent=intent,
                    key_details=key_details,
                )
            )
            db.commit()

    except Exception:
        _default_logger.error(
            f"failed to save call session {session_id!r}", exc_info=True
        )
