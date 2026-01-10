import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Tooltip } from '@/components/atoms/Tooltip';
import { PageContainer } from '@/components/layouts';
import { useAuth } from '@/contexts/useAuth';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';
import { useDataUpdates } from '@/contexts/data-updates';
import {
  getSourceTypePlugin,
  getSourceTypeDisplayName,
  getSourceTypeIcon,
} from '@/lib/source-type-plugins';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
} from '@/components/organisms/DataTable';
import { createDocumentsClient } from '@/api/documents';
import { DeletionConfirmationModal } from '@/components/organisms/DeletionConfirmationModal';
import { DocumentMetadataModal } from '@/components/organisms/DocumentMetadataModal';

type DocumentRow = {
  id: string;
  name?: string | null;
  filename?: string | null;
  sourceUrl?: string | null;
  source_url?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  chunks: number;
  totalChars?: number;
  embeddedChunks?: number;
  extractionStatus?: string;
  integrationMetadata?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  conversionStatus?:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'not_required'
    | null;
  conversionError?: string | null;
  sourceType?: string;
  dataSourceIntegrationId?: string;
  childCount?: number | null;
  parentDocumentId?: string | null;
  fileSizeBytes?: number | null;
};

function normalize(doc: DocumentRow): DocumentRow {
  const filename = doc.filename || doc.name || null;
  const sourceUrl = doc.source_url ?? doc.sourceUrl ?? null;
  const mime = doc.mime_type || doc.mimeType || null;
  const createdRaw = doc.created_at || doc.createdAt || '';
  const updatedRaw = doc.updated_at || doc.updatedAt || '';
  return {
    ...doc,
    filename,
    source_url: sourceUrl,
    mime_type: mime,
    created_at: createdRaw,
    updated_at: updatedRaw,
  } as DocumentRow;
}

