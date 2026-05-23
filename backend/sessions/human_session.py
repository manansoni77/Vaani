import asyncio
import base64
import json
import os

from fastapi import WebSocket, WebSocketDisconnect
from sarvamai import AsyncSarvamAI
from config import PCM_SAMPLE_RATE, SARVAM_API_KEY
from constants import LOG_ENTITIES
from logging_module.logger import get_logger


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
        self._closed: bool = False
        sid = call_session.session_id
        self.log = get_logger(LOG_ENTITIES.HUMAN_AGENT, session_id=sid)

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.log.info("closing human agent session")
        try:
            await self.websocket.close()
        except Exception:
            pass

    async def run(self) -> None:
        self.log.info(
            f"human agent connected — claimed_by={self.call_session.claimed_by!r}"
        )
        self.call_session.human_agent_ws = self.websocket
        self.log.info(
            "registered as call_session.human_agent_ws — caller audio will be forwarded"
        )
        stt_handle = None
        if SARVAM_API_KEY:
            stt_handle = asyncio.create_task(self._stt_task())
        else:
            self.log.warning(
                "SARVAM_API_KEY not set — STT disabled, transcript will not be generated"
            )
        try:
            await self._receive_loop()
        finally:
            self.call_session.human_agent_ws = None
            self.call_session.set_human_speaking(False)
            self.log.info("cleared call_session.human_agent_ws")
            await self._audio_queue.put(None)
            if stt_handle:
                try:
                    await asyncio.wait_for(stt_handle, timeout=5.0)
                except asyncio.TimeoutError:
                    self.log.warning("STT task timed out on shutdown — cancelling")
                    stt_handle.cancel()
                except Exception as e:
                    self.log.error(f"STT task error on shutdown: {e!r}")
            await self._flush_transcript()
            self.log.info("human agent disconnected")

    async def _receive_loop(self) -> None:
        tasks = []
        try:
            while True:
                msg = await self.websocket.receive()
                if msg["type"] == "websocket.disconnect":
                    self.log.info("websocket.disconnect received")
                    break
                if msg.get("bytes"):
                    chunk = msg["bytes"]
                    self.log.debug(f"forwarding audio chunk: {len(chunk)} bytes")
                    try:
                        await self.call_session.websocket.send_bytes(chunk)
                    except Exception as e:
                        self.log.warning(f"failed to forward audio to caller: {e!r}")
                    self._audio_queue.put_nowait(chunk)
                elif msg.get("text"):
                    await self._handle_vad(msg["text"])
        except WebSocketDisconnect:
            self.log.info("WebSocketDisconnect")

    async def _handle_vad(self, raw: str) -> None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            self.log.warning(f"bad JSON from agent: {e!r}  raw={raw[:80]!r}")
            return
        if data.get("type") == "vad":
            was_speaking = self._speaking
            self._speaking = bool(data.get("speaking"))
            self.log.debug(f"VAD: speaking={self._speaking}")
            self.call_session.set_human_speaking(self._speaking)
            if was_speaking and not self._speaking:
                await self._flush_transcript()

    async def _flush_transcript(self) -> None:
        if not self._pending_parts:
            return
        full_text = " ".join(self._pending_parts)
        self._pending_parts.clear()
        self.log.info(f"human turn: {full_text!r}")
        self.call_session.conversation_turns.append(
            {"role": "human", "text": full_text}
        )
        self.call_session._emit_status("session_updated")

    async def _stt_task(self) -> None:
        self.log.info("STT task starting")
        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        try:
            self.log.info("STT connecting to Sarvam...")
            async with sarvam.speech_to_text_translate_streaming.connect(
                model="saaras:v3",
                mode="translate",
                sample_rate=str(PCM_SAMPLE_RATE),
                input_audio_codec="pcm_s16le",
                high_vad_sensitivity=True,
            ) as sarvam_ws:
                self.log.info("STT connected")
                send = asyncio.create_task(self._send_audio(sarvam_ws))
                recv = asyncio.create_task(self._recv_transcripts(sarvam_ws))
                await send
                recv.cancel()
                try:
                    await recv
                except asyncio.CancelledError:
                    pass
        except Exception as e:
            self.log.error(f"STT error ({type(e).__name__}): {e!r}")

    async def _send_audio(self, sarvam_ws) -> None:
        while (chunk := await self._audio_queue.get()) is not None:
            self.log.debug(f"sending audio to STT: {len(chunk)} bytes")
            b64 = base64.b64encode(chunk).decode()
            await sarvam_ws.translate(audio=b64)
        self.log.debug("audio queue drained — STT send loop done")

    async def _recv_transcripts(self, sarvam_ws) -> None:
        async for message in sarvam_ws:
            if getattr(message, "type", None) == "data":
                data = getattr(message, "data", None)
                if data:
                    text = getattr(data, "transcript", None)
                    lang = getattr(data, "language_code", None) or "en-IN"
                    if text:
                        self.log.info(f"STT transcript chunk: {text!r}  lang={lang}")
                        self._pending_parts.append(text)
