import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { TableAvatarCell } from '@/components/molecules/TableAvatarCell/TableAvatarCell';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
} from '@/components/organisms/DataTable';
import {
  useSuperadminEmails,
  useSuperadminEmailPreview,
  type EmailJobStatus,
  type EmailDeliveryStatus,
  type SuperadminEmailJob,
} from '@/hooks/use-superadmin-emails';

export default function SuperadminEmailsPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmailJobStatus | ''>('');
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);

  const { emailJobs, meta, isLoading, error, refetch } = useSuperadminEmails({
    page,
    limit: 20,
    recipient: searchQuery || undefined,
    status: statusFilter || undefined,
  });

  const {
    preview,
    isLoading: previewLoading,
    error: previewError,
    fetchPreview,
    clearPreview,
  } = useSuperadminEmailPreview();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleStatusFilterChange = (status: EmailJobStatus | '') => {
    setStatusFilter(status);
    setPage(1);
  };

  const handlePreview = async (emailJob: SuperadminEmailJob) => {
    setPreviewEmailId(emailJob.id);
    await fetchPreview(emailJob.id);
    modalRef.current?.showModal();
  };

  const handleClosePreview = () => {
    modalRef.current?.close();
    setPreviewEmailId(null);
    clearPreview();
  };

  // Close modal on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewEmailId) {
        handleClosePreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewEmailId]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: EmailJobStatus) => {
    const badges: Record<EmailJobStatus, { class: string; icon: string }> = {
      pending: { class: 'badge-warning', icon: 'lucide--clock' },
      processing: { class: 'badge-info', icon: 'lucide--loader' },
      sent: { class: 'badge-success', icon: 'lucide--check' },
      failed: { class: 'badge-error', icon: 'lucide--x' },
    };
    const badge = badges[status];
    return (
      <span className={`badge badge-sm ${badge.class} gap-1`}>
        <Icon icon={badge.icon} className="size-3" />
        {status}
      </span>
    );
  };

  const getDeliveryStatusBadge = (status: EmailDeliveryStatus | null) => {
    if (!status) return <span className="text-base-content/40">-</span>;

    const badges: Record<
      EmailDeliveryStatus,
      { class: string; icon: string; label: string }
    > = {
      pending: {
        class: 'badge-ghost',
        icon: 'lucide--clock',
        label: 'Pending',
      },
      delivered: {
        class: 'badge-success',
        icon: 'lucide--check-circle',
        label: 'Delivered',
      },
      opened: {
        class: 'badge-info',
        icon: 'lucide--eye',
        label: 'Opened',
      },
      clicked: {
        class: 'badge-primary',
        icon: 'lucide--mouse-pointer-click',
        label: 'Clicked',
      },
      bounced: {
        class: 'badge-error',
        icon: 'lucide--alert-triangle',
        label: 'Bounced',
      },
      soft_bounced: {
        class: 'badge-warning',
        icon: 'lucide--alert-circle',
        label: 'Soft Bounce',
      },
      complained: {
        class: 'badge-error',
        icon: 'lucide--flag',
        label: 'Complained',
      },
      unsubscribed: {
        class: 'badge-neutral',
        icon: 'lucide--user-minus',
        label: 'Unsubscribed',
      },
      failed: {
        class: 'badge-error',
        icon: 'lucide--x-circle',
        label: 'Failed',
      },
    };
    const badge = badges[status];
    return (
      <span className={`badge badge-sm ${badge.class} gap-1`}>
        <Icon icon={badge.icon} className="size-3" />
        {badge.label}
      </span>
    );
  };

  const totalPages = meta?.totalPages ?? 0;

  // DataTable column definitions
  const columns: ColumnDef<SuperadminEmailJob>[] = [
    {
      key: 'recipient',
      label: 'Recipient',
      width: 'w-64',
      render: (email) => (
        <TableAvatarCell
          name={email.toName || email.toEmail}
          subtitle={email.toName ? email.toEmail : undefined}
          rounded
          size="sm"
        />
      ),
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (email) => (
        <div className="max-w-xs truncate" title={email.subject}>
          {email.subject}
        </div>
      ),
    },
    {
      key: 'templateName',
      label: 'Template',
      render: (email) => (
        <span className="badge badge-outline badge-sm">
          {email.templateName}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (email) => (
        <div className="flex flex-col gap-1">
          {getStatusBadge(email.status)}
          {email.status === 'failed' && email.lastError && (
            <span
              className="text-xs text-error truncate max-w-32"
              title={email.lastError}
            >
              {email.lastError}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'delivery',
      label: 'Delivery',
      render: (email) => (
        <div className="flex flex-col gap-1">
          {getDeliveryStatusBadge(email.deliveryStatus)}
          {email.deliveryStatusAt && (
            <span className="text-xs text-base-content/50">
              {new Date(email.deliveryStatusAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'sentAt',
      label: 'Sent At',
      sortable: true,
      render: (email) => (
        <div>
          <div className="text-sm">
            {formatDateTime(email.processedAt || email.createdAt)}
          </div>
          {email.attempts > 1 && (
            <div className="text-xs text-base-content/50">
              {email.attempts}/{email.maxAttempts} attempts
            </div>
          )}
        </div>
      ),
    },
  ];

  // DataTable row actions
  const rowActions: RowAction<SuperadminEmailJob>[] = [
    {
      label: 'Preview',
      icon: 'lucide--eye',
      onAction: handlePreview,
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--mail" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Email History</h1>
          {meta && (
            <span className="badge badge-ghost">{meta.total} total</span>
          )}
        </div>
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

      <DataTable<SuperadminEmailJob>
        data={emailJobs}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        rowActions={rowActions}
        useDropdownActions
        onRowClick={handlePreview}
        enableSearch
        searchPlaceholder="Search by recipient email..."
        onSearch={handleSearch}
        toolbarActions={
          <select
            className="select select-bordered select-sm"
            value={statusFilter}
            onChange={(e) =>
              handleStatusFilterChange(e.target.value as EmailJobStatus | '')
            }
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        }
        emptyMessage="No emails found"
        noResultsMessage={
          searchQuery || statusFilter
            ? 'No emails match your search criteria. Try adjusting your filters.'
            : 'No emails found'
        }
        emptyIcon="lucide--mail"
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
        paginationItemLabel="emails"
      />

      {/* Email Preview Modal */}
      <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-4xl w-full h-[calc(100vh-2rem)] !max-h-[calc(100vh-2rem)] flex flex-col p-6">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon="lucide--mail" className="size-5" />
              Email Preview
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={handleClosePreview}
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          {previewLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : previewError ? (
            <div className="alert alert-error">
              <Icon icon="lucide--alert-circle" className="size-5" />
              <span>{previewError.message}</span>
            </div>
          ) : preview ? (
            <>
              <div className="bg-base-200 rounded-lg p-4 mb-4 shrink-0">
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <span className="font-medium text-base-content/70">To:</span>
                  <span>
                    {preview.toName
                      ? `${preview.toName} <${preview.toEmail}>`
                      : preview.toEmail}
                  </span>
                  <span className="font-medium text-base-content/70">
                    Subject:
                  </span>
                  <span className="font-medium">{preview.subject}</span>
                </div>
              </div>
              <div className="flex-1 min-h-0 border border-base-300 rounded-lg overflow-hidden">
                <iframe
                  srcDoc={preview.html}
                  sandbox="allow-same-origin allow-scripts"
                  className="w-full h-full bg-white"
                  title="Email Preview"
                />
              </div>
            </>
          ) : null}

          <div className="modal-action shrink-0">
            <button className="btn" onClick={handleClosePreview}>
              Close
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleClosePreview}>close</button>
        </form>
      </dialog>
    </div>
  );
}
