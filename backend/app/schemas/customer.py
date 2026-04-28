from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CustomerRegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=4, max_length=255)


class CustomerLoginIn(BaseModel):
    name: str
    password: str


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
