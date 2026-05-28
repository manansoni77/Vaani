from typing import List
from pydantic import BaseModel, Field
from constants import CONFIDENCE_LEVEL, SENTIMENT, URGENCY_LEVEL, QUERY_TYPE, SERVICE_TYPE


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
    query_type: QUERY_TYPE | None = None
    service_type: SERVICE_TYPE | None = None  # EMERGENCY only
    location: str | None = None  # EMERGENCY + MUNICIPALITY
    since_when: str | None = None  # MUNICIPALITY only
    user_language: str = "en-IN"


class CaptureAndValidationResponse(SemanticMemory):
    response: str = Field(..., description="The agent's response to the user input for this turn, must not be empty.")
    follow_up: bool
    reiterate: bool  # only used in VALIDATION phase to indicate if the summary should be reiterated with corrections
    agent_confidence: CONFIDENCE_LEVEL
    user_confidence: CONFIDENCE_LEVEL


class DecisionResponse(BaseModel):
    user_confidence: CONFIDENCE_LEVEL
