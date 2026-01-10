import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
} from '@/components/organisms/DataTable';
import { useSuperadminJobs } from '@/hooks/use-superadmin-jobs';
import { useSuperadminProjects } from '@/hooks/use-superadmin-projects';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import type {
  EmbeddingJob,
  EmbeddingJobType,
  EmbeddingJobStatus,
} from '@/types/superadmin';

type JobRow = EmbeddingJob & { id: string };

const STATUS_BADGES: Record<
  EmbeddingJobStatus,
  { className: string; label: string }
> = {
  pending: { className: 'badge-warning', label: 'Pending' },
  processing: { className: 'badge-info', label: 'Processing' },
  completed: { className: 'badge-success', label: 'Completed' },
  failed: { className: 'badge-error', label: 'Failed' },
};

const TYPE_BADGES: Record<
  EmbeddingJobType,
  { className: string; label: string }
> = {
  graph: { className: 'badge-primary', label: 'Graph' },
  chunk: { className: 'badge-secondary', label: 'Chunk' },
};

export default function SuperadminJobsPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<EmbeddingJobType | ''>('');
  const [statusFilter, setStatusFilter] = useState<EmbeddingJobStatus | ''>('');
  const [errorFilter, setErrorFilter] = useState<boolean | undefined>(
    undefined
  );
  const [projectFilter, setProjectFilter] = useState<string>('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [jobsToDelete, setJobsToDelete] = useState<JobRow[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

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
    cleanupOrphans,
  } = useSuperadminJobs({
    page,
    limit: 20,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
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

  const handleBulkDelete = (
    _selectedIds: string[],
    selectedItems: JobRow[]
  ) => {
    if (!selectedItems.length) return;
    setJobsToDelete(selectedItems);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };

  const handleConfirmDelete = async () => {
    if (!jobsToDelete.length) return;

    setIsDeleting(true);

    try {
      // Group by type
      const graphJobs = jobsToDelete.filter((j) => j.type === 'graph');
      const chunkJobs = jobsToDelete.filter((j) => j.type === 'chunk');

      let totalDeleted = 0;

      if (graphJobs.length > 0) {
        const result = await deleteJobs(
          graphJobs.map((j) => j.id),
          'graph'
        );
        totalDeleted += result.deletedCount;
      }

      if (chunkJobs.length > 0) {
        const result = await deleteJobs(
          chunkJobs.map((j) => j.id),
          'chunk'
        );
        totalDeleted += result.deletedCount;
      }

      showToast({
        variant: 'success',
        message: `Deleted ${totalDeleted} job(s) successfully`,
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

  const handleCleanupOrphans = async () => {
    setIsCleaningUp(true);
    try {
      const result = await cleanupOrphans();
      showToast({
        variant: 'success',
        message: result.message,
      });
      refetch();
    } catch (e) {
      showToast({
        variant: 'error',
        message: e instanceof Error ? e.message : 'Failed to cleanup orphans',
      });
    } finally {
      setIsCleaningUp(false);
      setCleanupModalOpen(false);
    }
  };

  const columns: ColumnDef<JobRow>[] = [
    {
      key: 'type',
      label: 'Type',
      width: 'w-24',
      render: (job) => {
        const badge = TYPE_BADGES[job.type];
        return (
          <span className={`badge badge-sm ${badge.className}`}>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: 'projectName',
      label: 'Project',
      width: 'w-40',
      render: (job) => (
        <span
          className="truncate"
          title={job.projectName || job.projectId || '-'}
        >
          {job.projectName ||
            (job.projectId ? job.projectId.substring(0, 8) + '...' : '-')}
        </span>
      ),
    },
    {
      key: 'targetId',
      label: 'Target ID',
      width: 'w-64',
      render: (job) => (
        <span className="font-mono text-xs truncate" title={job.targetId}>
          {job.targetId.substring(0, 8)}...
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
      key: 'attemptCount',
      label: 'Attempts',
      width: 'w-24',
      render: (job) => (
        <span className={job.attemptCount > 5 ? 'text-error font-medium' : ''}>
          {job.attemptCount}
        </span>
      ),
    },
    {
      key: 'lastError',
      label: 'Last Error',
      render: (job) =>
        job.lastError ? (
          <span className="text-error text-xs truncate" title={job.lastError}>
            {job.lastError.length > 40
              ? `${job.lastError.substring(0, 40)}...`
              : job.lastError}
          </span>
        ) : (
          <span className="text-base-content/50">-</span>
        ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (job) => formatDate(job.createdAt),
    },
  ];

  const rowActions: RowAction<JobRow>[] = [
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: handleDeleteClick,
    },
  ];

  const bulkActions: BulkAction<JobRow>[] = [
    {
      key: 'delete',
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      style: 'outline',
      onAction: handleBulkDelete,
    },
  ];

  const orphanCount = stats?.graphWithErrors ?? 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--cpu" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Embedding Jobs</h1>
          {meta && (
            <span className="badge badge-ghost">{meta.total} total</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {orphanCount > 0 && (
            <button
              className="btn btn-warning btn-sm"
              onClick={() => setCleanupModalOpen(true)}
              disabled={isLoading || isCleaningUp}
            >
              <Icon icon="lucide--trash" className="size-4" />
              Cleanup {orphanCount} Orphans
            </button>
          )}
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
            <div className="stat-title text-xs">Graph Total</div>
            <div className="stat-value text-lg">{stats.graphTotal}</div>
            <div className="stat-desc text-xs">
              {stats.graphPending} pending, {stats.graphWithErrors} errors
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Graph Completed</div>
            <div className="stat-value text-lg text-success">
              {stats.graphCompleted}
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Chunk Total</div>
            <div className="stat-value text-lg">{stats.chunkTotal}</div>
            <div className="stat-desc text-xs">
              {stats.chunkPending} pending, {stats.chunkWithErrors} errors
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Chunk Completed</div>
            <div className="stat-value text-lg text-success">
              {stats.chunkCompleted}
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Total Errors</div>
            <div className="stat-value text-lg text-error">
              {stats.graphWithErrors + stats.chunkWithErrors}
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
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as EmbeddingJobType | '');
                setPage(1);
              }}
            >
              <option value="">All Types</option>
              <option value="graph">Graph</option>
              <option value="chunk">Chunk</option>
            </select>
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as EmbeddingJobStatus | '');
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
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
        emptyMessage="No embedding jobs found"
        noResultsMessage="No jobs match your filter criteria. Try adjusting your filters."
        emptyIcon="lucide--cpu"
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
            ? `Are you sure you want to delete ${jobsToDelete.length} jobs? This action cannot be undone.`
            : `Are you sure you want to delete this ${
                jobsToDelete[0]?.type || ''
              } embedding job? This action cannot be undone.`
        }
        confirmVariant="error"
        confirmLabel="Delete"
        confirmLoading={isDeleting}
      />

      {/* Cleanup Orphans Confirmation Modal */}
      <ConfirmActionModal
        open={cleanupModalOpen}
        onCancel={() => setCleanupModalOpen(false)}
        onConfirm={handleCleanupOrphans}
        title="Cleanup Orphan Jobs"
        description={`Are you sure you want to delete all ${orphanCount} orphan embedding jobs? These are jobs that reference deleted objects and will never complete.`}
        confirmVariant="warning"
        confirmLabel="Cleanup"
        confirmLoading={isCleaningUp}
      />
    </div>
  );
}
