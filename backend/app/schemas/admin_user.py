from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import UserRole


class AdminUserOut(BaseModel):
    """Public-shape view of a staff user — never includes the password hash."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    role: UserRole
    sections: list[str] = Field(default_factory=list)
    created_at: datetime


class AdminUserCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=4, max_length=255)
    role: UserRole = UserRole.viewer
    sections: list[str] = Field(default_factory=list)


class AdminUserUpdateIn(BaseModel):
    """All fields optional. Pass `password` to reset it (admin-side reset —
    no current-password check, that's `/auth/me/password` for self-service)."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=4, max_length=255)
    role: UserRole | None = None
    sections: list[str] | None = None
