import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect

from audio import load_cached_audio, mix_wav_bytes, pcm_chunks, save_cached_audio, upload_to_r2, wav_bytes
from config import PCM_SAMPLE_RATE, VAD_GATE_STT
from constants import PHASE
from audio import PRERECORDED_AUDIO
from ai_services import DialogueFlow
from ai_services.stt_tts import get_caller_stt_client, get_tts_client
from ai_services.stt_tts.base import BaseTTSClient
from loggers import get_logger, LOG_ENTITIES
from database import save_call_session
from .broadcaster import SessionBroadcaster, build_status


@dataclass
class CallSession:
    session_id: str
    websocket: WebSocket
    loop: asyncio.AbstractEventLoop
    session_start: float
    phone_number: str = "unknown"           # added: caller's phone number

    audio_chunks: list[bytes] = field(default_factory=list)
    tts_events: list[tuple[float, bytes]] = field(default_factory=list)
    transcript_parts: list[str] = field(default_factory=list)
    conversation_turns: list[dict] = field(default_factory=list)
    audio_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    tts_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    stt_handle: asyncio.Task | None = field(default=None, init=False)
    tts_handle: asyncio.Task | None = field(default=None, init=False)
    _speaking: bool = field(default=False, init=False)
    _ai_speaking: bool = field(default=False, init=False)
    _human_speaking: bool = field(default=False, init=False)
    _closed: bool = field(default=False, init=False)
    _ended: bool = field(default=False, init=False)
    audio_url: str | None = field(default=None, init=False)
    audio_mixed_url: str | None = field(default=None, init=False)
    _pending_transcript_parts: list[str] = field(default_factory=list, init=False)
    _pending_lang: str | None = field(default=None, init=False)
    _process_task: asyncio.Task | None = field(default=None, init=False)
    _interrupted_text: str | None = field(default=None, init=False)
    _interrupted_lang: str | None = field(default=None, init=False)
    _tts_stop: bool = field(default=False, init=False)
    _processing_text: str | None = field(default=None, init=False)
    _processing_lang: str | None = field(default=None, init=False)
    _current_speech_start: float | None = field(default=None, init=False)
    human_takeover: bool = field(default=False, init=False)
    claimed_by: str | None = field(default=None, init=False)
    human_agent_ws: WebSocket | None = field(default=None, init=False)
    _lang_locked: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        sid = self.session_id
        self.dialogue_flow = DialogueFlow(session_id=sid)
        self.started_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        self.call_log = get_logger(LOG_ENTITIES.CALL, session_id=sid)
        self.stt_log = get_logger(LOG_ENTITIES.SARVAM_STT, session_id=sid)
        self.tts_log = get_logger(LOG_ENTITIES.SARVAM_TTS, session_id=sid)

    def _format_transcript(self) -> str:
        lines = []
        for t in self.conversation_turns:
            role = t["role"]
            sentiment = t.get("sentiment")
            prefix = (
                f"{role} ({sentiment})"
                if sentiment and sentiment != "neutral"
                else role
            )
            lines.append(f"{prefix}: {t['text']}")
        return "\n".join(lines)

    def _emit_status(self, event_type: str) -> None:
        if self._ended:
            return
        mem = self.dialogue_flow.semantic_memory
        transcript = self._format_transcript()
        df = self.dialogue_flow
        status = build_status(
            event_type=event_type,
            session_id=self.session_id,
            phase=df.phase.value,
            caller_speaking=self._speaking,
            ai_speaking=self._ai_speaking,
            human_speaking=self._human_speaking,
            duration_s=self.loop.time() - self.session_start,
            turns=df.turns,
            sentiment=mem.sentiment.value,
            urgency_level=mem.urgency_level.value,
            human_requested=mem.human_requested,
            transcript=transcript,
            summary=mem.summary,
            intent=mem.intent,
            key_details=mem.key_details,
            human_takeover=self.human_takeover,
            claimed_by=self.claimed_by,
            query_type=mem.query_type.value if mem.query_type else None,
            service_type=mem.service_type.value if mem.service_type else None,
            location=mem.location,
            since_when=mem.since_when,
        )
        SessionBroadcaster.get().publish(status)
        if event_type == "session_ended":
            self._ended = True

    # ------------------------------------------------------------------ STT

    async def stt_task(self) -> None:
        self.stt_log.info("task started")
        client = get_caller_stt_client()
        if client is None:
            self.stt_log.warning("STT disabled — no provider configured")
            while (await self.audio_queue.get()) is not None:
                pass
            return
        try:
            self.stt_log.info("starting STT stream")
            await client.stream(self.audio_queue, self._on_stt_transcript)
        except BaseException as e:
            self.stt_log.error(f"error ({type(e).__name__}): {e!r}")
            while not self.audio_queue.empty():
                self.audio_queue.get_nowait()

    async def _on_stt_transcript(self, text: str, lang: str) -> None:
        self.stt_log.info(f"transcript chunk: {text}  lang={lang}")
        self.transcript_parts.append(text)
        self._pending_transcript_parts.append(text)
        self._pending_lang = lang

    async def _queue_tts_sentences(self, text: str, lang: str) -> None:
        buf: list[str] = []
        agent_parts: list[str] = []
        response = self.dialogue_flow.get_response(text)

        async for word in response:
            buf.append(word)
            if word and word[-1] in ".?!":
                sentence = " ".join(buf)
                self.tts_log.debug(f"queuing sentence: {sentence!r}")
                await self.tts_queue.put((sentence, lang))
                agent_parts.append(sentence)
                buf = []
        if buf:
            sentence = " ".join(buf)
            self.tts_log.debug(f"queuing final fragment: {sentence!r}")
            await self.tts_queue.put((sentence, lang))
            agent_parts.append(sentence)

        if agent_parts:
            self.conversation_turns.append(
                {"role": "agent", "text": " ".join(agent_parts)}
            )

    # ------------------------------------------------------------------ TTS

    async def tts_task(self) -> None:
        client = get_tts_client()
        if client is None:
            self.tts_log.warning("TTS disabled — no provider configured")
            while (await self.tts_queue.get()) is not None:
                pass
            return

        while True:
            item = await self.tts_queue.get()
            if item is None:
                self.tts_queue.task_done()
                break
            sentence, lang = item
            if not self._ai_speaking:
                self._ai_speaking = True
                self._emit_status("session_updated")
            await self._synthesise_sentence(client, sentence, lang)
            self.tts_queue.task_done()
            if self.tts_queue.empty():
                self._ai_speaking = False
                self._emit_status("session_updated")

    async def _synthesise_sentence(
        self, tts_client: BaseTTSClient, sentence: str, lang: str
    ) -> None:
        phrase = PRERECORDED_AUDIO.from_text(sentence)

        if phrase is not None:
            cached = load_cached_audio(phrase, lang)
            if cached is not None:
                start_time_s = self.loop.time() - self.session_start
                chunks = pcm_chunks(cached)
                total_bytes = sum(len(c) for c in chunks)
                self.tts_log.info(
                    f"[CACHE] streaming {phrase.slug!r}  lang={lang}"
                    f"  chunks={len(chunks)}  bytes={total_bytes}"
                )
                for chunk in chunks:
                    if self._tts_stop:
                        break
                    await self.websocket.send_bytes(chunk)
                self.tts_events.append((start_time_s, b"".join(chunks)))
                self.tts_log.info(f"[CACHE] done streaming {phrase.slug!r}")
                return
            else:
                self.tts_log.info(
                    f"[CACHE] miss for {phrase.slug!r}  lang={lang} — falling back to TTS"
                )
        else:
            self.tts_log.info(f"[TTS] dynamic sentence: {sentence!r}  lang={lang}")

        try:
            self.tts_log.info(f"[TTS] synthesizing: {sentence!r}  lang={lang}")
            start_time_s: float | None = None
            audio_parts: list[bytes] = []
            async for chunk in tts_client.synthesize(sentence, lang):
                if self._tts_stop:
                    break
                if start_time_s is None:
                    start_time_s = self.loop.time() - self.session_start
                audio_parts.append(chunk)
                await self.websocket.send_bytes(chunk)

            total_bytes = sum(len(p) for p in audio_parts)
            self.tts_log.info(
                f"[TTS] done: {sentence!r}  chunks={len(audio_parts)}  bytes={total_bytes}"
            )

            if audio_parts and start_time_s is not None:
                self.tts_events.append((start_time_s, b"".join(audio_parts)))
                if phrase is not None and not self._tts_stop:
                    save_cached_audio(
                        phrase, lang, b"".join(audio_parts), PCM_SAMPLE_RATE
                    )
                    self.tts_log.info(f"[CACHE] saved {phrase.slug!r}  lang={lang}")
        except Exception as e:
            self.tts_log.error(f"[TTS] error on {sentence!r}: {e!r}")

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
                    if self.human_agent_ws is not None:
                        try:
                            await self.human_agent_ws.send_bytes(chunk)
                        except Exception:
                            self.human_agent_ws = None
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
            if was_speaking != self._speaking:
                self._emit_status("session_updated")
            if not was_speaking and self._speaking:
                self._current_speech_start = self.loop.time() - self.session_start
                self._interrupt_if_processing()
            if was_speaking and not self._speaking:
                self._process_task = asyncio.create_task(
                    self._flush_pending_transcript()
                )

    def _interrupt_if_processing(self) -> None:
        if self._process_task and not self._process_task.done():
            self._interrupted_text = self._processing_text
            self._interrupted_lang = self._processing_lang
            self._process_task.cancel()
            self._tts_stop = True
            self._drain_tts_queue()
            if self._ai_speaking:
                self._ai_speaking = False
                self._emit_status("session_updated")
            self.call_log.info(
                f"processing interrupted — saved text: {self._interrupted_text!r}"
            )
        elif self._ai_speaking:
            self._tts_stop = True
            self._drain_tts_queue()
            self._ai_speaking = False
            self._emit_status("session_updated")
            self.call_log.info("TTS interrupted by user — stopping playback")

    def _drain_tts_queue(self) -> None:
        drained = 0
        while not self.tts_queue.empty():
            try:
                self.tts_queue.get_nowait()
                self.tts_queue.task_done()
                drained += 1
            except asyncio.QueueEmpty:
                break
        if drained:
            self.call_log.info(f"drained {drained} queued TTS sentences")

    async def _flush_pending_transcript(self) -> None:
        if not self._pending_transcript_parts:
            if not self._interrupted_text:
                return
            full_text = self._interrupted_text
            lang = self._interrupted_lang or "en-IN"
            self._interrupted_text = None
            self._interrupted_lang = None
        else:
            full_text = " ".join(self._pending_transcript_parts)
            lang = self._pending_lang or "en-IN"
            self._pending_transcript_parts = []
            self._pending_lang = None

            if self._interrupted_text:
                full_text = self._interrupted_text + " " + full_text
                lang = self._interrupted_lang or lang
                self._interrupted_text = None
                self._interrupted_lang = None
                self.call_log.info(f"combined with interrupted text: {full_text!r}")

        self._tts_stop = False
        self.stt_log.info(f"speech ended — processing: {full_text!r}")
        user_turn = {
            "role": "user",
            "text": full_text,
            "start_time_s": self._current_speech_start,
        }
        self.conversation_turns.append(user_turn)

        if not self._lang_locked:
            self.dialogue_flow.semantic_memory.user_language = lang
            self._lang_locked = True
            self.call_log.info(
                f"language locked for session after first capture turn: {lang!r}"
            )
        else:
            self.call_log.info(
                f"language already locked as {self.dialogue_flow.semantic_memory.user_language!r} — ignoring {lang!r}"
            )

        if self.human_takeover:
            self._emit_status("session_updated")
            return

        if self.dialogue_flow.phase == PHASE.COMPLETE:
            self.call_log.info("transcript received after call complete — ignoring")
            return

        saved_state = self.dialogue_flow.save_state()
        self._processing_text = full_text
        self._processing_lang = lang

        try:
            await self._queue_tts_sentences(full_text, lang)
            user_turn["sentiment"] = self.dialogue_flow.semantic_memory.sentiment.value
            self._emit_status("session_updated")
            if self.dialogue_flow.phase == PHASE.COMPLETE:
                asyncio.create_task(self._end_call())
        except asyncio.CancelledError:
            self.call_log.info(
                "processing cancelled — user spoke again; rolling back state"
            )
            self.dialogue_flow.restore_state(saved_state)
            if saved_state["semantic_memory"].user_language != lang:
                self._lang_locked = False
                self.call_log.info(
                    "language lock rolled back due to cancellation on first turn"
                )
            for i, turn in enumerate(self.conversation_turns):
                if turn is user_turn:
                    del self.conversation_turns[i]
                    break
        finally:
            self._processing_text = None
            self._processing_lang = None

    async def _end_call(self) -> None:
        self.call_log.info(
            "dialogue complete — waiting for TTS to drain before ending call"
        )
        await self.tts_queue.join()
        self.call_log.info("sending END_CALL and closing websocket")
        try:
            await self.websocket.send_json({"type": "END_CALL"})
            await self.websocket.close()
        except Exception as e:
            self.call_log.warning(f"END_CALL close error: {e!r}")

    def set_human_speaking(self, val: bool) -> None:
        if self._human_speaking == val:
            return
        self._human_speaking = val
        self._emit_status("session_updated")

    # ------------------------------------------------------------------ close / shutdown

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.call_log.info("closing session")
        try:
            await self.websocket.close()
        except Exception:
            pass

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
        await self._save_to_db()          # added: was missing entirely

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
            raw_url = await upload_to_r2(
                raw, f"audio/call_{self.session_id}_{timestamp}.wav"
            )
            if raw_url:
                self.audio_url = raw_url
                self.call_log.info(f"raw audio uploaded: {raw_url}")
            else:
                self.call_log.warning("R2 not configured — raw audio discarded")

            if self.tts_events:
                user_speech_times = [
                    t["start_time_s"]
                    for t in self.conversation_turns
                    if t.get("role") == "user" and t.get("start_time_s") is not None
                ]
                mixed = mix_wav_bytes(
                    raw, self.tts_events, user_speech_times=user_speech_times
                )
                if mixed:
                    mixed_url = await upload_to_r2(
                        mixed, f"audio/call_{self.session_id}_{timestamp}_mixed.wav"
                    )
                    if mixed_url:
                        self.audio_mixed_url = mixed_url
                        self.call_log.info(f"mixed audio uploaded: {mixed_url}")
        except Exception as e:
            import traceback
            self.call_log.error(f"audio upload failed: {e!r}\n{traceback.format_exc()}")

    async def _save_to_db(self) -> None:
        mem = self.dialogue_flow.semantic_memory
        df = self.dialogue_flow
        ended_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        duration_s = self.loop.time() - self.session_start

        def _conf_to_float(val: object) -> float | None:
            # convert confidence enums like 'GREEN'/'YELLOW'/'RED' to floats
            if val is None:
                return None
            try:
                return float(val)  # type: ignore[arg-type]
            except Exception:
                mapping = {"GREEN": 1.0, "YELLOW": 0.5, "RED": 0.0}
                return mapping.get(str(val).upper())

        save_call_session(
            session_id=self.session_id,
            phone_number=self.phone_number,
            started_at=self.started_at,
            ended_at=ended_at,
            duration_s=duration_s,
            phase=df.phase.value,
            turns=df.turns,
            sentiment=mem.sentiment.value,
            transcript=self._format_transcript(),
            query_type=mem.query_type.value if mem.query_type else None,
            language=mem.user_language,
            system_score=_conf_to_float(df.system_score.value) if df.system_score else None,
            user_score=_conf_to_float(df.user_score.value) if df.user_score else None,
            # save_call_session expects a str for urgency_level; provide empty string when not set
            urgency_level=str(mem.urgency_level.value) if mem.urgency_level else "",
            human_requested=mem.human_requested,
            audio_url=self.audio_url,
            audio_mixed_url=self.audio_mixed_url,
            summary=mem.summary,
            intent=mem.intent,
            key_details=str(mem.key_details) if mem.key_details else None,
            routed_department=mem.service_type.value if mem.service_type else None,
        )
        self.call_log.info("session saved to db")

    # ------------------------------------------------------------------ entry point

    async def _send_greeting(self) -> None:
        self.call_log.info("sending greeting")
        agent_parts: list[str] = []

        async for chunk in self.dialogue_flow.stream_greeting():
            if not chunk:
                continue
            await self.tts_queue.put((chunk, "en-IN"))
            agent_parts.append(chunk)

        if agent_parts:
            self.conversation_turns.append(
                {"role": "agent", "text": " ".join(agent_parts)}
            )
        self.call_log.info("greeting queued for TTS")

    async def run(self) -> None:
        asyncio.create_task(self._send_greeting())
        self.stt_handle = asyncio.create_task(self.stt_task())
        self.tts_handle = asyncio.create_task(self.tts_task())
        try:
            await self.receive_loop()
        finally:
            await self.shutdown()