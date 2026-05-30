from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import GOOGLE_CLIENT_ID, JWT_ALGORITHM, JWT_EXPIRE_SECS, JWT_SECRET
from constants import ROLE_TYPE
from database import StaffUser, get_engine
from loggers import LOG_ENTITIES, get_logger

router = APIRouter(prefix="/auth", tags=["auth"])
_log = get_logger(LOG_ENTITIES.APP)
_bearer = HTTPBearer()


# ── request / response schemas ───────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    credential: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _make_token(user: StaffUser) -> str:
    """Encode an app JWT from a fully-loaded StaffUser (role must be joined)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub":             str(user.id),
        "email":           user.email,
        "name":            user.name,
        "role_type":       user.role.role_type.value,
        "role_id":         str(user.role_id),
        "department_name": user.role.department_name,  # null for IT_ADMIN / SUPER_ADMIN
        "iat":             int(now.timestamp()),
        "exp":             int((now + timedelta(seconds=JWT_EXPIRE_SECS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    """Decode and verify an app JWT. Raises 401 on any failure."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="invalid token")


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """Dependency: extracts and verifies the Bearer JWT, returns its claims dict."""
    return _decode_token(credentials.credentials)


def require_roles(*allowed: ROLE_TYPE):
    """Dependency factory — verifies the Bearer JWT and enforces role membership.

    Usage:
        claims: dict = Depends(require_roles(ROLE_TYPE.SUPER_ADMIN, ROLE_TYPE.DEPT_ADMIN))

    Returns the decoded JWT claims dict so the endpoint can read role, department, etc.
    Raises 401 if the token is missing/invalid, 403 if the caller's role is not in *allowed*.
    """
    allowed_set = frozenset(allowed)

    def _check(claims: dict = Depends(get_current_user)) -> dict:
        if ROLE_TYPE(claims["role_type"]) not in allowed_set:
            raise HTTPException(status_code=403, detail="insufficient permissions")
        return claims

    return _check


# ── endpoint ──────────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse)
def google_auth(body: GoogleAuthRequest) -> TokenResponse:
    """Verify a Google ID token and return a signed app JWT.

    Looks up the staff_users record by google_sub first, then falls back
    to email match (and backfills google_sub on first login).
    Raises 401 if the Google credential is invalid, 403 if the account
    is not provisioned or has been deactivated.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")

    # 1. Verify with Google
    try:
        id_info = id_token.verify_oauth2_token(
            body.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        _log.warning(f"Google token verification failed: {exc!r}")
        raise HTTPException(status_code=401, detail="invalid or expired Google credential")

    google_sub = id_info["sub"]
    email      = id_info.get("email", "")

    # 2. Look up staff user — prefer google_sub, fall back to email
    with Session(get_engine()) as db:
        user = db.query(StaffUser).filter(StaffUser.google_sub == google_sub).first()
        if user is None:
            user = db.query(StaffUser).filter(StaffUser.email == email).first()

        if user is None:
            _log.warning(f"auth attempt from unprovisioned email={email!r}")
            raise HTTPException(status_code=403, detail="account not provisioned")

        # 3. First login: backfill google_sub and auto-activate the pre-created account.
        #    Admins provision accounts with active=False; the account becomes live only
        #    once the user completes their first Google sign-in.
        if user.google_sub is None:
            user.google_sub = google_sub  # type: ignore
            user.active = True            # type: ignore  # first-login activation

        # 4. Block accounts explicitly deactivated by an admin after first login.
        if user.active is False:
            _log.warning(f"auth attempt from inactive user id={user.id}")
            raise HTTPException(status_code=403, detail="account is inactive")

        user.last_login_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds")  # type: ignore
        db.commit()
        db.refresh(user)
        _ = user.role  # load relationship before session closes

        token = _make_token(user)

    _log.info(f"authenticated user id={user.id} email={email!r} role={user.role.role_type.value!r}")
    return TokenResponse(access_token=token, token_type="Bearer", expires_in=JWT_EXPIRE_SECS)
