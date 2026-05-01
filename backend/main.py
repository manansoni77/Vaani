import asyncio
import io
import json
import math
import os
import struct
import subprocess
import uuid
import wave
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AUDIO_DIR = "audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

SILENCE_THRESHOLD = 2.0  # seconds


def generate_beep(
    freq: int = 440, duration: float = 0.3, sample_rate: int = 44100
) -> bytes:
    """440 Hz sine wave encoded as a 16-bit mono WAV."""
    num_samples = int(sample_rate * duration)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(
            struct.pack(
                f"<{num_samples}h",
                *(
                    int(0.5 * 32767 * math.sin(2 * math.pi * freq * i / sample_rate))
                    for i in range(num_samples)
                ),
            )
        )
    return buf.getvalue()


BEEP_AUDIO = generate_beep()

# Write beep to disk once so ffmpeg can reference it
BEEP_WAV_PATH = os.path.join(AUDIO_DIR, "_beep.wav")
with open(BEEP_WAV_PATH, "wb") as _f:
    _f.write(BEEP_AUDIO)


async def mix_beeps_into_audio(
    raw_path: str, beep_times_s: list[float], output_path: str
) -> bool:
    """Overlay beep tones at given offsets (seconds) into the recorded audio via ffmpeg."""
    cmd = ["ffmpeg", "-y", "-i", raw_path]
    for _ in beep_times_s:
        cmd += ["-i", BEEP_WAV_PATH]

    mix_inputs = ["[0:a]"]
    filter_parts = []
    for i, t_s in enumerate(beep_times_s):
        t_ms = int(t_s * 1000)
        label = f"[b{i}]"
        filter_parts.append(f"[{i + 1}:a]adelay={t_ms}:all=1{label}")
        mix_inputs.append(label)

    n = len(beep_times_s) + 1
    filter_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={n}:duration=first:dropout_transition=0:normalize=0[out]"
    )
    cmd += ["-filter_complex", ";".join(filter_parts), "-map", "[out]", output_path]

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(cmd, capture_output=True),
        )
        return result.returncode == 0
    except FileNotFoundError:
        print("ffmpeg not found — skipping mixed audio output")
        return False


@app.websocket("/call")
async def call(websocket: WebSocket):
    await websocket.accept()

    session_id = str(uuid.uuid4())
    await websocket.send_json({"type": "metadata", "session_id": session_id})

    loop = asyncio.get_running_loop()
    session_start = loop.time()
    last_speaking_time = session_start
    last_beep_time = 0.0  # epoch; last_speaking_time always > 0 initially
    audio_chunks: list[bytes] = []
    beep_events: list[float] = []  # seconds from session_start for each beep sent

    async def silence_watcher():
        nonlocal last_beep_time
        poll = 0
        while True:
            await asyncio.sleep(0.1)
            now = loop.time()
            silence_s = now - last_speaking_time
            spoke_since_beep = last_speaking_time > last_beep_time
            poll += 1
            if poll % 20 == 0:  # every ~2 s
                print(
                    f"[watcher] silence={silence_s:.1f}s  "
                    f"spoke_since_beep={spoke_since_beep}  "
                    f"last_speaking={last_speaking_time - session_start:.1f}s  "
                    f"last_beep={last_beep_time - session_start:.1f}s"
                )
            if silence_s >= SILENCE_THRESHOLD and spoke_since_beep:
                last_beep_time = now
                try:
                    await websocket.send_bytes(BEEP_AUDIO)
                    beep_events.append(now - session_start)
                    print(f"[watcher] BEEP sent at {now - session_start:.1f}s")
                except Exception as e:
                    print(f"[watcher] send_bytes failed: {e!r} — watcher exiting")
                    break

    watcher = asyncio.create_task(silence_watcher())

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                print("[call] websocket.disconnect received")
                break
            if message.get("bytes"):
                audio_chunks.append(message["bytes"])
            elif message.get("text"):
                try:
                    vad = json.loads(message["text"])
                except json.JSONDecodeError as e:
                    print(f"[call] bad JSON: {e!r}  raw={message['text'][:80]!r}")
                    continue
                print(f"[call] VAD message: {vad}")
                if vad.get("type") == "vad" and vad.get("speaking"):
                    last_speaking_time = loop.time()
                    print(
                        f"[call] last_speaking_time updated to {last_speaking_time - session_start:.1f}s"
                    )
    except WebSocketDisconnect:
        pass
    finally:
        watcher.cancel()
        if audio_chunks:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
            raw_path = os.path.join(AUDIO_DIR, f"call_{session_id}_{timestamp}.webm")
            with open(raw_path, "wb") as f:
                for chunk in audio_chunks:
                    f.write(chunk)
            print(f"Session {session_id} raw audio saved to {raw_path}")

            if beep_events:
                mixed_path = os.path.join(
                    AUDIO_DIR, f"call_{session_id}_{timestamp}_mixed.webm"
                )
                ok = await mix_beeps_into_audio(raw_path, beep_events, mixed_path)
                if ok:
                    print(f"Session {session_id} mixed audio saved to {mixed_path}")
