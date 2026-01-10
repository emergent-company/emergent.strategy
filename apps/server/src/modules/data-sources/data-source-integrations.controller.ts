import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DataSourceIntegrationsService } from './data-source-integrations.service';
import {
  DataSourceSyncJobService,
  SyncJobDto,
} from './data-source-sync-job.service';
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
  ProviderMetadataDto,
  OAuthStartRequestDto,
  OAuthStartResponseDto,
  OAuthCallbackQueryDto,
  OAuthCallbackResponseDto,
  OAuthStatusDto,
  SyncModeEnum,
  SyncOptionsDto,
  SyncPreviewDto,
  UpdateFolderConfigDto,
  FolderCountRequestDto,
  FolderCountResponseDto,
  SyncConfigurationDto,
  SyncConfigurationListDto,
  CreateSyncConfigurationDto,
  UpdateSyncConfigurationDto,
} from './dto/data-source-integration.dto';
import { BrowseResult } from './providers/provider.interface';
import { Scopes } from '../auth/scopes.decorator';
import { ScopesGuard } from '../auth/scopes.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  RequireProjectId,
  ProjectContext,
  RequireUserId,
} from '../../common/decorators/project-context.decorator';
import {
  GoogleOAuthService,
  OAuthStatePayload,
} from './providers/gmail-oauth/google-oauth.service';
import { AppConfigService } from '../../common/config/config.service';

/**
 * Data Source Integrations Controller
 *
 * REST API for managing data source integrations (IMAP, Gmail OAuth, etc.)
 */
@Controller('data-source-integrations')
@ApiTags('Data Source Integrations')
@ApiBearerAuth()
export class DataSourceIntegrationsController {
  private readonly logger = new Logger(DataSourceIntegrationsController.name);

  constructor(
    private readonly service: DataSourceIntegrationsService,
    private readonly syncJobService: DataSourceSyncJobService,
    private readonly providerRegistry: DataSourceProviderRegistry,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly config: AppConfigService
  ) {}

  // ==================== OAuth Endpoints ====================
  // Note: These are placed BEFORE parameterized routes to avoid conflicts

