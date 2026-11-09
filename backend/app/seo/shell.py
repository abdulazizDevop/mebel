"""The SPA shell: Vite's built index.html with the hashed <script>/<link> tags.

The renderer never hard-codes asset names — it fetches the real shell from the
`web` nginx container (same compose network), caches it for a few minutes and
injects page-specific <head> tags plus server-rendered content into
`<div id="root">`. Dev / tests fall back to ../dist/index.html, and if nothing
is available a minimal shell keeps the response valid HTML.
"""
from __future__ import annotations

import logging
import time
import urllib.request
from pathlib import Path

from app.config import get_settings

log = logging.getLogger("app.seo.shell")

_TTL_SECONDS = 300
_cache: dict[str, object] = {"html": None, "ts": 0.0}

FALLBACK_SHELL = (
    '<!doctype html><html lang="ru"><head><meta charset="UTF-8" />'
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />'
    "<title>ROOOMEBEL</title></head><body><div id=\"root\"></div></body></html>"
)


def _valid(html: str | None) -> bool:
    return bool(html) and 'id="root"' in html and "<title>" in html


def _fetch_from_web() -> str | None:
    url = get_settings().web_shell_url
    if not url:
        return None
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:  # noqa: S310 — fixed internal URL from config
            html = resp.read().decode("utf-8", errors="replace")
        return html if _valid(html) else None
    except Exception as exc:  # noqa: BLE001 — any failure just means "use fallback"
        log.debug("shell fetch failed: %s", exc)
        return None


def _read_from_disk() -> str | None:
    configured = get_settings().web_shell_path
    path = Path(configured) if configured else Path(__file__).resolve().parents[2].parent / "dist" / "index.html"
    try:
        html = path.read_text(encoding="utf-8")
        return html if _valid(html) else None
    except OSError:
        return None


def get_shell() -> str:
    now = time.time()
    cached = _cache["html"]
    if isinstance(cached, str) and now - float(_cache["ts"]) < _TTL_SECONDS:
        return cached
    html = _fetch_from_web() or _read_from_disk()
    if html:
        _cache["html"] = html
        _cache["ts"] = now
        return html
    return cached if isinstance(cached, str) else FALLBACK_SHELL


def reset_cache() -> None:
    _cache["html"] = None
    _cache["ts"] = 0.0
