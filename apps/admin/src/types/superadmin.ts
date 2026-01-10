export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface UserOrgMembership {
  orgId: string;
  orgName: string;
  role: string;
  joinedAt: string;
}

export interface SuperadminUser {
  id: string;
  zitadelUserId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  primaryEmail: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  organizations: UserOrgMembership[];
}

export interface ListUsersResponse {
  users: SuperadminUser[];
  meta: PaginationMeta;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  orgId?: string;
}

export interface SuperadminOrg {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface ListOrgsResponse {
  organizations: SuperadminOrg[];
  meta: PaginationMeta;
}

export interface ViewAsState {
  active: boolean;
  targetUserId: string | null;
  targetUserEmail: string | null;
  targetUserName: string | null;
}

// Embedding Jobs Types
export type EmbeddingJobType = 'graph' | 'chunk';
export type EmbeddingJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface EmbeddingJob {
  id: string;
  type: EmbeddingJobType;
  targetId: string;
  projectId?: string;
  projectName?: string;
  status: EmbeddingJobStatus;
  attemptCount: number;
  lastError?: string;
  priority: number;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddingJobStats {
  graphTotal: number;
  graphPending: number;
  graphCompleted: number;
  graphFailed: number;
  graphWithErrors: number;
  chunkTotal: number;
  chunkPending: number;
  chunkCompleted: number;
  chunkFailed: number;
  chunkWithErrors: number;
}

export interface ListEmbeddingJobsResponse {
  jobs: EmbeddingJob[];
  stats: EmbeddingJobStats;
  meta: PaginationMeta;
}

export interface ListEmbeddingJobsParams {
  page?: number;
  limit?: number;
  type?: EmbeddingJobType;
  status?: EmbeddingJobStatus;
  hasError?: boolean;
  projectId?: string;
}

export interface DeleteEmbeddingJobsResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}

export interface CleanupOrphanJobsResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}

// Extraction Jobs Types
export type ExtractionJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'requires_review';

export type ExtractionJobType =
  | 'full_extraction'
  | 'incremental'
  | 'reprocessing'
  | 'chunk_extraction';

export interface ExtractionJob {
  id: string;
  projectId: string;
  projectName?: string;
  documentId?: string;
  documentName?: string;
  chunkId?: string;
  jobType: string;
  status: ExtractionJobStatus;
  objectsCreated: number;
  relationshipsCreated: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
}

export interface ExtractionJobStats {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  withErrors: number;
  totalObjectsCreated: number;
  totalRelationshipsCreated: number;
}

export interface ListExtractionJobsResponse {
  jobs: ExtractionJob[];
  stats: ExtractionJobStats;
  meta: PaginationMeta;
}

export interface ListExtractionJobsParams {
  page?: number;
  limit?: number;
  status?: ExtractionJobStatus;
  jobType?: ExtractionJobType;
  projectId?: string;
  hasError?: boolean;
}

export interface DeleteExtractionJobsResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}

export interface CancelExtractionJobsResponse {
  success: boolean;
  cancelledCount: number;
  message: string;
}

// Document Parsing Jobs Types (Conversion Jobs)
export type DocumentParsingJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retry_pending';

export interface DocumentParsingJob {
  id: string;
  organizationId: string;
  organizationName?: string;
  projectId: string;
  projectName?: string;
  status: DocumentParsingJobStatus;
  sourceType: string;
  sourceFilename?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  storageKey?: string;
  documentId?: string;
  extractionJobId?: string;
  parsedContentLength?: number;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface DocumentParsingJobStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retryPending: number;
  withErrors: number;
  totalFileSizeBytes: number;
}

export interface ListDocumentParsingJobsResponse {
  jobs: DocumentParsingJob[];
  stats: DocumentParsingJobStats;
  meta: PaginationMeta;
}

export interface ListDocumentParsingJobsParams {
  page?: number;
  limit?: number;
  status?: DocumentParsingJobStatus;
  projectId?: string;
  hasError?: boolean;
}

export interface DeleteDocumentParsingJobsResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}

export interface RetryDocumentParsingJobsResponse {
  success: boolean;
  retriedCount: number;
  message: string;
}

// Data Source Sync Jobs Types
export type SyncJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SyncJobLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: Record<string, any>;
}

export interface SyncJob {
  id: string;
  integrationId: string;
  integrationName?: string;
  projectId: string;
  projectName?: string;
  providerType?: string;
  status: SyncJobStatus;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  currentPhase?: string;
  statusMessage?: string;
  errorMessage?: string;
  triggerType: 'manual' | 'scheduled';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SyncJobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  withErrors: number;
  totalItemsImported: number;
}

export interface ListSyncJobsResponse {
  jobs: SyncJob[];
  stats: SyncJobStats;
  meta: PaginationMeta;
}

export interface ListSyncJobsParams {
  page?: number;
  limit?: number;
  status?: SyncJobStatus;
  projectId?: string;
  hasError?: boolean;
}

export interface DeleteSyncJobsResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}

export interface CancelSyncJobsResponse {
  success: boolean;
  cancelledCount: number;
  message: string;
}

export interface SyncJobLogsResponse {
  id: string;
  status: SyncJobStatus;
  logs: SyncJobLogEntry[];
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
