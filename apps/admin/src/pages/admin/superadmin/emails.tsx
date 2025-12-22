import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  useSuperadminEmails,
  useSuperadminEmailPreview,
  type EmailJobStatus,
  type SuperadminEmailJob,
} from '@/hooks/use-superadmin-emails';

export default function SuperadminEmailsPage() {
  const [page, setPage] = useState(1);
  const [recipient, setRecipient] = useState('');
  const [debouncedRecipient, setDebouncedRecipient] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmailJobStatus | ''>('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);

  const { emailJobs, meta, isLoading, error, refetch } = useSuperadminEmails({
    page,
    limit: 20,
    recipient: debouncedRecipient || undefined,
    status: statusFilter || undefined,
  });

  const {
    preview,
    isLoading: previewLoading,
    error: previewError,
    fetchPreview,
    clearPreview,
  } = useSuperadminEmailPreview();

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      setDebouncedRecipient(value);
      setPage(1);
    }, 300);
    setSearchTimeout(timeout);
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
      pending: { class: 'badge-warning', icon: 'lucide:clock' },
      processing: { class: 'badge-info', icon: 'lucide:loader' },
      sent: { class: 'badge-success', icon: 'lucide:check' },
      failed: { class: 'badge-error', icon: 'lucide:x' },
    };
    const badge = badges[status];
    return (
      <span className={`badge badge-sm ${badge.class} gap-1`}>
        <Icon icon={badge.icon} className="size-3" />
        {status}
      </span>
    );
  };

  const totalPages = meta?.totalPages ?? 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide:mail" className="size-6 text-primary" />
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
            <Icon icon="lucide:refresh-cw" className="size-4" />
          )}
          Refresh
        </button>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="form-control flex-1">
              <label className="input input-bordered flex items-center gap-2">
                <Icon icon="lucide:search" className="size-4 opacity-50" />
                <input
                  type="text"
                  placeholder="Search by recipient email..."
                  className="grow"
                  value={recipient}
                  onChange={(e) => handleRecipientChange(e.target.value)}
                />
              </label>
            </div>
            <div className="form-control w-full sm:w-48">
              <select
                className="select select-bordered"
                value={statusFilter}
                onChange={(e) =>
                  handleStatusFilterChange(
                    e.target.value as EmailJobStatus | ''
                  )
                }
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="alert alert-error mb-4">
              <Icon icon="lucide:alert-circle" className="size-5" />
              <span>{error.message}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Sent At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8">
                      <Spinner size="lg" />
                      <p className="mt-2 text-base-content/70">
                        Loading emails...
                      </p>
                    </td>
                  </tr>
                ) : emailJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8">
                      <p className="text-base-content/70">No emails found</p>
                      {(debouncedRecipient || statusFilter) && (
                        <p className="mt-1 text-sm text-base-content/50">
                          Try adjusting your filters
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  emailJobs.map((email) => (
                    <tr key={email.id} className="hover">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar placeholder">
                            <div className="bg-accent text-accent-content rounded-full w-10">
                              <Icon icon="lucide:mail" className="size-5" />
                            </div>
                          </div>
                          <div>
                            <div className="font-medium">
                              {email.toName || email.toEmail}
                            </div>
                            {email.toName && (
                              <div className="text-sm text-base-content/70">
                                {email.toEmail}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div
                          className="max-w-xs truncate"
                          title={email.subject}
                        >
                          {email.subject}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-outline badge-sm">
                          {email.templateName}
                        </span>
                      </td>
                      <td>
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
                      </td>
                      <td>
                        <div className="text-sm">
                          {formatDateTime(email.processedAt || email.createdAt)}
                        </div>
                        {email.attempts > 1 && (
                          <div className="text-xs text-base-content/50">
                            {email.attempts}/{email.maxAttempts} attempts
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Preview email"
                          onClick={() => handlePreview(email)}
                        >
                          <Icon icon="lucide:eye" className="size-4" />
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && emailJobs.length > 0 && meta && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-base-content/70">
                Showing {(page - 1) * meta.limit + 1} -{' '}
                {Math.min(page * meta.limit, meta.total)} of {meta.total} emails
              </div>
              <div className="join">
                <button
                  className="join-item btn btn-sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!meta.hasPrev}
                >
                  «
                </button>
                <button className="join-item btn btn-sm">
                  Page {page} of {totalPages}
                </button>
                <button
                  className="join-item btn btn-sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!meta.hasNext}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Email Preview Modal */}
      <dialog ref={modalRef} className="modal">
        <div className="modal-box max-w-4xl h-[80vh] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon="lucide:mail" className="size-5" />
              Email Preview
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={handleClosePreview}
            >
              <Icon icon="lucide:x" className="size-4" />
            </button>
          </div>

          {previewLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : previewError ? (
            <div className="alert alert-error">
              <Icon icon="lucide:alert-circle" className="size-5" />
              <span>{previewError.message}</span>
            </div>
          ) : preview ? (
            <>
              <div className="bg-base-200 rounded-lg p-4 mb-4">
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
              <div className="flex-1 border border-base-300 rounded-lg overflow-hidden">
                <iframe
                  srcDoc={preview.html}
                  sandbox="allow-same-origin"
                  className="w-full h-full bg-white"
                  title="Email Preview"
                />
              </div>
            </>
          ) : null}

          <div className="modal-action">
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
