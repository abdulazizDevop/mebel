"""Turn a storefront path into a renderable page: <head> metadata, JSON-LD and
server-rendered body HTML, or a 301 / 404.

This is what search engines (Яндекс, Google), messengers (WhatsApp/Telegram
link previews) and the first paint see. The React app takes over in the
browser and re-renders the same content, so humans and bots get one HTML.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Category, Product
from app.seo import site
from app.services.slug import CUSTOM_ORDER_SEGMENT
from app.services.slug_store import (
    UNCATEGORIZED_SEGMENT,
    category_segment,
    resolve_category_by_slug,
    resolve_product_by_slug,
)

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).resolve().parent / "templates")),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)

LEGAL_PAGES: dict[str, str] = {
    "requisites": "Реквизиты Rooomebel",
    "privacy": "Политика в отношении обработки персональных данных",
    "personal-data-consent": "Согласие на обработку персональных данных",
    "cookies": "Политика использования cookie",
    "marketing-consent": "Согласие на получение рекламных сообщений",
    "offer": "Условия дистанционной продажи товаров Rooomebel",
    "delivery-payment": "Оплата и доставка",
    "returns": "Возврат, обмен и претензии",
}

# SPA-only screens: served with the shell, but kept out of the index.
PRIVATE_PREFIXES = ("/order", "/chat", "/profile", "/admin", "/favorites")

INDEX = "index, follow, max-image-preview:large"
NOINDEX = "noindex, nofollow"


@dataclass
class Page:
    title: str
    description: str
    canonical_path: str
    body_html: str = ""
    robots: str = INDEX
    og_type: str = "website"
    og_image: str = ""
    jsonld: list[dict] = field(default_factory=list)
    status: int = 200
    redirect: str | None = None
    extra_head: str = ""


# ─── helpers ────────────────────────────────────────────────────────────


def _price(value) -> str:
    try:
        n = int(Decimal(str(value)))
    except Exception:  # noqa: BLE001
        return str(value)
    return f"{n:,}".replace(",", " ")


def _clip(text: str, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", (text or "")).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut[-25:]:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,.;:—-") + "…"


def _product_path(product: Product, category: Category | None) -> str:
    return f"/catalog/{category_segment(category)}/{product.slug}"


def _category_path(category: Category) -> str:
    return f"/catalog/{category.slug}"


def _render(template: str, **ctx) -> str:
    base = {
        "site_name": site.SITE_NAME,
        "site_url": site.site_url(),
        "region": site.REGION_SHORT,
        "city": site.CITY,
        "price": _price,
        "custom_order_path": f"/catalog/{CUSTOM_ORDER_SEGMENT}",
        "legal_pages": LEGAL_PAGES,
    }
    base.update(ctx)
    return _env.get_template(template).render(**base)


def _common(db: Session) -> dict:
    seo = site.get_seo_config(db)
    phones = site.contact_digits(db)
    categories = db.execute(select(Category).order_by(Category.sort_order, Category.name)).scalars().all()
    return {
        "seo": seo,
        "phone_digits": phones["call"],
        "phone_display": site.format_phone(phones["call"]),
        "whatsapp_digits": phones["whatsapp"],
        "categories": [(c.name, _category_path(c)) for c in categories if c.slug],
        "operator_name": site.OPERATOR_NAME,
        "operator_inn": site.OPERATOR_INN,
        "operator_email": site.OPERATOR_EMAIL,
        "address": f"{site.REGION}, {seo.get('seo_locality') or site.DEFAULT_LOCALITY}, "
        f"{seo.get('seo_street_address') or site.DEFAULT_STREET}",
    }


def _product_jsonld(product: Product, category: Category | None, path: str) -> dict:
    images = [product.main_image] + [
        v.image for v in product.color_variants if v.image and v.image != product.main_image
    ]
    availability = "https://schema.org/InStock" if product.in_stock else "https://schema.org/OutOfStock"
    data: dict = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "image": images[:8],
        "description": _clip(product.description or product.name, 500),
        "sku": product.sku,
        "brand": {"@type": "Brand", "name": site.SITE_NAME},
        "url": site.absolute(path),
        "offers": {
            "@type": "Offer",
            "url": site.absolute(path),
            "priceCurrency": "RUB",
            "price": str(int(Decimal(str(product.price)))),
            "availability": availability,
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {"@id": f"{site.site_url()}/#organization"},
            "areaServed": site.REGION,
        },
    }
    if category:
        data["category"] = category.name
    if product.material:
        data["material"] = product.material
    return data


# ─── page builders ──────────────────────────────────────────────────────


def _home(db: Session) -> Page:
    common = _common(db)
    products = db.execute(
        select(Product)
        .options(selectinload(Product.color_variants))
        .where(Product.in_stock.is_(True))
        .order_by(Product.created_at.desc())
        .limit(8)
    ).scalars().all()
    cats_by_id = {c.id: c for c in db.execute(select(Category)).scalars().all()}
    intro = common["seo"].get("seo_home_intro") or site.DEFAULT_HOME_INTRO
    cards = [(p, _product_path(p, cats_by_id.get(p.category_id))) for p in products if p.slug]
    title = f"{site.SITE_NAME} — мебель на заказ в Дагестане: кровати, комоды, шкафы от производителя"
    description = _clip(intro)
    return Page(
        title=title,
        description=description,
        canonical_path="/",
        og_image=site.absolute("/icon-512.png"),
        body_html=_render("home.html", intro=intro, cards=cards, **common),
        jsonld=[site.organization_jsonld(db, common["seo"]), site.website_jsonld()],
    )


def _catalog(db: Session, category: Category | None) -> Page:
    common = _common(db)
    stmt = select(Product).options(selectinload(Product.color_variants)).order_by(Product.created_at.desc())
    if category is not None:
        stmt = stmt.where(Product.category_id == category.id)
    products = db.execute(stmt.limit(500)).scalars().all()
    cats_by_id = {c.id: c for c in db.execute(select(Category)).scalars().all()}
    cards = [(p, _product_path(p, category or cats_by_id.get(p.category_id))) for p in products if p.slug]

    if category is None:
        path = "/catalog"
        h1 = "Каталог мебели на заказ"
        title = f"Каталог мебели на заказ в Дагестане — {site.SITE_NAME}, {site.CITY}"
        names = ", ".join(n.lower() for n, _ in common["categories"][:6])
        description = _clip(f"Вся мебель Rooomebel: {names}. Собственное производство в Дагестане, "
                            f"изготовление по вашим размерам, доставка по республике.")
        crumbs = [("Главная", "/"), ("Каталог", "/catalog")]
    else:
        path = _category_path(category)
        h1 = category.name
        title = f"{category.name} на заказ в Дагестане — купить от производителя | {site.SITE_NAME}"
        prices = [Decimal(str(p.price)) for p in products if p.price]
        from_price = f" от {_price(min(prices))} ₽" if prices else ""
        description = _clip(
            f"{category.name}{from_price}: {len(products)} моделей от производителя Rooomebel. "
            f"Любые размеры и цвета, изготовление в Хасавюрте, доставка по Дагестану."
        )
        crumbs = [("Главная", "/"), ("Каталог", "/catalog"), (category.name, path)]

    item_list = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": h1,
        "numberOfItems": len(cards),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": p.name, "url": site.absolute(href)}
            for i, (p, href) in enumerate(cards[:50])
        ],
    }
    return Page(
        title=title,
        description=description,
        canonical_path=path,
        og_image=site.absolute(cards[0][0].main_image) if cards else site.absolute("/icon-512.png"),
        body_html=_render("catalog.html", h1=h1, description=description, cards=cards, crumbs=crumbs,
                          active_path=path, **common),
        jsonld=[site.breadcrumbs_jsonld(crumbs), item_list, site.organization_jsonld(db, common["seo"])],
    )


def _product(db: Session, product: Product) -> Page:
    common = _common(db)
    category = db.get(Category, product.category_id) if product.category_id else None
    path = _product_path(product, category)
    title = f"{product.name} — купить в Дагестане за {_price(product.price)} ₽ | {site.SITE_NAME}"
    description = _clip(
        f"{product.name} за {_price(product.price)} ₽ от производителя Rooomebel. "
        f"{product.description or ''} Изготовим по вашим размерам, доставка по Дагестану."
    )
    crumbs = [("Главная", "/"), ("Каталог", "/catalog")]
    if category:
        crumbs.append((category.name, _category_path(category)))
    crumbs.append((product.name, path))
    photos = [product.main_image] + [
        v.image for v in product.color_variants if v.image and v.image != product.main_image
    ]
    specs = []
    if product.dimensions:
        specs.append(("Размеры", product.dimensions))
    if product.material:
        specs.append(("Материал", product.material))
    if product.weight:
        specs.append(("Вес", product.weight))
    return Page(
        title=title,
        description=description,
        canonical_path=path,
        og_type="product",
        og_image=site.absolute(product.main_image),
        body_html=_render("product.html", product=product, category=category, photos=photos[:8],
                          specs=specs, crumbs=crumbs, **common),
        jsonld=[_product_jsonld(product, category, path), site.breadcrumbs_jsonld(crumbs),
                site.organization_jsonld(db, common["seo"])],
        extra_head=(
            f'<meta property="product:price:amount" content="{int(Decimal(str(product.price)))}" />'
            '<meta property="product:price:currency" content="RUB" />'
        ),
    )


def _custom_order(db: Session) -> Page:
    common = _common(db)
    path = f"/catalog/{CUSTOM_ORDER_SEGMENT}"
    title = f"Мебель по индивидуальным размерам на заказ в Дагестане | {site.SITE_NAME}"
    description = ("Изготовим кровать, шкаф, комод или кухню по вашим размерам и эскизу. "
                   "Собственное производство в Хасавюрте, расчёт стоимости бесплатно, доставка по Дагестану.")
    crumbs = [("Главная", "/"), ("Каталог", "/catalog"), ("Индивидуальный заказ", path)]
    return Page(
        title=title,
        description=description,
        canonical_path=path,
        body_html=_render("custom_order.html", crumbs=crumbs, description=description, **common),
        jsonld=[site.breadcrumbs_jsonld(crumbs), site.organization_jsonld(db, common["seo"])],
    )


def _legal(db: Session, slug: str) -> Page:
    common = _common(db)
    heading = LEGAL_PAGES[slug]
    path = f"/{slug}"
    return Page(
        title=f"{heading} | {site.SITE_NAME}",
        description=_clip(f"{heading}. Rooomebel, {site.OPERATOR_NAME}, ИНН {site.OPERATOR_INN}, {site.REGION}."),
        canonical_path=path,
        body_html=_render("legal.html", heading=heading, crumbs=[("Главная", "/"), (heading, path)], **common),
        jsonld=[site.breadcrumbs_jsonld([("Главная", "/"), (heading, path)])],
    )


def _generic(db: Session, path: str, title: str, *, status: int = 200) -> Page:
    common = _common(db)
    return Page(
        title=f"{title} | {site.SITE_NAME}",
        description=site.DEFAULT_HOME_INTRO,
        canonical_path=path,
        robots=NOINDEX,
        status=status,
        body_html=_render("generic.html", heading=title, **common),
    )


# ─── router ─────────────────────────────────────────────────────────────


def build_page(db: Session, path: str) -> Page:
    clean = "/" + path.strip("/")
    segments = [s for s in clean.split("/") if s]

    if not segments:
        return _home(db)

    if segments[0] == "catalog":
        if len(segments) == 1:
            return _catalog(db, None)
        if len(segments) == 2:
            if segments[1] == CUSTOM_ORDER_SEGMENT:
                return _custom_order(db)
            category, moved = resolve_category_by_slug(db, segments[1])
            if category is None:
                return _generic(db, clean, "Раздел не найден", status=404)
            if moved:
                return Page(title="", description="", canonical_path="", redirect=_category_path(category), status=301)
            return _catalog(db, category)
        if len(segments) == 3:
            product, moved = resolve_product_by_slug(db, segments[2])
            if product is None:
                return _generic(db, clean, "Товар не найден", status=404)
            category = db.get(Category, product.category_id) if product.category_id else None
            canonical = _product_path(product, category)
            if moved or canonical != clean:
                return Page(title="", description="", canonical_path="", redirect=canonical, status=301)
            return _product(db, product)
        return _generic(db, clean, "Страница не найдена", status=404)

    if segments[0] == "product" and len(segments) == 2:
        product = db.get(Product, segments[1])
        if product is None or not product.slug:
            return _generic(db, clean, "Товар не найден", status=404)
        category = db.get(Category, product.category_id) if product.category_id else None
        return Page(title="", description="", canonical_path="", redirect=_product_path(product, category), status=301)

    if len(segments) == 1 and segments[0] in LEGAL_PAGES:
        return _legal(db, segments[0])

    if clean.startswith(PRIVATE_PREFIXES):
        labels = {"/order": "Оформление заказа", "/chat": "Чат с магазином", "/profile": "Профиль",
                  "/admin": "Админ-панель", "/favorites": "Избранное"}
        label = next((v for k, v in labels.items() if clean.startswith(k)), "Rooomebel")
        return _generic(db, clean, label)

    return _generic(db, clean, "Страница не найдена", status=404)


def all_sitemap_entries(db: Session) -> list[dict]:
    """Public URLs for sitemap.xml: home, catalog, categories, products, legal."""
    entries: list[dict] = [
        {"loc": "/", "priority": "1.0", "changefreq": "weekly"},
        {"loc": "/catalog", "priority": "0.9", "changefreq": "weekly"},
        {"loc": f"/catalog/{CUSTOM_ORDER_SEGMENT}", "priority": "0.7", "changefreq": "monthly"},
    ]
    categories = db.execute(select(Category).order_by(Category.sort_order)).scalars().all()
    cats_by_id = {c.id: c for c in categories}
    for c in categories:
        if c.slug:
            entries.append({"loc": _category_path(c), "priority": "0.8", "changefreq": "weekly"})
    products = db.execute(select(Product).order_by(Product.created_at.desc())).scalars().all()
    for p in products:
        if not p.slug:
            continue
        entries.append({
            "loc": _product_path(p, cats_by_id.get(p.category_id)),
            "lastmod": p.updated_at.date().isoformat() if p.updated_at else None,
            "priority": "0.7",
            "changefreq": "monthly",
            "image": p.main_image,
            "image_title": p.name,
        })
    for slug in LEGAL_PAGES:
        entries.append({"loc": f"/{slug}", "priority": "0.3", "changefreq": "yearly"})
    return entries


def product_count(db: Session) -> int:
    return int(db.execute(select(func.count(Product.id))).scalar_one())


__all__ = ["Page", "build_page", "all_sitemap_entries", "product_count", "LEGAL_PAGES", "INDEX", "NOINDEX",
           "UNCATEGORIZED_SEGMENT"]
