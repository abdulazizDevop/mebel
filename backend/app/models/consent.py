import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConsentStatus(str, enum.Enum):
    active = "active"    # consent given and not withdrawn
    revoked = "revoked"  # consent withdrawn later (revoked_at is set)
    denied = "denied"    # user explicitly declined (evidence that we must NOT process)


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ConsentLog(Base):
    """Append-only evidence of every consent decision (152-ФЗ ст. 9).

    Rows are written server-side only (registration, checkout, cookie banner,
    profile). There is no customer-facing endpoint that can edit or delete a
    row; withdrawal flips `status` → `revoked` and stamps `revoked_at`, the
    original row is never rewritten. Anonymous visitors are keyed by
    `request_id` (a random visitor id or the order UUID) instead of `customer_id`.
    """

    __tablename__ = "consent_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    customer_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    consent_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    document_version: Mapped[str] = mapped_column(String(32), nullable=False)
    source_form: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=ConsentStatus.active.value)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
