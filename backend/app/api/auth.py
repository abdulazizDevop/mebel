from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import CurrentUser
from app.models import User
from app.rate_limit import limiter
from app.schemas.auth import TokenResponse, UserOut
from app.security import create_access_token, hash_password, verify_password


class PasswordChangeIn(BaseModel):
    current_password: str
    new_name: str | None = Field(default=None, min_length=1, max_length=120)
    new_password: str = Field(min_length=4, max_length=255)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")  # 10 login attempts per IP per minute — slows brute force
def login(
    request: Request,  # required positional arg for the slowapi decorator to find the client IP
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    """Login as an admin/staff user. `username` is the user `name`."""
    user = db.execute(select(User).where(User.name == form.username)).scalar_one_or_none()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid name or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    settings = get_settings()
    token = create_access_token(user.id, extra={"kind": "user", "role": user.role.value})
    return TokenResponse(access_token=token, expires_in_minutes=settings.jwt_expire_minutes)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/me/password", response_model=UserOut)
def change_password(
    payload: PasswordChangeIn,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Change the current user's password (and optionally rename them).

    Requires the current password — defence against a stolen JWT used to
    permanently lock the real owner out.
    """
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    if payload.new_name and payload.new_name.strip() != user.name:
        # Guard against duplicate names.
        new_name = payload.new_name.strip()
        clash = db.execute(select(User).where(User.name == new_name, User.id != user.id)).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail="A user with this name already exists")
        user.name = new_name
    db.commit()
    db.refresh(user)
    return user
