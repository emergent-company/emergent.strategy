import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactElement,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { GraphObject } from '../ObjectBrowser/ObjectBrowser';
import { useApi } from '@/hooks/use-api';
import type {
  ObjectVersion,
  ObjectHistoryResponse,
} from '@/types/object-version';

interface GraphObjectResponse {
  id: string;
  key?: string | null;
  type: string;
  status?: string | null;
  description?: string;
  properties: Record<string, unknown>;
  labels: string[];
  external_id?: string;
  external_type?: string;
  created_at: string;
  embedding?: any | null;
  embedding_updated_at?: string | null;
}

export interface ObjectDetailModalProps {
  /** The object to display */
  object: GraphObject | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Called when delete is requested */
  onDelete?: (objectId: string) => void;
  /** Called when accept is requested */
  onAccept?: (objectId: string) => void;
}

/**
 * Modal that displays full details of a graph object, including all properties
 * and extraction metadata.
 */
export const ObjectDetailModal: React.FC<ObjectDetailModalProps> = ({
  object,
  isOpen,
  onClose,
  onDelete,
  onAccept,
}) => {
  const { fetchJson, apiBase } = useApi();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [relatedObjectGroups, setRelatedObjectGroups] = useState<
    { type: string; direction: 'in' | 'out'; objects: GraphObject[] }[]
  >([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [documentNames, setDocumentNames] = useState<Record<string, string>>(
    {}
  );

  // Sync dialog open state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  const fetchDocumentName = useCallback(
    async (docId: string) => {
      if (documentNames[docId]) return;
      try {
        const doc = await fetchJson<{ filename?: string; name?: string }>(
          `${apiBase}/api/documents/${docId}`
        );
        const name = doc.filename || doc.name || docId.substring(0, 8);
        setDocumentNames((prev) => ({ ...prev, [docId]: name }));
      } catch (e) {
        setDocumentNames((prev) => ({ ...prev, [docId]: 'Unknown Document' }));
      }
    },
    [apiBase, fetchJson, documentNames]
  );

  useEffect(() => {
    if (!object?.properties) return;
    const sourceId = object.properties._extraction_source_id as string;
    const sourceIds = object.properties._extraction_source_ids as string[];

    if (sourceId) fetchDocumentName(sourceId);
    if (sourceIds && Array.isArray(sourceIds)) {
      sourceIds.forEach((id) => fetchDocumentName(id));
    }
  }, [object, fetchDocumentName]);

  const loadRelatedObjects = useCallback(async () => {
    if (!object) return;

    setLoadingRelations(true);
    try {
      // 1. Fetch edges
      const edges = await fetchJson<
        Array<{
          id: string;
          type: string;
          src_id: string;
          dst_id: string;
          properties: any;
        }>
      >(`${apiBase}/api/graph/objects/${object.id}/edges?limit=100`);

      // 2. Collect IDs
      const relatedIds = new Set<string>();
      edges.forEach((edge) => {
        if (edge.src_id !== object.id) relatedIds.add(edge.src_id);
        if (edge.dst_id !== object.id) relatedIds.add(edge.dst_id);
      });

      if (relatedIds.size === 0) {
        setRelatedObjectGroups([]);
        setLoadingRelations(false);
        return;
      }

      // 3. Fetch objects
      const params = new URLSearchParams();
      params.append('ids', Array.from(relatedIds).join(','));
      params.append('limit', '100');

      const response = await fetchJson<{ items: GraphObjectResponse[] }>(
        `${apiBase}/api/graph/objects/search?${params}`
      );

      const objectMap = new Map<string, GraphObject>();
      response.items.forEach((obj) => {
        objectMap.set(obj.id, {
          id: obj.id,
          name:
            (obj.properties?.name as string) ||
            (obj.properties?.title as string) ||
            obj.key ||
            `${obj.type}-${obj.id.substring(0, 8)}`,
          type: obj.type,
          status: obj.status || undefined,
          source:
            obj.external_type ||
            (obj.properties?._extraction_source as string) ||
            undefined,
          updated_at: obj.created_at,
          relationship_count: undefined,
          properties: obj.properties,
          embedding: obj.embedding,
          embedding_updated_at: obj.embedding_updated_at,
        });
      });

      // 4. Group by type
      const groups = new Map<
        string,
        { type: string; direction: 'in' | 'out'; objects: GraphObject[] }
      >();

      edges.forEach((edge) => {
        const isOutgoing = edge.src_id === object.id;
        const relatedId = isOutgoing ? edge.dst_id : edge.src_id;
        const relatedObj = objectMap.get(relatedId);
        if (!relatedObj) return;

        const key = `${edge.type}-${isOutgoing ? 'out' : 'in'}`;
        if (!groups.has(key)) {
          groups.set(key, {
            type: edge.type,
            direction: isOutgoing ? 'out' : 'in',
            objects: [],
          });
        }
        const group = groups.get(key)!;
        if (!group.objects.find((o) => o.id === relatedObj.id)) {
          group.objects.push(relatedObj);
        }
      });

      setRelatedObjectGroups(Array.from(groups.values()));
    } catch (error) {
      console.error('Failed to load related objects:', error);
    } finally {
      setLoadingRelations(false);
    }
  }, [object, fetchJson, apiBase]);

  const loadVersionHistory = useCallback(async () => {
    if (!object) return;

    setLoadingVersions(true);
    setVersionsError(null);
    try {
      const data = await fetchJson<ObjectHistoryResponse>(
        `/api/graph/objects/${object.id}/history?limit=50`
      );
      setVersions(data.items || []);
    } catch (error) {
      console.error('Failed to load version history:', error);
      setVersionsError('Failed to load version history');
    } finally {
      setLoadingVersions(false);
    }
  }, [object, fetchJson]);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && object) {
      loadVersionHistory();
      loadRelatedObjects();
    } else {
      // Reset when modal closes
      setVersions([]);
      setVersionsError(null);
      setRelatedObjectGroups([]);
    }
  }, [isOpen, object, loadVersionHistory, loadRelatedObjects]);

  if (!object) return null;

  // Separate extraction metadata from regular properties
  const extractionMetadata: Record<string, unknown> = {};
  const regularProperties: Record<string, unknown> = {};

  if (object.properties) {
    Object.entries(object.properties).forEach(([key, value]) => {
      if (key.startsWith('_extraction_')) {
        extractionMetadata[key] = value;
      } else {
        regularProperties[key] = value;
      }
    });
  }

  const hasExtractionMetadata = Object.keys(extractionMetadata).length > 0;

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'number') return value.toString();
    return String(value);
  };

  const formatPropertyName = (key: string): string => {
    // Remove _extraction_ prefix
    const cleanKey = key.replace('_extraction_', '');
    // Convert snake_case to Title Case
    return cleanKey
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-success';
    if (confidence >= 0.6) return 'text-warning';
    return 'text-error';
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="flex flex-col max-w-4xl max-h-[90vh] modal-box p-0">
        {/* Header */}
        <div className="flex justify-between items-start p-6 pb-4 shrink-0">
          <div className="flex-1">
            <h3 className="mb-2 font-bold text-2xl">{object.name}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-primary badge-lg">
                {object.type}
              </span>
              {object.relationship_count !== undefined && (
                <span className="badge-outline badge badge-ghost">
                  <Icon icon="lucide--git-branch" className="mr-1 size-3" />
                  {object.relationship_count} relationships
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
            aria-label="Close"
          >
            <Icon icon="lucide--x" className="size-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Extraction Metadata Section */}
          {hasExtractionMetadata && (
            <div className="mb-6">
              <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                <Icon icon="lucide--sparkles" className="size-5 text-primary" />
                Extraction Metadata
              </h4>
              <div className="space-y-3 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                {/* Confidence Score - Highlighted */}
                {typeof extractionMetadata._extraction_confidence ===
                  'number' && (
                  <div className="flex justify-between items-center bg-base-100 p-3 rounded">
                    <span className="font-medium text-sm">
                      Confidence Score
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold text-lg ${getConfidenceColor(
                          extractionMetadata._extraction_confidence
                        )}`}
                      >
                        {(
                          extractionMetadata._extraction_confidence * 100
                        ).toFixed(1)}
                        %
                      </span>
                      <div className="w-24">
                        <progress
                          className={`progress ${
                            extractionMetadata._extraction_confidence >= 0.8
                              ? 'progress-success'
                              : extractionMetadata._extraction_confidence >= 0.6
                              ? 'progress-warning'
                              : 'progress-error'
                          }`}
                          value={
                            extractionMetadata._extraction_confidence * 100
                          }
                          max="100"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Source Documents */}
                {(typeof extractionMetadata._extraction_source_id ===
                  'string' ||
                  Array.isArray(extractionMetadata._extraction_source_ids)) && (
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-sm">Sources</span>
                    <div className="flex flex-col items-end gap-1">
                      {/* Handle single source (legacy) */}
                      {typeof extractionMetadata._extraction_source_id ===
                        'string' && (
                        <a
                          href={`/admin/apps/documents#${extractionMetadata._extraction_source_id}`}
                          className="flex items-center gap-2 transition-colors link hover:link-primary no-underline min-w-0"
                          onClick={(e) => e.stopPropagation()}
                          title="View source document"
                        >
                          <Icon
                            icon="lucide--file-text"
                            className="size-4 text-primary shrink-0"
                          />
                          <span className="text-sm truncate max-w-[200px]">
                            {documentNames[
                              extractionMetadata._extraction_source_id
                            ] || 'Loading...'}
                          </span>
                        </a>
                      )}
                      {/* Handle multiple sources */}
                      {Array.isArray(
                        extractionMetadata._extraction_source_ids
                      ) &&
                        extractionMetadata._extraction_source_ids.map(
                          (sourceId) => (
                            <a
                              key={sourceId as string}
                              href={`/admin/apps/documents#${sourceId}`}
                              className="flex items-center gap-2 transition-colors link hover:link-primary no-underline min-w-0"
                              onClick={(e) => e.stopPropagation()}
                              title={`View source document`}
                            >
                              <Icon
                                icon="lucide--file-text"
                                className="size-4 text-primary shrink-0"
                              />
                              <span className="text-sm truncate max-w-[200px]">
                                {documentNames[sourceId as string] ||
                                  'Loading...'}
                              </span>
                            </a>
                          )
                        )}
                    </div>
                  </div>
                )}

                {/* Extraction Job Link */}
                {typeof extractionMetadata._extraction_job_id === 'string' && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">Extraction Job</span>
                    <a
                      href={`/admin/extraction-jobs/${extractionMetadata._extraction_job_id}`}
                      className="gap-1 btn btn-sm btn-ghost"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Icon icon="lucide--zap" className="size-3" />
                      View Job
                    </a>
                  </div>
                )}

                {/* Other Extraction Metadata */}
                {Object.entries(extractionMetadata)
                  .filter(
                    ([key]) =>
                      !key.includes('confidence') &&
                      !key.includes('source_id') &&
                      !key.includes('source_ids') &&
                      !key.includes('job_id')
                  )
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between items-start">
                      <span className="font-medium text-sm">
                        {formatPropertyName(key)}
                      </span>
                      <span className="max-w-xs text-sm text-base-content/70 text-right truncate">
                        {formatValue(value)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Regular Properties Section */}
          {Object.keys(regularProperties).length > 0 && (
            <div className="mb-6">
              <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                <Icon icon="lucide--list" className="size-5" />
                Properties
              </h4>
              <div className="space-y-2">
                {Object.entries(regularProperties).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex sm:flex-row flex-col sm:items-start gap-2 bg-base-200/30 p-3 border border-base-300 rounded"
                  >
                    <span className="sm:min-w-40 font-medium text-sm text-base-content/80">
                      {formatPropertyName(key)}
                    </span>
                    <span className="flex-1 text-sm text-base-content/70 break-words">
                      {Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-1">
                          {value.map((item, idx) => (
                            <span
                              key={idx}
                              className="badge badge-sm badge-ghost"
                            >
                              {String(item)}
                            </span>
                          ))}
                        </div>
                      ) : typeof value === 'object' ? (
                        <pre className="bg-base-100 p-2 rounded overflow-x-auto text-xs">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : (
                        <span>{formatValue(value)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Objects Section */}
          {(relatedObjectGroups.length > 0 || loadingRelations) && (
            <div className="mb-6">
              <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                <Icon icon="lucide--network" className="size-5" />
                Related Objects
                {loadingRelations && (
                  <span className="loading loading-spinner loading-xs"></span>
                )}
              </h4>

              {relatedObjectGroups.map((group) => (
                <div
                  key={group.type + group.direction}
                  className="mb-4 last:mb-0"
                >
                  <div className="mb-2 font-bold text-xs text-base-content/50 uppercase">
                    {group.type.replace(/_/g, ' ')}{' '}
                    <span className="font-normal text-base-content/40 normal-case">
                      ({group.direction === 'out' ? 'Outgoing' : 'Incoming'})
                    </span>
                  </div>
                  <div className="gap-3 grid grid-cols-1 sm:grid-cols-2">
                    {group.objects.map((rel) => (
                      <div
                        key={rel.id}
                        className="bg-base-200 p-3 rounded border border-base-300"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="flex-1 font-medium truncate"
                            title={rel.name}
                          >
                            {rel.name}
                          </div>
                          <span className="badge badge-xs badge-ghost">
                            {rel.type}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-base-content/70">
                          <span>
                            {new Date(rel.updated_at).toLocaleDateString()}
                          </span>
                          {rel.status && (
                            <span
                              className={`badge badge-xs ${
                                rel.status === 'accepted'
                                  ? 'badge-success'
                                  : 'badge-ghost'
                              }`}
                            >
                              {rel.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* System Metadata */}
          <div className="mb-6">
            <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
              <Icon icon="lucide--info" className="size-5" />
              System Information
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-base-content/70">Object ID</span>
                <code className="bg-base-200 px-2 py-1 rounded text-xs">
                  {object.id}
                </code>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-base-content/70">Last Updated</span>
                <span className="text-base-content">
                  {new Date(object.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Embedding Status Section */}
          <div className="mb-6">
            <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
              <Icon icon="lucide--brain" className="size-5" />
              Embedding Status
            </h4>
            <div className="space-y-3 bg-base-200/50 p-4 border border-base-300 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">Status</span>
                {object.embedding ? (
                  <span className="gap-2 badge badge-success">
                    <Icon icon="lucide--check-circle" className="size-3" />
                    Embedded
                  </span>
                ) : (
                  <span className="gap-2 badge badge-ghost">
                    <Icon icon="lucide--circle" className="size-3" />
                    No Embedding
                  </span>
                )}
              </div>
              {object.embedding && object.embedding_updated_at && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-base-content/70">Generated At</span>
                  <span className="text-base-content">
                    {new Date(object.embedding_updated_at).toLocaleString()}
                  </span>
                </div>
              )}
              {!object.embedding && (
                <div className="text-sm text-base-content/60 italic">
                  This object has not been embedded yet. Embeddings are
                  generated automatically for semantic search.
                </div>
              )}
            </div>
          </div>

          {/* Version History */}
          <div className="mb-6">
            <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
              <Icon icon="lucide--history" className="size-5" />
              Version History
            </h4>

            {loadingVersions ? (
              <div className="flex justify-center p-4">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : versionsError ? (
              <div className="alert alert-error">
                <Icon icon="lucide--alert-circle" />
                <span>{versionsError}</span>
              </div>
            ) : versions.length > 1 ? (
              <div className="space-y-3">
                {versions.map(
                  (version, idx): ReactElement => (
                    <div
                      key={version.id}
                      className={`flex gap-3 p-3 rounded border ${
                        idx === 0
                          ? 'bg-primary/5 border-primary'
                          : 'bg-base-200 border-base-300'
                      }`}
                    >
                      {/* Version Indicator */}
                      <div className="flex flex-col items-center pt-1">
                        <div
                          className={`size-3 rounded-full ${
                            idx === 0 ? 'bg-primary' : 'bg-base-300'
                          }`}
                        />
                        {idx < versions.length - 1 && (
                          <div className="flex-1 bg-base-300 mt-1 w-px" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              Version {version.version}
                            </span>
                            {idx === 0 && (
                              <span className="badge badge-primary badge-sm">
                                Current
                              </span>
                            )}
                            {version.version === 1 && (
                              <span className="badge badge-ghost badge-sm">
                                Initial
                              </span>
                            )}
                            {version.deleted_at && (
                              <span className="badge badge-error badge-sm">
                                Deleted
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mb-2 text-xs text-base-content/70">
                          {new Date(version.created_at).toLocaleString()}
                        </div>

                        {/* Change Summary */}
                        {(() => {
                          const summary = version.change_summary;
                          if (!summary) return null;

                          const hasChanges =
                            (Array.isArray(summary.added) &&
                              summary.added.length > 0) ||
                            (Array.isArray(summary.modified) &&
                              summary.modified.length > 0) ||
                            (Array.isArray(summary.removed) &&
                              summary.removed.length > 0) ||
                            summary.reason;

                          if (!hasChanges) return null;

                          return (
                            <div className="space-y-1 mt-2">
                              {Array.isArray(summary.added) &&
                                summary.added.length > 0 && (
                                  <div className="flex flex-wrap gap-1 text-xs">
                                    <span className="font-medium text-success">
                                      Added:
                                    </span>
                                    {summary.added.map((field, i) => (
                                      <span
                                        key={i}
                                        className="gap-1 badge badge-success badge-sm"
                                      >
                                        <Icon
                                          icon="lucide--plus"
                                          className="size-2"
                                        />
                                        {String(field)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              {Array.isArray(summary.modified) &&
                                summary.modified.length > 0 && (
                                  <div className="flex flex-wrap gap-1 text-xs">
                                    <span className="font-medium text-info">
                                      Changed:
                                    </span>
                                    {summary.modified.map((field, i) => (
                                      <span
                                        key={i}
                                        className="gap-1 badge badge-info badge-sm"
                                      >
                                        <Icon
                                          icon="lucide--edit-2"
                                          className="size-2"
                                        />
                                        {String(field)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              {Array.isArray(summary.removed) &&
                                summary.removed.length > 0 && (
                                  <div className="flex flex-wrap gap-1 text-xs">
                                    <span className="font-medium text-error">
                                      Removed:
                                    </span>
                                    {summary.removed.map((field, i) => (
                                      <span
                                        key={i}
                                        className="gap-1 badge badge-error badge-sm"
                                      >
                                        <Icon
                                          icon="lucide--minus"
                                          className="size-2"
                                        />
                                        {String(field)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              {summary.reason && (
                                <p className="text-xs text-base-content/70 italic">
                                  {String(summary.reason)}
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Extraction Job Link */}
                        {(() => {
                          const props = version.properties;
                          if (!props || typeof props !== 'object') return null;
                          if (!('_extraction_job_id' in props)) return null;
                          const jobId = props._extraction_job_id;
                          if (!jobId) return null;

                          return (
                            <a
                              href={`/admin/extraction-jobs/${String(jobId)}`}
                              className="inline-flex gap-1 mt-2 btn btn-xs btn-ghost"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Icon icon="lucide--zap" className="size-2" />
                              From Extraction
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : versions.length === 1 ? (
              <p className="text-sm text-base-content/70">
                This is the initial version (no history yet)
              </p>
            ) : (
              <p className="text-sm text-base-content/70">
                No version history available
              </p>
            )}
          </div>
        </div>

        {/* Fixed Footer with Actions */}
        <div className="border-t border-base-300 p-6 pt-4 shrink-0">
          <div className="flex flex-wrap justify-end gap-2 mt-0">
            {onAccept && object && object.status !== 'accepted' && (
              <button
                className="gap-2 btn btn-success btn-sm"
                onClick={() => {
                  onAccept(object.id);
                }}
              >
                <Icon icon="lucide--check-circle" className="size-4" />
                Accept
              </button>
            )}
            <button className="gap-2 btn btn-ghost btn-sm" disabled>
              <Icon icon="lucide--edit" className="size-4" />
              Edit
            </button>
            <button className="gap-2 btn btn-ghost btn-sm" disabled>
              <Icon icon="lucide--git-branch" className="size-4" />
              View Graph
            </button>
            {onDelete && object && (
              <button
                className="gap-2 btn-outline btn btn-error btn-sm"
                onClick={() => {
                  onDelete(object.id);
                }}
              >
                <Icon icon="lucide--trash-2" className="size-4" />
                Delete
              </button>
            )}
            <button onClick={onClose} className="btn btn-primary btn-sm">
              Close
            </button>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default ObjectDetailModal;
