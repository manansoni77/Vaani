from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Role, StaffUser, get_engine
from constants import ROLE_TYPE
from .auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

# ── response schemas ──────────────────────────────────────────────────────────

class AdminInfo(BaseModel):
    name: str
    email: str


class UserMeResponse(BaseModel):
    id: int
    name: str
    email: str
    google_sub: str | None
    role_type: str
    department_name: str | None
    active: bool
    created_at: str
    last_login_at: str | None
    dept_admin: AdminInfo | None
    it_admin: AdminInfo | None
    super_admin: AdminInfo | None


# ── helpers ───────────────────────────────────────────────────────────────────

_SYSTEM_ROLES = {ROLE_TYPE.IT_ADMIN, ROLE_TYPE.SUPER_ADMIN}


def _find_admin(
    db: Session,
    role_type: ROLE_TYPE,
    department_name: str | None = None,
) -> AdminInfo | None:
    """Find the first active staff user with the given role_type.

    Pass department_name to further narrow to a specific department's admin.
    """
    q = (
        db.query(StaffUser)
        .join(StaffUser.role)
        .filter(Role.role_type == role_type)
    )
    if department_name is not None:
        q = q.filter(Role.department_name == department_name)
    user = q.first()
    if user is None:
        return None
    return AdminInfo(name=str(user.name), email=str(user.email))


# ── register ──────────────────────────────────────────────────────────────────

# Roles that must have a department, roles that must not.
_DEPT_REQUIRED = {ROLE_TYPE.DEPT_ADMIN, ROLE_TYPE.DEPT_USER}
_DEPT_FORBIDDEN = {ROLE_TYPE.IT_ADMIN, ROLE_TYPE.SUPER_ADMIN}


class RegisterUserRequest(BaseModel):
    name: str
    email: str
    role_type: ROLE_TYPE
    department_name: str | None = None


class RegisterUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role_type: str
    department_name: str | None
    active: bool


@router.post("/register", response_model=RegisterUserResponse, status_code=201)
def register_user(
    body: RegisterUserRequest,
    claims: dict = Depends(get_current_user),
) -> RegisterUserResponse:
    """Pre-provision a staff user account.

    The account is created with active=False and no google_sub.  The user
    activates it automatically on their first Google sign-in.

    Permission rules:
    - super_admin  — can create any role
    - dept_admin   — can only create dept_user within their own department
    - it_admin     — cannot create any accounts (403)
    - all others   — 403
    """
    caller_role = ROLE_TYPE(claims["role_type"])
    caller_dept = claims.get("department_name")

    # ── permission gate ───────────────────────────────────────────────────────
    if caller_role == ROLE_TYPE.SUPER_ADMIN:
        pass  # unrestricted
    elif caller_role == ROLE_TYPE.DEPT_ADMIN:
        if body.role_type != ROLE_TYPE.DEPT_USER:
            raise HTTPException(
                status_code=403,
                detail="dept_admin can only create dept_user accounts",
            )
        if body.department_name != caller_dept:
            raise HTTPException(
                status_code=403,
                detail="dept_admin can only create users in their own department",
            )
    else:
        raise HTTPException(status_code=403, detail="not authorised to create users")

    # ── department_name validation ────────────────────────────────────────────
    if body.role_type in _DEPT_REQUIRED and not body.department_name:
        raise HTTPException(
            status_code=422,
            detail=f"{body.role_type.value} requires a department_name",
        )
    if body.role_type in _DEPT_FORBIDDEN and body.department_name:
        raise HTTPException(
            status_code=422,
            detail=f"{body.role_type.value} must not have a department_name",
        )

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        # ── duplicate email check ─────────────────────────────────────────────
        if db.query(StaffUser).filter(StaffUser.email == body.email).first():
            raise HTTPException(status_code=409, detail="email already registered")

        # ── find or create the matching Role row ──────────────────────────────
        role = (
            db.query(Role)
            .filter(
                Role.role_type == body.role_type,
                Role.department_name == body.department_name,
            )
            .first()
        )
        if role is None:
            role = Role(role_type=body.role_type, department_name=body.department_name)
            db.add(role)
            db.flush()  # populate role.id before referencing it

        # ── create the user (inactive until first Google login) ───────────────
        user = StaffUser(
            role_id=role.id,
            name=body.name,
            email=body.email,
            google_sub=None,
            active=False,
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        _ = user.role  # load relationship before session closes

    return RegisterUserResponse(
        id=user.id,  # type: ignore[arg-type]
        name=str(user.name),
        email=str(user.email),
        role_type=user.role.role_type.value,
        department_name=str(user.role.department_name) if user.role.department_name is not None else None,
        active=bool(user.active),
    )


# ── me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserMeResponse)
def get_me(claims: dict = Depends(get_current_user)) -> UserMeResponse:
    """Return the full profile for the currently authenticated user.

    Hierarchy fields (dept_admin, it_admin, super_admin) are computed
    server-side from the roles table. dept_admin is null for system roles
    (it_admin, super_admin) since they have no department.
    """
    user_id         = int(claims["sub"])
    department_name = claims.get("department_name")

    with Session(get_engine()) as db:
        user = db.query(StaffUser).filter(StaffUser.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="user not found")

        _ = user.role  # load relationship before queries

        is_system_role = user.role.role_type in _SYSTEM_ROLES

        dept_admin = (
            None
            if is_system_role
            else _find_admin(db, ROLE_TYPE.DEPT_ADMIN, department_name)
        )
        it_admin    = _find_admin(db, ROLE_TYPE.IT_ADMIN)
        super_admin = _find_admin(db, ROLE_TYPE.SUPER_ADMIN)

    return UserMeResponse(
        id=user.id,  # type: ignore[arg-type]  # Column[int] → int at runtime; Pydantic coerces
        name=str(user.name),
        email=str(user.email),
        google_sub=str(user.google_sub) if user.google_sub is not None else None,
        role_type=user.role.role_type.value,
        department_name=str(user.role.department_name) if user.role.department_name is not None else None,
        active=bool(user.active),
        created_at=str(user.created_at),
        last_login_at=str(user.last_login_at) if user.last_login_at is not None else None,
        dept_admin=dept_admin,
        it_admin=it_admin,
        super_admin=super_admin,
    )
