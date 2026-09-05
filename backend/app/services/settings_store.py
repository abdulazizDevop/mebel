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


def normalize_phone(s: str) -> str:
    """Digits only, in international form WITHOUT «+» (what wa.me / tel: need).

    Owners type numbers the way they say them — «928 519-94-24» or
    «8 (928) 519-94-24» — so a 10-digit Russian mobile gets its «7» and a
    leading «8» trunk prefix becomes «7». Anything else is left as typed.
    """
    digits = only_digits(s)
    if len(digits) == 10 and digits.startswith("9"):
        return "7" + digits
    if len(digits) == 11 and digits.startswith("8"):
        return "7" + digits[1:]
    return digits


def get_contact_config(db: Session) -> dict[str, str]:
    """WhatsApp + call numbers for the public /config and admin form. DB wins;
    otherwise fall back to the env defaults."""
    env = get_settings()
    return {
        "whatsapp_phone": get_setting(db, "whatsapp_phone", env.whatsapp_phone),
        "call_phone": get_setting(db, "call_phone", env.call_phone),
    }
