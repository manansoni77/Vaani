import logging
import os
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

# Change DB_URL to switch backends — no other code needs to change.
# SQLite:     sqlite:///logs.db
# PostgreSQL: postgresql://user:pass@host/dbname
# MySQL:      mysql+pymysql://user:pass@host/dbname
DB_URL = os.getenv("DB_URL", "sqlite:///logs.db")

_engine = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DB_URL)
        Base.metadata.create_all(_engine)
    return _engine


class Base(DeclarativeBase):
    pass


class LogEntry(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    level = Column(String, nullable=False)
    entity = Column(String, nullable=False)
    session_id = Column(String, nullable=False, default="NA")
    timestamp = Column(String, nullable=False)
    message = Column(String, nullable=False)


class LogFormat(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        entity = getattr(record, "entity", record.name)
        session_id = getattr(record, "session_id", "NA")
        return f"{record.levelname:<8.8} | {entity:<12.12} | {session_id} | {ts} | {record.getMessage()}"


class DBHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        entity = getattr(record, "entity", record.name)
        session_id = getattr(record, "session_id", "NA")
        try:
            with Session(_get_engine()) as session:
                session.add(
                    LogEntry(
                        level=record.levelname,
                        entity=entity,
                        session_id=session_id,
                        timestamp=ts,
                        message=record.getMessage(),
                    )
                )
                session.commit()
        except Exception:
            self.handleError(record)


def setup_logging(print_logs: bool = True) -> None:
    from log_broadcaster import BroadcastHandler

    print(f"Setting up logging — print_logs={print_logs}, DB_URL={DB_URL}")
    root = logging.getLogger("helpline")
    root.setLevel(logging.DEBUG)
    root.handlers.clear()

    fmt = LogFormat()

    db_handler = DBHandler()
    db_handler.setFormatter(fmt)
    root.addHandler(db_handler)

    broadcast_handler = BroadcastHandler()
    root.addHandler(broadcast_handler)

    if print_logs:
        console = logging.StreamHandler()
        console.setFormatter(fmt)
        root.addHandler(console)


def get_engine():
    return _get_engine()


def get_logger(entity: str, session_id: str = "NA") -> logging.LoggerAdapter:
    return logging.LoggerAdapter(
        logging.getLogger("helpline"), {"entity": entity, "session_id": session_id}
    )


if __name__ == "__main__":
    setup_logging(print_logs=True)

    app_log = get_logger("APP")
    call_log = get_logger("CALL", session_id="abc-123")
    stt_log = get_logger("SARVAM_STT", session_id="abc-123")
    tts_log = get_logger("SARVAM_TTS", session_id="abc-123")

    app_log.info("application starting")
    call_log.info("session started")
    stt_log.info("connecting to speech-to-text API")
    stt_log.debug("sending audio chunk of 4096 bytes")
    stt_log.info("transcript received: Hello world")
    tts_log.info("connecting for sentence: 'Hello world'")
    tts_log.warning("received 0 audio chunks — codec may be unsupported")
    tts_log.error("connection closed unexpectedly: ConnectionClosedOK(1000)")
    call_log.info("session ended — raw audio saved")

    with Session(_get_engine()) as s:
        rows = s.query(LogEntry).all()
    print(f"\n--- {len(rows)} rows in DB ---")
    for r in rows:
        print(r.level, r.entity, r.session_id, r.timestamp, r.message)
