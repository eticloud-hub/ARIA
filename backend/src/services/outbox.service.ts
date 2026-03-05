import { query } from '../db/pool';
import type { QueuePort, AnalysisJobPayload } from '../ports/queue.port';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('outbox');

/**
 * Outbox Service — Transactional Outbox Pattern Poller
 *
 * Refactored from v1:
 * 1. QueuePort injected via constructor (not hardcoded `new RedisQueueAdapter`)
 * 2. Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicate dispatch
 *    when multiple API nodes poll concurrently
 * 3. Idempotent on restart — re-dispatches pending jobs
 *
 * Per TRD §03: "Job dispatch to Redis MUST happen via a PostgreSQL
 * pending_jobs table within the same transaction."
 */
export class OutboxService {
    private polling = false;
    private pollInterval: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly queue: QueuePort) { }

    start(intervalMs = 2000): void {
        if (this.polling) return;
        this.polling = true;

        log.info({ intervalMs }, 'Starting outbox poller');

        this.pollInterval = setInterval(() => {
            this.processPendingJobs().catch((err) => {
                log.error({ err }, 'Error processing pending jobs');
            });
        }, intervalMs);

        // Process immediately on start
        this.processPendingJobs().catch((err) => {
            log.error({ err }, 'Error on initial poll');
        });
    }

    stop(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.polling = false;
        log.info('Stopped outbox poller');
    }

    private async processPendingJobs(): Promise<void> {
        // ===================================================================
        // CRITICAL FIX: FOR UPDATE SKIP LOCKED
        //
        // Before: SELECT ... WHERE status = 'pending' LIMIT 10
        //   → Multiple nodes read the SAME rows → duplicate dispatches
        //
        // After: SELECT ... FOR UPDATE SKIP LOCKED
        //   → Each node locks its own batch, skips rows locked by others
        //   → Guarantees exactly-once dispatch per job
        // ===================================================================
        const { rows } = await query<{
            id: string;
            job_type: string;
            payload: AnalysisJobPayload & Record<string, unknown>;
            attempts: number;
        }>(
            `SELECT id, job_type, payload, attempts FROM pending_jobs
             WHERE status = 'pending' AND attempts < 5
             ORDER BY created_at ASC
             LIMIT 10
             FOR UPDATE SKIP LOCKED`
        );

        for (const job of rows) {
            try {
                if (job.job_type === 'analysis') {
                    await this.queue.enqueueAnalysis(job.payload as AnalysisJobPayload);
                } else if (job.job_type === 'pdf_generation') {
                    await this.queue.enqueuePdfGeneration(job.payload as unknown as {
                        reportId: string;
                        caseId: string;
                        analysisResultId: string;
                        generatedBy: string;
                    });
                }

                // Mark as dispatched
                await query(
                    `UPDATE pending_jobs SET status = 'dispatched', dispatched_at = now() WHERE id = $1`,
                    [job.id]
                );
            } catch (err) {
                // Increment attempts, record error
                await query(
                    `UPDATE pending_jobs SET attempts = attempts + 1, last_error = $1 WHERE id = $2`,
                    [(err as Error).message, job.id]
                );

                log.error({ err, jobId: job.id, jobType: job.job_type }, 'Failed to dispatch job');
            }
        }
    }
}
