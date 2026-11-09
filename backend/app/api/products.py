import random
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import require_section
from app.models import Category, ColorVariant, Product
from app.schemas.product import ProductIn, ProductOut, ProductUpdate
from app.services.slug_store import (
    PRODUCT,
    category_segment,
    forget_slug,
    remember_old_slug,
    resolve_product_by_slug,
    unique_product_slug,
)

router = APIRouter(prefix="/products", tags=["products"])


def _gen_sku() -> str:
    return f"RM{random.randint(10000, 99999)}"


def _to_out(product: Product, db: Session) -> ProductOut:
    cat: Category | None = None
    if product.category_id is not None:
        cat = db.get(Category, product.category_id)
    # Rows created before the slug migration ran have NULL — never 500 on them.
    if not product.slug:
        product.slug = unique_product_slug(db, product.name, exclude_id=product.id)
        db.commit()
    out = ProductOut.model_validate(product)
    out.category_name = cat.name if cat else None
    out.category_slug = category_segment(cat)
    return out


def _replace_variants(product: Product, variants_in) -> None:
    product.color_variants.clear()
    for idx, v in enumerate(variants_in):
        product.color_variants.append(
            ColorVariant(
                hex=v.hex,
                name=v.name,
                image=v.image,
                photos=list(v.photos or []),
                sort_order=v.sort_order if v.sort_order is not None else idx,
            )
        )


# ─── Read (public) ───────────────────────────────────────────────────────


@router.get("", response_model=list[ProductOut])
def list_products(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    category_id: int | None = Query(default=None),
    in_stock_only: bool = Query(default=False),
    q: str | None = Query(default=None, description="Search by name/sku"),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """List products WITHOUT per-color photo arrays.

    The catalog only renders thumbnails (`main_image` + first variant image),
    so shipping every base64 photo (admin can attach up to 35 per colour, often
    several MB each) on every page load is wasteful and breaks the storefront
    once it has more than a handful of products with rich galleries. Full
    photo arrays are only returned by `GET /products/{id}` when the customer
    actually opens a product detail page.
    """
    stmt = select(Product).options(selectinload(Product.color_variants)).order_by(Product.created_at.desc())
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if in_stock_only:
        stmt = stmt.where(Product.in_stock.is_(True))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where((Product.name.ilike(like)) | (Product.sku.ilike(like)))
    stmt = stmt.limit(limit).offset(offset)
    rows = db.execute(stmt).scalars().all()

    out = [_to_out(p, db) for p in rows]
    for product_out in out:
        for variant in product_out.color_variants:
            variant.photos = []  # stripped — fetch /products/{id} for the full gallery

    # Tiny client-side cache buys breathing room when many users hit /catalog
    # simultaneously. 30 s is short enough that admin edits propagate quickly.
    response.headers["Cache-Control"] = "public, max-age=30"
    return out


@router.get("/by-slug/{slug}", response_model=ProductOut)
def get_product_by_slug(
    slug: str,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
):
    """Resolve `/catalog/<category>/<slug>`. Old slugs (renamed products) still
    resolve; the response then carries the CURRENT slug and an
    `X-Slug-Moved: 1` header so the caller can replace the URL (301 semantics)."""
    product, moved = resolve_product_by_slug(db, slug)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    # Re-select with the gallery loaded (resolve() returns a bare row).
    product = db.execute(
        select(Product)
        .options(selectinload(Product.color_variants))
        .where(Product.id == product.id)
    ).scalar_one()
    if moved:
        response.headers["X-Slug-Moved"] = "1"
    return _to_out(product, db)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Annotated[Session, Depends(get_db)]):
    p = db.execute(
        select(Product)
        .options(selectinload(Product.color_variants))
        .where(Product.id == product_id)
    ).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return _to_out(p, db)


# ─── Write (admin / staff with `products` section) ───────────────────────


@router.post(
    "",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_section("products"))],
)
def create_product(payload: ProductIn, db: Annotated[Session, Depends(get_db)]):
    if payload.category_id is not None and db.get(Category, payload.category_id) is None:
        raise HTTPException(status_code=400, detail="Unknown category_id")

    product = Product(
        name=payload.name.strip(),
        slug=unique_product_slug(db, payload.name),
        sku=(payload.sku or _gen_sku()).strip(),
        price=payload.price,
        purchase_price=payload.purchase_price,
        main_image=payload.main_image,
        description=payload.description,
        category_id=payload.category_id,
        dimensions=payload.dimensions,
        weight=payload.weight,
        material=payload.material,
        in_stock=payload.in_stock,
        quantity=payload.quantity,
    )
    _replace_variants(product, payload.color_variants)
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="SKU already exists")
    db.refresh(product)
    return _to_out(product, db)


@router.patch(
    "/{product_id}",
    response_model=ProductOut,
    dependencies=[Depends(require_section("products"))],
)
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    product = db.execute(
        select(Product)
        .options(selectinload(Product.color_variants))
        .where(Product.id == product_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.category_id is not None and db.get(Category, payload.category_id) is None:
        raise HTTPException(status_code=400, detail="Unknown category_id")

    data = payload.model_dump(exclude_unset=True)
    variants = data.pop("color_variants", None)
    new_name = data.get("name")
    for k, v in data.items():
        setattr(product, k, v)
    if variants is not None:
        _replace_variants(product, payload.color_variants or [])

    # Renamed → new slug, old one kept in slug_history so printed links live on.
    if new_name is not None and new_name.strip():
        candidate = unique_product_slug(db, new_name, exclude_id=product.id)
        if candidate != product.slug:
            remember_old_slug(db, PRODUCT, product.slug, product.id)
            forget_slug(db, PRODUCT, candidate)  # A→B→A: take A back cleanly
            product.slug = candidate

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="SKU already exists")
    db.refresh(product)
    return _to_out(product, db)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_section("products"))],
)
def delete_product(product_id: str, db: Annotated[Session, Depends(get_db)]):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return None
