from sqlalchemy import create_engine
from config import DB_URL
from sqlalchemy.orm import DeclarativeBase

_engine = None


class Base(DeclarativeBase):
    pass


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DB_URL)
        Base.metadata.create_all(_engine)
    return _engine
