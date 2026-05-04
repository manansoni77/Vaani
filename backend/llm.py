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

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    # For structured data extraction, Passing JSON
    async def get_json_response(self, prompt, response_format = None):
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format=response_format # type: ignore
        )

        try:
            content = response.choices[0].message.content

            if not content:
                raise Exception("Empty response from LLM")
            
            return json.loads(content)

        except Exception as e:
            print("OpenAI json mode failed")
            raise e
