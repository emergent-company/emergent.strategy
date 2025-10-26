import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

/**
 * Background worker that periodically refreshes the materialized view
 * containing revision counts for all graph objects.
 *
 * This ensures the revision_count field stays current as objects are
 * created, updated, or deleted.
 *
 * Configuration:
 * - REVISION_COUNT_REFRESH_INTERVAL_MS: Refresh interval in milliseconds (default: 300000 = 5 minutes)
 */
@Injectable()
export class RevisionCountRefreshWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RevisionCountRefreshWorkerService.name);
    private intervalHandle: NodeJS.Timeout | null = null;
    private currentRefresh: Promise<number> | null = null;
    private readonly refreshIntervalMs: number;

    constructor(private readonly db: DatabaseService) {
        this.refreshIntervalMs = parseInt(
            process.env.REVISION_COUNT_REFRESH_INTERVAL_MS || '300000',
            10,
        );
    }

    onModuleInit() {
        // Disable during tests unless explicitly enabled
        if (process.env.NODE_ENV === 'test' && process.env.ENABLE_WORKERS_IN_TESTS !== 'true') {
            this.logger.debug('Revision count refresh worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)');
            return;
        }

        this.logger.log(
            `Revision count refresh worker starting (interval=${this.refreshIntervalMs}ms)`,
        );
        this.startRefreshLoop();
    }

    async onModuleDestroy() {
        this.logger.log('Revision count refresh worker stopping');
        await this.stopRefreshLoop();
    }

    private startRefreshLoop() {
        // Run immediately on startup
        this.currentRefresh = this.refreshRevisionCounts();
        this.currentRefresh.catch((err) => {
            this.logger.error('Initial revision count refresh failed:', err);
        });

        // Then run periodically
        this.intervalHandle = setInterval(() => {
            this.currentRefresh = this.refreshRevisionCounts();
            this.currentRefresh.catch((err) => {
                this.logger.error('Scheduled revision count refresh failed:', err);
            });
        }, this.refreshIntervalMs);
    }

    private async stopRefreshLoop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }

        // Wait for current refresh to finish to avoid orphaned promises
        if (this.currentRefresh) {
            this.logger.debug('Waiting for current refresh to complete before stopping...');
            try {
                await this.currentRefresh;
            } catch (error) {
                this.logger.warn('Current refresh failed during shutdown', error);
            } finally {
                this.currentRefresh = null;
            }
        }
    }

    /**
     * Refreshes the materialized view containing revision counts.
     * Uses CONCURRENTLY to avoid blocking other queries.
     *
     * @returns Promise<number> Number of objects tracked after refresh
     */
    async refreshRevisionCounts(): Promise<number> {
        const startTime = Date.now();

        try {
            this.logger.debug('Starting revision count refresh...');

            // Call the helper function created in migration 0006
            const result = await this.db.query<{ refresh_result: number }>(
                'SELECT kb.refresh_revision_counts() as refresh_result',
            );

            const objectCount = result.rows[0]?.refresh_result || 0;
            const durationMs = Date.now() - startTime;

            this.logger.log(
                `Revision count refresh complete: ${objectCount} objects tracked (took ${durationMs}ms)`,
            );

            return objectCount;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error(
                `Revision count refresh failed after ${durationMs}ms:`,
                error instanceof Error ? error.message : String(error),
            );
            throw error;
        }
    }

    /**
     * Manual trigger for testing or admin operations.
     * Can be called via API endpoint if needed.
     */
    async triggerRefresh(): Promise<number> {
        this.logger.log('Manual revision count refresh triggered');
        return this.refreshRevisionCounts();
    }

    /**
     * Get current statistics from the materialized view.
     * Useful for monitoring and debugging.
     */
    async getStatistics(): Promise<{
        total_objects: number;
        avg_revisions: number;
        max_revisions: number;
        objects_with_multiple_versions: number;
    }> {
        const result = await this.db.query<{
            total_objects: string;
            avg_revisions: string;
            max_revisions: number;
            objects_with_multiple_versions: string;
        }>(`
      SELECT 
        COUNT(*) as total_objects,
        AVG(revision_count) as avg_revisions,
        MAX(revision_count) as max_revisions,
        COUNT(*) FILTER (WHERE revision_count > 1) as objects_with_multiple_versions
      FROM kb.graph_object_revision_counts
    `);

        const row = result.rows[0];
        return {
            total_objects: parseInt(row.total_objects, 10),
            avg_revisions: parseFloat(row.avg_revisions),
            max_revisions: row.max_revisions,
            objects_with_multiple_versions: parseInt(row.objects_with_multiple_versions, 10),
        };
    }
}
