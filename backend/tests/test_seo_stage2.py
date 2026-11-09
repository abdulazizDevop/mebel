"""Stage 2 of the SEO work: server-rendered HTML, redirects, sitemap, robots."""
import json
import re

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from tests.conftest import unique_name


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _grant(db: Session, name: str = "owner-test") -> None:
    user = db.query(User).filter(User.name == name).first()
    user.sections = ["products", "categories", "dashboard", "orders", "settings"]
    db.commit()


def _jsonld(html: str) -> list[dict]:
    return [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)]


def _seed(client: TestClient, token: str) -> tuple[dict, dict]:
    cat = client.post("/categories", json={"name": unique_name("Шкафы рендер")}, headers=_auth(token)).json()
    product = client.post(
        "/products",
        json={
            "name": "Шкаф «Милан» 3 двери",
            "price": 32500,
            "main_image": "https://s3.example.com/rooomebel/milan.jpg",
            "description": "Распашной шкаф с зеркалом, <b>ЛДСП</b> Egger.",
            "category_id": cat["id"],
            "dimensions": "220 × 60 × 180 см",
            "material": "ЛДСП",
            "color_variants": [
                {"hex": "#ffffff", "image": "https://s3.example.com/rooomebel/milan.jpg", "photos": []},
                {"hex": "#333333", "image": "https://s3.example.com/rooomebel/milan-dark.jpg", "photos": []},
            ],
        },
        headers=_auth(token),
    ).json()
    return cat, product


def test_product_page_renders_meta_jsonld_and_content(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    cat, product = _seed(client, admin_token)
    path = f"/catalog/{cat['slug']}/{product['slug']}"

    res = client.get(f"/_render{path}")
    assert res.status_code == 200, res.text
    html = res.text
    assert "<title>Шкаф «Милан» 3 двери — купить в Дагестане за 32" in html
    assert f'<link rel="canonical" href="https://rooomebel.ru{path}" />' in html
    assert '<meta property="og:type" content="product" />' in html
    assert 'og:image" content="https://s3.example.com/rooomebel/milan.jpg"' in html
    assert 'name="robots" content="index, follow' in html
    assert res.headers["X-Robots-Tag"].startswith("index")
    # Server-rendered body inside #root, description HTML-escaped (no injection).
    assert '<div id="root"><div class="min-h-screen' in html
    assert "<h1" in html and "Шкаф «Милан» 3 двери</h1>" in html
    assert "&lt;b&gt;ЛДСП&lt;/b&gt;" in html and "<b>ЛДСП</b>" not in html
    # Структурированные данные: Product + BreadcrumbList + FurnitureStore
    types = {d["@type"] for d in _jsonld(html)}
    assert {"Product", "BreadcrumbList", "FurnitureStore"} <= types
    prod = next(d for d in _jsonld(html) if d["@type"] == "Product")
    assert prod["offers"]["price"] == "32500" and prod["offers"]["priceCurrency"] == "RUB"
    assert prod["brand"]["name"] == "ROOOMEBEL"
    assert len(prod["image"]) == 2
    store = next(d for d in _jsonld(html) if d["@type"] == "FurnitureStore")
    assert store["address"]["addressRegion"] == "Республика Дагестан"


def test_category_catalog_and_home_render(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    cat, product = _seed(client, admin_token)

    res = client.get(f"/_render/catalog/{cat['slug']}")
    assert res.status_code == 200
    assert f"<title>{cat['name']} на заказ в Дагестане" in res.text
    assert f"/catalog/{cat['slug']}/{product['slug']}" in res.text
    assert any(d["@type"] == "ItemList" for d in _jsonld(res.text))

    res = client.get("/_render/catalog")
    assert res.status_code == 200 and "Каталог мебели на заказ" in res.text

    res = client.get("/_render/")
    assert res.status_code == 200
    assert "Мебель на заказ в Дагестане</h1>" in res.text
    assert any(d["@type"] == "WebSite" for d in _jsonld(res.text))

    res = client.get("/_render/catalog/individualnyy-zakaz")
    assert res.status_code == 200 and "индивидуальным размерам" in res.text


def test_redirects_for_legacy_and_moved_urls(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    cat, product = _seed(client, admin_token)
    canonical = f"/catalog/{cat['slug']}/{product['slug']}"

    # Old /product/<uuid> link → 301 to the slug URL (query string preserved).
    res = client.get(f"/_render/product/{product['id']}?utm_source=qr", follow_redirects=False)
    assert res.status_code == 301
    assert res.headers["location"] == canonical + "?utm_source=qr"

    # Wrong category segment → 301 to canonical.
    res = client.get(f"/_render/catalog/wrong/{product['slug']}", follow_redirects=False)
    assert res.status_code == 301 and res.headers["location"] == canonical

    # Rename → old slug keeps working with a 301.
    renamed = client.patch(f"/products/{product['id']}", json={"name": "Шкаф «Милан» 4 двери"}, headers=_auth(admin_token)).json()
    res = client.get(f"/_render{canonical}", follow_redirects=False)
    assert res.status_code == 301
    assert res.headers["location"] == f"/catalog/{cat['slug']}/{renamed['slug']}"

    # Unknown → 404 page, noindex.
    res = client.get("/_render/catalog/net/takogo")
    assert res.status_code == 404 and "noindex" in res.headers["X-Robots-Tag"]


def test_private_pages_are_noindex(client: TestClient):
    for path in ("/_render/order", "/_render/admin", "/_render/chat", "/_render/profile"):
        res = client.get(path)
        assert res.status_code == 200
        assert 'content="noindex, nofollow"' in res.text


def test_sitemap_and_robots(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    cat, product = _seed(client, admin_token)

    res = client.get("/sitemap.xml")
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/xml")
    assert f"<loc>https://rooomebel.ru/catalog/{cat['slug']}/{product['slug']}</loc>" in res.text
    assert f"<loc>https://rooomebel.ru/catalog/{cat['slug']}</loc>" in res.text
    assert "<loc>https://rooomebel.ru/privacy</loc>" in res.text
    assert "<image:loc>https://s3.example.com/rooomebel/milan.jpg</image:loc>" in res.text
    assert "/order" not in res.text and "/admin" not in res.text

    res = client.get("/robots.txt")
    assert res.status_code == 200
    assert "Sitemap: https://rooomebel.ru/sitemap.xml" in res.text
    assert "Disallow: /admin" in res.text and "Clean-param: utm_source" in res.text


def test_verification_tokens_from_admin_settings(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    res = client.put(
        "/admin/settings/seo",
        json={"seo_yandex_verification": "ya123", "seo_google_verification": "g456", "seo_geo": "43.25,46.58",
              "seo_social_links": "https://t.me/rooomebel\nhttps://instagram.com/rooomebel"},
        headers=_auth(admin_token),
    )
    assert res.status_code == 200, res.text
    html = client.get("/_render/").text
    assert '<meta name="yandex-verification" content="ya123" />' in html
    assert '<meta name="google-site-verification" content="g456" />' in html
    store = next(d for d in _jsonld(html) if d["@type"] == "FurnitureStore")
    assert store["geo"]["latitude"] == 43.25 and store["sameAs"] == ["https://t.me/rooomebel", "https://instagram.com/rooomebel"]
    # Anonymous callers cannot read or change SEO settings.
    assert client.get("/admin/settings/seo").status_code == 401
