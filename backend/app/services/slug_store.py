"""DB-side slug helpers: uniqueness against live rows + rename history.

Pure string rules live in services/slug.py; this module knows the tables.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Product, SlugHistory
from app.services.slug import RESERVED_CATEGORY_SLUGS, make_unique, slugify

PRODUCT = "product"
CATEGORY = "category"

# Products without a category live under this pseudo category segment:
# /catalog/tovary/<product-slug>. Reserved so no real category can take it.
UNCATEGORIZED_SEGMENT = "tovary"


def _product_slug_taken(db: Session, slug: str, *, exclude_id: str | None) -> bool:
    stmt = select(Product.id).where(Product.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Product.id != exclude_id)
    return db.execute(stmt.limit(1)).first() is not None


def _category_slug_taken(db: Session, slug: str, *, exclude_id: int | None) -> bool:
    if slug in RESERVED_CATEGORY_SLUGS:
        return True
    stmt = select(Category.id).where(Category.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    return db.execute(stmt.limit(1)).first() is not None


def unique_product_slug(db: Session, name: str, *, exclude_id: str | None = None) -> str:
    return make_unique(
        slugify(name, fallback="tovar"),
        lambda s: _product_slug_taken(db, s, exclude_id=exclude_id),
    )


def unique_category_slug(db: Session, name: str, *, exclude_id: int | None = None) -> str:
    return make_unique(
        slugify(name, fallback="razdel"),
        lambda s: _category_slug_taken(db, s, exclude_id=exclude_id),
    )


def remember_old_slug(db: Session, entity: str, old_slug: str | None, target_id: str | int) -> None:
    """Keep `old_slug` resolvable after a rename. Idempotent: an old slug that
    is re-recorded just repoints to the latest target."""
    if not old_slug:
        return
    row = db.execute(
        select(SlugHistory).where(SlugHistory.entity == entity, SlugHistory.slug == old_slug)
    ).scalar_one_or_none()
    if row is None:
        db.add(SlugHistory(entity=entity, slug=old_slug, target_id=str(target_id)))
    else:
        row.target_id = str(target_id)


def forget_slug(db: Session, entity: str, slug: str) -> None:
    """When an item takes a slug back (rename A→B→A) the history row for A
    must go, or the unique lookup would be ambiguous."""
    db.execute(
        SlugHistory.__table__.delete().where(SlugHistory.entity == entity, SlugHistory.slug == slug)
    )


def resolve_product_by_slug(db: Session, slug: str) -> tuple[Product | None, bool]:
    """Returns (product, moved). `moved` is True when `slug` is an old one and
    the caller should redirect to `product.slug`."""
    p = db.execute(select(Product).where(Product.slug == slug)).scalar_one_or_none()
    if p is not None:
        return p, False
    hist = db.execute(
        select(SlugHistory).where(SlugHistory.entity == PRODUCT, SlugHistory.slug == slug)
    ).scalar_one_or_none()
    if hist is None:
        return None, False
    return db.get(Product, hist.target_id), True


def resolve_category_by_slug(db: Session, slug: str) -> tuple[Category | None, bool]:
    c = db.execute(select(Category).where(Category.slug == slug)).scalar_one_or_none()
    if c is not None:
        return c, False
    hist = db.execute(
        select(SlugHistory).where(SlugHistory.entity == CATEGORY, SlugHistory.slug == slug)
    ).scalar_one_or_none()
    if hist is None:
        return None, False
    try:
        return db.get(Category, int(hist.target_id)), True
    except ValueError:
        return None, False


def category_segment(category: Category | None) -> str:
    return (category.slug if category and category.slug else None) or UNCATEGORIZED_SEGMENT
