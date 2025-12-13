/**
 * Extraction Jobs API Client
 *
 * TypeScript client for extraction jobs endpoints
 */

/**
 * Extraction job status
 */
export type ExtractionJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'requires_review'
  | 'failed'
  | 'cancelled';

/**
 * Extraction source type
 */
export type ExtractionSourceType =
  | 'document'
  | 'api'
  | 'manual'
  | 'bulk_import';

/**
 * Extraction job entity
 */
export interface ExtractionJob {
  id: string;
  organization_id?: string;
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
  debug_info?: Record<string, any>;
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
  project_id?: string;
  source_type: ExtractionSourceType;
  source_id?: string;
  source_metadata?: Record<string, any>;
  extraction_config: {
    target_types?: string[];
    auto_create_types?: boolean;
    confidence_threshold?: number;
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
 * const jobs = await client.listJobs(projectId, { status: 'running' });
 * const job = await client.getJob(jobId);
 * ```
 */
export interface ExtractionJobsClient {
  /**
   * List extraction jobs for a project
   */
  listJobs(
    projectId?: string,
    params?: ListExtractionJobsParams
  ): Promise<ExtractionJobListResponse>;

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
  updateJob(
    jobId: string,
    payload: UpdateExtractionJobPayload
  ): Promise<ExtractionJob>;

  /**
   * Delete an extraction job
   */
  deleteJob(jobId: string): Promise<void>;

  /**
   * Cancel a running extraction job
   */
  cancelJob(jobId: string): Promise<ExtractionJob>;

  /**
   * Retry a failed or stuck extraction job
   */
  retryJob(jobId: string): Promise<ExtractionJob>;

  /**
   * Get extraction statistics for a project
   */
  getStatistics(projectId?: string): Promise<ExtractionJobStatistics>;

  /**
   * Bulk cancel all pending/running jobs for a project
   */
  bulkCancelJobs(
    projectId?: string
  ): Promise<{ cancelled: number; message: string }>;

  /**
   * Bulk delete all completed/failed/cancelled jobs for a project
   */
  bulkDeleteJobs(
    projectId?: string
  ): Promise<{ deleted: number; message: string }>;

  /**
   * Bulk retry all failed jobs for a project
   */
  bulkRetryJobs(
    projectId?: string
  ): Promise<{ retried: number; message: string }>;
}

/**
 * Create extraction jobs API client
 *
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @param defaultProjectId - Current project ID to use when a call omits one
 * @returns Extraction jobs client
 */
export function createExtractionJobsClient(
  apiBase: string,
  fetchJson: <T, B = unknown>(url: string, init?: any) => Promise<T>,
  defaultProjectId?: string
): ExtractionJobsClient {
  return {
    async listJobs(projectId?: string, params: ListExtractionJobsParams = {}) {
      const resolvedProjectId = projectId ?? defaultProjectId;

      if (!resolvedProjectId) {
        throw new Error('Project ID is required to list extraction jobs');
      }

      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.source_type)
        queryParams.set('source_type', params.source_type);
      if (params.source_id) queryParams.set('source_id', params.source_id);
      if (params.page) queryParams.set('page', params.page.toString());
      if (params.limit) queryParams.set('limit', params.limit.toString());

      const query = queryParams.toString();
      const url = `${apiBase}/api/admin/extraction-jobs/projects/${resolvedProjectId}?${query}`;

      const response = await fetchJson<ExtractionJobListResponseRaw>(url);
      return {
        ...response,
        jobs: response.jobs.map(normalizeJob),
      };
    },

    async getJob(jobId: string) {
      const url = `${apiBase}/api/admin/extraction-jobs/${jobId}`;

      return fetchJson<ExtractionJobResponse>(url).then(normalizeJob);
    },

    async createJob(payload: CreateExtractionJobPayload) {
      const resolvedProjectId = payload.project_id ?? defaultProjectId;

      if (!resolvedProjectId) {
        throw new Error('Project ID is required to create an extraction job');
      }

      return fetchJson<ExtractionJobResponse>(
        `${apiBase}/api/admin/extraction-jobs`,
        {
          method: 'POST',
          body: {
            ...payload,
            project_id: resolvedProjectId,
          },
        }
      ).then(normalizeJob);
    },

    async updateJob(jobId: string, payload: UpdateExtractionJobPayload) {
      const url = `${apiBase}/api/admin/extraction-jobs/${jobId}`;

      return fetchJson<ExtractionJobResponse>(url, {
        method: 'PATCH',
        body: payload,
      }).then(normalizeJob);
    },

    async deleteJob(jobId: string) {
      const url = `${apiBase}/api/admin/extraction-jobs/${jobId}`;

      return fetchJson<void>(url, {
        method: 'DELETE',
      });
    },

    async cancelJob(jobId: string) {
      const url = `${apiBase}/api/admin/extraction-jobs/${jobId}/cancel`;

      return fetchJson<ExtractionJobResponse>(url, {
        method: 'POST',
      }).then(normalizeJob);
    },

    async retryJob(jobId: string) {
      const url = `${apiBase}/api/admin/extraction-jobs/${jobId}/retry`;

      return fetchJson<ExtractionJobResponse>(url, {
        method: 'POST',
      }).then(normalizeJob);
    },

    async getStatistics(projectId?: string) {
      const resolvedProjectId = projectId ?? defaultProjectId;

      if (!resolvedProjectId) {
        throw new Error(
          'Project ID is required to fetch extraction job statistics'
        );
      }

      return fetchJson<ExtractionJobStatistics>(
        `${apiBase}/api/admin/extraction-jobs/projects/${resolvedProjectId}/statistics`
      );
    },

    async bulkCancelJobs(projectId?: string) {
      const resolvedProjectId = projectId ?? defaultProjectId;

      if (!resolvedProjectId) {
        throw new Error('Project ID is required to bulk cancel jobs');
      }

      return fetchJson<{ cancelled: number; message: string }>(
        `${apiBase}/api/admin/extraction-jobs/projects/${resolvedProjectId}/bulk-cancel`,
        { method: 'POST' }
      );
    },

    async bulkDeleteJobs(projectId?: string) {
      const resolvedProjectId = projectId ?? defaultProjectId;

      if (!resolvedProjectId) {
        throw new Error('Project ID is required to bulk delete jobs');
      }

      return fetchJson<{ deleted: number; message: string }>(
        `${apiBase}/api/admin/extraction-jobs/projects/${resolvedProjectId}/bulk-delete`,
        { method: 'DELETE' }
      );
    },

    async bulkRetryJobs(projectId?: string) {
      const resolvedProjectId = projectId ?? defaultProjectId;

      if (!resolvedProjectId) {
        throw new Error('Project ID is required to bulk retry jobs');
      }

      return fetchJson<{ retried: number; message: string }>(
        `${apiBase}/api/admin/extraction-jobs/projects/${resolvedProjectId}/bulk-retry`,
        { method: 'POST' }
      );
    },
  };
}

type ExtractionJobResponse = ExtractionJob & { org_id?: string | null };
type ExtractionJobListResponseRaw = Omit<ExtractionJobListResponse, 'jobs'> & {
  jobs: ExtractionJobResponse[];
};

function normalizeJob(job: ExtractionJobResponse): ExtractionJob {
  // organization_id is optional - can be derived from project_id if needed
  const organizationId = job.organization_id ?? job.org_id ?? undefined;

  const { org_id, ...rest } = job;
  return {
    ...rest,
    organization_id: organizationId,
  };
}
