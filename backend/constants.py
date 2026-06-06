from enum import Enum


class PHASE(str, Enum):
    GREETING = "GREETING"
    CAPTURE = "CAPTURE"
    VALIDATION = "VALIDATION"
    DECISION = "DECISION"
    COMPLETE = "COMPLETE"


class SENTIMENT(str, Enum):
    CALM = "calm"
    ANXIOUS = "anxious"
    ANGRY = "angry"
    NEUTRAL = "neutral"


class QUERY_TYPE(str, Enum):
    GRIEVANCE = "GRIEVANCE"
    ENQUIRY = "ENQUIRY"
    OTHERS = "OTHERS"


class SERVICE_TYPE(str, Enum):
    POLICE = "police"
    MEDICAL = "medical"
    FIRE = "fire"
    DISASTER_RELIEF = "disaster_relief"


class ROLE_TYPE(str, Enum):
    IT_ADMIN = "it_admin"  # singleton — system config, user management
    SUPER_ADMIN = "super_admin"  # singleton — full business oversight
    CALL_CENTER_ADMIN = "call_center_admin"  # manages call center agents and queue
    CALL_CENTER_USER = "call_center_user"  # agent who takes over live calls
    DEPT_ADMIN = "dept_admin"  # manages one department's tickets
    DEPT_USER = "dept_user"  # handles tickets in their department
