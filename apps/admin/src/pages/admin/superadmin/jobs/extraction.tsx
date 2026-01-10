import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
} from '@/components/organisms/DataTable';
import { useSuperadminExtractionJobs } from '@/hooks/use-superadmin-extraction-jobs';
import { useSuperadminProjects } from '@/hooks/use-superadmin-projects';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  ExtractionJobType,
} from '@/types/superadmin';

type JobRow = ExtractionJob & { id: string };

const STATUS_BADGES: Record<
  ExtractionJobStatus,
  { className: string; label: string }
> = {
  queued: { className: 'badge-warning', label: 'Queued' },
  processing: { className: 'badge-info', label: 'Processing' },
  completed: { className: 'badge-success', label: 'Completed' },
  failed: { className: 'badge-error', label: 'Failed' },
  cancelled: { className: 'badge-ghost', label: 'Cancelled' },
  requires_review: { className: 'badge-accent', label: 'Requires Review' },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  full_extraction: 'Full Extraction',
  incremental: 'Incremental',
  reprocessing: 'Reprocessing',
  chunk_extraction: 'Chunk Extraction',
};

export default function SuperadminExtractionJobsPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ExtractionJobStatus | ''>(
    ''
  );
  const [jobTypeFilter, setJobTypeFilter] = useState<ExtractionJobType | ''>(
    ''
  );
  const [errorFilter, setErrorFilter] = useState<boolean | undefined>(
    undefined
  );
  const [projectFilter, setProjectFilter] = useState<string>('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [jobsToDelete, setJobsToDelete] = useState<JobRow[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [jobsToCancel, setJobsToCancel] = useState<JobRow[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);

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
    cancelJobs,
  } = useSuperadminExtractionJobs({
    page,
    limit: 20,
    status: statusFilter || undefined,
    jobType: jobTypeFilter || undefined,
    projectId: projectFilter || undefined,
    hasError: errorFilter,
  });

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const totalPages = meta?.totalPages ?? 0;

  const handleDeleteClick = (job: JobRow) => {
    setJobsToDelete([job]);
    setDeleteModalOpen(true);
  };

  const handleCancelClick = (job: JobRow) => {
    if (job.status !== 'queued' && job.status !== 'processing') {
      showToast({
        variant: 'warning',
        message: 'Only queued or processing jobs can be cancelled',
      });
      return;
    }
    setJobsToCancel([job]);
    setCancelModalOpen(true);
  };

  const handleBulkDelete = (
    _selectedIds: string[],
    selectedItems: JobRow[]
  ) => {
    if (!selectedItems.length) return;
    setJobsToDelete(selectedItems);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };

  const handleBulkCancel = (
    _selectedIds: string[],
    selectedItems: JobRow[]
  ) => {
    const cancellable = selectedItems.filter(
      (j) => j.status === 'queued' || j.status === 'processing'
    );
    if (!cancellable.length) {
      showToast({
        variant: 'warning',
        message: 'No cancellable jobs selected (must be queued or processing)',
      });
      return;
    }
    setJobsToCancel(cancellable);
    setTimeout(() => setCancelModalOpen(true), 0);
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

  const handleConfirmCancel = async () => {
    if (!jobsToCancel.length) return;

    setIsCancelling(true);

    try {
      const result = await cancelJobs(jobsToCancel.map((j) => j.id));
      showToast({
        variant: 'success',
        message: `Cancelled ${result.cancelledCount} job(s) successfully`,
      });
      refetch();
    } catch (e) {
      showToast({
        variant: 'error',
        message: e instanceof Error ? e.message : 'Failed to cancel jobs',
      });
    } finally {
      setIsCancelling(false);
      setCancelModalOpen(false);
      setJobsToCancel([]);
    }
  };

  const columns: ColumnDef<JobRow>[] = [
    {
      key: 'jobType',
      label: 'Type',
      width: 'w-32',
      render: (job) => (
        <span className="text-sm">
          {JOB_TYPE_LABELS[job.jobType] || job.jobType}
        </span>
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
      key: 'documentName',
      label: 'Document',
      render: (job) =>
        job.documentName ? (
          <span className="truncate" title={job.documentName}>
            {job.documentName.length > 30
              ? job.documentName.substring(0, 30) + '...'
              : job.documentName}
          </span>
        ) : (
          <span className="text-base-content/50">-</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-28',
      render: (job) => {
        const badge = STATUS_BADGES[job.status] ?? {
          className: 'badge-neutral',
          label: job.status,
        };
        return (
          <span className={`badge badge-sm ${badge.className}`}>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: 'objectsCreated',
      label: 'Objects',
      width: 'w-20',
      render: (job) =>
        job.objectsCreated > 0 ? (
          <span className="font-medium">{job.objectsCreated}</span>
        ) : (
          <span className="text-base-content/50">-</span>
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
      label: 'Cancel',
      icon: 'lucide--x-circle',
      variant: 'warning',
      onAction: handleCancelClick,
      hidden: (job: JobRow) =>
        job.status !== 'queued' && job.status !== 'processing',
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
      key: 'cancel',
      label: 'Cancel',
      icon: 'lucide--x-circle',
      variant: 'warning',
      style: 'outline',
      onAction: handleBulkCancel,
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
          <Icon icon="lucide--file-search" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Extraction Jobs</h1>
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Total</div>
            <div className="stat-value text-lg">{stats.total}</div>
            <div className="stat-desc text-xs">
              {stats.queued + stats.processing} active
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Queued</div>
            <div className="stat-value text-lg text-warning">
              {stats.queued}
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
            <div className="stat-title text-xs">Objects Created</div>
            <div className="stat-value text-lg text-primary">
              {stats.totalObjectsCreated}
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
                setStatusFilter(e.target.value as ExtractionJobStatus | '');
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="requires_review">Requires Review</option>
            </select>
            <select
              className="select select-bordered select-sm"
              value={jobTypeFilter}
              onChange={(e) => {
                setJobTypeFilter(e.target.value as ExtractionJobType | '');
                setPage(1);
              }}
            >
              <option value="">All Types</option>
              <option value="full_extraction">Full Extraction</option>
              <option value="incremental">Incremental</option>
              <option value="reprocessing">Reprocessing</option>
              <option value="chunk_extraction">Chunk Extraction</option>
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
        emptyMessage="No extraction jobs found"
        noResultsMessage="No jobs match your filter criteria. Try adjusting your filters."
        emptyIcon="lucide--file-search"
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
            ? `Are you sure you want to delete ${jobsToDelete.length} extraction jobs? This action cannot be undone.`
            : `Are you sure you want to delete this extraction job? This action cannot be undone.`
        }
        confirmVariant="error"
        confirmLabel="Delete"
        confirmLoading={isDeleting}
      />

      {/* Cancel Confirmation Modal */}
      <ConfirmActionModal
        open={cancelModalOpen}
        onCancel={() => {
          setCancelModalOpen(false);
          setJobsToCancel([]);
        }}
        onConfirm={handleConfirmCancel}
        title={jobsToCancel.length > 1 ? 'Cancel Jobs' : 'Cancel Job'}
        description={
          jobsToCancel.length > 1
            ? `Are you sure you want to cancel ${jobsToCancel.length} extraction jobs?`
            : `Are you sure you want to cancel this extraction job?`
        }
        confirmVariant="warning"
        confirmLabel="Cancel Jobs"
        confirmLoading={isCancelling}
      />
    </div>
  );
}
