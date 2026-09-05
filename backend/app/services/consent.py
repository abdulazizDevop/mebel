"""ConsentLog writers — the only code path that creates or revokes consent rows."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.legal import ConsentType, version_for
from app.models.consent import ConsentLog, ConsentStatus


def _client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client else None


def _user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    ua = request.headers.get("user-agent")
    return ua[:255] if ua else None


def record_consent(
    db: Session,
    *,
    consent_type: ConsentType | str,
    granted: bool,
    source_form: str,
    customer_id: str | None = None,
    request_id: str | None = None,
    document_version: str | None = None,
    request: Request | None = None,
) -> ConsentLog:
    """Append one consent decision. Does NOT commit — callers commit with the
    surrounding business transaction so a consent row can never exist without
    the registration / order it belongs to (and vice versa)."""
    ct = ConsentType(consent_type)
    row = ConsentLog(
        customer_id=customer_id,
        request_id=(request_id or None) and str(request_id)[:64],
        consent_type=ct.value,
        document_version=(document_version or version_for(ct))[:32],
        source_form=source_form[:64],
        status=ConsentStatus.active.value if granted else ConsentStatus.denied.value,
        ip=_client_ip(request),
        user_agent=_user_agent(request),
    )
    db.add(row)
    return row


def revoke_consents(db: Session, *, customer_id: str, consent_type: ConsentType | str) -> int:
    """Flip every ACTIVE row of this type for the customer to REVOKED. Returns
    the number of rows touched. Does not commit."""
    ct = ConsentType(consent_type)
    now = datetime.now(timezone.utc)
    result = db.execute(
        update(ConsentLog)
        .where(
            ConsentLog.customer_id == customer_id,
            ConsentLog.consent_type == ct.value,
            ConsentLog.status == ConsentStatus.active.value,
        )
        .values(status=ConsentStatus.revoked.value, revoked_at=now)
    )
    return int(result.rowcount or 0)


def has_active_consent(db: Session, *, customer_id: str, consent_type: ConsentType | str) -> bool:
    ct = ConsentType(consent_type)
    row = db.execute(
        select(ConsentLog.id).where(
            ConsentLog.customer_id == customer_id,
            ConsentLog.consent_type == ct.value,
            ConsentLog.status == ConsentStatus.active.value,
        ).limit(1)
    ).first()
    return row is not None
