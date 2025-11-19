/**
 * Extraction Job Detail Page
 *
 * Shows detailed information about a single extraction job
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { ExtractionJobStatusBadge } from '@/components/molecules/ExtractionJobStatusBadge';
import { DebugInfoPanel } from '@/components/molecules/DebugInfoPanel';
import { ExtractionLogsModal } from '@/components/organisms/ExtractionLogsModal';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import {
  createExtractionJobsClient,
  type ExtractionJob,
} from '@/api/extraction-jobs';

export function ExtractionJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { apiBase, fetchJson } = useApi();
  const { config } = useConfig();

  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  // Fetch job details
  useEffect(() => {
    if (!jobId) {
      setError('No job ID provided');
      setIsLoading(false);
      return;
    }

    if (!config.activeProjectId) {
      setError('No active project selected');
      setIsLoading(false);
      return;
    }

    const client = createExtractionJobsClient(
      apiBase,
      fetchJson,
      config.activeProjectId
    );

    const fetchJob = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const jobData = await client.getJob(jobId);
        setJob(jobData);
      } catch (err) {
        console.error('Failed to fetch job details:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load job details'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchJob();

    // Poll for updates if job is running
    let pollInterval: NodeJS.Timeout | undefined;
    if (job?.status === 'running' || job?.status === 'pending') {
      pollInterval = setInterval(() => {
        fetchJob();
      }, 5000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [jobId, config.activeProjectId, apiBase, fetchJson, job?.status]);

  // Cancel job
  const handleCancel = async () => {
    if (!job || !jobId || !config.activeProjectId) return;

    const client = createExtractionJobsClient(
      apiBase,
      fetchJson,
      config.activeProjectId
    );

    setIsCancelling(true);
    try {
      const updatedJob = await client.cancelJob(jobId);
      setJob(updatedJob);
    } catch (err) {
      console.error('Failed to cancel job:', err);
      alert(
        `Failed to cancel job: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsCancelling(false);
    }
  };

  // Delete job
  const handleDelete = async () => {
    if (!job || !jobId || !config.activeProjectId) return;

    if (
      !confirm(
        'Are you sure you want to delete this extraction job? This action cannot be undone.'
      )
    ) {
      return;
    }

    const client = createExtractionJobsClient(
      apiBase,
      fetchJson,
      config.activeProjectId
    );

    setIsDeleting(true);
    try {
      await client.deleteJob(jobId);
      navigate('/admin/extraction-jobs');
    } catch (err) {
      console.error('Failed to delete job:', err);
      alert(
        `Failed to delete job: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
      setIsDeleting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl container">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-8 h-8 skeleton" />
          <div className="w-64 h-8 skeleton" />
        </div>
        <div className="card-border card">
          <div className="card-body">
            <div className="w-full h-32 skeleton" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !job) {
    return (
      <div className="mx-auto max-w-6xl container">
        <Link to="/admin/extraction-jobs" className="mb-6 btn btn-ghost btn-sm">
          <Icon icon="lucide--arrow-left" />
          Back to Jobs
        </Link>
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" />
          <span>{error || 'Job not found'}</span>
        </div>
      </div>
    );
  }

  const progress =
    job.total_items > 0 ? (job.processed_items / job.total_items) * 100 : 0;
  const remainingItems = Math.max(job.total_items - job.processed_items, 0);
  const successRate =
    job.processed_items > 0
      ? (job.successful_items / job.processed_items) * 100
      : null;
  const startedAt = job.started_at ? new Date(job.started_at) : null;
  const lastUpdatedAt = job.updated_at ? new Date(job.updated_at) : null;
  const elapsedSeconds =
    startedAt && lastUpdatedAt
      ? (lastUpdatedAt.getTime() - startedAt.getTime()) / 1000
      : null;
  const throughputPerMinute =
    elapsedSeconds && elapsedSeconds > 0
      ? (job.processed_items / elapsedSeconds) * 60
      : null;
  const estimatedSecondsRemaining =
    throughputPerMinute && throughputPerMinute > 0
      ? (remainingItems / throughputPerMinute) * 60
      : null;

  const formatDuration = (seconds: number) => {
    if (Number.isNaN(seconds) || !Number.isFinite(seconds)) {
      return null;
    }

    if (seconds < 60) {
      return `${Math.max(Math.round(seconds), 1)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    return `${minutes}m ${remaining}s`;
  };

  const formatTime = (date?: Date | null) =>
    date ? date.toLocaleTimeString() : null;

  const formatRate = (rate?: number | null) => {
    if (!rate || Number.isNaN(rate) || !Number.isFinite(rate)) {
      return null;
    }

    const rounded = rate >= 10 ? Math.round(rate) : rate.toFixed(1);
    return `${rounded} items/min`;
  };
  const canCancel = job.status === 'running' || job.status === 'pending';
  const canDelete =
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'cancelled';

  return (
    <div className="mx-auto max-w-6xl container">
      {/* Header */}
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/extraction-jobs" className="btn btn-ghost btn-sm">
            <Icon icon="lucide--arrow-left" />
          </Link>
          <div>
            <h1 className="mb-1 font-bold text-3xl">Extraction Job</h1>
            <p className="font-mono text-sm text-base-content/60">
              ID: {job.id}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setIsLogsModalOpen(true)}
          >
            <Icon icon="lucide--file-text" />
            View Detailed Logs
          </button>
          {canCancel && (
            <button
              className="btn btn-warning btn-sm"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Icon icon="lucide--x-circle" />
                  Cancel Job
                </>
              )}
            </button>
          )}
          {canDelete && (
            <button
              className="btn btn-error btn-sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Deleting...
                </>
              ) : (
                <>
                  <Icon icon="lucide--trash-2" />
                  Delete
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Status & Progress Card */}
      <div className="mb-6 card-border card">
        <div className="card-body">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <ExtractionJobStatusBadge status={job.status} size="lg" />
            <div className="text-sm text-base-content/60">
              Created {new Date(job.created_at).toLocaleString()}
            </div>
          </div>

          {/* Progress bar for running jobs */}
          {job.status === 'running' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-base-content/80">
                  Processing Progress
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base-content">
                    {Math.round(progress)}%
                  </span>
                  <span className="text-base-content/60">
                    ({job.processed_items} / {job.total_items})
                  </span>
                </div>
              </div>
              <progress
                className="w-full progress progress-info"
                value={progress}
                max="100"
              />
              <div className="gap-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="text-base-content/60">Items remaining</div>
                  <div className="font-semibold text-base-content text-lg">
                    {remainingItems}
                  </div>
                </div>
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="text-base-content/60">Throughput</div>
                  <div className="font-semibold text-base-content text-lg">
                    {formatRate(throughputPerMinute) || 'Calculating...'}
                  </div>
                </div>
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="text-base-content/60">Success rate</div>
                  <div className="font-semibold text-base-content text-lg">
                    {successRate !== null
                      ? `${Math.round(successRate)}%`
                      : 'TBD'}
                  </div>
                </div>
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="text-base-content/60">
                    Estimated completion
                  </div>
                  <div className="font-semibold text-base-content text-lg">
                    {estimatedSecondsRemaining !== null
                      ? formatDuration(estimatedSecondsRemaining)
                      : 'Collecting data...'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-base-content/60">
                {startedAt && (
                  <div>
                    <span className="font-medium text-base-content/70">
                      Started:
                    </span>{' '}
                    {formatTime(startedAt)}
                  </div>
                )}
                {lastUpdatedAt && (
                  <div>
                    <span className="font-medium text-base-content/70">
                      Last update:
                    </span>{' '}
                    {formatTime(lastUpdatedAt)}
                  </div>
                )}
                <div className="flex items-center gap-2 text-base-content/70">
                  <Icon icon="lucide--info" className="size-4" />
                  We’ll keep updating this view while the extraction runs. Feel
                  free to navigate away — you can return anytime from the job
                  list.
                </div>
              </div>
            </div>
          )}

          {/* Completion info */}
          {job.completed_at && (
            <div className="text-sm text-base-content/60">
              {job.status === 'completed'
                ? 'Completed'
                : job.status === 'failed'
                ? 'Failed'
                : 'Finished'}{' '}
              at {new Date(job.completed_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Source Information */}
      <div className="mb-6 card-border card">
        <div className="card-body">
          <h2 className="card-title">Source Information</h2>
          <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-base-content/60">
                Source Type
              </div>
              <div className="badge-outline badge">{job.source_type}</div>
            </div>
            {job.source_id && (
              <div>
                <div className="mb-1 text-sm text-base-content/60">
                  Source ID
                </div>
                <div className="font-mono text-sm">{job.source_id}</div>
              </div>
            )}
            {job.source_metadata?.filename && (
              <div>
                <div className="mb-1 text-sm text-base-content/60">
                  File Name
                </div>
                <div className="flex items-center gap-2">
                  <Icon
                    icon="lucide--file-text"
                    className="text-base-content/60"
                  />
                  <span>{job.source_metadata.filename}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="gap-4 grid grid-cols-1 md:grid-cols-4 mb-6">
        <div className="bg-base-200 rounded-box stat">
          <div className="stat-title">Total Items</div>
          <div className="text-2xl stat-value">{job.total_items}</div>
        </div>
        <div className="bg-base-200 rounded-box stat">
          <div className="stat-title">Successful</div>
          <div className="text-success text-2xl stat-value">
            {job.successful_items}
          </div>
        </div>
        <div className="bg-base-200 rounded-box stat">
          <div className="stat-title">Failed</div>
          <div className="text-error text-2xl stat-value">
            {job.failed_items}
          </div>
        </div>
        <div className="bg-base-200 rounded-box stat">
          <div className="stat-title">Processed</div>
          <div className="text-2xl stat-value">{job.processed_items}</div>
        </div>
      </div>

      {/* Discovered Entity Types */}
      {job.discovered_types.length > 0 && (
        <div className="mb-6 card-border card">
          <div className="card-body">
            <h2 className="card-title">Discovered Entity Types</h2>
            <div className="flex flex-wrap gap-2">
              {job.discovered_types
                .filter((type) => type && type.trim().length > 0)
                .map((type, index) => (
                  <div
                    key={`${type}-${index}`}
                    className="badge-outline badge badge-lg badge-primary"
                  >
                    {type}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Created Objects */}
      {job.created_objects.length > 0 && (
        <div className="mb-6 card-border card">
          <div className="card-body">
            <h2 className="card-title">
              Created Objects ({job.created_objects.length})
            </h2>
            <p className="mb-4 text-sm text-base-content/60">
              Objects extracted and created in the knowledge graph
            </p>
            <div className="flex flex-wrap gap-2">
              {job.created_objects
                .filter((objId) => objId && objId.trim().length > 0)
                .slice(0, 20)
                .map((objId, index) => (
                  <Link
                    key={`${objId}-${index}`}
                    to={`/admin/objects?id=${objId}`}
                    className="badge-outline transition-colors badge hover:badge-primary"
                  >
                    <Icon icon="lucide--external-link" className="mr-1" />
                    {objId.slice(0, 8)}
                  </Link>
                ))}
              {job.created_objects.length > 20 && (
                <span className="badge badge-ghost">
                  +{job.created_objects.length - 20} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Details */}
      {job.error_message && (
        <div className="mb-6 card-border border-error card">
          <div className="card-body">
            <h2 className="text-error card-title">
              <Icon icon="lucide--alert-circle" />
              Error Details
            </h2>
            <div className="alert alert-error">
              <Icon icon="lucide--x-circle" />
              <span>{job.error_message}</span>
            </div>
            {job.error_details && (
              <details className="collapse collapse-arrow bg-base-200 mt-4">
                <summary className="collapse-title font-medium">
                  Technical Details
                </summary>
                <div className="collapse-content">
                  <pre className="bg-base-300 p-4 rounded overflow-auto text-xs">
                    {JSON.stringify(job.error_details, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Debug Information */}
      {job.debug_info && (
        <div className="mb-6 card-border card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon icon="lucide--bug" />
              Debug Information
            </h2>
            <p className="mb-4 text-sm text-base-content/70">
              LLM request/response data for debugging extraction quality and
              understanding model behavior
            </p>
            <DebugInfoPanel debugInfo={job.debug_info} />
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="card-border card">
        <div className="card-body">
          <h2 className="card-title">Extraction Configuration</h2>
          <pre className="bg-base-200 p-4 rounded overflow-auto text-xs">
            {JSON.stringify(job.extraction_config, null, 2)}
          </pre>
        </div>
      </div>

      {/* Extraction Logs Modal */}
      <ExtractionLogsModal
        open={isLogsModalOpen}
        onOpenChange={setIsLogsModalOpen}
        jobId={jobId!}
      />
    </div>
  );
}

export default ExtractionJobDetailPage;
