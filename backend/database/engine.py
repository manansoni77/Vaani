from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase

from ..config import DB_URL


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


_PRESERVED_TABLES = {"staff_users", "roles", "departments"}


def reset_tables() -> None:
    engine = get_engine()
    tables_to_reset = [
        t for name, t in Base.metadata.tables.items()
        if name not in _PRESERVED_TABLES
    ]
    print(f"Resetting tables: {[t.name for t in tables_to_reset]} (preserving: {_PRESERVED_TABLES})")
    Base.metadata.drop_all(engine, tables=tables_to_reset)
    Base.metadata.create_all(engine)
