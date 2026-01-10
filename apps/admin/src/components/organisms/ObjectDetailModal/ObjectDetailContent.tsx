/**
 * ObjectDetailContent - Shared content component for object detail views
 *
 * This component contains all the core content logic (tabs, properties, relationships,
 * system info, history) that is shared between ObjectDetailModal and ObjectPreviewDrawer.
 *
 * Usage variants:
 * - Modal: Full features with refinement chat, actions, inline graph, fullscreen
 * - Drawer: Compact view without refinement chat, graph opens in modal
 */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactElement,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { GraphObject } from '../ObjectBrowser/ObjectBrowser';
import { TreeRelationshipGraph } from '../RelationshipGraph';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useDataUpdates } from '@/contexts/data-updates';
import { useSuperadmin } from '@/hooks/use-superadmin';
import type {
  ObjectVersion,
  ObjectHistoryResponse,
} from '@/types/object-version';
import type { TypeRegistryEntryDto } from '@/api/type-registry';

/** Tab names */
export type ObjectDetailTab =
  | 'properties'
  | 'relationships'
  | 'system'
  | 'history';

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

/** Variant-specific configuration */
export interface ObjectDetailContentVariant {
  /** Whether to show inline graph visualization (modal) or just "Open Graph" button (drawer) */
  showInlineGraph?: boolean;
  /** Whether to show embedding generation controls */
  showEmbeddingControls?: boolean;
  /** Whether to show fullscreen mode (for sizing calculations) */
  isFullscreen?: boolean;
  /** Whether graph minimap is enabled */
  showMinimap?: boolean;
  /** Compact mode - smaller text, tighter spacing (for drawer) */
  compact?: boolean;
}

export interface ObjectDetailContentProps {
  /** The object to display */
  object: GraphObject | null;
  /** Currently active tab */
  activeTab: ObjectDetailTab;
  /** Called when tab changes */
  onTabChange?: (tab: ObjectDetailTab) => void;
  /** Called when a related object is clicked (to open nested view or navigate) */
  onObjectClick?: (objectId: string) => void;
  /** Called when "Open Graph" is clicked (drawer variant) */
  onOpenGraph?: () => void;
  /** Variant-specific configuration */
  variant?: ObjectDetailContentVariant;
  /** Loading state (controlled externally for drawer, internal for modal) */
  loading?: boolean;
}

const defaultVariant: ObjectDetailContentVariant = {
  showInlineGraph: true,
  showEmbeddingControls: true,
  isFullscreen: false,
  showMinimap: false,
  compact: false,
};

/**
 * Shared content component for object detail views.
 * Contains tabs, properties, relationships, system info, and history.
 */
