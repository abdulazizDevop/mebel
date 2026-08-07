"""Owner-editable site settings — contact numbers, exposed to the admin panel.

The public storefront reads the same values via GET /config (no auth). Only
staff with the `settings` section can read/update them here."""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_section
from app.services.settings_store import get_contact_config, only_digits, set_setting

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
    set_setting(db, "whatsapp_phone", only_digits(payload.whatsapp_phone))
    set_setting(db, "call_phone", only_digits(payload.call_phone))
    return ContactSettingsOut(**get_contact_config(db))
