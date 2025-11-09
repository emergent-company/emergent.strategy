import { describe, it, expect, vi } from 'vitest';
import { EmbeddingWorkerService } from '../embedding-worker.service';
import { EmbeddingJobsService } from '../embedding-jobs.service';

describe('EmbeddingWorkerService Metrics', () => {
    it('increments success and failure counters for processed batch', async () => {
        const successJob = { id: 'job-success', object_id: 'obj-success', status: 'pending', attempt_count: 0, last_error: null, priority: 0, scheduled_at: '', started_at: null, completed_at: null, created_at: '', updated_at: '' } as const;
        const failJob = { id: 'job-fail', object_id: 'obj-fail', status: 'pending', attempt_count: 0, last_error: null, priority: 0, scheduled_at: '', started_at: null, completed_at: null, created_at: '', updated_at: '' } as const;

        const jobs: Pick<EmbeddingJobsService, 'dequeue' | 'markCompleted' | 'markFailed'> = {
            dequeue: vi.fn().mockResolvedValue([successJob as any, failJob as any]),
            markCompleted: vi.fn().mockResolvedValue(undefined),
            markFailed: vi.fn().mockResolvedValue(undefined),
        };

        const db = {
            isOnline: () => true,
        };

        // Mock the TypeORM repository (service now uses graphObjectRepo instead of db.query)
        const graphObjectRepo = {
            findOne: vi.fn(async ({ where }: any) => {
                if (where.id === 'obj-success') {
                    return { id: 'obj-success', properties: { body: 'success' }, type: 'doc', key: 'success-key' };
                }
                if (where.id === 'obj-fail') {
                    return { id: 'obj-fail', properties: { body: 'fail' }, type: 'doc', key: 'fail-key' };
                }
                return null;
            }),
            update: vi.fn().mockResolvedValue({ affected: 1 }),
        };

        const provider = {
            generate: vi.fn(async (text: string) => {
                if (text.includes('fail')) {
                    throw new Error('forced_failure');
                }
                return new Uint8Array([1, 2, 3]);
            }),
        };

        const config = { embeddingsEnabled: true } as any;
        const worker = new EmbeddingWorkerService(jobs as any, db as any, graphObjectRepo as any, config, provider as any);

        await worker.processBatch();

        expect(jobs.dequeue).toHaveBeenCalledTimes(1);
        expect(jobs.markCompleted).toHaveBeenCalledWith('job-success');
        expect(jobs.markFailed).toHaveBeenCalledWith('job-fail', expect.any(Error));

        const stats = worker.stats();
        expect(stats.processed).toBe(2);
        expect(stats.succeeded).toBe(1);
        expect(stats.failed).toBe(1);
    });
});
