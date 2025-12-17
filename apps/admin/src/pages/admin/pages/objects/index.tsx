// Page: Object Browser
// Route: /admin/objects

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layouts';
import { ObjectDetailModal } from '@/components/organisms/ObjectDetailModal';
import {
  DataTable,
  type ColumnDef,
  type FilterConfig,
  type BulkAction,
  type TableDataItem,
  type SelectionContext,
} from '@/components/organisms/DataTable';
import { Icon } from '@/components/atoms/Icon';
import {
  createUserActivityClient,
  createRecordActivityFn,
} from '@/api/user-activity';
import {
  createExtractionJobsClient,
  type ExtractionJob,
} from '@/api/extraction-jobs';

interface GraphObjectResponse {
  id: string;
  key?: string | null; // Graph objects use 'key' not 'name'
  type: string;
  status?: string | null; // Object status: 'accepted', 'draft', 'rejected', etc.
  description?: string;
  properties: Record<string, unknown>;
  labels: string[];
  external_id?: string;
  external_type?: string;
  created_at: string;
  embedding?: any | null;
  embedding_updated_at?: string | null;
  relationship_count?: number;
  // Note: No updated_at in graph_objects table
}

interface GraphObject extends TableDataItem {
  name: string;
  type: string;
  source?: string;
  source_id?: string;
  status?: string;
  updated_at: string;
  relationship_count?: number;
  properties?: Record<string, unknown>;
  embedding?: any | null;
  embedding_updated_at?: string | null;
}

const transformObject = (obj: GraphObjectResponse): GraphObject => ({
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
  source_id: (obj.properties?._extraction_source_id as string) || undefined,
  updated_at: obj.created_at, // Use created_at as updated_at
  relationship_count: obj.relationship_count || 0,
  properties: obj.properties || {},
  embedding: obj.embedding,
  embedding_updated_at: obj.embedding_updated_at,
});

// Helper to format relative time (e.g., "3 minutes ago")
const formatRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
};

// Helper to get extraction job filename
const getExtractionFilename = (job: ExtractionJob): string => {
  return (
    (job.source_metadata?.filename as string) ||
    (job.source_metadata?.name as string) ||
    `Extraction ${job.id.substring(0, 8)}`
  );
};

// Helper to format extraction job label for dropdown (used in trigger button)
const formatExtractionLabel = (job: ExtractionJob): string => {
  const filename = getExtractionFilename(job);
  const relativeTime = formatRelativeTime(job.created_at);
  return `${filename} - ${relativeTime}`;
};

