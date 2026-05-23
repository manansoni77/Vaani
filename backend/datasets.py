
from sqlalchemy import and_
from database.models import CallSessionRecord

def _nonnull(*columns: str):
    parts = []
    for col in columns:
        attr = getattr(CallSessionRecord, col)
        parts.append(attr.isnot(None))
        parts.append(attr != "")
    return and_(*parts)

DATASETS: dict[str, dict] = {
    "summarization": {
        "description": "Transcript → summary pairs for summarization fine-tuning.",
        "input_columns": ["transcript"],
        "output_columns": ["summary"],
        "model_type": "seq2seq",
        "filter": lambda: _nonnull("transcript", "summary"),
    },
    "intent_classification": {
        "description": "Transcript → intent label for intent classification.",
        "input_columns": ["transcript"],
        "output_columns": ["intent"],
        "model_type": "classification",
        "filter": lambda: _nonnull("transcript", "intent"),
    },
    "key_details_extraction": {
        "description": "Transcript → structured key details for information extraction.",
        "input_columns": ["transcript"],
        "output_columns": ["key_details"],
        "model_type": "extraction",
        "filter": lambda: _nonnull("transcript", "key_details"),
    },
    "sentiment_detection": {
        "description": "Transcript → sentiment label (neutral / positive / negative / anxious).",
        "input_columns": ["transcript"],
        "output_columns": ["sentiment"],
        "model_type": "classification",
        "filter": lambda: _nonnull("transcript"),
    },
    "urgency_detection": {
        "description": "Transcript → urgency level (none / low / medium / high).",
        "input_columns": ["transcript"],
        "output_columns": ["urgency_level"],
        "model_type": "classification",
        "filter": lambda: _nonnull("transcript"),
    },
    "escalation_prediction": {
        "description": "Transcript + call metadata → human escalation flag for proactive routing.",
        "input_columns": ["transcript", "phase", "turns", "sentiment", "urgency_level"],
        "output_columns": ["human_requested"],
        "model_type": "classification",
        "filter": lambda: _nonnull("transcript"),
    },
    "agent_confidence_calibration": {
        "description": "Transcript → agent confidence (GREEN / YELLOW / RED) for self-assessment fine-tuning.",
        "input_columns": ["transcript"],
        "output_columns": ["agent_confidence"],
        "model_type": "classification",
        "filter": lambda: _nonnull("transcript", "agent_confidence"),
    },
    "dialogue_quality": {
        "description": "Transcript + call metadata → user confidence as an implicit RLHF reward signal.",
        "input_columns": ["transcript", "phase", "turns"],
        "output_columns": ["user_confidence"],
        "model_type": "reward",
        "filter": lambda: _nonnull("transcript", "user_confidence"),
    },
}