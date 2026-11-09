"""Owner-editable site settings — contact numbers, exposed to the admin panel.

The public storefront reads the same values via GET /config (no auth). Only
staff with the `settings` section can read/update them here."""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_section
from app.seo.site import SEO_KEYS, get_seo_config
from app.services.settings_store import get_contact_config, normalize_phone, set_setting

router = APIRouter(
    prefix="/admin/settings",
    tags=["settings"],
    dependencies=[Depends(require_section("settings"))],
)


class ContactSettingsOut(BaseModel):
    whatsapp_phone: str
    call_phone: str


class ContactSettingsIn(BaseModel):
    whatsapp_phone: str = Field(default="", max_length=32)
    call_phone: str = Field(default="", max_length=32)


@router.get("/contact", response_model=ContactSettingsOut)
def get_contact_settings(db: Annotated[Session, Depends(get_db)]):
    return ContactSettingsOut(**get_contact_config(db))


@router.put("/contact", response_model=ContactSettingsOut)
def update_contact_settings(
    payload: ContactSettingsIn,
    db: Annotated[Session, Depends(get_db)],
):
    # Store digits only — the frontend builds wa.me/<digits> and tel:+<digits>.
    set_setting(db, "whatsapp_phone", normalize_phone(payload.whatsapp_phone))
    set_setting(db, "call_phone", normalize_phone(payload.call_phone))
    return ContactSettingsOut(**get_contact_config(db))


# ─── SEO: verification tokens, intro text, address details, socials ──────


class SeoSettings(BaseModel):
    seo_yandex_verification: str = Field(default="", max_length=128)
    seo_google_verification: str = Field(default="", max_length=128)
    seo_home_intro: str = Field(default="", max_length=600)
    seo_street_address: str = Field(default="", max_length=255)
    seo_locality: str = Field(default="", max_length=120)
    seo_opening_hours: str = Field(default="", max_length=120)
    seo_geo: str = Field(default="", max_length=64, description="lat,lng — e.g. 43.2505,46.5856")
    seo_social_links: str = Field(default="", max_length=1000, description="one URL per line")


@router.get("/seo", response_model=SeoSettings)
def get_seo_settings(db: Annotated[Session, Depends(get_db)]):
    return SeoSettings(**get_seo_config(db))


@router.put("/seo", response_model=SeoSettings)
def update_seo_settings(payload: SeoSettings, db: Annotated[Session, Depends(get_db)]):
    for key in SEO_KEYS:
        set_setting(db, key, getattr(payload, key).strip())
    return SeoSettings(**get_seo_config(db))
