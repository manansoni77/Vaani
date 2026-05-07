from enum import Enum
from typing import List
from pydantic import BaseModel


class PRERECORDED_AUDIO(Enum):
    """Fixed agent phrases that are cached as WAV files after first synthesis.

    Each member carries the exact text yielded by DialogueFlow so the cache
    lookup can match by string equality in _synthesise_sentence.
    """

    GREETING         = ("greeting",          "Hello! Thank you for calling Vaani. How can I assist you today?")
    CAPTURE_ESCALATE = ("capture_escalate",  "It seems I am not able to understand your query, let me connect you to a human agent for better assistance.")
    DECISION_RESOLVED= ("decision_resolved", "Thankyou for confirming. Your query has been noted, we will look into it.")
    DECISION_ESCALATE= ("decision_escalate", "Apologies, let me connect you to a human agent for assistance.")

    def __init__(self, slug: str, text: str) -> None:
        self.slug = slug
        self.text = text

    @classmethod
    def from_text(cls, text: str) -> "PRERECORDED_AUDIO | None":
        for member in cls:
            if member.text == text:
                return member
        return None


class LOG_ENTITIES(str, Enum):
    APP = "APP"
    CALL = "CALL"
    SARVAM_STT = "SARVAM_STT"
    SARVAM_TTS = "SARVAM_TTS"
    OPENAI_LLM = "OPENAI_LLM"
    DIALOGUE_FLOW = "DIALOGUE_FLOW"
    HUMAN_AGENT = "HUMAN_AGENT"

class PHASE(str, Enum):
    GREETING   = "GREETING"
    CAPTURE    = "CAPTURE"
    VALIDATION = "VALIDATION"
    DECISION   = "DECISION"
    COMPLETE   = "COMPLETE"

class CONFIDENCE_LEVEL(str, Enum):
    RED    = "RED"     # Handoff required
    YELLOW = "YELLOW"  # Optional human review
    GREEN  = "GREEN"   # Safe to complete autonomously

class SENTIMENT(str, Enum):
    CALM = "calm"
    ANXIOUS = "anxious"
    ANGRY = "angry"
    NEUTRAL = "neutral"

class URGENCY_LEVEL(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class SemanticMemory(BaseModel):
    """
    Rolling LLM-generated summary of the conversation.
    Prevents every call from hitting a human by preserving context
    across turns so the confidence scorer has rich signal.
    """

    summary: str = ""
    intent: str = ""
    key_details: str = ""
    contradictions: List[str] = []
    sentiment: SENTIMENT = SENTIMENT.NEUTRAL
    urgency_level: URGENCY_LEVEL = URGENCY_LEVEL.NONE
    human_requested: bool = False

class CaptureAndValidationResponse(SemanticMemory):
    response: str
    follow_up: bool
    agent_confidence: CONFIDENCE_LEVEL

class DecisionResponse(BaseModel):
    user_confidence: CONFIDENCE_LEVEL