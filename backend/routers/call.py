import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket

from database.save_fn import save_call_session
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
        mem = session.dialogue_flow.semantic_memory
        save_call_session(
            session_id=session.session_id,
            started_at=session.started_at,
            ended_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            duration_s=round(session.loop.time() - session.session_start, 2),
            phase=session.dialogue_flow.phase.value,
            turns=session.dialogue_flow.turns,
            sentiment=mem.sentiment.value,
            urgency_level=mem.urgency_level.value,
            human_requested=mem.human_requested,
            transcript=session._format_transcript(),
            audio_url=session.audio_url,
            audio_mixed_url=session.audio_mixed_url,
            summary=mem.summary,
            intent=mem.intent,
            key_details=mem.key_details,
            agent_confidence=(
                session.dialogue_flow.agent_confidence.value
                if session.dialogue_flow.agent_confidence
                else None
            ),
            user_confidence=(
                session.dialogue_flow.user_confidence.value
                if session.dialogue_flow.user_confidence
                else None
            ),
            query_type=mem.query_type.value if mem.query_type else None,
        )
