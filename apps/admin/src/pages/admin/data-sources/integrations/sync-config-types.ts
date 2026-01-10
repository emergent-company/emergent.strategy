/**
 * Sync Configuration Types
 *
 * TypeScript types for the Named Sync Configurations feature (V2).
 * These types mirror the backend DTOs in data-source-integration.dto.ts.
 */

/**
 * Email filter options for sync
 */
export interface EmailFilters {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
  seen?: boolean;
  flagged?: boolean;
  folders?: string[];
}

/**
 * Folder reference for Drive/ClickUp sync
 */
export interface FolderRef {
  id: string;
  name: string;
}

/**
 * Sync options that can be saved in a configuration
 */
export interface SyncOptions {
  limit?: number;
  filters?: EmailFilters;
  incrementalOnly?: boolean;
  selectedFolders?: FolderRef[];
  excludedFolders?: FolderRef[];
}

/**
 * Schedule configuration for automated sync runs
 */
export interface SyncSchedule {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt?: string;
  nextRunAt?: string;
}

/**
 * Full sync configuration (response from API)
 */
export interface SyncConfiguration {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  options: SyncOptions;
  schedule?: SyncSchedule;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for creating a new sync configuration
 */
export interface CreateSyncConfigurationPayload {
  name: string;
  description?: string;
  isDefault?: boolean;
  options: SyncOptions;
  schedule?: SyncSchedule;
}

/**
 * Payload for updating a sync configuration
 */
export interface UpdateSyncConfigurationPayload {
  name?: string;
  description?: string;
  isDefault?: boolean;
  options?: SyncOptions;
  schedule?: SyncSchedule;
}

/**
 * Response from listing sync configurations
 */
export interface SyncConfigurationListResponse {
  configurations: SyncConfiguration[];
  total: number;
}

/**
 * Sync job response (extended with configuration info)
 */
export interface SyncJobDto {
  id: string;
  integrationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  currentPhase: string | null;
  statusMessage: string | null;
  documentIds: string[];
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    details?: Record<string, any>;
  }>;
  errorMessage: string | null;
  triggerType: 'manual' | 'scheduled';
  configurationId: string | null;
  configurationName: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
