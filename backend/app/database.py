from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

_settings = get_settings()

_connect_args: dict = {}
if _settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(_settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
