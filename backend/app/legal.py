"""Legal document versions — single source of truth for the backend.

Every consent row stores the version of the document the user accepted, so
when a document is re-published the owner bumps the matching entry here (and
the mirrored constant in `src/legal/documents.ts`) and can later prove which
edition each user saw.

Versions are ISO dates of publication; they are exposed publicly via
`GET /config` → `legal_versions` so the SPA can display and send them.
"""
from __future__ import annotations

import enum


class ConsentType(str, enum.Enum):
    personal_data = "personal_data"        # 152-ФЗ consent (registration / заявка)
    marketing = "marketing"                # advertising messages (38-ФЗ «О рекламе»)
    analytics_cookie = "analytics_cookie"  # cookie banner: analytics ON/OFF
    marketing_cookie = "marketing_cookie"  # cookie banner: marketing ON/OFF
    terms = "terms"                        # «ознакомился с условиями продажи…» at checkout


DOCUMENT_VERSIONS: dict[str, str] = {
    "privacy": "2026-09-06",
    "personal_data_consent": "2026-09-06",
    "marketing_consent": "2026-09-06",
    "cookie_policy": "2026-09-06",
    "offer": "2026-09-06",
}

# Which document governs which consent type.
_DOCUMENT_FOR_TYPE: dict[ConsentType, str] = {
    ConsentType.personal_data: "personal_data_consent",
    ConsentType.marketing: "marketing_consent",
    ConsentType.analytics_cookie: "cookie_policy",
    ConsentType.marketing_cookie: "cookie_policy",
    ConsentType.terms: "offer",
}


def version_for(consent_type: ConsentType | str) -> str:
    ct = ConsentType(consent_type)
    return DOCUMENT_VERSIONS[_DOCUMENT_FOR_TYPE[ct]]
