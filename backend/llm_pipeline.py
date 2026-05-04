"""
1092 Voice Intelligence Pipeline
Phase-controlled conversational engine with LLM-based confidence scoring
"""

import json
import asyncio
from typing import AsyncGenerator, Optional, Dict, List
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime


# ============================================================================
# ENUMS
# ============================================================================

class Phase(Enum):
    GREETING   = "greeting"
    CAPTURE    = "capture"
    VALIDATION = "validation"
    DECISION   = "decision"
    COMPLETE   = "complete"


class ConfidenceLevel(Enum):
    RED    = "RED"     # Handoff required
    YELLOW = "YELLOW"  # Optional human review
    GREEN  = "GREEN"   # Safe to complete autonomously


# ============================================================================
# MEMORY
# ============================================================================

@dataclass
class StructuredMemory:
    """Hard-typed fields the LLM must fill during CAPTURE."""
    location:           Optional[str]   = None
    issue_type:         Optional[str]   = None
    urgency_level:      Optional[float] = None   # 0.0–1.0
    caller_name:        Optional[str]   = None
    contact_details:    Optional[str]   = None
    additional_context: Optional[str]   = None
    human_requested:    bool            = False

    def get_missing_fields(self) -> List[str]:
        missing = []
        if not self.location:    missing.append("location")
        if not self.issue_type:  missing.append("issue_type")
        if self.urgency_level is None: missing.append("urgency_level")
        return missing

    def is_complete(self) -> bool:
        return len(self.get_missing_fields()) == 0

    def to_dict(self) -> Dict:
        return {
            "location":           self.location,
            "issue_type":         self.issue_type,
            "urgency_level":      self.urgency_level,
            "caller_name":        self.caller_name,
            "contact_details":    self.contact_details,
            "additional_context": self.additional_context,
            "human_requested":    self.human_requested,
        }


@dataclass
class SemanticMemory:
    """
    Rolling LLM-generated summary of the conversation.
    Prevents every call from hitting a human by preserving context
    across turns so the confidence scorer has rich signal.
    """
    summary:           str   = ""
    inferred_intent:   str   = ""
    contradictions:    List  = field(default_factory=list)
    sentiment:         str   = "neutral"   # calm | anxious | angry | neutral
    language_code:     str   = "en-IN"

    def update(self, extracted: Dict):
        if extracted.get("summary"):         self.summary         = extracted["summary"]
        if extracted.get("inferred_intent"): self.inferred_intent = extracted["inferred_intent"]
        if extracted.get("contradictions"):  self.contradictions  = extracted["contradictions"]
        if extracted.get("sentiment"):       self.sentiment       = extracted["sentiment"]
        if extracted.get("language_code"):   self.language_code   = extracted["language_code"]

    def to_dict(self) -> Dict:
        return {
            "summary":         self.summary,
            "inferred_intent": self.inferred_intent,
            "contradictions":  self.contradictions,
            "sentiment":       self.sentiment,
            "language_code":   self.language_code,
        }


# ============================================================================
# STATE
# ============================================================================

@dataclass
class ConversationState:
    call_id:      str
    user_context: Dict = field(default_factory=dict)

    phase:     Phase = Phase.GREETING
    turn_count: int  = 0
    max_turns:  int  = 3

    structured_memory:    StructuredMemory = field(default_factory=StructuredMemory)
    semantic_memory:      SemanticMemory   = field(default_factory=SemanticMemory)
    conversation_history: List[Dict]       = field(default_factory=list)

    # Confidence — LLM-assigned string levels, not floats
    confidence_after_capture:     Optional[ConfidenceLevel] = None
    confidence_after_validation:  Optional[ConfidenceLevel] = None
    confidence_reasoning:         str = ""

    user_corrected: bool = False
    validation_response: str = ""

    start_time:  str = field(default_factory=lambda: datetime.now().isoformat())

    def add_turn(self, role: str, content: str):
        self.conversation_history.append({
            "role":      role,
            "content":   content,
            "timestamp": datetime.now().isoformat(),
        })

    def to_dict(self) -> Dict:
        return {
            "call_id":    self.call_id,
            "phase":      self.phase.value,
            "turn_count": self.turn_count,
            "confidence_after_capture":    self.confidence_after_capture.value  if self.confidence_after_capture    else None,
            "confidence_after_validation": self.confidence_after_validation.value if self.confidence_after_validation else None,
            "confidence_reasoning": self.confidence_reasoning,
            "structured_memory":    self.structured_memory.to_dict(),
            "semantic_memory":      self.semantic_memory.to_dict(),
        }


