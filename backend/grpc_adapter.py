"""
Duck-typed transport adapters that wrap a gRPC bidirectional-streaming request
iterator and make it look like a FastAPI WebSocket to CallSession / HumanAgentSession.

The adapters satisfy every call site in session.py and human_session.py:
  - send_bytes(data)        → lines 262, 316
  - receive()               → line 330   (returns {"type": ..., "bytes": ..., "text": ...})
  - send_json(data)         → line 486
  - close()                 → lines 487, 505
"""

import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "proto"))
import vaani_pb2


class GrpcCallAdapter:
    """Adapts a gRPC CallService bidirectional stream to the WebSocket interface
    expected by CallSession."""

    def __init__(self) -> None:
        # Audio/VAD frames arriving from the client.
        self._inbound: asyncio.Queue = asyncio.Queue(maxsize=128)
        # CallServerMessage frames ready to yield back to the client.
        self._outbound: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._closed = False

    # ── Interface expected by session.py ─────────────────────────────────────

    async def receive(self) -> dict:
        """Return the next inbound message in the format session.py expects.

        Returns a dict with keys "type", "bytes", "text" — same shape as
        FastAPI's websocket.receive() return value.
        """
        msg = await self._inbound.get()
        if msg is None:
            return {"type": "websocket.disconnect", "bytes": None, "text": None}

        which = msg.WhichOneof("payload")
        if which == "audio":
            return {
                "type": "websocket.receive",
                "bytes": msg.audio.pcm_data,
                "text": None,
            }
        elif which == "vad":
            vad_json = json.dumps({"type": "vad", "speaking": msg.vad.speaking})
            return {
                "type": "websocket.receive",
                "bytes": None,
                "text": vad_json,
            }
        # Unknown payload — treat as disconnect
        return {"type": "websocket.disconnect", "bytes": None, "text": None}

    async def send_bytes(self, data: bytes) -> None:
        """Queue a TTS audio chunk for delivery to the client."""
        msg = vaani_pb2.CallServerMessage(
            audio=vaani_pb2.AudioChunk(pcm_data=data)
        )
        await self._outbound.put(msg)

    async def send_json(self, data: dict) -> None:
        """Queue a control message (metadata or END_CALL) for delivery."""
        msg_type = data.get("type")
        if msg_type == "END_CALL":
            out = vaani_pb2.CallServerMessage(end_call=vaani_pb2.EndCall())
            await self._outbound.put(out)
            await self._outbound.put(None)  # sentinel: stream done
        elif msg_type == "metadata":
            out = vaani_pb2.CallServerMessage(
                metadata=vaani_pb2.SessionMetadata(
                    session_id=data.get("session_id", "")
                )
            )
            await self._outbound.put(out)

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            await self._outbound.put(None)

    # ── Helpers used by the servicer ─────────────────────────────────────────

    async def push_inbound(self, msg) -> None:
        """Called by the pump task to deliver a deserialized CallClientMessage."""
        await self._inbound.put(msg)

    async def signal_inbound_done(self) -> None:
        """Called when the request stream is exhausted (client disconnected)."""
        await self._inbound.put(None)

    async def outbound(self):
        """Async generator: yields CallServerMessage objects until None sentinel."""
        while True:
            msg = await self._outbound.get()
            if msg is None:
                return
            yield msg


class GrpcAgentAdapter:
    """Adapts a gRPC AgentService bidirectional stream to the WebSocket interface
    expected by HumanAgentSession."""

    def __init__(self) -> None:
        self._inbound: asyncio.Queue = asyncio.Queue(maxsize=128)
        self._outbound: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._closed = False

    # ── Interface expected by human_session.py ───────────────────────────────

    async def receive(self) -> dict:
        msg = await self._inbound.get()
        if msg is None:
            return {"type": "websocket.disconnect", "bytes": None, "text": None}

        which = msg.WhichOneof("payload")
        if which == "audio":
            return {
                "type": "websocket.receive",
                "bytes": msg.audio.pcm_data,
                "text": None,
            }
        elif which == "vad":
            vad_json = json.dumps({"type": "vad", "speaking": msg.vad.speaking})
            return {
                "type": "websocket.receive",
                "bytes": None,
                "text": vad_json,
            }
        return {"type": "websocket.disconnect", "bytes": None, "text": None}

    async def send_bytes(self, data: bytes) -> None:
        """Queue caller audio for delivery to the human agent."""
        msg = vaani_pb2.AgentServerMessage(
            audio=vaani_pb2.AudioChunk(pcm_data=data)
        )
        await self._outbound.put(msg)

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            await self._outbound.put(None)

    # ── Helpers used by the servicer ─────────────────────────────────────────

    async def push_inbound(self, msg) -> None:
        await self._inbound.put(msg)

    async def signal_inbound_done(self) -> None:
        await self._inbound.put(None)

    async def outbound(self):
        while True:
            msg = await self._outbound.get()
            if msg is None:
                return
            yield msg


async def pump_inbound(request_iterator, adapter) -> None:

    """Consume the gRPC request stream and push messages into the adapter inbound queue.

    Runs as a background asyncio.Task. When the stream ends or an exception
    occurs, signals the adapter so receive_loop() can exit cleanly.
    """
    try:
        async for msg in request_iterator:
            await adapter.push_inbound(msg)
    except Exception:
        pass
    finally:
        await adapter.signal_inbound_done()


