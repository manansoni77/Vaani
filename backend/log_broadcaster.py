import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

LEVEL_MAP: dict[str, int] = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


def parse_level(name: str | None) -> int:
    if name is None:
        return logging.DEBUG
    return LEVEL_MAP.get(name.upper(), logging.DEBUG)


def levels_at_or_above(min_level: int) -> list[str]:
    return [name for name, value in LEVEL_MAP.items() if value >= min_level]


def record_to_dict(record: logging.LogRecord) -> dict:
    return {
        "level": record.levelname,
        "entity": getattr(record, "entity", record.name),
        "session_id": getattr(record, "session_id", "NA"),
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "message": record.getMessage(),
    }


@dataclass
class _Subscription:
    queue: asyncio.Queue
    entity: str | None
    min_level: int


class LogBroadcaster:
    _instance: "LogBroadcaster | None" = None

    def __init__(self) -> None:
        self._subs: list[_Subscription] = []

    @classmethod
    def get(cls) -> "LogBroadcaster":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def subscribe(self, entity: str | None, min_level: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subs.append(_Subscription(queue=q, entity=entity, min_level=min_level))
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs = [s for s in self._subs if s.queue is not q]

    def _publish(self, entry: dict) -> None:
        for sub in self._subs:
            if sub.entity and sub.entity != entry["entity"]:
                continue
            if LEVEL_MAP.get(entry["level"], 0) < sub.min_level:
                continue
            try:
                sub.queue.put_nowait(entry)
            except asyncio.QueueFull:
                pass  # slow consumer — drop rather than block


class BroadcastHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # no event loop — skip broadcast (e.g. at import time)
        entry = record_to_dict(record)
        loop.call_soon_threadsafe(LogBroadcaster.get()._publish, entry)
