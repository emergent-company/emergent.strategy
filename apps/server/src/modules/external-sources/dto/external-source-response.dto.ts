import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExternalSourceType,
  SyncPolicy,
  ExternalSourceStatus,
} from '../../../entities';

/**
 * Response DTO for an external source
 */
export class ExternalSourceResponseDto {
  @ApiProperty({ description: 'Unique identifier' })
  id: string;

  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiProperty({
    description: 'Provider type',
    enum: ['google_drive', 'dropbox', 'url', 'notion', 'confluence'],
  })
  providerType: ExternalSourceType;

  @ApiProperty({ description: 'External ID (provider-specific)' })
  externalId: string;

  @ApiProperty({ description: 'Original URL as provided' })
  originalUrl: string;

  @ApiProperty({ description: 'Normalized URL for deduplication' })
  normalizedUrl: string;

  @ApiPropertyOptional({ description: 'Display name' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'MIME type' })
  mimeType: string | null;

  @ApiProperty({
    description: 'Sync policy',
    enum: ['manual', 'on_access', 'periodic', 'webhook'],
  })
  syncPolicy: SyncPolicy;

  @ApiPropertyOptional({ description: 'Sync interval in minutes' })
  syncIntervalMinutes: number | null;

  @ApiPropertyOptional({ description: 'Last time source was checked' })
  lastCheckedAt: Date | null;

  @ApiPropertyOptional({ description: 'Last successful sync time' })
  lastSyncedAt: Date | null;

  @ApiProperty({
    description: 'Current status',
    enum: ['active', 'error', 'disabled'],
  })
  status: ExternalSourceStatus;

  @ApiProperty({ description: 'Number of consecutive errors' })
  errorCount: number;

  @ApiPropertyOptional({ description: 'Last error message' })
  lastError: string | null;

  @ApiPropertyOptional({ description: 'Last error timestamp' })
  lastErrorAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Number of documents from this source' })
  documentCount?: number;

  @ApiPropertyOptional({ description: 'Latest document ID' })
  latestDocumentId?: string;
}

/**
 * Result of an import operation
 */
export class ImportResultDto {
  @ApiProperty({ description: 'Whether the import was successful' })
  success: boolean;

  @ApiPropertyOptional({ description: 'External source ID (if created/found)' })
  externalSourceId?: string;

  @ApiPropertyOptional({ description: 'Document ID (if created immediately)' })
  documentId?: string;

  @ApiProperty({
    description: 'Import status',
    enum: ['created', 'duplicate', 'queued', 'error', 'updated'],
  })
  status: 'created' | 'duplicate' | 'queued' | 'error' | 'updated';

  @ApiPropertyOptional({ description: 'Job ID (if queued for background)' })
  jobId?: string;

  @ApiPropertyOptional({ description: 'Error message (if failed)' })
  error?: string;

  @ApiPropertyOptional({ description: 'Additional details' })
  details?: Record<string, unknown>;
}

/**
 * Result of a sync operation
 */
export class SyncResultDto {
  @ApiProperty({ description: 'Whether sync was successful' })
  success: boolean;

  @ApiProperty({ description: 'Whether content was updated' })
  updated: boolean;

  @ApiPropertyOptional({ description: 'New document ID (if updated)' })
  documentId?: string;

  @ApiPropertyOptional({ description: 'Error message (if failed)' })
  error?: string;

  @ApiPropertyOptional({ description: 'New ETag (if available)' })
  newEtag?: string;

  @ApiPropertyOptional({ description: 'Content modification time' })
  modifiedAt?: Date;
}

/**
 * Paginated list of external sources
 */
export class ExternalSourceListDto {
  @ApiProperty({
    type: [ExternalSourceResponseDto],
    description: 'List of external sources',
  })
  items: ExternalSourceResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiPropertyOptional({ description: 'Cursor for next page' })
  nextCursor: string | null;
}