export default function SourceTypeDocumentsPage() {
  const navigate = useNavigate();
  const { sourceType } = useParams<{ sourceType: string }>();
  const { getAccessToken } = useAuth();
  const { buildHeaders, apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const { showToast } = useToast();

  const [data, setData] = useState<DocumentRow[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Deletion modal state
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const [documentsToDelete, setDocumentsToDelete] = useState<DocumentRow[]>([]);

  // Metadata modal state
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [selectedDocumentForMetadata, setSelectedDocumentForMetadata] =
    useState<DocumentRow | null>(null);

  // Get plugin info for the source type
  const plugin = useMemo(
    () => (sourceType ? getSourceTypePlugin(sourceType) : undefined),
    [sourceType]
  );

  const displayName = useMemo(
    () => getSourceTypeDisplayName(sourceType, true),
    [sourceType]
  );

  const icon = useMemo(() => getSourceTypeIcon(sourceType), [sourceType]);

  const documentsClient = createDocumentsClient(
    apiBase,
    fetchJson,
    config.activeProjectId
  );

  // Load documents filtered by source type
  useEffect(() => {
    let cancelled = false;

    setData([]);
    setTotalCount(0);

    if (!config.activeOrgId || !config.activeProjectId || !sourceType) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = getAccessToken();
        const json = await fetchJson<
          DocumentRow[] | { documents: DocumentRow[]; total?: number }
        >(
          `${apiBase}/api/documents?sourceType=${encodeURIComponent(
            sourceType!
          )}&rootOnly=true`,
          {
            headers: t ? { ...buildHeaders({ json: false }) } : {},
            json: false,
          }
        );
        const docsList = Array.isArray(json) ? json : json.documents;
        const total =
          !Array.isArray(json) && 'total' in json
            ? json.total
            : docsList.length;

        const docs = docsList.map(normalize);
        if (!cancelled) {
          setData(docs);
          setTotalCount(total || docs.length);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    apiBase,
    getAccessToken,
    buildHeaders,
    fetchJson,
    config.activeOrgId,
    config.activeProjectId,
    sourceType,
  ]);

  // Refresh documents function
  const refreshDocuments = useCallback(async () => {
    if (!config.activeOrgId || !config.activeProjectId || !sourceType) return;

    try {
      const t = getAccessToken();
      const json = await fetchJson<
        DocumentRow[] | { documents: DocumentRow[]; total?: number }
      >(
        `${apiBase}/api/documents?sourceType=${encodeURIComponent(
          sourceType
        )}&rootOnly=true&_t=${Date.now()}`,
        {
          headers: t ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        }
      );
      const docsList = Array.isArray(json) ? json : json.documents;
      const total =
        !Array.isArray(json) && 'total' in json ? json.total : docsList.length;

      const docs = docsList.map(normalize);
      setData(docs);
      setTotalCount(total || docs.length);
    } catch (e: unknown) {
      console.error('[SourceTypeDocuments] Failed to refresh:', e);
    }
  }, [
    apiBase,
    getAccessToken,
    buildHeaders,
    fetchJson,
    config.activeOrgId,
    config.activeProjectId,
    sourceType,
  ]);

  // Subscribe to real-time document updates
  useDataUpdates(
    'document:*',
    () => {
      void refreshDocuments();
    },
    [refreshDocuments]
  );

  // Handle delete single document
  const handleDeleteDocument = (document: DocumentRow) => {
    setDocumentsToDelete([document]);
    setTimeout(() => setIsDeletionModalOpen(true), 0);
  };

  // Handle bulk delete
  const handleBulkDelete = async (
    _selectedIds: string[],
    selectedItems: DocumentRow[]
  ) => {
    if (!selectedItems.length) return;
    setDocumentsToDelete(selectedItems);
    setTimeout(() => setIsDeletionModalOpen(true), 0);
  };

  // Handle view metadata
  const handleViewMetadata = (document: DocumentRow) => {
    setSelectedDocumentForMetadata(document);
    setIsMetadataModalOpen(true);
  };

  // Fetch deletion impact for modal
  const fetchDeletionImpact = async (ids: string | string[]) => {
    if (Array.isArray(ids)) {
      return await documentsClient.getBulkDeletionImpact(ids);
    } else {
      return await documentsClient.getDeletionImpact(ids);
    }
  };

  // Confirm deletion from modal
  const handleConfirmDeletion = async () => {
    try {
      const documentIds = documentsToDelete.map((d) => d.id);

      if (documentIds.length === 1) {
        await documentsClient.deleteDocument(documentIds[0]);
        showToast({
          message: 'Document deleted successfully',
          variant: 'success',
        });
      } else {
        const result = await documentsClient.bulkDeleteDocuments(documentIds);
        if (result.notFound.length === 0) {
          showToast({
            message: `Successfully deleted ${result.deleted} document${
              result.deleted !== 1 ? 's' : ''
            }`,
            variant: 'success',
          });
        } else {
          showToast({
            message: `Deleted ${result.deleted} documents, but ${result.notFound.length} failed`,
            variant: 'warning',
            duration: 10000,
          });
        }
      }

      // Refresh
      await refreshDocuments();
      setIsDeletionModalOpen(false);
      setDocumentsToDelete([]);
    } catch (err) {
      console.error('Failed to delete documents:', err);
      showToast({
        message:
          err instanceof Error ? err.message : 'Failed to delete documents',
        variant: 'error',
      });
      throw err;
    }
  };

  // Build columns based on source type
  const columns: ColumnDef<DocumentRow>[] = useMemo(() => {
    const baseColumns: ColumnDef<DocumentRow>[] = [
      {
        key: 'filename',
        label: sourceType === 'email' ? 'Subject' : 'Document',
        sortable: true,
        width: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
        cellClassName: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
        render: (doc) => {
          // For emails, try to show subject from metadata
          const title =
            sourceType === 'email'
              ? doc.integrationMetadata?.subject || doc.filename
              : doc.filename;
          return (
            <span className="font-medium truncate block" title={title || ''}>
              {title || '(no name)'}
            </span>
          );
        },
      },
    ];

    // Add email-specific columns
    if (sourceType === 'email') {
      baseColumns.push(
        {
          key: 'from',
          label: 'From',
          sortable: true,
          width: 'w-48',
          render: (doc) => {
            const from = doc.integrationMetadata?.from;
            if (!from) return <span className="text-base-content/40">-</span>;
            return (
              <span
                className="text-sm text-base-content/70 truncate block"
                title={from}
              >
                {from}
              </span>
            );
          },
        },
        {
          key: 'date',
          label: 'Date',
          sortable: true,
          width: 'w-32',
          render: (doc) => {
            const date = doc.integrationMetadata?.date || doc.createdAt;
            if (!date) return <span className="text-base-content/40">-</span>;
            const formatted = new Date(date).toLocaleDateString();
            return (
              <span className="text-sm text-base-content/70">{formatted}</span>
            );
          },
        }
      );
    }

    // Add common columns
    baseColumns.push(
      {
        key: 'conversionStatus',
        label: 'Status',
        sortable: true,
        width: 'w-28',
        render: (doc) => {
          const status = doc.conversionStatus;
          if (!status || status === 'not_required') {
            return <span className="text-sm text-base-content/40">-</span>;
          }
          if (status === 'completed') {
            return (
              <div className="flex items-center gap-2">
                <Icon
                  icon="lucide--check-circle"
                  className="size-4 text-success"
                />
                <span className="text-sm text-base-content/70">Ready</span>
              </div>
            );
          }
          if (status === 'pending' || status === 'processing') {
            return (
              <div className="flex items-center gap-2">
                <Icon
                  icon="lucide--loader-circle"
                  className="size-4 text-info animate-spin"
                />
                <span className="text-sm text-base-content/70">Processing</span>
              </div>
            );
          }
          if (status === 'failed') {
            return (
              <Tooltip content={doc.conversionError || 'Conversion failed'}>
                <div className="flex items-center gap-2 cursor-help">
                  <Icon
                    icon="lucide--alert-circle"
                    className="size-4 text-error"
                  />
                  <span className="text-sm text-error">Failed</span>
                </div>
              </Tooltip>
            );
          }
          return <span className="text-sm text-base-content/40">-</span>;
        },
      },
      {
        key: 'chunks',
        label: 'Chunks',
        sortable: true,
        width: 'w-24',
        render: (doc) => {
          const embedded = doc.embeddedChunks ?? 0;
          const total = doc.chunks ?? 0;
          if (total === 0) {
            return <span className="text-sm text-base-content/40">-</span>;
          }
          const isComplete = embedded === total;
          return (
            <div className="flex items-center gap-2">
              <Icon
                icon={isComplete ? 'lucide--check-circle' : 'lucide--clock'}
                className={`size-4 ${
                  isComplete ? 'text-success' : 'text-warning'
                }`}
              />
              <span className="text-sm text-base-content/70">
                {embedded}/{total}
              </span>
            </div>
          );
        },
      },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        width: 'w-32',
        render: (doc) => {
          const date = doc.createdAt || doc.created_at;
          if (!date) return <span className="text-base-content/40">-</span>;
          return (
            <span className="text-sm text-base-content/70">
              {new Date(date).toLocaleDateString()}
            </span>
          );
        },
      }
    );

    return baseColumns;
  }, [sourceType]);

  // Row actions - use onAction instead of onClick
  const rowActions: RowAction<DocumentRow>[] = useMemo(
    () => [
      {
        label: 'View Metadata',
        icon: 'lucide--info',
        onAction: handleViewMetadata,
      },
      {
        label: 'Delete',
        icon: 'lucide--trash-2',
        onAction: handleDeleteDocument,
        variant: 'error',
      },
    ],
    []
  );

  // Bulk actions - use key and onAction
  const bulkActions: BulkAction<DocumentRow>[] = useMemo(
    () => [
      {
        key: 'delete',
        label: 'Delete',
        icon: 'lucide--trash-2',
        onAction: handleBulkDelete,
        variant: 'error',
      },
    ],
    []
  );

  return (
    <PageContainer
      maxWidth="full"
      className="px-4"
      testId="page-source-type-documents"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl inline-flex items-center gap-2">
          <Icon icon={icon} className="size-6" />
          {displayName}
          {!loading && (
            <span className="badge badge-ghost badge-lg font-normal">
              {totalCount}
            </span>
          )}
        </h1>
        <p className="mt-1 text-base-content/70">
          {plugin?.description ||
            `View and manage ${displayName.toLowerCase()}`}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error mb-4">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost" onClick={refreshDocuments}>
            Retry
          </button>
        </div>
      )}

      {/* Documents Table */}
      <DataTable<DocumentRow>
        data={data || []}
        columns={columns}
        loading={loading}
        enableSelection={true}
        enableSearch={true}
        getSearchText={(doc) => `${doc.filename || ''} ${doc.name || ''}`}
        rowActions={rowActions}
        bulkActions={bulkActions}
        emptyMessage={`No ${displayName.toLowerCase()}`}
        emptyIcon={icon}
      />

      {/* Deletion Confirmation Modal */}
      <DeletionConfirmationModal
        open={isDeletionModalOpen}
        onCancel={() => {
          setIsDeletionModalOpen(false);
          setDocumentsToDelete([]);
        }}
        onConfirm={handleConfirmDeletion}
        fetchImpact={fetchDeletionImpact}
        documentIds={documentsToDelete.map((d) => d.id)}
        documentNames={documentsToDelete.map(
          (d) => d.filename || d.name || 'Document'
        )}
      />

      {/* Metadata Modal */}
      {selectedDocumentForMetadata && (
        <DocumentMetadataModal
          isOpen={isMetadataModalOpen}
          onClose={() => {
            setIsMetadataModalOpen(false);
            setSelectedDocumentForMetadata(null);
          }}
          metadata={selectedDocumentForMetadata.integrationMetadata}
          documentName={
            selectedDocumentForMetadata.filename ||
            selectedDocumentForMetadata.name ||
            'Document'
          }
        />
      )}
    </PageContainer>
  );
}
