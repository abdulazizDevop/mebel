from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Setting(Base):
    """Generic key-value store for owner-editable site settings (WhatsApp / call
    numbers today; extensible later). Edited from the admin Settings tab so the
    owner can change values without touching env or redeploying."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
