import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { useSourceTypes } from '@/hooks/use-source-types';
import {
  getSourceTypePlugin,
  getSourceTypeDisplayName,
  getSourceTypeIcon,
  getAllSourceTypePlugins,
} from '@/lib/source-type-plugins';
import { Spinner } from '@/components/atoms/Spinner';
import { Tooltip } from '@/components/atoms/Tooltip';
import { PageContainer } from '@/components/layouts';
import { useAuth } from '@/contexts/useAuth';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';
import { useDataUpdates } from '@/contexts/data-updates';
import {
  useDocumentParsing,
  type DocumentParsingJob,
} from '@/hooks/use-document-parsing';

// Response type for document-first upload endpoint
type DocumentUploadResponse = {
  document: {
    id: string;
    name: string;
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    conversionStatus: string;
    conversionError?: string | null;
    storageKey?: string | null;
    createdAt: string;
  };
  isDuplicate: boolean;
  existingDocumentId?: string;
  parsingJob?: DocumentParsingJob;
};
import {
  ExtractionConfigModal,
  type ExtractionConfig,
} from '@/components/organisms/ExtractionConfigModal';
import { DocumentMetadataModal } from '@/components/organisms/DocumentMetadataModal';
import { DeletionConfirmationModal } from '@/components/organisms/DeletionConfirmationModal';
import {
  DocumentDetailModal,
  type DocumentRow as DetailDocumentRow,
} from '@/components/organisms/DocumentDetailModal';
import { createExtractionJobsClient } from '@/api/extraction-jobs';
import { createDocumentsClient } from '@/api/documents';
import {
  createUserActivityClient,
  createRecordActivityFn,
} from '@/api/user-activity';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
  type TableDataItem,
} from '@/components/organisms/DataTable';

type DocumentRow = {
  id: string;
  // Original (legacy snake_case) fields
  source_url?: string | null;
  filename?: string | null;
  mime_type?: string | null;
  created_at?: string;
  updated_at?: string;
  content?: string | null;
  content_length?: number | null;
  // New camelCase fields from Nest server
  name?: string | null;
  sourceUrl?: string | null;
  mimeType?: string | null;
  contentLength?: number | null;
  createdAt?: string;
  updatedAt?: string;
  chunks: number;
  // New embedding status fields
  totalChars?: number;
  embeddedChunks?: number;
  // Extraction status fields
  extractionStatus?: string;
  extractionCompletedAt?: string;
  extractionObjectsCount?: number;
  // Integration metadata (from external sources like Gmail, ClickUp)
  integrationMetadata?: Record<string, any> | null;
  // Document metadata (processing info, original file details)
  metadata?: Record<string, any> | null;
  // Conversion status fields (document-first architecture)
  conversionStatus?:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'not_required'
    | null;
  conversionError?: string | null;
  conversionCompletedAt?: string | null;
  // Source type for document origin (upload, email, url, etc.)
  sourceType?: string | null;
  // Parent document ID (for child documents like email attachments)
  parentDocumentId?: string | null;
  // Child document count
  childCount?: number | null;
  // Storage and system fields
  projectId?: string | null;
  externalSourceId?: string | null;
  dataSourceIntegrationId?: string | null;
  storageKey?: string | null;
  storageUrl?: string | null;
  fileHash?: string | null;
  contentHash?: string | null;
  syncVersion?: number | null;
  fileSizeBytes?: number | null;
};

