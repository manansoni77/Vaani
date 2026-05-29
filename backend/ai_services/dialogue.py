from typing import cast
from .llm import LLMClient
from constants import PHASE
from .schemas import CaptureAndValidationResponse, SemanticMemory
from .prompts import PROMPTS
from loggers import get_logger, LOG_ENTITIES

llm_client = LLMClient()

# Score thresholds — 0-0.33 red, 0.33-0.66 yellow, 0.66-1.0 green
_RED_MAX = 0.33


def _is_red(score: float | None) -> bool:
    return score is None or score < _RED_MAX


def _not_red(score: float | None) -> bool:
    return score is not None and score >= _RED_MAX


class DialogueFlow:
    max_turns = 3

    def __init__(self, session_id: str):
        self.phase = PHASE.GREETING
        self.semantic_memory = SemanticMemory()
        self.turns = 0
        self.first_validate = True  # Flag to track if we're on the first validation turn
        self.system_score: float | None = None
        self.user_score: float | None = None
        self.log = get_logger(LOG_ENTITIES.DIALOGUE_FLOW, session_id=session_id)
        self.llm_log = get_logger(LOG_ENTITIES.OPENAI_LLM, session_id=session_id)

    def save_state(self) -> dict:
        return {
            "phase": self.phase,
            "turns": self.turns,
            "semantic_memory": SemanticMemory(**self.semantic_memory.model_dump()),
            "system_score": self.system_score,
            "user_score": self.user_score,
        }

    def restore_state(self, state: dict) -> None:
        self.phase = state["phase"]
        self.turns = state["turns"]
        self.semantic_memory = state["semantic_memory"]
        self.system_score = state["system_score"]
        self.user_score = state["user_score"]

    async def stream_greeting(self):
        """
        Called by session.py on session start — no user input needed.
        Yields the same fixed greeting for every caller (zero LLM cost).
        Transitions phase GREETING → CAPTURE so the first user message
        lands directly in CAPTURE with no extra routing.
        """
        self.log.info("phase=GREETING generating greeting")
        self.phase = PHASE.CAPTURE
        yield "Hello! Thank you for calling Vaani. How can I assist you today?"

    async def get_response(self, input_text):
        if self.phase == PHASE.COMPLETE:
            self.log.info("get_response called in COMPLETE phase — ignoring")

            if _not_red(self.user_score):
                response = {
                    "hi-IN": "धन्यवाद पुष्टि करने के लिए। आपकी क्वेरी नोट कर ली गई है, हम इसे देखेंगे।",
                    "en-IN": "Thank you for confirming. Your query has been noted, we will look into it.",
                    "kn-IN": "ದೃಢೀಕರಿಸಿದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಗಮನಿಸಲಾಗಿದೆ, ನಾವು ಅದನ್ನು ನೋಡುತ್ತೇವೆ.",
                }
                yield response.get(self.semantic_memory.user_language, response["en-IN"])
            elif _is_red(self.user_score):
                response = {
                    "hi-IN": "मुझे खेद है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                    "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                    "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                }
                yield response.get(self.semantic_memory.user_language, response["en-IN"])

        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            self.log.info(
                "get_response called in GREETING phase — use stream_greeting(); falling back"
            )
            async for chunk in self.stream_greeting():
                yield chunk
            return

        elif self.phase == PHASE.CAPTURE:
            self.log.info(
                f"phase=CAPTURE turn={self.turns + 1} input={input_text!r} lang={self.semantic_memory.user_language!r}"
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
            self.system_score = response.system_score
            locked_language = self.semantic_memory.user_language
            self.semantic_memory = SemanticMemory(
                summary=response.summary,
                intent=response.intent,
                key_details=response.key_details,
                contradictions=response.contradictions,
                sentiment=response.sentiment,
                urgency_score=response.urgency_score,
                human_requested=response.human_requested,
                user_language=locked_language,
                query_type=response.query_type,
                service_type=response.service_type,
                location=response.location,
                since_when=response.since_when,
            )
            self.log.info(
                f"semantic_memory rebuilt — lang={locked_language!r} turns={self.turns} "
                f"system_score={self.system_score:.2f} urgency_score={self.semantic_memory.urgency_score:.2f}"
            )

            if self.turns >= self.max_turns or not response.follow_up:
                if _not_red(response.system_score):
                    yield response.response
                    self.phase = PHASE.VALIDATION
                    self.log.info("phase transitioning to VALIDATION based on follow_up=false")
                elif _is_red(response.system_score):
                    escalate = {
                        "hi-IN": "मुझे खेद है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                        "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                        "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                    }
                    yield escalate.get(locked_language, escalate["en-IN"])
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

            self.system_score = response.system_score
            self.user_score = response.user_score
            self.log.info(
                f"VALIDATION scores — system={self.system_score:.2f} user={self.user_score:.2f}"
            )

            if self.first_validate:
                self.first_validate = False
                yield response.response
            else:
                if not response.reiterate:
                    self.phase = PHASE.COMPLETE
                    self.log.info("User confirmed - phase transitioning to COMPLETE")

                    if _not_red(response.user_score):
                        confirmed = {
                            "hi-IN": "धन्यवाद पुष्टि करने के लिए। आपकी क्वेरी नोट कर ली गई है, हम इसे देखेंगे।",
                            "en-IN": "Thank you for confirming. Your query has been noted, we will look into it.",
                            "kn-IN": "ದೃಢೀಕರಿಸಿದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಗಮನಿಸಲಾಗಿದೆ, ನಾವು ಅದನ್ನು ನೋಡುತ್ತೇವೆ.",
                        }
                        yield confirmed.get(self.semantic_memory.user_language, confirmed["en-IN"])
                    elif _is_red(response.user_score):
                        escalate = {
                            "hi-IN": "मुझे खेद है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                            "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                            "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                        }
                        yield escalate.get(self.semantic_memory.user_language, escalate["en-IN"])
                else:
                    self.log.info("User denied or unclear - staying in VALIDATION for follow-up")
                    yield response.response
