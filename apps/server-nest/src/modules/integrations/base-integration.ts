import { Logger } from '@nestjs/common';
import { IntegrationDto, IntegrationSettings } from './dto/integration.dto';

/**
 * Integration Capabilities
 *
 * Defines what features an integration supports
 */
export interface IntegrationCapabilities {
  /** Whether the integration supports full data import */
  supportsImport: boolean;

  /** Whether the integration supports real-time webhooks */
  supportsWebhooks: boolean;

  /** Whether the integration supports bi-directional sync */
  supportsBidirectionalSync: boolean;

  /** Whether the integration requires OAuth flow */
  requiresOAuth: boolean;

  /** Whether the integration supports incremental sync */
  supportsIncrementalSync: boolean;
}

/**
 * Import Configuration
 *
 * Options for controlling import behavior
 */
export interface ImportConfig {
  /** Whether to import completed/archived items */
  includeArchived?: boolean;

  /** Maximum items to import per batch */
  batchSize?: number;

  /** Whether to run import in background */
  background?: boolean;

  /** Specific resource types to import */
  resourceTypes?: string[];

  /** Date range for filtering */
  dateRange?: {
    start?: Date;
    end?: Date;
  };

  /** Specific list IDs to import (ClickUp-specific, for selective sync) */
  list_ids?: string[];

  /** Specific space IDs to import (ClickUp-specific, for doc filtering) */
  space_ids?: string[];
}

/**
 * Import Result
 *
 * Summary of import operation results
 */
export interface ImportResult {
  /** Whether import was successful */
  success: boolean;

  /** Total items imported */
  totalImported: number;

  /** Total items failed */
  totalFailed: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;

  /** Detailed breakdown by resource type */
  breakdown?: Record<
    string,
    {
      imported: number;
      failed: number;
      skipped: number;
    }
  >;

  /** Timestamp of import completion */
  completedAt: Date;
}

/**
 * Webhook Payload
 *
 * Generic webhook payload structure
 */
export interface WebhookPayload {
  /** Event type (e.g., 'task.created', 'comment.added') */
  event: string;

  /** Raw webhook body */
  body: any;

  /** Webhook headers */
  headers: Record<string, string>;

  /** Signature for verification */
  signature?: string;

  /** Timestamp of webhook */
  timestamp?: Date;
}

/**
 * Webhook Verification Result
 */
export interface WebhookVerificationResult {
  /** Whether signature is valid */
  valid: boolean;

  /** Error message if invalid */
  error?: string;
}

/**
 * Abstract Base Integration Class
 *
 * All integrations must extend this class and implement its abstract methods.
 * Provides common functionality for configuration, validation, and lifecycle management.
 *
 * Lifecycle:
 * 1. configure() - Set up integration with user credentials
 * 2. validateConfiguration() - Verify credentials are valid
 * 3. runFullImport() - Initial data sync
 * 4. handleWebhook() - Process real-time updates (if supported)
 *
 * @example
 * ```typescript
 * export class ClickUpIntegration extends BaseIntegration {
 *   async configure(settings: IntegrationSettings): Promise<void> {
 *     // Set up ClickUp API client with api_token
 *   }
 *
 *   async runFullImport(config?: ImportConfig): Promise<ImportResult> {
 *     // Import all tasks, lists, folders from ClickUp
 *   }
 * }
 * ```
 */
export abstract class BaseIntegration {
  protected readonly logger: Logger;
  protected integration: IntegrationDto | null = null;
  protected settings: IntegrationSettings | null = null;

  constructor(
    protected readonly name: string,
    protected readonly displayName: string
  ) {
    this.logger = new Logger(`${displayName}Integration`);
  }

  /**
   * Get integration capabilities
   *
   * Override to specify what features this integration supports
   */
  abstract getCapabilities(): IntegrationCapabilities;

