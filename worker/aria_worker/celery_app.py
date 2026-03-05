"""
ARIA Worker — Celery Application
Configured per TRD: Redis broker, single prefetch for CPU-bound tasks.
"""
from celery import Celery
from .config import config

app = Celery("aria_worker")

app.conf.update(
    broker_url=config.REDIS_BROKER_URL,
    result_backend=config.REDIS_RESULT_BACKEND,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    worker_concurrency=config.WORKER_CONCURRENCY,
    worker_prefetch_multiplier=config.WORKER_PREFETCH_MULTIPLIER,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3300,  # 55 min soft limit
    broker_connection_retry_on_startup=True,
)

# Auto-discover tasks
app.autodiscover_tasks(["aria_worker"])
