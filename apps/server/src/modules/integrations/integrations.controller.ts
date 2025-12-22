import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { IntegrationsService } from './integrations.service';
import { IntegrationRegistryService } from './integration-registry.service';
import { Scopes } from '../auth/scopes.decorator';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
  IntegrationDto,
  ListIntegrationsDto,
  PublicIntegrationDto,
} from './dto/integration.dto';
import { ImportConfig, ImportResult } from './base-integration';
import {
  OptionalProjectId,
  OptionalProjectContext,
} from '../../common/decorators/project-context.decorator';

/**
 * Integrations Controller
 *
 * API endpoints for managing third-party integrations
 *
 * Base path: /integrations (proxied from /api/integrations)
 *
 * Architecture:
 * - Frontend calls: ${apiBase}/api/integrations
 * - Vite proxy strips /api prefix
 * - Backend receives: /integrations
 *
 * Security:
 * - All endpoints require authentication
 * - Org and project context provided via HTTP headers (X-Org-ID, X-Project-ID)
 */
@ApiTags('Integrations')
@Controller('integrations')
@ApiBearerAuth()
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly registryService: IntegrationRegistryService
  ) {}

  /**
   * Get all available integration types
   *
   * GET /api/v1/integrations/available
   */
  @Get('available')
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'List available integration types',
    description:
      'Get a list of all integration types that can be configured (ClickUp, GitHub, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Available integrations retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listAvailableIntegrations(): Promise<
    Array<{
      name: string;
      displayName: string;
      capabilities: any;
      requiredSettings: string[];
      optionalSettings: Record<string, any>;
    }>
  > {
    return this.registryService.listAvailableIntegrations();
  }

  /**
   * Get all integrations for the current project
   *
   * GET /integrations
   * Headers: X-Project-ID, X-Org-ID
   */
  @Get()
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'List integrations',
    description: 'List all integrations for a project with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Integrations retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listIntegrations(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Query() filters: ListIntegrationsDto
  ): Promise<IntegrationDto[]> {
    return this.integrationsService.listIntegrations(
      ctx.projectId as string,
      ctx.orgId as string,
      filters
    );
  }

  /**
   * Get a specific integration by name
   *
   * GET /integrations/:name
   * Headers: X-Project-ID, X-Org-ID
   */
  @Get(':name')
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'Get integration',
    description: 'Get detailed information about a specific integration',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({
    status: 200,
    description: 'Integration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getIntegration(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string
  ): Promise<IntegrationDto> {
    return this.integrationsService.getIntegration(
      name,
      ctx.projectId as string,
      ctx.orgId as string
    );
  }

  /**
   * Get public information about an integration (without sensitive settings)
   *
   * GET /integrations/:name/public
   * Headers: X-Project-ID, X-Org-ID
   */
  @Get(':name/public')
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'Get public integration info',
    description: 'Get non-sensitive information about an integration',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({
    status: 200,
    description: 'Public info retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPublicIntegrationInfo(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string
  ): Promise<PublicIntegrationDto> {
    return this.integrationsService.getPublicIntegrationInfo(
      name,
      ctx.projectId as string,
      ctx.orgId as string
    );
  }

  /**
   * Create a new integration
   *
   * POST /api/v1/integrations
   */
  @Post()
  @Scopes('integrations:write')
  @ApiOperation({
    summary: 'Create integration',
    description:
      'Create a new integration configuration with encrypted credentials',
  })
  @ApiResponse({ status: 201, description: 'Integration created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({
    status: 409,
    description: 'Integration already exists for this project',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createIntegration(
    @Req() req: Request,
    @Body() dto: CreateIntegrationDto
  ): Promise<IntegrationDto> {
    const projectIdHeader = req.headers['x-project-id'];
    const orgIdHeader = req.headers['x-org-id'];
    const projectId = Array.isArray(projectIdHeader)
      ? projectIdHeader[0]
      : projectIdHeader;
    const orgId = Array.isArray(orgIdHeader) ? orgIdHeader[0] : orgIdHeader;

    if (!projectId || typeof projectId !== 'string' || !isUUID(projectId)) {
      throw new BadRequestException({
        error: {
          code: 'missing-project-id',
          message: 'Project context is required to create an integration.',
          details:
            'Include a valid project ID in the X-Project-ID header when creating integrations.',
        },
      });
    }

    if (!orgId || typeof orgId !== 'string') {
      throw new BadRequestException({
        error: {
          code: 'missing-org-id',
          message: 'Organization context is required to create an integration.',
          details: 'Include the X-Org-ID header when creating integrations.',
        },
      });
    }

    return this.integrationsService.createIntegration(projectId, orgId, dto);
  }

  /**
   * Update an integration
   *
   * PUT /integrations/:name
   * Headers: X-Project-ID, X-Org-ID
   */
  @Put(':name')
  @Scopes('integrations:write')
  @ApiOperation({
    summary: 'Update integration',
    description: 'Update an existing integration configuration',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({ status: 200, description: 'Integration updated successfully' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateIntegration(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string,
    @Body() dto: UpdateIntegrationDto
  ): Promise<IntegrationDto> {
    return this.integrationsService.updateIntegration(
      name,
      ctx.projectId as string,
      ctx.orgId as string,
      dto
    );
  }

  /**
   * Test integration connection
   *
   * POST /integrations/:name/test
   * Headers: X-Project-ID, X-Org-ID
   */
  @Post(':name/test')
  @Scopes('integrations:write')
  @ApiOperation({
    summary: 'Test integration connection',
    description:
      'Test if the integration credentials are valid and the connection works',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({ status: 200, description: 'Connection test completed' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testConnection(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return this.integrationsService.testConnection(
        name,
        ctx.projectId as string,
        ctx.orgId as string
      );
    } catch (error) {
      // For test connection, we want to return the result rather than throw
      // This allows the frontend to display test results appropriately
      const errorMessage =
        error instanceof Error ? error.message : 'Connection test failed';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Trigger integration sync/import with real-time progress (SSE)
   *
   * GET /integrations/:name/sync/stream
   * Headers: X-Project-ID, X-Org-ID
   *
   * Returns Server-Sent Events (SSE) stream with progress updates:
   * - event: progress, data: { step: 'fetching_docs', message: '...', count?: number }
   * - event: complete, data: { success: true, result: ImportResult }
   * - event: error, data: { error: string }
   */
  @Get(':name/sync/stream')
  @Scopes('integrations:write')
  @ApiOperation({
    summary: 'Trigger integration sync with real-time progress (SSE)',
    description:
      'Starts a sync and streams progress updates via Server-Sent Events',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({ status: 200, description: 'SSE stream started' })
  async triggerSyncStream(
    @Req() req: Request & { res: any },
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string
  ): Promise<void> {
    const res = req.res;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Helper to send SSE events
    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Start sync with progress callback
      const result = await this.integrationsService.triggerSyncWithProgress(
        name,
        ctx.projectId as string,
        ctx.orgId as string,
        {},
        (progress) => {
          sendEvent('progress', progress);
        }
      );

      // Send completion event
      sendEvent('complete', { success: true, result });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      sendEvent('error', { error: errorMessage });
    } finally {
      res.end();
    }
  }

  /**
   * Trigger integration sync/import
   *
   * POST /integrations/:name/sync
   * Headers: X-Project-ID, X-Org-ID
   */
  @Post(':name/sync')
  @Scopes('integrations:write')
  @ApiOperation({
    summary: 'Trigger integration sync',
    description: 'Manually trigger a full import/sync from the integration',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({ status: 200, description: 'Sync initiated successfully' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({
    status: 400,
    description: 'Integration does not support import',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async triggerSync(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string,
    @Body() config?: ImportConfig
  ): Promise<ImportResult> {
    try {
      return this.integrationsService.triggerSync(
        name,
        ctx.projectId as string,
        ctx.orgId as string,
        config
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        throw new BadRequestException({
          error: {
            code: 'integration-not-found',
            message: `Integration '${name}' is not configured for this project.`,
            details:
              'Please configure the integration first before attempting to sync.',
          },
        });
      }
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('authentication')
      ) {
        throw new UnauthorizedException({
          error: {
            code: 'integration-auth-failed',
            message: `Authentication failed for ${name} integration.`,
            details:
              'Please check your API credentials and ensure they are valid and have not expired.',
          },
        });
      }
      if (
        errorMessage.includes('403') ||
        errorMessage.includes('permissions')
      ) {
        throw new ForbiddenException({
          error: {
            code: 'integration-permissions',
            message: `Insufficient permissions for ${name} integration.`,
            details:
              'Ensure your API token has the required permissions to read and import data.',
          },
        });
      }
      throw new BadRequestException({
        error: {
          code: 'sync-failed',
          message: `Failed to start sync for ${name} integration.`,
          details: errorMessage || 'Unknown sync error',
        },
      });
    }
  }

  /**
   * Get ClickUp workspace structure for list selection
   *
   * GET /integrations/clickup/structure
   * Headers: X-Project-ID, X-Org-ID
   */
  @Get('clickup/structure')
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'Get ClickUp workspace structure',
    description:
      'Fetch hierarchical workspace structure (spaces, folders, lists) with task counts for list selection UI',
  })
  @ApiResponse({
    status: 200,
    description: 'Workspace structure retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'ClickUp integration not found or not configured',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getClickUpWorkspaceStructure(
    @OptionalProjectId() ctx: OptionalProjectContext
  ): Promise<any> {
    try {
      return this.integrationsService.getClickUpWorkspaceStructure(
        ctx.projectId as string,
        ctx.orgId as string
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('workspace not found')) {
        throw new BadRequestException({
          error: {
            code: 'invalid-workspace-id',
            message:
              'The configured workspace ID is invalid or you do not have access to it.',
            details:
              'Check your ClickUp integration settings and ensure the workspace ID is correct. The error response includes available workspaces you can access.',
          },
        });
      }
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('Oauth token not found')
      ) {
        throw new UnauthorizedException({
          error: {
            code: 'invalid-api-token',
            message: 'Your ClickUp API token is invalid or expired.',
            details:
              'Please check your ClickUp integration settings and ensure you are using a valid personal API token (starts with pk_).',
          },
        });
      }
      if (
        errorMessage.includes('403') ||
        errorMessage.includes('insufficient permissions')
      ) {
        throw new ForbiddenException({
          error: {
            code: 'insufficient-permissions',
            message:
              'Your ClickUp API token does not have sufficient permissions.',
            details:
              'Ensure your ClickUp token has access to read workspaces, spaces, folders, and lists.',
          },
        });
      }
      throw new BadRequestException({
        error: {
          code: 'clickup-api-error',
          message:
            'Failed to fetch ClickUp workspace structure. Please check your configuration.',
          details: errorMessage || 'Unknown ClickUp API error',
        },
      });
    }
  }

  /**
   * Get ClickUp space details
   *
   * GET /integrations/clickup/spaces/:spaceId
   * Headers: X-Project-ID, X-Org-ID
   */
  @Get('clickup/spaces/:spaceId')
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'Get ClickUp space details',
    description: 'Fetch details for a specific ClickUp space by ID',
  })
  @ApiParam({ name: 'spaceId', description: 'ClickUp space ID' })
  @ApiResponse({
    status: 200,
    description: 'Space details retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'ClickUp integration not found or space not found',
  })
  async getClickUpSpace(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('spaceId') spaceId: string
  ): Promise<any> {
    try {
      return this.integrationsService.getClickUpSpace(
        ctx.projectId as string,
        ctx.orgId as string,
        spaceId
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException({
        error: {
          code: 'clickup-api-error',
          message: 'Failed to fetch ClickUp space details.',
          details: errorMessage || 'Unknown ClickUp API error',
        },
      });
    }
  }

  /**
   * Get ClickUp folder details
   *
   * GET /integrations/clickup/folders/:folderId
   * Headers: X-Project-ID, X-Org-ID
   */
  @Get('clickup/folders/:folderId')
  @Scopes('integrations:read')
  @ApiOperation({
    summary: 'Get ClickUp folder details',
    description: 'Fetch details for a specific ClickUp folder by ID',
  })
  @ApiParam({ name: 'folderId', description: 'ClickUp folder ID' })
  @ApiResponse({
    status: 200,
    description: 'Folder details retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'ClickUp integration not found or folder not found',
  })
  async getClickUpFolder(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('folderId') folderId: string
  ): Promise<any> {
    try {
      return this.integrationsService.getClickUpFolder(
        ctx.projectId as string,
        ctx.orgId as string,
        folderId
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException({
        error: {
          code: 'clickup-api-error',
          message: 'Failed to fetch ClickUp folder details.',
          details: errorMessage || 'Unknown ClickUp API error',
        },
      });
    }
  }

  /**
   * Delete an integration
   *
   * DELETE /integrations/:name
   * Headers: X-Project-ID, X-Org-ID
   */
  @Delete(':name')
  @Scopes('integrations:write')
  @ApiOperation({
    summary: 'Delete integration',
    description: 'Delete an integration and all its associated data',
  })
  @ApiParam({ name: 'name', description: 'Integration name (e.g., "clickup")' })
  @ApiResponse({ status: 204, description: 'Integration deleted successfully' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIntegration(
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Param('name') name: string
  ): Promise<void> {
    return this.integrationsService.deleteIntegration(
      name,
      ctx.projectId as string,
      ctx.orgId as string
    );
  }
}