# ============================================================================
# PIPELINE
# ============================================================================

class VoiceIntelligencePipeline:
    """
    Phase-controlled LLM pipeline.
    Caller (main.py / orchestrator) is responsible for NOT calling this
    while a previous stream is still yielding — no internal lock needed.
    """

    def __init__(self, llm_client, logger=None):
        self.llm    = llm_client
        self.logger = logger

    def _log(self, msg: str, level: str = "INFO"):
        if self.logger:
            self.logger.log(level, msg)
        print(f"[{level}][Pipeline] {msg}")

    # ------------------------------------------------------------------ public

    async def handle_greeting(
        self, state: ConversationState
    ) -> AsyncGenerator[str, None]:
        """Phase GREETING — called once, no user input needed."""
        self._log(f"[{state.call_id}] GREETING")

        language = state.user_context.get("language", "English")
        region   = state.user_context.get("state", "Karnataka")
        name     = state.user_context.get("name", "")

        prompt = f"""You are a calm, empathetic AI assistant for the 1092 Citizen Helpline in {region}.
Greet the caller{' named ' + name if name else ''} warmly in {language}.
Ask them to briefly describe their concern.
Keep it under 2 sentences. Do not ask multiple questions."""

        async for chunk in self._stream(prompt, state):
            yield chunk

        state.phase = Phase.CAPTURE

    async def handle_capture(
        self, state: ConversationState, user_input: str
    ) -> AsyncGenerator[str, None]:
        """Phase CAPTURE — up to max_turns turns of info gathering."""
        state.turn_count += 1
        self._log(f"[{state.call_id}] CAPTURE turn {state.turn_count}/{state.max_turns}")

        state.add_turn("user", user_input)

        # Extract structured + semantic info
        extracted = await self._extract(user_input, state)
        self._update_memories(state, extracted)

        # Exit conditions → VALIDATION
        if state.structured_memory.is_complete() or state.turn_count >= state.max_turns:
            self._log(f"[{state.call_id}] CAPTURE done → VALIDATION")
            state.phase = Phase.VALIDATION
            return

        # Ask for next missing field
        missing = state.structured_memory.get_missing_fields()
        prompt = f"""You are helping a citizen on the 1092 Helpline.

Gathered so far:
{json.dumps(state.structured_memory.to_dict(), indent=2)}

Semantic context:
{json.dumps(state.semantic_memory.to_dict(), indent=2)}

Missing: {', '.join(missing)}

The caller just said: "{user_input}"

Ask a single, natural follow-up question to get the next missing piece.
1–2 sentences. No lists. Match the caller's language/tone."""

        async for chunk in self._stream(prompt, state):
            yield chunk

    async def handle_validation(
        self, state: ConversationState
    ) -> AsyncGenerator[str, None]:
        """Phase VALIDATION — read back structured facts, ask for confirmation."""
        self._log(f"[{state.call_id}] VALIDATION")

        mem = state.structured_memory.to_dict()
        sem = state.semantic_memory.to_dict()

        prompt = f"""You are confirming a citizen's report on the 1092 Helpline.

Structured facts:
{json.dumps(mem, indent=2)}

Semantic summary: {sem['summary']}

Generate ONE concise confirmation sentence:
"Let me confirm: [issue] at [location], urgency [level]. Is this correct?"

Use only the structured facts. Do not invent details."""

        full = ""
        async for chunk in self._stream(prompt, state):
            full += chunk
            yield chunk

        state.validation_response = full
        state.phase = Phase.DECISION

    async def handle_decision(
        self, state: ConversationState, user_input: str
    ) -> AsyncGenerator[str, None]:
        """Phase DECISION — process confirmation, score confidence, route."""
        self._log(f"[{state.call_id}] DECISION")

        state.add_turn("user", user_input)
        state.user_corrected = self._is_correction(user_input)

        # LLM-based confidence scoring
        level, reasoning = await self._score_confidence(state)
        state.confidence_after_validation = level
        state.confidence_reasoning        = reasoning
        self._log(f"[{state.call_id}] Confidence={level.value} | {reasoning}")

        # Override: human explicitly requested
        if state.structured_memory.human_requested:
            level = ConfidenceLevel.RED

        # Override: very high urgency always gets a human
        urgency = state.structured_memory.urgency_level or 0.0
        if urgency >= 0.85:
            level = ConfidenceLevel.RED

        state.confidence_after_validation = level

        if level == ConfidenceLevel.RED:
            yield "Connecting you to a human agent right away. Please hold."
        elif level == ConfidenceLevel.YELLOW:
            yield "We have noted your concern. Our team will review it and reach out shortly."
        else:
            yield "Your request has been recorded and help is being arranged. Thank you for calling 1092."

        state.phase = Phase.COMPLETE

    # ------------------------------------------------------------------ private

    async def _extract(self, user_input: str, state: ConversationState) -> Dict:
        """Extract structured + semantic info in one LLM call."""
        prompt = f"""Extract information from the caller's statement for the 1092 Helpline.

Previous summary: {state.semantic_memory.summary or 'None'}
Current structured memory: {json.dumps(state.structured_memory.to_dict())}

Caller said: "{user_input}"

Return ONLY valid JSON (no markdown):
{{
  "location":           "string or null",
  "issue_type":         "string or null",
  "urgency_level":      0.0,
  "caller_name":        "string or null",
  "contact_details":    "string or null",
  "additional_context": "string or null",
  "human_requested":    false,
  "summary":            "1-sentence running summary of entire conversation",
  "inferred_intent":    "what the caller ultimately wants",
  "contradictions":     [],
  "sentiment":          "calm|anxious|angry|neutral",
  "language_code":      "e.g. en-IN, hi-IN"
}}

Be strict — only extract explicitly stated information."""

        return await self.llm.get_json_response(prompt)

    def _update_memories(self, state: ConversationState, extracted: Dict):
        sm = state.structured_memory
        if extracted.get("location"):           sm.location           = extracted["location"]
        if extracted.get("issue_type"):         sm.issue_type         = extracted["issue_type"]
        if extracted.get("urgency_level") is not None:
            sm.urgency_level = extracted["urgency_level"]
        if extracted.get("caller_name"):        sm.caller_name        = extracted["caller_name"]
        if extracted.get("contact_details"):    sm.contact_details    = extracted["contact_details"]
        if extracted.get("additional_context"): sm.additional_context = extracted["additional_context"]
        if extracted.get("human_requested"):    sm.human_requested    = True
        state.semantic_memory.update(extracted)

    async def _score_confidence(
        self, state: ConversationState
    ) -> tuple[ConfidenceLevel, str]:
        """
        LLM judges confidence based on:
        - Completeness of structured memory
        - Semantic coherence (contradictions, sentiment)
        - Whether user confirmed or corrected
        - Turn count efficiency
        Returns ConfidenceLevel + reasoning string.
        """
        prompt = f"""You are the confidence scoring engine for the 1092 Citizen Helpline AI.

Evaluate the following conversation state and decide the confidence level.

Structured memory:
{json.dumps(state.structured_memory.to_dict(), indent=2)}

Semantic memory:
{json.dumps(state.semantic_memory.to_dict(), indent=2)}

User corrected the AI during validation: {state.user_corrected}
Turns used: {state.turn_count} out of {state.max_turns}
Validation statement shown to user: "{state.validation_response}"

Scoring rules (apply ALL of them):
1. If human_requested is true → RED regardless of anything else.
2. If urgency_level >= 0.85 → RED (life/safety situation).
3. If user_corrected is true → penalise heavily (lean RED or YELLOW).
4. If any required field (location, issue_type, urgency_level) is null → RED.
5. If contradictions list is non-empty → YELLOW or RED.
6. If sentiment is "angry" → YELLOW (human may de-escalate better).
7. If all required fields are filled, no contradictions, user confirmed → GREEN.
8. Partial info with plausible context → YELLOW.

Return ONLY valid JSON:
{{
  "confidence_level": "RED|YELLOW|GREEN",
  "reasoning": "one sentence explaining the decision"
}}"""

        try:
            result = await self.llm.get_json_response(prompt)
            level_str = result.get("confidence_level", "RED").upper()
            level = ConfidenceLevel[level_str] if level_str in ConfidenceLevel.__members__ else ConfidenceLevel.RED
            return level, result.get("reasoning", "")
        except Exception as e:
            self._log(f"Confidence scoring error: {e}", "ERROR")
            return ConfidenceLevel.RED, "Scoring failed — defaulting to RED"

    async def _stream(
        self, prompt: str, state: ConversationState
    ) -> AsyncGenerator[str, None]:
        full = ""
        async for chunk in self.llm.stream_completion(
            prompt=prompt,
            system_message="You are a helpful assistant for the 1092 Citizen Helpline. Be concise, empathetic, and clear.",
            temperature=0.6,
            max_tokens=150,
        ):
            full += chunk
            yield chunk
        state.add_turn("assistant", full)

    @staticmethod
    def _is_correction(text: str) -> bool:
        text = text.lower()
        if any(w in text for w in ["no", "wrong", "incorrect", "not right", "that's not"]):
            return True
        return False


