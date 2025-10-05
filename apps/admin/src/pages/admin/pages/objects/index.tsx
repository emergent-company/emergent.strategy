// Page: Object Browser
// Route: /admin/objects

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { ObjectBrowser, GraphObject } from '@/components/organisms/ObjectBrowser/ObjectBrowser';

interface GraphObjectResponse {
    id: string;
    name: string;
    type: string;
    description?: string;
    properties: Record<string, unknown>;
    labels: string[];
    source?: string;
    external_id?: string;
    external_type?: string;
    created_at: string;
    updated_at: string;
    relationship_count?: number;
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
                }>(`${apiBase}/graph/objects/fts?${params}`);

                // Transform API response to component format
                const transformedObjects: GraphObject[] = response.items.map(obj => ({
                    id: obj.id,
                    name: obj.name,
                    type: obj.type,
                    source: obj.source || (obj.external_id ? obj.external_type : undefined),
                    updated_at: obj.updated_at,
                    relationship_count: obj.relationship_count,
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
                }>(`${apiBase}/graph/objects/search?${params}`);

                // Transform API response to component format
                const transformedObjects: GraphObject[] = response.items.map(obj => ({
                    id: obj.id,
                    name: obj.name,
                    type: obj.type,
                    source: obj.source || (obj.external_id ? obj.external_type : undefined),
                    updated_at: obj.updated_at,
                    relationship_count: obj.relationship_count,
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
                `${apiBase}/type-registry/projects/${config.activeProjectId}`
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
        console.log('Object clicked:', object);
        // TODO: Navigate to object detail view or open modal
        // For now, just log to console
    };

    const handleBulkSelect = (selectedIds: string[]) => {
        console.log('Selected objects:', selectedIds);
        // TODO: Implement bulk actions
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
        <div className="mx-auto p-6 max-w-7xl container">
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
                onSearchChange={handleSearchChange}
                onTypeFilterChange={handleTypeFilterChange}
                availableTypes={availableTypes}
            />
        </div>
    );
}
