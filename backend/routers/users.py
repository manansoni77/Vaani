from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Department, Role, StaffUser, get_engine
from constants import ROLE_TYPE
from .auth import get_current_user, require_roles

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
    department_id: int | None
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
    department_id: int | None = None,
) -> AdminInfo | None:
    """Find the first staff user with the given role_type.

    Pass department_id to narrow to a specific department's admin.
    """
    q = (
        db.query(StaffUser)
        .join(StaffUser.role)
        .filter(Role.role_type == role_type)
    )
    if department_id is not None:
        q = q.filter(Role.department_id == department_id)
    user = q.first()
    if user is None:
        return None
    return AdminInfo(name=str(user.name), email=str(user.email))


# ── register ──────────────────────────────────────────────────────────────────

# Which roles each caller type is allowed to create.
_CREATABLE_BY: dict[ROLE_TYPE, set[ROLE_TYPE]] = {
    ROLE_TYPE.SUPER_ADMIN: {
        ROLE_TYPE.CALL_CENTER_ADMIN,
        ROLE_TYPE.CALL_CENTER_USER,
        ROLE_TYPE.DEPT_ADMIN,
        ROLE_TYPE.DEPT_USER,
    },
    ROLE_TYPE.CALL_CENTER_ADMIN: {ROLE_TYPE.CALL_CENTER_USER},
    ROLE_TYPE.DEPT_ADMIN:        {ROLE_TYPE.DEPT_USER},
}

# department_id is required for dept roles, forbidden for system/call-center roles.
_DEPT_REQUIRED = {ROLE_TYPE.DEPT_ADMIN, ROLE_TYPE.DEPT_USER}
_DEPT_FORBIDDEN = {
    ROLE_TYPE.IT_ADMIN,
    ROLE_TYPE.SUPER_ADMIN,
    ROLE_TYPE.CALL_CENTER_ADMIN,
    ROLE_TYPE.CALL_CENTER_USER,
}

# Roles where only one instance may exist across the whole system / per department.
_SINGLETON_SYSTEM   = {ROLE_TYPE.CALL_CENTER_ADMIN}  # one globally
_SINGLETON_PER_DEPT = {ROLE_TYPE.DEPT_ADMIN}          # one per department


class RegisterUserRequest(BaseModel):
    name:          str
    email:         str
    role_type:     ROLE_TYPE
    department_id: int | None = None  # required for dept roles, forbidden for system/cc roles


class RegisterUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role_type: str
    department_id: int | None
    department_name: str | None
    active: bool


