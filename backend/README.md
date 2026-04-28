# Mebel — Backend (FastAPI)

Backend for the ROOOMEBEL storefront and admin panel.

Stack: **FastAPI · SQLAlchemy 2 · Alembic · PyJWT · bcrypt · pydantic-settings**.

This is **Phase 2A** — skeleton + auth foundation only. CRUD endpoints for products / orders / chat / analytics land in 2B–2D.

## Quick start

```bash
cd backend

# 1) virtualenv (Python 3.11+)
python3 -m venv .venv
source .venv/bin/activate

# 2) deps
pip install --upgrade pip
pip install -r requirements.txt

# 3) env — copy + put a real JWT_SECRET in there
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(64))"   # paste into .env

# 4) database — apply migrations + create the first admin
alembic revision --autogenerate -m "init"
alembic upgrade head
python -m app.seed

# 5) run
uvicorn app.main:app --reload --port 8000
```

Open the OpenAPI UI: http://localhost:8000/docs.

## Folder layout

```
backend/
├── app/
│   ├── main.py            FastAPI app, CORS, router mount
│   ├── config.py          Settings (.env loader)
│   ├── database.py        SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── security.py        bcrypt + JWT helpers
│   ├── deps.py            get_current_user, require_role, require_section
│   ├── seed.py            python -m app.seed → bootstrap first admin
│   ├── models/            ORM models — schema source of truth for Alembic
│   ├── schemas/           Pydantic request/response bodies
│   └── api/               Route modules (auth.py for now; products/orders/chat next)
├── alembic/               Migration env + versions/
├── alembic.ini
├── requirements.txt
├── .env.example
└── README.md
```

## What's in 2A

- ORM models for **all** entities (User, Customer, Product, ColorVariant, Category, Order, OrderItem, ChatMessage, AnalyticsEvent, PushToken). Migrations will create every table even though the API only exposes auth right now — this lets later phases add endpoints without churning the schema.
- `OrderItem` snapshots `price`, `purchase_price`, `product_name`, `product_sku`, `color_*` so historical net-profit numbers stay accurate even if the product is later edited or deleted.
- Auth: `POST /auth/login` (OAuth2 password form) → JWT bearer token; `GET /auth/me` (requires bearer).
- Role-gating helpers: `require_role(UserRole.admin)`, `require_section("orders")`. Admins always pass section checks; managers/viewers must have the section listed in `sections`.
- Health check: `GET /health`.

## Database

Local: SQLite (`backend/dev.db`). Swap to Postgres by editing `DATABASE_URL` — `psycopg2-binary` is already in requirements:

```
DATABASE_URL=postgresql+psycopg2://mebel:secret@localhost:5432/mebel
```

When models change, generate a new migration:

```bash
alembic revision --autogenerate -m "add foo column"
alembic upgrade head
```

## What's coming next

- **2B** — REST CRUD: products (with color variants + image upload), categories, orders.
- **2C** — Real-time chat over WebSockets, push token registration endpoint, FCM/WebPush hookup.
- **2D** — Analytics ingest (`POST /analytics/events`) and stats query (`GET /stats?period=...&from=&to=`) including the finance/profit numbers the dashboard needs.
- **2E** — Frontend `src/api/client.ts`; replace zustand+localStorage persistence with API calls; auth bearer in `Authorization` header.

## Security checklist (carried into 2B+)

- [x] Passwords stored as bcrypt hashes (never plaintext).
- [x] JWT signed with `JWT_SECRET` from env; never commit `.env`.
- [x] CORS limited to explicit origin list, not `*`.
- [ ] Rate limiting on `/auth/login` (Phase 2C).
- [ ] Pydantic validation on all request bodies (per endpoint, 2B+).
- [ ] HTTPS termination at the reverse proxy in deploy (Phase 3).
