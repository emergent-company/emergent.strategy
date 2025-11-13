import { Injectable, Logger } from '@nestjs/common';
import {
  BaseIntegration,
  IntegrationCapabilities,
  ImportConfig,
  ImportResult,
  WebhookPayload,
} from '../integrations/base-integration';
import {
  IntegrationDto,
  IntegrationSettings,
} from '../integrations/dto/integration.dto';
import { ClickUpApiClient } from './clickup-api.client';
import { ClickUpImportService } from './clickup-import.service';
import { ClickUpWebhookHandler } from './clickup-webhook.handler';
import * as crypto from 'crypto';

/**
 * ClickUp Integration Settings
 */
export interface ClickUpSettings extends IntegrationSettings {
  /** ClickUp API token */
  api_token: string;

  /** ClickUp workspace (team) ID */
  workspace_id: string;

  /** Whether to import completed/archived tasks */
  import_completed_tasks?: boolean;

  /** Whether to import comments */
  import_comments?: boolean;

  /** Whether to import custom fields */
  import_custom_fields?: boolean;

  /** Maximum tasks to import per batch */
  batch_size?: number;
}

/**
 * ClickUp Integration
 *
 * Integrates ClickUp workspace data into the knowledge base.
 *
 * Features:
 * - Full hierarchical import (Workspace → Space → Folder → List → Task)
 * - Real-time webhook updates
 * - Incremental sync support
 * - Custom field mapping
 * - User mapping
 * - Comment import
 *
 * Data Mapping:
 * - ClickUp Workspace → Organization
 * - ClickUp Space → Project sections
 * - ClickUp Folder → Document collections
 * - ClickUp List → Document collections
 * - ClickUp Task → Document
 * - ClickUp Comment → Document chunk (comment type)
 *
 * @see docs/spec/22-clickup-integration.md
 */
@Injectable()
export class ClickUpIntegration extends BaseIntegration {
  protected readonly logger = new Logger(ClickUpIntegration.name);
  private clickupSettings: ClickUpSettings | null = null;

  constructor(
    private readonly apiClient: ClickUpApiClient,
    private readonly importService: ClickUpImportService,
    private readonly webhookHandler: ClickUpWebhookHandler
  ) {
    super('clickup', 'ClickUp');
  }

  /**
   * Get integration capabilities
   */
  getCapabilities(): IntegrationCapabilities {
    return {
      supportsImport: true,
      supportsWebhooks: true,
      supportsBidirectionalSync: false, // Future feature
      requiresOAuth: false, // Uses API token
      supportsIncrementalSync: true,
    };
  }

  /**
   * Configure integration with API token
   */
  protected async onConfigure(): Promise<void> {
    if (!this.integration?.settings) {
      throw new Error('Integration settings are required');
    }

    this.logger.log(
      `Configuring ClickUp with settings: ${JSON.stringify(
        Object.keys(this.integration.settings)
      )}`
    );

    this.clickupSettings = this.integration.settings as ClickUpSettings;

    // Validate required settings
    if (!this.clickupSettings.api_token) {
      this.logger.error(
        `ClickUp settings: ${JSON.stringify(this.clickupSettings)}`
      );
      throw new Error('ClickUp API token is required in settings');
    }

    if (!this.clickupSettings.workspace_id) {
      throw new Error('ClickUp workspace ID is required in settings');
    }

    this.logger.log(
      `API token present: ${
        this.clickupSettings.api_token
          ? `Yes (${this.clickupSettings.api_token.substring(0, 10)}...)`
          : 'No'
      }`
    );
    this.logger.log(`Workspace ID: ${this.clickupSettings.workspace_id}`);

    // Configure API client
    this.apiClient.configure(this.clickupSettings.api_token);

    this.logger.log(
      `Configured ClickUp integration for workspace ${this.clickupSettings.workspace_id}`
    );
  }

