from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase

from config import DB_URL


class Base(DeclarativeBase):
    pass


_engine = None


def _patch_jsonb_for_sqlite() -> None:
    """Swap every JSONB column → JSON across all models so SQLite can compile them."""
    import database.models  # noqa: F401 — ensure all models are registered
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DB_URL)
        if DB_URL.startswith("sqlite"):
            _patch_jsonb_for_sqlite()
        Base.metadata.create_all(_engine)
    return _engine
