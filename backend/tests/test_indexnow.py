"""IndexNow key file + payload; submissions are disabled in tests (conftest)."""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.services import indexnow


def test_build_payload_shape():
    p = indexnow.build_payload("rooomebel.ru", "abc123", ["https://rooomebel.ru/catalog/krovati"])
    assert p == {
        "host": "rooomebel.ru",
        "key": "abc123",
        "keyLocation": "https://rooomebel.ru/abc123.txt",
        "urlList": ["https://rooomebel.ru/catalog/krovati"],
    }


def test_key_file_is_served_by_renderer(client: TestClient, db: Session):
    with SessionLocal() as s:
        key = indexnow.get_or_create_key(s)
        assert indexnow.get_or_create_key(s) == key  # stable
    res = client.get(f"/_render/{key}.txt")
    assert res.status_code == 200
    assert res.text == key
    assert res.headers["content-type"].startswith("text/plain")
    # A random .txt is still a 404 page, not the key.
    assert client.get("/_render/not-the-key.txt").status_code == 404


def test_submit_is_disabled_in_tests(db: Session):
    assert indexnow.submit_paths(db, ["/catalog"]) is False
