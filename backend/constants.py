from enum import Enum
from typing import List
from pydantic import BaseModel


class LOG_ENTITIES(str, Enum):
    APP = "APP"
    CALL = "CALL"
    SARVAM_STT = "SARVAM_STT"
    SARVAM_TTS = "SARVAM_TTS"
    OPENAI_LLM = "OPENAI_LLM"

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