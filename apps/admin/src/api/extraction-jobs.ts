/**
 * Extraction Jobs API Client
 * 
 * TypeScript client for extraction jobs endpoints
 */

/**
 * Extraction job status
 */
export type ExtractionJobStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'requires_review'
    | 'failed'
    | 'cancelled';

/**
 * Extraction source type
 */
export type ExtractionSourceType = 'document' | 'api' | 'manual' | 'bulk_import';

/**
 * Extraction job entity
 */
export interface ExtractionJob {
    id: string;
    org_id: string;
    project_id: string;
    source_type: ExtractionSourceType;
    source_id?: string;
    source_metadata: Record<string, any>;
    extraction_config: Record<string, any>;
    status: ExtractionJobStatus;
    total_items: number;
    processed_items: number;
    successful_items: number;
    failed_items: number;
    discovered_types: string[];
    created_objects: string[];
    error_message?: string;
    error_details?: Record<string, any>;
    started_at?: string;
    completed_at?: string;
    created_at: string;
    subject_id?: string;
    updated_at: string;
}

/**
 * Create extraction job payload
 */
export interface CreateExtractionJobPayload {
    org_id: string;
    project_id: string;
    source_type: ExtractionSourceType;
    source_id?: string;
    source_metadata?: Record<string, any>;
    extraction_config: {
        target_types?: string[];
        auto_create_types?: boolean;
        confidence_threshold?: number;
        entity_linking_strategy?: 'strict' | 'fuzzy' | 'none';
        require_review?: boolean;
        notify_on_completion?: boolean;
        [key: string]: any;
    };
    subject_id?: string;
}

/**
 * Update extraction job payload
 */
export interface UpdateExtractionJobPayload {
    status?: ExtractionJobStatus;
    total_items?: number;
    processed_items?: number;
    successful_items?: number;
    failed_items?: number;
    discovered_types?: string[];
    created_objects?: string[];
    error_message?: string;
    error_details?: Record<string, any>;
}

/**
 * List extraction jobs query parameters
 */
export interface ListExtractionJobsParams {
    status?: ExtractionJobStatus;
    source_type?: ExtractionSourceType;
    source_id?: string;
    page?: number;
    limit?: number;
}

/**
 * Paginated extraction jobs response
 */
export interface ExtractionJobListResponse {
    jobs: ExtractionJob[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

/**
 * Extraction job statistics
 */
export interface ExtractionJobStatistics {
    total_jobs: number;
    jobs_by_status: Record<ExtractionJobStatus, number>;
    success_rate: number;
    average_processing_time_ms?: number;
    most_extracted_types: Array<{
        type: string;
        count: number;
    }>;
    jobs_this_week: number;
    jobs_this_month: number;
}

/**
 * API client interface
 * 
 * Usage:
 * ```typescript
 * const { apiBase, fetchJson } = useApi();
 * const client = createExtractionJobsClient(apiBase, fetchJson);
 * 
 * const jobs = await client.listJobs(projectId, orgId, { status: 'running' });
 * const job = await client.getJob(jobId);
 * ```
 */
export interface ExtractionJobsClient {
    /**
     * List extraction jobs for a project
     */
    listJobs(projectId: string, orgId: string, params?: ListExtractionJobsParams): Promise<ExtractionJobListResponse>;

    /**
     * Get a single extraction job by ID
     */
    getJob(jobId: string): Promise<ExtractionJob>;

    /**
     * Create a new extraction job
     */
    createJob(payload: CreateExtractionJobPayload): Promise<ExtractionJob>;

    /**
     * Update an extraction job
     */
    updateJob(jobId: string, payload: UpdateExtractionJobPayload): Promise<ExtractionJob>;

    /**
     * Delete an extraction job
     */
    deleteJob(jobId: string): Promise<void>;

    /**
     * Cancel a running extraction job
     */
    cancelJob(jobId: string): Promise<ExtractionJob>;

    /**
     * Get extraction statistics for a project
     */
    getStatistics(projectId: string, orgId: string): Promise<ExtractionJobStatistics>;
}

/**
 * Create extraction jobs API client
 * 
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @param projectId - Current project ID
 * @param orgId - Current org ID
 * @returns Extraction jobs client
 */
export function createExtractionJobsClient(
    apiBase: string,
    fetchJson: <T, B = unknown>(url: string, init?: any) => Promise<T>,
    projectId?: string,
    orgId?: string
): ExtractionJobsClient {
    return {
        async listJobs(projectId: string, orgId: string, params: ListExtractionJobsParams = {}) {
            const queryParams = new URLSearchParams();
            queryParams.set('org_id', orgId); // Add org_id to query params
            if (params.status) queryParams.set('status', params.status);
            if (params.source_type) queryParams.set('source_type', params.source_type);
            if (params.source_id) queryParams.set('source_id', params.source_id);
            if (params.page) queryParams.set('page', params.page.toString());
            if (params.limit) queryParams.set('limit', params.limit.toString());

            const query = queryParams.toString();
            const url = `${apiBase}/admin/extraction-jobs/projects/${projectId}?${query}`;

            return fetchJson<ExtractionJobListResponse>(url);
        },

        async getJob(jobId: string) {
            const queryParams = new URLSearchParams();
            if (projectId) queryParams.set('project_id', projectId);
            if (orgId) queryParams.set('org_id', orgId);

            const query = queryParams.toString();
            const url = `${apiBase}/admin/extraction-jobs/${jobId}${query ? `?${query}` : ''}`;

            return fetchJson<ExtractionJob>(url);
        },

        async createJob(payload: CreateExtractionJobPayload) {
            return fetchJson<ExtractionJob>(`${apiBase}/admin/extraction-jobs`, {
                method: 'POST',
                body: payload,
            });
        },

        async updateJob(jobId: string, payload: UpdateExtractionJobPayload) {
            const queryParams = new URLSearchParams();
            if (projectId) queryParams.set('project_id', projectId);
            if (orgId) queryParams.set('org_id', orgId);

            const query = queryParams.toString();
            const url = `${apiBase}/admin/extraction-jobs/${jobId}${query ? `?${query}` : ''}`;

            return fetchJson<ExtractionJob>(url, {
                method: 'PATCH',
                body: payload,
            });
        },

        async deleteJob(jobId: string) {
            const queryParams = new URLSearchParams();
            if (projectId) queryParams.set('project_id', projectId);
            if (orgId) queryParams.set('org_id', orgId);

            const query = queryParams.toString();
            const url = `${apiBase}/admin/extraction-jobs/${jobId}${query ? `?${query}` : ''}`;

            return fetchJson<void>(url, {
                method: 'DELETE',
            });
        },

        async cancelJob(jobId: string) {
            const queryParams = new URLSearchParams();
            if (projectId) queryParams.set('project_id', projectId);
            if (orgId) queryParams.set('org_id', orgId);

            const query = queryParams.toString();
            const url = `${apiBase}/admin/extraction-jobs/${jobId}/cancel${query ? `?${query}` : ''}`;

            return fetchJson<ExtractionJob>(url, {
                method: 'POST',
            });
        },

        async getStatistics(projectId: string, orgId: string) {
            return fetchJson<ExtractionJobStatistics>(
                `${apiBase}/admin/extraction-jobs/projects/${projectId}/statistics?org_id=${orgId}`
            );
        },
    };
}
