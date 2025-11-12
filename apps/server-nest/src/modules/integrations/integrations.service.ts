import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EncryptionService } from './encryption.service';
import { IntegrationRegistryService } from './integration-registry.service';
import { Integration } from '../../entities/integration.entity';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
  IntegrationDto,
  ListIntegrationsDto,
  PublicIntegrationDto,
} from './dto/integration.dto';
import { ImportConfig, ImportResult } from './base-integration';
import { randomBytes } from 'crypto';

/**
 * Integrations Service
 *
 * Manages third-party integration configurations
 * - CRUD operations for integrations
 * - Encryption/decryption of sensitive settings
 * - Webhook secret generation
 * - Project-scoped integration management
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
    private readonly registry: IntegrationRegistryService
  ) {}

  /**
   * Create a new integration
   */
  async createIntegration(
    projectId: string,
    orgId: string,
    dto: CreateIntegrationDto
  ): Promise<IntegrationDto> {
    this.logger.log(
      `Creating integration ${dto.name} for project ${projectId}`
    );

    // Check if integration already exists for this project (use Repository)
    const existing = await this.integrationRepo.findOne({
      where: { name: dto.name, projectId },
    });

    if (existing) {
      throw new ConflictException(
        `Integration ${dto.name} already exists for this project`
      );
    }

    // Generate webhook secret if not provided
    const webhookSecret = dto.webhook_secret || this.generateWebhookSecret();

    // Encrypt settings if provided
    let encryptedSettings: string | null = null;
    let settingsBytes: Buffer | null = null;
    if (dto.settings) {
      encryptedSettings = await this.encryption.encrypt(dto.settings);
      // When encryption key is not set, encrypt() returns plain JSON string
      // We need to convert it to bytes for the BYTEA column
      if (this.encryption.isConfigured()) {
        // Encrypted: decode base64 to bytes
        settingsBytes = Buffer.from(encryptedSettings, 'base64');
      } else {
        // Not encrypted: convert JSON string to bytes (UTF-8)
        settingsBytes = Buffer.from(encryptedSettings, 'utf-8');
      }
    }

    // Use DataSource.query for BYTEA handling with base64 encoding
    // TypeORM Repository doesn't handle BYTEA → base64 conversion well
    const result = await this.dataSource.query<any>(
      `INSERT INTO kb.integrations (
                name,
                display_name,
                description,
                enabled,
                org_id,
                project_id,
                settings_encrypted,
                logo_url,
                webhook_secret,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING 
                id, name, display_name, description, enabled, org_id as organization_id, project_id,
                encode(settings_encrypted, 'base64') as settings_encrypted,
                logo_url, webhook_secret, created_at, updated_at, created_by`,
      [
        dto.name,
        dto.display_name,
        dto.description || null,
        dto.enabled ?? false,
        orgId,
        projectId,
        settingsBytes,
        dto.logo_url || null,
        webhookSecret,
        dto.created_by || null,
      ]
    );

    const integration = result[0];
    this.logger.log(`Created integration ${integration.id}`);

    return this.mapRowToDto(integration);
  }

  /**
   * Get integration by name and project
   */
  async getIntegration(
    name: string,
    projectId: string,
    orgId: string
  ): Promise<IntegrationDto> {
    // Use DataSource.query for BYTEA → base64 conversion
    const result = await this.dataSource.query<any>(
      `SELECT 
                id, name, display_name, description, enabled, org_id as organization_id, project_id,
                encode(settings_encrypted, 'base64') as settings_encrypted,
                logo_url, webhook_secret, created_at, updated_at, created_by
             FROM kb.integrations 
             WHERE name = $1 AND project_id = $2 AND org_id = $3`,
      [name, projectId, orgId]
    );

    if (!result.length) {
      throw new NotFoundException(`Integration ${name} not found`);
    }

    return this.mapRowToDto(result[0]);
  }

  /**
   * Get integration by ID
   */
  async getIntegrationById(
    id: string,
    projectId: string,
    orgId: string
  ): Promise<IntegrationDto> {
    // Use DataSource.query for BYTEA → base64 conversion
    const result = await this.dataSource.query<any>(
      `SELECT 
                id, name, display_name, description, enabled, org_id as organization_id, project_id,
                encode(settings_encrypted, 'base64') as settings_encrypted,
                logo_url, webhook_secret, created_at, updated_at, created_by
             FROM kb.integrations 
             WHERE id = $1 AND project_id = $2 AND org_id = $3`,
      [id, projectId, orgId]
    );

    if (!result.length) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    return this.mapRowToDto(result[0]);
  }

  /**
   * List all integrations for a project
   */
  async listIntegrations(
    projectId: string,
    orgId: string,
    filters?: ListIntegrationsDto
  ): Promise<IntegrationDto[]> {
    let query = `
            SELECT 
                id, name, display_name, description, enabled, org_id as organization_id, project_id,
                encode(settings_encrypted, 'base64') as settings_encrypted,
                logo_url, webhook_secret, created_at, updated_at, created_by
            FROM kb.integrations 
            WHERE project_id = $1 AND org_id = $2
        `;
    const params: any[] = [projectId, orgId];
    let paramIndex = 3;

    if (filters?.name) {
      query += ` AND name = $${paramIndex}`;
      params.push(filters.name);
      paramIndex++;
    }

    if (filters?.enabled !== undefined) {
      query += ` AND enabled = $${paramIndex}`;
      params.push(filters.enabled);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    // Use DataSource.query for BYTEA → base64 conversion
    const result = await this.dataSource.query<any>(query, params);

    return Promise.all(result.map((row: any) => this.mapRowToDto(row)));
  }

  /**
   * Update integration
   */
  async updateIntegration(
    name: string,
    projectId: string,
    orgId: string,
    dto: UpdateIntegrationDto
  ): Promise<IntegrationDto> {
    this.logger.log(`Updating integration ${name} for project ${projectId}`);

    // Get existing integration
    const existing = await this.getIntegration(name, projectId, orgId);

    // Encrypt settings if provided
    let encryptedSettings: string | null = null;
    let settingsBytes: Buffer | null = null;
    if (dto.settings) {
      encryptedSettings = await this.encryption.encrypt(dto.settings);
      // When encryption key is not set, encrypt() returns plain JSON string
      // We need to convert it to bytes for the BYTEA column
      if (this.encryption.isConfigured()) {
        // Encrypted: decode base64 to bytes
        settingsBytes = Buffer.from(encryptedSettings, 'base64');
      } else {
        // Not encrypted: convert JSON string to bytes (UTF-8)
        settingsBytes = Buffer.from(encryptedSettings, 'utf-8');
      }
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (dto.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(dto.display_name);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(dto.description);
    }
    if (dto.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      params.push(dto.enabled);
    }
    if (settingsBytes) {
      updates.push(`settings_encrypted = $${paramIndex++}`);
      params.push(settingsBytes);
    }
    if (dto.logo_url !== undefined) {
      updates.push(`logo_url = $${paramIndex++}`);
      params.push(dto.logo_url);
    }
    if (dto.webhook_secret !== undefined) {
      updates.push(`webhook_secret = $${paramIndex++}`);
      params.push(dto.webhook_secret);
    }

    if (updates.length === 0) {
      return existing;
    }

    // Add WHERE clause params
    params.push(name, projectId, orgId);

    // Use DataSource.query for BYTEA handling
    const result = await this.dataSource.query<any>(
      `UPDATE kb.integrations 
             SET ${updates.join(', ')}
             WHERE name = $${paramIndex} AND project_id = $${
        paramIndex + 1
      } AND org_id = $${paramIndex + 2}
             RETURNING 
                id, name, display_name, description, enabled, org_id as organization_id, project_id,
                encode(settings_encrypted, 'base64') as settings_encrypted,
                logo_url, webhook_secret, created_at, updated_at, created_by`,
      params
    );

    if (!result.length) {
      throw new NotFoundException(`Integration ${name} not found`);
    }

    this.logger.log(`Updated integration ${name}`);
    return this.mapRowToDto(result[0]);
  }

  /**
   * Delete integration
   */
  async deleteIntegration(
    name: string,
    projectId: string,
    orgId: string
  ): Promise<void> {
    this.logger.log(`Deleting integration ${name} for project ${projectId}`);

    // Use Repository for simple delete operation
    const result = await this.integrationRepo.delete({
      name,
      projectId,
      organizationId: orgId,
    });

    if (!result.affected) {
      throw new NotFoundException(`Integration ${name} not found`);
    }

    this.logger.log(`Deleted integration ${name}`);
  }

  /**
   * Get public integration info (without sensitive settings)
   */
  async getPublicIntegrationInfo(
    name: string,
    projectId: string,
    orgId: string
  ): Promise<PublicIntegrationDto> {
    const integration = await this.getIntegration(name, projectId, orgId);

    return {
      name: integration.name,
      display_name: integration.display_name,
      description: integration.description,
      enabled: integration.enabled,
      logo_url: integration.logo_url,
      has_configuration: !!integration.settings,
    };
  }

  /**
   * Test integration connection
   *
   * Validates credentials by calling the integration's validateConfiguration method
   */
  async testConnection(
    name: string,
    projectId: string,
    orgId: string
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.log(`Testing connection for integration ${name}`);

    try {
      // Get integration configuration
      const integration = await this.getIntegration(name, projectId, orgId);

      // Get integration instance from registry
      const integrationInstance = this.registry.getIntegration(
        integration.name
      );
      if (!integrationInstance) {
        throw new NotFoundException(
          `Integration type '${integration.name}' not found in registry`
        );
      }

      // Configure and validate
      await integrationInstance.configure(integration);
      const isValid = await integrationInstance.validateConfiguration();

      return { success: isValid };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Connection test failed for ${name}: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Trigger integration sync/import
   *
   * Manually trigger a full import from the integration
   */
  async triggerSync(
    name: string,
    projectId: string,
    orgId: string,
    config?: ImportConfig
  ): Promise<ImportResult> {
    this.logger.log(`Triggering sync for integration ${name}`);

    // Get integration configuration
    const integration = await this.getIntegration(name, projectId, orgId);

    if (!integration.enabled) {
      throw new BadRequestException('Integration is disabled');
    }

    // Get integration instance from registry
    const integrationInstance = this.registry.getIntegration(integration.name);
    if (!integrationInstance) {
      throw new NotFoundException(
        `Integration type '${integration.name}' not found in registry`
      );
    }

    // Check if integration supports import
    const capabilities = integrationInstance.getCapabilities();
    if (!capabilities.supportsImport) {
      throw new BadRequestException(
        `Integration '${integration.name}' does not support data import`
      );
    }

    // Configure and run import
    await integrationInstance.configure(integration);
    const result = await integrationInstance.runFullImport(config);

    this.logger.log(
      `Sync completed for ${name}: ${result.totalImported} imported, ` +
        `${result.totalFailed} failed`
    );

    return result;
  }

  /**
   * Trigger sync with real-time progress updates
   */
  async triggerSyncWithProgress(
    name: string,
    projectId: string,
    orgId: string,
    config: ImportConfig,
    onProgress: (progress: {
      step: string;
      message: string;
      count?: number;
    }) => void
  ): Promise<ImportResult> {
    this.logger.log(`Triggering sync with progress for integration ${name}`);

    // Get integration configuration
    const integration = await this.getIntegration(name, projectId, orgId);

    if (!integration.enabled) {
      throw new BadRequestException('Integration is disabled');
    }

    // Get integration instance from registry
    const integrationInstance = this.registry.getIntegration(integration.name);
    if (!integrationInstance) {
      throw new NotFoundException(
        `Integration type '${integration.name}' not found in registry`
      );
    }

    // Check if integration supports import
    const capabilities = integrationInstance.getCapabilities();
    if (!capabilities.supportsImport) {
      throw new BadRequestException(
        `Integration '${integration.name}' does not support data import`
      );
    }

    // Configure integration
    await integrationInstance.configure(integration);

    // Run import with progress callback
    const result = await integrationInstance.runFullImportWithProgress(
      config,
      onProgress
    );

    this.logger.log(
      `Sync completed for ${name}: ${result.totalImported} imported, ` +
        `${result.totalFailed} failed`
    );

    return result;
  }

  /**
   * Get ClickUp workspace structure for list selection UI
   *
   * Fetches hierarchical structure: Workspace → Spaces → Folders → Lists
   * with task counts for each list.
   */
  async getClickUpWorkspaceStructure(
    projectId: string,
    orgId: string
  ): Promise<any> {
    this.logger.log(
      `Fetching ClickUp workspace structure for project ${projectId}`
    );

    // Get ClickUp integration configuration
    const integration = await this.getIntegration('clickup', projectId, orgId);

    if (!integration.enabled) {
      throw new BadRequestException('ClickUp integration is disabled');
    }

    // Get ClickUp integration instance from registry
    const clickupIntegration = this.registry.getIntegration('clickup');
    if (!clickupIntegration) {
      throw new NotFoundException('ClickUp integration not found in registry');
    }

    // Configure and fetch structure
    await clickupIntegration.configure(integration);

    // Call the getWorkspaceStructure method we added to ClickUpIntegration
    const structure = await (clickupIntegration as any).getWorkspaceStructure();

    this.logger.log(`Workspace structure fetched successfully`);
    return structure;
  }

  /**
   * Get ClickUp space details
   *
   * Fetches details for a specific ClickUp space by ID
   */
  async getClickUpSpace(
    projectId: string,
    orgId: string,
    spaceId: string
  ): Promise<any> {
    this.logger.log(
      `Fetching ClickUp space ${spaceId} for project ${projectId}`
    );

    // Get ClickUp integration configuration
    const integration = await this.getIntegration('clickup', projectId, orgId);

    if (!integration.enabled) {
      throw new BadRequestException('ClickUp integration is disabled');
    }

    // Get ClickUp integration instance from registry
    const clickupIntegration = this.registry.getIntegration('clickup');
    if (!clickupIntegration) {
      throw new NotFoundException('ClickUp integration not found in registry');
    }

    // Configure the integration
    await clickupIntegration.configure(integration);

    // Get the API client and fetch space details
    const apiClient = (clickupIntegration as any).apiClient;
    if (!apiClient) {
      throw new BadRequestException('ClickUp API client not initialized');
    }

    if (!integration.settings?.workspace_id) {
      throw new BadRequestException('ClickUp workspace ID not configured');
    }

    // Fetch all spaces and find the one we need
    const workspaceId = integration.settings.workspace_id;
    const spacesResponse = await apiClient.getSpaces(workspaceId, false);
    const space = spacesResponse.spaces.find((s: any) => s.id === spaceId);

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    this.logger.log(`Space ${spaceId} fetched successfully: ${space.name}`);
    return { id: space.id, name: space.name };
  }

  /**
   * Get ClickUp folder details
   *
   * Fetches details for a specific ClickUp folder by ID
   */
  async getClickUpFolder(
    projectId: string,
    orgId: string,
    folderId: string
  ): Promise<any> {
    this.logger.log(
      `Fetching ClickUp folder ${folderId} for project ${projectId}`
    );

    // Get ClickUp integration configuration
    const integration = await this.getIntegration('clickup', projectId, orgId);

    if (!integration.enabled) {
      throw new BadRequestException('ClickUp integration is disabled');
    }

    // Get ClickUp integration instance from registry
    const clickupIntegration = this.registry.getIntegration('clickup');
    if (!clickupIntegration) {
      throw new NotFoundException('ClickUp integration not found in registry');
    }

    // Configure the integration
    await clickupIntegration.configure(integration);

    // Get the API client and fetch folder details
    const apiClient = (clickupIntegration as any).apiClient;
    if (!apiClient) {
      throw new BadRequestException('ClickUp API client not initialized');
    }

    // Fetch folder details directly
    const folder = await apiClient.getFolder(folderId);

    this.logger.log(`Folder ${folderId} fetched successfully: ${folder.name}`);
    return { id: folder.id, name: folder.name };
  }

  /**
   * Generate a secure webhook secret
   */
  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Map database row to DTO with decrypted settings
   */
  private async mapRowToDto(row: any): Promise<IntegrationDto> {
    const dto: IntegrationDto = {
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      enabled: row.enabled,
      organization_id: row.organization_id,
      project_id: row.project_id,
      logo_url: row.logo_url,
      webhook_secret: row.webhook_secret,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
    };

    // Decrypt settings if present
    if (row.settings_encrypted) {
      try {
        dto.settings = await this.encryption.decrypt(row.settings_encrypted);
      } catch (error) {
        this.logger.error(
          `Failed to decrypt settings for integration ${dto.id}`,
          error
        );
        dto.settings = {};
      }
    }

    return dto;
  }
}
