from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.config import get_settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    if not plain:
        raise ValueError("password must not be empty")
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    return _pwd.verify(plain, hashed)


def create_access_token(subject: str, *, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError on any failure (expired, malformed, bad signature)."""
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
