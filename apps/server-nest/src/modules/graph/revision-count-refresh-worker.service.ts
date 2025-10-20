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
    private readonly refreshIntervalMs: number;

    constructor(private readonly db: DatabaseService) {
        this.refreshIntervalMs = parseInt(
            process.env.REVISION_COUNT_REFRESH_INTERVAL_MS || '300000',
            10,
        );
    }

    onModuleInit() {
        this.logger.log(
            `Revision count refresh worker starting (interval=${this.refreshIntervalMs}ms)`,
        );
        this.startRefreshLoop();
    }

    onModuleDestroy() {
        this.logger.log('Revision count refresh worker stopping');
        this.stopRefreshLoop();
    }

    private startRefreshLoop() {
        // Run immediately on startup
        this.refreshRevisionCounts().catch((err) => {
            this.logger.error('Initial revision count refresh failed:', err);
        });

        // Then run periodically
        this.intervalHandle = setInterval(() => {
            this.refreshRevisionCounts().catch((err) => {
                this.logger.error('Scheduled revision count refresh failed:', err);
            });
        }, this.refreshIntervalMs);
    }

    private stopRefreshLoop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
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
