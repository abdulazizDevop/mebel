import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import admin_users as admin_users_router
from app.api import analytics as analytics_router
from app.api import auth as auth_router
from app.api import categories as categories_router
from app.api import customers as customers_router
from app.api import orders as orders_router
from app.api import products as products_router
from app.api import push as push_router
from app.api import uploads as uploads_router
from app.api import ws_chat as ws_chat_router
from app.config import get_settings
from app.rate_limit import limiter, rate_limit_exceeded_handler

settings = get_settings()

app = FastAPI(
    title="Mebel API",
    version="0.1.0",
    description="Backend for the Mebel furniture storefront and admin panel.",
)

# Brute-force protection: per-route limits live on the decorator (auth.py /
# customers.py); the middleware + handler bind the limiter to the app and
# turn 429 into a JSON body the frontend already knows how to render.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router.router)
app.include_router(customers_router.router)
app.include_router(admin_users_router.router)
app.include_router(categories_router.router)
app.include_router(products_router.router)
app.include_router(orders_router.router)
app.include_router(analytics_router.router)
app.include_router(push_router.router)
app.include_router(uploads_router.router)
app.include_router(ws_chat_router.router)

# Local-disk fallback for dev image uploads. In production with S3 configured
# this directory stays empty and the route is harmless.
_uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")

# Surface which storage backend is active at startup so the operator can
# tell at a glance whether uploads are going to S3 or the local volume.
# Crucial when triaging "photos disappeared" — local disk is fine for dev
# but means a docker rebuild wipes them unless a volume is mounted.
_log = logging.getLogger("app.startup")
if settings.s3_enabled:
    _log.info(
        "Uploads → S3: bucket=%s endpoint=%s acl=%s",
        settings.s3_bucket,
        settings.s3_endpoint_url or "<aws default>",
        "on" if settings.s3_use_acl else "off (bucket policy)",
    )
else:
    _log.warning(
        "Uploads → LOCAL DISK at %s — only safe for dev. Configure S3_* "
        "env vars to push to remote storage.",
        _uploads_dir,
    )