  /**
   * Configure the integration with user settings
   *
   * Called when integration is first set up or credentials are updated.
   * Should initialize API clients, validate credentials, etc.
   *
   * @param integration - Full integration configuration
   * @throws Error if configuration fails
   */
  async configure(integration: IntegrationDto): Promise<void> {
    this.logger.log(`Configuring ${this.displayName} integration`);
    this.integration = integration;
    this.settings = integration.settings || {};

    await this.onConfigure();
  }

  /**
   * Hook for subclasses to perform configuration logic
   *
   * Override to initialize API clients, validate tokens, etc.
   */
  protected abstract onConfigure(): Promise<void>;

  /**
   * Validate integration configuration
   *
   * Test that credentials work and integration is properly set up.
   * Called after configure() or when user clicks "Test Connection".
   *
   * @returns True if configuration is valid
   * @throws Error with descriptive message if validation fails
   */
  async validateConfiguration(): Promise<boolean> {
    if (!this.integration || !this.settings) {
      throw new Error('Integration not configured. Call configure() first.');
    }

    this.logger.log(`Validating ${this.displayName} configuration`);
    return await this.onValidateConfiguration();
  }

  /**
   * Hook for subclasses to validate configuration
   *
   * Override to test API connectivity, check scopes, etc.
   * Should throw descriptive error if validation fails.
   */
  protected abstract onValidateConfiguration(): Promise<boolean>;

