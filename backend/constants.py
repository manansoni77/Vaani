from enum import Enum


class PHASE(str, Enum):
    GREETING = "GREETING"
    CAPTURE = "CAPTURE"
    VALIDATION = "VALIDATION"
    DECISION = "DECISION"
    COMPLETE = "COMPLETE"


class CONFIDENCE_LEVEL(str, Enum):
    RED = "RED"  # Handoff required
    YELLOW = "YELLOW"  # Optional human review
    GREEN = "GREEN"  # Safe to complete autonomously


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


class QUERY_TYPE(str, Enum):
    GRIEVANCE = "GRIEVANCE"
    ENQUIRY = "ENQUIRY"
    OTHERS = "OTHERS"


class SERVICE_TYPE(str, Enum):
    POLICE = "police"
    MEDICAL = "medical"
    FIRE = "fire"
    DISASTER_RELIEF = "disaster_relief"


class ACCESS_LEVEL(str, Enum):
    ADMIN = "admin"
    USER = "user"
