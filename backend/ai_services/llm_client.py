import os
from openai import AsyncOpenAI
from loggers import get_logger
from constants import LOG_ENTITIES

# Fallback logger used when no per-session logger is supplied by the caller.
_default_log = get_logger(LOG_ENTITIES.OPENAI_LLM)


class LLMClient:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_KEY"))

    async def stream_completion(
        self, user_prompt, system_prompt, temperature=0.3, log=None
    ):
        log = log or _default_log
        log.info(
            f"stream_completion called"
            f"\n  system({len(system_prompt)} chars): {system_prompt[:300]!r}{'...' if len(system_prompt) > 300 else ''}"
            f"\n  user({len(user_prompt)} chars): {user_prompt[:300]!r}{'...' if len(user_prompt) > 300 else ''}"
            f"\n  temperature={temperature}"
        )
        stream = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            stream=True,
        )

        chunks: list[str] = []
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                chunks.append(token)
                yield token

        log.info(f"stream_completion finished  response={(''.join(chunks))!r}")

    async def get_json_response(
        self, system_prompt, user_prompt, response_format=None, log=None
    ):
        log = log or _default_log
        log.info(
            f"get_json_response called  format={response_format.__name__ if response_format else None}"
            f"\n  system({len(system_prompt)} chars): {system_prompt[:300]!r}{'...' if len(system_prompt) > 300 else ''}"
            f"\n  user({len(user_prompt)} chars): {user_prompt[:300]!r}{'...' if len(user_prompt) > 300 else ''}"
        )
        response = await self.client.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format=response_format,  # type: ignore
        )

        parsed = response.choices[0].message.parsed
        if parsed is None:
            log.error("get_json_response: null parsed response from LLM")
            raise Exception("Empty response from LLM")

        log.info(f"get_json_response result={parsed!r}")
        return parsed
