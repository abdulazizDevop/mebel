"""Admin user management — sub-admins, managers, viewers.

Only the `admin` role can list / create / mutate other staff users; managers
and viewers can't see this resource at all. The current admin can't delete
themselves (would lock the dashboard out for the whole team).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, require_role
from app.models import User, UserRole
from app.schemas.admin_user import AdminUserCreateIn, AdminUserOut, AdminUserUpdateIn
from app.security import hash_password

router = APIRouter(
    prefix="/admin/users",
    tags=["admin-users"],
    dependencies=[Depends(require_role(UserRole.admin))],
)


@router.get("", response_model=list[AdminUserOut])
def list_users(db: Annotated[Session, Depends(get_db)]):
    return db.execute(select(User).order_by(User.created_at.desc())).scalars().all()


@router.post("", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreateIn, db: Annotated[Session, Depends(get_db)]):
    user = User(
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        # Admin role implicitly has every section; explicit list is only
        # meaningful for manager/viewer.
        sections=[] if payload.role == UserRole.admin else list(payload.sections),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="User with this name already exists")
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: str,
    payload: AdminUserUpdateIn,
    db: Annotated[Session, Depends(get_db)],
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.role is not None:
        user.role = payload.role
        # Admin role implicitly sees every section — clear the explicit list
        # so we don't accidentally leave a stale subset around.
        if payload.role == UserRole.admin:
            user.sections = []
    if payload.sections is not None and user.role != UserRole.admin:
        user.sections = list(payload.sections)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="User with this name already exists")
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    me: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if user_id == me.id:
        # The acting admin must keep at least themselves around — otherwise
        # nobody can log into /admin afterwards.
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return None
