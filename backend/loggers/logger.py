import logging
from datetime import datetime, timezone
from config import DB_URL
from sqlalchemy.orm import Session
class LogFormat(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        entity = getattr(record, "entity", record.name)
        session_id = getattr(record, "session_id", "NA")
        return f"{record.levelname:<8.8} | {entity:<12.12} | {session_id} | {ts} | {record.getMessage()}"


class DBHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        from database import get_engine, LogEntry
        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        entity = getattr(record, "entity", record.name)
        session_id = getattr(record, "session_id", "NA")
        try:
            with Session(get_engine()) as session:
                session.add(
                    LogEntry(
                        entity_type=entity,       # changed: was entity=entity
                        session_id=session_id,
                        level=record.levelname,
                        message=record.getMessage(),
                        timestamp=ts,
                    )
                )
                session.commit()
        except Exception:
            self.handleError(record)


def setup_logging(print_logs: bool = True) -> None:
    from .broadcaster import BroadcastHandler

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


def get_logger(entity: str, session_id: str = "NA") -> logging.LoggerAdapter:
    return logging.LoggerAdapter(
        logging.getLogger("helpline"), {"entity": entity, "session_id": session_id}
    )