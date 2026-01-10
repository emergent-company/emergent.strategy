import { useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { Modal } from '@/components/organisms/Modal/Modal';
import { useApi } from '@/hooks/use-api';

interface DocumentMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: Record<string, any> | null | undefined;
  documentName: string;
}

interface ResolvedMetadata {
  spaceName?: string;
  parentName?: string;
  loading: boolean;
  error?: string;
}

export function DocumentMetadataModal({
  isOpen,
  onClose,
  metadata,
  documentName,
}: DocumentMetadataModalProps) {
  const [resolved, setResolved] = useState<ResolvedMetadata>({
    loading: false,
  });
  const { apiBase, fetchJson } = useApi();

  useEffect(() => {
    if (!metadata || !isOpen) {
      setResolved({ loading: false });
      return;
    }

    const fetchNames = async () => {
      setResolved({ loading: true });

      const spaceId = metadata.imported_from_space_id;
      const parentId = metadata.parent_id;
      const parentType = metadata.parent_type;

      let spaceName: string | undefined;
      let parentName: string | undefined;
      let error: string | undefined;

      try {
        // Fetch space name if space ID is available
        if (spaceId) {
          try {
            const spaceData = await fetchJson<{ id: string; name: string }>(
              `${apiBase}/api/integrations/clickup/spaces/${spaceId}`
            );
            spaceName = spaceData.name;
          } catch (err) {
            console.error('Failed to fetch space name:', err);
            spaceName = `Space ${spaceId}`;
          }
        }

        // Fetch parent name based on parent type
        if (parentId && parentType) {
          try {
            // Parent type 6 = Folder
            if (parentType === '6') {
              const folderData = await fetchJson<{ id: string; name: string }>(
                `${apiBase}/api/integrations/clickup/folders/${parentId}`
              );
              parentName = folderData.name;
            }
            // For other types (workspace, list), just show the ID for now
            else {
              parentName = `${
                parentType === '1'
                  ? 'Workspace'
                  : parentType === '12'
                  ? 'List'
                  : 'Container'
              } ${parentId}`;
            }
          } catch (err) {
            console.error('Failed to fetch parent name:', err);
            parentName = `Parent ${parentId}`;
          }
        }
      } catch (err) {
        console.error('Error fetching metadata names:', err);
        error = 'Failed to fetch some details from ClickUp';
      }

      setResolved({
        spaceName,
        parentName,
        loading: false,
        error,
      });
    };

    fetchNames();
  }, [metadata, isOpen, apiBase, fetchJson]);

  if (!metadata) {
    return (
      <Modal
        open={isOpen}
        onOpenChange={(open) => !open && onClose()}
        title="Document Metadata"
        actions={[{ label: 'Close', onClick: onClose }]}
      >
        <div className="py-8 text-base-content/60 text-center">
          <Icon
            icon="lucide--info"
            className="opacity-50 mx-auto mb-3 w-12 h-12"
          />
          <p>No metadata available for this document.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={`Metadata: ${documentName}`}
      actions={[{ label: 'Close', onClick: onClose }]}
    >
      <div className="space-y-4">
        {/* Error Alert */}
        {resolved.error && (
          <div role="alert" className="alert alert-warning">
            <Icon icon="lucide--alert-triangle" className="w-5 h-5" />
            <span>{resolved.error}</span>
          </div>
        )}

        {/* Email Info */}
        {metadata.messageId && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon icon="lucide--mail" className="w-4 h-4 text-blue-500" />
                Email Details
              </h3>
              <div className="space-y-2 text-sm">
                {metadata.subject && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Subject:
                    </span>
                    <span className="flex-1 font-semibold">
                      {metadata.subject}
                    </span>
                  </div>
                )}
                {metadata.from && Array.isArray(metadata.from) && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      From:
                    </span>
                    <span className="flex-1">
                      {metadata.from
                        .map((a: { name?: string; address: string }) =>
                          a.name ? `${a.name} <${a.address}>` : a.address
                        )
                        .join(', ')}
                    </span>
                  </div>
                )}
                {metadata.to && Array.isArray(metadata.to) && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      To:
                    </span>
                    <span className="flex-1">
                      {metadata.to
                        .map((a: { name?: string; address: string }) =>
                          a.name ? `${a.name} <${a.address}>` : a.address
                        )
                        .join(', ')}
                    </span>
                  </div>
                )}
                {metadata.cc &&
                  Array.isArray(metadata.cc) &&
                  metadata.cc.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="min-w-24 font-medium text-base-content/70">
                        CC:
                      </span>
                      <span className="flex-1">
                        {metadata.cc
                          .map((a: { name?: string; address: string }) =>
                            a.name ? `${a.name} <${a.address}>` : a.address
                          )
                          .join(', ')}
                      </span>
                    </div>
                  )}
                {metadata.date && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Date:
                    </span>
                    <span className="flex-1">
                      {new Date(metadata.date).toLocaleString()}
                    </span>
                  </div>
                )}
                {metadata.hasAttachments && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Attachments:
                    </span>
                    <span className="badge badge-sm badge-primary">
                      {metadata.attachmentCount || 'Yes'}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="min-w-24 font-medium text-base-content/70">
                    Message ID:
                  </span>
                  <code className="flex-1 bg-base-100 px-2 py-1 rounded text-xs break-all">
                    {metadata.messageId}
                  </code>
                </div>
                {metadata.folder && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Folder:
                    </span>
                    <span className="flex-1">{metadata.folder}</span>
                  </div>
                )}
                {metadata.provider && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Source:
                    </span>
                    <span className="badge badge-sm badge-outline">
                      {metadata.provider === 'upload'
                        ? 'Uploaded File'
                        : metadata.provider === 'gmail_oauth'
                        ? 'Gmail'
                        : metadata.provider}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ClickUp Integration Info */}
        {metadata.clickup_id && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon
                  icon="simple-icons--clickup"
                  className="w-4 h-4 text-purple-500"
                />
                ClickUp Document
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="min-w-24 font-medium text-base-content/70">
                    Document ID:
                  </span>
                  <code className="flex-1 bg-base-100 px-2 py-1 rounded">
                    {metadata.clickup_id}
                  </code>
                </div>
                {metadata.workspace_id && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Workspace:
                    </span>
                    <code className="flex-1 bg-base-100 px-2 py-1 rounded">
                      {metadata.workspace_id}
                    </code>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Space Info */}
        {(metadata.imported_from_space_id || resolved.spaceName) && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon icon="lucide--folder" className="w-4 h-4" />
                Space
                {resolved.loading && <Spinner size="xs" className="ml-auto" />}
              </h3>
              <div className="space-y-2 text-sm">
                {metadata.imported_from_space_id && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Space ID:
                    </span>
                    <code className="flex-1 bg-base-100 px-2 py-1 rounded">
                      {metadata.imported_from_space_id}
                    </code>
                  </div>
                )}
                {resolved.spaceName && !resolved.loading && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Space Name:
                    </span>
                    <span className="flex-1 font-semibold text-base-content">
                      {resolved.spaceName}
                    </span>
                  </div>
                )}
                {resolved.loading && !resolved.spaceName && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Space Name:
                    </span>
                    <span className="flex-1 text-base-content/50">
                      Loading...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Parent Info */}
        {metadata.parent_id && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon icon="lucide--folder-tree" className="w-4 h-4" />
                Parent Container
                {resolved.loading && <Spinner size="xs" className="ml-auto" />}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="min-w-24 font-medium text-base-content/70">
                    Parent ID:
                  </span>
                  <code className="flex-1 bg-base-100 px-2 py-1 rounded">
                    {metadata.parent_id}
                  </code>
                </div>
                {metadata.parent_type && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Parent Type:
                    </span>
                    <span className="badge badge-sm">
                      {metadata.parent_type === '1'
                        ? 'Workspace'
                        : metadata.parent_type === '6'
                        ? 'Folder'
                        : metadata.parent_type === '12'
                        ? 'List'
                        : `Type ${metadata.parent_type}`}
                    </span>
                  </div>
                )}
                {resolved.parentName && !resolved.loading && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Parent Name:
                    </span>
                    <span className="flex-1 font-semibold text-base-content">
                      {resolved.parentName}
                    </span>
                  </div>
                )}
                {resolved.loading &&
                  !resolved.parentName &&
                  metadata.parent_type === '6' && (
                    <div className="flex items-start gap-2">
                      <span className="min-w-24 font-medium text-base-content/70">
                        Parent Name:
                      </span>
                      <span className="flex-1 text-base-content/50">
                        Loading...
                      </span>
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Timestamps */}
        {(metadata.date_created || metadata.date_updated) && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon icon="lucide--clock" className="w-4 h-4" />
                Timestamps
              </h3>
              <div className="space-y-2 text-sm">
                {metadata.date_created && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Created:
                    </span>
                    <span className="flex-1">
                      {new Date(Number(metadata.date_created)).toLocaleString()}
                    </span>
                  </div>
                )}
                {metadata.date_updated && (
                  <div className="flex items-start gap-2">
                    <span className="min-w-24 font-medium text-base-content/70">
                      Updated:
                    </span>
                    <span className="flex-1">
                      {new Date(Number(metadata.date_updated)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Creator Info */}
        {metadata.creator_id && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon icon="lucide--user" className="w-4 h-4" />
                Creator
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="min-w-24 font-medium text-base-content/70">
                    Creator ID:
                  </span>
                  <code className="flex-1 bg-base-100 px-2 py-1 rounded">
                    {metadata.creator_id}
                  </code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status */}
        {metadata.deleted !== undefined && (
          <div className="bg-base-200 card">
            <div className="p-4 card-body">
              <h3 className="flex items-center gap-2 mb-3 font-semibold text-sm">
                <Icon icon="lucide--info" className="w-4 h-4" />
                Status
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="min-w-24 font-medium text-base-content/70">
                    Deleted:
                  </span>
                  <span
                    className={`badge ${
                      metadata.deleted ? 'badge-error' : 'badge-success'
                    }`}
                  >
                    {metadata.deleted ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
