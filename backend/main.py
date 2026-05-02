import asyncio
import base64
import json
import os
import subprocess
import uuid
import wave
from datetime import datetime, timezone

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse
from dotenv import load_dotenv

from constants import LOG_ENTITIES
from llm import word_ticker
from logger import get_logger, setup_logging

load_dotenv()

_app_log = get_logger(LOG_ENTITIES.APP)


@asynccontextmanager
async def lifespan(_: FastAPI):
    print_logs = os.getenv("PRINT_LOGS", "1") not in ("0", "false", "no")
    setup_logging(print_logs=print_logs)
    _app_log.info("starting up")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AUDIO_DIR = "audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

PCM_SAMPLE_RATE = 16000  # Hz — mic input, must match AudioContext sampleRate on frontend

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")


def save_wav(chunks: list[bytes], path: str, sample_rate: int = PCM_SAMPLE_RATE) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        for chunk in chunks:
            w.writeframes(chunk)


async def mix_audio(
    base_path: str,
    overlays: list[tuple[float, str]],  # (start_time_s, wav_path)
    output_path: str,
) -> bool:
    """Mix overlay WAV files into base_path at the given offsets using ffmpeg."""
    cmd = ["ffmpeg", "-y", "-i", base_path]
    for _, wav_path in overlays:
        cmd += ["-i", wav_path]

    mix_inputs = ["[0:a]"]
    filter_parts = []
    for i, (t_s, _) in enumerate(overlays):
        t_ms = int(t_s * 1000)
        label = f"[o{i}]"
        filter_parts.append(f"[{i + 1}:a]adelay={t_ms}:all=1{label}")
        mix_inputs.append(label)

    n = len(overlays) + 1
    filter_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={n}:duration=first:dropout_transition=0:normalize=0[out]"
    )
    cmd += ["-filter_complex", ";".join(filter_parts), "-map", "[out]", output_path]

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, lambda: subprocess.run(cmd, capture_output=True)
        )
        return result.returncode == 0
    except FileNotFoundError:
        get_logger(LOG_ENTITIES.CALL).warning("ffmpeg not found — skipping mixed audio output")
        return False


