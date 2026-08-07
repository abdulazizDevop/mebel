from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./dev.db"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    cors_origins: str = "http://localhost:5173"

    bootstrap_admin_name: str = "admin"
    bootstrap_admin_password: str = "admin"

    # VAPID keypair for Web Push. Both halves must be present for push to work;
    # if either is empty we silently skip pushing (useful in tests / dev).
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_subject: str = "mailto:owner@example.com"

    # S3 (or any S3-compatible store: AWS, TimeWeb, Wasabi, Backblaze B2, MinIO).
    # Real values live in .env so they don't end up in git. When `s3_bucket`
    # is empty we fall back to local disk under `uploads/` so dev still works
    # without an account.
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ru-1"
    s3_bucket: str = ""
    s3_endpoint_url: str = ""        # e.g. https://s3.twcstorage.ru — empty for AWS S3
    s3_public_url_prefix: str = ""   # e.g. https://s3.twcstorage.ru/mebel — empty = canonical S3 host
    # Some S3-compatibles (TimeWeb, certain MinIO setups) reject per-object
    # `ACL: public-read` and require a bucket-wide policy instead. When the
    # bucket is already configured for public read access, set this to false
    # so PUT requests don't fail on the ACL header.
    s3_use_acl: bool = True
    upload_max_bytes: int = 10 * 1024 * 1024  # 10 MB hard cap
    # Voice notes are short; the raw browser recording (webm/opus or mp4/aac)
    # is tiny. 10 MB stays safely under the nginx `client_max_body_size 12m`
    # proxy cap (so a valid note is never rejected at the edge) and still allows
    # a very long recording.
    audio_upload_max_bytes: int = 10 * 1024 * 1024
    # Hard ceiling on a single voice note's duration — bounds ffmpeg output so a
    # tiny, highly-compressed input can't transcode into a huge MP3 (audio bomb).
    audio_max_duration_sec: int = 600

    # WhatsApp deep-link target for the "order via WhatsApp" button. Digits only
    # in international form (no +, spaces or dashes), e.g. 79285199424. Empty
    # hides the button.
    whatsapp_phone: str = ""
    # "Позвонить" (call) button target — a tel: link. Digits only, e.g.
    # 79280484048. Empty hides the call line.
    call_phone: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def push_enabled(self) -> bool:
        return bool(self.vapid_private_key and self.vapid_public_key)

    @property
    def s3_enabled(self) -> bool:
        return bool(self.s3_bucket and self.aws_access_key_id and self.aws_secret_access_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
