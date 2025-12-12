import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { useAuth } from '@/contexts/useAuth';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';
import { useDataUpdates } from '@/contexts/data-updates';
import {
  ExtractionConfigModal,
  type ExtractionConfig,
} from '@/components/organisms/ExtractionConfigModal';
import { DocumentMetadataModal } from '@/components/organisms/DocumentMetadataModal';
import { DeletionConfirmationModal } from '@/components/organisms/DeletionConfirmationModal';
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
  // Integration metadata
  integrationMetadata?: Record<string, any> | null;
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
  const navigate = useNavigate();
  const { getAccessToken, user } = useAuth();
  const { buildHeaders, apiBase, fetchJson, fetchForm } = useApi();
  const { config } = useConfig();
  const { showToast } = useToast();
  const [data, setData] = useState<DocumentRow[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: 'uploading' | 'processing' | 'complete';
    fileName: string;
    fileSize: number;
    estimatedSeconds: number;
  } | null>(null);
  // Batch upload state
  const [batchUploadProgress, setBatchUploadProgress] = useState<{
    files: Array<{
      name: string;
      size: number;
      status: 'pending' | 'uploading' | 'success' | 'duplicate' | 'failed';
      error?: string;
      documentId?: string;
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

  // Preview modal state
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreviewContent, setLoadingPreviewContent] = useState(false);

  // Fetch document content when preview modal opens
  useEffect(() => {
    if (!preview) {
      setPreviewContent(null);
      return;
    }

    let cancelled = false;
    setLoadingPreviewContent(true);

    async function fetchContent() {
      if (!preview) return; // Type guard

      try {
        const t = getAccessToken();
        const doc = await fetchJson<DocumentRow>(
          `${apiBase}/api/documents/${preview.id}`,
          {
            headers: t ? buildHeaders({ json: false }) : {},
            json: false,
          }
        );
        if (!cancelled) {
          // Check both possible field names for content
          const content = (doc as any).content || '';
          setPreviewContent(content);
        }
      } catch (err) {
        console.error('Failed to load document content:', err);
        if (!cancelled) {
          setPreviewContent('Failed to load document content.');
        }
      } finally {
        if (!cancelled) {
          setLoadingPreviewContent(false);
        }
      }
    }

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [preview, apiBase, getAccessToken, buildHeaders, fetchJson]);

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

  // Deletion modal state
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const [documentsToDelete, setDocumentsToDelete] = useState<DocumentRow[]>([]);
  const [deletionDocumentIds, setDeletionDocumentIds] = useState<string[]>([]);

  const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

  // Load documents only when an active org & project are selected (prevents 403 on first-login with no org).
  useEffect(() => {
    let cancelled = false;
    // Require both org & project (project scoping) to fetch; gate handles creation/select flows.
    if (!config.activeOrgId || !config.activeProjectId) {
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
          | DocumentRow[]
          | { documents: DocumentRow[]; total?: number }
          | { documents: DocumentRow[] }
        >(`${apiBase}/api/documents`, {
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
      >(`${apiBase}/api/documents?_t=${Date.now()}`, {
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
    apiBase,
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

  const acceptedMimeTypes = useMemo(
    () => [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'text/plain',
      'text/markdown',
      'text/html',
    ],
    []
  );

  const acceptedExtensions = useMemo(
    () => ['.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md', '.html', '.htm'],
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

      // Close modal and navigate to job detail page
      setIsExtractionModalOpen(false);
      setSelectedDocumentForExtraction(null);

      // Show success message briefly before navigation
      showToast({
        message: 'Extraction job created successfully! Redirecting...',
        variant: 'success',
        duration: 3000,
      });
      setTimeout(() => {
        navigate(`/admin/extraction-jobs/${job.id}`);
      }, 1000);
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
          message: `Successfully created ${successCount} extraction job${
            successCount !== 1 ? 's' : ''
          }. View them in the Extraction Jobs page.`,
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
          message: `Created ${successCount} extraction job${
            successCount !== 1 ? 's' : ''
          }, but ${failCount} failed. Failed: ${failedDocs.join(', ')}`,
          variant: 'warning',
          duration: 10000,
        });
      }

      // Navigate to extraction jobs page after a delay
      if (successCount > 0) {
        setTimeout(() => {
          navigate('/admin/extraction-jobs');
        }, 2000);
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

        if (result.totalFailed === 0) {
          showToast({
            message: `Successfully deleted ${result.totalDeleted} document${
              result.totalDeleted !== 1 ? 's' : ''
            }`,
            variant: 'success',
          });
        } else {
          showToast({
            message: `Deleted ${result.totalDeleted} documents, but ${result.totalFailed} failed`,
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
    const max = 10 * 1024 * 1024; // 10MB
    if (file.size > max) {
      showToast({
        message: 'File is larger than 10MB limit.',
        variant: 'error',
      });
      return;
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
      const fd = new FormData();
      fd.append('file', file);
      if (config.activeProjectId)
        fd.append('projectId', config.activeProjectId);
      const t = getAccessToken();

      // Update to processing stage before actual upload
      setUploadProgress({
        stage: 'processing',
        fileName: file.name,
        fileSize: file.size,
        estimatedSeconds,
      });

      const result = await fetchForm<{
        documentId: string;
        chunks: number;
        alreadyExists: boolean;
      }>(`${apiBase}/api/ingest/upload`, fd, {
        method: 'POST',
        headers: t ? buildHeaders({ json: false }) : {},
      });

      // Mark as complete (skip banner for duplicates - they're instant)
      if (!result.alreadyExists) {
        setUploadProgress({
          stage: 'complete',
          fileName: file.name,
          fileSize: file.size,
          estimatedSeconds,
        });
      }

      // Reload documents WITHOUT hiding the table (no setLoading(true))
      // Add cache-busting parameter to ensure fresh data after upload
      try {
        const t2 = getAccessToken();
        const json = await fetchJson<
          DocumentRow[] | { documents: DocumentRow[] }
        >(`${apiBase}/api/documents?_t=${Date.now()}`, {
          headers: t2 ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
        const docs = (Array.isArray(json) ? json : json.documents).map(
          normalize
        );
        setData(docs);

        // Show appropriate message based on whether document was duplicate
        if (result.alreadyExists) {
          showToast({
            message: `Document already exists (duplicate detected). Showing existing document with ${result.chunks} chunks.`,
            variant: 'warning',
            duration: 6000,
          });
        } else {
          showToast({
            message: `Document processed successfully! Created ${result.chunks} chunks.`,
            variant: 'success',
            duration: 4000,
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to refresh list';
        setError(msg);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      showToast({ message: msg, variant: 'error' });
    } finally {
      setUploading(false);
      // Clear progress banner after showing completion state
      if (uploadProgress && uploadProgress.stage === 'complete') {
        setTimeout(() => setUploadProgress(null), 5000);
      } else {
        // For duplicates or errors, clear immediately since we skip the banner
        setUploadProgress(null);
      }
    }
  }

  /**
   * Handle batch upload of multiple files.
   * Uses the /api/ingest/upload-batch endpoint for efficient processing.
   */
  async function handleBatchUpload(files: File[]): Promise<void> {
    // Filter and validate files
    const validFiles: File[] = [];
    const invalidFiles: { name: string; reason: string }[] = [];
    const max = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
      if (!isAccepted(file)) {
        invalidFiles.push({
          name: file.name,
          reason: 'Unsupported file type',
        });
      } else if (file.size > max) {
        invalidFiles.push({
          name: file.name,
          reason: 'File exceeds 10MB limit',
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

    try {
      // Create FormData with all files
      const fd = new FormData();
      for (const file of validFiles) {
        fd.append('files', file);
      }
      if (config.activeProjectId) {
        fd.append('projectId', config.activeProjectId);
      }
      if (config.activeOrgId) {
        fd.append('orgId', config.activeOrgId);
      }

      const t = getAccessToken();

      // Update status to uploading
      setBatchUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) => ({
                ...f,
                status: 'uploading' as const,
              })),
            }
          : null
      );

      const result = await fetchForm<{
        summary: {
          total: number;
          successful: number;
          duplicates: number;
          failed: number;
        };
        results: Array<{
          filename: string;
          status: 'success' | 'duplicate' | 'failed';
          documentId?: string;
          chunks?: number;
          error?: string;
        }>;
      }>(`${apiBase}/api/ingest/upload-batch`, fd, {
        method: 'POST',
        headers: t ? buildHeaders({ json: false }) : {},
      });

      // Update progress with results
      setBatchUploadProgress((prev) => {
        if (!prev) return null;
        const updatedFiles = prev.files.map((f) => {
          const resultItem = result.results.find((r) => r.filename === f.name);
          if (resultItem) {
            return {
              ...f,
              status: resultItem.status,
              documentId: resultItem.documentId,
              chunks: resultItem.chunks,
              error: resultItem.error,
            };
          }
          return f;
        });
        return {
          ...prev,
          files: updatedFiles,
          current: result.summary.total,
          isProcessing: false,
        };
      });

      // Show summary toast
      const { summary } = result;
      if (summary.failed === 0 && summary.duplicates === 0) {
        showToast({
          message: `Successfully uploaded ${summary.successful} document${
            summary.successful !== 1 ? 's' : ''
          }!`,
          variant: 'success',
          duration: 4000,
        });
      } else if (summary.successful === 0 && summary.duplicates === 0) {
        showToast({
          message: `All ${summary.failed} uploads failed.`,
          variant: 'error',
          duration: 6000,
        });
      } else {
        const parts = [];
        if (summary.successful > 0)
          parts.push(`${summary.successful} successful`);
        if (summary.duplicates > 0)
          parts.push(`${summary.duplicates} duplicates`);
        if (summary.failed > 0) parts.push(`${summary.failed} failed`);
        showToast({
          message: `Batch complete: ${parts.join(', ')}`,
          variant: summary.failed > 0 ? 'warning' : 'success',
          duration: 6000,
        });
      }

      // Reload documents WITHOUT hiding the table
      try {
        const t2 = getAccessToken();
        const json = await fetchJson<
          DocumentRow[] | { documents: DocumentRow[]; total?: number }
        >(`${apiBase}/api/documents?_t=${Date.now()}`, {
          headers: t2 ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
        const docsList = Array.isArray(json) ? json : json.documents;
        const total =
          !Array.isArray(json) && 'total' in json
            ? json.total
            : docsList.length;
        const docs = docsList.map(normalize);
        setData(docs);
        setTotalCount(total || docs.length);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to refresh list';
        setError(msg);
      }

      // Clear progress after delay
      setTimeout(() => setBatchUploadProgress(null), 8000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Batch upload failed';
      showToast({ message: msg, variant: 'error' });
      setBatchUploadProgress(null);
    } finally {
      setUploading(false);
    }
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
    <div data-testid="page-documents" className="w-full px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl inline-flex items-center gap-2">
          Documents
          {!loading && (
            <span className="badge badge-ghost badge-lg font-normal">
              {totalCount}
            </span>
          )}
        </h1>
        <p className="mt-1 text-base-content/70">
          Upload and manage documents for knowledge extraction
        </p>
      </div>

      {/* Upload controls */}
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
            <Icon icon="lucide--upload-cloud" className="size-6" aria-hidden />
            <div>
              <div className="font-medium">
                Click to upload or drag & drop (multiple files supported)
              </div>
              <div className="opacity-70 text-sm">
                Accepted: pdf, docx, pptx, xlsx, md, html, txt. Max 10MB per
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
                  <span className="loading loading-spinner loading-sm" />
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

      {/* Show detailed progress indicator when uploading/processing (skip for instant duplicates) */}
      {uploadProgress && (
        <div
          role="alert"
          className={`mt-4 alert ${
            uploadProgress.stage === 'complete' ? 'alert-success' : 'alert-info'
          }`}
        >
          <Icon icon="lucide--file-text" className="size-5" />
          <div className="flex-1">
            <div className="flex justify-between items-center gap-4">
              <div className="flex-1">
                <div className="font-medium">
                  {uploadProgress.stage === 'uploading' &&
                    'Uploading document...'}
                  {uploadProgress.stage === 'processing' &&
                    'Processing and creating chunks...'}
                  {uploadProgress.stage === 'complete' &&
                    'Processing complete!'}
                </div>
                <div className="text-sm opacity-80">
                  {uploadProgress.fileName} (
                  {(uploadProgress.fileSize / 1024).toFixed(1)} KB)
                  {uploadProgress.stage === 'processing' && (
                    <span>
                      {' '}
                      • Estimated time: ~{uploadProgress.estimatedSeconds}{' '}
                      seconds
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {uploadProgress.stage !== 'complete' && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                {uploadProgress.stage === 'complete' && (
                  <Icon
                    icon="lucide--check-circle"
                    className="size-5 text-success"
                  />
                )}
              </div>
            </div>
            {/* Show progress bar only during processing */}
            {uploadProgress.stage === 'processing' && (
              <progress
                className="progress progress-primary w-full mt-2"
                value="50"
                max="100"
              />
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
                          ? 'text-info animate-spin'
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
      <div
        className={`mt-4 ${
          uploading || isDeleting ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <DataTable<DocumentRow>
          data={data || []}
          columns={
            [
              {
                key: 'filename',
                label: 'Document',
                sortable: true,
                width: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
                cellClassName:
                  'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
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
                label: 'Preview',
                icon: 'lucide--eye',
                onAction: (doc) => {
                  setPreview(doc);
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
            `${doc.filename || ''} ${doc.source_url || ''} ${
              doc.mime_type || ''
            }`
          }
          emptyMessage="No documents uploaded yet. Upload a document to get started."
          emptyIcon="lucide--file-text"
          formatDate={(date) => new Date(date).toLocaleDateString()}
          useDropdownActions={true}
        />
      </div>

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

      {/* Document Preview Modal */}
      {preview && (
        <dialog className="modal" open>
          <div className="max-w-5xl modal-box">
            <h3 className="card-title">{preview.filename || '(no name)'}</h3>
            <div className="mt-2 text-sm text-base-content/70">
              {preview.mime_type && (
                <span className="mr-3">Type: {preview.mime_type}</span>
              )}
              {preview.source_url && (
                <a
                  href={preview.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="link link-primary"
                >
                  View source
                </a>
              )}
            </div>
            <div className="space-y-2 mt-4">
              <div className="text-sm">
                <span className="font-medium">Chunks:</span> {preview.chunks}
              </div>
              {preview.created_at && (
                <div className="text-sm">
                  <span className="font-medium">Created:</span>{' '}
                  {new Date(preview.created_at).toLocaleString()}
                </div>
              )}
              {preview.extractionStatus && (
                <div className="text-sm">
                  <span className="font-medium">Extraction:</span>{' '}
                  {preview.extractionStatus}
                  {preview.extractionObjectsCount &&
                    ` (${preview.extractionObjectsCount} objects)`}
                </div>
              )}
            </div>

            {/* Document Content */}
            <div className="mt-6">
              <div className="mb-2 font-medium text-sm">Content:</div>
              {loadingPreviewContent ? (
                <div className="flex justify-center items-center py-8">
                  <span className="loading loading-spinner loading-md" />
                </div>
              ) : (
                <pre className="bg-base-200 p-4 rounded-box max-h-96 overflow-y-auto text-sm whitespace-pre-wrap">
                  {previewContent || '(empty)'}
                </pre>
              )}
            </div>

            <div className="modal-action">
              <button className="btn" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
          <form
            method="dialog"
            className="modal-backdrop"
            onSubmit={() => setPreview(null)}
          >
            <button>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
