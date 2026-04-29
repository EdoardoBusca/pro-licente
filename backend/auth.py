"""
auth.py — Rate limiting, JWT, password hashing, user management, /auth/* routes.
"""

import os
import re
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta

import bcrypt
import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field, field_validator

from db import _db_connect

# ─── Rate Limiter ──────────────────────────────────────────────────────────────

_RATE_LIMIT_MAX    = int(os.getenv("RATE_LIMIT_MAX", "5"))
_RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "900"))  # 15 min
_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = threading.Lock()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str):
    now = time.time()
    cutoff = now - _RATE_LIMIT_WINDOW
    with _rate_lock:
        _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
        if len(_rate_store[ip]) >= _RATE_LIMIT_MAX:
            retry_after = int(_RATE_LIMIT_WINDOW - (now - _rate_store[ip][0]))
            raise HTTPException(
                status_code=429,
                detail=f"Too many attempts. Try again in {retry_after // 60} min {retry_after % 60} sec.",
                headers={"Retry-After": str(retry_after)},
            )


def _record_failed_attempt(ip: str):
    with _rate_lock:
        _rate_store[ip].append(time.time())


def _clear_attempts(ip: str):
    with _rate_lock:
        _rate_store.pop(ip, None)


# ─── JWT ───────────────────────────────────────────────────────────────────────

JWT_SECRET    = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. Add it to backend/.env")

_bearer = HTTPBearer(auto_error=False)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _create_token(user_id: int, email: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return {}


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    """FastAPI dependency — validates JWT and returns the payload dict."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = _decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


# ─── User DB Helpers ───────────────────────────────────────────────────────────

def init_users_db():
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id              SERIAL PRIMARY KEY,
                    email           TEXT   UNIQUE NOT NULL,
                    name            TEXT   NOT NULL,
                    hashed_password TEXT   NOT NULL,
                    role            TEXT   NOT NULL DEFAULT 'analyst',
                    created_at      TEXT   NOT NULL,
                    is_active       INTEGER NOT NULL DEFAULT 1
                )
            """)
        conn.commit()
    _seed_admin()


def _seed_admin():
    """Create a default admin account on first run if no users exist."""
    default_pw = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin123")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            if cur.fetchone()[0] == 0:
                cur.execute(
                    "INSERT INTO users (email, name, hashed_password, role, created_at) VALUES (%s,%s,%s,%s,%s)",
                    ("admin@estatevantage.com", "Admin", _hash_password(default_pw),
                     "admin", datetime.utcnow().isoformat()),
                )
        conn.commit()


def _get_user_by_email(email: str):
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, hashed_password, role, is_active FROM users WHERE email = %s",
                (email.lower().strip(),),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "name": row[2],
            "hashed_password": row[3], "role": row[4], "is_active": row[5]}


# ─── Request Models ────────────────────────────────────────────────────────────

_EMAIL_RE    = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}$")
_SAFE_NAME_RE = re.compile(r"^[\w\s\-'.]{1,80}$")


class LoginRequest(BaseModel):
    email:    str = Field(..., max_length=320)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v


class RegisterRequest(BaseModel):
    email:    str = Field(..., max_length=320)
    name:     str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=128)
    role:     str = Field("analyst", pattern=r"^(analyst|admin)$")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not _SAFE_NAME_RE.match(v):
            raise ValueError("Name contains invalid characters")
        return v


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


# ─── Routes ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/auth")


@router.post("/login")
async def login(payload: LoginRequest, request: Request):
    ip = _get_client_ip(request)
    _check_rate_limit(ip)

    user = _get_user_by_email(payload.email)
    if not user or not user["is_active"] or not _verify_password(payload.password, user["hashed_password"]):
        _record_failed_attempt(ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _clear_attempts(ip)
    token = _create_token(user["id"], user["email"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
    }


@router.post("/register")
async def register(payload: RegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (email, name, hashed_password, role, created_at) VALUES (%s,%s,%s,%s,%s)",
                    (payload.email, payload.name, _hash_password(payload.password),
                     payload.role, datetime.utcnow().isoformat()),
                )
            conn.commit()
        return {"message": "User created successfully"}
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Email already registered")


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["sub"], "email": current_user["email"], "role": current_user["role"]}


@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, role, created_at, is_active FROM users ORDER BY created_at DESC"
            )
            rows = cur.fetchall()
    return [{"id": r[0], "email": r[1], "name": r[2], "role": r[3],
             "created_at": r[4], "is_active": bool(r[5])} for r in rows]


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if str(user_id) == current_user.get("sub"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_active = 0 WHERE id = %s", (user_id,))
        conn.commit()
    return {"message": "User deactivated"}


@router.patch("/users/{user_id}/reactivate")
async def reactivate_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_active = 1 WHERE id = %s", (user_id,))
        conn.commit()
    return {"message": "User reactivated"}


@router.patch("/users/{user_id}/password")
async def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET hashed_password = %s WHERE id = %s",
                (_hash_password(payload.new_password), user_id),
            )
        conn.commit()
    return {"message": "Password updated"}
