from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SlugHistory(Base):
    """Old slugs that still have to resolve after a rename.

    QR codes, WhatsApp messages and business cards carry the URL that was
    current when they were printed; when the admin renames «Кровать Турция»
    the old `krovat-turtsiya` row stays here and the API answers the lookup
    with the current product so the frontend / renderer can 301.
    """

    __tablename__ = "slug_history"
    __table_args__ = (UniqueConstraint("entity", "slug", name="uq_slug_history_entity_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity: Mapped[str] = mapped_column(String(16), nullable=False)  # "product" | "category"
    slug: Mapped[str] = mapped_column(String(96), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
