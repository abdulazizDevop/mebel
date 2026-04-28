from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, require_section
from app.models import Category
from app.schemas.category import CategoryIn, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Annotated[Session, Depends(get_db)]):
    """Public — used by storefront and admin."""
    rows = db.execute(select(Category).order_by(Category.sort_order, Category.name)).scalars().all()
    return rows


@router.post(
    "",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_section("categories"))],
)
def create_category(payload: CategoryIn, db: Annotated[Session, Depends(get_db)]):
    cat = Category(name=payload.name.strip(), sort_order=payload.sort_order)
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category with this name already exists")
    db.refresh(cat)
    return cat


@router.patch(
    "/{category_id}",
    response_model=CategoryOut,
    dependencies=[Depends(require_section("categories"))],
)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    cat = db.get(Category, category_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.name is not None:
        cat.name = payload.name.strip()
    if payload.sort_order is not None:
        cat.sort_order = payload.sort_order
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category with this name already exists")
    db.refresh(cat)
    return cat


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_section("categories"))],
)
def delete_category(
    category_id: int,
    db: Annotated[Session, Depends(get_db)],
    _user: CurrentUser,
):
    cat = db.get(Category, category_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return None
