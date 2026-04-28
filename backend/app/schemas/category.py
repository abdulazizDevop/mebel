from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    sort_order: int | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sort_order: int
    created_at: datetime
