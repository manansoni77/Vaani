from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase

from config import DB_URL


class Base(DeclarativeBase):
    pass


_engine = None


def _patch_jsonb_for_sqlite() -> None:
    """Swap JSONB → JSON on the tickets table so SQLite can compile it."""
    from .models import Ticket
    col = Ticket.__table__.c.get("extracted_entities")
    if col is not None and isinstance(col.type, JSONB):
        col.type = JSON()


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DB_URL)
        if DB_URL.startswith("sqlite"):
            _patch_jsonb_for_sqlite()
        Base.metadata.create_all(_engine)
    return _engine
