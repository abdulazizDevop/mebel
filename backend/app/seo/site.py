"""Site-wide facts for titles, JSON-LD and the footer the renderer emits.

Operator identity mirrors `src/legal/documents.ts` (OPERATOR) — keep in sync.
Owner-editable extras (verification tokens, intro text, address details,
hours, social links) come from the settings table via `get_seo_config`.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.config import get_settings
from app.services.settings_store import get_contact_config, get_setting

SITE_NAME = "ROOOMEBEL"
BRAND = "Rooomebel"
REGION = "Республика Дагестан"
REGION_SHORT = "Дагестан"
CITY = "Хасавюрт"
OPERATOR_NAME = "Басханов Рамазан Загирович"
OPERATOR_INN = "054400624877"
OPERATOR_EMAIL = "baskhanovromik@yandex.ru"
DEFAULT_PHONE_DIGITS = "79285199424"
DEFAULT_STREET = "квартал Первая Дача"
DEFAULT_LOCALITY = "Хасавюртовский район"

# Keys in the settings table (admin → Настройки → SEO).
SEO_KEYS = {
    "seo_yandex_verification": "",
    "seo_google_verification": "",
    "seo_home_intro": "",
    "seo_street_address": DEFAULT_STREET,
    "seo_locality": DEFAULT_LOCALITY,
    "seo_opening_hours": "",
    "seo_geo": "",  # "43.2505,46.5856"
    "seo_social_links": "",  # one URL per line
}

DEFAULT_HOME_INTRO = (
    "Rooomebel — мебель собственного производства в Дагестане: кровати, комоды, шкафы, "
    "тумбы и консоли по вашим размерам. Делаем на заказ, доставляем по Хасавюрту, "
    "Махачкале и всей республике."
)


def site_url() -> str:
    return get_settings().public_site_url.rstrip("/")


def absolute(path_or_url: str) -> str:
    if not path_or_url:
        return ""
    if path_or_url.startswith(("http://", "https://")):
        return path_or_url
    return f"{site_url()}/{path_or_url.lstrip('/')}"


def format_phone(digits: str) -> str:
    d = re.sub(r"\D", "", digits or "")
    if len(d) == 11 and d[0] in "78":
        return f"+7 ({d[1:4]}) {d[4:7]}-{d[7:9]}-{d[9:11]}"
    return f"+{d}" if d else ""


def get_seo_config(db: Session) -> dict[str, str]:
    return {key: get_setting(db, key, default) for key, default in SEO_KEYS.items()}


def contact_digits(db: Session) -> dict[str, str]:
    cfg = get_contact_config(db)
    call = re.sub(r"\D", "", cfg.get("call_phone") or "") or DEFAULT_PHONE_DIGITS
    whatsapp = re.sub(r"\D", "", cfg.get("whatsapp_phone") or "") or call
    return {"call": call, "whatsapp": whatsapp}


def organization_jsonld(db: Session, seo: dict[str, str]) -> dict:
    phones = contact_digits(db)
    org: dict = {
        "@context": "https://schema.org",
        "@type": "FurnitureStore",
        "@id": f"{site_url()}/#organization",
        "name": SITE_NAME,
        "alternateName": BRAND,
        "url": site_url() + "/",
        "logo": absolute("/icon-512.png"),
        "image": absolute("/icon-512.png"),
        "telephone": f"+{phones['call']}",
        "email": OPERATOR_EMAIL,
        "priceRange": "₽₽",
        "currenciesAccepted": "RUB",
        "address": {
            "@type": "PostalAddress",
            "streetAddress": seo.get("seo_street_address") or DEFAULT_STREET,
            "addressLocality": seo.get("seo_locality") or DEFAULT_LOCALITY,
            "addressRegion": REGION,
            "addressCountry": "RU",
        },
        "areaServed": [
            {"@type": "AdministrativeArea", "name": REGION},
            {"@type": "City", "name": CITY},
            {"@type": "City", "name": "Махачкала"},
        ],
        "founder": {"@type": "Person", "name": OPERATOR_NAME},
        "taxID": OPERATOR_INN,
    }
    geo = (seo.get("seo_geo") or "").split(",")
    if len(geo) == 2:
        try:
            org["geo"] = {"@type": "GeoCoordinates", "latitude": float(geo[0]), "longitude": float(geo[1])}
        except ValueError:
            pass
    if seo.get("seo_opening_hours"):
        org["openingHours"] = seo["seo_opening_hours"]
    links = [l.strip() for l in (seo.get("seo_social_links") or "").splitlines() if l.strip()]
    if links:
        org["sameAs"] = links
    return org


def website_jsonld() -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": f"{site_url()}/#website",
        "url": site_url() + "/",
        "name": SITE_NAME,
        "inLanguage": "ru-RU",
        "publisher": {"@id": f"{site_url()}/#organization"},
    }


def breadcrumbs_jsonld(items: list[tuple[str, str]]) -> dict:
    """items = [(name, path), …] in order, home first."""
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": absolute(path)}
            for i, (name, path) in enumerate(items)
        ],
    }
