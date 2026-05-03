import asyncio

async def word_ticker(_input_text: str):
    """
    Mock function to simulate a language model generating words one at a time with a delay. In a real implementation, this would interface with an actual language model API that supports streaming responses.
    """
    words: list[str] = ["Hello", "world!"] + _input_text.split(" ")
    interval: float = 0.2
    
    for word in words:
        yield word
        await asyncio.sleep(interval)