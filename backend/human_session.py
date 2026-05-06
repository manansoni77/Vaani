import asyncio
import base64
import json
import os

from fastapi import WebSocket, WebSocketDisconnect
from sarvamai import AsyncSarvamAI

from audio_utils import PCM_SAMPLE_RATE

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")


class HumanAgentSession:
    """Manages audio streaming for a human agent who has taken over a call.

    Receives audio from the agent's WebSocket, forwards it directly to the
    caller, and runs STT to produce "human:" transcript turns.
    """

    def __init__(self, call_session, agent_websocket: WebSocket) -> None:
        self.call_session = call_session
        self.websocket = agent_websocket
        self._audio_queue: asyncio.Queue = asyncio.Queue()
        self._pending_parts: list[str] = []
        self._speaking: bool = False

    async def run(self) -> None:
        stt_handle = None
        if SARVAM_API_KEY:
            stt_handle = asyncio.create_task(self._stt_task())
        try:
            await self._receive_loop()
        finally:
            await self._audio_queue.put(None)
            if stt_handle:
                try:
                    await asyncio.wait_for(stt_handle, timeout=5.0)
                except (asyncio.TimeoutError, Exception):
                    stt_handle.cancel()
            # flush any remaining transcript on disconnect
            await self._flush_transcript()

    async def _receive_loop(self) -> None:
        try:
            while True:
                msg = await self.websocket.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    chunk = msg["bytes"]
                    try:
                        await self.call_session.websocket.send_bytes(chunk)
                    except Exception:
                        pass
                    await self._audio_queue.put(chunk)
                elif msg.get("text"):
                    await self._handle_vad(msg["text"])
        except WebSocketDisconnect:
            pass

    async def _handle_vad(self, raw: str) -> None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return
        if data.get("type") == "vad":
            was_speaking = self._speaking
            self._speaking = bool(data.get("speaking"))
            if was_speaking and not self._speaking:
                await self._flush_transcript()

    async def _flush_transcript(self) -> None:
        if not self._pending_parts:
            return
        full_text = " ".join(self._pending_parts)
        self._pending_parts.clear()
        self.call_session.conversation_turns.append({"role": "human", "text": full_text})
        self.call_session._emit_status("session_updated")

    async def _stt_task(self) -> None:
        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        try:
            async with sarvam.speech_to_text_translate_streaming.connect(
                model="saaras:v3",
                mode="translate",
                sample_rate=str(PCM_SAMPLE_RATE),
                input_audio_codec="pcm_s16le",
                high_vad_sensitivity=True,
            ) as sarvam_ws:
                send = asyncio.create_task(self._send_audio(sarvam_ws))
                recv = asyncio.create_task(self._recv_transcripts(sarvam_ws))
                await send
                recv.cancel()
                try:
                    await recv
                except asyncio.CancelledError:
                    pass
        except Exception:
            pass

    async def _send_audio(self, sarvam_ws) -> None:
        while (chunk := await self._audio_queue.get()) is not None:
            b64 = base64.b64encode(chunk).decode()
            await sarvam_ws.translate(audio=b64)

    async def _recv_transcripts(self, sarvam_ws) -> None:
        async for message in sarvam_ws:
            if getattr(message, "type", None) == "data":
                data = getattr(message, "data", None)
                if data:
                    text = getattr(data, "transcript", None)
                    if text:
                        self._pending_parts.append(text)
