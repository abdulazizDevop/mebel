"""Print a fresh VAPID keypair to stdout. Run once and paste the output
into your .env (or to the prod environment variables).

    python -m app.gen_vapid

The keys MUST stay paired — losing the private key invalidates every
existing browser subscription, so customers/admins would have to re-grant
notification permission. Keep the private key off git.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    # Web Push expects the private key as a base64url-encoded raw 32-byte
    # scalar (RFC 8292 §3) — that's what `pywebpush` consumes via the
    # `vapid_private_key` field when you pass a string.
    priv_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")

    # The public key gets published to the browser; it's the uncompressed EC
    # point form (`0x04 || x || y`, 65 bytes total).
    pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    print("# ─── Paste into backend/.env ─────────────────────────────────────")
    print(f"VAPID_PRIVATE_KEY={_b64url(priv_bytes)}")
    print(f"VAPID_PUBLIC_KEY={_b64url(pub_bytes)}")
    print("VAPID_SUBJECT=mailto:owner@rooomebel.uz   # change to your real address")
    print("# ─────────────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()
