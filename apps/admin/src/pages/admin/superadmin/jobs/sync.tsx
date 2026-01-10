import React, { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
} from '@/components/organisms/DataTable';
import { Modal } from '@/components/organisms/Modal/Modal';
import { useSuperadminSyncJobs } from '@/hooks/use-superadmin-sync-jobs';
import { useSuperadminProjects } from '@/hooks/use-superadmin-projects';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import type {
  SyncJob,
  SyncJobStatus,
  SyncJobLogEntry,
  SyncJobLogsResponse,
} from '@/types/superadmin';

type JobRow = SyncJob & { id: string };

const STATUS_BADGES: Record<
  SyncJobStatus,
  { className: string; label: string }
> = {
  pending: { className: 'badge-warning', label: 'Pending' },
  running: { className: 'badge-info', label: 'Running' },
  completed: { className: 'badge-success', label: 'Completed' },
  failed: { className: 'badge-error', label: 'Failed' },
  cancelled: { className: 'badge-ghost', label: 'Cancelled' },
};

const PROVIDER_ICONS: Record<string, string> = {
  gmail_oauth: 'lucide--mail',
  imap: 'lucide--inbox',
  default: 'lucide--cloud',
};

const LOG_LEVEL_STYLES: Record<
  SyncJobLogEntry['level'],
  { className: string; icon: string }
> = {
  debug: { className: 'text-base-content/50', icon: 'lucide--code' },
  info: { className: 'text-info', icon: 'lucide--info' },
  warn: { className: 'text-warning', icon: 'lucide--alert-triangle' },
  error: { className: 'text-error', icon: 'lucide--alert-circle' },
};

interface SyncJobLogsModalProps {
  open: boolean;
  onClose: () => void;
  logsData: SyncJobLogsResponse | null;
  isLoading: boolean;
  error: string | null;
}

