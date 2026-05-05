from typing import cast
from llm import LLMClient
from constants import CONFIDENCE_LEVEL, PHASE, CaptureAndValidationResponse, DecisionResponse, SemanticMemory, LOG_ENTITIES
from prompts import PROMPTS
from logger import get_logger

llm_client = LLMClient()


class DialogueFlow:
    max_turns = 3

    def __init__(self, session_id: str):
        self.phase = PHASE.GREETING
        self.semantic_memory = SemanticMemory()
        self.turns = 0
        self.log = get_logger(LOG_ENTITIES.DIALOGUE_FLOW, session_id=session_id)

    async def get_response(self, input_text):
        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            self.log.info("phase=GREETING generating greeting")
            prompt = prompt_fn()
            response = llm_client.stream_completion(system_prompt=prompt[0], user_prompt=prompt[1])

            self.phase = PHASE.CAPTURE

            async for chunk in response:
                yield chunk
        elif self.phase == PHASE.CAPTURE:
            self.log.info(f"phase=CAPTURE turn={self.turns + 1} input={input_text!r}")
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(CaptureAndValidationResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=CaptureAndValidationResponse,
            ))

            self.turns += 1
            self.semantic_memory = SemanticMemory(
                summary=response.summary,
                intent=response.intent,
                key_details=response.key_details,
                contradictions=response.contradictions,
                sentiment=response.sentiment,
                urgency_level=response.urgency_level,
                human_requested=response.human_requested,
            )
            if self.turns >= self.max_turns or response.follow_up == False:
                if response.agent_confidence in [CONFIDENCE_LEVEL.GREEN, CONFIDENCE_LEVEL.YELLOW]:
                    yield response.response

                    self.phase = PHASE.DECISION
                    self.log.info("phase transitioning to DECISION based on follow_up=false")
                elif response.agent_confidence == CONFIDENCE_LEVEL.RED:
                    yield "It seems I am not able to understand your query, let me connect you to a human agent for better assistance."
            else:
                yield response.response
        elif self.phase == PHASE.VALIDATION:
            self.log.info(f"phase=VALIDATION input={input_text!r}")
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(CaptureAndValidationResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=CaptureAndValidationResponse,
            ))

            self.phase = PHASE.DECISION
            self.log.info("phase transitioning to DECISION")

            yield response.response
        elif self.phase == PHASE.DECISION:
            self.log.info(f"phase=DECISION input={input_text!r}")
            prompt = prompt_fn(input_text)
            response = cast(DecisionResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=DecisionResponse,
            ))

            self.phase = PHASE.COMPLETE
            self.log.info(f"phase=COMPLETE user_confidence={response.user_confidence}")

            if response.user_confidence in [CONFIDENCE_LEVEL.GREEN, CONFIDENCE_LEVEL.YELLOW]:
                yield "Thankyou for confirming. Your query has been noted, we will look into it."
            elif response.user_confidence == CONFIDENCE_LEVEL.RED:
                yield "Apologies, let me connect you to a human agent for assistance."
        else:
            raise ValueError(f"Unhandled phase: {self.phase}")
