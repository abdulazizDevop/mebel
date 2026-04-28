"""Image upload — admin only.

POST /uploads/image with multipart/form-data, field `file`, returns:
    { "url": "https://cdn.../products/<uuid>.jpg" }

The frontend ProductForm uses this in place of the legacy
`FileReader.readAsDataURL` flow that bloats the database with base64 blobs.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel

from app.deps import require_section
from app.services.storage import upload_image

router = APIRouter(prefix="/uploads", tags=["uploads"])


class UploadResponse(BaseModel):
    url: str


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
