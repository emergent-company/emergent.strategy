/**
 * Integrations API Client
 * 
 * TypeScript client for integrations endpoints
 */

/**
 * Integration capabilities
 */
export interface IntegrationCapabilities {
    supportsImport: boolean;
    supportsWebhooks: boolean;
    supportsBidirectionalSync: boolean;
    requiresOAuth: boolean;
    supportsIncrementalSync: boolean;
}

/**
 * Available integration type (from registry)
 */
export interface AvailableIntegration {
    name: string;
    displayName: string;
    description?: string;
    capabilities: IntegrationCapabilities;
    requiredSettings: string[];
    optionalSettings: Record<string, any>;
}

/**
 * Configured integration instance
 */
export interface Integration {
    id: string;
    org_id: string;
    project_id: string;
    name: string;
    display_name: string;
    settings: Record<string, any>;
    enabled: boolean;
    last_sync_at?: string;
    last_sync_status?: 'success' | 'failed' | 'running';
    error_message?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Create integration payload
 */
export interface CreateIntegrationPayload {
    name: string;
    display_name: string;
    settings: Record<string, any>;
    enabled?: boolean;
    description?: string;
}

/**
 * Update integration payload
 */
export interface UpdateIntegrationPayload {
    settings?: Record<string, any>;
    enabled?: boolean;
}

/**
 * Test connection response
 */
export interface TestConnectionResponse {
    success: boolean;
    message: string;
    details?: Record<string, any>;
}

/**
 * Trigger sync response
 */
export interface TriggerSyncResponse {
    success: boolean;
    message: string;
    job_id?: string;
}

/**
 * Trigger sync configuration
 */
export interface TriggerSyncConfig {
    full_sync?: boolean;
    source_types?: string[];
    /** Specific space IDs to import (ClickUp-specific, for selective sync) */
    space_ids?: string[];
    /** Whether to include completed/archived items */
    includeArchived?: boolean;
    /** Maximum tasks to import per batch */
    batchSize?: number;
}

/**
 * ClickUp workspace structure (for list selection UI)
 */
export interface ClickUpList {
    id: string;
    name: string;
    task_count: number;
    archived: boolean;
}

export interface ClickUpFolder {
    id: string;
    name: string;
    lists: ClickUpList[];
    archived: boolean;
}

export interface ClickUpSpace {
    id: string;
    name: string;
    archived: boolean;
    documents: ClickUpDocument[];
}

export interface ClickUpDocument {
    id: string;
    name: string;
}

export interface ClickUpWorkspaceStructure {
    workspace: {
        id: string;
        name: string;
    };
    spaces: ClickUpSpace[];
}

/**
 * API client interface
 */
export interface IntegrationsClient {
    /**
     * List all available integration types
     */
    listAvailable(): Promise<AvailableIntegration[]>;

    /**
     * List configured integrations for a project
     */
    listIntegrations(): Promise<Integration[]>;

    /**
     * Get a specific integration
     */
    getIntegration(name: string): Promise<Integration>;

    /**
     * Create a new integration
     */
    createIntegration(payload: CreateIntegrationPayload): Promise<Integration>;

    /**
     * Update an integration
     */
    updateIntegration(name: string, payload: UpdateIntegrationPayload): Promise<Integration>;

    /**
     * Delete an integration
     */
    deleteIntegration(name: string): Promise<void>;

    /**
     * Test integration connection
     */
    testConnection(name: string): Promise<TestConnectionResponse>;

    /**
     * Trigger a sync for an integration
     */
    triggerSync(name: string, config?: TriggerSyncConfig): Promise<TriggerSyncResponse>;

    /**
     * Get ClickUp workspace structure (spaces, folders, lists)
     */
    getClickUpWorkspaceStructure(): Promise<ClickUpWorkspaceStructure>;
}

/**
 * Create integrations API client
 * 
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @param projectId - Current project ID
 * @param orgId - Current org ID
 * @returns Integrations client
 */
export function createIntegrationsClient(
    apiBase: string,
    fetchJson: <T, B = unknown>(url: string, init?: any) => Promise<T>,
    _projectId?: string,
    _orgId?: string
): IntegrationsClient {
    // Intentionally unused parameters: ensure client remounts when context changes
    void _projectId;
    void _orgId;

    const baseUrl = `${apiBase}/api/integrations`;

    return {
        async listAvailable() {
            return fetchJson<AvailableIntegration[]>(`${baseUrl}/available`);
        },

        async listIntegrations() {
            return fetchJson<Integration[]>(baseUrl);
        },

        async getIntegration(name: string) {
            return fetchJson<Integration>(`${baseUrl}/${name}`);
        },

        async createIntegration(payload: CreateIntegrationPayload) {
            return fetchJson<Integration>(baseUrl, {
                method: 'POST',
                body: payload,
            });
        },

        async updateIntegration(name: string, payload: UpdateIntegrationPayload) {
            return fetchJson<Integration>(`${baseUrl}/${name}`, {
                method: 'PUT',
                body: payload,
            });
        },

        async deleteIntegration(name: string) {
            return fetchJson<void>(`${baseUrl}/${name}`, {
                method: 'DELETE',
            });
        },

        async testConnection(name: string) {
            return fetchJson<TestConnectionResponse>(`${baseUrl}/${name}/test`, {
                method: 'POST',
            });
        },

        async triggerSync(name: string, config: TriggerSyncConfig = {}) {
            return fetchJson<TriggerSyncResponse>(`${baseUrl}/${name}/sync`, {
                method: 'POST',
                body: config,
            });
        },

        async getClickUpWorkspaceStructure() {
            return fetchJson<ClickUpWorkspaceStructure>(`${baseUrl}/clickup/structure`);
        },
    };
}
