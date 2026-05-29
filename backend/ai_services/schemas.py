from typing import List
from pydantic import BaseModel, Field
from constants import SENTIMENT, QUERY_TYPE, SERVICE_TYPE


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
    urgency_score: float = Field(default=0.0, ge=0.0, le=1.0)  # 0–0.33 low, 0.33–0.66 medium, 0.66–1.0 high
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
    system_score: float = Field(..., ge=0.0, le=1.0, description="Agent confidence: 0–0.33 red (unclear), 0.33–0.66 yellow (partial), 0.66–1.0 green (complete).")
    user_score: float = Field(..., ge=0.0, le=1.0, description="User confidence/satisfaction: 0–0.33 red, 0.33–0.66 yellow, 0.66–1.0 green.")


class DecisionResponse(BaseModel):
    user_score: float = Field(..., ge=0.0, le=1.0, description="User confirmation confidence: 0–0.33 red (denied/unclear), 0.33–0.66 yellow, 0.66–1.0 green (confirmed).")
