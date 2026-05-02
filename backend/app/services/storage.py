"""Image upload — S3 first, local-disk fallback for dev.

When `s3_bucket` + AWS keys are set, files are PUT to S3 with `public-read`
and a public URL is returned. Otherwise the file is saved under
`backend/uploads/` and served by FastAPI's `StaticFiles` mount at
`/static/uploads/...` so that local dev keeps working without an AWS
account.

The endpoint also enforces:
  - Image content-type only (jpeg, png, webp, gif, svg)
  - Hard size cap from settings (10 MB by default)
  - UUID-derived keys so two admins can't clobber each other.
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import uuid
from pathlib import Path
from typing import BinaryIO

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

log = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}

# Local fallback root. Mounted at /static by main.py.
LOCAL_UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
LOCAL_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


def _ext_for(content_type: str | None, filename: str | None) -> str:
    if filename:
        suffix = Path(filename).suffix.lower()
        if suffix:
            return suffix
    if content_type:
        guess = mimetypes.guess_extension(content_type) or ""
        if guess:
            return guess
    return ".bin"


def _key(prefix: str, ext: str) -> str:
    return f"{prefix}/{uuid.uuid4().hex}{ext}"


def _s3_client():
    settings = get_settings()
    # When a custom endpoint is set we're talking to a non-AWS S3 (TimeWeb,
    # MinIO, Wasabi, Backblaze...) — most of those only support path-style
    # addressing. `auto` would pick virtual-hosted (`<bucket>.host`) for
    # AWS-compatible bucket names and silently 403 against TimeWeb. Forcing
    # `path` here is the safe default.
    addressing_style = "path" if settings.s3_endpoint_url else "auto"
    kwargs = {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
        "region_name": settings.aws_region,
        "config": BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
        ),
    }
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    return boto3.client("s3", **kwargs)


def _public_url(key: str) -> str:
    settings = get_settings()
    if settings.s3_public_url_prefix:
        return f"{settings.s3_public_url_prefix.rstrip('/')}/{key}"
    if settings.s3_endpoint_url:
        # Self-hosted / non-AWS — best effort; for prod set s3_public_url_prefix.
        return f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}/{key}"
    return f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"


def _validate_image(file: UploadFile, total_bytes: int) -> None:
    settings = get_settings()
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Only image uploads allowed (jpeg/png/webp/gif/svg). Got: {file.content_type}",
        )
    if total_bytes > settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max {settings.upload_max_bytes // (1024 * 1024)} MB.",
        )


def _put_s3(stream: BinaryIO, key: str, content_type: str) -> None:
    settings = get_settings()
    extra_args: dict[str, str] = {
        "ContentType": content_type,
        "CacheControl": "public, max-age=31536000",
    }
    # AWS honors `ACL: public-read` on each object. TimeWeb / some MinIO setups
    # reject it and require a bucket policy instead — disable via S3_USE_ACL=false.
    if settings.s3_use_acl:
        extra_args["ACL"] = "public-read"
    try:
        _s3_client().upload_fileobj(
            stream,
            settings.s3_bucket,
            key,
            ExtraArgs=extra_args,
        )
    except (BotoCoreError, ClientError) as exc:
        log.exception("S3 upload failed for %s", key)
        raise HTTPException(status_code=502, detail=f"Upload to S3 failed: {exc}") from exc


def _put_local(stream: BinaryIO, key: str) -> str:
    path = LOCAL_UPLOAD_ROOT / key
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        while True:
            chunk = stream.read(64 * 1024)
            if not chunk:
                break
            fh.write(chunk)
    return f"/static/uploads/{key}"


async def upload_image(file: UploadFile, *, prefix: str = "products") -> str:
    """Returns a public URL pointing at the saved image."""
    settings = get_settings()
    # Read once into memory so we can both validate the size and rewind for
    # the upload backend. 10 MB cap means this is OK; for larger files we'd
    # stream directly.
    body = await file.read()
    _validate_image(file, len(body))

    ext = _ext_for(file.content_type, file.filename)
    key = _key(prefix, ext)

    if settings.s3_enabled:
        # boto3 is sync — push to a thread to keep the event loop responsive.
        import io
        await asyncio.to_thread(_put_s3, io.BytesIO(body), key, file.content_type or "application/octet-stream")
        return _public_url(key)

    # Local fallback — good enough for dev, never use in prod.
    import io
    return _put_local(io.BytesIO(body), key)
