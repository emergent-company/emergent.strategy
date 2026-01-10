import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
} from '@/components/organisms/DataTable';
import {
  useReleases,
  useReleasePreview,
  useReleaseActions,
  useReleaseEmailPreview,
  type ReleaseListItem,
  type ChangelogItem,
} from '@/hooks/use-releases';

type TargetMode = 'all' | 'project' | 'user';

export default function SuperadminReleasesPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;

  // Modal refs
  const createModalRef = useRef<HTMLDialogElement>(null);
  const previewModalRef = useRef<HTMLDialogElement>(null);
  const sendModalRef = useRef<HTMLDialogElement>(null);
  const deleteModalRef = useRef<HTMLDialogElement>(null);

  // Create release form state
  const [sinceDate, setSinceDate] = useState('');
  const [untilDate, setUntilDate] = useState('');

  // Send notifications form state
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>('all');
  const [targetId, setTargetId] = useState('');
  const [dryRun, setDryRun] = useState(true);

  // Delete confirmation state
  const [deleteVersion, setDeleteVersion] = useState<string | null>(null);

  const { releases, isLoading, error, refetch } = useReleases(limit, offset);
  const {
    preview,
    isLoading: previewLoading,
    error: previewError,
    fetchPreview,
    clearPreview,
  } = useReleasePreview();
  const {
    isLoading: actionLoading,
    error: actionError,
    createRelease,
    sendNotifications,
    deleteRelease,
  } = useReleaseActions();

  const {
    emailPreview,
    isLoading: emailPreviewLoading,
    error: emailPreviewError,
  } = useReleaseEmailPreview(selectedVersion ?? undefined);

  // Close modals on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        createModalRef.current?.close();
        previewModalRef.current?.close();
        sendModalRef.current?.close();
        deleteModalRef.current?.close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const handleOpenCreateModal = () => {
    setSinceDate('');
    setUntilDate('');
    clearPreview();
    createModalRef.current?.showModal();
  };

  const handleCloseCreateModal = () => {
    createModalRef.current?.close();
    clearPreview();
  };

  const handlePreviewRelease = async () => {
    if (!sinceDate) return;
    await fetchPreview(sinceDate, untilDate || undefined);
  };

  const handleCreateRelease = async () => {
    if (!sinceDate) return;
    try {
      await createRelease({
        since: sinceDate,
        until: untilDate || undefined,
      });
      handleCloseCreateModal();
      refetch();
    } catch {
      // Error is captured in actionError
    }
  };

  const handleViewChangelog = (release: ReleaseListItem) => {
    setSelectedVersion(release.version);
    previewModalRef.current?.showModal();
  };

  const handleClosePreviewModal = () => {
    previewModalRef.current?.close();
    setSelectedVersion(null);
  };

  const handleOpenSendModal = (version: string) => {
    setSelectedVersion(version);
    setTargetMode('all');
    setTargetId('');
    setDryRun(true);
    sendModalRef.current?.showModal();
  };

  const handleCloseSendModal = () => {
    sendModalRef.current?.close();
    setSelectedVersion(null);
  };

  const handleSendNotifications = async () => {
    if (!selectedVersion) return;
    try {
      await sendNotifications(selectedVersion, {
        allUsers: targetMode === 'all',
        projectId: targetMode === 'project' ? targetId : undefined,
        userId: targetMode === 'user' ? targetId : undefined,
        dryRun,
      });
      handleCloseSendModal();
      refetch();
    } catch {
      // Error is captured in actionError
    }
  };

  const handleOpenDeleteModal = (version: string) => {
    setDeleteVersion(version);
    deleteModalRef.current?.showModal();
  };

  const handleCloseDeleteModal = () => {
    deleteModalRef.current?.close();
    setDeleteVersion(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteVersion) return;
    try {
      await deleteRelease(deleteVersion);
      handleCloseDeleteModal();
      refetch();
    } catch {
      // Error is captured in actionError
    }
  };

  const renderChangelogSection = (
    title: string,
    items: ChangelogItem[],
    icon: string,
    colorClass: string
  ) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-4">
        <h4
          className={`font-semibold flex items-center gap-2 mb-2 ${colorClass}`}
        >
          <Icon icon={icon} className="size-4" />
          {title} ({items.length})
        </h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {items.map((item, idx) => (
            <li key={idx}>
              <span className="font-medium">{item.title}</span>
              {item.description && (
                <span className="text-base-content/70">
                  {' '}
                  - {item.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const totalItems = releases.length;
  const hasMore = releases.length === limit;

  const columns: ColumnDef<ReleaseListItem>[] = [
    {
      key: 'version',
      label: 'Version',
      width: 'w-32',
      render: (release) => (
        <span className="font-mono font-medium">{release.version}</span>
      ),
    },
    {
      key: 'commitCount',
      label: 'Commits',
      width: 'w-24',
      render: (release) => (
        <span className="badge badge-outline">{release.commitCount}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (release) => formatDate(release.createdAt),
    },
  ];

  const rowActions: RowAction<ReleaseListItem>[] = [
    {
      label: 'View Changelog',
      icon: 'lucide--eye',
      onAction: handleViewChangelog,
    },
    {
      label: 'Send Notifications',
      icon: 'lucide--send',
      onAction: (release) => handleOpenSendModal(release.version),
    },
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: (release) => handleOpenDeleteModal(release.version),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--rocket" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Releases</h1>
          <span className="badge badge-ghost">{totalItems} shown</span>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleOpenCreateModal}
          >
            <Icon icon="lucide--plus" className="size-4" />
            Create Release
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => refetch()}
            disabled={isLoading}
            aria-label="Refresh releases"
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Icon icon="lucide--refresh-cw" className="size-4" />
            )}
          </button>
        </div>
      </div>

      <DataTable<ReleaseListItem>
        data={releases}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        rowActions={rowActions}
        useDropdownActions
        enableSearch={false}
        emptyMessage="No releases found"
        emptyIcon="lucide--rocket"
      />

      {!isLoading && (page > 1 || hasMore) && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-base-content/70">Page {page}</div>
          <div className="join">
            <button
              className="join-item btn btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              «
            </button>
            <button className="join-item btn btn-sm">Page {page}</button>
            <button
              className="join-item btn btn-sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Create Release Modal */}
      <dialog ref={createModalRef} className="modal">
        <div className="modal-box max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon="lucide--plus" className="size-5" />
              Create Release
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={handleCloseCreateModal}
              aria-label="Close modal"
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Since Date *</span>
              </label>
              <div className="input input-bordered flex items-center gap-2">
                <Icon icon="lucide--calendar" className="size-4 opacity-50" />
                <input
                  type="date"
                  className="grow"
                  value={sinceDate}
                  onChange={(e) => setSinceDate(e.target.value)}
                  required
                />
              </div>
              <label className="label">
                <span className="label-text-alt">
                  Start date for commits to include
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Until Date (optional)</span>
              </label>
              <div className="input input-bordered flex items-center gap-2">
                <Icon icon="lucide--calendar" className="size-4 opacity-50" />
                <input
                  type="date"
                  className="grow"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                />
              </div>
              <label className="label">
                <span className="label-text-alt">
                  End date (defaults to now)
                </span>
              </label>
            </div>

            <button
              className="btn btn-outline btn-sm w-full"
              onClick={handlePreviewRelease}
              disabled={!sinceDate || previewLoading}
            >
              {previewLoading ? (
                <Spinner size="sm" />
              ) : (
                <Icon icon="lucide--eye" className="size-4" />
              )}
              Preview Commits
            </button>

            {previewError && (
              <div className="alert alert-error text-sm">
                <Icon icon="lucide--alert-circle" className="size-4" />
                <span>{previewError.message}</span>
              </div>
            )}

            {preview && (
              <div className="bg-base-200 rounded-lg p-4 text-sm">
                <div className="font-semibold mb-2">
                  Preview: {preview.version}
                </div>
                <div className="text-base-content/70">
                  {preview.commitCount} commits from{' '}
                  {preview.fromCommit.substring(0, 7)} to{' '}
                  {preview.toCommit.substring(0, 7)}
                </div>
                {preview.changelog.summary && (
                  <p className="mt-2 text-base-content/80">
                    {preview.changelog.summary}
                  </p>
                )}
              </div>
            )}

            {actionError && (
              <div className="alert alert-error text-sm">
                <Icon icon="lucide--alert-circle" className="size-4" />
                <span>{actionError.message}</span>
              </div>
            )}
          </div>

          <div className="modal-action">
            <button className="btn btn-ghost" onClick={handleCloseCreateModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateRelease}
              disabled={!sinceDate || actionLoading}
            >
              {actionLoading ? (
                <Spinner size="sm" />
              ) : (
                <Icon icon="lucide--rocket" className="size-4" />
              )}
              Create Release
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCloseCreateModal}>close</button>
        </form>
      </dialog>

      {/* Email Preview Modal */}
      <dialog ref={previewModalRef} className="modal">
        <div className="modal-box max-w-4xl w-full h-[calc(100vh-2rem)] !max-h-[calc(100vh-2rem)] flex flex-col p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon="lucide--mail" className="size-5" />
              Email Preview
              {selectedVersion && (
                <span className="badge badge-primary">{selectedVersion}</span>
              )}
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={handleClosePreviewModal}
              aria-label="Close modal"
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          {emailPreviewLoading ? (
            <div className="flex items-center justify-center py-8 flex-1">
              <Spinner size="lg" />
            </div>
          ) : emailPreviewError ? (
            <div className="alert alert-error">
              <Icon icon="lucide--alert-circle" className="size-5" />
              <span>{emailPreviewError.message}</span>
            </div>
          ) : emailPreview ? (
            <div className="flex-1 min-h-0">
              <iframe
                srcDoc={emailPreview.html}
                className="w-full h-full min-h-[500px] border border-base-300 rounded-lg bg-white"
                sandbox="allow-same-origin allow-scripts"
                title="Email Preview"
              />
            </div>
          ) : null}

          <div className="modal-action mt-4">
            <button className="btn" onClick={handleClosePreviewModal}>
              Close
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleClosePreviewModal}>close</button>
        </form>
      </dialog>

      {/* Send Notifications Modal */}
      <dialog ref={sendModalRef} className="modal">
        <div className="modal-box max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon="lucide--send" className="size-5" />
              Send Notifications
              {selectedVersion && (
                <span className="badge badge-primary">{selectedVersion}</span>
              )}
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={handleCloseSendModal}
              aria-label="Close modal"
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Target Audience</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="targetMode"
                    className="radio radio-primary"
                    checked={targetMode === 'all'}
                    onChange={() => setTargetMode('all')}
                  />
                  <span>All Users</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="targetMode"
                    className="radio radio-primary"
                    checked={targetMode === 'project'}
                    onChange={() => setTargetMode('project')}
                  />
                  <span>Specific Project</span>
                </label>
                {targetMode === 'project' && (
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full ml-7"
                    placeholder="Project ID"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  />
                )}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="targetMode"
                    className="radio radio-primary"
                    checked={targetMode === 'user'}
                    onChange={() => setTargetMode('user')}
                  />
                  <span>Specific User</span>
                </label>
                {targetMode === 'user' && (
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full ml-7"
                    placeholder="User ID"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="form-control">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                <span>Dry Run (preview only, don't actually send)</span>
              </label>
            </div>

            {actionError && (
              <div className="alert alert-error text-sm">
                <Icon icon="lucide--alert-circle" className="size-4" />
                <span>{actionError.message}</span>
              </div>
            )}
          </div>

          <div className="modal-action">
            <button className="btn btn-ghost" onClick={handleCloseSendModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSendNotifications}
              disabled={
                actionLoading ||
                ((targetMode === 'project' || targetMode === 'user') &&
                  !targetId)
              }
            >
              {actionLoading ? (
                <Spinner size="sm" />
              ) : (
                <Icon icon="lucide--send" className="size-4" />
              )}
              {dryRun ? 'Preview Send' : 'Send Notifications'}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCloseSendModal}>close</button>
        </form>
      </dialog>

      {/* Delete Confirmation Modal */}
      <dialog ref={deleteModalRef} className="modal">
        <div className="modal-box max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2 text-error">
              <Icon icon="lucide--trash-2" className="size-5" />
              Delete Release
            </h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={handleCloseDeleteModal}
              aria-label="Close modal"
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          <p className="text-base-content/80">
            Are you sure you want to delete release{' '}
            <span className="font-mono font-bold">{deleteVersion}</span>?
          </p>
          <p className="text-sm text-base-content/60 mt-2">
            This action cannot be undone.
          </p>

          {actionError && (
            <div className="alert alert-error text-sm mt-4">
              <Icon icon="lucide--alert-circle" className="size-4" />
              <span>{actionError.message}</span>
            </div>
          )}

          <div className="modal-action">
            <button className="btn btn-ghost" onClick={handleCloseDeleteModal}>
              Cancel
            </button>
            <button
              className="btn btn-error"
              onClick={handleConfirmDelete}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Spinner size="sm" />
              ) : (
                <Icon icon="lucide--trash-2" className="size-4" />
              )}
              Delete
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCloseDeleteModal}>close</button>
        </form>
      </dialog>
    </div>
  );
}
