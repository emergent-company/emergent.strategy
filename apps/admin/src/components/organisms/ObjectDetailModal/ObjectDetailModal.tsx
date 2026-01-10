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
import { Tooltip } from '@/components/atoms/Tooltip';
import { GraphObject } from '../ObjectBrowser/ObjectBrowser';
import { TreeRelationshipGraph } from '../RelationshipGraph';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useDataUpdates } from '@/contexts/data-updates';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { ObjectRefinementChat } from './ObjectRefinementChat';
import type {
  ObjectVersion,
  ObjectHistoryResponse,
} from '@/types/object-version';
import type { TypeRegistryEntryDto } from '@/api/type-registry';

/** Tab names for the modal */
type ModalTab = 'properties' | 'relationships' | 'system' | 'history';

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
  /** Called when the object is updated (e.g., via refinement chat) */
  onObjectUpdated?: (objectId: string) => void;
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
  onObjectUpdated,
}) => {
  const { fetchJson, apiBase } = useApi();
  const { config } = useConfig();
  const { isSuperadmin } = useSuperadmin();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Tab and fullscreen state
  const [activeTab, setActiveTab] = useState<ModalTab>('properties');
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Default to hidden on mobile (< 1024px), visible on larger screens
  const [showRefinementChat, setShowRefinementChat] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [relatedObjectGroups, setRelatedObjectGroups] = useState<
    { type: string; direction: 'in' | 'out'; objects: GraphObject[] }[]
  >([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  // Use refs for document names cache to prevent re-render loops
  const documentNamesCacheRef = useRef<Record<string, string>>({});
  const inFlightDocRequestsRef = useRef<Set<string>>(new Set());
  // Counter to trigger re-render when cache is updated
  const [docCacheVersion, setDocCacheVersion] = useState(0);
  const [loadingObjectName, setLoadingObjectName] = useState<string | null>(
    null
  );
  const [nestedObject, setNestedObject] = useState<GraphObject | null>(null);
  const [showNestedModal, setShowNestedModal] = useState(false);
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
      // Check cache first (using ref, no re-render trigger)
      if (documentNamesCacheRef.current[docId]) return;

      // Skip if already in-flight
      if (inFlightDocRequestsRef.current.has(docId)) return;

      // Mark as in-flight
      inFlightDocRequestsRef.current.add(docId);

      try {
        const doc = await fetchJson<{ filename?: string; name?: string }>(
          `${apiBase}/api/documents/${docId}`
        );
        const name = doc.filename || doc.name || docId.substring(0, 8);
        documentNamesCacheRef.current[docId] = name;
      } catch (e) {
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

    // Filter out already-cached IDs
    const idsToFetch = sourceIds.filter(
      (id) => !documentNamesCacheRef.current[id]
    );

    if (idsToFetch.length === 0) return;

    const fetchAll = async () => {
      await Promise.all(idsToFetch.map((id) => fetchDocumentName(id)));
      // Trigger single re-render after all fetches complete
      setDocCacheVersion((v) => v + 1);
    };

    fetchAll();
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

  // Handler to search for an object by name and open its detail modal
  const handleObjectNameClick = useCallback(
    async (objectName: string) => {
      setLoadingObjectName(objectName);
      try {
        // Search for object by name
        const response = await fetchJson<{ items: GraphObjectResponse[] }>(
          `${apiBase}/api/graph/objects/search?key=${encodeURIComponent(
            objectName
          )}&limit=1`
        );

        if (response.items && response.items.length > 0) {
          const obj = response.items[0];
          setNestedObject({
            id: obj.id,
            name:
              (obj.properties?.name as string) ||
              obj.key ||
              `${obj.type}-${obj.id.substring(0, 8)}`,
            type: obj.type,
            status: obj.status || undefined,
            source: obj.external_type || undefined,
            updated_at: obj.created_at,
            relationship_count: undefined,
            properties: obj.properties,
            embedding: obj.embedding,
            embedding_updated_at: obj.embedding_updated_at,
          });
          setShowNestedModal(true);
        } else {
          console.warn(`Object with name "${objectName}" not found`);
        }
      } catch (error) {
        console.error('Failed to load object by name:', error);
      } finally {
        setLoadingObjectName(null);
      }
    },
    [fetchJson, apiBase]
  );

  // Handler to fetch an object by ID and open its detail modal (used by graph node double-click)
  const handleObjectIdClick = useCallback(
    async (objectId: string) => {
      // Don't open nested modal for the current object
      if (objectId === object?.id) return;

      try {
        const obj = await fetchJson<GraphObjectResponse>(
          `${apiBase}/api/graph/objects/${objectId}`
        );

        setNestedObject({
          id: obj.id,
          name:
            (obj.properties?.name as string) ||
            obj.key ||
            `${obj.type}-${obj.id.substring(0, 8)}`,
          type: obj.type,
          status: obj.status || undefined,
          source: obj.external_type || undefined,
          updated_at: obj.created_at,
          relationship_count: undefined,
          properties: obj.properties,
          embedding: obj.embedding,
          embedding_updated_at: obj.embedding_updated_at,
        });
        setShowNestedModal(true);
      } catch (error) {
        console.error('Failed to load object by ID:', error);
      }
    },
    [fetchJson, apiBase, object?.id]
  );

  // Function to trigger embedding generation
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

      // Clear message after 5 seconds
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

  // Function to check embedding job status (one-time check on modal open)
  const checkEmbeddingJobStatus = useCallback(async () => {
    if (!object) return;

    try {
      const response = await fetchJson<{
        id: string;
        status: 'pending' | 'processing';
        object_id: string;
      }>(`${apiBase}/api/graph/embeddings/object/${object.id}/status`, {
        method: 'GET',
        // Suppress 404 logging - expected when no active job exists
        suppressErrorLog: true,
      });

      setEmbeddingJobStatus({
        status: response.status,
        id: response.id,
      });
    } catch (error: any) {
      // 404 means no active job - clear status
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
          // Embedding job started processing
          setEmbeddingJobStatus({
            status: 'processing',
            id: embeddingJobId,
          });
        } else if (embeddingStatus === 'completed' || hasEmbedding) {
          // Embedding completed successfully
          setEmbeddingJobStatus(null);
          setEmbeddingMessage('Embedding generation completed successfully!');
          setTimeout(() => setEmbeddingMessage(null), 5000);
        } else if (embeddingStatus === 'failed') {
          // Embedding failed
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

  // Initial embedding job status check when modal opens (one-time, no polling)
  useEffect(() => {
    if (!isOpen || !object || object.embedding) {
      // Clear status if modal closed, no object, or embedding exists
      setEmbeddingJobStatus(null);
      return;
    }

    // Check immediately on mount (one-time check)
    checkEmbeddingJobStatus();
  }, [isOpen, object, checkEmbeddingJobStatus]);

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
      // Reset tab and fullscreen state
      setActiveTab('properties');
      setIsFullscreen(false);
    }
  }, [isOpen, object, loadVersionHistory, loadRelatedObjects]);

  // Fetch entity type schema for tooltip when object type changes
  useEffect(() => {
    if (!isOpen || !object?.type || !config.activeProjectId) {
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
        // Silently fail - tooltip just won't show schema info
        setEntityTypeSchema(null);
      }
    };

    fetchTypeSchema();
  }, [isOpen, object?.type, config.activeProjectId, apiBase, fetchJson]);

  // Render tooltip content for entity type schema (must be before early return)
  const renderEntityTypeTooltip = useMemo(() => {
    if (!entityTypeSchema) return null;

    const {
      description,
      json_schema,
      source,
      template_pack_name,
      outgoing_relationships,
      incoming_relationships,
    } = entityTypeSchema;

    // Extract property info from JSON schema, filtering out underscore-prefixed properties
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
        {/* Description */}
        {description && (
          <p className="mb-2 text-neutral-content">{description}</p>
        )}

        {/* Source info */}
        <div className="flex items-center gap-2 mb-2 text-xs text-neutral-content/70">
          <span className="badge badge-xs badge-ghost">{source}</span>
          {template_pack_name && (
            <span className="truncate">{template_pack_name}</span>
          )}
        </div>

        {/* Two-column layout for Properties and Relationships */}
        {(hasProperties || hasRelationships) && (
          <div className="flex gap-6 border-t border-neutral-content/20 pt-2">
            {/* Properties Column */}
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

            {/* Relationships Column */}
            {hasRelationships && (
              <div className="shrink-0">
                <div className="mb-1 font-medium text-neutral-content/80 text-xs uppercase">
                  Relationships
                </div>
                <div className="space-y-2">
                  {/* Outgoing relationships */}
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

                  {/* Incoming relationships */}
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

  if (!object) return null;

  // Separate extraction metadata and system properties from regular properties
  const extractionMetadata: Record<string, unknown> = {};
  const regularProperties: Record<string, unknown> = {};

  // Relationship property keys to exclude from regular properties display
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
        // Skip all other underscore-prefixed properties (system/internal like _mergeHistory)
        // These are shown in history view, not in properties
      } else if (!relationshipKeys.includes(key)) {
        // Exclude relationship properties from regular properties
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

  /**
   * Try to parse a string as NDJSON (newline-delimited JSON objects)
   * Returns array of parsed objects if successful, null otherwise
   */
  const tryParseNDJSON = (value: string): object[] | null => {
    if (typeof value !== 'string') return null;
    const lines = value.trim().split('\n');
    if (lines.length < 1) return null;

    try {
      const parsed = lines.map((line) => JSON.parse(line.trim()));
      // Verify all items are objects
      if (parsed.every((item) => typeof item === 'object' && item !== null)) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  };

  /**
   * Render a source reference object nicely
   */
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

  /**
   * Render a property value with smart formatting
   */
  const renderPropertyValue = (key: string, value: unknown) => {
    // Handle arrays
    if (Array.isArray(value)) {
      // Check if it's an array of source references
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
      // Regular array
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

    // Handle objects
    if (typeof value === 'object' && value !== null) {
      // Check if it's a source reference object
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

    // Handle strings that might be NDJSON
    if (typeof value === 'string') {
      const ndjson = tryParseNDJSON(value);
      if (ndjson) {
        // Check if it's source references
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
        // Generic NDJSON - render as formatted JSON array
        return (
          <pre className="bg-base-100 p-2 rounded overflow-x-auto text-xs">
            {JSON.stringify(ndjson, null, 2)}
          </pre>
        );
      }
    }

    // Default string/number/other
    return <span>{formatValue(value)}</span>;
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
      <div
        className={`flex modal-box p-0 transition-all duration-300 ${
          isFullscreen
            ? 'w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh]'
            : showRefinementChat
            ? 'w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh]'
            : 'w-[80vw] max-w-5xl h-[90vh] max-h-[90vh]'
        }`}
      >
        {/* Left Column - Object Details */}
        <div
          className={`flex flex-col ${
            showRefinementChat ? 'flex-1 min-w-0' : 'w-full'
          }`}
        >
          {/* Header */}
          <div className="flex justify-between items-start p-6 pb-4 shrink-0">
            <div className="flex-1">
              <h3 className="mb-2 font-bold text-2xl">{object.name}</h3>
              <div className="flex flex-wrap items-center gap-2">
                {renderEntityTypeTooltip ? (
                  <Tooltip
                    content={renderEntityTypeTooltip}
                    placement="bottom"
                    align="start"
                  >
                    <span className="badge badge-primary badge-lg cursor-help">
                      {object.type}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="badge badge-primary badge-lg">
                    {object.type}
                  </span>
                )}
                {object.relationship_count !== undefined && (
                  <span className="badge-outline badge badge-ghost">
                    <Icon icon="lucide--git-branch" className="mr-1 size-3" />
                    {object.relationship_count} relationships
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Refinement Chat Toggle */}
              <button
                onClick={() => setShowRefinementChat(!showRefinementChat)}
                className={`btn btn-sm btn-circle ${
                  showRefinementChat ? 'btn-primary' : 'btn-ghost'
                }`}
                aria-label={
                  showRefinementChat
                    ? 'Hide refinement chat'
                    : 'Show refinement chat'
                }
                title={
                  showRefinementChat
                    ? 'Hide refinement chat'
                    : 'Show refinement chat'
                }
              >
                <Icon icon="lucide--sparkles" className="size-4" />
              </button>
              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="btn btn-sm btn-circle btn-ghost"
                aria-label={
                  isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                }
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                <Icon
                  icon={
                    isFullscreen ? 'lucide--minimize-2' : 'lucide--maximize-2'
                  }
                  className="size-4"
                />
              </button>
              {/* Close Button */}
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
          <div className="px-6 shrink-0 border-b border-base-300">
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
              <button
                role="tab"
                className={`tab gap-2 ${
                  activeTab === 'history' ? 'tab-active' : ''
                }`}
                onClick={() => setActiveTab('history')}
              >
                <Icon icon="lucide--history" className="size-4" />
                History
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Properties Tab */}
            {activeTab === 'properties' && (
              <div className="space-y-6">
                {/* Regular Properties Section */}
                {Object.keys(regularProperties).length > 0 && (
                  <div>
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
                            {renderPropertyValue(key, value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state for properties */}
                {Object.keys(regularProperties).length === 0 && (
                  <div className="text-center py-8 text-base-content/60">
                    <Icon
                      icon="lucide--file-question"
                      className="size-12 mx-auto mb-2 opacity-50"
                    />
                    <p>No properties defined for this object.</p>
                  </div>
                )}
              </div>
            )}

            {/* Relationships Tab */}
            {activeTab === 'relationships' && (
              <div className="space-y-6">
                {/* Graph Layout Toggle */}
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-semibold text-lg">
                    <Icon icon="lucide--git-branch" className="size-5" />
                    Relationship Graph
                  </h4>
                </div>

                {/* Interactive Graph Visualization */}
                <div
                  className="bg-base-200/30 border border-base-300 rounded-lg overflow-hidden"
                  style={{
                    height: isFullscreen ? 'calc(100vh - 400px)' : '450px',
                  }}
                >
                  <TreeRelationshipGraph
                    objectId={object.id}
                    onNodeDoubleClick={handleObjectIdClick}
                    initialDepth={1}
                    showMinimap={isFullscreen}
                    edgeStyle="orthogonal"
                  />
                </div>

                {/* Relationship Groups Section */}
                <div>
                  <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                    <Icon icon="lucide--network" className="size-5" />
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
                          {/* Group Header */}
                          <div className="flex items-center justify-between px-4 py-2 bg-base-200/50 border-b border-base-300">
                            <div className="flex items-center gap-2">
                              <Icon
                                icon={
                                  group.direction === 'out'
                                    ? 'lucide--arrow-right'
                                    : 'lucide--arrow-left'
                                }
                                className="size-4 text-base-content/50"
                              />
                              <span className="font-medium text-sm">
                                {group.type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs text-base-content/50">
                                (
                                {group.direction === 'out'
                                  ? 'outgoing'
                                  : 'incoming'}
                                )
                              </span>
                            </div>
                            <span className="badge badge-sm badge-neutral">
                              {group.objects.length}
                            </span>
                          </div>

                          {/* Group Objects */}
                          {group.objects.length > 0 && (
                            <div className="p-3">
                              <div className="flex flex-wrap gap-2">
                                {group.objects.map((rel) => (
                                  <button
                                    key={rel.id}
                                    onClick={() =>
                                      handleObjectNameClick(rel.name)
                                    }
                                    disabled={loadingObjectName === rel.name}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-base-100 hover:bg-base-200 border border-base-300 rounded text-sm transition-colors disabled:opacity-50"
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
                                    <span className="truncate max-w-[150px]">
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
                        className="size-10 mx-auto mb-2 opacity-50"
                      />
                      <p className="text-sm">
                        No relationships found for this object.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* System Info Tab */}
            {activeTab === 'system' && (
              <div className="space-y-6">
                {/* Extraction Metadata Section */}
                {hasExtractionMetadata && (
                  <div>
                    <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                      <Icon
                        icon="lucide--sparkles"
                        className="size-5 text-primary"
                      />
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
                                  extractionMetadata._extraction_confidence >=
                                  0.8
                                    ? 'progress-success'
                                    : extractionMetadata._extraction_confidence >=
                                      0.6
                                    ? 'progress-warning'
                                    : 'progress-error'
                                }`}
                                value={
                                  extractionMetadata._extraction_confidence *
                                  100
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
                        Array.isArray(
                          extractionMetadata._extraction_source_ids
                        )) && (
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
                                  {documentNamesCacheRef.current[
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
                      {typeof extractionMetadata._extraction_job_id ===
                        'string' && (
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">
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
                          <div
                            key={key}
                            className="flex justify-between items-start"
                          >
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

                {/* System Metadata */}
                <div>
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
                <div>
                  <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                    <Icon icon="lucide--brain" className="size-5" />
                    Embedding Status
                  </h4>
                  <div className="space-y-3 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">Status</span>
                      {object.embedding ? (
                        <span className="gap-2 badge badge-success">
                          <Icon
                            icon="lucide--check-circle"
                            className="size-3"
                          />
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
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-base-content/70">
                          Generated At
                        </span>
                        <span className="text-base-content">
                          {new Date(
                            object.embedding_updated_at
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {!object.embedding && !embeddingJobStatus && (
                      <div className="text-sm text-base-content/60 italic">
                        This object has not been embedded yet. Embeddings are
                        generated automatically for semantic search.
                      </div>
                    )}
                    {!object.embedding && embeddingJobStatus && (
                      <div className="text-sm text-base-content/60 italic">
                        Embedding generation is in progress. This usually takes
                        a few seconds. The status will update automatically when
                        complete.
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
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                  <Icon icon="lucide--history" className="size-5" />
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
                              if (!props || typeof props !== 'object')
                                return null;
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
                  <p className="text-sm text-base-content/70">
                    This is the initial version (no history yet)
                  </p>
                ) : (
                  <p className="text-sm text-base-content/70">
                    No version history available
                  </p>
                )}
              </div>
            )}
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
        {/* End Left Column */}

        {/* Right Column - Refinement Chat (50% width) */}
        {showRefinementChat && object && (
          <div className="flex flex-col w-1/2 border-l border-base-300 shrink-0">
            <ObjectRefinementChat
              objectId={object.id}
              objectName={object.name}
              onObjectUpdated={() => {
                // Refresh object data - trigger re-fetch of relationships and versions
                loadRelatedObjects();
                loadVersionHistory();
                // Notify parent to refresh object data
                if (onObjectUpdated) {
                  onObjectUpdated(object.id);
                }
              }}
            />
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button type="button">close</button>
      </form>

      {/* Nested modal for viewing related objects */}
      {nestedObject && (
        <ObjectDetailModal
          object={nestedObject}
          isOpen={showNestedModal}
          onClose={() => {
            setShowNestedModal(false);
            setNestedObject(null);
          }}
        />
      )}
    </dialog>
  );
};

export default ObjectDetailModal;
