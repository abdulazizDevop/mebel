"""Brute-force protection on auth endpoints.

Uses slowapi (FastAPI's idiomatic wrapper around `limits`) with the client
IP as the key. In-memory storage is fine for a single-process deploy; if
we ever scale out behind a load balancer we'll switch the storage to Redis
(`limits.aio.storage.RedisStorage`).
"""
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

# Trust the leftmost X-Forwarded-For when present so nginx → uvicorn keeps
# the original client IP. (Nginx config in deploy/ adds it.)
def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip, default_limits=[])


def rate_limit_exceeded_handler(_request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": f"Too many attempts. Try again later. ({exc.detail})"},
        )
    raise exc
