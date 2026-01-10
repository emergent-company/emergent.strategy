import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DataSourceIntegration } from '../../entities/data-source-integration.entity';
import { EncryptionService } from '../integrations/encryption.service';
import { DataSourceProviderRegistry } from './providers/provider.registry';
import {
  CreateDataSourceIntegrationDto,
  UpdateDataSourceIntegrationDto,
  ListDataSourceIntegrationsDto,
  DataSourceIntegrationDto,
  BrowseRequestDto,
  ImportRequestDto,
  ImportResultDto,
  TestConnectionResultDto,
  SyncOptionsDto,
  SyncPreviewDto,
  UpdateFolderConfigDto,
  FolderCountResponseDto,
  SyncConfigurationDto,
  SyncConfigurationListDto,
  CreateSyncConfigurationDto,
  UpdateSyncConfigurationDto,
} from './dto/data-source-integration.dto';
import {
  BrowseResult,
  ImportItem,
  SyncOptions,
} from './providers/provider.interface';

/**
 * Data Source Integrations Service
 *
 * Manages data source integrations (IMAP, etc.) that import content as documents.
 * - CRUD operations for integrations
 * - Encryption/decryption of configuration
 * - Delegation to provider implementations for browse/import
 */
@Injectable()
export class DataSourceIntegrationsService {
  private readonly logger = new Logger(DataSourceIntegrationsService.name);

  constructor(
    @InjectRepository(DataSourceIntegration)
    private readonly integrationRepo: Repository<DataSourceIntegration>,
    private readonly encryption: EncryptionService,
    private readonly providerRegistry: DataSourceProviderRegistry
  ) {}

  /**
   * Create a new data source integration
   */
  async create(
    projectId: string,
    dto: CreateDataSourceIntegrationDto,
    createdBy?: string
  ): Promise<DataSourceIntegrationDto> {
    this.logger.log(
      `Creating ${dto.providerType} integration "${dto.name}" for project ${projectId}`
    );

    // Verify provider exists
    if (!this.providerRegistry.hasProvider(dto.providerType)) {
      throw new BadRequestException(
        `Unknown provider type: ${
          dto.providerType
        }. Available providers: ${this.providerRegistry
          .listProviders()
          .map((p) => p.providerType)
          .join(', ')}`
      );
    }

    // Encrypt configuration
    const configEncrypted = await this.encryption.encrypt(dto.config as any);

    // Calculate next sync time if recurring
    let nextSyncAt: Date | null = null;
    if (dto.syncMode === 'recurring' && dto.syncIntervalMinutes) {
      nextSyncAt = new Date();
      nextSyncAt.setMinutes(nextSyncAt.getMinutes() + dto.syncIntervalMinutes);
    }

    // Create integration
    const integration = this.integrationRepo.create({
      projectId,
      providerType: dto.providerType,
      sourceType: dto.sourceType,
      name: dto.name,
      description: dto.description || null,
      configEncrypted,
      syncMode: dto.syncMode || 'manual',
      syncIntervalMinutes: dto.syncIntervalMinutes || null,
      nextSyncAt,
      createdBy: createdBy || null,
    });

    const saved = await this.integrationRepo.save(integration);
    this.logger.log(`Created integration ${saved.id}`);

    return this.mapToDto(saved);
  }

