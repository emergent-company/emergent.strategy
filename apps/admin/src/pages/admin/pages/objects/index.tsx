// Page: Object Browser
// Route: /admin/objects

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { ObjectDetailModal } from '@/components/organisms/ObjectDetailModal';
import {
  DataTable,
  type ColumnDef,
  type FilterConfig,
  type BulkAction,
  type TableDataItem,
} from '@/components/organisms/DataTable';
import { Icon } from '@/components/atoms/Icon';

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

export default function ObjectsPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();

  const [objects, setObjects] = useState<GraphObject[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedObject, setSelectedObject] = useState<GraphObject | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [documentNamesCache, setDocumentNamesCache] = useState<
    Record<string, string>
  >({});

  const loadObjects = useCallback(async () => {
    if (!config.activeProjectId) return;

    setLoading(true);
    setError(null);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (searchQuery) {
        // Use full-text search if there's a search query
        params.append('q', searchQuery);
        params.append('limit', '100');

        const response = await fetchJson<{
          query: string;
          items: GraphObjectResponse[];
          total: number;
          limit: number;
        }>(`${apiBase}/api/graph/objects/fts?${params}`);

        // Transform API response to component format
        const transformedObjects: GraphObject[] = response.items.map((obj) => ({
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
          source_id:
            (obj.properties?._extraction_source_id as string) || undefined,
          updated_at: obj.created_at, // Use created_at as updated_at
          relationship_count: undefined, // Not included in API response
          properties: obj.properties,
          embedding: obj.embedding,
          embedding_updated_at: obj.embedding_updated_at,
        }));

        setObjects(transformedObjects);
        setTotalCount(response.total);
      } else {
        // Use regular search without text query
        if (selectedTypes.length > 0) {
          // For now, just use the first type (API doesn't support multiple types in one call)
          params.append('type', selectedTypes[0]);
        }
        params.append('limit', '100');
        params.append('order', 'desc'); // Get newest first

        const response = await fetchJson<{
          items: GraphObjectResponse[];
          next_cursor?: string;
          total?: number;
        }>(`${apiBase}/api/graph/objects/search?${params}`);

        // Transform API response to component format
        const transformedObjects: GraphObject[] = response.items.map((obj) => ({
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
          source_id:
            (obj.properties?._extraction_source_id as string) || undefined,
          updated_at: obj.created_at, // Use created_at as updated_at
          relationship_count: undefined, // Not included in API response
          properties: obj.properties,
          embedding: obj.embedding,
          embedding_updated_at: obj.embedding_updated_at,
        }));

        setObjects(transformedObjects);
        setTotalCount(response.total || transformedObjects.length);
      }
    } catch (err) {
      console.error('Failed to load objects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load objects');
    } finally {
      setLoading(false);
    }
  }, [config.activeProjectId, searchQuery, selectedTypes, apiBase, fetchJson]);

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
      // Check cache first
      if (documentNamesCache[documentId]) {
        return documentNamesCache[documentId];
      }

      try {
        const doc = await fetchJson<{
          id: string;
          filename?: string;
          name?: string;
        }>(`${apiBase}/api/documents/${documentId}`);
        const name = doc.filename || doc.name || documentId.substring(0, 8);

        // Update cache
        setDocumentNamesCache((prev) => ({ ...prev, [documentId]: name }));

        return name;
      } catch (err) {
        console.error(`Failed to fetch document name for ${documentId}:`, err);
        return documentId.substring(0, 8) + '...';
      }
    },
    [apiBase, fetchJson, documentNamesCache]
  );

  useEffect(() => {
    loadAvailableTypes();
    loadAvailableTags();
  }, [loadAvailableTypes, loadAvailableTags]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  const handleObjectClick = (object: GraphObject) => {
    setSelectedObject(object);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    // Small delay before clearing to avoid flicker
    setTimeout(() => setSelectedObject(null), 300);
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

  const handleBulkDelete = async (selectedIds: string[]) => {
    if (!config.activeProjectId || selectedIds.length === 0) return;

    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.length} object(s)? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      // Delete in parallel
      await Promise.all(
        selectedIds.map((id) =>
          fetchJson(`${apiBase}/api/graph/objects/${id}`, {
            method: 'DELETE',
          })
        )
      );

      // Reload objects after deletion
      await loadObjects();
    } catch (err) {
      console.error('Failed to delete objects:', err);
      alert(
        err instanceof Error ? err.message : 'Failed to delete some objects'
      );
    }
  };

  const handleBulkAccept = async (selectedIds: string[]) => {
    if (!config.activeProjectId || selectedIds.length === 0) return;

    try {
      const response = await fetchJson<{
        success: number;
        failed: number;
        results: Array<{ id: string; success: boolean; error?: string }>;
      }>(`${apiBase}/api/graph/objects/bulk-update-status`, {
        method: 'POST',
        body: {
          ids: selectedIds,
          status: 'accepted',
        },
      });

      if (response.failed > 0) {
        alert(
          `Updated ${response.success} object(s), ${response.failed} failed.`
        );
      }

      // Reload objects after update
      await loadObjects();
    } catch (err) {
      console.error('Failed to accept objects:', err);
      alert(err instanceof Error ? err.message : 'Failed to accept objects');
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
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (obj) => (
        <span className="badge badge-sm badge-ghost">{obj.type}</span>
      ),
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
          // Use cached document name or show loading/fallback
          const documentName =
            documentNamesCache[obj.source_id] || 'Loading...';

          // Fetch document name if not in cache
          if (!documentNamesCache[obj.source_id]) {
            fetchDocumentName(obj.source_id);
          }

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
      key: 'updated_at',
      label: 'Updated',
      sortable: true,
      render: (obj) => (
        <span className="text-sm text-base-content/70">
          {new Date(obj.updated_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'relationship_count',
      label: 'Rel',
      render: (obj) => (
        <span className="text-sm text-base-content/70">
          {obj.relationship_count ?? '—'}
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
      onAction: async (selectedIds) => {
        await handleBulkAccept(selectedIds);
      },
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      style: 'outline',
      onAction: async (selectedIds) => {
        await handleBulkDelete(selectedIds);
      },
    },
  ];

  if (!config.activeProjectId) {
    return (
      <div className="mx-auto container">
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
      </div>
    );
  }

  return (
    <div data-testid="page-objects" className="w-full px-4">
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
        getSearchText={(obj) => `${obj.name} ${obj.type} ${obj.source || ''}`}
        filters={filters}
        bulkActions={bulkActions}
        onRowClick={handleObjectClick}
        onSelectionChange={handleBulkSelect}
        emptyMessage="No objects found. Objects will appear here after extraction jobs complete."
        emptyIcon="lucide--inbox"
        noResultsMessage="No objects match current filters."
        formatDate={(date) => new Date(date).toLocaleDateString()}
      />

      {/* Object Detail Modal */}
      <ObjectDetailModal
        object={selectedObject}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onDelete={handleDelete}
        onAccept={handleAcceptObject}
      />
    </div>
  );
}