export const ObjectDetailContent: React.FC<ObjectDetailContentProps> = ({
  object,
  activeTab,
  onObjectClick,
  onOpenGraph,
  variant = defaultVariant,
  loading: externalLoading,
}) => {
  const { fetchJson, apiBase } = useApi();
  const { config } = useConfig();
  const { isSuperadmin } = useSuperadmin();

  const {
    showInlineGraph = true,
    showEmbeddingControls = true,
    isFullscreen = false,
    showMinimap = false,
    compact = false,
  } = variant;

  // Version history state
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  // Relationships state
  const [relatedObjectGroups, setRelatedObjectGroups] = useState<
    { type: string; direction: 'in' | 'out'; objects: GraphObject[] }[]
  >([]);
  const [loadingRelations, setLoadingRelations] = useState(false);

  // Document names cache
  const documentNamesCacheRef = useRef<Record<string, string>>({});
  const inFlightDocRequestsRef = useRef<Set<string>>(new Set());
  const [_docCacheVersion, setDocCacheVersion] = useState(0);

  // Loading state for clicking related objects
  const [loadingObjectName, setLoadingObjectName] = useState<string | null>(
    null
  );

  // Embedding state
  const [generatingEmbedding, setGeneratingEmbedding] = useState(false);
  const [embeddingMessage, setEmbeddingMessage] = useState<string | null>(null);
  const [embeddingJobStatus, setEmbeddingJobStatus] = useState<{
    status: 'pending' | 'processing' | 'failed';
    id?: string;
    error?: string;
  } | null>(null);

  // Entity type schema for tooltip
  const [entityTypeSchema, setEntityTypeSchema] =
    useState<TypeRegistryEntryDto | null>(null);

  // Fetch document name helper
  const fetchDocumentName = useCallback(
    async (docId: string) => {
      if (documentNamesCacheRef.current[docId]) return;
      if (inFlightDocRequestsRef.current.has(docId)) return;

      inFlightDocRequestsRef.current.add(docId);

      try {
        const doc = await fetchJson<{ filename?: string; name?: string }>(
          `${apiBase}/api/documents/${docId}`
        );
        const name = doc.filename || doc.name || docId.substring(0, 8);
        documentNamesCacheRef.current[docId] = name;
      } catch {
        documentNamesCacheRef.current[docId] = 'Unknown Document';
      } finally {
        inFlightDocRequestsRef.current.delete(docId);
      }
    },
    [apiBase, fetchJson]
  );

  // Batch fetch document names when object changes
  useEffect(() => {
    if (!object?.properties) return;

    const sourceIds: string[] = [];
    const sourceId = object.properties._extraction_source_id as string;
    const sourceIdArray = object.properties._extraction_source_ids as string[];

    if (sourceId) sourceIds.push(sourceId);
    if (sourceIdArray && Array.isArray(sourceIdArray)) {
      sourceIds.push(...sourceIdArray);
    }

    const idsToFetch = sourceIds.filter(
      (id) => !documentNamesCacheRef.current[id]
    );

    if (idsToFetch.length === 0) return;

    const fetchAll = async () => {
      await Promise.all(idsToFetch.map((id) => fetchDocumentName(id)));
      setDocCacheVersion((v) => v + 1);
    };

    fetchAll();
  }, [object, fetchDocumentName]);

  // Load related objects
  const loadRelatedObjects = useCallback(async () => {
    if (!object) return;

    setLoadingRelations(true);
    try {
      const edges = await fetchJson<
        Array<{
          id: string;
          type: string;
          src_id: string;
          dst_id: string;
          properties: any;
        }>
      >(`${apiBase}/api/graph/objects/${object.id}/edges?limit=100`);

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

  // Load version history
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

  // Handler to click a related object by ID
  const handleObjectIdClick = useCallback(
    async (objectId: string) => {
      if (objectId === object?.id) return;
      if (onObjectClick) {
        onObjectClick(objectId);
      }
    },
    [object?.id, onObjectClick]
  );

  // Handler to click a related object by name (searches for it first)
  const handleObjectNameClick = useCallback(
    async (objectName: string) => {
      setLoadingObjectName(objectName);
      try {
        const response = await fetchJson<{ items: GraphObjectResponse[] }>(
          `${apiBase}/api/graph/objects/search?key=${encodeURIComponent(
            objectName
          )}&limit=1`
        );

        if (response.items && response.items.length > 0 && onObjectClick) {
          onObjectClick(response.items[0].id);
        } else {
          console.warn(`Object with name "${objectName}" not found`);
        }
      } catch (error) {
        console.error('Failed to load object by name:', error);
      } finally {
        setLoadingObjectName(null);
      }
    },
    [fetchJson, apiBase, onObjectClick]
  );

  // Generate embedding
  const handleGenerateEmbedding = useCallback(async () => {
    if (!object) return;

    setGeneratingEmbedding(true);
    setEmbeddingMessage(null);

    try {
      const response = await fetchJson<{
        enqueued: number;
        skipped: number;
        jobIds: string[];
      }>(`${apiBase}/api/graph/embeddings/object/${object.id}`, {
        method: 'POST',
      });

      if (response.enqueued > 0) {
        setEmbeddingMessage(
          'Embedding generation job queued successfully! The embedding will be generated in the background.'
        );
      } else if (response.skipped > 0) {
        setEmbeddingMessage(
          'Embedding generation is already in progress for this object.'
        );
      }

      setTimeout(() => setEmbeddingMessage(null), 5000);
    } catch (error) {
      console.error('Failed to trigger embedding generation:', error);
      setEmbeddingMessage(
        'Failed to queue embedding generation. Please try again.'
      );
      setTimeout(() => setEmbeddingMessage(null), 5000);
    } finally {
      setGeneratingEmbedding(false);
    }
  }, [object, fetchJson, apiBase]);

  // Check embedding job status
  const checkEmbeddingJobStatus = useCallback(async () => {
    if (!object) return;

    try {
      const response = await fetchJson<{
        id: string;
        status: 'pending' | 'processing';
        object_id: string;
      }>(`${apiBase}/api/graph/embeddings/object/${object.id}/status`, {
        method: 'GET',
        suppressErrorLog: true,
      });

      setEmbeddingJobStatus({
        status: response.status,
        id: response.id,
      });
    } catch (error: any) {
      if (error.status === 404) {
        setEmbeddingJobStatus(null);
      }
    }
  }, [object, fetchJson, apiBase]);

  // Subscribe to real-time embedding status updates via SSE
  useDataUpdates(
    object ? `graph_object:${object.id}` : 'graph_object:_none_',
    (event) => {
      if (event.type === 'entity.updated' && event.data) {
        const {
          embeddingStatus,
          embeddingError,
          hasEmbedding,
          embeddingJobId,
        } = event.data as {
          embeddingStatus?: 'processing' | 'completed' | 'failed';
          embeddingError?: string;
          hasEmbedding?: boolean;
          embeddingJobId?: string;
        };

        if (embeddingStatus === 'processing') {
          setEmbeddingJobStatus({
            status: 'processing',
            id: embeddingJobId,
          });
        } else if (embeddingStatus === 'completed' || hasEmbedding) {
          setEmbeddingJobStatus(null);
          setEmbeddingMessage('Embedding generation completed successfully!');
          setTimeout(() => setEmbeddingMessage(null), 5000);
        } else if (embeddingStatus === 'failed') {
          setEmbeddingJobStatus({
            status: 'failed',
            error: embeddingError,
          });
          setEmbeddingMessage(
            `Embedding generation failed: ${embeddingError || 'Unknown error'}`
          );
          setTimeout(() => setEmbeddingMessage(null), 5000);
        }
      }
    },
    [object?.id]
  );

  // Initial embedding job status check
  useEffect(() => {
    if (!object || object.embedding) {
      setEmbeddingJobStatus(null);
      return;
    }
    checkEmbeddingJobStatus();
  }, [object, checkEmbeddingJobStatus]);

  // Load data when object changes
  useEffect(() => {
    if (object) {
      loadVersionHistory();
      loadRelatedObjects();
    } else {
      setVersions([]);
      setVersionsError(null);
      setRelatedObjectGroups([]);
    }
  }, [object, loadVersionHistory, loadRelatedObjects]);

  // Fetch entity type schema
  useEffect(() => {
    if (!object?.type || !config.activeProjectId) {
      setEntityTypeSchema(null);
      return;
    }

    const fetchTypeSchema = async () => {
      try {
        const schema = await fetchJson<TypeRegistryEntryDto>(
          `${apiBase}/api/type-registry/projects/${
            config.activeProjectId
          }/types/${encodeURIComponent(object.type)}`
        );
        setEntityTypeSchema(schema);
      } catch {
        setEntityTypeSchema(null);
      }
    };

    fetchTypeSchema();
  }, [object?.type, config.activeProjectId, apiBase, fetchJson]);

  // Render entity type tooltip content (for future use in modal variant)
  const _renderEntityTypeTooltip = useMemo(() => {
    if (!entityTypeSchema) return null;

    const {
      description,
      json_schema,
      source,
      template_pack_name,
      outgoing_relationships,
      incoming_relationships,
    } = entityTypeSchema;

    const properties = json_schema?.properties || {};
    const required = json_schema?.required || [];
    const propertyEntries = Object.entries(properties).filter(
      ([key]) => !key.startsWith('_')
    );

    const hasOutgoing =
      outgoing_relationships && outgoing_relationships.length > 0;
    const hasIncoming =
      incoming_relationships && incoming_relationships.length > 0;
    const hasRelationships = hasOutgoing || hasIncoming;
    const hasProperties = propertyEntries.length > 0;

    return (
      <div className="text-sm">
        {description && (
          <p className="mb-2 text-neutral-content">{description}</p>
        )}

        <div className="flex items-center gap-2 mb-2 text-xs text-neutral-content/70">
          <span className="badge badge-xs badge-ghost">{source}</span>
          {template_pack_name && (
            <span className="truncate">{template_pack_name}</span>
          )}
        </div>

        {(hasProperties || hasRelationships) && (
          <div className="flex gap-6 border-t border-neutral-content/20 pt-2">
            {hasProperties && (
              <div className="shrink-0">
                <div className="mb-1 font-medium text-neutral-content/80 text-xs uppercase">
                  Properties
                </div>
                <div className="space-y-1">
                  {propertyEntries.map(([key, prop]: [string, any]) => (
                    <div
                      key={key}
                      className="flex items-start gap-2 text-xs text-neutral-content/70"
                    >
                      <span className="font-mono text-neutral-content whitespace-nowrap">
                        {key}
                        {required.includes(key) && (
                          <span className="text-warning ml-0.5">*</span>
                        )}
                      </span>
                      <span className="text-neutral-content/50 whitespace-nowrap">
                        {prop.type || 'any'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasRelationships && (
              <div className="shrink-0">
                <div className="mb-1 font-medium text-neutral-content/80 text-xs uppercase">
                  Relationships
                </div>
                <div className="space-y-2">
                  {hasOutgoing && (
                    <div>
                      <div className="text-xs text-neutral-content/60 mb-1">
                        Outgoing
                      </div>
                      <div className="space-y-1">
                        {outgoing_relationships!.map((rel) => (
                          <div
                            key={rel.type}
                            className="flex items-start gap-2 text-xs text-neutral-content/70"
                          >
                            <span className="font-mono text-neutral-content whitespace-nowrap">
                              {rel.label || rel.type}
                            </span>
                            <span className="text-neutral-content/50 whitespace-nowrap">
                              {rel.target_types?.join(', ') || 'any'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasIncoming && (
                    <div>
                      <div className="text-xs text-neutral-content/60 mb-1">
                        Incoming
                      </div>
                      <div className="space-y-1">
                        {incoming_relationships!.map((rel) => (
                          <div
                            key={rel.type}
                            className="flex items-start gap-2 text-xs text-neutral-content/70"
                          >
                            <span className="font-mono text-neutral-content whitespace-nowrap">
                              {rel.inverse_label || rel.label || rel.type}
                            </span>
                            <span className="text-neutral-content/50 whitespace-nowrap">
                              {rel.source_types?.join(', ') || 'any'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [entityTypeSchema]);

  // Show loading state
  if (externalLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  if (!object) return null;

  // Separate extraction metadata and regular properties
  const extractionMetadata: Record<string, unknown> = {};
  const regularProperties: Record<string, unknown> = {};

  const relationshipKeys = [
    'witnesses',
    'performer',
    'participants',
    'parties',
    'participants_canonical_ids',
  ];

  if (object.properties) {
    Object.entries(object.properties).forEach(([key, value]) => {
      if (key.startsWith('_extraction_')) {
        extractionMetadata[key] = value;
      } else if (key.startsWith('_')) {
        // Skip system properties
      } else if (!relationshipKeys.includes(key)) {
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

  const tryParseNDJSON = (value: string): object[] | null => {
    if (typeof value !== 'string') return null;
    const lines = value.trim().split('\n');
    if (lines.length < 1) return null;

    try {
      const parsed = lines.map((line) => JSON.parse(line.trim()));
      if (parsed.every((item) => typeof item === 'object' && item !== null)) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  };

  const renderSourceReference = (
    ref: { snippet?: string; reference?: string },
    idx: number
  ) => (
    <div
      key={idx}
      className="bg-base-100 border border-base-300 rounded p-3 mb-2"
    >
      {ref.reference && (
        <div className="text-xs font-semibold text-primary mb-1">
          {ref.reference}
        </div>
      )}
      {ref.snippet && (
        <div className="text-sm text-base-content/80 italic">
          &ldquo;{ref.snippet}&rdquo;
        </div>
      )}
    </div>
  );

  const renderPropertyValue = (_key: string, value: unknown) => {
    if (Array.isArray(value)) {
      const isSourceRefs = value.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          ('snippet' in item || 'reference' in item)
      );
      if (isSourceRefs && value.length > 0) {
        return (
          <div className="space-y-1">
            {value.map((item, idx) =>
              renderSourceReference(
                item as { snippet?: string; reference?: string },
                idx
              )
            )}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, idx) => (
            <span key={idx} className="badge badge-sm badge-ghost">
              {typeof item === 'object' && item !== null
                ? JSON.stringify(item)
                : String(item)}
            </span>
          ))}
        </div>
      );
    }

    if (typeof value === 'object' && value !== null) {
      if ('snippet' in value || 'reference' in value) {
        return renderSourceReference(
          value as { snippet?: string; reference?: string },
          0
        );
      }
      return (
        <pre className="bg-base-100 p-2 rounded overflow-x-auto text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    if (typeof value === 'string') {
      const ndjson = tryParseNDJSON(value);
      if (ndjson) {
        const isSourceRefs = ndjson.every(
          (item) => 'snippet' in item || 'reference' in item
        );
        if (isSourceRefs) {
          return (
            <div className="space-y-1">
              {ndjson.map((item, idx) =>
                renderSourceReference(
                  item as { snippet?: string; reference?: string },
                  idx
                )
              )}
            </div>
          );
        }
        return (
          <pre className="bg-base-100 p-2 rounded overflow-x-auto text-xs">
            {JSON.stringify(ndjson, null, 2)}
          </pre>
        );
      }
    }

    return <span>{formatValue(value)}</span>;
  };

  const formatPropertyName = (key: string): string => {
    const cleanKey = key.replace('_extraction_', '');
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

  // Sizing based on variant
  const headingSize = compact ? 'text-sm' : 'text-lg';
  const spacing = compact ? 'space-y-3' : 'space-y-6';
  const padding = compact ? 'p-3' : 'p-4';

  return (
    <div className={spacing}>
      {/* Properties Tab */}
      {activeTab === 'properties' && (
        <div className={spacing}>
          {Object.keys(regularProperties).length > 0 && (
            <div>
              <h4
                className={`flex items-center gap-2 mb-3 font-semibold ${headingSize}`}
              >
                <Icon
                  icon="lucide--list"
                  className={compact ? 'size-4' : 'size-5'}
                />
                Properties
              </h4>
              <div className="space-y-2">
                {Object.entries(regularProperties).map(([key, value]) => (
                  <div
                    key={key}
                    className={`flex sm:flex-row flex-col sm:items-start gap-2 bg-base-200/30 ${padding} border border-base-300 rounded`}
                  >
                    <span
                      className={`sm:min-w-40 font-medium ${
                        compact ? 'text-xs' : 'text-sm'
                      } text-base-content/80`}
                    >
                      {formatPropertyName(key)}
                    </span>
                    <span
                      className={`flex-1 ${
                        compact ? 'text-xs' : 'text-sm'
                      } text-base-content/70 break-words`}
                    >
                      {renderPropertyValue(key, value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(regularProperties).length === 0 && (
            <div className="text-center py-8 text-base-content/60">
              <Icon
                icon="lucide--file-question"
                className={`${
                  compact ? 'size-10' : 'size-12'
                } mx-auto mb-2 opacity-50`}
              />
              <p className={compact ? 'text-sm' : ''}>
                No properties defined for this object.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Relationships Tab */}
      {activeTab === 'relationships' && (
        <div className={spacing}>
          {/* Graph Header (shown when inline graph is enabled) */}
          {showInlineGraph && (
            <div className="flex items-center justify-between">
              <h4
                className={`flex items-center gap-2 font-semibold ${headingSize}`}
              >
                <Icon
                  icon="lucide--git-branch"
                  className={compact ? 'size-4' : 'size-5'}
                />
                Relationship Graph
              </h4>
            </div>
          )}

          {/* Inline Graph Visualization (modal variant) */}
          {showInlineGraph && (
            <div
              className="bg-base-200/30 border border-base-300 rounded-lg overflow-hidden"
              style={{ height: isFullscreen ? 'calc(100vh - 400px)' : '450px' }}
            >
              <TreeRelationshipGraph
                objectId={object.id}
                onNodeDoubleClick={handleObjectIdClick}
                initialDepth={1}
                showMinimap={showMinimap}
                edgeStyle="orthogonal"
              />
            </div>
          )}

          {/* Open Graph Button (drawer variant) */}
          {!showInlineGraph && onOpenGraph && (
            <button
              type="button"
              className="btn btn-primary btn-sm w-full gap-2"
              onClick={onOpenGraph}
            >
              <Icon icon="lucide--maximize-2" className="size-4" />
              Open Graph View
            </button>
          )}

          {/* Relationship Groups */}
          <div>
            <h4
              className={`flex items-center gap-2 mb-3 font-semibold ${headingSize}`}
            >
              <Icon
                icon="lucide--network"
                className={compact ? 'size-4' : 'size-5'}
              />
              Relationships by Type
              {loadingRelations && <Spinner size="xs" />}
            </h4>

            {relatedObjectGroups.length > 0 ? (
              <div className="space-y-3">
                {relatedObjectGroups.map((group) => (
                  <div
                    key={group.type + group.direction}
                    className="bg-base-200/30 border border-base-300 rounded-lg overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-2 bg-base-200/50 border-b border-base-300">
                      <div className="flex items-center gap-2">
                        <Icon
                          icon={
                            group.direction === 'out'
                              ? 'lucide--arrow-right'
                              : 'lucide--arrow-left'
                          }
                          className={`${
                            compact ? 'size-3.5' : 'size-4'
                          } text-base-content/50`}
                        />
                        <span
                          className={`font-medium ${compact ? 'text-sm' : ''}`}
                        >
                          {group.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-base-content/50">
                          ({group.direction === 'out' ? 'outgoing' : 'incoming'}
                          )
                        </span>
                      </div>
                      <span className="badge badge-sm badge-neutral">
                        {group.objects.length}
                      </span>
                    </div>

                    {group.objects.length > 0 && (
                      <div className={compact ? 'p-2' : 'p-3'}>
                        <div className="flex flex-wrap gap-2">
                          {group.objects.map((rel) => (
                            <button
                              key={rel.id}
                              onClick={() => handleObjectNameClick(rel.name)}
                              disabled={loadingObjectName === rel.name}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 bg-base-100 hover:bg-base-200 border border-base-300 rounded ${
                                compact ? 'text-xs' : 'text-sm'
                              } transition-colors disabled:opacity-50`}
                              title={`${rel.type} - ${rel.name}`}
                            >
                              {loadingObjectName === rel.name ? (
                                <Spinner size="xs" />
                              ) : (
                                <Icon
                                  icon="lucide--box"
                                  className="size-3 text-base-content/50"
                                />
                              )}
                              <span
                                className={`truncate ${
                                  compact ? 'max-w-[120px]' : 'max-w-[150px]'
                                }`}
                              >
                                {rel.name}
                              </span>
                              <span className="badge badge-xs badge-ghost">
                                {rel.type}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : !loadingRelations ? (
              <div className="text-center py-6 text-base-content/60 bg-base-200/30 border border-base-300 rounded-lg">
                <Icon
                  icon="lucide--unlink"
                  className={`${
                    compact ? 'size-8' : 'size-10'
                  } mx-auto mb-2 opacity-50`}
                />
                <p className={compact ? 'text-sm' : ''}>
                  No relationships found for this object.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* System Info Tab */}
      {activeTab === 'system' && (
        <div className={spacing}>
          {/* Extraction Metadata */}
          {hasExtractionMetadata && (
            <div>
              <h4
                className={`flex items-center gap-2 mb-3 font-semibold ${headingSize}`}
              >
                <Icon
                  icon="lucide--sparkles"
                  className={`${compact ? 'size-4' : 'size-5'} text-primary`}
                />
                Extraction Metadata
              </h4>
              <div
                className={`space-y-3 bg-base-200/50 ${padding} border border-base-300 rounded-lg`}
              >
                {/* Confidence Score */}
                {typeof extractionMetadata._extraction_confidence ===
                  'number' && (
                  <div className="flex justify-between items-center bg-base-100 p-3 rounded">
                    <span
                      className={`font-medium ${
                        compact ? 'text-xs' : 'text-sm'
                      }`}
                    >
                      Confidence Score
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold ${
                          compact ? 'text-base' : 'text-lg'
                        } ${getConfidenceColor(
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
                    <span
                      className={`font-medium ${
                        compact ? 'text-xs' : 'text-sm'
                      }`}
                    >
                      Sources
                    </span>
                    <div className="flex flex-col items-end gap-1">
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
                            className={`${
                              compact ? 'size-3' : 'size-4'
                            } text-primary shrink-0`}
                          />
                          <span
                            className={`${
                              compact ? 'text-xs' : 'text-sm'
                            } truncate max-w-[200px]`}
                          >
                            {documentNamesCacheRef.current[
                              extractionMetadata._extraction_source_id
                            ] || 'Loading...'}
                          </span>
                        </a>
                      )}
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
                              title="View source document"
                            >
                              <Icon
                                icon="lucide--file-text"
                                className={`${
                                  compact ? 'size-3' : 'size-4'
                                } text-primary shrink-0`}
                              />
                              <span
                                className={`${
                                  compact ? 'text-xs' : 'text-sm'
                                } truncate max-w-[200px]`}
                              >
                                {documentNamesCacheRef.current[
                                  sourceId as string
                                ] || 'Loading...'}
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
                    <span
                      className={`font-medium ${
                        compact ? 'text-xs' : 'text-sm'
                      }`}
                    >
                      Extraction Job
                    </span>
                    {isSuperadmin ? (
                      <a
                        href={`/admin/superadmin/jobs/extraction?jobId=${extractionMetadata._extraction_job_id}`}
                        className="gap-1 btn btn-sm btn-ghost"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Icon icon="lucide--zap" className="size-3" />
                        View Job
                      </a>
                    ) : (
                      <code className="bg-base-200 px-2 py-1 rounded text-xs">
                        {extractionMetadata._extraction_job_id}
                      </code>
                    )}
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
                      <span
                        className={`font-medium ${
                          compact ? 'text-xs' : 'text-sm'
                        }`}
                      >
                        {formatPropertyName(key)}
                      </span>
                      <span
                        className={`max-w-xs ${
                          compact ? 'text-xs' : 'text-sm'
                        } text-base-content/70 text-right truncate`}
                      >
                        {formatValue(value)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* System Metadata */}
          <div>
            <h4
              className={`flex items-center gap-2 mb-3 font-semibold ${headingSize}`}
            >
              <Icon
                icon="lucide--info"
                className={compact ? 'size-4' : 'size-5'}
              />
              System Information
            </h4>
            <div className="space-y-2">
              <div
                className={`flex justify-between items-center ${
                  compact ? 'text-xs' : 'text-sm'
                }`}
              >
                <span className="text-base-content/70">Object ID</span>
                <code className="bg-base-200 px-2 py-1 rounded text-xs">
                  {object.id}
                </code>
              </div>
              <div
                className={`flex justify-between items-center ${
                  compact ? 'text-xs' : 'text-sm'
                }`}
              >
                <span className="text-base-content/70">Last Updated</span>
                <span className="text-base-content">
                  {new Date(object.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Embedding Status Section */}
          {showEmbeddingControls && (
            <div>
              <h4
                className={`flex items-center gap-2 mb-3 font-semibold ${headingSize}`}
              >
                <Icon
                  icon="lucide--brain"
                  className={compact ? 'size-4' : 'size-5'}
                />
                Embedding Status
              </h4>
              <div
                className={`space-y-3 bg-base-200/50 ${padding} border border-base-300 rounded-lg`}
              >
                <div className="flex justify-between items-center">
                  <span
                    className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}
                  >
                    Status
                  </span>
                  {object.embedding ? (
                    <span className="gap-2 badge badge-success">
                      <Icon icon="lucide--check-circle" className="size-3" />
                      Embedded
                    </span>
                  ) : embeddingJobStatus ? (
                    <span className="gap-2 badge badge-warning">
                      <Spinner size="xs" />
                      {embeddingJobStatus.status === 'pending'
                        ? 'Queued'
                        : 'Generating...'}
                    </span>
                  ) : (
                    <span className="gap-2 badge badge-ghost">
                      <Icon icon="lucide--circle" className="size-3" />
                      No Embedding
                    </span>
                  )}
                </div>
                {object.embedding && object.embedding_updated_at && (
                  <div
                    className={`flex justify-between items-center ${
                      compact ? 'text-xs' : 'text-sm'
                    }`}
                  >
                    <span className="text-base-content/70">Generated At</span>
                    <span className="text-base-content">
                      {new Date(object.embedding_updated_at).toLocaleString()}
                    </span>
                  </div>
                )}
                {!object.embedding && !embeddingJobStatus && (
                  <div
                    className={`${
                      compact ? 'text-xs' : 'text-sm'
                    } text-base-content/60 italic`}
                  >
                    This object has not been embedded yet. Embeddings are
                    generated automatically for semantic search.
                  </div>
                )}
                {!object.embedding && embeddingJobStatus && (
                  <div
                    className={`${
                      compact ? 'text-xs' : 'text-sm'
                    } text-base-content/60 italic`}
                  >
                    Embedding generation is in progress. This usually takes a
                    few seconds.
                  </div>
                )}
                {embeddingMessage && (
                  <div
                    className={`alert ${
                      embeddingMessage.includes('Failed')
                        ? 'alert-error'
                        : 'alert-success'
                    } text-sm py-2`}
                  >
                    <Icon
                      icon={
                        embeddingMessage.includes('Failed')
                          ? 'lucide--alert-circle'
                          : 'lucide--check-circle'
                      }
                      className="size-4"
                    />
                    <span>{embeddingMessage}</span>
                  </div>
                )}
                {!object.embedding && !embeddingJobStatus && (
                  <button
                    className="btn btn-sm btn-primary gap-2 w-full"
                    onClick={handleGenerateEmbedding}
                    disabled={generatingEmbedding}
                  >
                    {generatingEmbedding ? (
                      <>
                        <Spinner size="xs" />
                        Queueing...
                      </>
                    ) : (
                      <>
                        <Icon icon="lucide--sparkles" className="size-4" />
                        Generate Embedding
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className={spacing}>
          <h4
            className={`flex items-center gap-2 mb-3 font-semibold ${headingSize}`}
          >
            <Icon
              icon="lucide--history"
              className={compact ? 'size-4' : 'size-5'}
            />
            Version History
          </h4>

          {loadingVersions ? (
            <div className="flex justify-center p-4">
              <Spinner size="md" />
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
                    className={`flex gap-3 ${
                      compact ? 'p-2' : 'p-3'
                    } rounded border ${
                      idx === 0
                        ? 'bg-primary/5 border-primary'
                        : 'bg-base-200 border-base-300'
                    }`}
                  >
                    <div className="flex flex-col items-center pt-1">
                      <div
                        className={`${
                          compact ? 'size-2.5' : 'size-3'
                        } rounded-full ${
                          idx === 0 ? 'bg-primary' : 'bg-base-300'
                        }`}
                      />
                      {idx < versions.length - 1 && (
                        <div className="flex-1 bg-base-300 mt-1 w-px" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-semibold ${
                              compact ? 'text-sm' : ''
                            }`}
                          >
                            Version {version.version}
                          </span>
                          {idx === 0 && (
                            <span
                              className={`badge badge-primary ${
                                compact ? 'badge-xs' : 'badge-sm'
                              }`}
                            >
                              Current
                            </span>
                          )}
                          {version.version === 1 && (
                            <span
                              className={`badge badge-ghost ${
                                compact ? 'badge-xs' : 'badge-sm'
                              }`}
                            >
                              Initial
                            </span>
                          )}
                          {version.deleted_at && (
                            <span
                              className={`badge badge-error ${
                                compact ? 'badge-xs' : 'badge-sm'
                              }`}
                            >
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

                        return isSuperadmin ? (
                          <a
                            href={`/admin/superadmin/jobs/extraction?jobId=${String(
                              jobId
                            )}`}
                            className="inline-flex gap-1 mt-2 btn btn-xs btn-ghost"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Icon icon="lucide--zap" className="size-2" />
                            From Extraction
                          </a>
                        ) : (
                          <span className="inline-flex gap-1 mt-2 text-xs text-base-content/60">
                            <Icon icon="lucide--zap" className="size-2" />
                            From Extraction
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : versions.length === 1 ? (
            <p className={`${compact ? 'text-sm' : ''} text-base-content/70`}>
              This is the initial version (no history yet)
            </p>
          ) : (
            <p className={`${compact ? 'text-sm' : ''} text-base-content/70`}>
              No version history available
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ObjectDetailContent;
