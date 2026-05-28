from sqlalchemy import Boolean, Column, Float, Integer, String, Text
from .engine import Base


class LogEntry(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    level = Column(String, nullable=False)
    entity = Column(String, nullable=False)
    session_id = Column(String, nullable=False, default="NA")
    timestamp = Column(String, nullable=False)
    message = Column(String, nullable=False)


class CallSessionRecord(Base):
    __tablename__ = "call_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, unique=True)
    started_at = Column(String, nullable=False)
    ended_at = Column(String, nullable=False)
    duration_s = Column(Float, nullable=False)
    phase = Column(String, nullable=False)
    turns = Column(Integer, nullable=False, default=0)
    sentiment = Column(String, nullable=False, default="neutral")
    urgency_level = Column(String, nullable=False, default="none")
    human_requested = Column(Boolean, nullable=False, default=False)
    transcript = Column(Text, nullable=False, default="")
    audio_url = Column(String, nullable=True)
    audio_mixed_url = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    intent = Column(String, nullable=True)
    key_details = Column(Text, nullable=True)
    agent_confidence = Column(String, nullable=True)
    user_confidence = Column(String, nullable=True)
    query_type = Column(String, nullable=True)