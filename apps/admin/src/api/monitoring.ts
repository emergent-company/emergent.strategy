/**
 * Monitoring API Client
 * 
 * Provides typed access to the monitoring endpoints for extraction jobs,
 * LLM calls, and system logs.
 */

/**
 * Extraction job summary for list views
 */
export interface ExtractionJobSummary {
    id: string;
    source_type: string;
    source_id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    started_at: string;
    completed_at?: string;
    duration_ms?: number;
    objects_created?: number;
    relationships_created?: number;
    suggestions_created?: number;
    total_llm_calls?: number;
    total_cost_usd?: number;
    error_message?: string;
}

/**
 * System process log entry
 */
export interface ProcessLog {
    id: string;
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    metadata?: Record<string, any>;
}

/**
 * LLM API call log entry
 */
export interface LLMCallLog {
    id: string;
    model_name: string;
    status: 'success' | 'error' | 'timeout' | 'pending';
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
    duration_ms?: number;
    started_at: string;
    completed_at?: string;
    request_payload?: Record<string, any>;
    response_payload?: Record<string, any>;
    error_message?: string;
}

/**
 * Full extraction job details with logs and metrics
 */
export interface ExtractionJobDetail {
    id: string;
    source_type: string;
    source_id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    started_at: string;
    completed_at?: string;
    duration_ms?: number;
    objects_created?: number;
    relationships_created?: number;
    suggestions_created?: number;
    error_message?: string;
    logs: ProcessLog[];
    llm_calls: LLMCallLog[];
    metrics: {
        total_llm_calls: number;
        total_cost_usd: number;
        total_tokens: number;
        avg_call_duration_ms: number;
        success_rate: number;
    };
}

/**
 * Paginated list response
 */
export interface ExtractionJobListResponse {
    items: ExtractionJobSummary[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
}

/**
 * Query parameters for listing extraction jobs
 */
export interface ListExtractionJobsParams {
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    source_type?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
    sort_by?: 'started_at' | 'duration_ms' | 'total_cost_usd';
    sort_order?: 'asc' | 'desc';
}

/**
 * API client interface
 */
export interface MonitoringClient {
    /**
     * List extraction jobs with filtering and pagination
     */
    listExtractionJobs(params?: ListExtractionJobsParams): Promise<ExtractionJobListResponse>;

    /**
     * Get full details for a specific extraction job
     */
    getExtractionJobDetail(jobId: string): Promise<ExtractionJobDetail>;

    /**
     * Get logs for a specific extraction job
     */
    getExtractionJobLogs(jobId: string, level?: string): Promise<ProcessLog[]>;

    /**
     * Get LLM calls for a specific extraction job
     */
    getExtractionJobLLMCalls(jobId: string, limit?: number): Promise<LLMCallLog[]>;
}

/**
 * Create monitoring API client
 * 
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @param projectId - Current project ID
 * @param orgId - Current org ID
 * @returns Monitoring client
 */
export function createMonitoringClient(
    apiBase: string,
    fetchJson: <T, B = unknown>(url: string, init?: any) => Promise<T>,
    _projectId?: string,
    _orgId?: string
): MonitoringClient {
    // Intentionally unused parameters: ensure client remounts when context changes
    void _projectId;
    void _orgId;

    const baseUrl = `${apiBase}/api/monitoring`;

    return {
        async listExtractionJobs(params?: ListExtractionJobsParams) {
            const queryParams = new URLSearchParams();

            // Required parameter: resource type
            queryParams.set('type', 'extraction_job');

            if (params?.status) queryParams.set('status', params.status);
            if (params?.source_type) queryParams.set('source_type', params.source_type);
            if (params?.date_from) queryParams.set('date_from', params.date_from);
            if (params?.date_to) queryParams.set('date_to', params.date_to);

            // Convert page-based to offset-based pagination
            const limit = params?.limit ?? 20;
            const page = params?.page ?? 1;
            const offset = (page - 1) * limit;

            queryParams.set('limit', limit.toString());
            queryParams.set('offset', offset.toString());

            if (params?.sort_by) queryParams.set('sort_by', params.sort_by);
            if (params?.sort_order) queryParams.set('sort_order', params.sort_order);

            const query = queryParams.toString();
            const url = `${baseUrl}/extraction-jobs${query ? `?${query}` : ''}`;

            // Backend returns { items, total, limit, offset }
            // Convert to frontend format { items, total, page, page_size, has_more }
            const response = await fetchJson<{ items: ExtractionJobSummary[]; total: number; limit: number; offset: number }>(url);

            return {
                items: response.items,
                total: response.total,
                page: page,
                page_size: limit,
                has_more: offset + limit < response.total
            };
        },

        async getExtractionJobDetail(jobId: string) {
            return fetchJson<ExtractionJobDetail>(`${baseUrl}/extraction-jobs/${jobId}`);
        },

        async getExtractionJobLogs(jobId: string, level?: string) {
            const query = level ? `?level=${level}` : '';
            const response = await fetchJson<{ logs: ProcessLog[] }>(
                `${baseUrl}/extraction-jobs/${jobId}/logs${query}`
            );
            return response.logs;
        },

        async getExtractionJobLLMCalls(jobId: string, limit?: number) {
            const query = limit ? `?limit=${limit}` : '';
            const response = await fetchJson<{ llm_calls: LLMCallLog[] }>(
                `${baseUrl}/extraction-jobs/${jobId}/llm-calls${query}`
            );
            return response.llm_calls;
        },
    };
}

