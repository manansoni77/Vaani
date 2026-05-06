from typing import Any

_registry: dict[str, Any] = {}


def register(session_id: str, session: Any) -> None:
    _registry[session_id] = session


def unregister(session_id: str) -> None:
    _registry.pop(session_id, None)


def get(session_id: str) -> Any | None:
    return _registry.get(session_id)
