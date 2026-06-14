from .base import BaseSTTClient, BaseTTSClient
from .sarvam import SarvamSTTClient, SarvamTTSClient
from ...config import SARVAM_API_KEY, STT_PROVIDER, TTS_PROVIDER


def get_caller_stt_client() -> BaseSTTClient | None:
    if STT_PROVIDER == "sarvam":
        return SarvamSTTClient(vad_signals=True) if SARVAM_API_KEY else None
    raise ValueError(f"Unknown STT_PROVIDER: {STT_PROVIDER!r}")


def get_agent_stt_client() -> BaseSTTClient | None:
    if STT_PROVIDER == "sarvam":
        return SarvamSTTClient(vad_signals=False) if SARVAM_API_KEY else None
    raise ValueError(f"Unknown STT_PROVIDER: {STT_PROVIDER!r}")


def get_tts_client() -> BaseTTSClient | None:
    if TTS_PROVIDER == "sarvam":
        return SarvamTTSClient() if SARVAM_API_KEY else None
    raise ValueError(f"Unknown TTS_PROVIDER: {TTS_PROVIDER!r}")
