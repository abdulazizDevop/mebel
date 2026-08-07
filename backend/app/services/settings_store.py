"""Read/write owner-editable settings, with the env value as the seed default.

A DB row (if present) overrides the env default, so the owner can change the
WhatsApp / call numbers from the admin panel without redeploying; before they
ever touch it, the env value (if any) is used."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Setting


def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(Setting, key)
    return row.value if row is not None else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value
    db.commit()


def only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def get_contact_config(db: Session) -> dict[str, str]:
    """WhatsApp + call numbers for the public /config and admin form. DB wins;
    otherwise fall back to the env defaults."""
    env = get_settings()
    return {
        "whatsapp_phone": get_setting(db, "whatsapp_phone", env.whatsapp_phone),
        "call_phone": get_setting(db, "call_phone", env.call_phone),
    }
