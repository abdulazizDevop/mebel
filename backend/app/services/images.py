"""Derived image sizes for the storefront.

Admins upload 0.3–2.5 MB JPEGs; the catalog used to load every one of them at
full size (≈30 MB for one page on a phone). Every raster upload now also gets
two WebP renditions next to the original, named by convention so the frontend
can address them without extra DB columns:

    products/<uuid>.jpg          original (unchanged)
    products/<uuid>_sm.webp      ≤ 400 px  — catalog cards, thumbnail strips
    products/<uuid>_md.webp      ≤ 900 px  — product page, home carousel

`app/tools/thumbs.py` backfills the renditions for images uploaded before
this existed. The frontend falls back to the original when a rendition 404s.
"""
from __future__ import annotations

import io
import logging
from pathlib import PurePosixPath

from PIL import Image, ImageOps

log = logging.getLogger(__name__)

VARIANTS: dict[str, int] = {"sm": 400, "md": 900}
WEBP_QUALITY = {"sm": 74, "md": 80}
RASTER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
# Pillow's decompression-bomb guard: 10 MB upload cap already bounds input
# size, but a highly compressed 20k×20k PNG could still blow memory.
MAX_PIXELS = 40_000_000


def is_raster_key(key_or_url: str) -> bool:
    return PurePosixPath(key_or_url.split("?")[0]).suffix.lower() in RASTER_EXTENSIONS


def variant_key(key: str, size: str) -> str:
    """`products/abc.jpg` → `products/abc_sm.webp`."""
    p = PurePosixPath(key)
    return str(p.with_name(f"{p.stem}_{size}.webp"))


def derive_variants(body: bytes) -> dict[str, bytes]:
    """Return {size: webp_bytes}. Raises ValueError for undecodable input."""
    try:
        img = Image.open(io.BytesIO(body))
        img.load()
    except Exception as exc:  # noqa: BLE001 — Pillow raises many types
        raise ValueError(f"not an image: {exc}") from exc
    if img.width * img.height > MAX_PIXELS:
        raise ValueError("image too large")
    # Bake EXIF orientation in, drop alpha onto white (WebP keeps alpha, but
    # the shop shows photos on light/dark surfaces — a flat image is safer).
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        background.paste(rgba, mask=rgba.getchannel("A"))
        img = background
    elif img.mode == "L":
        img = img.convert("RGB")

    out: dict[str, bytes] = {}
    for size, max_side in VARIANTS.items():
        copy = img.copy()
        copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        copy.save(buf, format="WEBP", quality=WEBP_QUALITY[size], method=4)
        out[size] = buf.getvalue()
    return out
