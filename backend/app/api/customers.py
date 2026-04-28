from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import CurrentCustomer
from app.models import Customer
from app.rate_limit import limiter
from app.schemas.auth import TokenResponse
from app.schemas.customer import CustomerOut, CustomerRegisterIn
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth/customer", tags=["customer-auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")  # registration is cheap on the server but expensive in spam
def register(request: Request, payload: CustomerRegisterIn, db: Annotated[Session, Depends(get_db)]):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name must not be empty")
    customer = Customer(name=name, password_hash=hash_password(payload.password))
    db.add(customer)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A customer with this name already exists")
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