  /**
   * Get a data source integration by ID
   */
  async getById(
    id: string,
    projectId: string
  ): Promise<DataSourceIntegrationDto> {
    const integration = await this.integrationRepo.findOne({
      where: { id, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    return this.mapToDto(integration);
  }

  /**
   * List data source integrations for a project
   */
  async list(
    projectId: string,
    filters?: ListDataSourceIntegrationsDto
  ): Promise<DataSourceIntegrationDto[]> {
    const query = this.integrationRepo
      .createQueryBuilder('i')
      .where('i.projectId = :projectId', { projectId });

    if (filters?.providerType) {
      query.andWhere('i.providerType = :providerType', {
        providerType: filters.providerType,
      });
    }

    if (filters?.sourceType) {
      query.andWhere('i.sourceType = :sourceType', {
        sourceType: filters.sourceType,
      });
    }

    if (filters?.status) {
      query.andWhere('i.status = :status', { status: filters.status });
    }

    query.orderBy('i.createdAt', 'DESC');

    const integrations = await query.getMany();
    const includeConfigs = filters?.includeConfigurations === true;

    return integrations.map((i) => this.mapToDto(i, includeConfigs));
  }

  /**
   * Update a data source integration
   */
  async update(
    id: string,
    projectId: string,
    dto: UpdateDataSourceIntegrationDto
  ): Promise<DataSourceIntegrationDto> {
    const integration = await this.integrationRepo.findOne({
      where: { id, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    // Update fields
    if (dto.name !== undefined) {
      integration.name = dto.name;
    }

    if (dto.description !== undefined) {
      integration.description = dto.description;
    }

    if (dto.config) {
      // Merge with existing config or replace entirely
      let existingConfig: Record<string, any> = {};
      if (integration.configEncrypted) {
        try {
          existingConfig = await this.encryption.decrypt(
            integration.configEncrypted
          );
        } catch {
          // If decryption fails, start fresh
        }
      }

      const mergedConfig = { ...existingConfig, ...dto.config };
      integration.configEncrypted = await this.encryption.encrypt(
        mergedConfig as any
      );
    }

    if (dto.syncMode !== undefined) {
      integration.syncMode = dto.syncMode;
    }

    if (dto.syncIntervalMinutes !== undefined) {
      integration.syncIntervalMinutes = dto.syncIntervalMinutes;
    }

    if (dto.status !== undefined) {
      integration.status = dto.status;
      // Clear error state if setting to active
      if (dto.status === 'active') {
        integration.errorMessage = null;
        integration.errorCount = 0;
      }
    }

    // Recalculate next sync time if needed
    if (
      integration.syncMode === 'recurring' &&
      integration.syncIntervalMinutes
    ) {
      const lastSync = integration.lastSyncedAt || new Date();
      integration.nextSyncAt = new Date(
        lastSync.getTime() + integration.syncIntervalMinutes * 60 * 1000
      );
    } else {
      integration.nextSyncAt = null;
    }

    const saved = await this.integrationRepo.save(integration);
    this.logger.log(`Updated integration ${id}`);

    return this.mapToDto(saved);
  }

  /**
   * Delete a data source integration
   */
  async delete(id: string, projectId: string): Promise<void> {
    const result = await this.integrationRepo.delete({ id, projectId });

    if (!result.affected) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    this.logger.log(`Deleted integration ${id}`);
  }

  /**
   * Test connection for an integration
   */
  async testConnection(
    id: string,
    projectId: string
  ): Promise<TestConnectionResultDto> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const provider = this.getProvider(integration.entity.providerType);

    this.logger.log(`Testing connection for integration ${id}`);
    const result = await provider.testConnection(integration.config);

    // Update status based on result
    if (!result.success) {
      await this.integrationRepo.update(
        { id },
        {
          status: 'error',
          errorMessage: result.error || 'Connection test failed',
          lastErrorAt: new Date(),
          errorCount: () => 'error_count + 1',
        }
      );
    } else {
      // Clear error state on successful connection
      await this.integrationRepo.update(
        { id },
        {
          status: 'active',
          errorMessage: null,
          errorCount: 0,
        }
      );
    }

    return result;
  }

  /**
   * Browse content available in the data source
   */
  async browse(
    id: string,
    projectId: string,
    options: BrowseRequestDto
  ): Promise<BrowseResult> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const provider = this.getProvider(integration.entity.providerType);

    this.logger.log(`Browsing integration ${id}, folder: ${options.folder}`);

    return provider.browse(integration.config, {
      folder: options.folder,
      offset: options.offset,
      limit: options.limit,
      filters: options.filters,
    });
  }

  /**
   * Import items from the data source
   */
  async import(
    id: string,
    projectId: string,
    request: ImportRequestDto
  ): Promise<ImportResultDto> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const provider = this.getProvider(integration.entity.providerType);

    this.logger.log(
      `Importing ${request.itemIds.length} items from integration ${id}`
    );

    const items: ImportItem[] = request.itemIds.map((itemId) => ({
      id: itemId,
      metadata: request.options,
    }));

    const result = await provider.import(
      integration.config,
      items,
      projectId,
      id
    );

    // Update last synced timestamp
    await this.integrationRepo.update(
      { id },
      {
        lastSyncedAt: new Date(),
        // Calculate next sync time if recurring
        nextSyncAt:
          integration.entity.syncMode === 'recurring' &&
          integration.entity.syncIntervalMinutes
            ? new Date(
                Date.now() + integration.entity.syncIntervalMinutes * 60 * 1000
              )
            : null,
      }
    );

    this.logger.log(
      `Import complete: ${result.totalImported} imported, ${result.totalFailed} failed, ${result.totalSkipped} skipped`
    );

    return result;
  }

  /**
   * Trigger manual sync for an integration
   */
  async triggerSync(
    id: string,
    projectId: string,
    options?: SyncOptionsDto
  ): Promise<ImportResultDto> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const provider = this.getProvider(integration.entity.providerType);

    this.logger.log(
      `Triggering sync for integration ${id} with options: ${JSON.stringify(
        options || {}
      )}`
    );

    // Build sync options
    const syncOptions: SyncOptions = {
      limit: options?.limit || 100, // Default limit of 100
      filters: options?.filters,
      incrementalOnly: options?.incrementalOnly !== false, // Default true
    };

    // For Google Drive, handle folder selection (override or saved config)
    let configToUse = integration.config;
    if (integration.entity.providerType === 'google_drive') {
      if (options?.selectedFolders) {
        // Manual sync with override - use provided selections
        configToUse = {
          ...integration.config,
          selectedFolders: options.selectedFolders,
          excludedFolders: options.excludedFolders || [],
          folderMode: 'specific',
        };
        this.logger.log(
          `Google Drive sync with override: ${
            options.selectedFolders.length
          } selected, ${options.excludedFolders?.length || 0} excluded`
        );
      } else {
        // Recurring sync or manual without override - use saved config
        this.logger.log(
          `Google Drive sync with saved config: ${
            integration.config.selectedFolders?.length || 0
          } selected, ${
            integration.config.excludedFolders?.length || 0
          } excluded`
        );
      }
    }

    // Get new items since last sync (or all if incremental is false)
    const since =
      syncOptions.incrementalOnly && integration.entity.lastSyncedAt
        ? integration.entity.lastSyncedAt
        : new Date(0);

    const newItems = await provider.getNewItems(
      configToUse,
      since,
      syncOptions
    );

    if (newItems.length === 0) {
      this.logger.log(`No new items to sync for integration ${id}`);
      return {
        totalImported: 0,
        totalFailed: 0,
        totalSkipped: 0,
        documentIds: [],
        errors: [],
      };
    }

    this.logger.log(`Found ${newItems.length} new items to sync`);
    const result = await provider.import(configToUse, newItems, projectId, id);

    // Update last synced timestamp
    await this.integrationRepo.update(
      { id },
      {
        lastSyncedAt: new Date(),
        nextSyncAt:
          integration.entity.syncMode === 'recurring' &&
          integration.entity.syncIntervalMinutes
            ? new Date(
                Date.now() + integration.entity.syncIntervalMinutes * 60 * 1000
              )
            : null,
      }
    );

    return result;
  }

  /**
   * Get sync preview with folder stats and match counts
   */
  async getSyncPreview(
    id: string,
    projectId: string,
    options?: SyncOptionsDto
  ): Promise<SyncPreviewDto> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const provider = this.getProvider(integration.entity.providerType);

    // Check if provider supports sync preview
    if (!provider.getSyncPreview) {
      throw new BadRequestException(
        `Provider ${integration.entity.providerType} does not support sync preview`
      );
    }

    // Count imported documents for this integration
    const importedCount = await this.integrationRepo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('kb.documents', 'd')
      .where('d.data_source_integration_id = :id', { id })
      .getRawOne()
      .then((r) => parseInt(r?.count || '0', 10));

    const syncOptions: SyncOptions = {
      limit: options?.limit,
      filters: options?.filters,
      incrementalOnly: options?.incrementalOnly,
    };

    const preview = await provider.getSyncPreview(
      integration.config,
      syncOptions,
      importedCount,
      integration.entity.lastSyncedAt
    );

    return preview as SyncPreviewDto;
  }

  /**
   * Get distinct source types that have documents in a project
   */
  async getSourceTypesWithDocuments(
    projectId: string
  ): Promise<Array<{ sourceType: string; count: number }>> {
    const result = await this.integrationRepo.manager.query(
      `
      SELECT source_type, COUNT(*) as count
      FROM kb.documents
      WHERE project_id = $1
        AND parent_document_id IS NULL
      GROUP BY source_type
      ORDER BY source_type
    `,
      [projectId]
    );

    return result.map((row: any) => ({
      sourceType: row.source_type,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get saved folder configuration for recurring syncs
   */
  async getFolderConfig(
    id: string,
    projectId: string
  ): Promise<UpdateFolderConfigDto> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const config = integration.config;

    return {
      selectedFolders: config.selectedFolders || [],
      excludedFolders: config.excludedFolders || [],
    };
  }

  /**
   * Update folder configuration for recurring syncs
   * Persists the selected/excluded folders to the integration config
   */
  async updateFolderConfig(
    id: string,
    projectId: string,
    folderConfig: UpdateFolderConfigDto
  ): Promise<void> {
    const integration = await this.getIntegrationWithConfig(id, projectId);

    // Merge folder config with existing config
    const updatedConfig = {
      ...integration.config,
      selectedFolders: folderConfig.selectedFolders,
      excludedFolders: folderConfig.excludedFolders || [],
      folderMode: folderConfig.selectedFolders.length > 0 ? 'specific' : 'all',
    };

    // Encrypt and save
    const configEncrypted = await this.encryption.encrypt(updatedConfig as any);
    await this.integrationRepo.update({ id }, { configEncrypted });

    this.logger.log(
      `Updated folder config for integration ${id}: ${
        folderConfig.selectedFolders.length
      } selected, ${folderConfig.excludedFolders?.length || 0} excluded`
    );
  }

  /**
   * Get estimated file count for a folder (recursive)
   */
  async getFolderFileCount(
    id: string,
    projectId: string,
    folderId: string
  ): Promise<FolderCountResponseDto> {
    const integration = await this.getIntegrationWithConfig(id, projectId);
    const provider = this.getProvider(integration.entity.providerType);

    // Check if provider supports folder file count
    if (!('getFolderFileCount' in provider)) {
      throw new BadRequestException(
        `Provider ${integration.entity.providerType} does not support folder file count`
      );
    }

    const result = await (provider as any).getFolderFileCount(
      integration.config,
      folderId
    );

    return {
      folderId,
      estimatedCount: result.estimatedCount,
      isExact: result.isExact,
    };
  }

  // ============ Sync Configuration Methods ============

  /**
   * List all sync configurations for an integration
   */
  async listSyncConfigurations(
    integrationId: string,
    projectId: string
  ): Promise<SyncConfigurationListDto> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    const configurations = this.getSyncConfigurationsFromMetadata(integration);

    return {
      configurations,
      total: configurations.length,
    };
  }

  /**
   * Get a single sync configuration by ID
   */
  async getSyncConfiguration(
    integrationId: string,
    projectId: string,
    configId: string
  ): Promise<SyncConfigurationDto> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    const configurations = this.getSyncConfigurationsFromMetadata(integration);
    const config = configurations.find((c) => c.id === configId);

    if (!config) {
      throw new NotFoundException(`Sync configuration ${configId} not found`);
    }

    return config;
  }

  /**
   * Create a new sync configuration
   */
  async createSyncConfiguration(
    integrationId: string,
    projectId: string,
    dto: CreateSyncConfigurationDto,
    userId?: string
  ): Promise<SyncConfigurationDto> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    const configurations = this.getSyncConfigurationsFromMetadata(integration);

    // Validate unique name (case-insensitive)
    this.validateUniqueConfigName(configurations, dto.name);

    const now = new Date().toISOString();
    const isFirstConfig = configurations.length === 0;

    // Create new configuration
    const newConfig: SyncConfigurationDto = {
      id: randomUUID(),
      name: dto.name,
      description: dto.description,
      // First config becomes default automatically, otherwise use provided value
      isDefault: isFirstConfig ? true : dto.isDefault === true,
      options: dto.options,
      schedule: dto.schedule,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    // If this config is being set as default, unset all others
    if (newConfig.isDefault && !isFirstConfig) {
      configurations.forEach((c) => (c.isDefault = false));
    }

    configurations.push(newConfig);
    await this.saveSyncConfigurationsToMetadata(integrationId, configurations);

    this.logger.log(
      `Created sync configuration "${dto.name}" for integration ${integrationId}`
    );

    return newConfig;
  }

  /**
   * Update an existing sync configuration
   */
  async updateSyncConfiguration(
    integrationId: string,
    projectId: string,
    configId: string,
    dto: UpdateSyncConfigurationDto,
    userId?: string
  ): Promise<SyncConfigurationDto> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    const configurations = this.getSyncConfigurationsFromMetadata(integration);
    const configIndex = configurations.findIndex((c) => c.id === configId);

    if (configIndex === -1) {
      throw new NotFoundException(`Sync configuration ${configId} not found`);
    }

    const config = configurations[configIndex];

    // Validate unique name if changing (case-insensitive, excluding self)
    if (dto.name !== undefined && dto.name !== config.name) {
      this.validateUniqueConfigName(configurations, dto.name, configId);
    }

    // Update fields
    if (dto.name !== undefined) {
      config.name = dto.name;
    }
    if (dto.description !== undefined) {
      config.description = dto.description;
    }
    if (dto.options !== undefined) {
      config.options = dto.options;
    }
    if (dto.schedule !== undefined) {
      config.schedule = dto.schedule;
    }

    // Handle default toggle
    if (dto.isDefault === true && !config.isDefault) {
      // Setting this as default - unset all others
      configurations.forEach((c) => (c.isDefault = false));
      config.isDefault = true;
    } else if (dto.isDefault === false && config.isDefault) {
      // Unsetting default - first remaining becomes default
      config.isDefault = false;
      const firstOther = configurations.find((c) => c.id !== configId);
      if (firstOther) {
        firstOther.isDefault = true;
      }
    }

    config.updatedBy = userId;
    config.updatedAt = new Date().toISOString();

    await this.saveSyncConfigurationsToMetadata(integrationId, configurations);

    this.logger.log(
      `Updated sync configuration "${config.name}" for integration ${integrationId}`
    );

    return config;
  }

  /**
   * Delete a sync configuration
   */
  async deleteSyncConfiguration(
    integrationId: string,
    projectId: string,
    configId: string
  ): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    const configurations = this.getSyncConfigurationsFromMetadata(integration);
    const configIndex = configurations.findIndex((c) => c.id === configId);

    if (configIndex === -1) {
      throw new NotFoundException(`Sync configuration ${configId} not found`);
    }

    const wasDefault = configurations[configIndex].isDefault;
    const configName = configurations[configIndex].name;

    // Remove the configuration
    configurations.splice(configIndex, 1);

    // If deleted config was default, assign default to first remaining
    if (wasDefault && configurations.length > 0) {
      configurations[0].isDefault = true;
    }

    await this.saveSyncConfigurationsToMetadata(integrationId, configurations);

    this.logger.log(
      `Deleted sync configuration "${configName}" from integration ${integrationId}`
    );
  }

