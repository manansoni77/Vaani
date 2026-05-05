import asyncio
import base64
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse

from audio_utils import PCM_SAMPLE_RATE, mix_wav_bytes, upload_to_r2, wav_bytes
from constants import LOG_ENTITIES
# from llm_pipeline import VoiceIntelligencePipeline, ConversationState
from llm_pipeline import mock_dialogue_flow
from llm import LLMClient
from logger import get_logger

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_SPEAKER_PROFILE = os.getenv("SARVAM_SPEAKER_PROFILE", "ishita")

# When True, audio is only forwarded to Sarvam STT while the frontend VAD reports speaking=true.
# When False (default), all audio is forwarded and Sarvam's internal VAD handles filtering.
VAD_GATE_STT: bool = os.getenv("VAD_GATE_STT", "0") not in ("0", "false", "no")


@dataclass
class CallSession:
    session_id: str
    websocket: WebSocket
    loop: asyncio.AbstractEventLoop
    session_start: float
    # conversationState: ConversationState

    audio_chunks: list[bytes] = field(default_factory=list)
    tts_events: list[tuple[float, bytes]] = field(default_factory=list)
    transcript_parts: list[str] = field(default_factory=list)
    audio_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    tts_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    stt_handle: asyncio.Task | None = field(default=None,  init=False)
    tts_handle: asyncio.Task | None = field(default=None,  init=False)
    _speaking:  bool               = field(default=False, init=False)
    _pending_transcript_parts: list[str] = field(default_factory=list, init=False)
    _pending_lang: str | None            = field(default=None,         init=False)

    def __post_init__(self) -> None:
        sid = self.session_id
        self.call_log = get_logger(LOG_ENTITIES.CALL,       session_id=sid)
        self.stt_log  = get_logger(LOG_ENTITIES.SARVAM_STT, session_id=sid)
        self.tts_log  = get_logger(LOG_ENTITIES.SARVAM_TTS, session_id=sid)

    # ------------------------------------------------------------------ STT

    async def stt_task(self) -> None:
        self.stt_log.info("task started")
        if not SARVAM_API_KEY:
            self.stt_log.warning("SARVAM_API_KEY not set — STT disabled")
            while (await self.audio_queue.get()) is not None:
                pass
            return

        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        try:
            self.stt_log.info("connecting...")
            async with sarvam.speech_to_text_translate_streaming.connect(
                model="saaras:v3",
                mode="translate",
                sample_rate=str(PCM_SAMPLE_RATE),
                input_audio_codec="pcm_s16le",
                high_vad_sensitivity=True,
                vad_signals=True,
            ) as sarvam_ws:
                self.stt_log.info("connected")
                await self._run_stt_streams(sarvam_ws)
        except BaseException as e:
            self.stt_log.error(f"error ({type(e).__name__}): {e!r}")
            while not self.audio_queue.empty():
                self.audio_queue.get_nowait()

    async def _run_stt_streams(self, sarvam_ws) -> None:
        send = asyncio.create_task(self._send_audio(sarvam_ws))
        recv = asyncio.create_task(self._receive_transcripts(sarvam_ws))
        await send
        recv.cancel()
        try:
            await recv
        except asyncio.CancelledError:
            pass

    async def _send_audio(self, sarvam_ws) -> None:
        while (chunk := await self.audio_queue.get()) is not None:
            self.stt_log.debug(f"sending audio chunk of {len(chunk)} bytes")
            b64 = base64.b64encode(chunk).decode()
            await sarvam_ws.translate(audio=b64)

    async def _receive_transcripts(self, sarvam_ws) -> None:
        async for message in sarvam_ws:
            self.stt_log.debug(f"received message: {message}")
            msg_type = getattr(message, "type", None)
            data     = getattr(message, "data", None)
            if msg_type == "data" and data:
                await self._handle_transcript_data(data)
            elif msg_type == "events" and data:
                self.stt_log.debug(f"event: {getattr(data, 'signal_type', data)}")

    async def _handle_transcript_data(self, data) -> None:
        text = getattr(data, "transcript",    None)
        lang = getattr(data, "language_code", None) or "en-IN"
        if not text:
            return
        self.stt_log.info(f"transcript chunk: {text}  lang={lang}")
        self.transcript_parts.append(text)
        self._pending_transcript_parts.append(text)
        self._pending_lang = lang

    async def _queue_tts_sentences(self, text: str, lang: str) -> None:
        llmClient = LLMClient()
        # pipeline = VoiceIntelligencePipeline(llmClient)

        buf: list[str] = []
        response = await mock_dialogue_flow(text)
        # async for word in pipeline.process(text, self.conversationState):

        async for word in response:
            buf.append(word)
            if word and word[-1] in ".?!":
                sentence = " ".join(buf)
                self.tts_log.debug(f"queuing sentence: {sentence!r}")
                await self.tts_queue.put((sentence, lang))
                buf = []
        if buf:
            sentence = " ".join(buf)
            self.tts_log.debug(f"queuing final fragment: {sentence!r}")
            await self.tts_queue.put((sentence, lang))

    # ------------------------------------------------------------------ TTS

    async def tts_task(self) -> None:
        if not SARVAM_API_KEY:
            self.tts_log.warning("SARVAM_API_KEY not set — TTS disabled")
            while (await self.tts_queue.get()) is not None:
                pass
            return

        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        while True:
            item = await self.tts_queue.get()
            if item is None:
                break
            sentence, lang = item
            await self._synthesise_sentence(sarvam, sentence, lang)

    async def _synthesise_sentence(self, sarvam: AsyncSarvamAI, sentence: str, lang: str) -> None:
        try:
            self.tts_log.info(f"connecting for: {sentence!r}  lang={lang}")
            async with sarvam.text_to_speech_streaming.connect(
                model="bulbul:v3", send_completion_event=True
            ) as tts_ws:
                await self._configure_tts(tts_ws, lang)
                await tts_ws.convert(sentence)
                await tts_ws.flush()
                audio_parts, start_time_s = await self._collect_tts_audio(tts_ws)

            if audio_parts and start_time_s is not None:
                self.tts_events.append((start_time_s, b"".join(audio_parts)))
            self.tts_log.info(f"{len(audio_parts)} chunks for: {sentence!r}")
        except Exception as e:
            self.tts_log.error(f"error on {sentence!r}: {e!r}")

    async def _configure_tts(self, tts_ws, lang: str) -> None:
        self.tts_log.debug(f"configuration: lang={lang}, speaker=shubh, codec=linear16, rate=16000")
        await tts_ws.configure(
            target_language_code=lang,
            speaker=SARVAM_SPEAKER_PROFILE,
            output_audio_codec="linear16",
            speech_sample_rate=16000,
        )

    async def _collect_tts_audio(self, tts_ws) -> tuple[list[bytes], float | None]:
        start_time_s: float | None = None
        audio_parts: list[bytes] = []
        async for msg in tts_ws:
            if isinstance(msg, AudioOutput):
                chunk = base64.b64decode(msg.data.audio)
                if start_time_s is None:
                    start_time_s = self.loop.time() - self.session_start
                audio_parts.append(chunk)
                await self.websocket.send_bytes(chunk)
                self.tts_log.debug(f"audio chunk received: {len(chunk)} bytes  request_id={msg.data.request_id}")
            elif isinstance(msg, EventResponse):
                event_type = getattr(msg.data, "event_type", None)
                self.tts_log.debug(f"event received: {event_type}")
                if event_type == "final":
                    break
        return audio_parts, start_time_s

    # ------------------------------------------------------------------ receive loop

    async def receive_loop(self) -> None:
        try:
            while True:
                message = await self.websocket.receive()
                if message["type"] == "websocket.disconnect":
                    self.call_log.info("websocket.disconnect received")
                    break
                if message.get("bytes"):
                    chunk = message["bytes"]
                    self.audio_chunks.append(chunk)
                    if not VAD_GATE_STT or self._speaking:
                        await self.audio_queue.put(chunk)
                    else:
                        self.call_log.debug("VAD gate active — audio chunk dropped")
                elif message.get("text"):
                    self._handle_text_message(message["text"])
        except WebSocketDisconnect:
            pass

    def _handle_text_message(self, raw: str) -> None:
        try:
            vad = json.loads(raw)
        except json.JSONDecodeError as e:
            self.call_log.warning(f"bad JSON: {e!r}  raw={raw[:80]!r}")
            return
        if vad.get("type") == "vad":
            was_speaking = self._speaking
            self._speaking = bool(vad.get("speaking"))
            self.call_log.debug(f"VAD: speaking={self._speaking}")
            if was_speaking and not self._speaking:
                asyncio.create_task(self._flush_pending_transcript())

    async def _flush_pending_transcript(self) -> None:
        if not self._pending_transcript_parts:
            return
        full_text = " ".join(self._pending_transcript_parts)
        lang = self._pending_lang or "en-IN"
        self._pending_transcript_parts = []
        self._pending_lang = None
        self.stt_log.info(f"speech ended — processing: {full_text!r}")
        await self._queue_tts_sentences(full_text, lang)

    # ------------------------------------------------------------------ shutdown

    async def shutdown(self) -> None:
        await self.audio_queue.put(None)
        await self._await_task(self.stt_handle, timeout=10.0, log=self.stt_log)

        await self.tts_queue.put(None)
        await self._await_task(self.tts_handle, timeout=15.0, log=self.tts_log)

        if self.transcript_parts:
            self.stt_log.info(f"FULL TRANSCRIPT: {' '.join(self.transcript_parts)}")
        else:
            self.stt_log.info("no transcript produced")

        await self._save_audio()

    @staticmethod
    async def _await_task(handle: asyncio.Task | None, timeout: float, log) -> None:
        if handle is None:
            return
        try:
            await asyncio.wait_for(handle, timeout=timeout)
        except asyncio.TimeoutError:
            log.warning("task timed out — cancelling")
            handle.cancel()
        except BaseException as e:
            log.error(f"task ended with error ({type(e).__name__}): {e!r}")

    async def _save_audio(self) -> None:
        if not self.audio_chunks:
            return
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        raw = wav_bytes(self.audio_chunks)
        try:
            raw_url = await upload_to_r2(raw, f"audio/call_{self.session_id}_{timestamp}.wav")
            if raw_url:
                self.call_log.info(f"raw audio uploaded: {raw_url}")
            else:
                self.call_log.warning("R2 not configured — raw audio discarded")

            if self.tts_events:
                mixed = mix_wav_bytes(raw, self.tts_events)
                if mixed:
                    mixed_url = await upload_to_r2(mixed, f"audio/call_{self.session_id}_{timestamp}_mixed.wav")
                    if mixed_url:
                        self.call_log.info(f"mixed audio uploaded: {mixed_url}")
        except Exception as e:
            import traceback
            self.call_log.error(f"audio upload failed: {e!r}\n{traceback.format_exc()}")

    # ------------------------------------------------------------------ entry point

    async def run(self) -> None:
        self.stt_handle = asyncio.create_task(self.stt_task())
        self.tts_handle = asyncio.create_task(self.tts_task())
        try:
            await self.receive_loop()
        finally:
            await self.shutdown()
