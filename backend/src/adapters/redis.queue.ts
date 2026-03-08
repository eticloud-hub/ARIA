import { Queue } from 'bullmq';
import { getConfig } from '../config';
import type { QueuePort, AnalysisJobPayload } from '../ports/queue.port';

export class RedisQueueAdapter implements QueuePort {
    private analysisQueue: Queue;
    private pdfQueue: Queue;

    constructor() {
        const config = getConfig();
        const connection = { url: config.REDIS_QUEUE_URL };

        this.analysisQueue = new Queue('analysis', {
            connection,
            defaultJobOptions: {
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                attempts: 3,
                backoff: { type: 'exponential', delay: 30000 },
            },
        });

        this.pdfQueue = new Queue('pdf_generation', {
            connection,
            defaultJobOptions: {
                removeOnComplete: { count: 500 },
                removeOnFail: { count: 2000 },
                attempts: 2,
                backoff: { type: 'exponential', delay: 15000 },
            },
        });
    }

    async enqueueAnalysis(payload: AnalysisJobPayload): Promise<string> {
        const job = await this.analysisQueue.add('habd-analysis', payload, {
            jobId: payload.jobId,
            priority: payload.priority === 'urgent' ? 1 : 10,
        });
        return job.id || payload.jobId;
    }

    async enqueuePdfGeneration(payload: {
        reportId: string;
        caseId: string;
        analysisResultId: string;
        generatedBy: string;
    }): Promise<string> {
        const job = await this.pdfQueue.add('generate-pdf', payload, {
            jobId: payload.reportId,
        });
        return job.id || payload.reportId;
    }

    async getJobStatus(jobId: string): Promise<{
        status: 'waiting' | 'active' | 'completed' | 'failed';
        progress?: number;
    } | null> {
        const [analysisJob, pdfJob] = await Promise.all([
            this.analysisQueue.getJob(jobId),
            this.pdfQueue.getJob(jobId)
        ]);

        const job = analysisJob || pdfJob;

        if (!job) return null;

        const state = await job.getState();
        return {
            status: state as 'waiting' | 'active' | 'completed' | 'failed',
            progress: typeof job.progress === 'number' ? job.progress : undefined,
        };
    }
}
