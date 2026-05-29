from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase

from config import DB_URL


class Base(DeclarativeBase):
    pass


_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DB_URL)
        Base.metadata.create_all(_engine)
    return _engine
