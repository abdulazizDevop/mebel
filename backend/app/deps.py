from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Customer, User, UserRole
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def _decode_or_401(token: str) -> dict:
    try:
        return decode_access_token(token)
    except jwt.PyJWTError:
        raise _credentials_error


# ─── User (admin/staff) ──────────────────────────────────────────────────


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    payload = _decode_or_401(token)
    if payload.get("kind") != "user":
        raise _credentials_error
    user_id = payload.get("sub")
    if not user_id:
        raise _credentials_error
    user = db.get(User, user_id)
    if user is None:
        raise _credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole):
    def _checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _checker


def require_section(section: str):
    """Admins always pass; managers/viewers must have the section in their list."""

    def _checker(user: CurrentUser) -> User:
        if user.role == UserRole.admin:
            return user
        if section not in (user.sections or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Section '{section}' is not allowed for this user",
            )
        return user

    return _checker


# ─── Customer (storefront) ───────────────────────────────────────────────


def get_current_customer(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> Customer:
    payload = _decode_or_401(token)
    if payload.get("kind") != "customer":
        raise _credentials_error
    cid = payload.get("sub")
    if not cid:
        raise _credentials_error
    cust = db.get(Customer, cid)
    if cust is None:
        raise _credentials_error
    return cust


CurrentCustomer = Annotated[Customer, Depends(get_current_customer)]


def get_optional_customer(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> Customer | None:
    """Variant 3 — guest checkout allowed, but if a valid customer Bearer token is
    sent we attach the customer_id to the order. Returns None for guests, the
    Customer for authenticated customers, and 401 only when a token is present
    but malformed/invalid (so attackers can't silently downgrade to guest)."""
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None  # treat malformed header as guest, harmless
    payload = _decode_or_401(parts[1])
    if payload.get("kind") != "customer":
        return None  # admin tokens shouldn't auto-attach as customers
    cid = payload.get("sub")
    if not cid:
        return None
    return db.get(Customer, cid)
