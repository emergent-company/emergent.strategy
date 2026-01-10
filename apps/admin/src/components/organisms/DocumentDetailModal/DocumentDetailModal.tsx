import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { Tooltip } from '@/components/atoms/Tooltip';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import {
  getSourceTypeDisplayName,
  getSourceTypeIcon,
} from '@/lib/source-type-plugins';

// Types
export type DocumentDetailTab =
  | 'properties'
  | 'content'
  | 'relationships'
  | 'system';

export interface DocumentRow {
  id: string;
  filename?: string | null;
  name?: string | null;
  source_url?: string | null;
  sourceUrl?: string | null;
  mime_type?: string | null;
  mimeType?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  content?: string | null;
  content_length?: number | null;
  contentLength?: number | null;
  chunks: number;
  totalChars?: number;
  embeddedChunks?: number;
  extractionStatus?: string;
  extractionCompletedAt?: string;
  extractionObjectsCount?: number;
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
  conversionCompletedAt?: string | null;
  sourceType?: string | null;
  parentDocumentId?: string | null;
  childCount?: number | null;
  // Extended fields for system info
  projectId?: string | null;
  externalSourceId?: string | null;
  dataSourceIntegrationId?: string | null;
  storageKey?: string | null;
  storageUrl?: string | null;
  fileHash?: string | null;
  contentHash?: string | null;
  syncVersion?: number | null;
  fileSizeBytes?: number | null;
}

interface ObjectSummary {
  id: string;
  name: string;
  type: string;
}

interface ExtractionJob {
  id: string;
  status: string;
  objectsCreated?: number;
}

export interface DocumentDetailModalProps {
  document: DocumentRow | null;
  isOpen: boolean;
  onClose: () => void;
  onDocumentChange?: (document: DocumentRow) => void;
}

/** Format email addresses array to readable string */
function formatEmailAddresses(
  addresses: Array<{ name?: string; address?: string }> | string | undefined
): string {
  if (!addresses) return '';
  if (typeof addresses === 'string') return addresses;
  if (!Array.isArray(addresses)) return '';
  return addresses
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
    .join(', ');
}

/** Format file size to human readable */
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format conversion status badge */
function getConversionStatusBadge(status: string | null | undefined): {
  class: string;
  label: string;
} {
  switch (status) {
    case 'completed':
      return { class: 'badge-success', label: 'Completed' };
    case 'processing':
      return { class: 'badge-warning', label: 'Processing' };
    case 'pending':
      return { class: 'badge-info', label: 'Pending' };
    case 'failed':
      return { class: 'badge-error', label: 'Failed' };
    case 'not_required':
      return { class: 'badge-ghost', label: 'Not Required' };
    default:
      return { class: 'badge-ghost', label: status || 'Unknown' };
  }
}

