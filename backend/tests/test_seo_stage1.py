"""Stage 1 of the SEO/ads work: slugs, slug history, order attribution,
per-campaign report."""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AnalyticsEvent, AnalyticsType, Order, User
from app.services.slug import make_unique, slugify
from tests.conftest import unique_name


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _grant(db: Session, name: str = "owner-test") -> None:
    user = db.query(User).filter(User.name == name).first()
    user.sections = ["products", "categories", "dashboard", "orders"]
    db.commit()


def _product_body(name: str, category_id: int | None = None) -> dict:
    return {
        "name": name,
        "price": 18000,
        "main_image": "https://example.com/a.jpg",
        "category_id": category_id,
        "color_variants": [{"hex": "#cccccc", "image": "https://example.com/a.jpg", "photos": []}],
    }


# ─── pure slug rules ────────────────────────────────────────────────────


def test_slugify_transliterates_russian_names():
    assert slugify('Кровать "Турция 160 И 180"') == "krovat-turtsiya-160-i-180"
    assert slugify("Тв «Рим150»") == "tv-rim150"
    assert slugify("Обувница Джасмин, щётка") == "obuvnitsa-dzhasmin-schyotka"
    assert slugify("!!!", fallback="tovar") == "tovar"


def test_make_unique_adds_counter():
    taken = {"krovati", "krovati-2"}
    assert make_unique("krovati", taken.__contains__) == "krovati-3"
    assert make_unique("komody", taken.__contains__) == "komody"


# ─── API ────────────────────────────────────────────────────────────────


def test_category_and_product_get_slugs_and_resolve_by_slug(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    cat = client.post("/categories", json={"name": "Кровати тест"}, headers=_auth(admin_token))
    assert cat.status_code == 201, cat.text
    assert cat.json()["slug"] == "krovati-test"

    p1 = client.post("/products", json=_product_body("Кровать Овал", cat.json()["id"]), headers=_auth(admin_token))
    p2 = client.post("/products", json=_product_body("Кровать Овал", cat.json()["id"]), headers=_auth(admin_token))
    assert p1.status_code == 201 and p2.status_code == 201
    assert p1.json()["slug"] == "krovat-oval"
    assert p2.json()["slug"] == "krovat-oval-2"  # duplicate name → suffix
    assert p1.json()["category_slug"] == "krovati-test"

    by_slug = client.get("/products/by-slug/krovat-oval")
    assert by_slug.status_code == 200
    assert by_slug.json()["id"] == p1.json()["id"]
    assert "X-Slug-Moved" not in by_slug.headers

    by_cat = client.get("/categories/by-slug/krovati-test")
    assert by_cat.status_code == 200 and by_cat.json()["id"] == cat.json()["id"]

    assert client.get("/products/by-slug/net-takogo").status_code == 404


def test_rename_keeps_old_slug_alive(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    created = client.post("/products", json=_product_body("Комод Венеция"), headers=_auth(admin_token)).json()
    assert created["slug"] == "komod-venetsiya"
    assert created["category_slug"] == "tovary"  # no category → pseudo segment

    renamed = client.patch(
        f"/products/{created['id']}", json={"name": "Комод Венеция 120"}, headers=_auth(admin_token)
    )
    assert renamed.status_code == 200
    assert renamed.json()["slug"] == "komod-venetsiya-120"

    old = client.get("/products/by-slug/komod-venetsiya")
    assert old.status_code == 200
    assert old.json()["id"] == created["id"]
    assert old.headers.get("X-Slug-Moved") == "1"
    assert old.json()["slug"] == "komod-venetsiya-120"

    # Rename back: the slug is taken back, no stale history row blocks it.
    back = client.patch(f"/products/{created['id']}", json={"name": "Комод Венеция"}, headers=_auth(admin_token))
    assert back.json()["slug"] == "komod-venetsiya"
    assert client.get("/products/by-slug/komod-venetsiya").headers.get("X-Slug-Moved") is None


def test_order_stores_attribution_and_campaign_report(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    product = client.post("/products", json=_product_body("Стол тестовый"), headers=_auth(admin_token)).json()

    marks = {"utm_source": "yandex", "utm_medium": "cpc", "utm_campaign": "krovati-dagestan", "yclid": "123"}
    # Two visitors from the campaign, one direct.
    for sid in ("s1", "s2"):
        client.post("/analytics/events", json={"type": "visit", "session_id": sid, "data": marks})
    client.post("/analytics/events", json={"type": "visit", "session_id": "s3", "data": {}})
    client.post("/analytics/events", json={"type": "visit", "session_id": "s1", "data": marks})  # repeat visit

    res = client.post(
        "/orders",
        json={
            "customer_name": unique_name("Клиент"),
            "customer_phone": "+79280000000",
            "items": [{"product_id": product["id"], "qty": 1}],
            "terms_accepted": True,
            "attribution": {**marks, "landing_page": "/catalog/krovati?utm_source=yandex"},
        },
    )
    assert res.status_code == 201, res.text
    order = db.get(Order, res.json()["id"])
    assert order.utm_campaign == "krovati-dagestan" and order.yclid == "123"
    assert order.landing_page.startswith("/catalog/krovati")

    # Custom order without marks lands in the "no marks" bucket.
    res2 = client.post(
        "/orders",
        json={
            "customer_name": unique_name("Клиент"),
            "customer_phone": "+79280000001",
            "items": [],
            "note": "Шкаф 2м",
            "terms_accepted": True,
            "personal_data_consent": True,
        },
    )
    assert res2.status_code == 201, res2.text

    report = client.get("/stats/campaigns?period=month", headers=_auth(admin_token))
    assert report.status_code == 200, report.text
    body = report.json()
    rows = {r["key"]: r for r in body["rows"]}
    camp = rows["yandex|cpc|krovati-dagestan"]
    assert camp["visitors"] == 2  # s1 counted once despite two visits
    assert camp["orders"] == 1 and camp["custom_orders"] == 0
    assert camp["revenue"] == 18000.0
    assert camp["conversion_pct"] == 50.0
    # Other suites also place unmarked orders in the shared test DB → ≥ 1.
    assert rows["__direct__"]["custom_orders"] >= 1
    assert rows["__direct__"]["utm_source"] is None
    assert body["best_key"] == "yandex|cpc|krovati-dagestan"
    assert body["total_orders"] >= 2

    # Report is admin-only.
    assert client.get("/stats/campaigns").status_code == 401

    db.query(AnalyticsEvent).filter(AnalyticsEvent.type == AnalyticsType.visit).delete()
    db.commit()