export default function ObjectsPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const objectIdParam = searchParams.get('id');

  // Activity tracking client for Recent Items feature
  const activityClient = createUserActivityClient(apiBase, fetchJson);
  const recordActivity = createRecordActivityFn(activityClient);

  const [objects, setObjects] = useState<GraphObject[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedObject, setSelectedObject] = useState<GraphObject | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Use refs for document names cache to prevent re-render loops
  const documentNamesCacheRef = useRef<Record<string, string>>({});
  const inFlightRequestsRef = useRef<Set<string>>(new Set());
  // Counter to trigger re-render when cache is updated
  const [cacheVersion, setCacheVersion] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  // Extraction filter state
  const extractionJobIdParam = searchParams.get('extraction_job_id');
  const [extractionJobs, setExtractionJobs] = useState<ExtractionJob[]>([]);
  const [selectedExtractionJobId, setSelectedExtractionJobId] = useState<
    string | null
  >(extractionJobIdParam);
  const [extractionDropdownOpen, setExtractionDropdownOpen] = useState(false);
  const extractionDropdownRef = useRef<HTMLDivElement>(null);

  // Create extraction jobs client
  const extractionJobsClient = useMemo(
    () =>
      createExtractionJobsClient(apiBase, fetchJson, config.activeProjectId),
    [apiBase, fetchJson, config.activeProjectId]
  );

  const loadObjects = useCallback(async () => {
    if (!config.activeProjectId) return;

    setLoading(true);
    setError(null);
    setNextCursor(undefined);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (searchQuery) {
        // Use full-text search if there's a search query
        params.append('q', searchQuery);
        params.append('limit', '100');
        // Include type filter in FTS search
        if (selectedTypes.length > 0) {
          params.append('type', selectedTypes[0]);
        }

        const response = await fetchJson<{
          query: string;
          items: GraphObjectResponse[];
          total: number;
          limit: number;
        }>(`${apiBase}/api/graph/objects/fts?${params}`);

        // Transform API response to component format
        const transformedObjects: GraphObject[] =
          response.items.map(transformObject);

        setObjects(transformedObjects);
        setTotalCount(response.total);
        setHasMore(false); // FTS doesn't support pagination yet
      } else {
        // Use regular search without text query
        if (selectedTypes.length > 0) {
          // For now, just use the first type (API doesn't support multiple types in one call)
          params.append('type', selectedTypes[0]);
        }
        // Add extraction job filter if selected
        if (selectedExtractionJobId) {
          params.append('extraction_job_id', selectedExtractionJobId);
        }
        params.append('limit', '100');
        params.append('order', 'desc'); // Get newest first

        const response = await fetchJson<{
          items: GraphObjectResponse[];
          next_cursor?: string;
          total?: number;
        }>(`${apiBase}/api/graph/objects/search?${params}`);

        // Transform API response to component format
        const transformedObjects: GraphObject[] =
          response.items.map(transformObject);

        setObjects(transformedObjects);
        setTotalCount(response.total || transformedObjects.length);
        setNextCursor(response.next_cursor);
        setHasMore(!!response.next_cursor);
      }
    } catch (err) {
      console.error('Failed to load objects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load objects');
    } finally {
      setLoading(false);
    }
  }, [
    config.activeProjectId,
    searchQuery,
    selectedTypes,
    selectedExtractionJobId,
    apiBase,
    fetchJson,
  ]);

  const loadMore = useCallback(async () => {
    if (!config.activeProjectId || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedTypes.length > 0) {
        params.append('type', selectedTypes[0]);
      }
      // Add extraction job filter if selected
      if (selectedExtractionJobId) {
        params.append('extraction_job_id', selectedExtractionJobId);
      }
      params.append('limit', '100');
      params.append('order', 'desc');
      params.append('cursor', nextCursor);

      const response = await fetchJson<{
        items: GraphObjectResponse[];
        next_cursor?: string;
        total?: number;
      }>(`${apiBase}/api/graph/objects/search?${params}`);

      // Transform and append to existing objects
      const transformedObjects: GraphObject[] =
        response.items.map(transformObject);

      setObjects((prev) => [...prev, ...transformedObjects]);
      setNextCursor(response.next_cursor);
      setHasMore(!!response.next_cursor);
    } catch (err) {
      console.error('Failed to load more objects:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load more objects'
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    config.activeProjectId,
    nextCursor,
    selectedTypes,
    selectedExtractionJobId,
    apiBase,
    fetchJson,
    loadingMore,
  ]);

  // Handle URL object ID param
  useEffect(() => {
    if (!objectIdParam || !config.activeProjectId) return;

    const handleLoad = async () => {
      // Check if object is already in the loaded list
      const existing = objects.find((o) => o.id === objectIdParam);
      if (existing) {
        setSelectedObject(existing);
        setIsModalOpen(true);
        return;
      }

      // Otherwise fetch it specifically
      try {
        const response = await fetchJson<GraphObjectResponse>(
          `${apiBase}/api/graph/objects/${objectIdParam}`
        );
        const obj = transformObject(response);
        setSelectedObject(obj);
        setIsModalOpen(true);
      } catch (err) {
        console.error('Failed to fetch object from URL:', err);
        showToast({
          message:
            err instanceof Error
              ? err.message
              : 'Failed to load object details from URL',
          variant: 'error',
        });
      }
    };

    handleLoad();
  }, [
    objectIdParam,
    config.activeProjectId,
    apiBase,
    fetchJson,
    showToast,
    objects,
  ]);

  const loadAvailableTypes = useCallback(async () => {
    if (!config.activeProjectId) return;

    try {
      const types = await fetchJson<Array<{ type: string; source: string }>>(
        `${apiBase}/api/type-registry/projects/${config.activeProjectId}`
      );
      // Extract unique type names
      const typeNames = [...new Set(types.map((t) => t.type))];
      setAvailableTypes(typeNames);
    } catch (err) {
      console.error('Failed to load types:', err);
    }
  }, [config.activeProjectId, apiBase, fetchJson]);

  const loadAvailableTags = useCallback(async () => {
    if (!config.activeProjectId) return;

    try {
      const tags = await fetchJson<string[]>(
        `${apiBase}/api/graph/objects/tags`
      );
      setAvailableTags(tags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, [config.activeProjectId, apiBase, fetchJson]);

  const fetchDocumentName = useCallback(
    async (documentId: string) => {
      // Check cache first (using ref, no re-render trigger)
      if (documentNamesCacheRef.current[documentId]) {
        return documentNamesCacheRef.current[documentId];
      }

      // Skip if already in-flight
      if (inFlightRequestsRef.current.has(documentId)) {
        return null;
      }

      // Mark as in-flight
      inFlightRequestsRef.current.add(documentId);

      try {
        const doc = await fetchJson<{
          id: string;
          filename?: string;
          name?: string;
        }>(`${apiBase}/api/documents/${documentId}`);
        const name = doc.filename || doc.name || documentId.substring(0, 8);

        // Update cache (ref, no re-render)
        documentNamesCacheRef.current[documentId] = name;

        return name;
      } catch (err) {
        console.error(`Failed to fetch document name for ${documentId}:`, err);
        const fallback = documentId.substring(0, 8) + '...';
        documentNamesCacheRef.current[documentId] = fallback;
        return fallback;
      } finally {
        // Remove from in-flight
        inFlightRequestsRef.current.delete(documentId);
      }
    },
    [apiBase, fetchJson]
  );

  // Batch fetch document names when objects change
  useEffect(() => {
    const documentIds = objects
      .filter((obj) => obj.source === 'document' && obj.source_id)
      .map((obj) => obj.source_id as string)
      .filter((id) => !documentNamesCacheRef.current[id]);

    if (documentIds.length === 0) return;

    // Deduplicate
    const uniqueIds = [...new Set(documentIds)];

    // Batch fetch (sequentially to avoid overwhelming the server, but could be parallel with limit)
    const fetchAll = async () => {
      const BATCH_SIZE = 10;
      for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((id) => fetchDocumentName(id)));
      }
      // Trigger single re-render after all fetches complete
      setCacheVersion((v) => v + 1);
    };

    fetchAll();
  }, [objects, fetchDocumentName]);

  useEffect(() => {
    loadAvailableTypes();
    loadAvailableTags();
  }, [loadAvailableTypes, loadAvailableTags]);

  // Load extraction jobs for filter dropdown
  useEffect(() => {
    if (!config.activeProjectId) return;

    const loadExtractionJobs = async () => {
      try {
        const response = await extractionJobsClient.listJobs(
          config.activeProjectId,
          { limit: 100 }
        );
        // Sort by created_at descending (newest first)
        const sorted = [...response.jobs].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setExtractionJobs(sorted);
      } catch (err) {
        console.error('Failed to load extraction jobs:', err);
      }
    };

    loadExtractionJobs();
  }, [config.activeProjectId, extractionJobsClient]);

  // Handle click outside extraction dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        extractionDropdownOpen &&
        extractionDropdownRef.current &&
        !extractionDropdownRef.current.contains(event.target as Node)
      ) {
        setExtractionDropdownOpen(false);
      }
    };

    if (extractionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [extractionDropdownOpen]);

  // Compute available statuses from loaded objects
  useEffect(() => {
    const statuses = new Set<string>();
    objects.forEach((obj) => {
      if (obj.status) {
        statuses.add(obj.status);
      }
    });
    // Sort statuses in a logical order
    const orderedStatuses = ['accepted', 'draft', 'rejected'].filter((s) =>
      statuses.has(s)
    );
    // Add any other statuses that might exist
    statuses.forEach((s) => {
      if (!orderedStatuses.includes(s)) {
        orderedStatuses.push(s);
      }
    });
    setAvailableStatuses(orderedStatuses);
  }, [objects]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  const handleObjectClick = (object: GraphObject) => {
    setSelectedObject(object);
    setIsModalOpen(true);
    // Record activity for Recent Items feature (fire-and-forget)
    recordActivity({
      resourceType: 'object',
      resourceId: object.id,
      resourceName: object.name || undefined,
      resourceSubtype: object.type || undefined,
      actionType: 'viewed',
    });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    // Clear URL param if it exists
    if (objectIdParam) {
      setSearchParams({});
    }
    // Small delay before clearing to avoid flicker
    setTimeout(() => setSelectedObject(null), 300);
  };

  const handleGenerateEmbedding = async (objectId: string) => {
    if (!config.activeProjectId) return;

    try {
      const response = await fetchJson<{
        enqueued: number;
        skipped: number;
        jobIds: string[];
      }>(`${apiBase}/api/graph/embeddings/object/${objectId}`, {
        method: 'POST',
      });

      if (response.enqueued > 0) {
        showToast({
          variant: 'success',
          message: 'Embedding generation job queued successfully!',
        });
      } else if (response.skipped > 0) {
        showToast({
          variant: 'info',
          message:
            'Embedding generation is already in progress for this object.',
        });
      }
    } catch (err) {
      console.error('Failed to generate embedding:', err);
      showToast({
        variant: 'error',
        message: 'Failed to queue embedding generation. Please try again.',
      });
    }
  };

  const handleDelete = async (objectId: string) => {
    if (!config.activeProjectId) return;

    if (
      !confirm(
        'Are you sure you want to delete this object? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await fetchJson(`${apiBase}/api/graph/objects/${objectId}`, {
        method: 'DELETE',
      });

      // Reload objects after deletion
      await loadObjects();

      // Close modal if it was open
      if (isModalOpen && selectedObject?.id === objectId) {
        handleModalClose();
      }
    } catch (err) {
      console.error('Failed to delete object:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete object');
    }
  };

  const handleBulkDelete = async (context: SelectionContext<GraphObject>) => {
    if (!config.activeProjectId) return;

    const isAllMode = context.mode === 'all';
    const count = isAllMode
      ? context.totalCount || 0
      : context.selectedIds.length;

    if (count === 0) return;

    const confirmMessage = isAllMode
      ? `Are you sure you want to delete ALL ${count.toLocaleString()} objects? This action cannot be undone.`
      : `Are you sure you want to delete ${count} object(s)? This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      let idsToDelete = context.selectedIds;

      // If "all" mode, we need to fetch all matching object IDs first
      // TODO: Replace with server-side filter-based bulk delete once available
      if (isAllMode) {
        showToast({
          variant: 'info',
          message: `Fetching all ${count.toLocaleString()} object IDs...`,
        });

        // Fetch all object IDs with current filters
        const params = new URLSearchParams();
        if (selectedTypes.length > 0) {
          params.append('type', selectedTypes[0]);
        }
        if (selectedExtractionJobId) {
          params.append('extraction_job_id', selectedExtractionJobId);
        }
        params.append('limit', '10000'); // Fetch up to 10k at a time
        params.append('order', 'desc');

        const allIds: string[] = [];
        let cursor: string | undefined;

        do {
          const fetchParams = new URLSearchParams(params);
          if (cursor) {
            fetchParams.append('cursor', cursor);
          }

          const response = await fetchJson<{
            items: GraphObjectResponse[];
            next_cursor?: string;
          }>(`${apiBase}/api/graph/objects/search?${fetchParams}`);

          allIds.push(...response.items.map((item) => item.id));
          cursor = response.next_cursor;
        } while (cursor);

        idsToDelete = allIds;
      }

      showToast({
        variant: 'info',
        message: `Deleting ${idsToDelete.length.toLocaleString()} objects...`,
      });

      // Delete in batches to avoid overwhelming the server
      const BATCH_SIZE = 50;
      let deleted = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((id) =>
            fetchJson(`${apiBase}/api/graph/objects/${id}`, {
              method: 'DELETE',
            })
          )
        );

        // Count successes, skips (already deleted), and failures
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            deleted++;
          } else {
            // Check if it's an "already_deleted" error (which is fine to skip)
            const errorMessage =
              result.reason?.message || String(result.reason);
            if (errorMessage.includes('already_deleted')) {
              skipped++;
            } else {
              failed++;
              console.error('Delete failed:', result.reason);
            }
          }
        });

        // Show progress for large operations
        if (idsToDelete.length > BATCH_SIZE) {
          const processed = deleted + skipped + failed;
          showToast({
            variant: 'info',
            message: `Progress: ${processed.toLocaleString()} of ${idsToDelete.length.toLocaleString()} (${deleted} deleted, ${skipped} skipped)...`,
          });
        }
      }

      // Show final result
      if (failed > 0) {
        showToast({
          variant: 'warning',
          message: `Deleted ${deleted.toLocaleString()} objects, ${skipped} already deleted, ${failed} failed.`,
        });
      } else if (skipped > 0) {
        showToast({
          variant: 'success',
          message: `Deleted ${deleted.toLocaleString()} objects (${skipped} were already deleted).`,
        });
      } else {
        showToast({
          variant: 'success',
          message: `Successfully deleted ${deleted.toLocaleString()} objects.`,
        });
      }

      // Reload objects after deletion
      await loadObjects();
    } catch (err) {
      console.error('Failed to delete objects:', err);
      showToast({
        variant: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to delete some objects',
      });
    }
  };

  const handleBulkAccept = async (context: SelectionContext<GraphObject>) => {
    if (!config.activeProjectId) return;

    const isAllMode = context.mode === 'all';
    const count = isAllMode
      ? context.totalCount || 0
      : context.selectedIds.length;

    if (count === 0) return;

    try {
      let idsToAccept = context.selectedIds;

      // If "all" mode, we need to fetch all matching object IDs first
      // TODO: Replace with server-side filter-based bulk update once available
      if (isAllMode) {
        showToast({
          variant: 'info',
          message: `Fetching all ${count.toLocaleString()} object IDs...`,
        });

        // Fetch all object IDs with current filters
        const params = new URLSearchParams();
        if (selectedTypes.length > 0) {
          params.append('type', selectedTypes[0]);
        }
        if (selectedExtractionJobId) {
          params.append('extraction_job_id', selectedExtractionJobId);
        }
        params.append('limit', '10000');
        params.append('order', 'desc');

        const allIds: string[] = [];
        let cursor: string | undefined;

        do {
          const fetchParams = new URLSearchParams(params);
          if (cursor) {
            fetchParams.append('cursor', cursor);
          }

          const response = await fetchJson<{
            items: GraphObjectResponse[];
            next_cursor?: string;
          }>(`${apiBase}/api/graph/objects/search?${fetchParams}`);

          allIds.push(...response.items.map((item) => item.id));
          cursor = response.next_cursor;
        } while (cursor);

        idsToAccept = allIds;
      }

      showToast({
        variant: 'info',
        message: `Accepting ${idsToAccept.length.toLocaleString()} objects...`,
      });

      const response = await fetchJson<{
        success: number;
        failed: number;
        results: Array<{ id: string; success: boolean; error?: string }>;
      }>(`${apiBase}/api/graph/objects/bulk-update-status`, {
        method: 'POST',
        body: {
          ids: idsToAccept,
          status: 'accepted',
        },
      });

      if (response.failed > 0) {
        showToast({
          variant: 'warning',
          message: `Updated ${response.success} object(s), ${response.failed} failed.`,
        });
      } else {
        showToast({
          variant: 'success',
          message: `Successfully accepted ${response.success.toLocaleString()} objects.`,
        });
      }

      // Reload objects after update
      await loadObjects();
    } catch (err) {
      console.error('Failed to accept objects:', err);
      showToast({
        variant: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to accept objects',
      });
    }
  };

  const handleAcceptObject = async (objectId: string) => {
    if (!config.activeProjectId) return;

    try {
      await fetchJson(`${apiBase}/api/graph/objects/${objectId}`, {
        method: 'PATCH',
        body: { status: 'accepted' },
      });

      // Reload objects after update
      await loadObjects();

      // Update modal object if it's open
      if (selectedObject?.id === objectId) {
        setSelectedObject({ ...selectedObject, status: 'accepted' });
      }
    } catch (err) {
      console.error('Failed to accept object:', err);
      alert(err instanceof Error ? err.message : 'Failed to accept object');
    }
  };

  // Handle object updates from refinement chat
  const handleObjectUpdated = useCallback(
    async (objectId: string) => {
      console.log('[handleObjectUpdated] Called with objectId:', objectId);
      if (!config.activeProjectId) {
        console.log('[handleObjectUpdated] No activeProjectId, returning');
        return;
      }

      try {
        // Fetch the updated object
        console.log('[handleObjectUpdated] Fetching updated object...');
        const response = await fetchJson<GraphObjectResponse>(
          `${apiBase}/api/graph/objects/${objectId}`
        );
        const updatedObj = transformObject(response);
        console.log(
          '[handleObjectUpdated] Got updated object:',
          updatedObj.name,
          'properties:',
          updatedObj.properties
        );

        // Update in the list
        setObjects((prev) =>
          prev.map((obj) => (obj.id === objectId ? updatedObj : obj))
        );

        // Update selected object if it's the same
        console.log(
          '[handleObjectUpdated] selectedObject?.id:',
          selectedObject?.id,
          'objectId:',
          objectId
        );
        if (selectedObject?.id === objectId) {
          console.log('[handleObjectUpdated] Updating selectedObject');
          setSelectedObject(updatedObj);
        }
      } catch (err) {
        console.error('Failed to refresh object after update:', err);
      }
    },
    [config.activeProjectId, apiBase, fetchJson, selectedObject?.id]
  );

  const handleBulkSelect = (selectedIds: string[]) => {
    console.log('Selected objects:', selectedIds);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleTypeFilterChange = (types: string[]) => {
    setSelectedTypes(types);
  };

  const handleTagFilterChange = (tags: string[]) => {
    setSelectedTags(tags);
  };

  // Define table columns
  const columns: ColumnDef<GraphObject>[] = [
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (obj) => (
        <span className="badge badge-sm badge-ghost">{obj.type}</span>
      ),
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      width: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
      cellClassName: 'max-w-[250px] sm:max-w-[350px] md:max-w-[450px]',
      render: (obj) => {
        const hasExtractionData =
          obj.properties?._extraction_confidence !== undefined;
        return (
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-medium truncate" title={obj.name}>
              {obj.name}
            </span>
            {hasExtractionData && (
              <Icon
                icon="lucide--sparkles"
                className="size-3 text-primary shrink-0"
                title="AI Extracted"
              />
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (obj) => {
        if (!obj.status) {
          return <span className="text-sm text-base-content/70">—</span>;
        }

        const statusClass =
          obj.status === 'accepted'
            ? 'badge-success'
            : obj.status === 'draft'
            ? 'badge-warning'
            : obj.status === 'rejected'
            ? 'badge-error'
            : 'badge-ghost';

        return (
          <span className={`badge badge-sm ${statusClass}`}>{obj.status}</span>
        );
      },
    },
    {
      key: 'source',
      label: 'Source',
      width: 'max-w-[200px]',
      cellClassName: 'max-w-[200px]',
      render: (obj) => {
        if (!obj.source) {
          return <span className="text-sm text-base-content/70">—</span>;
        }

        // Handle document sources with icon and document name
        if (obj.source === 'document' && obj.source_id) {
          // Use cached document name from ref (fetched via useEffect batch)
          const documentName =
            documentNamesCacheRef.current[obj.source_id] || 'Loading...';

          return (
            <a
              href={`/admin/apps/documents#${obj.source_id}`}
              className="flex items-center gap-2 transition-colors link hover:link-primary no-underline min-w-0"
              onClick={(e) => {
                e.stopPropagation(); // Prevent row click
              }}
              title={documentName}
            >
              <Icon
                icon="lucide--file-text"
                className="size-4 text-primary shrink-0"
              />
              <span className="text-sm truncate">{documentName}</span>
            </a>
          );
        }

        // Handle other sources
        return (
          <span className="text-sm text-base-content/70">{obj.source}</span>
        );
      },
    },
    {
      key: 'confidence',
      label: 'Confidence',
      render: (obj) => {
        const extractionConfidence = obj.properties?._extraction_confidence as
          | number
          | undefined;
        const hasExtractionData = extractionConfidence !== undefined;

        if (!hasExtractionData) {
          return <span className="text-sm text-base-content/70">—</span>;
        }

        const confidenceClass =
          extractionConfidence >= 0.8
            ? 'text-success progress-success'
            : extractionConfidence >= 0.6
            ? 'text-warning progress-warning'
            : 'text-error progress-error';

        const [textClass, progressClass] = confidenceClass.split(' ');

        return (
          <div className="flex items-center gap-1">
            <span className={`text-xs font-medium ${textClass}`}>
              {(extractionConfidence * 100).toFixed(0)}%
            </span>
            <div className="w-12">
              <progress
                className={`progress progress-xs ${progressClass}`}
                value={extractionConfidence * 100}
                max="100"
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'relationship_count',
      label: 'Rels',
      sortable: true,
      render: (obj) => {
        const count = obj.relationship_count || 0;
        return (
          <span
            className={`text-sm ${
              count === 0
                ? 'text-base-content/50'
                : 'font-medium text-base-content'
            }`}
          >
            {count}
          </span>
        );
      },
    },
    {
      key: 'updated_at',
      label: 'Updated',
      sortable: true,
      render: (obj) => (
        <span className="text-sm text-base-content/70">
          {new Date(obj.updated_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  // Define filters
  const filters: FilterConfig<GraphObject>[] = [
    {
      key: 'type',
      label: 'Filter by Type',
      icon: 'lucide--filter',
      options: availableTypes.map((type) => ({ value: type, label: type })),
      getValue: (obj) => obj.type,
      badgeColor: 'primary',
    },
    {
      key: 'status',
      label: 'Filter by Status',
      icon: 'lucide--circle-check',
      options: availableStatuses.map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
      getValue: (obj) => obj.status || '',
      badgeColor: 'accent',
    },
    {
      key: 'tags',
      label: 'Filter by Tag',
      icon: 'lucide--tag',
      options: availableTags.map((tag) => ({ value: tag, label: tag })),
      getValue: (obj) => (obj.properties?.tags as string[]) || [],
      badgeColor: 'secondary',
    },
  ];

  // Define bulk actions
  const bulkActions: BulkAction<GraphObject>[] = [
    {
      key: 'accept',
      label: 'Accept',
      icon: 'lucide--check-circle',
      variant: 'success',
      onActionWithContext: async (context) => {
        await handleBulkAccept(context);
      },
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      style: 'outline',
      onActionWithContext: async (context) => {
        await handleBulkDelete(context);
      },
    },
  ];

  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>Please select a project to view objects</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="full" className="px-4" testId="page-objects">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl inline-flex items-center gap-2">
          Objects
          {!loading && (
            <span className="badge badge-ghost badge-lg font-normal">
              {totalCount}
            </span>
          )}
        </h1>
        <p className="mt-1 text-base-content/70">
          Browse and manage all objects in your knowledge graph
        </p>
      </div>

      {/* DataTable */}
      <DataTable<GraphObject>
        data={objects}
        columns={columns}
        loading={loading}
        error={error}
        enableSelection={true}
        enableSearch={true}
        searchPlaceholder="Search objects..."
        onSearch={handleSearchChange}
        filters={filters}
        bulkActions={bulkActions}
        totalCount={totalCount}
        rowActions={[
          {
            label: 'View Details',
            icon: 'lucide--eye',
            onAction: handleObjectClick,
          },
          {
            label: 'Generate Embedding',
            icon: 'lucide--sparkles',
            onAction: (obj) => handleGenerateEmbedding(obj.id),
            hidden: (obj: GraphObject) => !!obj.embedding,
          },
          {
            label: 'Regenerate Embedding',
            icon: 'lucide--refresh-cw',
            onAction: (obj) => handleGenerateEmbedding(obj.id),
            hidden: (obj: GraphObject) => !obj.embedding,
          },
          {
            label: 'Accept',
            icon: 'lucide--check-circle',
            onAction: (obj) => handleAcceptObject(obj.id),
            hidden: (obj: GraphObject) => obj.status === 'accepted',
            variant: 'success',
          },
          {
            label: 'Delete',
            icon: 'lucide--trash-2',
            onAction: (obj) => handleDelete(obj.id),
            variant: 'error',
          },
        ]}
        useDropdownActions={true}
        onRowClick={handleObjectClick}
        onSelectionChange={handleBulkSelect}
        emptyMessage="No objects found. Objects will appear here after extraction jobs complete."
        emptyIcon="lucide--inbox"
        noResultsMessage="No objects match current filters."
        formatDate={(date) => new Date(date).toLocaleDateString()}
        toolbarActions={
          extractionJobs.length > 0 ? (
            <div
              ref={extractionDropdownRef}
              className={`dropdown ${
                extractionDropdownOpen ? 'dropdown-open' : ''
              }`}
            >
              <label
                tabIndex={0}
                className={`gap-2 btn btn-sm ${
                  selectedExtractionJobId ? 'btn-info' : 'btn-ghost'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setExtractionDropdownOpen(!extractionDropdownOpen);
                }}
              >
                <Icon icon="lucide--file-search" className="size-4" />
                {selectedExtractionJobId ? (
                  <span>Extraction (1)</span>
                ) : (
                  <span>Filter by Extraction</span>
                )}
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-50 w-80 p-2 shadow-sm max-h-80 overflow-y-auto"
              >
                {selectedExtractionJobId && (
                  <li className="mb-2">
                    <button
                      className="btn-block justify-between btn btn-xs btn-ghost"
                      onClick={() => {
                        setSelectedExtractionJobId(null);
                        setSearchParams({});
                        setExtractionDropdownOpen(false);
                      }}
                    >
                      <span className="opacity-70 text-xs">Clear filter</span>
                      <Icon icon="lucide--x" className="size-3" />
                    </button>
                  </li>
                )}
                {extractionJobs.map((job) => (
                  <li key={job.id}>
                    <label className="flex justify-between items-center gap-2 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="extraction-filter"
                          className="radio radio-sm radio-info"
                          checked={selectedExtractionJobId === job.id}
                          onChange={() => {
                            setSelectedExtractionJobId(job.id);
                            setSearchParams({ extraction_job_id: job.id });
                            setExtractionDropdownOpen(false);
                          }}
                        />
                        <span className="font-medium truncate max-w-40">
                          {getExtractionFilename(job)}
                        </span>
                      </div>
                      <span className="badge badge-sm badge-ghost whitespace-nowrap">
                        {formatRelativeTime(job.created_at)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined
        }
      />

      {/* Load More Button */}
      {hasMore && !loading && (
        <div className="flex justify-center mt-6">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="btn btn-primary btn-wide"
          >
            {loadingMore ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Loading...
              </>
            ) : (
              <>
                Load More
                <span className="text-xs opacity-70">
                  ({objects.length} of {totalCount})
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Object Detail Modal */}
      <ObjectDetailModal
        object={selectedObject}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onDelete={handleDelete}
        onAccept={handleAcceptObject}
        onObjectUpdated={handleObjectUpdated}
      />
    </PageContainer>
  );
}