function SyncJobLogsModal({
  open,
  onClose,
  logsData,
  isLoading,
  error,
}: SyncJobLogsModalProps) {
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const filteredLogs =
    logsData?.logs.filter(
      (log) => levelFilter === 'all' || log.level === levelFilter
    ) || [];

  const levelCounts = logsData?.logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Modal
      open={open}
      onOpenChange={(open) => !open && onClose()}
      title="Sync Job Logs"
      description={
        logsData
          ? `${logsData.logs.length} log entries - Status: ${logsData.status}`
          : 'Loading logs...'
      }
      sizeClassName="max-w-4xl"
      actions={[{ label: 'Close', variant: 'ghost', onClick: onClose }]}
    >
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
        </div>
      )}

      {!isLoading && !error && logsData && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="stat bg-base-200 rounded-lg p-3">
              <div className="stat-title text-xs">Status</div>
              <div
                className={`stat-value text-sm ${
                  STATUS_BADGES[logsData.status]?.className || ''
                }`}
              >
                {logsData.status}
              </div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-3">
              <div className="stat-title text-xs">Started</div>
              <div className="stat-value text-sm">
                {logsData.startedAt
                  ? new Date(logsData.startedAt).toLocaleTimeString()
                  : '-'}
              </div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-3">
              <div className="stat-title text-xs">Completed</div>
              <div className="stat-value text-sm">
                {logsData.completedAt
                  ? new Date(logsData.completedAt).toLocaleTimeString()
                  : '-'}
              </div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-3">
              <div className="stat-title text-xs">Log Entries</div>
              <div className="stat-value text-sm">{logsData.logs.length}</div>
            </div>
          </div>

          {/* Error message if present */}
          {logsData.errorMessage && (
            <div className="alert alert-error mb-4">
              <Icon icon="lucide--alert-circle" className="size-5" />
              <span>{logsData.errorMessage}</span>
            </div>
          )}

          {/* Level filter */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-base-content/70">Filter:</span>
            <div className="btn-group">
              <button
                className={`btn btn-xs ${
                  levelFilter === 'all' ? 'btn-active' : ''
                }`}
                onClick={() => setLevelFilter('all')}
              >
                All ({logsData.logs.length})
              </button>
              {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
                <button
                  key={level}
                  className={`btn btn-xs ${
                    levelFilter === level ? 'btn-active' : ''
                  }`}
                  onClick={() => setLevelFilter(level)}
                  disabled={!levelCounts?.[level]}
                >
                  <span className={LOG_LEVEL_STYLES[level].className}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </span>
                  {levelCounts?.[level] && (
                    <span className="ml-1">({levelCounts[level]})</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Logs list */}
          <div className="border border-base-300 rounded-lg overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="py-8 text-center text-base-content/60">
                  <Icon icon="lucide--inbox" className="size-8 mx-auto mb-2" />
                  <p>No logs matching the filter</p>
                </div>
              ) : (
                <table className="table table-xs table-zebra w-full">
                  <thead className="sticky top-0 bg-base-200 z-10">
                    <tr>
                      <th className="w-8"></th>
                      <th className="w-24">Time</th>
                      <th className="w-16">Level</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, index) => {
                      const levelStyle = LOG_LEVEL_STYLES[log.level];
                      const hasDetails =
                        log.details && Object.keys(log.details).length > 0;
                      const isExpanded = expandedLogIndex === index;

                      return (
                        <React.Fragment key={index}>
                          <tr
                            className={`hover ${
                              hasDetails ? 'cursor-pointer' : ''
                            }`}
                            onClick={() =>
                              hasDetails &&
                              setExpandedLogIndex(isExpanded ? null : index)
                            }
                          >
                            <td>
                              {hasDetails && (
                                <Icon
                                  icon={
                                    isExpanded
                                      ? 'lucide--chevron-down'
                                      : 'lucide--chevron-right'
                                  }
                                  className="size-4"
                                />
                              )}
                            </td>
                            <td className="font-mono text-xs text-base-content/70">
                              {formatTime(log.timestamp)}
                            </td>
                            <td>
                              <div
                                className={`flex items-center gap-1 ${levelStyle.className}`}
                              >
                                <Icon
                                  icon={levelStyle.icon}
                                  className="size-3"
                                />
                                <span className="text-xs uppercase">
                                  {log.level}
                                </span>
                              </div>
                            </td>
                            <td className="text-sm">{log.message}</td>
                          </tr>
                          {isExpanded && hasDetails && (
                            <tr className="bg-base-300/30">
                              <td colSpan={4} className="bg-base-300/30 p-0">
                                <div className="p-3">
                                  <div className="text-xs text-base-content/60 mb-1">
                                    Details:
                                  </div>
                                  <pre className="bg-base-100 p-2 rounded text-xs overflow-x-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function SuperadminSyncJobsPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SyncJobStatus | ''>('');
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

  // Logs modal state
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsData, setLogsData] = useState<SyncJobLogsResponse | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

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
    getJobLogs,
  } = useSuperadminSyncJobs({
    page,
    limit: 20,
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

  const handleCancelClick = (job: JobRow) => {
    if (job.status !== 'pending' && job.status !== 'running') {
      showToast({
        variant: 'warning',
        message: 'Only pending or running jobs can be cancelled',
      });
      return;
    }
    setJobsToCancel([job]);
    setCancelModalOpen(true);
  };

  const handleViewLogsClick = async (job: JobRow) => {
    setLogsModalOpen(true);
    setLogsData(null);
    setLogsError(null);
    setIsLoadingLogs(true);

    try {
      const logs = await getJobLogs(job.id);
      setLogsData(logs);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : 'Failed to load job logs');
    } finally {
      setIsLoadingLogs(false);
    }
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
      (j) => j.status === 'pending' || j.status === 'running'
    );
    if (!cancellable.length) {
      showToast({
        variant: 'warning',
        message: 'No cancellable jobs selected (must be pending or running)',
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
      key: 'providerType',
      label: 'Provider',
      width: 'w-28',
      render: (job) => {
        const icon =
          PROVIDER_ICONS[job.providerType || ''] || PROVIDER_ICONS.default;
        return (
          <div className="flex items-center gap-2">
            <Icon icon={icon} className="size-4 text-base-content/60" />
            <span className="text-sm capitalize">
              {job.providerType?.replace('_', ' ') || 'Unknown'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'integrationName',
      label: 'Integration',
      width: 'w-40',
      render: (job) => (
        <span
          className="truncate"
          title={job.integrationName || job.integrationId}
        >
          {job.integrationName || job.integrationId.substring(0, 8) + '...'}
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
      key: 'progress',
      label: 'Progress',
      width: 'w-32',
      render: (job) => {
        if (job.totalItems === 0) {
          return <span className="text-base-content/50">-</span>;
        }
        const percent = Math.round((job.processedItems / job.totalItems) * 100);
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-2 bg-base-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  job.status === 'failed'
                    ? 'bg-error'
                    : job.status === 'completed'
                    ? 'bg-success'
                    : 'bg-info'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs text-base-content/60">
              {job.processedItems}/{job.totalItems}
            </span>
          </div>
        );
      },
    },
    {
      key: 'imported',
      label: 'Imported',
      width: 'w-24',
      render: (job) => (
        <div className="text-sm">
          <span className="text-success font-medium">
            {job.successfulItems}
          </span>
          {job.failedItems > 0 && (
            <span className="text-error"> / {job.failedItems} err</span>
          )}
        </div>
      ),
    },
    {
      key: 'triggerType',
      label: 'Trigger',
      width: 'w-24',
      render: (job) => (
        <span className="text-sm capitalize">{job.triggerType}</span>
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
      label: 'View Logs',
      icon: 'lucide--file-text',
      variant: 'secondary',
      onAction: handleViewLogsClick,
    },
    {
      label: 'Cancel',
      icon: 'lucide--x-circle',
      variant: 'warning',
      onAction: handleCancelClick,
      hidden: (job: JobRow) =>
        job.status !== 'pending' && job.status !== 'running',
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
          <Icon icon="lucide--refresh-cw" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Data Source Sync Jobs</h1>
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
              {stats.pending + stats.running} active
            </div>
          </div>
          <div className="stat bg-base-100 border border-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Running</div>
            <div className="stat-value text-lg text-info">{stats.running}</div>
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
            <div className="stat-title text-xs">Items Imported</div>
            <div className="stat-value text-lg text-primary">
              {stats.totalItemsImported}
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
                setStatusFilter(e.target.value as SyncJobStatus | '');
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
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
        emptyMessage="No sync jobs found"
        noResultsMessage="No jobs match your filter criteria. Try adjusting your filters."
        emptyIcon="lucide--refresh-cw"
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
            ? `Are you sure you want to delete ${jobsToDelete.length} sync jobs? This action cannot be undone.`
            : `Are you sure you want to delete this sync job? This action cannot be undone.`
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
            ? `Are you sure you want to cancel ${jobsToCancel.length} sync jobs?`
            : `Are you sure you want to cancel this sync job?`
        }
        confirmVariant="warning"
        confirmLabel="Cancel Jobs"
        confirmLoading={isCancelling}
      />

      {/* Logs Modal */}
      <SyncJobLogsModal
        open={logsModalOpen}
        onClose={() => {
          setLogsModalOpen(false);
          setLogsData(null);
          setLogsError(null);
        }}
        logsData={logsData}
        isLoading={isLoadingLogs}
        error={logsError}
      />
    </div>
  );
}