  /**
   * Validate configuration by testing API connection
   */
  protected async onValidateConfiguration(): Promise<boolean> {
    if (!this.clickupSettings) {
      throw new Error('Integration not configured');
    }

    try {
      // Test connection by fetching workspaces
      const response = await this.apiClient.getWorkspaces();

      // Verify the configured workspace exists
      const workspace = response.teams.find(
        (t) => t.id === this.clickupSettings!.workspace_id
      );
      if (!workspace) {
        throw new Error(
          `Workspace ${this.clickupSettings.workspace_id} not found. ` +
            `Available workspaces: ${response.teams
              .map((t) => `${t.name} (${t.id})`)
              .join(', ')}`
        );
      }

      this.logger.log(
        `Successfully connected to ClickUp workspace: ${workspace.name}`
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Configuration validation failed: ${err.message}`);
      throw new Error(`ClickUp connection failed: ${err.message}`);
    }
  }

  /**
   * Run full import of ClickUp data
   */
  protected async onRunFullImport(
    config?: ImportConfig
  ): Promise<ImportResult> {
    if (!this.integration || !this.clickupSettings) {
      throw new Error('Integration not configured');
    }

    this.logger.log(
      `Starting full import from ClickUp workspace ${this.clickupSettings.workspace_id}`
    );

    // Merge config with integration settings
    const importConfig: ImportConfig = {
      includeArchived: this.clickupSettings.import_completed_tasks ?? false,
      batchSize: this.clickupSettings.batch_size ?? 100,
      ...config,
    };

    // Run import via import service
    return await this.importService.runFullImport(
      this.integration.id,
      this.integration.project_id,
      this.integration.organization_id,
      this.clickupSettings.workspace_id,
      importConfig
    );
  }

  /**
   * Run full import with progress updates
   */
  protected async onRunFullImportWithProgress(
    config: ImportConfig,
    onProgress: (progress: {
      step: string;
      message: string;
      count?: number;
    }) => void
  ): Promise<ImportResult> {
    if (!this.integration || !this.clickupSettings) {
      throw new Error('Integration not configured');
    }

    this.logger.log(
      `Starting full import with progress from ClickUp workspace ${this.clickupSettings.workspace_id}`
    );

    // Merge config with integration settings
    const importConfig: ImportConfig = {
      includeArchived: this.clickupSettings.import_completed_tasks ?? false,
      batchSize: this.clickupSettings.batch_size ?? 100,
      ...config,
    };

    // Run import with progress via import service
    return await this.importService.runFullImportWithProgress(
      this.integration.id,
      this.integration.project_id,
      this.integration.organization_id,
      this.clickupSettings.workspace_id,
      importConfig,
      onProgress
    );
  }

  /**
   * Handle incoming webhook
   */
  protected async onHandleWebhook(payload: WebhookPayload): Promise<boolean> {
    if (!this.integration) {
      throw new Error('Integration not configured');
    }

    return await this.webhookHandler.handleWebhook(
      this.integration.id,
      this.integration.project_id,
      this.integration.organization_id,
      payload
    );
  }

  /**
   * Verify ClickUp webhook signature
   *
   * ClickUp uses HMAC-SHA256 signature verification.
   * Signature is in the 'X-Signature' header.
   */
  protected async verifyWebhookSignature(
    payload: WebhookPayload
  ): Promise<{ valid: boolean; error?: string }> {
    if (!this.integration?.webhook_secret) {
      return {
        valid: false,
        error: 'No webhook secret configured',
      };
    }

    const signature =
      payload.headers['x-signature'] || payload.headers['X-Signature'];
    if (!signature) {
      return {
        valid: false,
        error: 'No X-Signature header found in webhook',
      };
    }

    try {
      // ClickUp sends the raw request body signed with HMAC-SHA256
      const rawBody =
        typeof payload.body === 'string'
          ? payload.body
          : JSON.stringify(payload.body);

      const expectedSignature = crypto
        .createHmac('sha256', this.integration.webhook_secret)
        .update(rawBody)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        return {
          valid: false,
          error: 'Signature mismatch',
        };
      }

      return { valid: true };
    } catch (error) {
      const err = error as Error;
      return {
        valid: false,
        error: `Signature verification failed: ${err.message}`,
      };
    }
  }

  /**
   * Get required settings
   */
  getRequiredSettings(): string[] {
    return ['api_token', 'workspace_id'];
  }

  /**
   * Get optional settings with defaults
   */
  getOptionalSettings(): Record<string, any> {
    return {
      import_completed_tasks: false,
      import_comments: true,
      import_custom_fields: true,
      batch_size: 100,
    };
  }

  /**
   * Get workspace structure for list selection UI
   *
   * Returns hierarchical structure: Workspace → Spaces → Folders → Lists
   * Includes task counts for each list.
   *
   * @returns Workspace structure with spaces, folders, and lists
   */
  async getWorkspaceStructure(): Promise<any> {
    if (!this.integration || !this.clickupSettings) {
      throw new Error('Integration not configured');
    }

    this.logger.log(
      `Fetching workspace structure for ${this.clickupSettings.workspace_id}`
    );

    // Always fetch non-archived spaces/folders/lists for the workspace structure UI
    // The includeArchived parameter controls which spaces/folders/lists to show, not tasks
    return await this.importService.fetchWorkspaceStructure(
      this.clickupSettings.workspace_id,
      false // includeArchived - always false for the selection UI
    );
  }

  /**
   * Cleanup resources
   */
  protected async onCleanup(): Promise<void> {
    // Reset API client if needed
    this.clickupSettings = null;
  }
}
