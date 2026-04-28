"""Bootstrap the first admin user.

Run with:
    python -m app.seed

Reads BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_PASSWORD from .env. Idempotent —
won't create a duplicate. Useful immediately after `alembic upgrade head` so you
can log into /docs without manually inserting a user.
"""
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import User, UserRole
from app.security import hash_password


def main() -> None:
    settings = get_settings()
    name = settings.bootstrap_admin_name
    password = settings.bootstrap_admin_password

    with SessionLocal() as db:
        existing = db.execute(select(User).where(User.name == name)).scalar_one_or_none()
        if existing is not None:
            print(f"[seed] admin '{name}' already exists, skipping")
            return

        admin = User(
            name=name,
            password_hash=hash_password(password),
            role=UserRole.admin,
            sections=[],
        )
        db.add(admin)
        db.commit()
        print(f"[seed] created admin '{name}'. Change this password after first login.")


if __name__ == "__main__":
    main()