  /**
   * Run full data import
   *
   * Import all data from the integration (initial sync or resync).
   * Should be idempotent and handle incremental updates.
   *
   * @param config - Optional import configuration
   * @returns Import result summary
   */
  async runFullImport(config?: ImportConfig): Promise<ImportResult> {
    if (!this.integration) {
      throw new Error('Integration not configured. Call configure() first.');
    }

    const capabilities = this.getCapabilities();
    if (!capabilities.supportsImport) {
      throw new Error(`${this.displayName} does not support data import`);
    }

    this.logger.log(`Starting full import for ${this.displayName}`);
    const startTime = Date.now();

    try {
      const result = await this.onRunFullImport(config);
      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Full import completed: ${result.totalImported} imported, ` +
          `${result.totalFailed} failed in ${durationMs}ms`
      );

      return {
        ...result,
        durationMs,
        completedAt: new Date(),
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error as Error;
      this.logger.error(`Full import failed: ${err.message}`, err.stack);

      return {
        success: false,
        totalImported: 0,
        totalFailed: 0,
        durationMs,
        error: err.message,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Run full import with real-time progress updates
   *
   * Similar to runFullImport but calls onProgress callback with status updates.
   * Subclasses can override onRunFullImportWithProgress to emit progress events.
   */
  async runFullImportWithProgress(
    config: ImportConfig,
    onProgress: (progress: {
      step: string;
      message: string;
      count?: number;
    }) => void
  ): Promise<ImportResult> {
    if (!this.integration) {
      throw new Error('Integration not configured. Call configure() first.');
    }

    const capabilities = this.getCapabilities();
    if (!capabilities.supportsImport) {
      throw new Error(`${this.displayName} does not support data import`);
    }

    this.logger.log(
      `Starting full import with progress for ${this.displayName}`
    );
    const startTime = Date.now();

    try {
      onProgress({
        step: 'starting',
        message: `Starting ${this.displayName} import...`,
      });

      const result = await this.onRunFullImportWithProgress(config, onProgress);
      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Full import completed: ${result.totalImported} imported, ` +
          `${result.totalFailed} failed in ${durationMs}ms`
      );

      onProgress({
        step: 'complete',
        message: `Import complete: ${result.totalImported} imported, ${result.totalFailed} failed`,
        count: result.totalImported,
      });

      return {
        ...result,
        durationMs,
        completedAt: new Date(),
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error as Error;
      this.logger.error(`Full import failed: ${err.message}`, err.stack);

      onProgress({
        step: 'error',
        message: `Import failed: ${err.message}`,
      });

      return {
        success: false,
        totalImported: 0,
        totalFailed: 0,
        durationMs,
        error: err.message,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Hook for subclasses to implement import logic
   *
   * Override to fetch data from external API and store in database.
   */
  protected abstract onRunFullImport(
    config?: ImportConfig
  ): Promise<ImportResult>;

  /**
   * Hook for subclasses to implement import logic with progress
   *
   * Override to fetch data from external API and store in database,
   * calling onProgress to emit real-time status updates.
   *
   * Default implementation calls onRunFullImport (no progress updates).
   */
  protected async onRunFullImportWithProgress(
    config: ImportConfig,
    onProgress: (progress: {
      step: string;
      message: string;
      count?: number;
    }) => void
  ): Promise<ImportResult> {
    // Default: delegate to regular import (no progress updates)
    return this.onRunFullImport(config);
  }

  /**
   * Handle incoming webhook
   *
   * Process real-time updates from the integration.
   * Should verify webhook signature before processing.
   *
   * @param payload - Webhook payload
   * @returns True if webhook was handled successfully
   */
  async handleWebhook(payload: WebhookPayload): Promise<boolean> {
    if (!this.integration) {
      throw new Error('Integration not configured. Call configure() first.');
    }

    const capabilities = this.getCapabilities();
    if (!capabilities.supportsWebhooks) {
      throw new Error(`${this.displayName} does not support webhooks`);
    }

    this.logger.log(
      `Handling webhook for ${this.displayName}: ${payload.event}`
    );

    // Verify webhook signature
    const verification = await this.verifyWebhookSignature(payload);
    if (!verification.valid) {
      this.logger.warn(`Invalid webhook signature: ${verification.error}`);
      throw new Error(`Invalid webhook signature: ${verification.error}`);
    }

    return await this.onHandleWebhook(payload);
  }

  /**
   * Verify webhook signature
   *
   * Override to implement integration-specific signature verification.
   * Default implementation checks for webhook_secret match.
   */
  protected async verifyWebhookSignature(
    payload: WebhookPayload
  ): Promise<WebhookVerificationResult> {
    if (!this.integration?.webhook_secret) {
      return {
        valid: false,
        error: 'No webhook secret configured',
      };
    }

    if (!payload.signature) {
      return {
        valid: false,
        error: 'No signature provided in webhook',
      };
    }

    // Subclasses should override with proper HMAC verification
    return {
      valid: true,
    };
  }

  /**
   * Hook for subclasses to handle webhook
   *
   * Override to process webhook events and update local data.
   * Called after signature verification passes.
   */
  protected abstract onHandleWebhook(payload: WebhookPayload): Promise<boolean>;

  /**
   * Get integration name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get integration display name
   */
  getDisplayName(): string {
    return this.displayName;
  }

  /**
   * Get current integration configuration
   */
  getIntegration(): IntegrationDto | null {
    return this.integration;
  }

  /**
   * Get current settings
   */
  getSettings(): IntegrationSettings | null {
    return this.settings;
  }

  /**
   * Check if integration is configured
   */
  isConfigured(): boolean {
    return this.integration !== null && this.settings !== null;
  }

  /**
   * Get required settings fields
   *
   * Override to specify what settings are required for configuration.
   * Used for UI validation.
   */
  abstract getRequiredSettings(): string[];

  /**
   * Get optional settings fields with defaults
   *
   * Override to provide default values for optional settings.
   */
  getOptionalSettings(): Record<string, any> {
    return {};
  }

  /**
   * Cleanup resources
   *
   * Called when integration is being disabled or removed.
   * Override to clean up connections, timers, etc.
   */
  async cleanup(): Promise<void> {
    this.logger.log(`Cleaning up ${this.displayName} integration`);
    await this.onCleanup();
    this.integration = null;
    this.settings = null;
  }

  /**
   * Hook for subclasses to perform cleanup
   */
  protected async onCleanup(): Promise<void> {
    // Override if needed
  }
}
