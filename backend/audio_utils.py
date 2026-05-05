import array
import asyncio
import io
import os
import wave

import boto3
from botocore.config import Config

PCM_SAMPLE_RATE = 16000  # Hz — must match AudioContext sampleRate on frontend

R2_ACCOUNT_ID        = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID     = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME       = os.getenv("R2_BUCKET_NAME", "vaani")
R2_PUBLIC_URL        = os.getenv("R2_PUBLIC_URL", "https://pub-0eafe6c1b8bf435d8cc1ea73caed3e2e.r2.dev")


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
) -> bytes:
    """Mix base WAV with TTS PCM overlays at given time offsets. Output length = base length."""
    with wave.open(io.BytesIO(base_wav)) as w:
        raw = w.readframes(w.getnframes())

    result = array.array("h", raw)

    for t_s, pcm_bytes in tts_events:
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