function normalize(doc: DocumentRow) {
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

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken, user } = useAuth();
  const { buildHeaders, apiBase, fetchJson, fetchForm } = useApi();
  const { config } = useConfig();
  const { showToast } = useToast();

  // Source type filtering from URL
  const selectedSourceType = searchParams.get('sourceType') || null;
  const {
    sourceTypes,
    allPlugins,
    totalCount: sourceTypeTotalCount,
    refetch: refetchSourceTypes,
    loading: sourceTypesLoading,
  } = useSourceTypes();

  // Clear filter if selected source type no longer has any documents
  useEffect(() => {
    // Wait for source types to load before checking
    if (sourceTypesLoading || !selectedSourceType) return;

    // Check if the selected source type exists in the available source types
    const sourceTypeExists = sourceTypes.some(
      (st) => st.sourceType === selectedSourceType
    );

    // If selected source type has no documents, clear the filter
    if (!sourceTypeExists) {
      setSearchParams({});
    }
  }, [selectedSourceType, sourceTypes, sourceTypesLoading, setSearchParams]);

  const [data, setData] = useState<DocumentRow[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: 'uploading' | 'parsing' | 'processing' | 'complete' | 'failed';
    fileName: string;
    fileSize: number;
    estimatedSeconds: number;
    jobId?: string;
    jobStatus?: string;
    errorMessage?: string;
  } | null>(null);
  // Batch upload state
  const [batchUploadProgress, setBatchUploadProgress] = useState<{
    files: Array<{
      name: string;
      size: number;
      status:
        | 'pending'
        | 'uploading'
        | 'parsing'
        | 'success'
        | 'duplicate'
        | 'failed';
      error?: string;
      documentId?: string;
      jobId?: string;
      chunks?: number;
    }>;
    current: number;
    total: number;
    isProcessing: boolean;
  } | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Extraction modal state
  const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
  const [selectedDocumentForExtraction, setSelectedDocumentForExtraction] =
    useState<DocumentRow | null>(null);
  const [
    selectedDocumentsForBatchExtraction,
    setSelectedDocumentsForBatchExtraction,
  ] = useState<DocumentRow[]>([]);
  const [isStartingExtraction, setIsStartingExtraction] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Metadata modal state
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [selectedDocumentForMetadata, setSelectedDocumentForMetadata] =
    useState<DocumentRow | null>(null);

  // Document detail modal state
  const [selectedDocumentForDetail, setSelectedDocumentForDetail] =
    useState<DocumentRow | null>(null);

  const extractionClient = createExtractionJobsClient(
    apiBase,
    fetchJson,
    config.activeProjectId
  );

  const documentsClient = createDocumentsClient(
    apiBase,
    fetchJson,
    config.activeProjectId
  );

  // Activity tracking client for Recent Items feature
  const activityClient = createUserActivityClient(apiBase, fetchJson);
  const recordActivity = createRecordActivityFn(activityClient);

  // Document parsing hook for Kreuzberg integration
  const {
    uploadDocument: uploadDocumentParsing,
    getJobStatus,
    pollJobUntilComplete,
  } = useDocumentParsing();

  // Deletion modal state
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const [documentsToDelete, setDocumentsToDelete] = useState<DocumentRow[]>([]);
  const [deletionDocumentIds, setDeletionDocumentIds] = useState<string[]>([]);

  const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

  // Helper to build documents API URL with optional sourceType filter
  const buildDocumentsUrl = useCallback(
    (bustCache = false) => {
      const urlParams = new URLSearchParams();
      if (bustCache) {
        urlParams.set('_t', Date.now().toString());
      }
      if (selectedSourceType) {
        urlParams.set('sourceType', selectedSourceType);
      }
      return `${apiBase}/api/documents?${urlParams.toString()}`;
    },
    [apiBase, selectedSourceType]
  );

  // Load documents only when an active org & project are selected (prevents 403 on first-login with no org).
  useEffect(() => {
    let cancelled = false;

    // DEBUG: Log when useEffect runs and what projectId we have
    console.log(
      '[Documents] useEffect triggered, activeProjectId:',
      config.activeProjectId,
      'activeOrgId:',
      config.activeOrgId
    );

    // IMPORTANT: Clear documents immediately when project changes to prevent
    // showing stale data from another project while loading
    setData([]);
    setTotalCount(0);

    // Require both org & project (project scoping) to fetch; gate handles creation/select flows.
    if (!config.activeOrgId || !config.activeProjectId) {
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
        // Include projectId in URL to bust browser cache when project changes
        // (X-Project-ID header alone doesn't affect HTTP cache key)
        // Build URL with optional sourceType filter
        const urlParams = new URLSearchParams();
        urlParams.set('projectId', config.activeProjectId!);
        if (selectedSourceType) {
          urlParams.set('sourceType', selectedSourceType);
        }
        const json = await fetchJson<
          | DocumentRow[]
          | { documents: DocumentRow[]; total?: number }
          | { documents: DocumentRow[] }
        >(`${apiBase}/api/documents?${urlParams.toString()}`, {
          headers: t ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
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
    apiBaseMemo,
    getAccessToken,
    buildHeaders,
    fetchJson,
    config.activeOrgId,
    config.activeProjectId,
    selectedSourceType,
  ]);

  // Refresh documents function for real-time updates (silent refresh without loading state)
  const refreshDocuments = useCallback(async () => {
    if (!config.activeOrgId || !config.activeProjectId) return;

    try {
      const t = getAccessToken();
      const json = await fetchJson<
        | DocumentRow[]
        | { documents: DocumentRow[]; total?: number }
        | { documents: DocumentRow[] }
      >(buildDocumentsUrl(true), {
        headers: t ? { ...buildHeaders({ json: false }) } : {},
        json: false,
      });
      const docsList = Array.isArray(json) ? json : json.documents;
      const total =
        !Array.isArray(json) && 'total' in json ? json.total : docsList.length;

      const docs = docsList.map(normalize);
      setData(docs);
      setTotalCount(total || docs.length);
    } catch (e: unknown) {
      console.error('[Documents] Failed to refresh:', e);
    }
  }, [
    buildDocumentsUrl,
    getAccessToken,
    buildHeaders,
    fetchJson,
    config.activeOrgId,
    config.activeProjectId,
  ]);

  // Subscribe to real-time document updates
  useDataUpdates(
    'document:*',
    (event) => {
      console.debug('[Documents] Real-time event:', event.type, event.id);
      // Refresh on any document change (created, updated, deleted)
      void refreshDocuments();
    },
    [refreshDocuments]
  );

  // Subscribe to extraction job events to update extraction status column
  useDataUpdates(
    'extraction_job:*',
    (event) => {
      console.debug(
        '[Documents] Extraction job event:',
        event.type,
        event.id,
        event.data
      );
      // Refresh documents to show updated extraction status
      void refreshDocuments();
    },
    [refreshDocuments]
  );

  const acceptedMimeTypes = useMemo(
    () => [
      // Documents (Kreuzberg extraction)
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.oasis.opendocument.text', // .odt

      // Spreadsheets (Kreuzberg extraction)
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12', // .xlsb
      'application/vnd.oasis.opendocument.spreadsheet', // .ods

      // Presentations (Kreuzberg extraction)
      'application/vnd.ms-powerpoint', // .ppt
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

      // Images (Kreuzberg OCR)
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/webp',
      'image/jp2',
      'image/jpx',
      'image/x-portable-anymap',
      'image/x-portable-bitmap',
      'image/x-portable-graymap',
      'image/x-portable-pixmap',
      'image/svg+xml',

      // Email (Kreuzberg extraction)
      'message/rfc822', // .eml
      'application/vnd.ms-outlook', // .msg

      // Web & Markup (Kreuzberg conversion)
      'text/html',
      'application/rtf',

      // Archives (Kreuzberg extraction)
      'application/zip',
      'application/x-tar',
      'application/gzip',
      'application/x-gzip',
      'application/x-7z-compressed',

      // Plain text (direct read)
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/tab-separated-values',
      'text/xml',
      'application/json',
      'application/xml',
      'application/x-yaml',
      'text/yaml',
      'application/toml',
    ],
    []
  );

  const acceptedExtensions = useMemo(
    () => [
      // Documents
      '.pdf',
      '.doc',
      '.docx',
      '.odt',
      // Spreadsheets
      '.xls',
      '.xlsx',
      '.xlsm',
      '.xlsb',
      '.ods',
      // Presentations
      '.ppt',
      '.pptx',
      // Images
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.bmp',
      '.tiff',
      '.tif',
      '.webp',
      '.jp2',
      '.jpx',
      '.jpm',
      '.mj2',
      '.pnm',
      '.pbm',
      '.pgm',
      '.ppm',
      '.svg',
      // Email
      '.eml',
      '.msg',
      // Web & Markup
      '.html',
      '.htm',
      '.rtf',
      // Archives
      '.zip',
      '.tar',
      '.tgz',
      '.gz',
      '.7z',
      // Plain text
      '.txt',
      '.md',
      '.markdown',
      '.csv',
      '.tsv',
      '.json',
      '.xml',
      '.yaml',
      '.yml',
      '.toml',
    ],
    []
  );

  // Handle extract objects button click
  const handleExtractObjects = (document: DocumentRow) => {
    setSelectedDocumentForExtraction(document);
    setIsExtractionModalOpen(true);
  };

  // Handle view metadata button click
  const handleViewMetadata = (document: DocumentRow) => {
    setSelectedDocumentForMetadata(document);
    setIsMetadataModalOpen(true);
  };

  // Memoized callback to close extraction modal
  const handleExtractionModalClose = useCallback(() => {
    setIsExtractionModalOpen(false);
    setSelectedDocumentForExtraction(null);
    setSelectedDocumentsForBatchExtraction([]);
  }, []);

  // Handle extraction confirmation
  const handleExtractionConfirm = async (
    extractionConfig: ExtractionConfig
  ) => {
    if (
      !selectedDocumentForExtraction ||
      !config.activeProjectId ||
      !config.activeOrgId
    )
      return;

    setIsStartingExtraction(true);
    try {
      // Only include subject_id if user.sub is a valid UUID
      const isValidUuid =
        user?.sub &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          user.sub
        );

      const job = await extractionClient.createJob({
        source_type: 'document',
        source_id: selectedDocumentForExtraction.id,
        source_metadata: {
          filename: selectedDocumentForExtraction.filename || 'unknown',
          mime_type:
            selectedDocumentForExtraction.mime_type ||
            'application/octet-stream',
        },
        extraction_config: extractionConfig,
        ...(isValidUuid && { subject_id: user.sub }), // Canonical internal user ID (UUID)
      });

      // Close modal and show success toast
      setIsExtractionModalOpen(false);
      setSelectedDocumentForExtraction(null);

      // Show success message
      showToast({
        message: `Extraction started for "${
          selectedDocumentForExtraction.filename || 'document'
        }"`,
        variant: 'success',
        duration: 4000,
      });

      // Refresh documents to show updated extraction status
      void refreshDocuments();
    } catch (err) {
      console.error('Failed to create extraction job:', err);
      showToast({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to create extraction job',
        variant: 'error',
      });
    } finally {
      setIsStartingExtraction(false);
    }
  };

  // Handle delete single document
  const handleDeleteDocument = (document: DocumentRow) => {
    if (!document || !document.id) {
      showToast({
        message: 'Invalid document selected for deletion',
        variant: 'error',
      });
      return;
    }
    setDocumentsToDelete([document]);
    setTimeout(() => setIsDeletionModalOpen(true), 0);
  };

  // Handle bulk delete
  const handleBulkDelete = async (
    selectedIds: string[],
    selectedItems: DocumentRow[]
  ) => {
    if (!selectedItems.length) return;
    setDocumentsToDelete(selectedItems);
    setTimeout(() => setIsDeletionModalOpen(true), 0);
  };

  // Handle bulk extraction
  const handleBulkExtract = async (
    selectedIds: string[],
    selectedItems: DocumentRow[]
  ) => {
    if (!selectedItems.length) return;
    setSelectedDocumentsForBatchExtraction(selectedItems);
    setSelectedDocumentForExtraction(null);
    setTimeout(() => setIsExtractionModalOpen(true), 0);
  };

  // Handle bulk recreate chunks
  const handleBulkRecreateChunks = async (
    selectedIds: string[],
    selectedItems: DocumentRow[]
  ) => {
    if (!selectedItems.length) return;

    const totalDocs = selectedItems.length;
    let successCount = 0;
    let failCount = 0;
    const failedDocs: string[] = [];

    showToast({
      message: `Recreating chunks for ${totalDocs} document${
        totalDocs !== 1 ? 's' : ''
      }...`,
      variant: 'info',
      duration: 3000,
    });

    for (const doc of selectedItems) {
      try {
        await documentsClient.recreateChunks(doc.id);
        successCount++;
      } catch (err) {
        console.error(`Failed to recreate chunks for ${doc.filename}:`, err);
        failCount++;
        failedDocs.push(doc.filename || doc.id);
      }
    }

    // Show summary
    if (failCount === 0) {
      showToast({
        message: `Queued embedding jobs for ${successCount} document${
          successCount !== 1 ? 's' : ''
        }. Embeddings will be generated in the background.`,
        variant: 'success',
        duration: 5000,
      });
    } else if (successCount === 0) {
      showToast({
        message: `Failed to recreate chunks for all ${failCount} document${
          failCount !== 1 ? 's' : ''
        }`,
        variant: 'error',
        duration: 8000,
      });
    } else {
      showToast({
        message: `Queued embeddings for ${successCount} document${
          successCount !== 1 ? 's' : ''
        }, but ${failCount} failed. Failed: ${failedDocs
          .slice(0, 3)
          .join(', ')}${failedDocs.length > 3 ? '...' : ''}`,
        variant: 'warning',
        duration: 10000,
      });
    }

    // Refresh the documents list to show updated chunk counts
    try {
      const t = getAccessToken();
      const json = await fetchJson<
        DocumentRow[] | { documents: DocumentRow[]; total?: number }
      >(`${apiBase}/api/documents`, {
        headers: t ? { ...buildHeaders({ json: false }) } : {},
        json: false,
      });
      const docsList = Array.isArray(json) ? json : json.documents;
      const total =
        !Array.isArray(json) && 'total' in json ? json.total : docsList.length;
      const docs = docsList.map(normalize);
      setData(docs);
      setTotalCount(total || docs.length);
    } catch (err) {
      console.error('Failed to refresh documents:', err);
    }
  };

  // Handle batch extraction confirmation
  const handleBatchExtractionConfirm = async (
    extractionConfig: ExtractionConfig
  ) => {
    if (
      selectedDocumentsForBatchExtraction.length === 0 ||
      !config.activeProjectId ||
      !config.activeOrgId
    )
      return;

    setIsStartingExtraction(true);
    const totalDocs = selectedDocumentsForBatchExtraction.length;
    let successCount = 0;
    let failCount = 0;
    const failedDocs: string[] = [];

    try {
      // Only include subject_id if user.sub is a valid UUID
      const isValidUuid =
        user?.sub &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          user.sub
        );

      // Create extraction jobs for each document
      showToast({
        message: `Creating extraction jobs for ${totalDocs} document${
          totalDocs !== 1 ? 's' : ''
        }...`,
        variant: 'info',
        duration: 3000,
      });

      for (const doc of selectedDocumentsForBatchExtraction) {
        try {
          await extractionClient.createJob({
            source_type: 'document',
            source_id: doc.id,
            source_metadata: {
              filename: doc.filename || 'unknown',
              mime_type: doc.mime_type || 'application/octet-stream',
            },
            extraction_config: extractionConfig,
            ...(isValidUuid && { subject_id: user.sub }),
          });
          successCount++;
        } catch (err) {
          console.error(
            `Failed to create extraction job for ${doc.filename}:`,
            err
          );
          failCount++;
          failedDocs.push(doc.filename || doc.id);
        }
      }

      // Close modal
      setIsExtractionModalOpen(false);
      setSelectedDocumentsForBatchExtraction([]);

      // Show summary
      if (failCount === 0) {
        showToast({
          message: `Extraction started for ${successCount} document${
            successCount !== 1 ? 's' : ''
          }`,
          variant: 'success',
          duration: 5000,
        });
      } else if (successCount === 0) {
        showToast({
          message: `Failed to create extraction jobs for all ${failCount} document${
            failCount !== 1 ? 's' : ''
          }`,
          variant: 'error',
          duration: 8000,
        });
      } else {
        showToast({
          message: `Extraction started for ${successCount} document${
            successCount !== 1 ? 's' : ''
          }, but ${failCount} failed. Failed: ${failedDocs.join(', ')}`,
          variant: 'warning',
          duration: 10000,
        });
      }

      // Refresh documents to show updated extraction status
      if (successCount > 0) {
        void refreshDocuments();
      }
    } catch (err) {
      console.error('Batch extraction failed:', err);
      showToast({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to create batch extraction jobs',
        variant: 'error',
      });
    } finally {
      setIsStartingExtraction(false);
    }
  };

  // Fetch deletion impact for modal
  const fetchDeletionImpact = async (ids: string | string[]) => {
    if (Array.isArray(ids)) {
      return await documentsClient.getBulkDeletionImpact(ids);
    } else {
      return await documentsClient.getDeletionImpact(ids);
    }
  };

  // Handle recreate chunks action
  const handleRecreateChunks = async (doc: DocumentRow) => {
    try {
      const result = await documentsClient.recreateChunks(doc.id);
      showToast({
        message: `Chunks recreated: ${result.summary.oldChunks} → ${result.summary.newChunks}. Embeddings generating...`,
        variant: 'success',
        duration: 5000,
      });

      // Refresh the documents list to show updated chunk counts
      const t = getAccessToken();
      const json = await fetchJson<
        DocumentRow[] | { documents: DocumentRow[]; total?: number }
      >(`${apiBase}/api/documents`, {
        headers: t ? { ...buildHeaders({ json: false }) } : {},
        json: false,
      });
      const docsList = Array.isArray(json) ? json : json.documents;
      const total =
        !Array.isArray(json) && 'total' in json ? json.total : docsList.length;
      const docs = docsList.map(normalize);
      setData(docs);
      setTotalCount(total || docs.length);
    } catch (err) {
      console.error('Failed to recreate chunks:', err);
      showToast({
        message:
          err instanceof Error ? err.message : 'Failed to recreate chunks',
        variant: 'error',
      });
    }
  };

  // Handle retry conversion for failed documents
  const handleRetryConversion = async (doc: DocumentRow) => {
    if (doc.conversionStatus !== 'failed') {
      showToast({
        message: 'Only failed documents can be retried',
        variant: 'warning',
      });
      return;
    }

    try {
      showToast({
        message: `Retrying conversion for "${doc.filename}"...`,
        variant: 'info',
        duration: 3000,
      });

      // Call retry endpoint
      await fetchJson<{ success: boolean; jobId: string }>(
        `${apiBase}/api/documents/${doc.id}/retry-conversion`,
        {
          method: 'POST',
        }
      );

      showToast({
        message:
          'Conversion retry started. Document will be updated when complete.',
        variant: 'success',
        duration: 5000,
      });

      // Refresh documents list
      await refreshDocuments();
    } catch (err) {
      console.error('Failed to retry conversion:', err);
      showToast({
        message:
          err instanceof Error ? err.message : 'Failed to retry conversion',
        variant: 'error',
      });
    }
  };

  // Confirm deletion from modal
  const handleConfirmDeletion = async () => {
    try {
      const documentIds = documentsToDelete.map((d) => d.id);

      if (documentIds.length === 1) {
        // Single deletion
        await documentsClient.deleteDocument(documentIds[0]);
        showToast({
          message: 'Document deleted successfully',
          variant: 'success',
        });
      } else {
        // Bulk deletion
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

      // Refresh document list
      const t = getAccessToken();
      const json = await fetchJson<
        DocumentRow[] | { documents: DocumentRow[] }
      >(`${apiBase}/api/documents`, {
        headers: t ? { ...buildHeaders({ json: false }) } : {},
        json: false,
      });
      const docs = (Array.isArray(json) ? json : json.documents).map(normalize);
      setData(docs);

      // Close modal
      setIsDeletionModalOpen(false);
      setDocumentsToDelete([]);
    } catch (err) {
      console.error('Failed to delete documents:', err);
      showToast({
        message:
          err instanceof Error ? err.message : 'Failed to delete documents',
        variant: 'error',
      });
      throw err; // Re-throw to let modal handle loading state
    }
  };

  function isAccepted(file: File): boolean {
    const byMime = file.type ? acceptedMimeTypes.includes(file.type) : true; // Some browsers may not set type reliably (e.g., .md)
    const name = file.name.toLowerCase();
    const byExt = acceptedExtensions.some((ext) => name.endsWith(ext));
    return byMime || byExt;
  }

  // Legacy Office formats (.doc, .xls, .ppt) require LibreOffice on the server
  // These may fail if LibreOffice is not installed in the Kreuzberg Docker image
  const LEGACY_OFFICE_EXTENSIONS = ['.doc', '.xls', '.ppt'];
  const LEGACY_OFFICE_MIMES = [
    'application/msword', // .doc
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-powerpoint', // .ppt
  ];

  function isLegacyOfficeFormat(file: File): boolean {
    const name = file.name.toLowerCase();
    const extMatch = LEGACY_OFFICE_EXTENSIONS.some(
      (ext) => name.endsWith(ext) && !name.endsWith(`${ext}x`) // .doc but not .docx
    );
    const mimeMatch = LEGACY_OFFICE_MIMES.includes(file.type);
    return extMatch || mimeMatch;
  }

  function getLegacyFormatSuggestion(filename: string): string {
    const name = filename.toLowerCase();
    if (name.endsWith('.doc')) return '.docx';
    if (name.endsWith('.xls')) return '.xlsx';
    if (name.endsWith('.ppt')) return '.pptx';
    return 'a modern Office format';
  }

  // Estimate processing time based on file size
  function estimateProcessingTime(fileSize: number): number {
    // Rough estimates based on typical processing:
    // - Small files (<100KB): 1-2 seconds
    // - Medium files (100KB-1MB): 2-5 seconds
    // - Large files (1MB-10MB): 5-15 seconds
    const sizeInKB = fileSize / 1024;
    if (sizeInKB < 100) return 2;
    if (sizeInKB < 1024) return 5;
    return Math.min(15, Math.ceil(sizeInKB / 1024) * 3);
  }

  async function handleUpload(file: File): Promise<void> {
    if (!isAccepted(file)) {
      showToast({
        message:
          'Unsupported file type. Allowed: pdf, docx, pptx, xlsx, md, html, txt.',
        variant: 'error',
      });
      return;
    }
    // Kreuzberg supports up to 100MB files
    const max = 100 * 1024 * 1024; // 100MB
    if (file.size > max) {
      showToast({
        message: 'File is larger than 100MB limit.',
        variant: 'error',
      });
      return;
    }

    // Warn about legacy Office formats that require LibreOffice
    if (isLegacyOfficeFormat(file)) {
      const suggestion = getLegacyFormatSuggestion(file.name);
      showToast({
        message: `"${file.name}" is a legacy Office format (.doc/.xls/.ppt) that requires LibreOffice on the server. If conversion fails, try converting to ${suggestion} first.`,
        variant: 'warning',
        duration: 8000,
      });
    }

    setUploading(true);
    const estimatedSeconds = estimateProcessingTime(file.size);

    // Show uploading stage
    setUploadProgress({
      stage: 'uploading',
      fileName: file.name,
      fileSize: file.size,
      estimatedSeconds,
    });

    try {
      // Create FormData for upload
      const fd = new FormData();
      fd.append('file', file);
      fd.append('autoExtract', 'false');

      // Upload to document-parsing-jobs endpoint (document-first architecture)
      const response = await fetchForm<DocumentUploadResponse>(
        `${apiBase}/api/document-parsing-jobs/upload`,
        fd
      );

      // Handle duplicate files
      if (response.isDuplicate) {
        setUploadProgress({
          stage: 'complete',
          fileName: file.name,
          fileSize: file.size,
          estimatedSeconds,
        });
        showToast({
          message: `File already exists: ${response.document.name}`,
          variant: 'info',
          duration: 4000,
        });
        // Reload documents to show the existing one
        const t2 = getAccessToken();
        const json = await fetchJson<
          DocumentRow[] | { documents: DocumentRow[] }
        >(buildDocumentsUrl(true), {
          headers: t2 ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
        const docs = (Array.isArray(json) ? json : json.documents).map(
          normalize
        );
        setData(docs);
        return;
      }

      // If no parsing job needed (plain text files), document is ready immediately
      if (!response.parsingJob) {
        setUploadProgress({
          stage: 'complete',
          fileName: file.name,
          fileSize: file.size,
          estimatedSeconds,
        });
        // Reload documents
        const t2 = getAccessToken();
        const json = await fetchJson<
          DocumentRow[] | { documents: DocumentRow[] }
        >(buildDocumentsUrl(true), {
          headers: t2 ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
        const docs = (Array.isArray(json) ? json : json.documents).map(
          normalize
        );
        setData(docs);
        showToast({
          message: `Document uploaded successfully!`,
          variant: 'success',
          duration: 4000,
        });
        return;
      }

      // Update to parsing stage with job ID
      const job = response.parsingJob;
      setUploadProgress({
        stage: 'parsing',
        fileName: file.name,
        fileSize: file.size,
        estimatedSeconds,
        jobId: job.id,
        jobStatus: job.status,
      });

      // Poll until job completes
      const completedJob = await pollJobUntilComplete(job.id, (j) => {
        setUploadProgress((prev) => {
          if (!prev) return null;

          // If job is in retry_pending state, show error message and retry info
          if (j.status === 'retry_pending' && j.errorMessage) {
            const retryCount = j.retryCount ?? 0;
            const maxRetries = 3; // Default from backend
            return {
              ...prev,
              stage: 'parsing',
              jobStatus: j.status,
              errorMessage: `${j.errorMessage} (retry ${retryCount}/${maxRetries})`,
            };
          }

          return {
            ...prev,
            stage: 'parsing',
            jobStatus: j.status,
            errorMessage: undefined, // Clear error if not in retry state
          };
        });
      });

      if (completedJob.status === 'failed') {
        setUploadProgress({
          stage: 'failed',
          fileName: file.name,
          fileSize: file.size,
          estimatedSeconds,
          jobId: completedJob.id,
          jobStatus: completedJob.status,
          errorMessage: completedJob.errorMessage || 'Parsing failed',
        });
        showToast({
          message: completedJob.errorMessage || 'Document parsing failed',
          variant: 'error',
        });
        return;
      }

      // Mark as complete
      setUploadProgress({
        stage: 'complete',
        fileName: file.name,
        fileSize: file.size,
        estimatedSeconds,
        jobId: completedJob.id,
        jobStatus: completedJob.status,
      });

      // Reload documents WITHOUT hiding the table
      try {
        const t2 = getAccessToken();
        const json = await fetchJson<
          DocumentRow[] | { documents: DocumentRow[] }
        >(buildDocumentsUrl(true), {
          headers: t2 ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
        const docs = (Array.isArray(json) ? json : json.documents).map(
          normalize
        );
        setData(docs);

        showToast({
          message: `Document parsed and processed successfully!`,
          variant: 'success',
          duration: 4000,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to refresh list';
        setError(msg);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: 'failed',
              errorMessage: msg,
            }
          : null
      );
      showToast({ message: msg, variant: 'error' });
    } finally {
      setUploading(false);
      // Clear progress banner after showing completion state
      setTimeout(() => setUploadProgress(null), 5000);
    }
  }

  /**
   * Handle batch upload of multiple files.
   * Uses the document-parsing-jobs endpoint with Kreuzberg for efficient processing.
   */
  async function handleBatchUpload(files: File[]): Promise<void> {
    // Filter and validate files
    const validFiles: File[] = [];
    const invalidFiles: { name: string; reason: string }[] = [];
    const max = 100 * 1024 * 1024; // 100MB (Kreuzberg supports larger files)

    for (const file of files) {
      if (!isAccepted(file)) {
        invalidFiles.push({
          name: file.name,
          reason: 'Unsupported file type',
        });
      } else if (file.size > max) {
        invalidFiles.push({
          name: file.name,
          reason: 'File exceeds 100MB limit',
        });
      } else {
        validFiles.push(file);
      }
    }

    // Enforce batch limit
    if (validFiles.length > 100) {
      showToast({
        message: `Maximum 100 files per batch. ${validFiles.length} files selected.`,
        variant: 'error',
      });
      return;
    }

    if (validFiles.length === 0) {
      if (invalidFiles.length > 0) {
        showToast({
          message: `No valid files to upload. ${invalidFiles.length} file(s) rejected.`,
          variant: 'error',
        });
      }
      return;
    }

    // Show warning for rejected files
    if (invalidFiles.length > 0) {
      showToast({
        message: `${invalidFiles.length} file(s) rejected: ${invalidFiles
          .slice(0, 3)
          .map((f) => f.name)
          .join(', ')}${invalidFiles.length > 3 ? '...' : ''}`,
        variant: 'warning',
        duration: 5000,
      });
    }

    // Warn about legacy Office formats that require LibreOffice
    const legacyFiles = validFiles.filter(isLegacyOfficeFormat);
    if (legacyFiles.length > 0) {
      const fileNames = legacyFiles
        .slice(0, 3)
        .map((f) => f.name)
        .join(', ');
      const suffix = legacyFiles.length > 3 ? '...' : '';
      showToast({
        message: `${legacyFiles.length} legacy Office file(s) (${fileNames}${suffix}) require LibreOffice on the server. If conversion fails, try converting to .docx/.xlsx/.pptx first.`,
        variant: 'warning',
        duration: 8000,
      });
    }

    // Initialize batch upload progress
    setBatchUploadProgress({
      files: validFiles.map((f) => ({
        name: f.name,
        size: f.size,
        status: 'pending',
      })),
      current: 0,
      total: validFiles.length,
      isProcessing: true,
    });
    setUploading(true);

    let successCount = 0;
    let failCount = 0;

    // Process files sequentially to avoid overwhelming the server
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      // Update status to uploading for current file
      setBatchUploadProgress((prev) => {
        if (!prev) return null;
        const newFiles = [...prev.files];
        newFiles[i] = { ...newFiles[i], status: 'uploading' };
        return { ...prev, files: newFiles };
      });

      try {
        // Create FormData for this file
        const fd = new FormData();
        fd.append('file', file);
        fd.append('autoExtract', 'false');

        // Upload to document-parsing-jobs endpoint (document-first architecture)
        const response = await fetchForm<DocumentUploadResponse>(
          `${apiBase}/api/document-parsing-jobs/upload`,
          fd
        );

        // Handle duplicate files
        if (response.isDuplicate) {
          setBatchUploadProgress((prev) => {
            if (!prev) return null;
            const newFiles = [...prev.files];
            newFiles[i] = {
              ...newFiles[i],
              status: 'duplicate',
              documentId: response.existingDocumentId,
            };
            return {
              ...prev,
              files: newFiles,
              current: prev.current + 1,
            };
          });
          successCount++; // Duplicates count as success (document exists)
          continue;
        }

        // If no parsing job needed (plain text files), document is ready immediately
        if (!response.parsingJob) {
          setBatchUploadProgress((prev) => {
            if (!prev) return null;
            const newFiles = [...prev.files];
            newFiles[i] = {
              ...newFiles[i],
              status: 'success',
              documentId: response.document.id,
            };
            return {
              ...prev,
              files: newFiles,
              current: prev.current + 1,
            };
          });
          successCount++;
          continue;
        }

        const job = response.parsingJob;

        // Update status to parsing with job ID
        setBatchUploadProgress((prev) => {
          if (!prev) return null;
          const newFiles = [...prev.files];
          newFiles[i] = {
            ...newFiles[i],
            status: 'parsing',
            jobId: job.id,
          };
          return { ...prev, files: newFiles };
        });

        // Poll until job completes
        const completedJob = await pollJobUntilComplete(job.id, (j) => {
          setBatchUploadProgress((prev) => {
            if (!prev) return null;
            const newFiles = [...prev.files];

            // Show retry status if in retry_pending
            let errorMsg: string | undefined;
            if (j.status === 'retry_pending' && j.errorMessage) {
              const retryCount = j.retryCount ?? 0;
              const maxRetries = 3;
              errorMsg = `${j.errorMessage} (retry ${retryCount}/${maxRetries})`;
            }

            newFiles[i] = {
              ...newFiles[i],
              jobId: j.id,
              error: errorMsg,
            };
            return { ...prev, files: newFiles };
          });
        });

        // Update with final status
        const isSuccess = completedJob.status === 'completed';
        setBatchUploadProgress((prev) => {
          if (!prev) return null;
          const newFiles = [...prev.files];
          newFiles[i] = {
            ...newFiles[i],
            status: isSuccess ? 'success' : 'failed',
            documentId: completedJob.documentId || response.document.id,
            error: isSuccess
              ? undefined
              : completedJob.errorMessage || 'Parsing failed',
          };
          return {
            ...prev,
            files: newFiles,
            current: prev.current + 1,
          };
        });

        if (isSuccess) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Upload failed';
        setBatchUploadProgress((prev) => {
          if (!prev) return null;
          const newFiles = [...prev.files];
          newFiles[i] = {
            ...newFiles[i],
            status: 'failed',
            error: errorMsg,
          };
          return {
            ...prev,
            files: newFiles,
            current: prev.current + 1,
          };
        });
        failCount++;
      }
    }

    // Mark batch as complete
    setBatchUploadProgress((prev) =>
      prev ? { ...prev, isProcessing: false } : null
    );
    setUploading(false);

    // Show summary toast
    if (failCount === 0) {
      showToast({
        message: `Successfully uploaded ${successCount} document${
          successCount !== 1 ? 's' : ''
        }!`,
        variant: 'success',
        duration: 4000,
      });
    } else if (successCount === 0) {
      showToast({
        message: `All ${failCount} uploads failed.`,
        variant: 'error',
        duration: 6000,
      });
    } else {
      showToast({
        message: `Batch complete: ${successCount} successful, ${failCount} failed`,
        variant: 'warning',
        duration: 6000,
      });
    }

    // Reload documents WITHOUT hiding the table
    try {
      const t2 = getAccessToken();
      const json = await fetchJson<
        DocumentRow[] | { documents: DocumentRow[]; total?: number }
      >(buildDocumentsUrl(true), {
        headers: t2 ? { ...buildHeaders({ json: false }) } : {},
        json: false,
      });
      const docsList = Array.isArray(json) ? json : json.documents;
      const total =
        !Array.isArray(json) && 'total' in json ? json.total : docsList.length;
      const docs = docsList.map(normalize);
      setData(docs);
      setTotalCount(total || docs.length);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to refresh list';
      setError(msg);
    }

    // Clear progress after delay
    setTimeout(() => setBatchUploadProgress(null), 8000);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Single file: use existing handler
    if (files.length === 1) {
      void handleUpload(files[0]);
    } else {
      // Multiple files: use batch handler
      void handleBatchUpload(Array.from(files));
    }
    // reset input so selecting the same file again re-triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Single file: use existing handler
    if (files.length === 1) {
      void handleUpload(files[0]);
    } else {
      // Multiple files: use batch handler
      void handleBatchUpload(Array.from(files));
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function openChooser(): void {
    fileInputRef.current?.click();
  }

  return (
    <PageContainer maxWidth="full" className="px-4" testId="page-documents">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-bold text-2xl inline-flex items-center gap-2">
              Data
              {!loading && (
                <span className="badge badge-ghost badge-lg font-normal">
                  {totalCount}
                </span>
              )}
            </h1>
            <p className="mt-1 text-base-content/70">
              {selectedSourceType
                ? `${getSourceTypeDisplayName(
                    selectedSourceType,
                    true
                  )} in your knowledge base`
                : 'All data sources for knowledge extraction'}
            </p>
          </div>
          {/* Source Type Filter Dropdown */}
          <div className="flex items-center gap-2">
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-outline btn-sm gap-2">
                <Icon
                  icon={
                    selectedSourceType
                      ? getSourceTypeIcon(selectedSourceType)
                      : 'lucide--database'
                  }
                  className="size-4"
                />
                {selectedSourceType
                  ? getSourceTypeDisplayName(selectedSourceType, true)
                  : 'All Sources'}
                <Icon icon="lucide--chevron-down" className="size-4" />
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-56 border border-base-200"
              >
                {/* All Sources option */}
                <li>
                  <button
                    className={!selectedSourceType ? 'active' : ''}
                    onClick={() => {
                      setSearchParams({});
                    }}
                  >
                    <Icon icon="lucide--database" className="size-4" />
                    All Sources
                    <span className="badge badge-ghost badge-sm ml-auto">
                      {sourceTypeTotalCount}
                    </span>
                  </button>
                </li>
                <li className="menu-title">
                  <span>Filter by source</span>
                </li>
                {/* Source type options from API (have documents) */}
                {sourceTypes.map((st) => (
                  <li key={st.sourceType}>
                    <button
                      className={
                        selectedSourceType === st.sourceType ? 'active' : ''
                      }
                      onClick={() => {
                        setSearchParams({ sourceType: st.sourceType });
                      }}
                    >
                      <Icon
                        icon={st.plugin?.icon || 'lucide--file-question'}
                        className="size-4"
                      />
                      {st.plugin?.displayNamePlural || st.sourceType}
                      <span className="badge badge-ghost badge-sm ml-auto">
                        {st.count}
                      </span>
                    </button>
                  </li>
                ))}
                {/* Show registered plugins without documents (grayed out) */}
                {allPlugins
                  .filter(
                    (p) =>
                      !sourceTypes.find((st) => st.sourceType === p.sourceType)
                  )
                  .map((plugin) => (
                    <li key={plugin.sourceType}>
                      <button
                        className="opacity-50 cursor-not-allowed"
                        disabled
                      >
                        <Icon icon={plugin.icon} className="size-4" />
                        {plugin.displayNamePlural}
                        <span className="badge badge-ghost badge-sm ml-auto">
                          0
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Upload controls - only show when viewing all sources or upload source type */}
      {(!selectedSourceType || selectedSourceType === 'upload') && (
        <div
          className={
            'mt-4 border-2 border-dashed rounded-box p-6 transition-colors ' +
            (dragOver
              ? 'border-primary bg-primary/5'
              : 'border-base-300 bg-base-200/50')
          }
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          role="button"
          aria-label="Upload documents. Click to choose files or drag and drop multiple files."
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openChooser();
            }
          }}
        >
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <Icon
                icon="lucide--upload-cloud"
                className="size-6"
                aria-hidden
              />
              <div>
                <div className="font-medium">
                  Click to upload or drag & drop (multiple files supported)
                </div>
                <div className="opacity-70 text-sm">
                  Accepted: pdf, docx, pptx, xlsx, md, html, txt. Max 100MB per
                  file, 100 files per batch.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-primary"
                onClick={openChooser}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Spinner size="sm" />
                    Uploading...
                  </>
                ) : (
                  'Upload documents'
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={[...acceptedMimeTypes, ...acceptedExtensions].join(',')}
                onChange={onFileInputChange}
                multiple
              />
            </div>
          </div>
        </div>
      )}

      {/* Show detailed progress indicator when uploading/parsing/processing */}
      {uploadProgress && (
        <div
          role="alert"
          className={`mt-4 alert ${
            uploadProgress.stage === 'complete'
              ? 'alert-success'
              : uploadProgress.stage === 'failed'
              ? 'alert-error'
              : uploadProgress.errorMessage
              ? 'alert-warning'
              : 'alert-info'
          }`}
        >
          {/* Left icon */}
          <Icon
            icon={
              uploadProgress.stage === 'failed'
                ? 'lucide--alert-circle'
                : uploadProgress.errorMessage
                ? 'lucide--alert-triangle'
                : 'lucide--file-text'
            }
            className="size-5 shrink-0"
          />

          {/* Center content */}
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              {uploadProgress.stage === 'uploading' && 'Uploading document...'}
              {uploadProgress.stage === 'parsing' &&
                (uploadProgress.errorMessage
                  ? 'Retrying document parsing...'
                  : 'Parsing document with Kreuzberg...')}
              {uploadProgress.stage === 'processing' &&
                'Processing and creating chunks...'}
              {uploadProgress.stage === 'complete' &&
                'Document uploaded and parsed successfully!'}
              {uploadProgress.stage === 'failed' && 'Document upload failed'}
            </div>
            <div className="text-sm opacity-80">
              {uploadProgress.fileName} (
              {(uploadProgress.fileSize / 1024).toFixed(1)} KB)
              {(uploadProgress.stage === 'parsing' ||
                uploadProgress.stage === 'processing') &&
                !uploadProgress.errorMessage && (
                  <span>
                    {' '}
                    • Estimated time: ~{uploadProgress.estimatedSeconds} seconds
                  </span>
                )}
              {/* Show error message during retries (parsing stage) or final failure */}
              {uploadProgress.errorMessage && (
                <span className="font-medium">
                  {' '}
                  • {uploadProgress.errorMessage}
                </span>
              )}
            </div>
            {/* Show progress bar during parsing/processing */}
            {(uploadProgress.stage === 'parsing' ||
              uploadProgress.stage === 'processing') && (
              <progress
                className="progress progress-primary w-full mt-2"
                value={uploadProgress.stage === 'parsing' ? 30 : 70}
                max="100"
              />
            )}
          </div>

          {/* Right icon/spinner */}
          <div className="shrink-0">
            {uploadProgress.stage !== 'complete' &&
              uploadProgress.stage !== 'failed' && <Spinner size="sm" />}
            {uploadProgress.stage === 'complete' && (
              <Icon
                icon="lucide--check-circle"
                className="size-5 text-success"
              />
            )}
            {uploadProgress.stage === 'failed' && (
              <Icon icon="lucide--x-circle" className="size-5 text-error" />
            )}
          </div>
        </div>
      )}

      {/* Batch Upload Progress */}
      {batchUploadProgress && (
        <div className="mt-4 card bg-base-200 border border-base-300">
          <div className="card-body p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Icon icon="lucide--files" className="size-5" />
                {batchUploadProgress.isProcessing
                  ? `Uploading ${batchUploadProgress.total} files...`
                  : `Upload Complete`}
              </h3>
              {!batchUploadProgress.isProcessing && (
                <button
                  className="btn btn-ghost btn-sm btn-circle"
                  onClick={() => setBatchUploadProgress(null)}
                  aria-label="Dismiss"
                >
                  <Icon icon="lucide--x" className="size-4" />
                </button>
              )}
            </div>

            {/* Progress bar */}
            {batchUploadProgress.isProcessing && (
              <progress
                className="progress progress-primary w-full mb-3"
                max={batchUploadProgress.total}
                value={batchUploadProgress.current}
              />
            )}

            {/* File list */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {batchUploadProgress.files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 text-sm py-1"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon
                      icon={
                        file.status === 'success'
                          ? 'lucide--check-circle'
                          : file.status === 'duplicate'
                          ? 'lucide--copy'
                          : file.status === 'failed'
                          ? 'lucide--x-circle'
                          : file.status === 'uploading'
                          ? 'lucide--upload'
                          : file.status === 'parsing'
                          ? 'lucide--loader-2'
                          : 'lucide--file'
                      }
                      className={`size-4 shrink-0 ${
                        file.status === 'success'
                          ? 'text-success'
                          : file.status === 'duplicate'
                          ? 'text-warning'
                          : file.status === 'failed'
                          ? 'text-error'
                          : file.status === 'uploading'
                          ? 'text-info'
                          : file.status === 'parsing'
                          ? 'text-primary animate-spin'
                          : 'text-base-content/50'
                      }`}
                    />
                    <span className="truncate" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-base-content/50 text-xs">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    {file.status === 'success' && file.chunks && (
                      <span className="badge badge-success badge-sm">
                        {file.chunks} chunks
                      </span>
                    )}
                    {file.status === 'parsing' && (
                      <span className="badge badge-primary badge-sm">
                        parsing
                      </span>
                    )}
                    {file.status === 'uploading' && (
                      <span className="badge badge-info badge-sm">
                        uploading
                      </span>
                    )}
                    {file.status === 'duplicate' && (
                      <span className="badge badge-warning badge-sm">
                        duplicate
                      </span>
                    )}
                    {file.status === 'failed' && (
                      <span
                        className="badge badge-error badge-sm"
                        title={file.error}
                      >
                        failed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {!batchUploadProgress.isProcessing && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-base-300 text-sm">
                <span className="text-success">
                  {
                    batchUploadProgress.files.filter(
                      (f) => f.status === 'success'
                    ).length
                  }{' '}
                  successful
                </span>
                <span className="text-warning">
                  {
                    batchUploadProgress.files.filter(
                      (f) => f.status === 'duplicate'
                    ).length
                  }{' '}
                  duplicates
                </span>
                <span className="text-error">
                  {
                    batchUploadProgress.files.filter(
                      (f) => f.status === 'failed'
                    ).length
                  }{' '}
                  failed
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents Table */}
      <DataTable<DocumentRow>
        data={data || []}
        columns={
          [
            {
              key: 'filename',
              label: 'Document',
              sortable: true,
              width: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
              cellClassName: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
              render: (doc) => (
                <span
                  className="font-medium truncate block"
                  title={doc.filename || ''}
                >
                  {doc.filename || '(no name)'}
                </span>
              ),
            },
            {
              key: 'mimeType',
              label: 'Type',
              sortable: true,
              width: 'w-24',
              render: (doc) => {
                const mime = doc.mime_type || doc.mimeType;
                if (!mime) {
                  return (
                    <span className="text-sm text-base-content/40">—</span>
                  );
                }
                // Map common MIME types to friendly short labels
                const mimeLabels: Record<string, string> = {
                  'application/pdf': 'PDF',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                    'DOCX',
                  'application/msword': 'DOC',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                    'XLSX',
                  'application/vnd.ms-excel': 'XLS',
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
                    'PPTX',
                  'application/vnd.ms-powerpoint': 'PPT',
                  'text/plain': 'TXT',
                  'text/markdown': 'MD',
                  'text/csv': 'CSV',
                  'text/html': 'HTML',
                  'application/json': 'JSON',
                  'application/xml': 'XML',
                  'text/xml': 'XML',
                  'image/png': 'PNG',
                  'image/jpeg': 'JPEG',
                  'image/gif': 'GIF',
                  'image/webp': 'WEBP',
                  'message/rfc822': 'EML',
                  'application/vnd.ms-outlook': 'MSG',
                };
                const label =
                  mimeLabels[mime] ||
                  mime.split('/').pop()?.toUpperCase() ||
                  mime;
                return (
                  <span
                    className="text-sm text-base-content/70 badge badge-ghost badge-sm"
                    title={mime}
                  >
                    {label}
                  </span>
                );
              },
            },
            {
              key: 'conversionStatus',
              label: 'Conversion',
              sortable: true,
              width: 'w-32',
              render: (doc) => {
                const status = doc.conversionStatus;

                // No conversion needed (plain text files) - show dash
                if (!status || status === 'not_required') {
                  return (
                    <span className="text-sm text-base-content/40">—</span>
                  );
                }

                // Conversion completed successfully
                if (status === 'completed') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--check-circle"
                        className="size-4 text-success"
                      />
                      <span className="text-sm text-base-content/70">
                        Ready
                      </span>
                    </div>
                  );
                }

                if (status === 'pending') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--clock"
                        className="size-4 text-warning animate-pulse"
                      />
                      <span className="text-sm text-base-content/70">
                        Pending
                      </span>
                    </div>
                  );
                }

                if (status === 'processing') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--loader-circle"
                        className="size-4 text-info animate-spin"
                      />
                      <span className="text-sm text-base-content/70">
                        Converting
                      </span>
                    </div>
                  );
                }

                if (status === 'failed') {
                  const errorMessage =
                    doc.conversionError || 'Conversion failed';
                  return (
                    <Tooltip
                      content={
                        <div className="max-w-xl">
                          <div className="font-medium mb-1">
                            Conversion Error
                          </div>
                          <div className="text-sm opacity-90">
                            {errorMessage}
                          </div>
                        </div>
                      }
                      placement="bottom"
                      color="error"
                    >
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

                return <span className="text-sm text-base-content/40">—</span>;
              },
            },
            {
              key: 'totalChars',
              label: 'Chars',
              sortable: true,
              width: 'w-24',
              render: (doc) => {
                const chars = doc.totalChars ?? 0;
                if (chars === 0) {
                  return (
                    <span className="text-sm text-base-content/40">—</span>
                  );
                }
                // Format with thousands separator
                return (
                  <span className="text-sm text-base-content/70">
                    {chars.toLocaleString()}
                  </span>
                );
              },
            },
            {
              key: 'embeddingStatus',
              label: 'Embeddings',
              sortable: true,
              width: 'w-32',
              render: (doc) => {
                const embedded = doc.embeddedChunks ?? 0;
                const total = doc.chunks ?? 0;

                if (total === 0) {
                  return (
                    <span className="text-sm text-base-content/40">—</span>
                  );
                }

                const isComplete = embedded === total;
                const hasNone = embedded === 0;
                const iconColor = isComplete
                  ? 'text-success'
                  : hasNone
                  ? 'text-warning'
                  : 'text-info';
                const icon = isComplete
                  ? 'lucide--check-circle'
                  : hasNone
                  ? 'lucide--clock'
                  : 'lucide--loader-circle';
                // Pulse animation for pending (orange) or in-progress states
                const pulseClass = !isComplete ? 'animate-pulse' : '';

                return (
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={icon}
                      className={`size-4 ${iconColor} ${pulseClass}`}
                    />
                    <span className="text-sm text-base-content/70">
                      {embedded}/{total}
                    </span>
                  </div>
                );
              },
            },
            {
              key: 'extractionStatus',
              label: 'Extraction',
              sortable: true,
              width: 'w-28',
              render: (doc) => {
                const status = doc.extractionStatus;

                // No extraction yet
                if (!status) {
                  return (
                    <span className="text-sm text-base-content/40">—</span>
                  );
                }

                // Queued - waiting to start
                if (status === 'queued') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--clock"
                        className="size-4 text-warning animate-pulse"
                      />
                      <span className="text-sm text-base-content/70">
                        Queued
                      </span>
                    </div>
                  );
                }

                // Running - extraction in progress
                if (status === 'running') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--loader-circle"
                        className="size-4 text-info animate-spin"
                      />
                      <span className="text-sm text-base-content/70">
                        Running
                      </span>
                    </div>
                  );
                }

                // Completed successfully
                if (status === 'completed') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--check-circle"
                        className="size-4 text-success"
                      />
                      <span className="text-sm text-base-content/70">Done</span>
                    </div>
                  );
                }

                // Requires review
                if (status === 'requires_review') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--alert-triangle"
                        className="size-4 text-warning"
                      />
                      <span className="text-sm text-base-content/70">
                        Review
                      </span>
                    </div>
                  );
                }

                // Failed
                if (status === 'failed') {
                  return (
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="lucide--alert-circle"
                        className="size-4 text-error"
                      />
                      <span className="text-sm text-error">Failed</span>
                    </div>
                  );
                }

                // Unknown status - show as-is
                return (
                  <span className="text-sm text-base-content/70">{status}</span>
                );
              },
            },
            {
              key: 'chunks',
              label: 'Chunks',
              sortable: true,
              width: 'w-24',
              render: (doc) => (
                <a
                  href={`/admin/apps/chunks?docId=${doc.id}`}
                  className="badge-outline hover:underline no-underline badge"
                  title="View chunks for this document"
                >
                  {doc.chunks}
                </a>
              ),
            },
          ] as ColumnDef<DocumentRow>[]
        }
        filters={[
          {
            key: 'status',
            label: 'Filter by Status',
            icon: 'lucide--activity',
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'running', label: 'Running' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
            ],
            getValue: (doc) => doc.extractionStatus || 'pending',
            badgeColor: 'info',
          },
          {
            key: 'type',
            label: 'Filter by Type',
            icon: 'lucide--file-type',
            options: [
              { value: 'application/pdf', label: 'PDF' },
              {
                value:
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                label: 'Word',
              },
              {
                value:
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                label: 'PowerPoint',
              },
              {
                value:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                label: 'Excel',
              },
              { value: 'text/plain', label: 'Text' },
              { value: 'text/markdown', label: 'Markdown' },
              { value: 'text/html', label: 'HTML' },
            ],
            getValue: (doc) => doc.mime_type || 'unknown',
            badgeColor: 'secondary',
          },
        ]}
        rowActions={
          [
            {
              label: 'View Details',
              icon: 'lucide--eye',
              onAction: (doc) => {
                setSelectedDocumentForDetail(doc);
                // Record activity for Recent Items feature (fire-and-forget)
                recordActivity({
                  resourceType: 'document',
                  resourceId: doc.id,
                  resourceName: doc.filename || undefined,
                  resourceSubtype: doc.mime_type || undefined,
                  actionType: 'viewed',
                });
              },
            },
            {
              label: 'Extract',
              icon: 'lucide--sparkles',
              onAction: handleExtractObjects,
            },
            {
              label: 'View chunks',
              icon: 'lucide--list',
              asLink: true,
              href: (doc) => `/admin/apps/chunks?docId=${doc.id}`,
            },
            {
              label: 'Recreate chunks',
              icon: 'lucide--refresh-cw',
              onAction: handleRecreateChunks,
            },
            {
              label: 'View metadata',
              icon: 'lucide--info',
              onAction: handleViewMetadata,
              hidden: (doc: DocumentRow) => !doc.integrationMetadata,
            },
            {
              label: 'Retry conversion',
              icon: 'lucide--rotate-ccw',
              onAction: handleRetryConversion,
              hidden: (doc: DocumentRow) => doc.conversionStatus !== 'failed',
              variant: 'warning',
            },
            {
              label: 'Delete',
              icon: 'lucide--trash-2',
              onAction: handleDeleteDocument,
              variant: 'error',
            },
          ] as RowAction<DocumentRow>[]
        }
        bulkActions={
          [
            {
              key: 'extract',
              label: 'Extract',
              icon: 'lucide--sparkles',
              variant: 'primary',
              style: 'solid',
              onAction: handleBulkExtract,
            },
            {
              key: 'recreate-chunks',
              label: 'Recreate Chunks',
              icon: 'lucide--refresh-cw',
              variant: 'secondary',
              style: 'outline',
              onAction: handleBulkRecreateChunks,
            },
            {
              key: 'delete',
              label: 'Delete',
              icon: 'lucide--trash-2',
              variant: 'error',
              style: 'outline',
              onAction: handleBulkDelete,
            },
          ] as BulkAction<DocumentRow>[]
        }
        loading={loading}
        error={error}
        enableSelection={true}
        enableSearch={true}
        searchPlaceholder="Search documents..."
        getSearchText={(doc) =>
          `${doc.filename || ''} ${doc.source_url || ''} ${doc.mime_type || ''}`
        }
        emptyMessage="No documents uploaded yet. Upload a document to get started."
        emptyIcon="lucide--file-text"
        formatDate={(date) => new Date(date).toLocaleDateString()}
        useDropdownActions={true}
        disabled={uploading || isDeleting}
        className="mt-4"
      />

      {/* Extraction Configuration Modal */}
      <ExtractionConfigModal
        isOpen={isExtractionModalOpen}
        onClose={handleExtractionModalClose}
        onConfirm={
          selectedDocumentsForBatchExtraction.length > 0
            ? handleBatchExtractionConfirm
            : handleExtractionConfirm
        }
        isLoading={isStartingExtraction}
        documentName={
          selectedDocumentsForBatchExtraction.length > 0
            ? `${selectedDocumentsForBatchExtraction.length} documents`
            : selectedDocumentForExtraction?.filename || undefined
        }
      />

      {/* Document Metadata Modal */}
      <DocumentMetadataModal
        isOpen={isMetadataModalOpen}
        onClose={() => {
          setIsMetadataModalOpen(false);
          setSelectedDocumentForMetadata(null);
        }}
        metadata={selectedDocumentForMetadata?.integrationMetadata}
        documentName={
          selectedDocumentForMetadata?.filename ||
          selectedDocumentForMetadata?.name ||
          'Document'
        }
      />

      {/* Deletion Confirmation Modal */}
      <DeletionConfirmationModal
        open={isDeletionModalOpen}
        onCancel={() => {
          setIsDeletionModalOpen(false);
          setDocumentsToDelete([]);
        }}
        onConfirm={handleConfirmDeletion}
        documentIds={documentsToDelete.map((d) => d.id)}
        documentNames={
          documentsToDelete.length === 1
            ? documentsToDelete[0].filename || 'Document'
            : documentsToDelete.map((d) => d.filename || d.id)
        }
        fetchImpact={fetchDeletionImpact}
      />

      {/* Document Detail Modal */}
      <DocumentDetailModal
        document={
          selectedDocumentForDetail
            ? ({
                id: selectedDocumentForDetail.id,
                filename: selectedDocumentForDetail.filename,
                name: selectedDocumentForDetail.name,
                source_url: selectedDocumentForDetail.source_url,
                sourceUrl: selectedDocumentForDetail.sourceUrl,
                mime_type: selectedDocumentForDetail.mime_type,
                mimeType: selectedDocumentForDetail.mimeType,
                created_at: selectedDocumentForDetail.created_at,
                createdAt: selectedDocumentForDetail.createdAt,
                updated_at: selectedDocumentForDetail.updated_at,
                updatedAt: selectedDocumentForDetail.updatedAt,
                content: selectedDocumentForDetail.content,
                content_length: selectedDocumentForDetail.content_length,
                contentLength: selectedDocumentForDetail.contentLength,
                chunks: selectedDocumentForDetail.chunks,
                totalChars: selectedDocumentForDetail.totalChars,
                embeddedChunks: selectedDocumentForDetail.embeddedChunks,
                extractionStatus: selectedDocumentForDetail.extractionStatus,
                extractionCompletedAt:
                  selectedDocumentForDetail.extractionCompletedAt,
                extractionObjectsCount:
                  selectedDocumentForDetail.extractionObjectsCount,
                integrationMetadata:
                  selectedDocumentForDetail.integrationMetadata,
                metadata: selectedDocumentForDetail.metadata,
                conversionStatus: selectedDocumentForDetail.conversionStatus,
                conversionError: selectedDocumentForDetail.conversionError,
                conversionCompletedAt:
                  selectedDocumentForDetail.conversionCompletedAt,
                sourceType: selectedDocumentForDetail.sourceType,
                parentDocumentId: selectedDocumentForDetail.parentDocumentId,
                childCount: selectedDocumentForDetail.childCount,
                projectId: selectedDocumentForDetail.projectId,
                externalSourceId: selectedDocumentForDetail.externalSourceId,
                dataSourceIntegrationId:
                  selectedDocumentForDetail.dataSourceIntegrationId,
                storageKey: selectedDocumentForDetail.storageKey,
                storageUrl: selectedDocumentForDetail.storageUrl,
                fileHash: selectedDocumentForDetail.fileHash,
                contentHash: selectedDocumentForDetail.contentHash,
                syncVersion: selectedDocumentForDetail.syncVersion,
                fileSizeBytes: selectedDocumentForDetail.fileSizeBytes,
              } as DetailDocumentRow)
            : null
        }
        isOpen={!!selectedDocumentForDetail}
        onClose={() => setSelectedDocumentForDetail(null)}
        onDocumentChange={(doc) =>
          setSelectedDocumentForDetail(normalize(doc as any))
        }
      />
    </PageContainer>
  );
}
