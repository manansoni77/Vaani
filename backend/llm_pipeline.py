from llm import LLMClient

llm_client = LLMClient()

async def mock_dialogue_flow(input_text):
    print(f'mock fired on input - {input_text} - ')
    response = llm_client.stream_completion(input_text, system_message="You are a helpful assistant named Vaani.")

    return response
