import asyncio
import uuid

from fastapi import APIRouter, WebSocket

from sessions import CallSession, register_call, unregister_call

router = APIRouter()


@router.websocket("/call")
async def call(websocket: WebSocket):
    await websocket.accept()

    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "metadata", "session_id": session_id})

    loop = asyncio.get_running_loop()

    session = CallSession(
        session_id=session_id,
        websocket=websocket,
        loop=loop,
        session_start=loop.time(),
    )
    register_call(session_id, session)
    session._emit_status("session_started")
    try:
        await session.run()
    finally:
        await unregister_call(session_id)
        session._emit_status("session_ended")