@router.post("/register", response_model=RegisterUserResponse, status_code=201)
def register_user(
    body: RegisterUserRequest,
    claims: dict = Depends(
        require_roles(ROLE_TYPE.SUPER_ADMIN, ROLE_TYPE.CALL_CENTER_ADMIN, ROLE_TYPE.DEPT_ADMIN)
    ),
) -> RegisterUserResponse:
    """Pre-provision a staff user account.

    The account is created with active=False and no google_sub.  The user
    activates it automatically on their first Google sign-in.

    Permission rules:
    - super_admin        — can create call_center_admin/user, dept_admin/user
    - call_center_admin  — can create call_center_user only
    - dept_admin         — can create dept_user in their own department only
    - it_admin / others  — 403 (blocked by require_roles before reaching here)

    Singleton constraints:
    - call_center_admin: only one may exist system-wide
    - dept_admin:        only one per department
    """
    caller_role    = ROLE_TYPE(claims["role_type"])
    caller_dept_id = claims.get("department_id")

    # ── role creation permission ──────────────────────────────────────────────
    if body.role_type not in _CREATABLE_BY.get(caller_role, set()):
        raise HTTPException(
            status_code=403,
            detail=f"{caller_role.value} cannot create {body.role_type.value} accounts",
        )

    # dept_admin is scoped to their own department only.
    if caller_role == ROLE_TYPE.DEPT_ADMIN and body.department_id != caller_dept_id:
        raise HTTPException(
            status_code=403,
            detail="dept_admin can only create users in their own department",
        )

    # ── department_id validation ──────────────────────────────────────────────
    if body.role_type in _DEPT_REQUIRED and body.department_id is None:
        raise HTTPException(
            status_code=422,
            detail=f"{body.role_type.value} requires a department_id",
        )
    if body.role_type in _DEPT_FORBIDDEN and body.department_id is not None:
        raise HTTPException(
            status_code=422,
            detail=f"{body.role_type.value} must not have a department_id",
        )

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(get_engine()) as db:
        # ── duplicate email check ─────────────────────────────────────────────
        if db.query(StaffUser).filter(StaffUser.email == body.email).first():
            raise HTTPException(status_code=409, detail="email already registered")

        # ── validate department exists and is active ──────────────────────────
        dept_name: str | None = None
        if body.department_id is not None:
            dept = db.query(Department).filter(Department.id == body.department_id).first()
            if dept is None:
                raise HTTPException(status_code=404, detail="department not found")
            if dept.active is False:
                raise HTTPException(status_code=422, detail="department is inactive")
            dept_name = str(dept.name)

        # ── singleton constraints ─────────────────────────────────────────────
        if body.role_type in _SINGLETON_SYSTEM:
            exists = (
                db.query(StaffUser)
                .join(StaffUser.role)
                .filter(Role.role_type == body.role_type)
                .first()
            )
            if exists:
                raise HTTPException(
                    status_code=409,
                    detail=f"a {body.role_type.value} already exists",
                )

        if body.role_type in _SINGLETON_PER_DEPT:
            exists = (
                db.query(StaffUser)
                .join(StaffUser.role)
                .filter(
                    Role.role_type == body.role_type,
                    Role.department_id == body.department_id,
                )
                .first()
            )
            if exists:
                raise HTTPException(
                    status_code=409,
                    detail=f"a {body.role_type.value} already exists for this department",
                )

        # ── find or create the matching Role row ──────────────────────────────
        role = (
            db.query(Role)
            .filter(
                Role.role_type == body.role_type,
                Role.department_id == body.department_id,
            )
            .first()
        )
        if role is None:
            role = Role(role_type=body.role_type, department_id=body.department_id)
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

    return RegisterUserResponse(
        id=user.id,  # type: ignore[arg-type]
        name=str(user.name),
        email=str(user.email),
        role_type=body.role_type.value,
        department_id=body.department_id,
        department_name=dept_name,
        active=False,
    )


# ── me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserMeResponse)
def get_me(claims: dict = Depends(get_current_user)) -> UserMeResponse:
    """Return the full profile for the currently authenticated user.

    Hierarchy fields (dept_admin, it_admin, super_admin) are computed
    server-side from the roles table. dept_admin is null for system roles
    (it_admin, super_admin) since they have no department.
    """
    user_id       = int(claims["sub"])
    department_id = claims.get("department_id")

    with Session(get_engine()) as db:
        user = db.query(StaffUser).filter(StaffUser.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="user not found")

        _ = user.role            # load role before queries
        _ = user.role.department  # load department (None for system roles)

        is_system_role = user.role.role_type in _SYSTEM_ROLES

        dept_admin = (
            None
            if is_system_role
            else _find_admin(db, ROLE_TYPE.DEPT_ADMIN, department_id)
        )
        it_admin    = _find_admin(db, ROLE_TYPE.IT_ADMIN)
        super_admin = _find_admin(db, ROLE_TYPE.SUPER_ADMIN)

    dept = user.role.department
    return UserMeResponse(
        id=user.id,  # type: ignore[arg-type]
        name=str(user.name),
        email=str(user.email),
        google_sub=str(user.google_sub) if user.google_sub is not None else None,
        role_type=user.role.role_type.value,
        department_id=dept.id if dept else None,  # type: ignore[arg-type]
        department_name=str(dept.name) if dept else None,
        active=bool(user.active),
        created_at=str(user.created_at),
        last_login_at=str(user.last_login_at) if user.last_login_at is not None else None,
        dept_admin=dept_admin,
        it_admin=it_admin,
        super_admin=super_admin,
    )
