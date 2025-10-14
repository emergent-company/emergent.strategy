// Page: Object Browser
// Route: /admin/objects

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { ObjectBrowser, GraphObject } from '@/components/organisms/ObjectBrowser/ObjectBrowser';
import { ObjectDetailModal } from '@/components/organisms/ObjectDetailModal';

interface GraphObjectResponse {
    id: string;
    key?: string | null;  // Graph objects use 'key' not 'name'
    type: string;
    description?: string;
    properties: Record<string, unknown>;
    labels: string[];
    external_id?: string;
    external_type?: string;
    created_at: string;
    // Note: No updated_at in graph_objects table
}

export default function ObjectsPage() {
    const { config } = useConfig();
    const { apiBase, fetchJson } = useApi();

    const [objects, setObjects] = useState<GraphObject[]>([]);
    const [availableTypes, setAvailableTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedObject, setSelectedObject] = useState<GraphObject | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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
                const transformedObjects: GraphObject[] = response.items.map(obj => ({
                    id: obj.id,
                    name: obj.key || (obj.properties?.name as string) || (obj.properties?.title as string) || `${obj.type}-${obj.id.substring(0, 8)}`,
                    type: obj.type,
                    source: obj.external_type || (obj.properties?._extraction_source as string) || undefined,
                    updated_at: obj.created_at,  // Use created_at as updated_at
                    relationship_count: undefined,  // Not included in API response
                    properties: obj.properties,
                }));

                setObjects(transformedObjects);
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
                }>(`${apiBase}/api/graph/objects/search?${params}`);

                // Transform API response to component format
                const transformedObjects: GraphObject[] = response.items.map(obj => ({
                    id: obj.id,
                    name: obj.key || (obj.properties?.name as string) || (obj.properties?.title as string) || `${obj.type}-${obj.id.substring(0, 8)}`,
                    type: obj.type,
                    source: obj.external_type || (obj.properties?._extraction_source as string) || undefined,
                    updated_at: obj.created_at,  // Use created_at as updated_at
                    relationship_count: undefined,  // Not included in API response
                    properties: obj.properties,
                }));

                setObjects(transformedObjects);
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
            const typeNames = [...new Set(types.map(t => t.type))];
            setAvailableTypes(typeNames);
        } catch (err) {
            console.error('Failed to load types:', err);
        }
    }, [config.activeProjectId, apiBase, fetchJson]);

    useEffect(() => {
        loadAvailableTypes();
    }, [loadAvailableTypes]);

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

        if (!confirm('Are you sure you want to delete this object? This action cannot be undone.')) {
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

        if (!confirm(`Are you sure you want to delete ${selectedIds.length} object(s)? This action cannot be undone.`)) {
            return;
        }

        try {
            // Delete in parallel
            await Promise.all(
                selectedIds.map(id =>
                    fetchJson(`${apiBase}/api/graph/objects/${id}`, {
                        method: 'DELETE',
                    })
                )
            );

            // Reload objects after deletion
            await loadObjects();
        } catch (err) {
            console.error('Failed to delete objects:', err);
            alert(err instanceof Error ? err.message : 'Failed to delete some objects');
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

    if (!config.activeProjectId) {
        return (
            <div className="mx-auto p-6 container">
                <div className="alert alert-warning">
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>Please select a project to view objects</span>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="page-objects" className="mx-auto p-6 max-w-7xl container">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-bold text-2xl">Objects</h1>
                <p className="mt-1 text-base-content/70">
                    Browse and manage all objects in your knowledge graph
                </p>
            </div>

            {/* Object Browser */}
            <ObjectBrowser
                objects={objects}
                loading={loading}
                error={error}
                onObjectClick={handleObjectClick}
                onBulkSelect={handleBulkSelect}
                onBulkDelete={handleBulkDelete}
                onSearchChange={handleSearchChange}
                onTypeFilterChange={handleTypeFilterChange}
                availableTypes={availableTypes}
            />

            {/* Object Detail Modal */}
            <ObjectDetailModal
                object={selectedObject}
                isOpen={isModalOpen}
                onClose={handleModalClose}
                onDelete={handleDelete}
            />
        </div>
    );
}
