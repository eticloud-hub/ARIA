"""
ARIA Worker — Configuration
Environment-based config with sensible defaults for local development.
"""
import os
import tempfile
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    """Immutable configuration — loaded once at worker startup."""

    # Redis
    REDIS_BROKER_URL: str = os.getenv("REDIS_BROKER_URL", "redis://localhost:6379/0")
    REDIS_RESULT_BACKEND: str = os.getenv("REDIS_RESULT_BACKEND", "redis://localhost:6379/1")

    # PostgreSQL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://aria_admin:aria_dev_password@localhost:5432/aria"
    )

    # S3 / MinIO
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT", "http://localhost:9000")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "minioadmin")
    S3_ARTIFACTS_BUCKET: str = os.getenv("S3_ARTIFACTS_BUCKET", "aria-artifacts")

    # HABD Engine
    HABD_MIMICRY_THRESHOLD: float = float(os.getenv("HABD_MIMICRY_THRESHOLD", "25"))
    HABD_CONFIDENCE_MINIMUM: float = float(os.getenv("HABD_CONFIDENCE_MINIMUM", "0.6"))

    # Worker
    WORKER_CONCURRENCY: int = int(os.getenv("WORKER_CONCURRENCY", "2"))
    WORKER_PREFETCH_MULTIPLIER: int = int(os.getenv("WORKER_PREFETCH_MULTIPLIER", "1"))

    # Streaming downloads — artifacts are written to temp disk, never held in RAM
    WORKER_TEMP_DIR: str = os.getenv("WORKER_TEMP_DIR", tempfile.gettempdir())
    WORKER_MAX_ARTIFACT_BYTES: int = int(os.getenv("WORKER_MAX_ARTIFACT_BYTES", str(500 * 1024 * 1024)))  # 500MB


config = Config()
