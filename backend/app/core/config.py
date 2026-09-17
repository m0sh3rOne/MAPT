from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    PROJECT_NAME: str = "MAPT - Plateforme de Déploiement et Administration de Parc"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "mapt_super_secret_jwt_key_for_development_change_in_production_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    DEFAULT_ENROLLMENT_TOKEN: str = "mapt-enroll-secret-token-2026"
    TIMEZONE: str = "Europe/Paris"

    # Initial Super Admin Account
    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_PASSWORD: str = "Admin123!"
    INITIAL_ADMIN_EMAIL: str = "admin@mapt.local"

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "mapt"
    POSTGRES_PASSWORD: str = "mapt_db_pass_2026"
    POSTGRES_DB: str = "mapt"
    SQLALCHEMY_DATABASE_URI: str | None = None

    @property
    def async_database_url(self) -> str:
        if self.SQLALCHEMY_DATABASE_URI:
            return self.SQLALCHEMY_DATABASE_URI
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def sync_database_url(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None
    
    @property
    def redis_url(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # MinIO / S3 Storage
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_NAME: str = "mapt-packages"
    MINIO_SECURE: bool = False

    # Agent thresholds & intervals
    AGENT_OFFLINE_THRESHOLD_SECONDS: int = 90
    AGENT_HEARTBEAT_INTERVAL_SECONDS: int = 30
    AGENT_JOB_POLL_INTERVAL_SECONDS: int = 30
    AGENT_INVENTORY_INTERVAL_SECONDS: int = 3600

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost",
        "http://127.0.0.1",
        "*"
    ]


settings = Settings()
