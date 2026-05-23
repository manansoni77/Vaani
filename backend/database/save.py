from sqlalchemy.orm import Session
from constants import LOG_ENTITIES
from loggers import get_logger
from .engine import get_engine
from .models import CallSessionRecord

_default_logger = get_logger(LOG_ENTITIES.APP)

def save_call_session(
    session_id: str,
    started_at: str,
    ended_at: str,
    duration_s: float,
    phase: str,
    turns: int,
    sentiment: str,
    urgency_level: str,
    human_requested: bool,
    transcript: str,
    audio_url: str | None = None,
    audio_mixed_url: str | None = None,
    summary: str | None = None,
    intent: str | None = None,
    key_details: str | None = None,
    agent_confidence: str | None = None,
    user_confidence: str | None = None,
    query_type: str | None = None,
) -> None:
    try:
        with Session(get_engine()) as db_session:
            db_session.add(
                CallSessionRecord(
                    session_id=session_id,
                    started_at=started_at,
                    ended_at=ended_at,
                    duration_s=duration_s,
                    phase=phase,
                    turns=turns,
                    sentiment=sentiment,
                    urgency_level=urgency_level,
                    human_requested=human_requested,
                    transcript=transcript,
                    audio_url=audio_url,
                    audio_mixed_url=audio_mixed_url,
                    summary=summary,
                    intent=intent,
                    key_details=key_details,
                    agent_confidence=agent_confidence,
                    user_confidence=user_confidence,
                    query_type=query_type,
                )
            )
            db_session.commit()
    except Exception:
        _default_logger.error(
            f"failed to save call session {session_id!r}", exc_info=True
        )