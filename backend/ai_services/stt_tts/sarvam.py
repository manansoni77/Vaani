import asyncio
import base64
from collections.abc import AsyncGenerator, Awaitable, Callable

from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse

from ai_services.stt_tts.base import BaseSTTClient, BaseTTSClient
from config import PCM_SAMPLE_RATE, SARVAM_API_KEY, SARVAM_SPEAKER_PROFILE


class SarvamSTTClient(BaseSTTClient):
    def __init__(self, vad_signals: bool = True) -> None:
        self._vad_signals = vad_signals

    async def stream(
        self,
        audio_queue: asyncio.Queue,
        on_transcript: Callable[[str, str], Awaitable[None]],
    ) -> None:
        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        async with sarvam.speech_to_text_translate_streaming.connect(
            model="saaras:v3",
            mode="translate",
            sample_rate=str(PCM_SAMPLE_RATE),
            input_audio_codec="pcm_s16le",
            high_vad_sensitivity=True,
            vad_signals=self._vad_signals,
        ) as sarvam_ws:
            send = asyncio.create_task(self._send_audio(sarvam_ws, audio_queue))
            recv = asyncio.create_task(
                self._receive_transcripts(sarvam_ws, on_transcript)
            )
            await send
            recv.cancel()
            try:
                await recv
            except asyncio.CancelledError:
                pass

    async def _send_audio(self, sarvam_ws, audio_queue: asyncio.Queue) -> None:
        while (chunk := await audio_queue.get()) is not None:
            b64 = base64.b64encode(chunk).decode()
            await sarvam_ws.translate(audio=b64)

    async def _receive_transcripts(
        self,
        sarvam_ws,
        on_transcript: Callable[[str, str], Awaitable[None]],
    ) -> None:
        async for message in sarvam_ws:
            msg_type = getattr(message, "type", None)
            data = getattr(message, "data", None)
            if msg_type == "data" and data:
                text = getattr(data, "transcript", None)
                lang = getattr(data, "language_code", None) or "en-IN"
                if text:
                    await on_transcript(text, lang)


class SarvamTTSClient(BaseTTSClient):
    async def synthesize(self, text: str, language: str) -> AsyncGenerator[bytes, None]:
        sarvam = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        async with sarvam.text_to_speech_streaming.connect(
            model="bulbul:v3", send_completion_event=True
        ) as tts_ws:
            await tts_ws.configure(
                target_language_code=language,
                speaker=SARVAM_SPEAKER_PROFILE,
                output_audio_codec="linear16",
                speech_sample_rate=PCM_SAMPLE_RATE,
            )
            await tts_ws.convert(text)
            await tts_ws.flush()
            async for msg in tts_ws:
                if isinstance(msg, AudioOutput):
                    yield base64.b64decode(msg.data.audio)
                elif isinstance(msg, EventResponse):
                    if getattr(msg.data, "event_type", None) == "final":
                        break
