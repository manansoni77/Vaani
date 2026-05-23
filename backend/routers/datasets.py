from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database.models import CallSessionRecord
from datasets import DATASETS
from database import get_engine

router = APIRouter(prefix="/datasets", tags=["datasets"])


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
        for name, defn in DATASETS.items():
            count = db.query(CallSessionRecord).filter(defn["filter"]()).count()
            result.append(
                DatasetMeta(
                    name=name,
                    description=defn["description"],
                    input_columns=defn["input_columns"],
                    output_columns=defn["output_columns"],
                    model_type=defn["model_type"],
                    count=count,
                )
            )
        return result


@router.get("/{dataset_name}", response_model=DatasetPage)
def get_dataset_samples(
    dataset_name: str,
    limit: int = Query(default=20, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> DatasetPage:
    """Return paginated samples for the chosen dataset with only the relevant input/output columns."""
    defn = DATASETS.get(dataset_name)
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

    return DatasetPage(
        name=dataset_name, total=total, limit=limit, offset=offset, samples=samples
    )
