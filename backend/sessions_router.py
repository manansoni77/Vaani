import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from session_broadcaster import SessionBroadcaster

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def list_sessions() -> list[dict]:
    """Return a snapshot of all currently active call sessions."""
    return list(SessionBroadcaster.get().active_sessions.values())


@router.websocket("/stream")
async def stream_sessions(websocket: WebSocket) -> None:
    """Stream live session status events to the admin dashboard.

    New connections receive an immediate snapshot of all currently active
    sessions, then receive incremental updates as sessions start, change
    state, or end.
    """
    await websocket.accept()
    broadcaster = SessionBroadcaster.get()
    queue = broadcaster.subscribe()
    try:
        while True:
            status = await queue.get()
            await websocket.send_text(json.dumps(status))
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unsubscribe(queue)
