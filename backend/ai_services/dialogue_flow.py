from typing import cast
from ai_services.llm_client import LLMClient
from constants import (
    CONFIDENCE_LEVEL,
    PHASE,
    CaptureAndValidationResponse,
    SemanticMemory,
    LOG_ENTITIES,
)
from ai_services.prompts import PROMPTS
from loggers import get_logger

llm_client = LLMClient()


class DialogueFlow:
    max_turns = 3

    def __init__(self, session_id: str):
        self.phase = PHASE.GREETING
        self.semantic_memory = SemanticMemory()
        self.turns = 0
        self.first_validate = (
            True  # Flag to track if we're on the first validation turn
        )
        self.agent_confidence: CONFIDENCE_LEVEL | None = None
        self.user_confidence: CONFIDENCE_LEVEL | None = None
        self.log = get_logger(LOG_ENTITIES.DIALOGUE_FLOW, session_id=session_id)
        self.llm_log = get_logger(LOG_ENTITIES.OPENAI_LLM, session_id=session_id)

    def save_state(self) -> dict:
        return {
            "phase": self.phase,
            "turns": self.turns,
            "semantic_memory": SemanticMemory(**self.semantic_memory.model_dump()),
            "agent_confidence": self.agent_confidence,
            "user_confidence": self.user_confidence,
        }

    def restore_state(self, state: dict) -> None:
        self.phase = state["phase"]
        self.turns = state["turns"]
        self.semantic_memory = state["semantic_memory"]
        self.agent_confidence = state["agent_confidence"]
        self.user_confidence = state["user_confidence"]

    async def stream_greeting(self):
        """
        Called by session.py on session start — no user input needed.
        Yields the same fixed greeting for every caller (zero LLM cost).
        Transitions phase GREETING → CAPTURE so the first user message
        lands directly in CAPTURE with no extra routing.
        """
        self.log.info("phase=GREETING generating greeting")
        self.phase = PHASE.CAPTURE
        # transition immediately so we don't have to route the first user message specially
        yield "Hello! Thank you for calling Vaani. How can I assist you today?"

    async def get_response(self, input_text):
        if self.phase == PHASE.COMPLETE:
            self.log.info("get_response called in COMPLETE phase — ignoring")

            if self.user_confidence in [
                CONFIDENCE_LEVEL.GREEN,
                CONFIDENCE_LEVEL.YELLOW,
            ]:
                response = {
                    "hi-IN": "धन्यवाद पुष्टि करने के लिए। आपकी क्वेरी नोट कर ली गई है, हम इसे देखेंगे।",
                    "en-IN": "Thank you for confirming. Your query has been noted, we will look into it.",
                    "kn-IN": "ದೃಢೀಕರಿಸಿದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಗಮನಿಸಲಾಗಿದೆ, ನಾವು ಅದನ್ನು ನೋಡುತ್ತೇವೆ.",
                }
                if self.semantic_memory.user_language in response:
                    yield response[self.semantic_memory.user_language]
                else:
                    yield response[
                        "en-IN"
                    ]  # default to english if language not in response mapping
            elif self.user_confidence == CONFIDENCE_LEVEL.RED:
                response = {
                    "hi-IN": "मुझे bbbbbbbbb है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                    "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                    "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                }
                if self.semantic_memory.user_language in response:
                    yield response[self.semantic_memory.user_language]
                else:
                    yield response[
                        "en-IN"
                    ]  # default to english if language not in response mapping

        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            # Safety fallback
            self.log.info(
                "get_response called in GREETING phase — use stream_greeting(); falling back"
            )
            # prompt = prompt_fn()
            # response = llm_client.stream_completion(system_prompt=prompt[0], user_prompt=prompt[1])
            async for chunk in self.stream_greeting():
                yield chunk
            return

        elif self.phase == PHASE.CAPTURE:
            self.log.info(
                f"phase=CAPTURE turn={self.turns + 1} input={input_text!r} lang={self.semantic_memory.user_language!r}    "
            )
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(
                CaptureAndValidationResponse,
                await llm_client.get_json_response(
                    system_prompt=prompt[0],
                    user_prompt=prompt[1],
                    response_format=CaptureAndValidationResponse,
                    log=self.llm_log,
                ),
            )

            self.turns += 1
            self.agent_confidence = response.agent_confidence
            # Preserve language through the rebuild — language is locked by session.py
            # before this runs, and must survive SemanticMemory reconstruction every turn.

            locked_language = self.semantic_memory.user_language
            self.semantic_memory = SemanticMemory(
                summary=response.summary,
                intent=response.intent,
                key_details=response.key_details,
                contradictions=response.contradictions,
                sentiment=response.sentiment,
                urgency_level=response.urgency_level,
                human_requested=response.human_requested,
                user_language=locked_language,  # preserved, not overwritten by LLM
                query_type=response.query_type,
                service_type=response.service_type,
                location=response.location,
                since_when=response.since_when,
            )
            self.agent_confidence = response.agent_confidence
            # log 1
            self.log.info(
                f"semantic_memory rebuilt — lang={locked_language!r} turns={self.turns}"
            )
            # if self.semantic_memory.query_type == QUERY_TYPE.EMERGENCY:
            #     self.max_turns = min(self.max_turns, 2)  # one-way ratchet — never resets back up
            if self.turns >= self.max_turns or response.follow_up == False:
                if response.agent_confidence in [
                    CONFIDENCE_LEVEL.GREEN,
                    CONFIDENCE_LEVEL.YELLOW,
                ]:
                    yield response.response

                    self.phase = PHASE.VALIDATION
                    # Tranistioning to validation phase tried to handle that through Prompt
                    self.log.info(
                        "phase transitioning to VALIDATION based on follow_up=false"
                    )
                elif response.agent_confidence == CONFIDENCE_LEVEL.RED:
                    respose = {
                        "hi-IN": "मुझे aaaaaaa है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                        "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                        "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                    }
                    if locked_language in respose:
                        yield respose[locked_language]
                    else:
                        yield respose[
                            "en-IN"
                        ]  # default to english if language not in response mapping
            else:
                yield response.response
        elif self.phase == PHASE.VALIDATION:
            self.log.info(
                f"phase=VALIDATION input={input_text!r} lang={self.semantic_memory.user_language!r}"
            )
            prompt = prompt_fn(input_text, self.semantic_memory)
            response = cast(
                CaptureAndValidationResponse,
                await llm_client.get_json_response(
                    system_prompt=prompt[0],
                    user_prompt=prompt[1],
                    response_format=CaptureAndValidationResponse,
                    log=self.llm_log,
                ),
            )

            self.agent_confidence = response.agent_confidence
            self.user_confidence = response.user_confidence

            print("------------------------------------")
            print(response.model_dump())
            print("------------------------------------")

            # Adding a follow up loop in Validation phase
            if self.first_validate:
                self.first_validate = False
                yield response.response
            else:
                if not response.reiterate:
                    self.phase = PHASE.COMPLETE
                    self.log.info("User confirmed - phase transitioning to COMPLETE")

                    if response.user_confidence in [
                        CONFIDENCE_LEVEL.GREEN,
                        CONFIDENCE_LEVEL.YELLOW,
                    ]:
                        response = {
                            "hi-IN": "धन्यवाद पुष्टि करने के लिए। आपकी क्वेरी नोट कर ली गई है, हम इसे देखेंगे।",
                            "en-IN": "Thank you for confirming. Your query has been noted, we will look into it.",
                            "kn-IN": "ದೃಢೀಕರಿಸಿದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಗಮನಿಸಲಾಗಿದೆ, ನಾವು ಅದನ್ನು ನೋಡುತ್ತೇವೆ.",
                        }
                        if self.semantic_memory.user_language in response:
                            yield response[self.semantic_memory.user_language]
                        else:
                            yield response[
                                "en-IN"
                            ]  # default to english if language not in response mapping
                    elif response.user_confidence == CONFIDENCE_LEVEL.RED:
                        response = {
                            "hi-IN": "मुझे bbbbbbbbb है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                            "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                            "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                        }
                        if self.semantic_memory.user_language in response:
                            yield response[self.semantic_memory.user_language]
                        else:
                            yield response[
                                "en-IN"
                            ]  # default to english if language not in response mapping
                else:
                    # User denied or was unclear - stay in VALIDATION and ask again
                    self.log.info(
                        "User denied or unclear - staying in VALIDATION for follow-up"
                    )
                    yield response.response