export function DocumentDetailModal({
  document,
  isOpen,
  onClose,
  onDocumentChange,
}: DocumentDetailModalProps) {
  const { fetchJson, apiBase } = useApi();
  const { config } = useConfig();

  // Tab state
  const [activeTab, setActiveTab] = useState<DocumentDetailTab>('properties');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Content tab state (lazy loaded, cached)
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const contentCacheRef = useRef<Record<string, string>>({});

  // Relationships tab state (lazy loaded, cached)
  const [extractedObjects, setExtractedObjects] = useState<ObjectSummary[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [childDocuments, setChildDocuments] = useState<DocumentRow[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [parentDocument, setParentDocument] = useState<DocumentRow | null>(
    null
  );
  const [loadingParent, setLoadingParent] = useState(false);
  const objectsCacheRef = useRef<Record<string, ObjectSummary[]>>({});
  const childrenCacheRef = useRef<Record<string, DocumentRow[]>>({});
  const parentCacheRef = useRef<Record<string, DocumentRow>>({});

  // Collapsible state for raw metadata
  const [showRawMetadata, setShowRawMetadata] = useState(false);
  const [showRawIntegrationMetadata, setShowRawIntegrationMetadata] =
    useState(false);

  // Reset state when document changes
  useEffect(() => {
    if (document?.id) {
      setActiveTab('properties');
      setContent(null);
      setExtractedObjects([]);
      setChildDocuments([]);
      setParentDocument(null);
      setShowRawMetadata(false);
      setShowRawIntegrationMetadata(false);
    }
  }, [document?.id]);

  // Fetch content when Content tab is active
  useEffect(() => {
    if (!document?.id || activeTab !== 'content') return;

    // Check cache first
    if (contentCacheRef.current[document.id]) {
      setContent(contentCacheRef.current[document.id]);
      return;
    }

    let cancelled = false;
    setLoadingContent(true);

    fetchJson<{ content?: string } | string>(
      `${apiBase}/api/documents/${document.id}/content`
    )
      .then((res) => {
        if (cancelled) return;
        const text = typeof res === 'string' ? res : res?.content || '';
        contentCacheRef.current[document.id] = text;
        setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent('(Failed to load content)');
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document?.id, activeTab, apiBase, fetchJson]);

  // Fetch relationships when Relationships tab is active
  useEffect(() => {
    if (!document?.id || activeTab !== 'relationships') return;

    // Fetch parent document
    if (
      document.parentDocumentId &&
      !parentCacheRef.current[document.parentDocumentId]
    ) {
      setLoadingParent(true);
      fetchJson<DocumentRow>(
        `${apiBase}/api/documents/${document.parentDocumentId}`
      )
        .then((parent) => {
          parentCacheRef.current[document.parentDocumentId!] = parent;
          setParentDocument(parent);
        })
        .catch(() => setParentDocument(null))
        .finally(() => setLoadingParent(false));
    } else if (document.parentDocumentId) {
      setParentDocument(parentCacheRef.current[document.parentDocumentId]);
    }

    // Fetch child documents
    if (!childrenCacheRef.current[document.id]) {
      setLoadingChildren(true);
      fetchJson<
        { items?: DocumentRow[]; documents?: DocumentRow[] } | DocumentRow[]
      >(`${apiBase}/api/documents?parentDocumentId=${document.id}`)
        .then((res) => {
          const children = Array.isArray(res)
            ? res
            : res?.items || res?.documents || [];
          childrenCacheRef.current[document.id] = children;
          setChildDocuments(children);
        })
        .catch(() => setChildDocuments([]))
        .finally(() => setLoadingChildren(false));
    } else {
      setChildDocuments(childrenCacheRef.current[document.id]);
    }

    // Fetch extracted objects via extraction jobs
    if (!objectsCacheRef.current[document.id]) {
      setLoadingObjects(true);
      // First get extraction jobs for this document
      fetchJson<{ items?: ExtractionJob[] } | ExtractionJob[]>(
        `${apiBase}/api/object-extraction-jobs?sourceId=${document.id}&sourceType=document`
      )
        .then(async (jobsRes) => {
          const jobs = Array.isArray(jobsRes) ? jobsRes : jobsRes?.items || [];
          if (jobs.length === 0) {
            objectsCacheRef.current[document.id] = [];
            setExtractedObjects([]);
            return;
          }

          // Get objects for each extraction job
          const allObjects: ObjectSummary[] = [];
          for (const job of jobs) {
            try {
              const objRes = await fetchJson<{
                items?: ObjectSummary[];
                objects?: ObjectSummary[];
              }>(
                `${apiBase}/api/graph/objects/search?extraction_job_id=${job.id}&limit=50`
              );
              const objs = objRes?.items || objRes?.objects || [];
              allObjects.push(...objs);
            } catch {
              // Continue with other jobs
            }
          }

          // Deduplicate by id
          const uniqueObjects = Array.from(
            new Map(allObjects.map((o) => [o.id, o])).values()
          );
          objectsCacheRef.current[document.id] = uniqueObjects;
          setExtractedObjects(uniqueObjects);
        })
        .catch(() => {
          objectsCacheRef.current[document.id] = [];
          setExtractedObjects([]);
        })
        .finally(() => setLoadingObjects(false));
    } else {
      setExtractedObjects(objectsCacheRef.current[document.id]);
    }
  }, [document?.id, document?.parentDocumentId, activeTab, apiBase, fetchJson]);

  // Handle navigation to parent/child document
  const handleDocumentNavigation = useCallback(
    (doc: DocumentRow) => {
      if (onDocumentChange) {
        onDocumentChange(doc);
      }
    },
    [onDocumentChange]
  );

  // Handle navigation to object (opens in new page)
  const handleObjectClick = useCallback((objectId: string) => {
    window.location.href = `/admin/pages/objects#${objectId}`;
  }, []);

  if (!isOpen || !document) return null;

  // Normalize document fields
  const filename = document.filename || document.name || '(Untitled)';
  const sourceUrl = document.source_url || document.sourceUrl;
  const mimeType = document.mime_type || document.mimeType;
  const createdAt = document.created_at || document.createdAt;
  const updatedAt = document.updated_at || document.updatedAt;

  // Get email metadata (can be in metadata or integrationMetadata)
  const emailMeta =
    document.sourceType === 'email'
      ? document.metadata || document.integrationMetadata
      : null;

  // Get original mime type if conversion happened
  const originalMimeType =
    document.metadata?.originalMimeType ||
    document.integrationMetadata?.originalMimeType;

  const sourceTypeIcon = document.sourceType
    ? getSourceTypeIcon(document.sourceType)
    : 'lucide--file';

  return (
    <dialog className="modal" open>
      <div
        className={`modal-box flex flex-col ${
          isFullscreen
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'max-w-4xl max-h-[90vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-base-300 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 bg-base-200 rounded-lg shrink-0">
              <Icon icon={sourceTypeIcon} className="size-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold truncate">{filename}</h3>
              <div className="flex items-center gap-2 mt-1">
                {document.sourceType && (
                  <span className="badge badge-sm badge-outline">
                    {getSourceTypeDisplayName(document.sourceType)}
                  </span>
                )}
                {mimeType && (
                  <span className="text-xs text-base-content/60">
                    {mimeType}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="btn btn-sm btn-circle btn-ghost"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                <Icon
                  icon={
                    isFullscreen ? 'lucide--minimize-2' : 'lucide--maximize-2'
                  }
                  className="size-4"
                />
              </button>
            </Tooltip>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle btn-ghost"
              aria-label="Close"
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="shrink-0 border-b border-base-300">
          <div role="tablist" className="tabs tabs-border">
            <button
              role="tab"
              className={`tab gap-2 ${
                activeTab === 'properties' ? 'tab-active' : ''
              }`}
              onClick={() => setActiveTab('properties')}
            >
              <Icon icon="lucide--list" className="size-4" />
              Properties
            </button>
            <button
              role="tab"
              className={`tab gap-2 ${
                activeTab === 'content' ? 'tab-active' : ''
              }`}
              onClick={() => setActiveTab('content')}
            >
              <Icon icon="lucide--file-text" className="size-4" />
              Content
            </button>
            <button
              role="tab"
              className={`tab gap-2 ${
                activeTab === 'relationships' ? 'tab-active' : ''
              }`}
              onClick={() => setActiveTab('relationships')}
            >
              <Icon icon="lucide--git-branch" className="size-4" />
              Relationships
            </button>
            <button
              role="tab"
              className={`tab gap-2 ${
                activeTab === 'system' ? 'tab-active' : ''
              }`}
              onClick={() => setActiveTab('system')}
            >
              <Icon icon="lucide--info" className="size-4" />
              System Info
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto py-6">
          {/* Properties Tab */}
          {activeTab === 'properties' && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--file" className="size-5" />
                  Basic Information
                </h4>
                <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">Filename</span>
                    <span className="font-medium">{filename}</span>
                  </div>
                  {sourceUrl && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Source URL</span>
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="link link-primary truncate max-w-xs"
                      >
                        {sourceUrl}
                      </a>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">Type</span>
                    <span>
                      {originalMimeType && originalMimeType !== mimeType ? (
                        <span>
                          {originalMimeType}{' '}
                          <span className="text-base-content/50">
                            (converted to {mimeType})
                          </span>
                        </span>
                      ) : (
                        mimeType || '-'
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">File Size</span>
                    <span>{formatFileSize(document.fileSizeBytes)}</span>
                  </div>
                  {createdAt && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Created</span>
                      <span>{new Date(createdAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Processing Status */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--cpu" className="size-5" />
                  Processing Status
                </h4>
                <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">Chunks</span>
                    <span className="font-medium">{document.chunks || 0}</span>
                  </div>
                  {document.embeddedChunks !== undefined && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">
                        Embedded Chunks
                      </span>
                      <div className="flex items-center gap-2">
                        <progress
                          className="progress progress-primary w-20"
                          value={document.embeddedChunks}
                          max={document.chunks || 1}
                        />
                        <span>
                          {document.embeddedChunks}/{document.chunks}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">
                      Conversion Status
                    </span>
                    <span
                      className={`badge badge-sm ${
                        getConversionStatusBadge(document.conversionStatus)
                          .class
                      }`}
                    >
                      {
                        getConversionStatusBadge(document.conversionStatus)
                          .label
                      }
                    </span>
                  </div>
                  {document.conversionError && (
                    <div className="flex justify-between items-start text-sm">
                      <span className="text-base-content/70">
                        Conversion Error
                      </span>
                      <span className="text-error max-w-xs text-right">
                        {document.conversionError}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Extraction Status */}
              {document.extractionStatus && (
                <div>
                  <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                    <Icon
                      icon="lucide--sparkles"
                      className="size-5 text-primary"
                    />
                    Extraction
                  </h4>
                  <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Status</span>
                      <span
                        className={`badge badge-sm ${
                          document.extractionStatus === 'completed'
                            ? 'badge-success'
                            : document.extractionStatus === 'failed'
                            ? 'badge-error'
                            : 'badge-warning'
                        }`}
                      >
                        {document.extractionStatus}
                      </span>
                    </div>
                    {document.extractionObjectsCount !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-base-content/70">
                          Objects Created
                        </span>
                        <span className="font-medium">
                          {document.extractionObjectsCount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Email Details */}
              {emailMeta && (
                <div>
                  <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                    <Icon icon="lucide--mail" className="size-5" />
                    Email Details
                  </h4>
                  <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                    {emailMeta.subject && (
                      <div className="flex justify-between items-start text-sm">
                        <span className="text-base-content/70">Subject</span>
                        <span className="font-medium max-w-sm text-right">
                          {emailMeta.subject}
                        </span>
                      </div>
                    )}
                    {emailMeta.from && (
                      <div className="flex justify-between items-start text-sm">
                        <span className="text-base-content/70">From</span>
                        <span className="max-w-sm text-right">
                          {formatEmailAddresses(emailMeta.from)}
                        </span>
                      </div>
                    )}
                    {emailMeta.to && (
                      <div className="flex justify-between items-start text-sm">
                        <span className="text-base-content/70">To</span>
                        <span className="max-w-sm text-right">
                          {formatEmailAddresses(emailMeta.to)}
                        </span>
                      </div>
                    )}
                    {emailMeta.cc?.length > 0 && (
                      <div className="flex justify-between items-start text-sm">
                        <span className="text-base-content/70">CC</span>
                        <span className="max-w-sm text-right">
                          {formatEmailAddresses(emailMeta.cc)}
                        </span>
                      </div>
                    )}
                    {emailMeta.date && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-base-content/70">Date</span>
                        <span>{new Date(emailMeta.date).toLocaleString()}</span>
                      </div>
                    )}
                    {emailMeta.hasAttachments !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-base-content/70">
                          Attachments
                        </span>
                        <span>
                          {emailMeta.hasAttachments
                            ? `${emailMeta.attachmentCount || 'Yes'}`
                            : 'None'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content Tab */}
          {activeTab === 'content' && (
            <div>
              {loadingContent ? (
                <div className="flex justify-center items-center py-16">
                  <Spinner size="lg" />
                </div>
              ) : content ? (
                <pre className="bg-base-200 p-4 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto max-h-[60vh] overflow-y-auto">
                  {content}
                </pre>
              ) : (
                <div className="text-center py-16 text-base-content/60">
                  <Icon
                    icon="lucide--file-x"
                    className="size-12 mx-auto mb-2 opacity-50"
                  />
                  <p>No content available</p>
                </div>
              )}
            </div>
          )}

          {/* Relationships Tab */}
          {activeTab === 'relationships' && (
            <div className="space-y-6">
              {/* Parent Document */}
              {document.parentDocumentId && (
                <div>
                  <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                    <Icon icon="lucide--arrow-up" className="size-5" />
                    Parent Document
                  </h4>
                  <div className="bg-base-200/50 p-4 border border-base-300 rounded-lg">
                    {loadingParent ? (
                      <div className="flex items-center gap-2">
                        <Spinner size="sm" />
                        <span className="text-sm text-base-content/60">
                          Loading...
                        </span>
                      </div>
                    ) : parentDocument ? (
                      <button
                        onClick={() => handleDocumentNavigation(parentDocument)}
                        className="flex items-center gap-2 hover:bg-base-300 p-2 rounded transition-colors w-full text-left"
                      >
                        <Icon
                          icon={getSourceTypeIcon(
                            parentDocument.sourceType || 'upload'
                          )}
                          className="size-5 text-primary"
                        />
                        <span className="font-medium">
                          {parentDocument.filename ||
                            parentDocument.name ||
                            'Parent Document'}
                        </span>
                        {parentDocument.sourceType && (
                          <span className="badge badge-sm badge-ghost">
                            {getSourceTypeDisplayName(
                              parentDocument.sourceType
                            )}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="text-sm text-base-content/60">
                        Parent document not found
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Child Documents (Attachments) */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--paperclip" className="size-5" />
                  Attachments
                  {childDocuments.length > 0 && (
                    <span className="badge badge-sm badge-neutral">
                      {childDocuments.length}
                    </span>
                  )}
                </h4>
                <div className="bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  {loadingChildren ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="text-sm text-base-content/60">
                        Loading...
                      </span>
                    </div>
                  ) : childDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {childDocuments.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => handleDocumentNavigation(child)}
                          className="flex items-center gap-2 hover:bg-base-300 p-2 rounded transition-colors w-full text-left"
                        >
                          <Icon
                            icon={getSourceTypeIcon(
                              child.sourceType || 'upload'
                            )}
                            className="size-4 text-base-content/60"
                          />
                          <span className="text-sm">
                            {child.filename || child.name || 'Attachment'}
                          </span>
                          {child.mimeType && (
                            <span className="text-xs text-base-content/50">
                              {child.mimeType}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-base-content/60">
                      <Icon
                        icon="lucide--paperclip"
                        className="size-8 mx-auto mb-2 opacity-50"
                      />
                      <p className="text-sm">No attachments</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Extracted Objects */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--boxes" className="size-5" />
                  Extracted Objects
                  {extractedObjects.length > 0 && (
                    <span className="badge badge-sm badge-neutral">
                      {extractedObjects.length}
                    </span>
                  )}
                </h4>
                <div className="bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  {loadingObjects ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="text-sm text-base-content/60">
                        Loading...
                      </span>
                    </div>
                  ) : extractedObjects.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {extractedObjects.map((obj) => (
                        <button
                          key={obj.id}
                          onClick={() => handleObjectClick(obj.id)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-base-100 hover:bg-base-200 border border-base-300 rounded text-sm transition-colors"
                          title={`${obj.type} - ${obj.name}`}
                        >
                          <Icon
                            icon="lucide--box"
                            className="size-3 text-base-content/50"
                          />
                          <span className="truncate max-w-[150px]">
                            {obj.name}
                          </span>
                          <span className="badge badge-xs badge-ghost">
                            {obj.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-base-content/60">
                      <Icon
                        icon="lucide--box"
                        className="size-8 mx-auto mb-2 opacity-50"
                      />
                      <p className="text-sm">
                        No objects extracted from this document
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* System Info Tab */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              {/* Identifiers */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--fingerprint" className="size-5" />
                  Identifiers
                </h4>
                <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">Document ID</span>
                    <code className="bg-base-200 px-2 py-1 rounded text-xs">
                      {document.id}
                    </code>
                  </div>
                  {document.projectId && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Project ID</span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs">
                        {document.projectId}
                      </code>
                    </div>
                  )}
                  {document.externalSourceId && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">
                        External Source ID
                      </span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs truncate max-w-xs">
                        {document.externalSourceId}
                      </code>
                    </div>
                  )}
                  {document.dataSourceIntegrationId && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">
                        Integration ID
                      </span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs">
                        {document.dataSourceIntegrationId}
                      </code>
                    </div>
                  )}
                  {document.parentDocumentId && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">
                        Parent Document ID
                      </span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs">
                        {document.parentDocumentId}
                      </code>
                    </div>
                  )}
                </div>
              </div>

              {/* Storage */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--hard-drive" className="size-5" />
                  Storage
                </h4>
                <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  {document.storageKey && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Storage Key</span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs truncate max-w-xs">
                        {document.storageKey}
                      </code>
                    </div>
                  )}
                  {document.fileHash && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">File Hash</span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs truncate max-w-xs">
                        {document.fileHash}
                      </code>
                    </div>
                  )}
                  {document.contentHash && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Content Hash</span>
                      <code className="bg-base-200 px-2 py-1 rounded text-xs truncate max-w-xs">
                        {document.contentHash}
                      </code>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">File Size</span>
                    <span>{formatFileSize(document.fileSizeBytes)}</span>
                  </div>
                </div>
              </div>

              {/* Conversion Details */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--refresh-cw" className="size-5" />
                  Conversion Details
                </h4>
                <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-base-content/70">Status</span>
                    <span
                      className={`badge badge-sm ${
                        getConversionStatusBadge(document.conversionStatus)
                          .class
                      }`}
                    >
                      {
                        getConversionStatusBadge(document.conversionStatus)
                          .label
                      }
                    </span>
                  </div>
                  {document.conversionError && (
                    <div className="flex justify-between items-start text-sm">
                      <span className="text-base-content/70">Error</span>
                      <span className="text-error max-w-sm text-right text-xs">
                        {document.conversionError}
                      </span>
                    </div>
                  )}
                  {document.conversionCompletedAt && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Completed At</span>
                      <span>
                        {new Date(
                          document.conversionCompletedAt
                        ).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div>
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--clock" className="size-5" />
                  Timestamps
                </h4>
                <div className="space-y-2 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                  {createdAt && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Created At</span>
                      <span>{new Date(createdAt).toLocaleString()}</span>
                    </div>
                  )}
                  {updatedAt && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-base-content/70">Updated At</span>
                      <span>{new Date(updatedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {document.syncVersion !== undefined &&
                    document.syncVersion !== null && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-base-content/70">
                          Sync Version
                        </span>
                        <span>{document.syncVersion}</span>
                      </div>
                    )}
                </div>
              </div>

              {/* Raw Metadata (Collapsible) */}
              {document.metadata &&
                Object.keys(document.metadata).length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowRawMetadata(!showRawMetadata)}
                      className="flex items-center gap-2 mb-3 font-semibold text-lg hover:text-primary transition-colors"
                    >
                      <Icon
                        icon={
                          showRawMetadata
                            ? 'lucide--chevron-down'
                            : 'lucide--chevron-right'
                        }
                        className="size-5"
                      />
                      <Icon icon="lucide--code" className="size-5" />
                      Raw Metadata
                    </button>
                    {showRawMetadata && (
                      <pre className="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
                        {JSON.stringify(document.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

              {/* Raw Integration Metadata (Collapsible) */}
              {document.integrationMetadata &&
                Object.keys(document.integrationMetadata).length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setShowRawIntegrationMetadata(
                          !showRawIntegrationMetadata
                        )
                      }
                      className="flex items-center gap-2 mb-3 font-semibold text-lg hover:text-primary transition-colors"
                    >
                      <Icon
                        icon={
                          showRawIntegrationMetadata
                            ? 'lucide--chevron-down'
                            : 'lucide--chevron-right'
                        }
                        className="size-5"
                      />
                      <Icon icon="lucide--code" className="size-5" />
                      Integration Metadata
                    </button>
                    {showRawIntegrationMetadata && (
                      <pre className="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
                        {JSON.stringify(document.integrationMetadata, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onSubmit={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}
