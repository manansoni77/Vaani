import asyncio
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator, Awaitable, Callable


class BaseSTTClient(ABC):
    @abstractmethod
    async def stream(
        self,
        audio_queue: asyncio.Queue,
        on_transcript: Callable[[str, str], Awaitable[None]],
    ) -> None:
        """Run a full streaming STT session.

        Reads raw PCM bytes from audio_queue until a None sentinel arrives,
        calling on_transcript(text, lang_code) for each recognised chunk.
        """


class BaseTTSClient(ABC):
    @abstractmethod
    def synthesize(self, text: str, language: str) -> AsyncGenerator[bytes, None]:
        """Yield raw PCM audio chunks (16-bit LE, 16 kHz).

        Caller may break out of the async-for early to interrupt synthesis.
        """
