from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CustomerRegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=4, max_length=255)
    # 152-ФЗ: the box is unchecked by default and the server refuses a
    # registration that does not carry an explicit `true`.
    personal_data_consent: bool = False
    # 38-ФЗ: optional, stored separately, never blocks registration.
    marketing_consent: bool = False


class CustomerLoginIn(BaseModel):
    name: str
    password: str


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    marketing_allowed: bool = False
    created_at: datetime


class AccountDeleteIn(BaseModel):
    """Deleting an account is irreversible — require the password again."""

    password: str = Field(min_length=1, max_length=255)
