"""Backfill `_sm.webp` / `_md.webp` renditions for images uploaded before
services/images.py existed.

Run inside the api container (it has the S3 credentials):

    docker compose exec api python -m app.tools.thumbs            # missing only
    docker compose exec api python -m app.tools.thumbs --force    # regenerate all
    docker compose exec api python -m app.tools.thumbs --dry-run

Walks every product main image, colour-variant image and gallery photo,
skips URLs that are not ours (or already have renditions), downloads the
original, derives the renditions and uploads them next to it. Idempotent.
"""
from __future__ import annotations

import argparse
import logging
import sys
import urllib.request
from pathlib import Path

from botocore.exceptions import ClientError
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import ColorVariant, Product
from app.services import images
from app.services.storage import LOCAL_UPLOAD_ROOT, _s3_client, is_own_storage_url, put_object

log = logging.getLogger("thumbs")


def _key_from_url(url: str) -> str | None:
    """Reverse of storage._public_url: strip the public prefix → object key."""
    settings = get_settings()
    prefixes = []
    if settings.s3_public_url_prefix:
        prefixes.append(settings.s3_public_url_prefix.rstrip("/") + "/")
    if settings.s3_endpoint_url and settings.s3_bucket:
        prefixes.append(f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}/")
    prefixes.append("/static/uploads/")
    clean = url.split("?")[0]
    for p in prefixes:
        if clean.startswith(p):
            return clean[len(p):]
    return None


def _exists(key: str) -> bool:
    settings = get_settings()
    if settings.s3_enabled:
        try:
            _s3_client().head_object(Bucket=settings.s3_bucket, Key=key)
            return True
        except ClientError:
            return False
    return (LOCAL_UPLOAD_ROOT / key).exists()


def _fetch(key: str, url: str) -> bytes:
    settings = get_settings()
    if settings.s3_enabled:
        obj = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
        return obj["Body"].read()
    local = LOCAL_UPLOAD_ROOT / key
    if local.exists():
        return local.read_bytes()
    with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310 — our own storage URL
        return resp.read()


def collect_urls() -> list[str]:
    seen: list[str] = []
    with SessionLocal() as db:
        for (url,) in db.execute(select(Product.main_image)).all():
            seen.append(url)
        for image, photos in db.execute(select(ColorVariant.image, ColorVariant.photos)).all():
            seen.append(image)
            seen.extend(photos or [])
    # Preserve order, drop duplicates / empties.
    out, known = [], set()
    for u in seen:
        if u and u not in known:
            known.add(u)
            out.append(u)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="regenerate even if renditions exist")
    parser.add_argument("--dry-run", action="store_true", help="only report what would be done")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    urls = collect_urls()
    stats = {"total": len(urls), "foreign": 0, "skipped": 0, "done": 0, "failed": 0, "bytes_in": 0, "bytes_out": 0}
    for url in urls:
        if not is_own_storage_url(url):
            stats["foreign"] += 1
            continue
        key = _key_from_url(url)
        if not key or not images.is_raster_key(key):
            stats["foreign"] += 1
            continue
        if not args.force and all(_exists(images.variant_key(key, s)) for s in images.VARIANTS):
            stats["skipped"] += 1
            continue
        if args.dry_run:
            log.info("would process %s", key)
            stats["done"] += 1
            continue
        try:
            body = _fetch(key, url)
            variants = images.derive_variants(body)
            for size, data in variants.items():
                put_object(data, images.variant_key(key, size), "image/webp")
                stats["bytes_out"] += len(data)
            stats["bytes_in"] += len(body)
            stats["done"] += 1
            log.info("ok   %-60s %6d KB → sm %4d KB, md %4d KB", key, len(body) // 1024,
                     len(variants["sm"]) // 1024, len(variants["md"]) // 1024)
        except Exception as exc:  # noqa: BLE001 — keep going, report at the end
            stats["failed"] += 1
            log.warning("FAIL %s: %s", key, exc)

    log.info(
        "images: %(total)d total, %(done)d processed, %(skipped)d already had renditions, "
        "%(foreign)d not ours, %(failed)d failed; originals %(bytes_in)d bytes → renditions %(bytes_out)d bytes",
        stats,
    )
    return 1 if stats["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())


__all__ = ["main", "collect_urls", "_key_from_url"]
_ = Path  # keep import for type hints in editors
