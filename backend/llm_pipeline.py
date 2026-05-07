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
        self.agent_confidence: CONFIDENCE_LEVEL | None = None
        self.user_confidence: CONFIDENCE_LEVEL | None = None
        self.log = get_logger(LOG_ENTITIES.DIALOGUE_FLOW, session_id=session_id)

    async def get_response(self, input_text):
        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            self.log.info("phase=GREETING generating greeting")
            self.phase = PHASE.CAPTURE
            yield "Hello! Thank you for calling Vaani. How can I assist you today?"
            # prompt = prompt_fn()
            # response = llm_client.stream_completion(system_prompt=prompt[0], user_prompt=prompt[1])
            # async for chunk in response:
            #     yield chunk
        elif self.phase == PHASE.CAPTURE:
            self.log.info(f"phase=CAPTURE turn={self.turns + 1} input={input_text!r}")
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(CaptureAndValidationResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=CaptureAndValidationResponse,
            ))

            self.turns += 1
            prev_lang = self.semantic_memory.user_language
            self.semantic_memory = SemanticMemory(
                summary=response.summary,
                intent=response.intent,
                key_details=response.key_details,
                contradictions=response.contradictions,
                sentiment=response.sentiment,
                urgency_level=response.urgency_level,
                human_requested=response.human_requested,
                user_language=self.semantic_memory.user_language,   # Forgot to carry forward now its preserved fr!!  
            )
            self.agent_confidence = response.agent_confidence
            #log 1 
            self.log.info(f"semantic_memory rebuilt — lang before={prev_lang!r} lang after={self.semantic_memory.user_language!r}")
            if self.turns >= self.max_turns or response.follow_up == False:
                if response.agent_confidence in [CONFIDENCE_LEVEL.GREEN, CONFIDENCE_LEVEL.YELLOW]:
                    yield response.response

                    self.phase = PHASE.VALIDATION 
                    #Tranistioning to validation phase tried to handle that through Prompt 
                    self.log.info("phase transitioning to VALIDATION based on follow_up=false")
                elif response.agent_confidence == CONFIDENCE_LEVEL.RED:
                     yield "It seems I am not able to understand your query, let me connect you to a human agent for better assistance."
            else:
                yield response.response
        elif self.phase == PHASE.VALIDATION:
            self.log.info(f"phase=VALIDATION input={input_text!r} lang={self.semantic_memory.user_language!r}")
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(CaptureAndValidationResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=CaptureAndValidationResponse,
            ))
             
            self.agent_confidence = response.agent_confidence

            #Adding a follow up loop in Validation phase 
            if not response.follow_up:
                self.phase = PHASE.DECISION
                self.log.info("User confirmed - phase transitioning to DECISION")
            else:
                # User denied or was unclear - stay in VALIDATION and ask again
                self.log.info("User denied or unclear - staying in VALIDATION for follow-up")
            yield response.response


        elif self.phase == PHASE.DECISION:
            self.log.info(f"phase=DECISION input={input_text!r} lang={self.semantic_memory.user_language!r}")
            prompt = prompt_fn(input_text, self.semantic_memory) # Added semantic memory to the decision prompt to preserve the user language 
            response = cast(DecisionResponse, await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=DecisionResponse,
            ))

            self.phase = PHASE.COMPLETE
            self.user_confidence = response.user_confidence
            self.log.info(f"phase=COMPLETE user_confidence={response.user_confidence}")

            if response.user_confidence in [CONFIDENCE_LEVEL.GREEN, CONFIDENCE_LEVEL.YELLOW]:
                yield "Thankyou for confirming. Your query has been noted, we will look into it."
            elif response.user_confidence == CONFIDENCE_LEVEL.RED:
                yield "Apologies, let me connect you to a human agent for assistance."
        else:
            raise ValueError(f"Unhandled phase: {self.phase}")
