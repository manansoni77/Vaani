from typing import Any

_call_registry: dict[str, Any] = {}
_human_registry: dict[str, Any] = {}


def register_call(session_id: str, session: Any) -> None:
    _call_registry[session_id] = session


def get_call(session_id: str) -> Any | None:
    return _call_registry.get(session_id)


async def unregister_call(session_id: str) -> None:
    _call_registry.pop(session_id, None)
    human = _human_registry.pop(session_id, None)
    if human is not None:
        await human.close()


def register_human(session_id: str, session: Any) -> None:
    _human_registry[session_id] = session


def get_human(session_id: str) -> Any | None:
    return _human_registry.get(session_id)


async def unregister_human(session_id: str) -> None:
    _human_registry.pop(session_id, None)
    call = _call_registry.pop(session_id, None)
    if call is not None:
        await call.close()
