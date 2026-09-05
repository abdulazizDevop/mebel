"""Test bootstrap: isolated SQLite file, rate limiter off, fresh schema.

Environment MUST be set before `app.*` is imported — `app.config.get_settings`
is cached on first call and `app.database` builds the engine at import time.
"""
import os
import pathlib
import tempfile

_TMP = pathlib.Path(tempfile.mkdtemp(prefix="mebel-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["JWT_SECRET"] = "test-secret-not-for-production"
os.environ["CORS_ORIGINS"] = "http://localhost"
os.environ["S3_BUCKET"] = ""  # local-disk uploads; never touch real storage from tests

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import app.models  # noqa: E402,F401  (register every table on Base)
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.rate_limit import limiter  # noqa: E402
from app.security import hash_password  # noqa: E402

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    limiter.enabled = False  # per-IP limits would trip across the suite
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_token(client: TestClient, db: Session) -> str:
    name, password = "owner-test", "owner-pass-123"
    if db.query(User).filter(User.name == name).first() is None:
        db.add(User(name=name, password_hash=hash_password(password), role=UserRole.admin, sections=[]))
        db.commit()
    res = client.post("/auth/login", data={"username": name, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


_counter = {"n": 0}


def unique_name(prefix: str = "user") -> str:
    _counter["n"] += 1
    return f"{prefix}-{_counter['n']}"


def register(client: TestClient, *, marketing: bool = False, name: str | None = None) -> tuple[str, str, str]:
    """Registers a customer with the required consent. Returns (name, password, token)."""
    name = name or unique_name()
    password = "secret-pass-1"
    res = client.post(
        "/auth/customer/register",
        json={
            "name": name,
            "password": password,
            "personal_data_consent": True,
            "marketing_consent": marketing,
        },
    )
    assert res.status_code == 201, res.text
    return name, password, res.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
