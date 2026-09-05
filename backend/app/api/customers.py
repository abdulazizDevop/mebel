from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import CurrentCustomer
from app.legal import ConsentType
from app.models import AnalyticsEvent, ConsentLog, ConsentStatus, Customer, Order, PushToken
from app.rate_limit import limiter
from app.schemas.auth import TokenResponse
from app.schemas.customer import AccountDeleteIn, CustomerOut, CustomerRegisterIn
from app.security import create_access_token, hash_password, verify_password
from app.services.consent import record_consent

router = APIRouter(prefix="/auth/customer", tags=["customer-auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")  # registration is cheap on the server but expensive in spam
def register(request: Request, payload: CustomerRegisterIn, db: Annotated[Session, Depends(get_db)]):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name must not be empty")
    # 152-ФЗ ст. 9: consent must be specific, informed and explicit. The
    # frontend blocks the form too, but the server is the authority.
    if not payload.personal_data_consent:
        raise HTTPException(
            status_code=400,
            detail="Необходимо согласие на обработку персональных данных",
        )

    customer = Customer(
        name=name,
        password_hash=hash_password(payload.password),
        marketing_allowed=bool(payload.marketing_consent),
    )
    db.add(customer)
    try:
        db.flush()  # assigns id / raises on duplicate name
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A customer with this name already exists")

    # Consent rows live in the same transaction as the account they authorise.
    record_consent(
        db,
        consent_type=ConsentType.personal_data,
        granted=True,
        source_form="register",
        customer_id=customer.id,
        request=request,
    )
    record_consent(
        db,
        consent_type=ConsentType.marketing,
        granted=bool(payload.marketing_consent),
        source_form="register",
        customer_id=customer.id,
        request=request,
    )
    db.commit()
    db.refresh(customer)
    settings = get_settings()
    token = create_access_token(customer.id, extra={"kind": "customer"})
    return TokenResponse(access_token=token, expires_in_minutes=settings.jwt_expire_minutes)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    customer = db.execute(select(Customer).where(Customer.name == form.username)).scalar_one_or_none()
    if customer is None or not verify_password(form.password, customer.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid name or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    settings = get_settings()
    token = create_access_token(customer.id, extra={"kind": "customer"})
    return TokenResponse(access_token=token, expires_in_minutes=settings.jwt_expire_minutes)


@router.get("/me", response_model=CustomerOut)
def me(customer: CurrentCustomer):
    return customer


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def delete_me(
    request: Request,
    payload: AccountDeleteIn,
    customer: CurrentCustomer,
    db: Annotated[Session, Depends(get_db)],
):
    """«Удалить аккаунт» (spec §22, 152-ФЗ ст. 21).

    - the account row (login + password hash) is deleted;
    - push subscriptions and analytics links to the account are removed;
    - orders are KEPT but detached from the account: they document a concluded
      contract and are retained on that legal basis (ГК РФ, 2300-1) — see
      compliance/data-retention-policy.md for the retention clock;
    - consent rows are marked revoked and detached (evidence is preserved
      under `request_id = deleted:<id>` without any link to a living account).
    """
    if not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Неверный пароль")

    now = datetime.now(timezone.utc)
    cid = customer.id
    db.execute(
        update(ConsentLog)
        .where(ConsentLog.customer_id == cid, ConsentLog.status == ConsentStatus.active.value)
        .values(status=ConsentStatus.revoked.value, revoked_at=now)
    )
    db.execute(
        update(ConsentLog)
        .where(ConsentLog.customer_id == cid)
        .values(customer_id=None, request_id=f"deleted:{cid}")
    )
    db.execute(update(Order).where(Order.customer_id == cid).values(customer_id=None))
    db.execute(update(AnalyticsEvent).where(AnalyticsEvent.customer_id == cid).values(customer_id=None))
    db.execute(delete(PushToken).where(PushToken.customer_id == cid))
    db.delete(customer)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
