"""Owner-editable contact numbers must come out in wa.me / tel: form."""
import pytest

from app.services.settings_store import normalize_phone


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("+7 (928) 519-94-24", "79285199424"),
        ("79285199424", "79285199424"),
        ("928 519-94-24", "79285199424"),      # 10 digits → add country code
        ("8 (928) 519-94-24", "79285199424"),  # trunk 8 → 7
        ("+998 90 123 45 67", "998901234567"),  # non-Russian numbers untouched
        ("", ""),
    ],
)
def test_normalize_phone(typed, expected):
    assert normalize_phone(typed) == expected


def test_contact_settings_roundtrip(client, admin_token):
    from conftest import auth

    res = client.put(
        "/admin/settings/contact",
        json={"whatsapp_phone": "928 519-94-24", "call_phone": "8 928 048-40-48"},
        headers=auth(admin_token),
    )
    assert res.status_code == 200, res.text
    cfg = client.get("/config").json()
    assert cfg["whatsapp_phone"] == "79285199424"
    assert cfg["call_phone"] == "79280484048"
