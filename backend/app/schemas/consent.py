from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PublicConsentType = Literal["analytics_cookie", "marketing_cookie", "marketing"]


class ConsentIn(BaseModel):
    """Consent decision sent by the SPA (cookie banner / settings / profile).

    `personal_data` and `terms` are deliberately NOT accepted here — they are
    recorded server-side inside the registration / order transaction so a
    client can't forge them separately from the action they authorise.
    """

    consent_type: PublicConsentType
    granted: bool
    source_form: str = Field(default="cookie_banner", min_length=1, max_length=64)
    request_id: str | None = Field(default=None, max_length=64)
    document_version: str | None = Field(default=None, max_length=32)


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    consent_type: str
    document_version: str
    source_form: str
    status: str
    created_at: datetime
    revoked_at: datetime | None


class ConsentWithdrawIn(BaseModel):
    consent_type: Literal["marketing", "personal_data"]


class ConsentWithdrawOut(BaseModel):
    consent_type: str
    revoked: int
    marketing_allowed: bool