  @Get('oauth/status')
  @ApiOperation({ summary: 'Get OAuth configuration status' })
  @ApiResponse({
    status: 200,
    description: 'OAuth configuration status',
    type: OAuthStatusDto,
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  getOAuthStatus(): OAuthStatusDto {
    return {
      provider: 'google',
      configured: this.googleOAuthService.isConfigured(),
      supportedProviders: ['gmail_oauth', 'google_drive'],
    };
  }

  @Post('oauth/google/start')
  @ApiOperation({ summary: 'Start Google OAuth flow' })
  @ApiResponse({
    status: 200,
    description: 'OAuth authorization URL',
    type: OAuthStartResponseDto,
  })
  @ApiResponse({ status: 400, description: 'OAuth not configured' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  startGoogleOAuth(
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string,
    @Body() dto: OAuthStartRequestDto
  ): OAuthStartResponseDto {
    if (!this.googleOAuthService.isConfigured()) {
      throw new BadRequestException(
        'Google OAuth is not configured. Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.'
      );
    }

    // Determine scope type based on provider
    let scopeType: 'gmail' | 'drive' | 'all' = 'gmail';
    if (dto.providerType === 'google_drive') {
      scopeType = 'drive';
    }

    // Build state payload
    const statePayload: OAuthStatePayload = {
      integrationId: dto.integrationId,
      projectId: ctx.projectId,
      userId,
      provider: dto.providerType,
      returnUrl: dto.returnUrl,
      timestamp: Date.now(),
    };

    // Store name/description in metadata for new integrations
    // These will be used in the callback to create the integration
    const metadata: Record<string, any> = {};
    if (dto.name) metadata.name = dto.name;
    if (dto.description) metadata.description = dto.description;
    if (Object.keys(metadata).length > 0) {
      (statePayload as any).metadata = metadata;
    }

    const authUrl = this.googleOAuthService.getAuthorizationUrl(
      statePayload,
      scopeType
    );
    const state = this.googleOAuthService.encodeState(statePayload);

    this.logger.log(
      `Starting Google OAuth for project ${ctx.projectId}, provider ${dto.providerType}`
    );

    return { authUrl, state };
  }

  @Get('oauth/google/callback')
  @ApiOperation({ summary: 'Google OAuth callback handler' })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code',
  })
  @ApiQuery({ name: 'state', required: true, description: 'State parameter' })
  @ApiQuery({ name: 'error', required: false, description: 'Error code' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend' })
  async handleGoogleOAuthCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const frontendBaseUrl =
      process.env.ADMIN_BASE_URL || 'http://localhost:5176';
    let redirectUrl = `${frontendBaseUrl}/data-sources/integrations`;

    try {
      // Handle OAuth errors
      if (query.error) {
        this.logger.error(
          `OAuth error: ${query.error} - ${query.error_description}`
        );
        redirectUrl = `${frontendBaseUrl}/data-sources/integrations/new?error=${encodeURIComponent(
          query.error_description || query.error
        )}`;
        return res.redirect(redirectUrl);
      }

      if (!query.code || !query.state) {
        redirectUrl = `${frontendBaseUrl}/data-sources/integrations/new?error=${encodeURIComponent(
          'Missing authorization code or state'
        )}`;
        return res.redirect(redirectUrl);
      }

      // Decode and validate state
      let statePayload: OAuthStatePayload & { metadata?: Record<string, any> };
      try {
        statePayload = this.googleOAuthService.decodeState(query.state) as any;
      } catch {
        redirectUrl = `${frontendBaseUrl}/data-sources/integrations/new?error=${encodeURIComponent(
          'Invalid state parameter'
        )}`;
        return res.redirect(redirectUrl);
      }

      // Check timestamp (10 minute expiry)
      const maxAge = 10 * 60 * 1000;
      if (Date.now() - statePayload.timestamp > maxAge) {
        redirectUrl = `${frontendBaseUrl}/data-sources/integrations/new?error=${encodeURIComponent(
          'OAuth session expired. Please try again.'
        )}`;
        return res.redirect(redirectUrl);
      }

      // Exchange code for tokens
      const tokens = await this.googleOAuthService.completeOAuthFlow(
        query.code
      );

      this.logger.log(`OAuth tokens obtained for email: ${tokens.email}`);

      // Build config for the integration
      const config = {
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
      };

      let integrationId: string;

      if (statePayload.integrationId) {
        // Update existing integration
        await this.service.update(
          statePayload.integrationId,
          statePayload.projectId,
          { config }
        );
        integrationId = statePayload.integrationId;
        this.logger.log(
          `Updated integration ${integrationId} with OAuth tokens`
        );
      } else {
        // Create new integration
        // Determine name and sourceType based on provider
        const isGoogleDrive = statePayload.provider === 'google_drive';
        const defaultName = isGoogleDrive
          ? `Google Drive - ${tokens.email}`
          : `Gmail - ${tokens.email}`;
        const sourceType = isGoogleDrive ? 'drive' : 'email';

        const name = statePayload.metadata?.name || defaultName;
        const description =
          statePayload.metadata?.description ||
          `Connected via Google OAuth on ${new Date().toLocaleDateString()}`;

        const integration = await this.service.create(
          statePayload.projectId,
          {
            providerType: statePayload.provider,
            sourceType,
            name,
            description,
            config,
            syncMode: SyncModeEnum.MANUAL,
          },
          statePayload.userId
        );
        integrationId = integration.id;
        this.logger.log(`Created new integration ${integrationId} via OAuth`);
      }

      // Build success redirect URL
      const returnUrl = statePayload.returnUrl || '/data-sources/integrations';
      redirectUrl = `${frontendBaseUrl}${returnUrl}?success=true&integrationId=${integrationId}&email=${encodeURIComponent(
        tokens.email
      )}`;

      return res.redirect(redirectUrl);
    } catch (error: any) {
      this.logger.error(`OAuth callback error: ${error.message}`, error.stack);
      redirectUrl = `${frontendBaseUrl}/data-sources/integrations/new?error=${encodeURIComponent(
        error.message || 'OAuth failed'
      )}`;
      return res.redirect(redirectUrl);
    }
  }

  // ==================== Provider Endpoints ====================

  @Get('providers')
  @ApiOperation({ summary: 'List available data source providers' })
  @ApiResponse({
    status: 200,
    description: 'List of available providers',
    type: [ProviderMetadataDto],
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  listProviders(): ProviderMetadataDto[] {
    return this.providerRegistry.listProviders().map((p) => ({
      ...p,
      configSchema: this.providerRegistry
        .getProvider(p.providerType)!
        .getConfigSchema(),
    }));
  }

  @Get('providers/:providerType/schema')
  @ApiOperation({ summary: 'Get configuration schema for a provider' })
  @ApiParam({ name: 'providerType', description: 'Provider type (e.g., imap)' })
  @ApiResponse({ status: 200, description: 'Provider configuration schema' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  getProviderSchema(
    @Param('providerType') providerType: string
  ): Record<string, any> {
    const provider = this.providerRegistry.getProvider(providerType);
    if (!provider) {
      throw new Error(`Provider ${providerType} not found`);
    }
    return provider.getConfigSchema();
  }

  @Post('test-config')
  @ApiOperation({
    summary: 'Test a provider configuration without creating an integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
    type: TestConnectionResultDto,
  })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async testConfig(
    @Body() body: { providerType: string; config: Record<string, any> }
  ): Promise<TestConnectionResultDto> {
    const provider = this.providerRegistry.getProvider(body.providerType);
    if (!provider) {
      return {
        success: false,
        error: `Provider ${body.providerType} not found`,
      };
    }

    try {
      const result = await provider.testConnection(body.config);
      return result;
    } catch (error: any) {
      this.logger.error(
        `Test config failed for ${body.providerType}: ${error.message}`
      );
      return {
        success: false,
        error: error.message || 'Connection test failed',
      };
    }
  }

  // ==================== Integration CRUD Endpoints ====================

  @Get()
  @ApiOperation({
    summary: 'List data source integrations for current project',
  })
  @ApiResponse({
    status: 200,
    description: 'List of integrations',
    type: [DataSourceIntegrationDto],
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async list(
    @RequireProjectId() ctx: ProjectContext,
    @Query() filters: ListDataSourceIntegrationsDto
  ): Promise<DataSourceIntegrationDto[]> {
    return this.service.list(ctx.projectId, filters);
  }

  @Get('source-types')
  @ApiOperation({ summary: 'Get source types with document counts' })
  @ApiResponse({
    status: 200,
    description: 'Source types with counts',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceType: { type: 'string' },
          count: { type: 'number' },
        },
      },
    },
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getSourceTypes(
    @RequireProjectId() ctx: ProjectContext
  ): Promise<Array<{ sourceType: string; count: number }>> {
    return this.service.getSourceTypesWithDocuments(ctx.projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a data source integration by ID' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Integration details',
    type: DataSourceIntegrationDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getById(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<DataSourceIntegrationDto> {
    return this.service.getById(id, ctx.projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new data source integration' })
  @ApiResponse({
    status: 201,
    description: 'Integration created',
    type: DataSourceIntegrationDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid provider type or configuration',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async create(
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string,
    @Body() dto: CreateDataSourceIntegrationDto
  ): Promise<DataSourceIntegrationDto> {
    return this.service.create(ctx.projectId, dto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a data source integration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Integration updated',
    type: DataSourceIntegrationDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async update(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Body() dto: UpdateDataSourceIntegrationDto
  ): Promise<DataSourceIntegrationDto> {
    return this.service.update(id, ctx.projectId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a data source integration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({ status: 204, description: 'Integration deleted' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:delete')
  async delete(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<void> {
    return this.service.delete(id, ctx.projectId);
  }

  // ==================== Integration Operations ====================

  @Post(':id/test-connection')
  @ApiOperation({ summary: 'Test connection for an integration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
    type: TestConnectionResultDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async testConnection(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<TestConnectionResultDto> {
    return this.service.testConnection(id, ctx.projectId);
  }

  @Post(':id/browse')
  @ApiOperation({ summary: 'Browse content available in the data source' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({ status: 200, description: 'Browse results' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async browse(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Body() options: BrowseRequestDto
  ): Promise<BrowseResult> {
    return this.service.browse(id, ctx.projectId, options);
  }

  @Post(':id/import')
  @ApiOperation({ summary: 'Import items from the data source' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Import result',
    type: ImportResultDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async import(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Body() request: ImportRequestDto
  ): Promise<ImportResultDto> {
    return this.service.import(id, ctx.projectId, request);
  }

  @Post(':id/sync-preview')
  @ApiOperation({
    summary: 'Get sync preview with folder stats and email counts',
  })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync preview with statistics',
    type: SyncPreviewDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getSyncPreview(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Body() options?: SyncOptionsDto
  ): Promise<SyncPreviewDto> {
    return this.service.getSyncPreview(id, ctx.projectId, options);
  }

  // ==================== Folder Configuration Endpoints ====================

  @Get(':id/folder-config')
  @ApiOperation({
    summary: 'Get saved folder configuration for recurring syncs',
  })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Saved folder configuration',
    type: UpdateFolderConfigDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getFolderConfig(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<UpdateFolderConfigDto> {
    return this.service.getFolderConfig(id, ctx.projectId);
  }

  @Patch(':id/folder-config')
  @ApiOperation({ summary: 'Update folder configuration for recurring syncs' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Folder configuration updated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async updateFolderConfig(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Body() body: UpdateFolderConfigDto
  ): Promise<{ success: boolean }> {
    await this.service.updateFolderConfig(id, ctx.projectId, body);
    return { success: true };
  }

  @Post(':id/folder-count')
  @ApiOperation({
    summary: 'Get estimated file count for a folder (recursive)',
  })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Estimated file count',
    type: FolderCountResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getFolderFileCount(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Body() body: FolderCountRequestDto
  ): Promise<FolderCountResponseDto> {
    return this.service.getFolderFileCount(id, ctx.projectId, body.folderId);
  }

  // ==================== Sync Configuration Endpoints ====================

  @Get(':id/sync-configurations')
  @ApiOperation({ summary: 'List sync configurations for an integration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'List of sync configurations',
    type: SyncConfigurationListDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async listSyncConfigurations(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<SyncConfigurationListDto> {
    return this.service.listSyncConfigurations(id, ctx.projectId);
  }

  @Post(':id/sync-configurations')
  @ApiOperation({ summary: 'Create a new sync configuration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 201,
    description: 'Sync configuration created',
    type: SyncConfigurationDto,
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({
    status: 409,
    description: 'Configuration name already exists',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async createSyncConfiguration(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string,
    @Body() dto: CreateSyncConfigurationDto
  ): Promise<SyncConfigurationDto> {
    return this.service.createSyncConfiguration(id, ctx.projectId, dto, userId);
  }

  @Get(':id/sync-configurations/:configId')
  @ApiOperation({ summary: 'Get a specific sync configuration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiParam({ name: 'configId', description: 'Configuration ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync configuration details',
    type: SyncConfigurationDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Integration or configuration not found',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getSyncConfiguration(
    @Param('id') id: string,
    @Param('configId') configId: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<SyncConfigurationDto> {
    return this.service.getSyncConfiguration(id, ctx.projectId, configId);
  }

  @Patch(':id/sync-configurations/:configId')
  @ApiOperation({ summary: 'Update a sync configuration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiParam({ name: 'configId', description: 'Configuration ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync configuration updated',
    type: SyncConfigurationDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Integration or configuration not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Configuration name already exists',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async updateSyncConfiguration(
    @Param('id') id: string,
    @Param('configId') configId: string,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string,
    @Body() dto: UpdateSyncConfigurationDto
  ): Promise<SyncConfigurationDto> {
    return this.service.updateSyncConfiguration(
      id,
      ctx.projectId,
      configId,
      dto,
      userId
    );
  }

  @Delete(':id/sync-configurations/:configId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sync configuration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiParam({ name: 'configId', description: 'Configuration ID' })
  @ApiResponse({ status: 204, description: 'Sync configuration deleted' })
  @ApiResponse({
    status: 404,
    description: 'Integration or configuration not found',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:delete')
  async deleteSyncConfiguration(
    @Param('id') id: string,
    @Param('configId') configId: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<void> {
    return this.service.deleteSyncConfiguration(id, ctx.projectId, configId);
  }

  @Post(':id/sync-configurations/:configId/run')
  @ApiOperation({ summary: 'Run a sync using a specific configuration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiParam({ name: 'configId', description: 'Configuration ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync job created and started',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sync job ID' },
        integrationId: { type: 'string' },
        configurationId: { type: 'string' },
        configurationName: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running'] },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Integration or configuration not found',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async runSyncConfiguration(
    @Param('id') id: string,
    @Param('configId') configId: string,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<SyncJobDto> {
    // Get the configuration
    const config = await this.service.getSyncConfiguration(
      id,
      ctx.projectId,
      configId
    );

    // Start sync with the configuration's options
    return this.syncJobService.createAndStart({
      integrationId: id,
      projectId: ctx.projectId,
      triggeredBy: userId,
      triggerType: 'manual',
      syncOptions: config.options,
      configurationId: configId,
      configurationName: config.name,
    });
  }

  @Post(':id/sync')
  @ApiOperation({
    summary:
      'Start async sync for an integration (returns immediately with job ID)',
  })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync job created and started',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sync job ID' },
        integrationId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running'] },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async triggerSync(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string,
    @Body() options?: SyncOptionsDto
  ): Promise<SyncJobDto> {
    return this.syncJobService.createAndStart({
      integrationId: id,
      projectId: ctx.projectId,
      triggeredBy: userId,
      triggerType: 'manual',
      syncOptions: options,
    });
  }

  // ==================== Sync Job Endpoints ====================

  @Get(':id/sync-jobs')
  @ApiOperation({ summary: 'List sync jobs for an integration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of jobs to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sync jobs',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          integrationId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
          },
          totalItems: { type: 'number' },
          processedItems: { type: 'number' },
          successfulItems: { type: 'number' },
          failedItems: { type: 'number' },
          skippedItems: { type: 'number' },
          currentPhase: { type: 'string' },
          statusMessage: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async listSyncJobs(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Query('limit') limit?: string
  ): Promise<SyncJobDto[]> {
    return this.syncJobService.getByIntegration(
      id,
      ctx.projectId,
      limit ? parseInt(limit, 10) : 10
    );
  }

  @Get(':id/sync-jobs/latest')
  @ApiOperation({ summary: 'Get the latest sync job for an integration' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiResponse({
    status: 200,
    description: 'Latest sync job or null if none exists',
  })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getLatestSyncJob(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<SyncJobDto | null> {
    return this.syncJobService.getLatestForIntegration(id, ctx.projectId);
  }

  @Get(':id/sync-jobs/:jobId')
  @ApiOperation({ summary: 'Get a specific sync job by ID' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiParam({ name: 'jobId', description: 'Sync job ID' })
  @ApiResponse({ status: 200, description: 'Sync job details' })
  @ApiResponse({ status: 404, description: 'Sync job not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:read')
  async getSyncJob(
    @Param('id') _id: string, // Integration ID (for route organization)
    @Param('jobId') jobId: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<SyncJobDto> {
    const job = await this.syncJobService.getById(jobId, ctx.projectId);
    if (!job) {
      throw new BadRequestException(`Sync job ${jobId} not found`);
    }
    return job;
  }

  @Post(':id/sync-jobs/:jobId/cancel')
  @ApiOperation({ summary: 'Cancel a running sync job' })
  @ApiParam({ name: 'id', description: 'Integration ID' })
  @ApiParam({ name: 'jobId', description: 'Sync job ID' })
  @ApiResponse({ status: 200, description: 'Sync job cancelled' })
  @ApiResponse({ status: 404, description: 'Sync job not found' })
  @UseGuards(AuthGuard, ScopesGuard)
  @Scopes('data-sources:write')
  async cancelSyncJob(
    @Param('id') _id: string, // Integration ID (for route organization)
    @Param('jobId') jobId: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<SyncJobDto> {
    return this.syncJobService.cancel(jobId, ctx.projectId);
  }
}
