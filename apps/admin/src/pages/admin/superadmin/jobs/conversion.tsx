import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
} from '@/components/organisms/DataTable';
import { useSuperadminDocumentParsingJobs } from '@/hooks/use-superadmin-document-parsing-jobs';
import { useSuperadminProjects } from '@/hooks/use-superadmin-projects';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import type {
  DocumentParsingJob,
  DocumentParsingJobStatus,
} from '@/types/superadmin';

type JobRow = DocumentParsingJob & { id: string };

const STATUS_BADGES: Record<
  DocumentParsingJobStatus,
  { className: string; label: string }
> = {
  pending: { className: 'badge-warning', label: 'Pending' },
  processing: { className: 'badge-info', label: 'Processing' },
  completed: { className: 'badge-success', label: 'Completed' },
  failed: { className: 'badge-error', label: 'Failed' },
  retry_pending: { className: 'badge-accent', label: 'Retry Pending' },
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatContentLength = (chars?: number): string => {
  if (!chars) return '-';
  if (chars < 1000) return `${chars} chars`;
  if (chars < 1000000) return `${(chars / 1000).toFixed(1)}K chars`;
  return `${(chars / 1000000).toFixed(1)}M chars`;
};

export default function SuperadminConversionJobsPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    DocumentParsingJobStatus | ''
  >('');
  const [errorFilter, setErrorFilter] = useState<boolean | undefined>(
    undefined
  );
  const [projectFilter, setProjectFilter] = useState<string>('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [jobsToDelete, setJobsToDelete] = useState<JobRow[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const [retryModalOpen, setRetryModalOpen] = useState(false);
  const [jobsToRetry, setJobsToRetry] = useState<JobRow[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);

  const { projects, isLoading: projectsLoading } = useSuperadminProjects({
    limit: 100,
  });

  const {
    jobs,
    stats,
    meta,
    isLoading,
    error,
    refetch,
    deleteJobs,
    retryJobs,
  } = useSuperadminDocumentParsingJobs({
    page,
    limit: 20,
    status: statusFilter || undefined,
    projectId: projectFilter || undefined,
    hasError: errorFilter,
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const totalPages = meta?.totalPages ?? 0;

  const handleDeleteClick = (job: JobRow) => {
    setJobsToDelete([job]);
    setDeleteModalOpen(true);
  };

  const handleRetryClick = (job: JobRow) => {
    if (job.status !== 'failed' && job.status !== 'retry_pending') {
      showToast({
        variant: 'warning',
        message: 'Only failed or retry_pending jobs can be retried',
      });
      return;
    }
    setJobsToRetry([job]);
    setRetryModalOpen(true);
  };

  const handleBulkDelete = (
    _selectedIds: string[],
    selectedItems: JobRow[]
  ) => {
    if (!selectedItems.length) return;
    setJobsToDelete(selectedItems);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };

  const handleBulkRetry = (_selectedIds: string[], selectedItems: JobRow[]) => {
    const retryable = selectedItems.filter(
      (j) => j.status === 'failed' || j.status === 'retry_pending'
    );
    if (!retryable.length) {
      showToast({
        variant: 'warning',
        message: 'No retryable jobs selected (must be failed or retry_pending)',
      });
      return;
    }
    setJobsToRetry(retryable);
    setTimeout(() => setRetryModalOpen(true), 0);
  };

  const handleConfirmDelete = async () => {
    if (!jobsToDelete.length) return;

    setIsDeleting(true);

    try {
      const result = await deleteJobs(jobsToDelete.map((j) => j.id));
      showToast({
        variant: 'success',
        message: `Deleted ${result.deletedCount} job(s) successfully`,
      });
      refetch();
    } catch (e) {
      showToast({
        variant: 'error',
        message: e instanceof Error ? e.message : 'Failed to delete jobs',
      });
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setJobsToDelete([]);
    }
  };

  const handleConfirmRetry = async () => {
    if (!jobsToRetry.length) return;

    setIsRetrying(true);

    try {
      const result = await retryJobs(jobsToRetry.map((j) => j.id));
      showToast({
        variant: 'success',
        message: `Queued ${result.retriedCount} job(s) for retry`,
      });
      refetch();
    } catch (e) {
      showToast({
        variant: 'error',
        message: e instanceof Error ? e.message : 'Failed to retry jobs',
      });
    } finally {
      setIsRetrying(false);
      setRetryModalOpen(false);
      setJobsToRetry([]);
    }
  };

  const columns: ColumnDef<JobRow>[] = [
    {
      key: 'sourceFilename',
      label: 'Filename',
      render: (job) => (
        <div className="flex flex-col">
          <span
            className="truncate font-medium"
            title={job.sourceFilename || 'Unknown'}
          >
            {job.sourceFilename
              ? job.sourceFilename.length > 30
                ? job.sourceFilename.substring(0, 30) + '...'
                : job.sourceFilename
              : '-'}
          </span>
          {job.mimeType && (
            <span className="text-xs text-base-content/50">{job.mimeType}</span>
          )}
        </div>
      ),
    },
    {
      key: 'projectName',
      label: 'Project',
      width: 'w-40',
      render: (job) => (
        <span className="truncate" title={job.projectName || job.projectId}>
          {job.projectName || job.projectId.substring(0, 8) + '...'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-28',
      render: (job) => {
        const badge = STATUS_BADGES[job.status];
        return (
          <span className={`badge badge-sm ${badge.className}`}>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: 'fileSizeBytes',
      label: 'File Size',
      width: 'w-24',
      render: (job) => (
        <span className="text-sm">{formatFileSize(job.fileSizeBytes)}</span>
      ),
    },
    {
      key: 'parsedContentLength',
      label: 'Content',
      width: 'w-28',
      render: (job) => (
        <span className="text-sm text-success">
          {formatContentLength(job.parsedContentLength)}
        </span>
      ),
    },
    {
      key: 'retryCount',
      label: 'Retries',
      width: 'w-20',
      render: (job) => (
        <span
          className={`text-sm ${
            job.retryCount > 0 ? 'text-warning' : 'text-base-content/50'
          }`}
        >
          {job.retryCount}/{job.maxRetries}
        </span>
      ),
    },
    {
      key: 'errorMessage',
      label: 'Error',
      render: (job) =>
        job.errorMessage ? (
          <span
            className="text-error text-xs truncate"
            title={job.errorMessage}
          >
            {job.errorMessage.length > 40
              ? `${job.errorMessage.substring(0, 40)}...`
              : job.errorMessage}
          </span>
        ) : (
          <span className="text-base-content/50">-</span>
        ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: 'w-28',
      sortable: true,
      render: (job) => formatDate(job.createdAt),
    },
  ];

  const rowActions: RowAction<JobRow>[] = [
    {
      label: 'Retry',
      icon: 'lucide--refresh-cw',
      variant: 'warning',
      onAction: handleRetryClick,
      hidden: (job: JobRow) =>
        job.status !== 'failed' && job.status !== 'retry_pending',
    },
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: handleDeleteClick,
    },
  ];

  const bulkActions: BulkAction<JobRow>[] = [
    {
      key: 'retry',
      label: 'Retry',
      icon: 'lucide--refresh-cw',
      variant: 'warning',
      style: 'outline',
      onAction: handleBulkRetry,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      style: 'outline',
      onAction: handleBulkDelete,
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--file-cog" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Conversion Jobs</h1>
          {meta && (
            <span className="badge badge-ghost">{meta.total} total</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Icon icon="lucide--refresh-cw" className="size-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Total</div>
            <div className="stat-value text-lg">{stats.total}</div>
            <div className="stat-desc text-xs">
              {stats.pending + stats.processing} active
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Pending</div>
            <div className="stat-value text-lg text-warning">
              {stats.pending}
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Processing</div>
            <div className="stat-value text-lg text-info">
              {stats.processing}
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Completed</div>
            <div className="stat-value text-lg text-success">
              {stats.completed}
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Failed</div>
            <div className="stat-value text-lg text-error">{stats.failed}</div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Total Size</div>
            <div className="stat-value text-lg text-primary">
              {formatFileSize(stats.totalFileSizeBytes)}
            </div>
          </div>
        </div>
      )}

      <DataTable<JobRow>
        data={jobs}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        rowActions={rowActions}
        bulkActions={bulkActions}
        enableSelection
        useDropdownActions
        toolbarActions={
          <div className="flex gap-2">
            <select
              className="select select-bordered select-sm"
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              disabled={projectsLoading}
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(
                  e.target.value as DocumentParsingJobStatus | ''
                );
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="retry_pending">Retry Pending</option>
            </select>
            <select
              className="select select-bordered select-sm"
              value={errorFilter === undefined ? '' : String(errorFilter)}
              onChange={(e) => {
                const val = e.target.value;
                setErrorFilter(val === '' ? undefined : val === 'true');
                setPage(1);
              }}
            >
              <option value="">All Jobs</option>
              <option value="true">With Errors</option>
              <option value="false">Without Errors</option>
            </select>
          </div>
        }
        emptyMessage="No conversion jobs found"
        noResultsMessage="No jobs match your filter criteria. Try adjusting your filters."
        emptyIcon="lucide--file-cog"
        pagination={
          meta
            ? {
                page,
                totalPages,
                total: meta.total,
                limit: meta.limit,
                hasPrev: meta.hasPrev,
                hasNext: meta.hasNext,
              }
            : undefined
        }
        onPageChange={setPage}
        paginationItemLabel="jobs"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmActionModal
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setJobsToDelete([]);
        }}
        onConfirm={handleConfirmDelete}
        title={jobsToDelete.length > 1 ? 'Delete Jobs' : 'Delete Job'}
        description={
          jobsToDelete.length > 1
            ? `Are you sure you want to delete ${jobsToDelete.length} conversion jobs? This action cannot be undone.`
            : `Are you sure you want to delete this conversion job? This action cannot be undone.`
        }
        confirmVariant="error"
        confirmLabel="Delete"
        confirmLoading={isDeleting}
      />

      {/* Retry Confirmation Modal */}
      <ConfirmActionModal
        open={retryModalOpen}
        onCancel={() => {
          setRetryModalOpen(false);
          setJobsToRetry([]);
        }}
        onConfirm={handleConfirmRetry}
        title={jobsToRetry.length > 1 ? 'Retry Jobs' : 'Retry Job'}
        description={
          jobsToRetry.length > 1
            ? `Are you sure you want to retry ${jobsToRetry.length} conversion jobs?`
            : `Are you sure you want to retry this conversion job?`
        }
        confirmVariant="warning"
        confirmLabel="Retry Jobs"
        confirmLoading={isRetrying}
      />
    </div>
  );
}
