import json
import os
from openai import AsyncOpenAI

class LLMClient:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_KEY"))

    #Stream completion for real-time response generation! We are on the right track 
    async def stream_completion(self, prompt, system_message, temperature=0.3):

        stream = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            stream=True
        )

        buffer = ""

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                buffer += chunk.choices[0].delta.content

                # Flush on sentence end
                if any(p in buffer for p in [".", "?", "!"]):
                    yield buffer.strip()
                    buffer = ""

        if buffer.strip():
            yield buffer.strip()

    # For structured data extraction, Passing JSON
    async def get_json_response(self, prompt):

        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )

        content = response.choices[0].message.content

        if not content:
            return {
                "summary": "",
                "key_details": {},
                "intent": "",
                "missing_info": [],
                "urgency_hint": 0.0,
                "contradicts": False,
                "human_requested": False
            }

        try:
            return json.loads(content)
        except Exception:
            return {
                "summary": "",
                "key_details": {},
                "intent": "",
                "missing_info": [],
                "urgency_hint": 0.0,
                "contradicts": False,
                "human_requested": False
            }