# ============================================================================
# ORCHESTRATOR  (single entry point for main.py)
# ============================================================================

class ConversationOrchestrator:
    """
    Routes user input to the correct phase handler.
    main.py should call process_turn() for every user utterance.
    Greeting is triggered automatically on first call with user_input=None.
    """

    def __init__(self, pipeline: VoiceIntelligencePipeline):
        self.pipeline     = pipeline
        self.active_calls: Dict[str, ConversationState] = {}

    def get_or_create_state(
        self, call_id: str, user_context: Optional[Dict] = None
    ) -> ConversationState:
        if call_id not in self.active_calls:
            self.active_calls[call_id] = ConversationState(
                call_id=call_id,
                user_context=user_context or {},
            )
        return self.active_calls[call_id]

    async def process_turn(
        self,
        call_id: str,
        user_input: Optional[str],
        state: Optional[ConversationState] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Main entry point.
        Pass user_input=None to trigger the greeting (first turn).
        """
        if state is None:
            state = self.active_calls.get(call_id)
        if state is None:
            raise ValueError(f"Unknown call_id: {call_id}")

        if state.phase == Phase.GREETING:
            async for chunk in self.pipeline.handle_greeting(state):
                yield chunk

        elif state.phase == Phase.CAPTURE:
            if not user_input:
                return
            async for chunk in self.pipeline.handle_capture(state, user_input):
                yield chunk

            # Auto-transition into validation if capture exited
            if state.phase == Phase.VALIDATION:
                # Compute capture-phase confidence snapshot (informational)
                level, reasoning = await self.pipeline._score_confidence(state)
                state.confidence_after_capture = level
                self.pipeline._log(f"[{call_id}] Capture confidence={level.value}")

                async for chunk in self.pipeline.handle_validation(state):
                    yield chunk

        elif state.phase == Phase.DECISION:
            if not user_input:
                return
            async for chunk in self.pipeline.handle_decision(state, user_input):
                yield chunk

        # COMPLETE — no further processing
        self.active_calls[call_id] = state