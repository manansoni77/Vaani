import asyncio
import json

from fastapi import WebSocket, WebSocketDisconnect

from ..ai_services.stt_tts import get_agent_stt_client
from ..loggers import get_logger, LOG_ENTITIES


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
        stt_client = get_agent_stt_client()
        stt_handle = None
        if stt_client is not None:
            stt_handle = asyncio.create_task(self._stt_task(stt_client))
        else:
            self.log.warning("STT disabled — transcript will not be generated")
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
                    if self._speaking:
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

    async def _stt_task(self, stt_client) -> None:
        self.log.info("STT task starting")
        try:
            self.log.info("STT connecting...")
            await stt_client.stream(self._audio_queue, self._on_stt_transcript)
            self.log.info("STT stream ended")
        except Exception as e:
            self.log.error(f"STT error ({type(e).__name__}): {e!r}")

    async def _on_stt_transcript(self, text: str, lang: str) -> None:
        self.log.info(f"STT transcript chunk: {text!r}  lang={lang}")
        self._pending_parts.append(text)
