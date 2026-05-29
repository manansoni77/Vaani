from sqlalchemy import and_
from database import CallSessionRecord


def _nonnull(*columns: str):
    parts = []
    for col in columns:
        attr = getattr(CallSessionRecord, col)
        parts.append(attr.isnot(None))
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
        "description": "Transcript → urgency score (0.0–1.0).",
        "input_columns": ["transcript"],
        "output_columns": ["urgency_score"],
        "model_type": "regression",
        "filter": lambda: _nonnull("transcript", "urgency_score"),
    },
    "escalation_prediction": {
        "description": "Transcript + call metadata → human escalation flag for proactive routing.",
        "input_columns": ["transcript", "phase", "turns", "sentiment"],
        "output_columns": ["human_requested"],
        "model_type": "classification",
        "filter": lambda: _nonnull("transcript"),
    },
    "system_confidence_calibration": {
        "description": "Transcript → system confidence score (0.0–1.0) for self-assessment fine-tuning.",
        "input_columns": ["transcript"],
        "output_columns": ["system_score"],
        "model_type": "regression",
        "filter": lambda: _nonnull("transcript", "system_score"),
    },
    "dialogue_quality": {
        "description": "Transcript + call metadata → user confidence score as an implicit RLHF reward signal.",
        "input_columns": ["transcript", "phase", "turns"],
        "output_columns": ["user_score"],
        "model_type": "reward",
        "filter": lambda: _nonnull("transcript", "user_score"),
    },
}
