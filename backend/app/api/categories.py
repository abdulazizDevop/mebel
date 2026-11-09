from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, require_section
from app.models import Category
from app.schemas.category import CategoryIn, CategoryOut, CategoryUpdate
from app.services import indexnow
from app.services.slug_store import (
    CATEGORY,
    forget_slug,
    remember_old_slug,
    resolve_category_by_slug,
    unique_category_slug,
)

router = APIRouter(prefix="/categories", tags=["categories"])


def _ensure_slug(cat: Category, db: Session) -> Category:
    # Rows created before the slug migration have NULL — fill lazily, never 500.
    if not cat.slug:
        cat.slug = unique_category_slug(db, cat.name, exclude_id=cat.id)
        db.commit()
    return cat


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Annotated[Session, Depends(get_db)]):
    """Public — used by storefront and admin."""
    rows = db.execute(select(Category).order_by(Category.sort_order, Category.name)).scalars().all()
    return [_ensure_slug(c, db) for c in rows]


@router.get("/by-slug/{slug}", response_model=CategoryOut)
def get_category_by_slug(
    slug: str,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
):
    """Resolve `/catalog/<slug>`; renamed categories resolve through
    slug_history and set `X-Slug-Moved: 1` (caller replaces the URL)."""
    cat, moved = resolve_category_by_slug(db, slug)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if moved:
        response.headers["X-Slug-Moved"] = "1"
    return _ensure_slug(cat, db)


@router.post(
    "",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_section("categories"))],
)
def create_category(payload: CategoryIn, db: Annotated[Session, Depends(get_db)]):
    name = payload.name.strip()
    cat = Category(name=name, slug=unique_category_slug(db, name), sort_order=payload.sort_order)
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category with this name already exists")
    db.refresh(cat)
    indexnow.notify_category(db, cat)
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
    old_path = indexnow.category_path(cat) if cat.slug else None
    if payload.name is not None:
        cat.name = payload.name.strip()
        candidate = unique_category_slug(db, cat.name, exclude_id=cat.id)
        if candidate != cat.slug:
            remember_old_slug(db, CATEGORY, cat.slug, cat.id)
            forget_slug(db, CATEGORY, candidate)
            cat.slug = candidate
    if payload.sort_order is not None:
        cat.sort_order = payload.sort_order
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category with this name already exists")
    db.refresh(cat)
    indexnow.notify_category(db, cat, old_path=old_path if old_path != indexnow.category_path(cat) else None)
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
