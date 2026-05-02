import asyncio
from typing import AsyncGenerator, Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime


# =============================================================================
# SEMANTIC MEMORY
# =============================================================================

@dataclass
class SemanticMemory:
    summary: str = ""
    key_details: Dict[str, Any] = field(default_factory=dict)
    intent: str = ""

    missing_info: list = field(default_factory=list)
    urgency_hint: float = 0.0
    has_contradictions: bool = False

    human_requested: bool = False

    def update(self, extracted: Dict):
        if not extracted:
            return

        if extracted.get("summary"):
            self.summary = extracted["summary"]

        if extracted.get("key_details"):
            self.key_details.update(extracted["key_details"])

        if extracted.get("intent"):
            self.intent = extracted["intent"]

        if extracted.get("missing_info") is not None:
            self.missing_info = extracted.get("missing_info", [])

        if extracted.get("urgency_hint") is not None:
            self.urgency_hint = max(self.urgency_hint, extracted.get("urgency_hint", 0.0))

        if extracted.get("contradicts"):
            self.has_contradictions = True

        if extracted.get("human_requested"):
            self.human_requested = True


# =============================================================================
# STATE
# =============================================================================

@dataclass
class ConversationState:
    call_id: str
    user_context: Dict = field(default_factory=dict)

    phase: str = "greeting"
    turn_count: int = 0

    memory: SemanticMemory = field(default_factory=SemanticMemory)

    confidence: float = 0.0
    confidence_level: str = "red"

    llm_is_speaking: bool = False
    user_confirmed: bool = False
    validation_done: bool = False

    messages: list = field(default_factory=list)

    def add_turn(self, role: str, content: str):
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })


# =============================================================================
# PIPELINE
# =============================================================================

class VoiceIntelligencePipeline:

    def __init__(self, llm, logger=None):
        self.llm = llm
        self.logger = logger

    def _log(self, msg: str):
        if self.logger:
            self.logger.info(msg)
        print(f"[Pipeline] {msg}")

    # =========================================================================
    # MAIN
    # =========================================================================

    async def process(self, user_input: str, state: ConversationState) -> AsyncGenerator[str, None]:

        if state.llm_is_speaking:
            return

        state.llm_is_speaking = True
        state.turn_count += 1

        try:
            # ---------- FIRST TURN ----------
            if state.turn_count == 1:

                extracted = await self._smart_extract(user_input, state)
                state.memory.update(extracted)
                state.add_turn("user", user_input)

                response = await self._gen_greeting_with_context(state, extracted)

                async for chunk in self._stream_text(response):
                    yield chunk

                state.phase = "collecting"
                state.llm_is_speaking = False
                return

            # ---------- NORMAL FLOW ----------
            state.add_turn("user", user_input)

            extracted = await self._smart_extract(user_input, state)
            state.memory.update(extracted)

            # ---------- VALIDATION RESPONSE ----------
            if state.validation_done:

                if self._is_confirmation(user_input):
                    state.user_confirmed = True

                await self._compute_final_confidence(state)

                final = self._gen_final_response(state)

                yield final

                state.phase = "complete"
                state.llm_is_speaking = False
                return

            # ---------- TRIGGER VALIDATION ----------
            if self._should_validate(state):

                state.confidence = self._compute_confidence_1(state)

                validation = self._gen_validation(state.memory)

                yield validation

                state.validation_done = True
                state.phase = "validating"
                state.llm_is_speaking = False
                return

            # ---------- FOLLOWUP ----------
            if extracted.get("contradicts"):
                response = await self._gen_clarification(state)
            else:
                response = await self._gen_followup(state)

            async for chunk in self._stream_text(response):
                yield chunk

            state.llm_is_speaking = False

        except Exception as e:
            self._log(f"Error: {e}")
            state.llm_is_speaking = False
            raise

    # =========================================================================
    # EXTRACTION
    # =========================================================================

    async def _smart_extract(self, user_input: str, state: ConversationState) -> Dict:

        context = state.memory.summary or "No prior context"

        prompt = f"""
Extract structured info from user input.

Context: {context}

User: "{user_input}"

Return JSON:
{{
  "summary": "...",
  "key_details": {{}},
  "intent": "...",
  "missing_info": [],
  "urgency_hint": 0.0,
  "contradicts": false,
  "human_requested": false
}}
"""

        return await self.llm.get_json_response(prompt)

    # =========================================================================
    # LOGIC
    # =========================================================================

    def _should_validate(self, state: ConversationState) -> bool:

        if state.turn_count >= 3:
            return True

        has_summary = bool(state.memory.summary)
        has_details = bool(state.memory.key_details)

        return has_summary and has_details and not state.memory.missing_info

    def _is_confirmation(self, text: str) -> bool:

        text = text.lower()

        if any(x in text for x in ["no", "wrong", "incorrect"]):
            return False

        if any(x in text for x in ["yes", "correct", "right"]):
            return True

        return False

    # =========================================================================
    # CONFIDENCE
    # =========================================================================

    def _compute_confidence_1(self, state: ConversationState) -> float:

        score = 0.0

        if state.memory.summary:
            score += 0.2
        if state.memory.intent:
            score += 0.2

        score += min(0.3, len(state.memory.key_details) * 0.1)

        score -= len(state.memory.missing_info) * 0.05
        score += state.memory.urgency_hint * 0.2

        if state.memory.has_contradictions:
            score -= 0.2

        return max(0.0, min(1.0, score))

    async def _compute_final_confidence(self, state: ConversationState):

        base = self._compute_confidence_1(state)

        if state.user_confirmed:
            final = base + 0.2
        else:
            final = base - 0.4

        state.confidence = max(0.0, min(1.0, final))

        if state.memory.human_requested or state.confidence < 0.4:
            state.confidence_level = "red"
        elif state.confidence < 0.7:
            state.confidence_level = "yellow"
        else:
            state.confidence_level = "green"

    # =========================================================================
    # RESPONSES
    # =========================================================================

    async def _gen_greeting_with_context(self, state, extracted):

        if not extracted.get("summary"):
            return "Hello, please tell me your concern."

        return f"I understand {extracted['summary']}. Can you share more details?"

    def _gen_validation(self, memory: SemanticMemory):

        parts = []

        if memory.summary:
            parts.append(memory.summary)

        if memory.key_details:
            details = ", ".join(f"{k}: {v}" for k, v in memory.key_details.items())
            parts.append(details)

        statement = " ".join(parts) if parts else "your request"

        return f"Let me confirm, {statement}. Is this correct?"

    async def _gen_followup(self, state):

        missing = state.memory.missing_info or ["more details"]

        return f"Can you tell me more about {missing[0]}?"

    async def _gen_clarification(self, state):

        return "I understand. Could you clarify that?"

    def _gen_final_response(self, state):

        if state.confidence_level == "red":
            return "We are connecting you to a human agent."

        if state.confidence_level == "yellow":
            return "We have noted your concern. Our team will review it."

        return "Your request has been recorded. Help is being arranged."

    # =========================================================================
    # STREAMING
    # =========================================================================

    async def _stream_text(self, text: str) -> AsyncGenerator[str, None]:

        sentences = text.split(".")

        for s in sentences:
            s = s.strip()
            if s:
                yield s + "."