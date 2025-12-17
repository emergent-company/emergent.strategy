import { ExternalSourceType, SyncPolicy } from '../../../entities';

/**
 * Reference to an external source, parsed from a URL
 */
export interface ExternalSourceReference {
  /** Provider type (google_drive, dropbox, url, etc.) */
  providerType: ExternalSourceType;

  /** Provider-specific ID (e.g., Google Drive file ID) */
  externalId: string;

  /** Original URL as provided by user */
  originalUrl: string;

  /** Normalized/canonical URL for deduplication */
  normalizedUrl: string;
}

/**
 * Result of checking access to an external source
 */
export interface AccessCheckResult {
  /** Whether the source is accessible */
  accessible: boolean;

  /** Reason for inaccessibility */
  reason?:
    | 'not_found'
    | 'permission_denied'
    | 'rate_limited'
    | 'unsupported_type'
    | 'network_error';

  /** Partial metadata if available during access check */
  metadata?: Partial<SourceMetadata>;
}

/**
 * Metadata about an external source
 */
export interface SourceMetadata {
  /** Display name of the source */
  name: string;

  /** MIME type of the content */
  mimeType: string;

  /** Size in bytes */
  size: number;

  /** Last modified timestamp */
  modifiedAt: Date;

  /** ETag or version identifier for change detection */
  etag?: string;

  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>;
}

/**
 * Content fetched from an external source
 */
export interface FetchedContent {
  /** Content data (text or binary) */
  content: string | Buffer;

  /** MIME type of the fetched content */
  mimeType: string;

  /** Character encoding (for text content) */
  encoding?: string;

  /** Filename to use for the document */
  filename?: string;
}

/**
 * Result of checking for updates
 */
export interface UpdateCheckResult {
  /** Whether there are updates available */
  hasUpdates: boolean;

  /** New ETag if available */
  newEtag?: string;

  /** New modified timestamp if available */
  newModifiedAt?: Date;
}

/**
 * Rate limit configuration for a provider
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;

  /** Maximum requests per day (optional) */
  requestsPerDay?: number;

  /** Whether to use backoff on rate limit response */
  backoffOnRateLimit: boolean;
}

/**
 * Interface for external source providers
 *
 * Providers implement this interface to support importing documents
 * from external sources like Google Drive, Dropbox, URLs, etc.
 */
export interface ExternalSourceProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: ExternalSourceType;

  /**
   * Human-readable provider name
   */
  readonly displayName: string;

  /**
   * Check if this provider can handle the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Parse URL into an external source reference
   * @returns Reference or null if URL cannot be parsed
   */
  parseUrl(url: string): ExternalSourceReference | null;

  /**
   * Check if the external source is accessible
   */
  checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult>;

  /**
   * Fetch metadata about the external source
   */
  fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata>;

  /**
   * Fetch content from the external source
   */
  fetchContent(ref: ExternalSourceReference): Promise<FetchedContent>;

  /**
   * Check if the source has been updated since last sync
   */
  checkForUpdates(
    ref: ExternalSourceReference,
    lastSync: Date,
    lastEtag?: string
  ): Promise<UpdateCheckResult>;

  /**
   * Get the default sync policy for this provider
   */
  getDefaultSyncPolicy(): SyncPolicy;

  /**
   * Get rate limit configuration for this provider
   */
  getRateLimitConfig(): RateLimitConfig;
}

/**
 * Error codes for external source operations
 */
export enum ExternalSourceErrorCode {
  SOURCE_NOT_ACCESSIBLE = 'SOURCE_NOT_ACCESSIBLE',
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INVALID_URL = 'INVALID_URL',
  CONTENT_FETCH_FAILED = 'CONTENT_FETCH_FAILED',
}

/**
 * Custom error for external source operations
 */
export class ExternalSourceError extends Error {
  constructor(
    public readonly code: ExternalSourceErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExternalSourceError';
  }
}
