import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { IntegrationRegistryService } from './integration-registry.service';
import {
    CreateIntegrationDto,
    UpdateIntegrationDto,
    IntegrationDto,
    ListIntegrationsDto,
    PublicIntegrationDto,
} from './dto/integration.dto';
import { ImportConfig, ImportResult } from './base-integration';

/**
 * Integrations Controller
 * 
 * API endpoints for managing third-party integrations
 * 
 * Base path: /api/v1/integrations
 * 
 * Security:
 * - All endpoints require authentication
 * - Project and org context provided via query parameters
 */
@ApiTags('Integrations')
@Controller('api/v1/integrations')
@ApiBearerAuth()
export class IntegrationsController {
    constructor(
        private readonly integrationsService: IntegrationsService,
        private readonly registryService: IntegrationRegistryService
    ) { }

    /**
     * Get all available integration types
     * 
     * GET /api/v1/integrations/available
     */
    @Get('available')
    @ApiOperation({
        summary: 'List available integration types',
        description: 'Get a list of all integration types that can be configured (ClickUp, GitHub, etc.)'
    })
    @ApiResponse({ status: 200, description: 'Available integrations retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async listAvailableIntegrations(): Promise<Array<{
        name: string;
        displayName: string;
        capabilities: any;
        requiredSettings: string[];
        optionalSettings: Record<string, any>;
    }>> {
        return this.registryService.listAvailableIntegrations();
    }

    /**
     * Get all integrations for the current project
     * 
     * GET /api/v1/integrations?project_id=xxx&org_id=yyy
     */
    @Get()
    @ApiOperation({
        summary: 'List integrations',
        description: 'List all integrations for a project with optional filters'
    })
    @ApiResponse({ status: 200, description: 'Integrations retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async listIntegrations(
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string,
        @Query() filters: ListIntegrationsDto
    ): Promise<IntegrationDto[]> {
        return this.integrationsService.listIntegrations(projectId, orgId, filters);
    }

    /**
     * Get a specific integration by name
     * 
     * GET /api/v1/integrations/:name?project_id=xxx&org_id=yyy
     */
    @Get(':name')
    @ApiOperation({
        summary: 'Get integration',
        description: 'Get detailed information about a specific integration'
    })
    @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
    @ApiResponse({ status: 200, description: 'Integration retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Integration not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getIntegration(
        @Param('name') name: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<IntegrationDto> {
        return this.integrationsService.getIntegration(name, projectId, orgId);
    }

    /**
     * Get public information about an integration (without sensitive settings)
     * 
     * GET /api/v1/integrations/:name/public?project_id=xxx&org_id=yyy
     */
    @Get(':name/public')
    @ApiOperation({
        summary: 'Get public integration info',
        description: 'Get non-sensitive information about an integration'
    })
    @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
    @ApiResponse({ status: 200, description: 'Public info retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Integration not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getPublicIntegrationInfo(
        @Param('name') name: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<PublicIntegrationDto> {
        return this.integrationsService.getPublicIntegrationInfo(name, projectId, orgId);
    }

    /**
     * Create a new integration
     * 
     * POST /api/v1/integrations
     */
    @Post()
    @ApiOperation({
        summary: 'Create integration',
        description: 'Create a new integration configuration with encrypted credentials'
    })
    @ApiResponse({ status: 201, description: 'Integration created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    @ApiResponse({ status: 409, description: 'Integration already exists for this project' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async createIntegration(
        @Body() dto: CreateIntegrationDto
    ): Promise<IntegrationDto> {
        return this.integrationsService.createIntegration(dto);
    }

    /**
     * Update an integration
     * 
     * PUT /api/v1/integrations/:name?project_id=xxx&org_id=yyy
     */
    @Put(':name')
    @ApiOperation({
        summary: 'Update integration',
        description: 'Update an existing integration configuration'
    })
    @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
    @ApiResponse({ status: 200, description: 'Integration updated successfully' })
    @ApiResponse({ status: 404, description: 'Integration not found' })
    @ApiResponse({ status: 400, description: 'Invalid update data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async updateIntegration(
        @Param('name') name: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string,
        @Body() dto: UpdateIntegrationDto
    ): Promise<IntegrationDto> {
        return this.integrationsService.updateIntegration(name, projectId, orgId, dto);
    }

    /**
     * Test integration connection
     * 
     * POST /api/v1/integrations/:name/test?project_id=xxx&org_id=yyy
     */
    @Post(':name/test')
    @ApiOperation({
        summary: 'Test integration connection',
        description: 'Test if the integration credentials are valid and the connection works'
    })
    @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
    @ApiResponse({ status: 200, description: 'Connection test completed' })
    @ApiResponse({ status: 404, description: 'Integration not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async testConnection(
        @Param('name') name: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<{ success: boolean; error?: string }> {
        return this.integrationsService.testConnection(name, projectId, orgId);
    }

    /**
     * Trigger integration sync/import
     * 
     * POST /api/v1/integrations/:name/sync?project_id=xxx&org_id=yyy
     */
    @Post(':name/sync')
    @ApiOperation({
        summary: 'Trigger integration sync',
        description: 'Manually trigger a full import/sync from the integration'
    })
    @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
    @ApiResponse({ status: 200, description: 'Sync initiated successfully' })
    @ApiResponse({ status: 404, description: 'Integration not found' })
    @ApiResponse({ status: 400, description: 'Integration does not support import' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async triggerSync(
        @Param('name') name: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string,
        @Body() config?: ImportConfig
    ): Promise<ImportResult> {
        return this.integrationsService.triggerSync(name, projectId, orgId, config);
    }

    /**
     * Get ClickUp workspace structure for list selection
     * 
     * GET /api/v1/integrations/clickup/structure?project_id=xxx&org_id=yyy
     */
    @Get('clickup/structure')
    @ApiOperation({
        summary: 'Get ClickUp workspace structure',
        description: 'Fetch hierarchical workspace structure (spaces, folders, lists) with task counts for list selection UI'
    })
    @ApiResponse({ status: 200, description: 'Workspace structure retrieved successfully' })
    @ApiResponse({ status: 404, description: 'ClickUp integration not found or not configured' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getClickUpWorkspaceStructure(
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<any> {
        return this.integrationsService.getClickUpWorkspaceStructure(projectId, orgId);
    }

    /**
     * Delete an integration
     * 
     * DELETE /api/v1/integrations/:name?project_id=xxx&org_id=yyy
     */
    @Delete(':name')
    @ApiOperation({
        summary: 'Delete integration',
        description: 'Delete an integration and all its associated data'
    })
    @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
    @ApiResponse({ status: 204, description: 'Integration deleted successfully' })
    @ApiResponse({ status: 404, description: 'Integration not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteIntegration(
        @Param('name') name: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<void> {
        return this.integrationsService.deleteIntegration(name, projectId, orgId);
    }
}
