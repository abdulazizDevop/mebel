"""Compliance autotests — one per item of ТЗ §34 (numbered in the test names).

Run:  cd backend && .venv/bin/python -m pytest
"""
import re
import subprocess

from conftest import REPO_ROOT, auth, register, unique_name

from app.legal import DOCUMENT_VERSIONS
from app.models import ConsentLog, Customer, Order

SRC = REPO_ROOT / "src"


def _create_product(client, admin_token) -> str:
    res = client.post(
        "/products",
        json={
            "name": "Тестовый стул",
            "price": 1000,
            "main_image": "https://example.invalid/chair.jpg",
            "in_stock": True,
            "quantity": 5,
            "color_variants": [],
        },
        headers=auth(admin_token),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _order_payload(product_id: str, **overrides):
    payload = {
        "customer_name": "Иван",
        "customer_phone": "+7 (999) 123-45-67",
        "items": [{"product_id": product_id, "qty": 1, "color_index": 0}],
        "terms_accepted": True,
        "marketing_consent": False,
        "request_id": "visitor-test-1",
    }
    payload.update(overrides)
    return payload


# 1. Majburiy roziliksiz registratsiya bloklanadi.
def test_01_registration_without_consent_is_blocked(client):
    res = client.post(
        "/auth/customer/register",
        json={"name": unique_name(), "password": "secret-pass-1", "personal_data_consent": False},
    )
    assert res.status_code == 400
    assert "согласие" in res.json()["detail"].lower()


# 2. Consent backend'da saqlanadi.
def test_02_consent_is_stored_server_side(client, db):
    name, _, _ = register(client)
    customer = db.query(Customer).filter(Customer.name == name).one()
    rows = db.query(ConsentLog).filter(ConsentLog.customer_id == customer.id).all()
    by_type = {r.consent_type: r for r in rows}
    assert by_type["personal_data"].status == "active"
    assert by_type["personal_data"].source_form == "register"
    assert by_type["personal_data"].document_version == DOCUMENT_VERSIONS["personal_data_consent"]
    assert by_type["personal_data"].created_at is not None


# 3. Checkbox default false (server default + every frontend form starts unchecked).
def test_03_consent_defaults_to_false(client):
    # Server: omitting the field == not consenting.
    res = client.post("/auth/customer/register", json={"name": unique_name(), "password": "secret-pass-1"})
    assert res.status_code == 400
    # Frontend: every consent state is initialised with `useState(false)`.
    for rel, states in {
        "pages/Profile.tsx": ["personalDataConsent", "marketingOptIn"],
        "components/CartSidebar.tsx": ["termsAccepted", "marketingConsent"],
        "pages/Catalog.tsx": ["personalDataConsent", "termsAccepted", "marketingConsent"],
    }.items():
        text = (SRC / rel).read_text(encoding="utf-8")
        for state in states:
            assert re.search(rf"\[{state},\s*set\w+\]\s*=\s*useState\(false\)", text), f"{rel}: {state} must start false"
    checkbox = (SRC / "components/ConsentCheckbox.tsx").read_text(encoding="utf-8")
    assert "defaultChecked" not in checkbox


# 4. Marketing checkbox alohida.
def test_04_marketing_consent_is_separate(client, db):
    name_no, _, _ = register(client, marketing=False)
    name_yes, _, _ = register(client, marketing=True)
    c_no = db.query(Customer).filter(Customer.name == name_no).one()
    c_yes = db.query(Customer).filter(Customer.name == name_yes).one()
    assert c_no.marketing_allowed is False
    assert c_yes.marketing_allowed is True
    m_no = db.query(ConsentLog).filter(ConsentLog.customer_id == c_no.id, ConsentLog.consent_type == "marketing").one()
    m_yes = db.query(ConsentLog).filter(ConsentLog.customer_id == c_yes.id, ConsentLog.consent_type == "marketing").one()
    assert m_no.status == "denied" and m_yes.status == "active"
    # personal-data consent is unaffected by the marketing choice
    for cid in (c_no.id, c_yes.id):
        pd = db.query(ConsentLog).filter(ConsentLog.customer_id == cid, ConsentLog.consent_type == "personal_data").one()
        assert pd.status == "active"


# 5. Marketing'dan voz kechish buyurtmani bloklamaydi (terms is what blocks).
def test_05_marketing_opt_out_does_not_block_order(client, admin_token, db):
    pid = _create_product(client, admin_token)
    ok = client.post("/orders", json=_order_payload(pid, marketing_consent=False))
    assert ok.status_code == 201, ok.text
    order_id = ok.json()["id"]
    rows = {r.consent_type: r for r in db.query(ConsentLog).filter(ConsentLog.request_id == order_id).all()}
    assert rows["terms"].status == "active"
    assert rows["marketing"].status == "denied"

    blocked = client.post("/orders", json=_order_payload(pid, terms_accepted=False))
    assert blocked.status_code == 400

    # custom (no line items) request additionally needs personal-data consent
    custom_blocked = client.post("/orders", json=_order_payload(pid, items=[], note="Размеры: 1×1×1"))
    assert custom_blocked.status_code == 400
    custom_ok = client.post(
        "/orders", json=_order_payload(pid, items=[], note="Размеры: 1×1×1", personal_data_consent=True)
    )
    assert custom_ok.status_code == 201


# 6–11. Legal pages are routed and have content; versions are published.
LEGAL_PATHS = [
    "/privacy",
    "/personal-data-consent",
    "/cookies",
    "/offer",
    "/returns",
    "/requisites",
    "/marketing-consent",
    "/delivery-payment",
]


def test_06_to_11_legal_pages_are_routed_and_non_empty(client):
    app_tsx = (SRC / "App.tsx").read_text(encoding="utf-8")
    docs = (SRC / "legal/documents.ts").read_text(encoding="utf-8")
    for path in LEGAL_PATHS:
        assert f'path="{path}"' in app_tsx, f"route {path} missing in App.tsx"
        assert f"path: '{path}'" in docs, f"document for {path} missing"
    # Operator identity exactly as specified, and the forbidden wording absent.
    assert "Басханов Рамазан Загирович" in docs
    assert "054400624877" in docs
    assert "ИП Басханов" not in docs
    assert "ОГРНИП" not in docs
    assert "возврату не подлежит" not in docs
    # No Uzbek user-facing text leaked into the legal pages.
    assert "ko‘r" not in docs and "bo‘l" not in docs
    res = client.get("/config")
    assert res.status_code == 200
    versions = res.json()["legal_versions"]
    assert set(versions) == {"privacy", "personal_data_consent", "marketing_consent", "cookie_policy", "offer"}


# 12. Boshqa profil ko'rinmaydi.
def test_12_other_profile_is_not_visible(client, db):
    name_a, _, tok_a = register(client)
    name_b, _, _ = register(client)
    me = client.get("/auth/customer/me", headers=auth(tok_a)).json()
    assert me["name"] == name_a
    other = db.query(Customer).filter(Customer.name == name_b).one()
    # No endpoint exposes another customer by id.
    for path in (f"/auth/customer/{other.id}", f"/customers/{other.id}", f"/users/{other.id}"):
        assert client.get(path, headers=auth(tok_a)).status_code in (401, 403, 404, 405)
    assert "password" not in me and "password_hash" not in me


# 13. Boshqa buyurtma ko'rinmaydi.
def test_13_other_order_is_not_visible(client, admin_token):
    pid = _create_product(client, admin_token)
    _, _, tok_a = register(client)
    _, _, tok_b = register(client)
    created = client.post("/orders", json=_order_payload(pid), headers=auth(tok_a))
    assert created.status_code == 201
    order_id = created.json()["id"]

    mine_b = client.get("/orders/me", headers=auth(tok_b)).json()
    assert order_id not in {o["id"] for o in mine_b}
    mine_a = client.get("/orders/me", headers=auth(tok_a)).json()
    assert order_id in {o["id"] for o in mine_a}

    # B cannot post into A's chat; guests cannot read a claimed order's chat by UUID.
    assert client.post(f"/orders/{order_id}/chat/customer", json={"text": "hi"}, headers=auth(tok_b)).status_code in (403, 404)
    assert client.get(f"/orders/{order_id}/chat").status_code in (403, 404)
    assert client.post(f"/orders/{order_id}/chat/guest", json={"text": "hi"}).status_code in (403, 404)
    # Customers never get the admin order endpoints.
    assert client.get(f"/orders/{order_id}", headers=auth(tok_b)).status_code in (401, 403)


# 14. API authorization ishlaydi.
def test_14_api_authorization(client, admin_token):
    _, _, customer_tok = register(client)
    assert client.get("/orders").status_code == 401
    assert client.get("/orders", headers=auth(customer_tok)).status_code in (401, 403)
    assert client.get("/orders", headers=auth(admin_token)).status_code == 200
    assert client.get("/admin/users").status_code == 401
    assert client.get("/admin/users", headers=auth(customer_tok)).status_code in (401, 403)
    assert client.post("/products", json={"name": "x", "price": 1}, headers=auth(customer_tok)).status_code in (401, 403)
    assert client.get("/consents/me").status_code == 401


# 15. Parollar ochiq saqlanmaydi.
def test_15_passwords_are_hashed(client, db):
    name, password, _ = register(client)
    customer = db.query(Customer).filter(Customer.name == name).one()
    assert customer.password_hash != password
    assert password not in customer.password_hash
    assert customer.password_hash.startswith("$2")  # bcrypt
    assert len(customer.password_hash) >= 59


# 16. ConsentLog foydalanuvchi tomonidan o'zgartirilmaydi.
def test_16_consent_log_is_immutable_for_customers(client, db):
    name, _, tok = register(client, marketing=True)
    rows = client.get("/consents/me", headers=auth(tok)).json()
    assert len(rows) >= 2
    row_id = rows[0]["id"]
    for method in ("PATCH", "PUT", "DELETE"):
        res = client.request(method, f"/consents/{row_id}", json={"status": "active"}, headers=auth(tok))
        assert res.status_code in (404, 405), f"{method} must not be routable"
    assert client.request("DELETE", "/consents/me", headers=auth(tok)).status_code in (404, 405)
    # forged personal_data / terms rows are rejected on the public endpoint
    forged = client.post("/consents", json={"consent_type": "personal_data", "granted": True, "request_id": "x"}, headers=auth(tok))
    assert forged.status_code == 422
    customer = db.query(Customer).filter(Customer.name == name).one()
    before = db.query(ConsentLog).filter(ConsentLog.customer_id == customer.id).count()
    assert before == len(rows)


# 17. Marketing consent qaytarib olinadi.
def test_17_marketing_consent_can_be_withdrawn(client, db):
    name, _, tok = register(client, marketing=True)
    res = client.post("/consents/withdraw", json={"consent_type": "marketing"}, headers=auth(tok))
    assert res.status_code == 200
    assert res.json()["marketing_allowed"] is False
    assert res.json()["revoked"] >= 1
    db.expire_all()
    customer = db.query(Customer).filter(Customer.name == name).one()
    assert customer.marketing_allowed is False
    row = db.query(ConsentLog).filter(ConsentLog.customer_id == customer.id, ConsentLog.consent_type == "marketing").one()
    assert row.status == "revoked" and row.revoked_at is not None
    # opting back in from the profile writes a new active row
    again = client.post("/consents", json={"consent_type": "marketing", "granted": True, "source_form": "profile"}, headers=auth(tok))
    assert again.status_code == 201 and again.json()["status"] == "active"
    db.expire_all()
    assert db.query(Customer).filter(Customer.name == name).one().marketing_allowed is True


# 18. Akkauntni o'chirish funksiyasi mavjud.
def test_18_account_deletion(client, admin_token, db):
    pid = _create_product(client, admin_token)
    name, password, tok = register(client, marketing=True)
    order = client.post("/orders", json=_order_payload(pid), headers=auth(tok)).json()
    customer_id = client.get("/auth/customer/me", headers=auth(tok)).json()["id"]

    wrong = client.post("/auth/customer/me/delete", json={"password": "nope"}, headers=auth(tok))
    assert wrong.status_code == 403
    res = client.post("/auth/customer/me/delete", json={"password": password}, headers=auth(tok))
    assert res.status_code == 204

    assert client.post("/auth/customer/login", data={"username": name, "password": password}).status_code == 401
    assert client.get("/auth/customer/me", headers=auth(tok)).status_code == 401
    db.expire_all()
    assert db.query(Customer).filter(Customer.id == customer_id).first() is None
    kept = db.query(Order).filter(Order.id == order["id"]).one()
    assert kept.customer_id is None  # retained on contract basis, detached from the account
    logs = db.query(ConsentLog).filter(ConsentLog.request_id == f"deleted:{customer_id}").all()
    assert logs and all(l.customer_id is None and l.status in ("revoked", "denied") for l in logs)


# 19. Production secrets frontend'da yo'q.
SECRET_PATTERNS = [
    r"AWS_SECRET_ACCESS_KEY\s*[:=]\s*['\"][A-Za-z0-9/+]{20,}",
    r"aws_secret_access_key\s*[:=]\s*['\"][A-Za-z0-9/+]{20,}",
    r"JWT_SECRET\s*[:=]\s*['\"][^'\"]{8,}",
    r"VAPID_PRIVATE_KEY",
    r"-----BEGIN (RSA |EC )?PRIVATE KEY-----",
    r"sk_live_[0-9a-zA-Z]{10,}",
]


def test_19_no_secrets_in_frontend():
    files = [p for p in SRC.rglob("*") if p.suffix in {".ts", ".tsx", ".js", ".css", ".html"}]
    files += [REPO_ROOT / "index.html", REPO_ROOT / "vite.config.ts"]
    dist = REPO_ROOT / "dist"
    if dist.exists():
        files += [p for p in dist.rglob("*") if p.suffix in {".js", ".html", ".css"}]
    for f in files:
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        for pat in SECRET_PATTERNS:
            assert not re.search(pat, text), f"secret-like content in {f.relative_to(REPO_ROOT)}: {pat}"
    # Only VITE_-prefixed variables are ever exposed to the bundle.
    env_example = (REPO_ROOT / ".env.example").read_text(encoding="utf-8")
    for line in env_example.splitlines():
        if line and not line.startswith("#"):
            assert line.startswith("VITE_"), f"non-public var in frontend .env.example: {line}"


# 20. Production secrets Git'da yo'q.
def test_20_no_secrets_in_git():
    tracked = subprocess.run(["git", "ls-files"], cwd=REPO_ROOT, capture_output=True, text=True, check=True).stdout.split()
    env_files = [p for p in tracked if p.split("/")[-1].startswith(".env") and not p.endswith(".example")]
    assert env_files == [], f"real .env files tracked: {env_files}"
    history = subprocess.run(
        ["git", "log", "--all", "--diff-filter=A", "--name-only", "--pretty=format:", "--", ".env", "backend/.env"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout.split()
    assert history == [], f".env was committed at some point: {history}"
    ignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
    assert ".env" in ignore
    for p in tracked:
        if p.endswith((".example", ".md")) or "/node_modules/" in p:
            continue
        path = REPO_ROOT / p
        if not path.is_file() or path.stat().st_size > 2_000_000:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        assert not re.search(r"-----BEGIN (RSA |EC )?PRIVATE KEY-----", text), f"private key tracked in {p}"


# Extra: anonymous cookie consent from the banner is recorded with a visitor id.
def test_cookie_consent_anonymous(client, db):
    res = client.post(
        "/consents",
        json={"consent_type": "analytics_cookie", "granted": False, "source_form": "cookie_banner", "request_id": "visitor-abc"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "denied"
    assert res.json()["document_version"] == DOCUMENT_VERSIONS["cookie_policy"]
    missing = client.post("/consents", json={"consent_type": "analytics_cookie", "granted": True})
    assert missing.status_code == 400
    row = db.query(ConsentLog).filter(ConsentLog.request_id == "visitor-abc").one()
    assert row.customer_id is None and row.ip is not None
