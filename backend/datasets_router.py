from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from logger import CallSessionRecord, get_engine

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _nonnull(*columns: str):
    parts = []
    for col in columns:
        attr = getattr(CallSessionRecord, col)
        parts.append(attr.isnot(None))
        parts.append(attr != "")
    return and_(*parts)


_DATASETS: dict[str, dict] = {
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


class DatasetMeta(BaseModel):
    name: str
    description: str
    input_columns: list[str]
    output_columns: list[str]
    model_type: str
    count: int


class DatasetPage(BaseModel):
    name: str
    total: int
    limit: int
    offset: int
    samples: list[dict]


@router.get("", response_model=list[DatasetMeta])
def list_datasets() -> list[DatasetMeta]:
    """Return metadata for every available fine-tuning dataset, including qualifying record counts."""
    with Session(get_engine()) as db:
        result = []
        for name, defn in _DATASETS.items():
            count = db.query(CallSessionRecord).filter(defn["filter"]()).count()
            result.append(DatasetMeta(
                name=name,
                description=defn["description"],
                input_columns=defn["input_columns"],
                output_columns=defn["output_columns"],
                model_type=defn["model_type"],
                count=count,
            ))
        return result


@router.get("/{dataset_name}", response_model=DatasetPage)
def get_dataset_samples(
    dataset_name: str,
    limit: int = Query(default=20, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> DatasetPage:
    """Return paginated samples for the chosen dataset with only the relevant input/output columns."""
    defn = _DATASETS.get(dataset_name)
    if defn is None:
        raise HTTPException(status_code=404, detail=f"unknown dataset {dataset_name!r}")

    cols = defn["input_columns"] + defn["output_columns"]

    with Session(get_engine()) as db:
        q = db.query(CallSessionRecord).filter(defn["filter"]())
        total = q.count()
        rows = q.order_by(CallSessionRecord.id.desc()).offset(offset).limit(limit).all()
        samples = [
            {"session_id": r.session_id, **{col: getattr(r, col) for col in cols}}
            for r in rows
        ]

    return DatasetPage(name=dataset_name, total=total, limit=limit, offset=offset, samples=samples)
