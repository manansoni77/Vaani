"""
gRPC servicer implementations for Vaani.

CallServiceServicer.StreamCall  ↔  WS /call
AgentServiceServicer.StreamAgentAudio  ↔  WS /sessions/{id}/audio

Both servicers reuse CallSession / HumanAgentSession by passing a
GrpcCallAdapter / GrpcAgentAdapter as the transport object instead of a real
WebSocket. The session logic is unchanged.
"""

import asyncio
import sys
import os
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "proto"))
import grpc
import vaani_pb2
import vaani_pb2_grpc

from grpc_adapter import GrpcCallAdapter, GrpcAgentAdapter, pump_inbound
from human_session import HumanAgentSession
from logger import get_logger, save_call_session
from session import CallSession
from session_registry import (
    get_call,
    register_call,
    register_human,
    unregister_call,
    unregister_human,
)
from constants import LOG_ENTITIES

_log = get_logger(LOG_ENTITIES.APP)


class CallServiceServicer(vaani_pb2_grpc.CallServiceServicer):
    """gRPC equivalent of the WS /call endpoint."""

    async def StreamCall(self, request_iterator, context):  # noqa: N802
        session_id = str(uuid.uuid4())
        adapter = GrpcCallAdapter()
        loop = asyncio.get_running_loop()

        session = CallSession(
            session_id=session_id,
            websocket=adapter,
            loop=loop,
            session_start=loop.time(),
        )

        # Mirror main.py: send metadata frame before any audio.
        await adapter.send_json({"type": "metadata", "session_id": session_id})

        register_call(session_id, session)
        session._emit_status("session_started")
        _log.info(f"[gRPC] call session started: {session_id}")

        # Pump request frames into the adapter's inbound queue concurrently.
        pump_task = asyncio.create_task(pump_inbound(request_iterator, adapter))
        session_task = asyncio.create_task(session.run())

        try:
            async for out_msg in adapter.outbound():
                yield out_msg
        finally:
            # Cancel background tasks in order.
            pump_task.cancel()
            session_task.cancel()
            try:
                await asyncio.gather(pump_task, session_task, return_exceptions=True)
            except Exception:
                pass

            await unregister_call(session_id)
            session._emit_status("session_ended")
            _log.info(f"[gRPC] call session ended: {session_id}")

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


class AgentServiceServicer(vaani_pb2_grpc.AgentServiceServicer):
    """gRPC equivalent of the WS /sessions/{id}/audio endpoint."""

    async def StreamAgentAudio(self, request_iterator, context):  # noqa: N802
        # Read session-id and agent-id from request metadata headers.
        metadata = dict(context.invocation_metadata())
        session_id = metadata.get("session-id", "")
        agent_id = metadata.get("agent-id", "")

        if not session_id or not agent_id:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "session-id and agent-id headers are required",
            )
            return

        call_session = get_call(session_id)
        if call_session is None:
            await context.abort(grpc.StatusCode.NOT_FOUND, "session not found")
            return

        if not call_session.human_takeover or call_session.claimed_by != agent_id:
            await context.abort(grpc.StatusCode.PERMISSION_DENIED, "not authorized")
            return

        adapter = GrpcAgentAdapter()
        human_session = HumanAgentSession(
            call_session=call_session, agent_websocket=adapter
        )
        register_human(session_id, human_session)
        _log.info(f"[gRPC] human agent connected: session={session_id} agent={agent_id}")

        pump_task = asyncio.create_task(pump_inbound(request_iterator, adapter))
        session_task = asyncio.create_task(human_session.run())

        try:
            async for out_msg in adapter.outbound():
                yield out_msg
        finally:
            pump_task.cancel()
            session_task.cancel()
            try:
                await asyncio.gather(pump_task, session_task, return_exceptions=True)
            except Exception:
                pass

            await unregister_human(session_id)
            _log.info(f"[gRPC] human agent disconnected: session={session_id}")
