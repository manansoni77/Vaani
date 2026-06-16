import array
import asyncio
import io
import wave
from config import (
    PCM_SAMPLE_RATE,
    R2_ACCESS_KEY_ID,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    R2_SECRET_ACCESS_KEY,
)
import boto3
from botocore.config import Config


def _r2_client():
    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]):
        return None
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def wav_bytes(chunks: list[bytes], sample_rate: int = PCM_SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        for chunk in chunks:
            w.writeframes(chunk)
    return buf.getvalue()


def mix_wav_bytes(
    base_wav: bytes,
    tts_events: list[tuple[float, bytes]],
    sample_rate: int = PCM_SAMPLE_RATE,
    user_speech_times: list[float] | None = None,
) -> bytes:
    """Mix base WAV with TTS PCM overlays at given time offsets. Output length = base length.

    user_speech_times: session-relative start times of each valid user speech segment.
    If a user segment starts before an agent TTS event finishes, that event is clipped
    at the user segment start — only the audio that could have played before the user
    spoke is included in the mix.
    """
    with wave.open(io.BytesIO(base_wav)) as w:
        raw = w.readframes(w.getnframes())

    result = array.array("h", raw)

    for t_s, pcm_bytes in tts_events:
        duration_s = len(pcm_bytes) / (sample_rate * 2)

        # Find the earliest user speech start that falls inside this event's playback window.
        clip_s: float | None = None
        if user_speech_times:
            for ut in user_speech_times:
                if t_s < ut < t_s + duration_s:
                    if clip_s is None or ut < clip_s:
                        clip_s = ut
        if clip_s is not None:
            keep_bytes = int((clip_s - t_s) * sample_rate * 2)
            keep_bytes = max(0, keep_bytes & ~1)  # 16-bit aligned
            pcm_bytes = pcm_bytes[:keep_bytes]

        offset = int(t_s * sample_rate)
        overlay = array.array("h", pcm_bytes)
        for i, sample in enumerate(overlay):
            idx = offset + i
            if idx >= len(result):
                break
            mixed = result[idx] + sample
            result[idx] = max(-32768, min(32767, mixed))

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(result.tobytes())
    return buf.getvalue()


async def upload_to_r2(data: bytes, object_key: str) -> str | None:
    """Upload bytes to R2. Returns public URL, or None if R2 is not configured."""
    client = _r2_client()
    if client is None:
        return None
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: client.put_object(Bucket=R2_BUCKET_NAME, Key=object_key, Body=data),
    )
    return f"{R2_PUBLIC_URL}/{object_key}"
