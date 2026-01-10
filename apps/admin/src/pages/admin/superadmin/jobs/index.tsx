import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useSuperadminJobs } from '@/hooks/use-superadmin-jobs';
import { useSuperadminExtractionJobs } from '@/hooks/use-superadmin-extraction-jobs';
import { useSuperadminDocumentParsingJobs } from '@/hooks/use-superadmin-document-parsing-jobs';
import { useSuperadminSyncJobs } from '@/hooks/use-superadmin-sync-jobs';

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function SuperadminJobsOverviewPage() {
  const {
    stats: embeddingStats,
    isLoading: embeddingLoading,
    error: embeddingError,
  } = useSuperadminJobs({ limit: 1 });

  const {
    stats: extractionStats,
    isLoading: extractionLoading,
    error: extractionError,
  } = useSuperadminExtractionJobs({ limit: 1 });

  const {
    stats: conversionStats,
    isLoading: conversionLoading,
    error: conversionError,
  } = useSuperadminDocumentParsingJobs({ limit: 1 });

  const {
    stats: syncStats,
    isLoading: syncLoading,
    error: syncError,
  } = useSuperadminSyncJobs({ limit: 1 });

  const isLoading =
    embeddingLoading || extractionLoading || conversionLoading || syncLoading;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--activity" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Jobs Overview</h1>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-6">
          {/* Extraction Jobs Section */}
          <div className="card bg-base-100 shadow-sm border border-base-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon icon="lucide--file-search" className="size-5 text-info" />
                <h2 className="text-lg font-semibold">Extraction Jobs</h2>
              </div>
              <Link
                to="/admin/superadmin/jobs/extraction"
                className="btn btn-sm btn-ghost"
              >
                View All
                <Icon icon="lucide--arrow-right" className="size-4" />
              </Link>
            </div>

            {extractionError && (
              <div className="alert alert-error mb-4">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{extractionError.message}</span>
              </div>
            )}

            {extractionStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Total</div>
                  <div className="stat-value text-xl">
                    {extractionStats.total}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Queued</div>
                  <div className="stat-value text-xl text-warning">
                    {extractionStats.queued}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Processing</div>
                  <div className="stat-value text-xl text-info">
                    {extractionStats.processing}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Completed</div>
                  <div className="stat-value text-xl text-success">
                    {extractionStats.completed}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Failed</div>
                  <div className="stat-value text-xl text-error">
                    {extractionStats.failed}
                  </div>
                </div>
              </div>
            )}

            {extractionStats && (
              <div className="mt-4 flex items-center gap-4 text-sm text-base-content/70">
                <span>
                  <span className="font-medium text-primary">
                    {extractionStats.totalObjectsCreated}
                  </span>{' '}
                  objects created
                </span>
                <span>
                  <span className="font-medium text-secondary">
                    {extractionStats.totalRelationshipsCreated}
                  </span>{' '}
                  relationships created
                </span>
                {extractionStats.withErrors > 0 && (
                  <span className="text-error">
                    {extractionStats.withErrors} with errors
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Conversion Jobs Section */}
          <div className="card bg-base-100 shadow-sm border border-base-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon icon="lucide--file-cog" className="size-5 text-accent" />
                <h2 className="text-lg font-semibold">Conversion Jobs</h2>
              </div>
              <Link
                to="/admin/superadmin/jobs/conversion"
                className="btn btn-sm btn-ghost"
              >
                View All
                <Icon icon="lucide--arrow-right" className="size-4" />
              </Link>
            </div>

            {conversionError && (
              <div className="alert alert-error mb-4">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{conversionError.message}</span>
              </div>
            )}

            {conversionStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Total</div>
                  <div className="stat-value text-xl">
                    {conversionStats.total}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Pending</div>
                  <div className="stat-value text-xl text-warning">
                    {conversionStats.pending}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Processing</div>
                  <div className="stat-value text-xl text-info">
                    {conversionStats.processing}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Completed</div>
                  <div className="stat-value text-xl text-success">
                    {conversionStats.completed}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Failed</div>
                  <div className="stat-value text-xl text-error">
                    {conversionStats.failed}
                  </div>
                </div>
              </div>
            )}

            {conversionStats && (
              <div className="mt-4 flex items-center gap-4 text-sm text-base-content/70">
                <span>
                  <span className="font-medium text-primary">
                    {formatFileSize(conversionStats.totalFileSizeBytes)}
                  </span>{' '}
                  total file size
                </span>
                {conversionStats.retryPending > 0 && (
                  <span className="text-accent">
                    {conversionStats.retryPending} pending retry
                  </span>
                )}
                {conversionStats.withErrors > 0 && (
                  <span className="text-error">
                    {conversionStats.withErrors} with errors
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Data Source Sync Jobs Section */}
          <div className="card bg-base-100 shadow-sm border border-base-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon
                  icon="lucide--refresh-cw"
                  className="size-5 text-primary"
                />
                <h2 className="text-lg font-semibold">Data Source Sync Jobs</h2>
              </div>
              <Link
                to="/admin/superadmin/jobs/sync"
                className="btn btn-sm btn-ghost"
              >
                View All
                <Icon icon="lucide--arrow-right" className="size-4" />
              </Link>
            </div>

            {syncError && (
              <div className="alert alert-error mb-4">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{syncError.message}</span>
              </div>
            )}

            {syncStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Total</div>
                  <div className="stat-value text-xl">{syncStats.total}</div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Running</div>
                  <div className="stat-value text-xl text-info">
                    {syncStats.running}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Completed</div>
                  <div className="stat-value text-xl text-success">
                    {syncStats.completed}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Failed</div>
                  <div className="stat-value text-xl text-error">
                    {syncStats.failed}
                  </div>
                </div>
                <div className="stat bg-base-200/50 rounded-lg p-4">
                  <div className="stat-title text-xs">Items Imported</div>
                  <div className="stat-value text-xl text-primary">
                    {syncStats.totalItemsImported}
                  </div>
                </div>
              </div>
            )}

            {syncStats && syncStats.withErrors > 0 && (
              <div className="mt-4 flex items-center gap-4 text-sm text-base-content/70">
                <span className="text-error">
                  {syncStats.withErrors} with errors
                </span>
              </div>
            )}
          </div>

          {/* Embedding Jobs Section */}
          <div className="card bg-base-100 shadow-sm border border-base-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon icon="lucide--cpu" className="size-5 text-secondary" />
                <h2 className="text-lg font-semibold">Embedding Jobs</h2>
              </div>
              <Link
                to="/admin/superadmin/jobs/embedding"
                className="btn btn-sm btn-ghost"
              >
                View All
                <Icon icon="lucide--arrow-right" className="size-4" />
              </Link>
            </div>

            {embeddingError && (
              <div className="alert alert-error mb-4">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{embeddingError.message}</span>
              </div>
            )}

            {embeddingStats && (
              <div className="space-y-4">
                {/* Graph Embedding Stats */}
                <div>
                  <h3 className="text-sm font-medium text-base-content/70 mb-2">
                    Graph Embeddings
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Total</div>
                      <div className="stat-value text-lg">
                        {embeddingStats.graphTotal}
                      </div>
                    </div>
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Pending</div>
                      <div className="stat-value text-lg text-warning">
                        {embeddingStats.graphPending}
                      </div>
                    </div>
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Completed</div>
                      <div className="stat-value text-lg text-success">
                        {embeddingStats.graphCompleted}
                      </div>
                    </div>
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Errors</div>
                      <div className="stat-value text-lg text-error">
                        {embeddingStats.graphWithErrors}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chunk Embedding Stats */}
                <div>
                  <h3 className="text-sm font-medium text-base-content/70 mb-2">
                    Chunk Embeddings
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Total</div>
                      <div className="stat-value text-lg">
                        {embeddingStats.chunkTotal}
                      </div>
                    </div>
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Pending</div>
                      <div className="stat-value text-lg text-warning">
                        {embeddingStats.chunkPending}
                      </div>
                    </div>
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Completed</div>
                      <div className="stat-value text-lg text-success">
                        {embeddingStats.chunkCompleted}
                      </div>
                    </div>
                    <div className="stat bg-base-200/50 rounded-lg p-3">
                      <div className="stat-title text-xs">Errors</div>
                      <div className="stat-value text-lg text-error">
                        {embeddingStats.chunkWithErrors}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card bg-base-100 shadow-sm border border-base-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/admin/superadmin/jobs/extraction?status=failed"
                className="btn btn-error btn-outline btn-sm"
              >
                <Icon icon="lucide--alert-circle" className="size-4" />
                View Failed Extraction Jobs
              </Link>
              <Link
                to="/admin/superadmin/jobs/conversion?status=failed"
                className="btn btn-error btn-outline btn-sm"
              >
                <Icon icon="lucide--file-x" className="size-4" />
                View Failed Conversion Jobs
              </Link>
              <Link
                to="/admin/superadmin/jobs/sync?status=failed"
                className="btn btn-error btn-outline btn-sm"
              >
                <Icon icon="lucide--refresh-cw" className="size-4" />
                View Failed Sync Jobs
              </Link>
              <Link
                to="/admin/superadmin/jobs/embedding?hasError=true"
                className="btn btn-warning btn-outline btn-sm"
              >
                <Icon icon="lucide--alert-triangle" className="size-4" />
                View Embedding Jobs with Errors
              </Link>
              <Link
                to="/admin/superadmin/jobs/extraction?status=processing"
                className="btn btn-info btn-outline btn-sm"
              >
                <Icon icon="lucide--loader-2" className="size-4" />
                View Processing Jobs
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
