import asyncio
from datetime import datetime, timezone


class SessionBroadcaster:
    _instance: "SessionBroadcaster | None" = None

    def __init__(self) -> None:
        self._subs: list[asyncio.Queue] = []
        self._active_sessions: dict[str, dict] = {}

    @classmethod
    def get(cls) -> "SessionBroadcaster":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def active_sessions(self) -> dict[str, dict]:
        return self._active_sessions

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        for status in self._active_sessions.values():
            try:
                q.put_nowait(status)
            except asyncio.QueueFull:
                pass
        self._subs.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs = [s for s in self._subs if s is not q]

    def publish(self, status: dict) -> None:
        sid = status["session_id"]
        if status["event_type"] == "session_ended":
            self._active_sessions.pop(sid, None)
        else:
            self._active_sessions[sid] = status
        for q in self._subs:
            try:
                q.put_nowait(status)
            except asyncio.QueueFull:
                pass  # slow consumer — drop rather than block


def build_status(
    event_type: str,
    session_id: str,
    phase: str,
    duration_s: float,
    turns: int,
    sentiment: str,
    urgency_level: str,
    human_requested: bool,
    transcript: str,
    summary: str = "",
    intent: str = "",
    key_details: str = "",
    agent_confidence: str | None = None,
    user_confidence: str | None = None,
    caller_speaking: bool = False,
    ai_speaking: bool = False,
    human_speaking: bool = False,
    human_takeover: bool = False,
    claimed_by: str | None = None,
) -> dict:
    return {
        "event_type": event_type,
        "session_id": session_id,
        "phase": phase,
        "caller_speaking": caller_speaking,
        "ai_speaking": ai_speaking,
        "human_speaking": human_speaking,
        "duration_s": round(duration_s, 2),
        "turns": turns,
        "sentiment": sentiment,
        "urgency_level": urgency_level,
        "human_requested": human_requested,
        "transcript": transcript,
        "summary": summary,
        "intent": intent,
        "key_details": key_details,
        "agent_confidence": agent_confidence,
        "user_confidence": user_confidence,
        "human_takeover": human_takeover,
        "claimed_by": claimed_by,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    }
