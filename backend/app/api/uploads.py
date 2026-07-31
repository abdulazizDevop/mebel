"""Image upload — admin only.

POST /uploads/image with multipart/form-data, field `file`, returns:
    { "url": "https://cdn.../products/<uuid>.jpg" }

The frontend ProductForm uses this in place of the legacy
`FileReader.readAsDataURL` flow that bloats the database with base64 blobs.
"""
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, Form, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_section
from app.models import Customer, Order, User
from app.rate_limit import limiter
from app.security import decode_access_token
from app.services.storage import upload_audio, upload_image

router = APIRouter(prefix="/uploads", tags=["uploads"])


class UploadResponse(BaseModel):
    url: str


def _authorize_chat_upload(
    authorization: str | None,
    order_id: str | None,
    db: Session,
) -> None:
    """A voice note can be uploaded by an admin, a logged-in customer, OR a
    guest who holds an unclaimed order's UUID (same bearer-capability model as
    the guest chat endpoints). Anything else is rejected so /uploads/audio isn't
    an open anonymous file dump."""
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            try:
                payload: dict[str, Any] = decode_access_token(parts[1])
            except jwt.PyJWTError:
                payload = {}
            sub, kind = payload.get("sub"), payload.get("kind")
            if sub and kind == "user" and db.get(User, sub) is not None:
                return
            if sub and kind == "customer" and db.get(Customer, sub) is not None:
                return
    if order_id:
        order = db.get(Order, order_id)
        if order is not None and order.customer_id is None:
            return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Voice upload requires a valid session or an unclaimed order id",
    )


@router.post(
    "/image",
    response_model=UploadResponse,
    dependencies=[Depends(require_section("products"))],
)
async def upload_image_endpoint(file: UploadFile):
    url = await upload_image(file, prefix="products")
    return UploadResponse(url=url)


# Convenience for product cover photos vs colour-variant photos: same handler,
# different prefix in the storage key — keeps the bucket tidy.
@router.post(
    "/color-photo",
    response_model=UploadResponse,
    dependencies=[Depends(require_section("products"))],
)
async def upload_color_photo_endpoint(file: UploadFile):
    url = await upload_image(file, prefix="colors")
    return UploadResponse(url=url)


# Voice-message audio. Unlike the image endpoints this is NOT admin-only —
# customers and guests send voice notes in chat. Auth is by JWT or by holding
# an unclaimed order's UUID (see _authorize_chat_upload).
@router.post("/audio", response_model=UploadResponse)
@limiter.limit("20/minute")  # per-IP cap on the CPU-heavy transcode endpoint
async def upload_audio_endpoint(
    request: Request,  # required positional arg for the slowapi decorator
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile,
    order_id: Annotated[str | None, Form()] = None,
    authorization: Annotated[str | None, Header()] = None,
):
    _authorize_chat_upload(authorization, order_id, db)
    url = await upload_audio(file, prefix="voice")
    return UploadResponse(url=url)
