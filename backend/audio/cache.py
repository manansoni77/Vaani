import io
import os
import wave
from config import PRERECORDED_DIR, PCM_CHUNK_SIZE
from .phrases import PRERECORDED_AUDIO


def _cache_path(phrase: PRERECORDED_AUDIO, lang: str) -> str:
    return os.path.join(PRERECORDED_DIR, f"{phrase.slug}_{lang}.wav")


def load_cached_audio(phrase: PRERECORDED_AUDIO, lang: str) -> bytes | None:
    path = _cache_path(phrase, lang)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    return None


def save_cached_audio(
    phrase: PRERECORDED_AUDIO,
    lang: str,
    pcm_bytes: bytes,
    sample_rate: int,
) -> None:
    os.makedirs(PRERECORDED_DIR, exist_ok=True)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm_bytes)
    with open(_cache_path(phrase, lang), "wb") as f:
        f.write(buf.getvalue())


def pcm_chunks(wav_bytes: bytes) -> list[bytes]:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        pcm = w.readframes(w.getnframes())
    return [pcm[i : i + PCM_CHUNK_SIZE] for i in range(0, len(pcm), PCM_CHUNK_SIZE)]
