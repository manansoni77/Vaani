from llm import LLMClient
from constants import SENTIMENT, PHASE, URGENCY_LEVEL, SemanticMemory
from prompts import PROMPTS

llm_client = LLMClient()


class DialogueFlow:
    def __init__(self):
        self.phase = PHASE.GREETING
        self.semantic_memory = SemanticMemory()

    async def get_response(self, input_text):
        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            prompt = prompt_fn()
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.CAPTURE
        elif self.phase == PHASE.CAPTURE:
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.VALIDATION
        elif self.phase == PHASE.VALIDATION:
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.DECISION
        elif self.phase == PHASE.DECISION:
            prompt = prompt_fn(input_text)
            response = llm_client.stream_completion(input_text, system_message=prompt)

            self.phase = PHASE.COMPLETE
        else:
            raise ValueError(f"Unhandled phase: {self.phase}")

        return response
