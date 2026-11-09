"""HTML entry points: the SPA shell with per-URL <head> + server-rendered body,
plus sitemap.xml and robots.txt.

nginx (deploy/nginx.conf) sends every non-file request to `/_render<uri>`;
when this service is down nginx falls back to the plain index.html, so the
storefront never depends on the renderer being up.
"""
from __future__ import annotations

import html
import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.seo import site
from app.seo.pages import Page, all_sitemap_entries, build_page
from app.seo.shell import get_shell

router = APIRouter(tags=["seo"])

_TITLE_RE = re.compile(r"<title>.*?</title>", re.S)
_ROOT_RE = re.compile(r'<div id="root">\s*</div>')


def _jsonld_script(data: dict) -> str:
    # `</` inside JSON would end the script tag early; escape it.
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/ld+json">{payload}</script>'


def _head(page: Page, seo: dict[str, str]) -> str:
    canonical = site.absolute(page.canonical_path)
    e = html.escape
    parts = [
        f"<title>{e(page.title)}</title>",
        f'<meta name="description" content="{e(page.description)}" />',
        f'<meta name="robots" content="{e(page.robots)}" />',
        f'<link rel="canonical" href="{e(canonical)}" />',
        '<meta property="og:locale" content="ru_RU" />',
        f'<meta property="og:site_name" content="{e(site.SITE_NAME)}" />',
        f'<meta property="og:type" content="{e(page.og_type)}" />',
        f'<meta property="og:title" content="{e(page.title)}" />',
        f'<meta property="og:description" content="{e(page.description)}" />',
        f'<meta property="og:url" content="{e(canonical)}" />',
    ]
    if page.og_image:
        parts.append(f'<meta property="og:image" content="{e(page.og_image)}" />')
        parts.append('<meta name="twitter:card" content="summary_large_image" />')
        parts.append(f'<meta name="twitter:image" content="{e(page.og_image)}" />')
    parts.append(f'<meta name="twitter:title" content="{e(page.title)}" />')
    if seo.get("seo_yandex_verification"):
        parts.append(f'<meta name="yandex-verification" content="{e(seo["seo_yandex_verification"])}" />')
    if seo.get("seo_google_verification"):
        parts.append(f'<meta name="google-site-verification" content="{e(seo["seo_google_verification"])}" />')
    if page.extra_head:
        parts.append(page.extra_head)
    parts.extend(_jsonld_script(d) for d in page.jsonld)
    return "\n    ".join(parts)


def inject(shell: str, page: Page, seo: dict[str, str]) -> str:
    out = _TITLE_RE.sub(lambda _m: _head(page, seo), shell, count=1)
    if page.body_html:
        out = _ROOT_RE.sub(lambda _m: f'<div id="root">{page.body_html}</div>', out, count=1)
    return out


@router.get("/_render/{path:path}", response_class=HTMLResponse, include_in_schema=False)
def render_page(path: str, request: Request, db: Annotated[Session, Depends(get_db)]) -> Response:
    page = build_page(db, path)
    if page.redirect:
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(url=page.redirect + query, status_code=301)
    seo = site.get_seo_config(db)
    body = inject(get_shell(), page, seo)
    headers = {
        # Short shared cache: admin edits show up within a minute, bots and
        # link previews don't hammer the DB.
        "Cache-Control": "public, max-age=60" if page.status == 200 else "no-store",
        "X-Robots-Tag": page.robots,
        "Vary": "Accept-Encoding",
    }
    return HTMLResponse(body, status_code=page.status, headers=headers)


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap(db: Annotated[Session, Depends(get_db)]) -> Response:
    e = html.escape
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for entry in all_sitemap_entries(db):
        lines.append("  <url>")
        lines.append(f"    <loc>{e(site.absolute(entry['loc']))}</loc>")
        if entry.get("lastmod"):
            lines.append(f"    <lastmod>{entry['lastmod']}</lastmod>")
        lines.append(f"    <changefreq>{entry['changefreq']}</changefreq>")
        lines.append(f"    <priority>{entry['priority']}</priority>")
        if entry.get("image"):
            lines.append("    <image:image>")
            lines.append(f"      <image:loc>{e(site.absolute(entry['image']))}</image:loc>")
            lines.append(f"      <image:title>{e(entry.get('image_title') or '')}</image:title>")
            lines.append("    </image:image>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return Response("\n".join(lines), media_type="application/xml",
                    headers={"Cache-Control": "public, max-age=3600"})


@router.get("/robots.txt", include_in_schema=False)
def robots() -> PlainTextResponse:
    disallow = ["/admin", "/api/", "/_render/", "/order", "/chat", "/profile", "/favorites"]
    general = ["User-agent: *", "Allow: /", *[f"Disallow: {p}" for p in disallow],
               "Disallow: /*?*utm_", "Disallow: /*?*yclid=", ""]
    # Yandex understands Clean-param: ad marks never create duplicate URLs.
    yandex = ["User-agent: Yandex", "Allow: /", *[f"Disallow: {p}" for p in disallow],
              "Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&_openstat", ""]
    body = "\n".join(general + yandex + [f"Sitemap: {site.site_url()}/sitemap.xml", ""])
    return PlainTextResponse(body, headers={"Cache-Control": "public, max-age=3600"})
