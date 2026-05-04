from enum import Enum


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

class EMOTION(str, Enum):
    CALM = "calm"
    ANXIOUS = "anxious"
    ANGRY = "angry"
    NEUTRAL = "neutral"

class URGENCY_LEVEL(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"