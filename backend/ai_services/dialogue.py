from typing import cast
from .llm import LLMClient
from constants import PHASE, QUERY_TYPE, SERVICE_TYPE
from .schemas import CaptureAndValidationResponse, EnquiryResolutionResponse, RedirectResponse, SemanticMemory
from .prompts import PROMPTS, enquiry_resolution_prompt, redirect_clarification_prompt
from .knowledge_base import fetch_kb_results
from .departments import match_department, match_redirect_department, format_department_contact
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
        self._redirect_dept_name: str | None = None
        self.log = get_logger(LOG_ENTITIES.DIALOGUE_FLOW, session_id=session_id)
        self.llm_log = get_logger(LOG_ENTITIES.OPENAI_LLM, session_id=session_id)

    def save_state(self) -> dict:
        return {
            "phase": self.phase,
            "turns": self.turns,
            "semantic_memory": SemanticMemory(**self.semantic_memory.model_dump()),
            "system_score": self.system_score,
            "user_score": self.user_score,
            "_redirect_dept_name": self._redirect_dept_name,
        }

    def restore_state(self, state: dict) -> None:
        self.phase = state["phase"]
        self.turns = state["turns"]
        self.semantic_memory = state["semantic_memory"]
        self.system_score = state["system_score"]
        self.user_score = state["user_score"]
        self._redirect_dept_name = state.get("_redirect_dept_name")

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

    async def get_response(self, input_text, history: list[dict] | None = None):
        if self.phase == PHASE.COMPLETE:
            self.log.info("get_response called in COMPLETE phase — ignoring")

            if _not_red(self.user_score):
                qt = self.semantic_memory.query_type
                if qt == QUERY_TYPE.ENQUIRY:
                    response = {
                        "hi-IN": "उम्मीद है यह जानकारी आपके काम आई। धन्यवाद।",
                        "en-IN": "Hope that information was helpful. Thank you for calling.",
                        "kn-IN": "ಆ ಮಾಹಿತಿ ಉಪಯುಕ್ತವಾಯಿತು ಎಂದು ಆಶಿಸುತ್ತೇನೆ. ಧನ್ಯವಾದ.",
                    }
                    yield response.get(self.semantic_memory.user_language, response["en-IN"])
                else:
                    response = {
                        "hi-IN": "आपकी शिकायत दर्ज कर ली गई है। धन्यवाद।",
                        "en-IN": "Your issue has been recorded. Thank you for calling.",
                        "kn-IN": "ನಿಮ್ಮ ಸಮಸ್ಯೆ ದಾಖಲಾಗಿದೆ. ಧನ್ಯವಾದ.",
                    }
                    yield response.get(self.semantic_memory.user_language, response["en-IN"])
            elif _is_red(self.user_score):
                response = {
                    "hi-IN": "मुझे खेद है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                    "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                    "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                }
                yield response.get(self.semantic_memory.user_language, response["en-IN"])
            return

        if self.phase == PHASE.REDIRECT:
            self.log.info(
                f"phase=REDIRECT dept={self._redirect_dept_name!r} input={input_text!r}"
            )
            prompt = redirect_clarification_prompt(
                input_text, self._redirect_dept_name or "", self.semantic_memory
            )
            response = cast(
                RedirectResponse,
                await llm_client.get_json_response(
                    system_prompt=prompt[0],
                    user_prompt=prompt[1],
                    response_format=RedirectResponse,
                    log=self.llm_log,
                ),
            )
            if response.user_done:
                self.phase = PHASE.COMPLETE
                self.log.info("REDIRECT: user is done — transitioning to COMPLETE")
                yield response.response
            else:
                # User clarified their query is different — reset to CAPTURE
                locked_language = self.semantic_memory.user_language
                self.semantic_memory = SemanticMemory(user_language=locked_language)
                self.turns = 0
                self.first_validate = True
                self._redirect_dept_name = None
                self.phase = PHASE.CAPTURE
                self.log.info("REDIRECT: user has a different query — resetting to CAPTURE")
                yield response.response
            return

        prompt_fn = PROMPTS[self.phase]

        if self.phase == PHASE.GREETING:
            # Safety fallback
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
            kb_results = await fetch_kb_results(input_text)
            prompt = prompt_fn(input_text, self.semantic_memory, kb_results=kb_results, history=history)
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
            # Preserve language through the rebuild — language is locked by session.py
            # before this runs, and must survive SemanticMemory reconstruction every turn.
            locked_language = self.semantic_memory.user_language
            self.semantic_memory = SemanticMemory(
                summary=response.summary,
                intent=response.intent,
                key_details=response.key_details,
                contradictions=response.contradictions,
                sentiment=response.sentiment,
                urgency_score=response.urgency_score,
                human_requested=response.human_requested,
                user_language=locked_language,  # preserved, not overwritten by LLM
                query_type=response.query_type,
                service_type=response.service_type,
                location=response.location,
                since_when=response.since_when,
            )
            self.log.info(
                f"semantic_memory rebuilt — lang={locked_language!r} turns={self.turns} "
                f"system_score={self.system_score:.2f} urgency_score={self.semantic_memory.urgency_score:.2f}"
            )

            # Check for redirect departments before any follow-up / validation logic
            mem = self.semantic_memory
            parts = [p for p in [mem.intent, mem.summary, mem.key_details] if p]
            combined_query = " | ".join(parts)
            redirect_dept = match_redirect_department(combined_query) if combined_query else None
            if redirect_dept:
                self._redirect_dept_name = redirect_dept.name
                self.phase = PHASE.REDIRECT
                contact_info = format_department_contact(redirect_dept, locked_language)
                self.log.info(f"CAPTURE matched redirect dept={redirect_dept.name!r} — transitioning to REDIRECT")
                yield f"It looks like your query is related to {redirect_dept.name}, which is handled by a separate department. {contact_info} I'll stay on the line — please let me know if you have a different query or if this helps."
                return

            if self.turns >= self.max_turns or not response.follow_up:
                if _not_red(response.system_score):
                    # Skip the CAPTURE statement — run VALIDATION inline so the user
                    # gets a confirmation question immediately with no silent gap.
                    self.phase = PHASE.VALIDATION
                    self.log.info("follow_up=false — transitioning to VALIDATION and asking confirmation inline")
                    async for chunk in self._start_validation(input_text, history):
                        yield chunk
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
            kb_results = await fetch_kb_results(self.semantic_memory.summary or input_text)
            prompt = prompt_fn(input_text, self.semantic_memory, kb_results=kb_results, history=history)
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

            # Adding a follow up loop in Validation phase
            if self.first_validate:
                self.first_validate = False
                yield response.response
            else:
                if not response.reiterate:
                    if _not_red(response.user_score):
                        self.phase = PHASE.RESOLUTION
                        self.log.info("User confirmed — phase transitioning to RESOLUTION")
                        async for chunk in self._handle_resolution(history=history):
                            yield chunk
                    elif _is_red(response.user_score):
                        self.phase = PHASE.COMPLETE
                        escalate = {
                            "hi-IN": "मुझे खेद है, मैं आपकी समस्या को समझ नहीं पा रहा हूँ। कृपया मुझे एक पल दें, मैं आपको एक मानव एजेंट से जोड़ता हूँ।",
                            "en-IN": "Apologies, I'm having trouble understanding your issue. Please hold on, I'm connecting you to a human agent for better assistance.",
                            "kn-IN": "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕಷ್ಟಪಡುತ್ತಿದ್ದೇನೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ, ನಾನು ನಿಮಗೆ ಉತ್ತಮ ಸಹಾಯಕ್ಕಾಗಿ ಮಾನವ ಏಜೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.",
                        }
                        yield escalate.get(self.semantic_memory.user_language, escalate["en-IN"])
                else:
                    # User denied, corrected a detail, or introduced a new topic — stay in VALIDATION
                    self.log.info("User denied/corrected/changed topic — staying in VALIDATION for follow-up")
                    yield response.response

    async def _start_validation(self, input_text: str, history: list[dict] | None = None):
        """
        Called inline when CAPTURE finishes (follow_up=false, system_score not red).
        Runs the VALIDATION prompt immediately so the user gets the confirmation
        question in the same turn, instead of a closing statement followed by a
        silent gap until they speak again. Sets first_validate=False so the next
        user reply goes straight to the reiterate/confirm check.
        """
        validation_prompt_fn = PROMPTS[PHASE.VALIDATION]
        kb_results = await fetch_kb_results(self.semantic_memory.summary or input_text)
        prompt = validation_prompt_fn(
            input_text, self.semantic_memory, kb_results=kb_results, history=history
        )
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
        self.first_validate = False
        self.log.info(
            f"inline VALIDATION ask — system={self.system_score:.2f} user={self.user_score:.2f}"
        )
        yield response.response

    async def _handle_resolution(self, history: list[dict] | None = None):
        """
        Runs immediately after the user confirms in VALIDATION.
        Branches on query_type: ENQUIRY gets a KB-synthesized answer,
        GRIEVANCE/OTHERS get a verbal acknowledgement.
        Transitions to COMPLETE when done.
        """
        qt = self.semantic_memory.query_type
        self.log.info(f"phase=RESOLUTION query_type={qt}")

        lang = self.semantic_memory.user_language
        mem = self.semantic_memory
        parts = [p for p in [mem.intent, mem.summary, mem.key_details] if p]
        dept_query = " | ".join(parts) if parts else ""
        matched_dept = match_department(dept_query) if dept_query else None

        if qt == QUERY_TYPE.ENQUIRY:
            yield await self._resolve_enquiry(history=history)
            if matched_dept:
                yield format_department_contact(matched_dept, lang)
            outro = {
                "hi-IN": "मुझे उम्मीद है यह जानकारी आपके काम आई। वाणी से संपर्क करने के लिए धन्यवाद।",
                "en-IN": "I hope this information was helpful. Thank you for reaching out to Vaani.",
                "kn-IN": "ಈ ಮಾಹಿತಿ ಉಪಯುಕ್ತವಾಯಿತು ಎಂದು ಆಶಿಸುತ್ತೇನೆ. ವಾಣಿಯನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ.",
            }
            yield outro.get(lang, outro["en-IN"])
        else:
            yield self._resolve_grievance_ack()
            if matched_dept:
                yield format_department_contact(matched_dept, lang)
            outro = {
                "hi-IN": "वाणी से संपर्क करने के लिए धन्यवाद। हम जल्द ही आपसे संपर्क करेंगे।",
                "en-IN": "Thank you for reaching out to Vaani. We will get back to you shortly.",
                "kn-IN": "ವಾಣಿಯನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ನಾವು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.",
            }
            yield outro.get(lang, outro["en-IN"])

        self.phase = PHASE.COMPLETE
        self.log.info("RESOLUTION complete — phase transitioning to COMPLETE")

    async def _resolve_enquiry(self, history: list[dict] | None = None) -> str:
        mem = self.semantic_memory
        parts = [p for p in [mem.intent, mem.summary, mem.key_details] if p]
        query = " | ".join(parts) if parts else "general enquiry"
        self.log.info(f"RESOLUTION/ENQUIRY fetching KB for query={query!r}")

        kb_results = await fetch_kb_results(query)
        self.log.info(f"KB returned {len(kb_results)} result(s)")

        prompt = enquiry_resolution_prompt(query, kb_results, self.semantic_memory, history or [])
        resolution = cast(
            EnquiryResolutionResponse,
            await llm_client.get_json_response(
                system_prompt=prompt[0],
                user_prompt=prompt[1],
                response_format=EnquiryResolutionResponse,
                log=self.llm_log,
            ),
        )

        self.log.info(f"RESOLUTION/ENQUIRY answered={resolution.answered}")
        return resolution.response

    def _resolve_grievance_ack(self) -> str:
        ack = {
            "hi-IN": "आपकी शिकायत दर्ज कर ली गई है। हमारी टीम जल्द ही इस पर कार्रवाई करेगी।",
            "en-IN": "Your grievance has been recorded. Our team will look into it shortly.",
            "kn-IN": "ನಿಮ್ಮ ದೂರನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ. ನಮ್ಮ ತಂಡ ಶೀಘ್ರದಲ್ಲೇ ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.",
        }
        return ack.get(self.semantic_memory.user_language, ack["en-IN"])
