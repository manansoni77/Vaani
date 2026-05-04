from typing import cast
from llm import LLMClient
from constants import CONFIDENCE_LEVEL, SENTIMENT, PHASE, URGENCY_LEVEL, CaptureAndValidationResponse, DecisionResponse, SemanticMemory
from prompts import PROMPTS

llm_client = LLMClient()


class DialogueFlow:
    max_turns = 3

    def __init__(self):
        self.phase = PHASE.GREETING
        self.semantic_memory = SemanticMemory()
        self.turns = 0

    async def get_response(self, input_text):
        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            print("Generating greeting...")
            prompt = prompt_fn()
            response = llm_client.stream_completion(system_prompt=prompt[0], user_prompt=prompt[1])

            self.phase = PHASE.CAPTURE

            async for chunk in response:
                yield chunk
        elif self.phase == PHASE.CAPTURE:
            print("Capturing user request...")
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(CaptureAndValidationResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=CaptureAndValidationResponse,
            ))

            self.turns += 1
            if self.turns >= self.max_turns or response.follow_up == False:
                self.phase = PHASE.VALIDATION
            
            yield response.response
        elif self.phase == PHASE.VALIDATION:
            print("Validating captured information...")
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(CaptureAndValidationResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=CaptureAndValidationResponse,
            ))

            self.phase = PHASE.DECISION
            
            yield response.response
        elif self.phase == PHASE.DECISION:
            print("Making decision based on user confirmation...")
            prompt = prompt_fn(input_text)
            response = cast(DecisionResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=DecisionResponse,
            ))

            self.phase = PHASE.COMPLETE

            if response.user_confidence in [CONFIDENCE_LEVEL.GREEN, CONFIDENCE_LEVEL.YELLOW]:
                yield "Thankyou for confirming. Your query has been noted, we will look into it."
            elif response.user_confidence == CONFIDENCE_LEVEL.RED:
                yield "Apologies, let me connect you to a human agent for assistance."
        else:
            raise ValueError(f"Unhandled phase: {self.phase}")
