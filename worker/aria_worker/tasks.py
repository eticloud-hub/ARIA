"""
ARIA Worker — Celery Tasks
Orchestrates the HABD analysis pipeline from artifact download to result storage.

Refactored from v1:
- Artifacts are streamed to temp disk via s3.download_fileobj() — never held in RAM.
- Temp files are cleaned up in a finally block.
- Max artifact size guard prevents absurd files from filling disk.
- Parsers read from file paths, not bytes.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import asdict
from pathlib import Path

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
import boto3
from celery.signals import worker_process_init, worker_process_shutdown

from .celery_app import app
from .config import config
from .parsers import normalize_artifact_file
from .engine import HABDEngine

logger = logging.getLogger(__name__)

db_pool: ThreadedConnectionPool | None = None


@worker_process_init.connect
def init_worker_db_pool(**kwargs):
    """Initialize a persistent connection pool when the Celery worker process boots."""
    global db_pool
    logger.info("Initializing PostgreSQL ThreadedConnectionPool for worker process")
    db_pool = ThreadedConnectionPool(1, 10, dsn=config.DATABASE_URL)


@worker_process_shutdown.connect
def shutdown_worker_db_pool(**kwargs):
    """Close the connection pool cleanly when the worker shuts down."""
    global db_pool
    if db_pool:
        logger.info("Closing PostgreSQL ThreadedConnectionPool")
        db_pool.closeall()
        db_pool = None
def _create_s3_client():
    """Create a reusable S3/MinIO client."""
    return boto3.client(
        "s3",
        endpoint_url=config.S3_ENDPOINT,
        aws_access_key_id=config.S3_ACCESS_KEY,
        aws_secret_access_key=config.S3_SECRET_KEY,
        region_name=config.S3_REGION,
    )


def _stream_artifact_to_disk(s3, key: str, temp_dir: str) -> Path:
    """
    Stream an S3 object to a temp file on disk.

    Before (v1): response["Body"].read() → entire artifact in RAM → OOM at scale
    After:       s3.download_fileobj()  → streamed to disk in 8MB chunks → O(1) RAM

    Returns the path to the temp file (caller must clean up).
    """
    # Check size before downloading
    head = s3.head_object(Bucket=config.S3_ARTIFACTS_BUCKET, Key=key)
    content_length = head.get("ContentLength", 0)

    if content_length > config.WORKER_MAX_ARTIFACT_BYTES:
        raise ValueError(
            f"Artifact {key} is {content_length} bytes, exceeds "
            f"max {config.WORKER_MAX_ARTIFACT_BYTES} bytes"
        )

    # Stream to temp file — never held in RAM
    file_format = key.rsplit("/", 1)[-1]
    fd, temp_path = tempfile.mkstemp(
        suffix=f".{file_format}",
        dir=temp_dir,
        prefix="aria_artifact_",
    )

    try:
        with os.fdopen(fd, "wb") as f:
            s3.download_fileobj(config.S3_ARTIFACTS_BUCKET, key, f)
    except Exception:
        # Clean up partial download on failure
        os.unlink(temp_path)
        raise

    logger.info(f"Streamed {content_length} bytes to {temp_path}")
    return Path(temp_path)


@app.task(
    name="aria_worker.habd_analysis",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def habd_analysis(self, payload: dict) -> dict:
    """
    Main HABD analysis task.
    Per TRD: Hermetic execution — no external API calls.

    Pipeline:
      1. Update job status → running
      2. Stream artifacts from S3 → temp disk (never in RAM)
      3. Parse + normalize log data from file paths
      4. Run HABD 5-dimension engine
      5. Store results in PostgreSQL
      6. Update job + case status
      7. Clean up temp files
    """
    job_id = payload["jobId"]
    case_id = payload["caseId"]
    organisation_id = payload["organisationId"]
    artifact_keys = payload["artifactKeys"]
    worker_id = self.request.hostname or "unknown"

    conn = None
    temp_files: list[Path] = []

    try:
        if db_pool is None:
            # Fallback for dev/testing if signals didn't fire
            conn = psycopg2.connect(config.DATABASE_URL)
        else:
            conn = db_pool.getconn()
            
        conn.autocommit = False

        # 1. Mark job as running
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE analysis_jobs SET status = 'running', started_at = now(), worker_id = %s WHERE id = %s",
                (worker_id, job_id),
            )
            cur.execute(
                "UPDATE cases SET status = 'analysing' WHERE id = %s",
                (case_id,),
            )
            conn.commit()

        self.update_state(state="PROGRESS", meta={"step": "downloading_artifacts"})

        # 2. Stream artifacts to temp disk
        s3 = _create_s3_client()
        temp_dir = config.WORKER_TEMP_DIR

        all_events = []
        for key in artifact_keys:
            self.update_state(state="PROGRESS", meta={"step": f"streaming_{key}"})
            try:
                temp_path = _stream_artifact_to_disk(s3, key, temp_dir)
                temp_files.append(temp_path)

                # 3. Parse from file path (not bytes)
                file_format = key.rsplit("/", 1)[-1]
                events = normalize_artifact_file(temp_path, file_format)
                all_events.extend(events)
                logger.info(f"Parsed {len(events)} events from {key}")

            except Exception as e:
                logger.error(f"Failed to process artifact {key}: {e}")

        if not all_events:
            raise ValueError("No events extracted from artifacts")

        # 4. Run HABD engine
        self.update_state(state="PROGRESS", meta={"step": "habd_analysis"})
        engine = HABDEngine()
        result = engine.analyze(all_events)

        # 5. Store results
        self.update_state(state="PROGRESS", meta={"step": "storing_results"})
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO analysis_results
                   (job_id, case_id, organisation_id, human_attribution_score,
                    confidence_interval_low, confidence_interval_high, mimicry_flag,
                    dimension_scores, insufficient_data_dimensions,
                    agent_profile_notes, session_breakdown,
                    engine_manifest, executive_summary)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    job_id, case_id, organisation_id,
                    result.human_attribution_score,
                    result.confidence_interval_low,
                    result.confidence_interval_high,
                    result.mimicry_flag,
                    json.dumps([asdict(d) for d in result.dimension_scores]),
                    result.insufficient_data_dimensions,
                    result.agent_profile_notes,
                    json.dumps(result.session_breakdown) if result.session_breakdown else None,
                    json.dumps(result.engine_manifest),
                    result.executive_summary,
                ),
            )

            # 6. Update job + case status
            cur.execute(
                """UPDATE analysis_jobs
                   SET status = 'complete', completed_at = now(),
                       engine_version = %s
                   WHERE id = %s""",
                (HABDEngine.VERSION, job_id),
            )
            cur.execute(
                "UPDATE cases SET status = 'complete', completed_at = now() WHERE id = %s",
                (case_id,),
            )

            # Audit event
            cur.execute(
                """INSERT INTO audit_events
                   (organisation_id, event_type, entity_type, entity_id, payload)
                   VALUES (%s, 'ANALYSIS_COMPLETED', 'analysis_job', %s, %s)""",
                (
                    organisation_id, job_id,
                    json.dumps({
                        "score": result.human_attribution_score,
                        "mimicry_flag": result.mimicry_flag,
                        "event_count": len(all_events),
                    }),
                ),
            )

            conn.commit()

        logger.info(
            f"Analysis complete for case {case_id}: "
            f"score={result.human_attribution_score}, "
            f"mimicry={result.mimicry_flag}"
        )

        return {
            "job_id": job_id,
            "score": result.human_attribution_score,
            "mimicry_flag": result.mimicry_flag,
        }

    except Exception as exc:
        logger.error(f"Analysis failed for job {job_id}: {exc}")
        if conn:
            try:
                conn.rollback()
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE analysis_jobs
                           SET status = 'failed', error_message = %s, completed_at = now()
                           WHERE id = %s""",
                        (str(exc), job_id),
                    )
                    cur.execute(
                        "UPDATE cases SET status = 'error' WHERE id = %s",
                        (case_id,),
                    )
                    cur.execute(
                        """INSERT INTO audit_events
                           (organisation_id, event_type, entity_type, entity_id, payload)
                           VALUES (%s, 'ANALYSIS_FAILED', 'analysis_job', %s, %s)""",
                        (organisation_id, job_id, json.dumps({"error": str(exc)})),
                    )
                    conn.commit()
            except Exception as db_err:
                logger.error(f"Failed to update job status on failure: {db_err}")

        raise self.retry(exc=exc)

    finally:
        # 7. Clean up temp files — ALWAYS runs
        for temp_path in temp_files:
            try:
                if temp_path.exists():
                    temp_path.unlink()
                    logger.debug(f"Cleaned up temp file: {temp_path}")
            except OSError as e:
                logger.warning(f"Failed to clean up {temp_path}: {e}")

        if conn:
            if db_pool is not None:
                # Return connection to the shared pool
                db_pool.putconn(conn)
            else:
                conn.close()
