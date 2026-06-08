import asyncio
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket
from sqlalchemy.orm import Session as DBSession

from database import Caller, get_engine
from sessions import CallSession, register_call, unregister_call

router = APIRouter()

_PHONE_RE = re.compile(r"^\d{10}$")


@router.websocket("/call")
async def call(websocket: WebSocket, phone: str = Query(...)):
    if not _PHONE_RE.match(phone):
        await websocket.close(code=4000, reason="phone must be exactly 10 digits")
        return

    # Get or create the Caller row so caller_id is available for the whole session.
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    with DBSession(get_engine()) as db:
        caller = db.query(Caller).filter_by(phone_number=phone).first()
        if caller is None:
            caller = Caller(phone_number=phone, created_at=now, updated_at=now)
            db.add(caller)
            db.commit()
            db.refresh(caller)
        caller_id = int(caller.id)  # type: ignore[arg-type]

    await websocket.accept()

    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "metadata", "session_id": session_id})

    loop = asyncio.get_running_loop()

    session = CallSession(
        session_id=session_id,
        websocket=websocket,
        loop=loop,
        session_start=loop.time(),
        phone_number=phone,
        caller_id=caller_id,
    )
    register_call(session_id, session)
    session._emit_status("session_started")
    try:
        await session.run()
    finally:
        await unregister_call(session_id)
        session._emit_status("session_ended")
