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
import os
import subprocess
import tempfile
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

# What a browser's MediaRecorder can emit. Chrome/Firefox/Android record
# audio/webm (opus); Safari (desktop + iOS) records audio/mp4 (aac). We accept
# any of these and transcode to MP3 server-side so every device can play back.
ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
}

# Local fallback root. Mounted at /static by main.py.
LOCAL_UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
LOCAL_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

# Bound concurrent ffmpeg transcodes so a flood of /uploads/audio requests can't
# spawn unlimited CPU-bound subprocesses and starve the box (defense-in-depth
# alongside the per-IP rate limit on the endpoint). Lazily bound to the loop.
_TRANSCODE_SEM = asyncio.Semaphore(2)


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


def _base_type(content_type: str | None) -> str:
    """Strip any codec suffix — MediaRecorder emits e.g. `audio/webm;codecs=opus`,
    which would fail an exact membership test against `audio/webm`."""
    return (content_type or "").split(";")[0].strip().lower()


def _validate(
    file: UploadFile,
    total_bytes: int,
    *,
    allowed: set[str],
    max_bytes: int,
    label: str,
) -> None:
    if _base_type(file.content_type) not in allowed:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Only {label} uploads allowed. Got: {file.content_type}",
        )
    if total_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max {max_bytes // (1024 * 1024)} MB.",
        )


def _validate_image(file: UploadFile, total_bytes: int) -> None:
    _validate(
        file,
        total_bytes,
        allowed=ALLOWED_IMAGE_TYPES,
        max_bytes=get_settings().upload_max_bytes,
        label="image (jpeg/png/webp/gif/svg)",
    )


def _transcode_to_mp3(body: bytes) -> bytes:
    """Convert any recorded audio blob to MP3 via ffmpeg so playback works on
    every browser (notably iOS Safari, which can't play webm/opus). Input is
    written to a temp file — MediaRecorder mp4 output can carry a trailing moov
    atom that a non-seekable stdin pipe fails to decode.

    `-t` caps duration and `-fs` caps output bytes so a tiny, heavily-compressed
    input can't amplify into a huge MP3 in memory; a wall-clock timeout keeps a
    degenerate input from pinning a worker thread forever."""
    settings = get_settings()
    # Bind the path BEFORE writing so the finally-cleanup always covers it, even
    # if tf.write raises (e.g. ENOSPC) before the assignment would have run.
    tf = tempfile.NamedTemporaryFile(suffix=".audioin", delete=False)
    in_path = tf.name
    try:
        with tf:
            tf.write(body)
        proc = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", in_path,
                "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k",
                "-t", str(settings.audio_max_duration_sec),   # cap duration
                "-fs", str(20 * 1024 * 1024),                 # cap output bytes
                "-f", "mp3", "pipe:1",
            ],
            capture_output=True,
            check=False,
            timeout=60,
        )
        if proc.returncode != 0 or not proc.stdout:
            err = proc.stderr.decode("utf-8", "ignore")[:300]
            log.error("ffmpeg transcode failed: %s", err)
            raise HTTPException(status_code=502, detail="Audio transcode failed")
        return proc.stdout
    except subprocess.TimeoutExpired as exc:
        log.error("ffmpeg transcode timed out")
        raise HTTPException(status_code=502, detail="Audio transcode timed out") from exc
    except FileNotFoundError as exc:  # ffmpeg binary missing
        log.exception("ffmpeg not installed")
        raise HTTPException(status_code=500, detail="Audio processing unavailable") from exc
    finally:
        try:
            os.unlink(in_path)
        except OSError:
            pass


def is_own_storage_url(url: str) -> bool:
    """True only if `url` points at our own upload storage (the S3 public prefix,
    the S3 endpoint+bucket, or the local /static/uploads mount). Guards the chat
    endpoints from storing an arbitrary attacker-chosen URL as a 'voice message'
    that an admin's browser would then auto-fetch."""
    if not url:
        return False
    settings = get_settings()
    prefixes = ["/static/uploads/"]
    if settings.s3_public_url_prefix:
        prefixes.append(settings.s3_public_url_prefix.rstrip("/") + "/")
    if settings.s3_endpoint_url and settings.s3_bucket:
        prefixes.append(f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}/")
    return any(url.startswith(p) for p in prefixes)


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


async def upload_audio(file: UploadFile, *, prefix: str = "voice") -> str:
    """Validate a recorded audio blob, transcode it to MP3, and store it.
    Returns a public URL to the .mp3 (universal <audio> playback)."""
    settings = get_settings()
    body = await file.read()
    _validate(
        file,
        len(body),
        allowed=ALLOWED_AUDIO_TYPES,
        max_bytes=settings.audio_upload_max_bytes,
        label="audio (webm/ogg/mp4/aac/mpeg/wav)",
    )
    # ffmpeg is CPU-bound + blocking — off the event loop, and gated by a
    # semaphore so concurrent uploads queue instead of pinning every core.
    async with _TRANSCODE_SEM:
        mp3 = await asyncio.to_thread(_transcode_to_mp3, body)

    key = _key(prefix, ".mp3")
    import io
    if settings.s3_enabled:
        await asyncio.to_thread(_put_s3, io.BytesIO(mp3), key, "audio/mpeg")
        return _public_url(key)
    return _put_local(io.BytesIO(mp3), key)
