from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from .engine import Base

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_name   = Column(String, nullable=True) 
    access_level = Column(String, nullable=False)          # Admin, User
    staff_users     = relationship("StaffUser", back_populates="role")

class StaffUser(Base):
    __tablename__ = "staff_users"
 
    id             = Column(Integer, primary_key=True, autoincrement=True)
    role_id       = Column(Integer, ForeignKey("roles.id"), nullable=False) 
    name           = Column(String, nullable=False)
    email          = Column(String, nullable=False, unique=True)
    google_sub     = Column(String, nullable=True, unique=True)
    active         = Column(Boolean, nullable=False, default=True)
    last_login_at  = Column(String, nullable=True)
    created_at     = Column(String, nullable=False)  # Store as ISO format string for simplicity
    updated_at     = Column(String, nullable=False)  # Store as ISO format string for simplicity
 
    role           = relationship("Role", back_populates="staff_users")
    assigned_tickets  = relationship("Ticket", foreign_keys="Ticket.assigned_to", back_populates="assignee")
    approved_tickets  = relationship("Ticket", foreign_keys="Ticket.approved_by", back_populates="approver")
    taken_sessions    = relationship("Session", back_populates="taken_over_by_user")
    log_entries       = relationship("Log", back_populates="actor")


class Caller(Base):
    __tablename__ = "callers"
 
    id                 = Column(Integer, primary_key=True, autoincrement=True)
    phone_number       = Column(String, nullable=False, unique=True)
    last_call_language = Column(String, nullable=True)
    created_at         = Column(String, nullable=True)
    updated_at         = Column(String, nullable=True)
 
    tickets  = relationship("Ticket", back_populates="caller")
    sessions = relationship("CallSessionRecord", back_populates="caller")

class Ticket(Base):
    __tablename__ = "tickets"
 
    id                 = Column(Integer, primary_key=True, autoincrement=True)
    caller_id          = Column(Integer, ForeignKey("callers.id"), nullable=False)
    routed_department  = Column(String, nullable=True)
    assigned_to        = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    status             = Column(String, nullable=False, default="open")
    priority           = Column(String, nullable=False, default="normal")
    reopen_count       = Column(Integer, nullable=False, default=0)
    description        = Column(Text, nullable=True)
    extracted_entities = Column(JSONB, nullable=True)
    approved_by        = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at         = Column(String, nullable=True)
    updated_at         = Column(String, nullable=True)
 
    caller   = relationship("Caller", back_populates="tickets")
    assignee = relationship("StaffUser", foreign_keys=[assigned_to], back_populates="assigned_tickets")
    approver = relationship("StaffUser", foreign_keys=[approved_by], back_populates="approved_tickets")
    sessions = relationship("CallSessionRecord", back_populates="ticket")
    logs     = relationship("LogEntry", back_populates="ticket")

 
class LogEntry(Base):
    __tablename__ = "logs"
 
    id          = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String, nullable=False)                        # was entity
    ticket_id   = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    session_id  = Column(String, nullable=True)                         # kept as String to match existing
    actor_id    = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    level       = Column(String, nullable=True)                         # kept from existing
    message     = Column(String, nullable=True)                         # kept from existing
    timestamp   = Column(String, nullable=True)                         # kept from existing
 
    ticket  = relationship("Ticket", back_populates="logs")
    session = relationship("CallSessionRecord", primaryjoin="LogEntry.session_id == foreign(CallSessionRecord.session_id)",back_populates="logs")
    actor   = relationship("StaffUser", back_populates="log_entries")


class CallSessionRecord(Base):
    __tablename__ = "call_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, unique=True)
    ticket_id        = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    caller_id        = Column(Integer, ForeignKey("callers.id"), nullable=True)
    taken_over_by    = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    started_at = Column(String, nullable=False)
    ended_at = Column(String, nullable=False)
    duration_s = Column(Float, nullable=False)
    phase = Column(String, nullable=False)
    language = Column(String, nullable=True)
    system_score = Column(Float, nullable=True)   # was agent_confidence now needs to be changed in LLM prompts as well    
    user_score = Column(Float, nullable=True)     # was user_confidence now needs to be changed in LLM prompts as well
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
    query_type = Column(String, nullable=True)

    ticket             = relationship("Ticket", back_populates="sessions")
    caller             = relationship("Caller", back_populates="sessions")
    taken_over_by_user = relationship("StaffUser", back_populates="taken_sessions")
    logs               = relationship("LogEntry", back_populates="session")