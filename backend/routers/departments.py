from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import Department, get_engine
from ..constants import ROLE_TYPE
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/departments", tags=["departments"])


# ── schemas ───────────────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str
    description: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    active: bool | None = None


class DepartmentOut(BaseModel):
    id: int
    name: str
    description: str | None
    active: bool
    created_at: str
    updated_at: str


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=DepartmentOut, status_code=201)
def create_department(
    body: DepartmentCreate,
    _claims: dict = Depends(require_roles(ROLE_TYPE.SUPER_ADMIN)),
) -> DepartmentOut:
    """Create a new department. Only super_admin may call this."""
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        if db.query(Department).filter(Department.name == body.name).first():
            raise HTTPException(status_code=409, detail=f"department {body.name!r} already exists")

        dept = Department(
            name=body.name,
            description=body.description,
            active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(dept)
        db.commit()
        db.refresh(dept)

    return DepartmentOut(
        id=dept.id,  # type: ignore[arg-type]
        name=str(dept.name),
        description=str(dept.description) if dept.description is not None else None,
        active=bool(dept.active),
        created_at=str(dept.created_at),
        updated_at=str(dept.updated_at),
    )


@router.get("", response_model=list[DepartmentOut])
def list_departments(
    _claims: dict = Depends(get_current_user),
) -> list[DepartmentOut]:
    """List all departments. Any authenticated user may call this."""
    with Session(get_engine()) as db:
        depts = db.query(Department).order_by(Department.name).all()

    return [
        DepartmentOut(
            id=d.id,  # type: ignore[arg-type]
            name=str(d.name),
            description=str(d.description) if d.description is not None else None,
            active=bool(d.active),
            created_at=str(d.created_at),
            updated_at=str(d.updated_at),
        )
        for d in depts
    ]


@router.patch("/{dept_id}", response_model=DepartmentOut)
def update_department(
    dept_id: int,
    body: DepartmentUpdate,
    _claims: dict = Depends(require_roles(ROLE_TYPE.SUPER_ADMIN)),
) -> DepartmentOut:
    """Rename a department or toggle its active flag. Only super_admin may call this."""
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        dept = db.query(Department).filter(Department.id == dept_id).first()
        if dept is None:
            raise HTTPException(status_code=404, detail="department not found")

        if body.name is not None and body.name != dept.name:
            if db.query(Department).filter(Department.name == body.name).first():
                raise HTTPException(status_code=409, detail=f"department {body.name!r} already exists")
            dept.name = body.name  # type: ignore[assignment]

        if body.description is not None:
            dept.description = body.description  # type: ignore[assignment]

        if body.active is not None:
            dept.active = body.active  # type: ignore[assignment]

        dept.updated_at = now  # type: ignore[assignment]
        db.commit()
        db.refresh(dept)

    return DepartmentOut(
        id=dept.id,  # type: ignore[arg-type]
        name=str(dept.name),
        description=str(dept.description) if dept.description is not None else None,
        active=bool(dept.active),
        created_at=str(dept.created_at),
        updated_at=str(dept.updated_at),
    )