  /**
   * Get the default sync configuration for an integration
   */
  async getDefaultSyncConfiguration(
    integrationId: string,
    projectId: string
  ): Promise<SyncConfigurationDto | null> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    const configurations = this.getSyncConfigurationsFromMetadata(integration);
    return configurations.find((c) => c.isDefault) || null;
  }

  // ---------- Sync Configuration Helpers ----------

  /**
   * Extract sync configurations from integration metadata
   */
  private getSyncConfigurationsFromMetadata(
    integration: DataSourceIntegration
  ): SyncConfigurationDto[] {
    const metadata = integration.metadata || {};
    const configs = metadata.syncConfigurations;

    if (!Array.isArray(configs)) {
      return [];
    }

    return configs as SyncConfigurationDto[];
  }

  /**
   * Save sync configurations to integration metadata using JSONB merge
   */
  private async saveSyncConfigurationsToMetadata(
    integrationId: string,
    configurations: SyncConfigurationDto[]
  ): Promise<void> {
    // Use raw query to properly merge JSONB without overwriting other metadata fields
    await this.integrationRepo.manager.query(
      `
      UPDATE kb.data_source_integrations
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = NOW()
      WHERE id = $2
      `,
      [JSON.stringify({ syncConfigurations: configurations }), integrationId]
    );
  }

  /**
   * Validate that a configuration name is unique within the integration (case-insensitive)
   * @throws ConflictException if name already exists
   */
  private validateUniqueConfigName(
    configurations: SyncConfigurationDto[],
    name: string,
    excludeId?: string
  ): void {
    const normalizedName = name.toLowerCase().trim();
    const existing = configurations.find(
      (c) =>
        c.name.toLowerCase().trim() === normalizedName && c.id !== excludeId
    );

    if (existing) {
      throw new ConflictException(
        `A configuration with name '${name}' already exists`
      );
    }
  }

  // ---------- Private helpers ----------

  /**
   * Get integration entity with decrypted config
   */
  private async getIntegrationWithConfig(
    id: string,
    projectId: string
  ): Promise<{
    entity: DataSourceIntegration;
    config: Record<string, any>;
  }> {
    const integration = await this.integrationRepo.findOne({
      where: { id, projectId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    let config: Record<string, any> = {};
    if (integration.configEncrypted) {
      config = await this.encryption.decrypt(integration.configEncrypted);
    }

    return { entity: integration, config };
  }

  /**
   * Get provider instance
   */
  private getProvider(providerType: string) {
    const provider = this.providerRegistry.getProvider(providerType);
    if (!provider) {
      throw new BadRequestException(`Provider ${providerType} not registered`);
    }
    return provider;
  }

  /**
   * Map entity to DTO
   */
  private mapToDto(
    integration: DataSourceIntegration,
    includeConfigurations = false
  ): DataSourceIntegrationDto {
    const dto: DataSourceIntegrationDto = {
      id: integration.id,
      projectId: integration.projectId,
      providerType: integration.providerType,
      sourceType: integration.sourceType,
      name: integration.name,
      description: integration.description,
      syncMode: integration.syncMode,
      syncIntervalMinutes: integration.syncIntervalMinutes,
      lastSyncedAt: integration.lastSyncedAt,
      nextSyncAt: integration.nextSyncAt,
      status: integration.status,
      errorMessage: integration.errorMessage,
      lastErrorAt: integration.lastErrorAt,
      errorCount: integration.errorCount,
      metadata: integration.metadata,
      createdBy: integration.createdBy,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      hasConfig: !!integration.configEncrypted,
    };

    if (includeConfigurations) {
      dto.configurations = this.getSyncConfigurationsFromMetadata(integration);
    }

    return dto;
  }
}
