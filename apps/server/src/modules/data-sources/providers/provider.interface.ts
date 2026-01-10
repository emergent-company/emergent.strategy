/**
 * Data Source Provider Interface
 *
 * Defines the contract for data source providers (IMAP, Gmail API, etc.)
 * that import content as documents into the knowledge base.
 */

/**
 * Browse options for listing available content
 */
export interface BrowseOptions {
  /** Optional folder/path filter */
  folder?: string;

  /** Offset for pagination */
  offset?: number;

  /** Limit for pagination */
  limit?: number;

  /** Filter criteria */
  filters?: Record<string, any>;
}

/**
 * Result from browsing available content
 */
export interface BrowseResult<T = any> {
  /** List of items available for import */
  items: T[];

  /** Total count of items matching criteria */
  total: number;

  /** Whether there are more items */
  hasMore: boolean;

  /** Pagination cursor for next page */
  nextOffset?: number;
}

/**
 * Item to import
 */
export interface ImportItem {
  /** Provider-specific ID of the item */
  id: string;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Result from importing items
 */
export interface ImportResult {
  /** Total number of items successfully imported */
  totalImported: number;

  /** Total number of items that failed to import */
  totalFailed: number;

  /** Total number of items skipped (e.g., duplicates) */
  totalSkipped: number;

  /** Document IDs created during import */
  documentIds: string[];

  /** Errors encountered during import */
  errors: Array<{
    itemId: string;
    error: string;
  }>;
}

/**
 * Test connection result
 */
export interface TestConnectionResult {
  /** Whether the connection was successful */
  success: boolean;

  /** Error message if connection failed */
  error?: string;

  /** Additional info (e.g., server version, mailbox count) */
  info?: Record<string, any>;
}

/**
 * Filter options for email sync
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
 * Log level for sync operations
 */
export type SyncLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger callback for verbose sync logging
 */
export type SyncLogger = (
  level: SyncLogLevel,
  message: string,
  details?: Record<string, any>
) => void;

/**
 * Options for sync preview and sync operations
 */
export interface SyncOptions {
  /** Maximum items to sync */
  limit?: number;

  /** Filter criteria */
  filters?: EmailFilters;

  /** Whether to only sync new items since last sync (default: true) */
  incrementalOnly?: boolean;

  /** Logger callback for verbose logging */
  logger?: SyncLogger;
}

/**
 * Folder statistics
 */
export interface FolderStats {
  path: string;
  name: string;
  totalMessages: number;
  unreadMessages: number;
}

/**
 * Sync preview result
 */
export interface SyncPreviewResult {
  /** Statistics for each folder */
  folders: FolderStats[];

  /** Total emails across all folders */
  totalEmails: number;

  /** Total unread emails */
  totalUnread: number;

  /** Emails matching current filters */
  matchingEmails: number;

  /** Emails already imported */
  importedEmails: number;

  /** New emails available to sync */
  newEmails: number;

  /** Last sync timestamp */
  lastSyncedAt?: Date;

  /** Filters that were applied */
  appliedFilters?: EmailFilters;
}

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  /** Provider type identifier (e.g., 'imap') */
  providerType: string;

  /** Human-readable name (e.g., 'IMAP Email') */
  displayName: string;

  /** Description of the provider */
  description: string;

  /** Source type this provider produces (e.g., 'email') */
  sourceType: string;

  /** Icon identifier (e.g., 'lucide--mail') */
  icon: string;
}

/**
 * Data Source Provider Interface
 *
 * Each provider implementation must implement this interface to:
 * 1. Test connections to the data source
 * 2. Browse available content
 * 3. Import selected items as documents
 * 4. Support incremental sync
 */
export interface DataSourceProvider {
  /**
   * Get provider metadata
   */
  getMetadata(): ProviderMetadata;

  /**
   * Get JSON schema for provider configuration
   * Used to generate forms in the UI
   */
  getConfigSchema(): Record<string, any>;

  /**
   * Test connection with the given configuration
   * @param config - Provider-specific configuration (decrypted)
   */
  testConnection(config: Record<string, any>): Promise<TestConnectionResult>;

  /**
   * Browse available content in the data source
   * @param config - Provider-specific configuration (decrypted)
   * @param options - Browse options (pagination, filters)
   */
  browse(
    config: Record<string, any>,
    options: BrowseOptions
  ): Promise<BrowseResult>;

  /**
   * Import selected items as documents
   * @param config - Provider-specific configuration (decrypted)
   * @param items - Items to import
   * @param projectId - Project to import into
   * @param integrationId - DataSourceIntegration ID
   */
  import(
    config: Record<string, any>,
    items: ImportItem[],
    projectId: string,
    integrationId: string
  ): Promise<ImportResult>;

  /**
   * Get new items since last sync
   * @param config - Provider-specific configuration (decrypted)
   * @param since - Timestamp of last sync
   * @param options - Optional sync options (limit, filters)
   */
  getNewItems(
    config: Record<string, any>,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportItem[]>;

  /**
   * Get sync preview with folder stats and match counts
   * @param config - Provider-specific configuration (decrypted)
   * @param options - Sync options (filters)
   * @param importedCount - Number of already imported emails
   * @param lastSyncedAt - Last sync timestamp
   */
  getSyncPreview?(
    config: Record<string, any>,
    options?: SyncOptions,
    importedCount?: number,
    lastSyncedAt?: Date | null
  ): Promise<SyncPreviewResult>;

  /**
   * Sync items with batch loop logic
   *
   * This method implements the core batch loop to ensure the requested `limit`
   * of NEW (non-duplicate) items are imported. It handles duplicate detection
   * by checking messageId against existing documents and continues fetching
   * until the limit is reached or no more items are available.
   *
   * @param config - Provider-specific configuration (decrypted)
   * @param projectId - Project to import into
   * @param integrationId - DataSourceIntegration ID
   * @param since - Timestamp of last sync (used if incrementalOnly is true)
   * @param options - Sync options (limit, filters, incrementalOnly)
   */
  sync?(
    config: Record<string, any>,
    projectId: string,
    integrationId: string,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportResult>;
}

/**
 * Provider constructor type
 */
export type DataSourceProviderConstructor = new (
  ...args: any[]
) => DataSourceProvider;
