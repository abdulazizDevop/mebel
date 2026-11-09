"""IndexNow: tell Яндекс (and Bing/Naver/Seznam via the shared endpoint) the
moment a product or category changes, instead of waiting for a recrawl.

Protocol: https://www.indexnow.org/documentation — a site proves ownership by
serving `https://<host>/<key>.txt` containing the key; the API's renderer
answers that path (see seo/render.py). Submissions run in a background thread
and never block or fail the admin request.
"""
from __future__ import annotations

import json
import logging
import secrets
import threading
import urllib.request
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Category, Product
from app.services.settings_store import get_setting, set_setting
from app.services.slug_store import category_segment

log = logging.getLogger("app.indexnow")

KEY_SETTING = "seo_indexnow_key"
ENDPOINT = "https://api.indexnow.org/indexnow"


def get_or_create_key(db: Session) -> str:
    key = get_setting(db, KEY_SETTING, "")
    if not key:
        key = secrets.token_hex(16)
        set_setting(db, KEY_SETTING, key)
    return key


def product_path(product: Product, category: Category | None) -> str:
    return f"/catalog/{category_segment(category)}/{product.slug}"


def category_path(category: Category) -> str:
    return f"/catalog/{category.slug}"


def build_payload(host: str, key: str, urls: list[str]) -> dict:
    return {
        "host": host,
        "key": key,
        "keyLocation": f"https://{host}/{key}.txt",
        "urlList": urls,
    }


def _post(payload: dict) -> None:
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 — fixed public endpoint
            log.info("IndexNow %s urls → HTTP %s", len(payload["urlList"]), resp.status)
    except Exception as exc:  # noqa: BLE001 — best effort
        log.warning("IndexNow submit failed: %s", exc)


def submit_paths(db: Session, paths: list[str]) -> bool:
    """Queue a submission for the given site paths. Returns False when
    disabled (dev/tests, non-https site URL)."""
    settings = get_settings()
    if not settings.indexnow_enabled:
        return False
    site = urlparse(settings.public_site_url)
    if site.scheme != "https" or not site.hostname or site.hostname in ("localhost", "127.0.0.1"):
        return False
    key = get_or_create_key(db)
    urls = []
    for p in dict.fromkeys(paths):  # de-dup, keep order
        if p:
            urls.append(f"https://{site.hostname}{p}")
    if not urls:
        return False
    payload = build_payload(site.hostname, key, urls[:10000])
    threading.Thread(target=_post, args=(payload,), name="indexnow", daemon=True).start()
    return True


def notify_product(db: Session, product: Product, category: Category | None, *, old_path: str | None = None) -> None:
    paths = ["/", "/catalog", product_path(product, category)]
    if category is not None:
        paths.append(category_path(category))
    if old_path:
        paths.append(old_path)  # renamed/deleted: let engines re-fetch the 301/404 too
    submit_paths(db, paths)


def notify_category(db: Session, category: Category, *, old_path: str | None = None) -> None:
    paths = ["/", "/catalog", category_path(category)]
    if old_path:
        paths.append(old_path)
    submit_paths(db, paths)