@app.websocket("/call")
async def call(websocket: WebSocket):
    await websocket.accept()

    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "metadata", "session_id": session_id})

    loop = asyncio.get_running_loop()
    session_start = loop.time()

    stt_log = get_logger(LOG_ENTITIES.SARVAM_STT)
    tts_log = get_logger(LOG_ENTITIES.SARVAM_TTS)
    call_log = get_logger(LOG_ENTITIES.CALL)

    audio_chunks: list[bytes] = []
    # (start_time_s relative to session_start, raw pcm bytes for that sentence)
    tts_events: list[tuple[float, bytes]] = []

    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    tts_queue: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()
    transcript_parts: list[str] = []

    # ------------------------------------------------------------------ sarvam STT
    async def stt_task():
        stt_log.info("task started")
        if not SARVAM_API_KEY:
            stt_log.warning("SARVAM_API_KEY not set — STT disabled")
            while (await audio_queue.get()) is not None:
                pass
            return

        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        try:
            stt_log.info("connecting...")
            async with sarvam.speech_to_text_translate_streaming.connect(
                model="saaras:v3",
                mode="translate",
                sample_rate=str(PCM_SAMPLE_RATE),
                input_audio_codec="pcm_s16le",
                high_vad_sensitivity=True,
                vad_signals=True,
            ) as sarvam_ws:
                stt_log.info("connected")

                async def send_audio():
                    while (chunk := await audio_queue.get()) is not None:
                        stt_log.debug(f"sending audio chunk of {len(chunk)} bytes")
                        b64 = base64.b64encode(chunk).decode()
                        await sarvam_ws.translate(audio=b64)

                async def receive_transcripts():
                    async for message in sarvam_ws:
                        stt_log.debug(f"received message: {message}")
                        msg_type = getattr(message, "type", None)
                        data = getattr(message, "data", None)

                        if msg_type == "data" and data:
                            text = getattr(data, "transcript", None)
                            lang = getattr(data, "language_code", None) or "en-IN"
                            if text:
                                stt_log.info(f"transcript: {text}  lang={lang}")
                                transcript_parts.append(text)
                                buf: list[str] = []
                                async for word in word_ticker(text):
                                    buf.append(word)
                                    if word and word[-1] in ".?!":
                                        sentence = " ".join(buf)
                                        tts_log.debug(f"queuing sentence: {sentence!r}")
                                        await tts_queue.put((sentence, lang))
                                        buf = []
                                if buf:
                                    sentence = " ".join(buf)
                                    tts_log.debug(f"queuing final fragment: {sentence!r}")
                                    await tts_queue.put((sentence, lang))
                        elif msg_type == "events" and data:
                            stt_log.debug(f"event: {getattr(data, 'signal_type', data)}")

                send = asyncio.create_task(send_audio())
                recv = asyncio.create_task(receive_transcripts())
                await send
                recv.cancel()
                try:
                    await recv
                except asyncio.CancelledError:
                    pass

        except BaseException as e:
            stt_log.error(f"error ({type(e).__name__}): {e!r}")
            while not audio_queue.empty():
                audio_queue.get_nowait()

    stt_handle = asyncio.create_task(stt_task())

    # ------------------------------------------------------------------ sarvam TTS
    async def tts_task():
        if not SARVAM_API_KEY:
            tts_log.warning("SARVAM_API_KEY not set — TTS disabled")
            while (await tts_queue.get()) is not None:
                pass
            return

        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)

        while True:
            item = await tts_queue.get()
            if item is None:
                break
            sentence, lang = item
            try:
                tts_log.info(f"connecting for: {sentence!r}  lang={lang}")
                async with sarvam.text_to_speech_streaming.connect(
                    model="bulbul:v3", send_completion_event=True
                ) as tts_ws:
                    tts_log.debug(f"connected for: {sentence!r}")
                    tts_log.debug(f"configuration: lang={lang}, speaker=shubh, codec=linear16, rate=16000")
                    await tts_ws.configure(
                        target_language_code=lang,
                        speaker="shubh",
                        output_audio_codec="linear16",
                        speech_sample_rate=16000,
                    )
                    tts_log.debug(f"configuration sent for: {sentence!r}")
                    await tts_ws.convert(sentence)
                    tts_log.debug(f"convert sent for: {sentence!r}")
                    await tts_ws.flush()
                    tts_log.debug(f"flush sent for: {sentence!r}")

                    start_time_s: float | None = None
                    audio_parts: list[bytes] = []
                    async for msg in tts_ws:
                        tts_log.debug(f"msg type={type(msg).__name__}: {msg}")
                        if isinstance(msg, AudioOutput):
                            chunk = base64.b64decode(msg.data.audio)
                            if start_time_s is None:
                                start_time_s = loop.time() - session_start
                            audio_parts.append(chunk)
                            await websocket.send_bytes(chunk)
                        elif isinstance(msg, EventResponse):
                            if getattr(msg.data, "event_type", None) == "final":
                                break

                    if audio_parts and start_time_s is not None:
                        tts_events.append((start_time_s, b"".join(audio_parts)))
                    tts_log.info(f"{len(audio_parts)} chunks for: {sentence!r}")
            except Exception as e:
                tts_log.error(f"error on {sentence!r}: {e!r}")

    tts_handle = asyncio.create_task(tts_task())

    # ----------------------------------------------------------- receive loop
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                call_log.info("websocket.disconnect received")
                break
            if message.get("bytes"):
                chunk = message["bytes"]
                audio_chunks.append(chunk)
                await audio_queue.put(chunk)
            elif message.get("text"):
                try:
                    vad = json.loads(message["text"])
                except json.JSONDecodeError as e:
                    call_log.warning(f"bad JSON: {e!r}  raw={message['text'][:80]!r}")
                    continue
                if vad.get("type") == "vad" and vad.get("speaking"):
                    call_log.debug("speaking")
    except WebSocketDisconnect:
        pass
    finally:
        await audio_queue.put(None)
        try:
            await asyncio.wait_for(stt_handle, timeout=10.0)
        except asyncio.TimeoutError:
            stt_log.warning("task timed out — cancelling")
            stt_handle.cancel()
        except BaseException as e:
            stt_log.error(f"task ended with error ({type(e).__name__}): {e!r}")

        await tts_queue.put(None)
        try:
            await asyncio.wait_for(tts_handle, timeout=15.0)
        except asyncio.TimeoutError:
            tts_log.warning("task timed out — cancelling")
            tts_handle.cancel()
        except BaseException as e:
            tts_log.error(f"task ended with error: {e!r}")

        if transcript_parts:
            stt_log.info(f"FULL TRANSCRIPT: {' '.join(transcript_parts)}")
        else:
            stt_log.info("no transcript produced")

        if audio_chunks:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
            raw_path = os.path.join(AUDIO_DIR, f"call_{session_id}_{timestamp}.wav")
            save_wav(audio_chunks, raw_path)
            call_log.info(f"session {session_id} raw audio saved to {raw_path}")

            if tts_events:
                # Save each TTS segment as a temp WAV (PCM s16le, 16 kHz), mix into the recording
                overlays: list[tuple[float, str]] = []
                tmp_paths: list[str] = []
                for i, (t_s, pcm_bytes) in enumerate(tts_events):
                    tmp_path = os.path.join(AUDIO_DIR, f"_tts_{session_id}_{i}.wav")
                    save_wav([pcm_bytes], tmp_path)  # 16 kHz matches PCM output rate
                    overlays.append((t_s, tmp_path))
                    tmp_paths.append(tmp_path)

                mixed_path = os.path.join(AUDIO_DIR, f"call_{session_id}_{timestamp}_mixed.wav")
                ok = await mix_audio(raw_path, overlays, mixed_path)
                if ok:
                    call_log.info(f"session {session_id} mixed audio saved to {mixed_path}")

                for p in tmp_paths:
                    try:
                        os.remove(p)
                    except OSError:
                        pass
