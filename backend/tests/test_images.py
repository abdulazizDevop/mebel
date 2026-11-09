"""Derived image renditions (services/images.py + upload endpoint)."""
import io

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app.models import User
from app.services import images


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _grant(db: Session, name: str = "owner-test") -> None:
    user = db.query(User).filter(User.name == name).first()
    user.sections = ["products"]
    db.commit()


def _jpeg(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 120, 80)).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_variant_key_naming():
    assert images.variant_key("products/abc.jpg", "sm") == "products/abc_sm.webp"
    assert images.variant_key("colors/x.PNG", "md") == "colors/x_md.webp"
    assert images.is_raster_key("https://s3/x/products/a.jpeg?x=1") is True
    assert images.is_raster_key("products/logo.svg") is False


def test_derive_variants_sizes_and_format():
    out = images.derive_variants(_jpeg(1600, 1200))
    assert set(out) == {"sm", "md"}
    sm = Image.open(io.BytesIO(out["sm"]))
    md = Image.open(io.BytesIO(out["md"]))
    assert sm.format == "WEBP" and md.format == "WEBP"
    assert max(sm.size) == 400 and max(md.size) == 900
    # Small source is never upscaled.
    tiny = images.derive_variants(_jpeg(300, 200))
    assert Image.open(io.BytesIO(tiny["md"])).size == (300, 200)


def test_derive_variants_rejects_garbage():
    try:
        images.derive_variants(b"not an image")
    except ValueError:
        pass
    else:  # pragma: no cover
        raise AssertionError("expected ValueError")


def test_upload_creates_renditions(client: TestClient, admin_token: str, db: Session):
    _grant(db)
    res = client.post(
        "/uploads/image",
        files={"file": ("bed.jpg", _jpeg(1200, 900), "image/jpeg")},
        headers=_auth(admin_token),
    )
    assert res.status_code in (200, 201), res.text
    url = res.json()["url"]
    assert url.startswith("/static/uploads/products/")
    base = url.rsplit(".", 1)[0]
    for size, max_side in images.VARIANTS.items():
        variant = client.get(f"{base}_{size}.webp")
        assert variant.status_code == 200, f"{size} rendition missing"
        assert variant.headers["content-type"] == "image/webp"
        assert max(Image.open(io.BytesIO(variant.content)).size) == min(max_side, 1200)
