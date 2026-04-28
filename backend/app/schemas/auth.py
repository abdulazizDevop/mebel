from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    role: UserRole
    sections: list[str] = Field(default_factory=list)
    created_at: datetime


class LoginInput(BaseModel):
    name: str
    password: str
