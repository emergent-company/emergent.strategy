import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthGuard } from '../auth/auth.guard';
import { Scopes } from '../auth/scopes.decorator';
import { ScopesGuard } from '../auth/scopes.guard';
import { TemplatePackService } from './template-pack.service';
import {
  CreateTemplatePackDto,
  AssignTemplatePackDto,
  UpdateTemplatePackAssignmentDto,
  ListTemplatePacksQueryDto,
} from './dto/template-pack.dto';
import {
  RequireProjectId,
  ProjectContext,
  OptionalProjectId,
  OptionalProjectContext,
} from '../../common/decorators/project-context.decorator';

@Controller('template-packs')
@UseGuards(...(process.env.NODE_ENV === 'test' ? [] : [AuthGuard, ScopesGuard]))
export class TemplatePackController {
  private readonly logger = new Logger(TemplatePackController.name);

  constructor(private readonly templatePackService: TemplatePackService) {}

  private normalizeUserId(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        trimmed
      )
    ) {
      return trimmed;
    }

    try {
      const hash = createHash('sha1').update(trimmed).digest();
      const bytes = Buffer.from(hash.subarray(0, 16));
      bytes[6] = (bytes[6] & 0x0f) | 0x50; // RFC4122 v5 style
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = bytes.toString('hex');
      return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(
        12,
        16
      )}-${hex.substring(16, 20)}-${hex.substring(20)}`;
    } catch {
      return undefined;
    }
  }

  private resolveUserId(req: any, queryUserId?: string): string {
    // Use internal UUID, not external Zitadel ID
    const resolvedFromRequest = this.normalizeUserId(req?.user?.id);
    if (resolvedFromRequest) {
      return resolvedFromRequest;
    }

    const resolvedFromQuery = this.normalizeUserId(queryUserId);
    if (resolvedFromQuery) {
      return resolvedFromQuery;
    }

    const authHeaderRaw = req?.headers?.['authorization'];
    const authHeader = Array.isArray(authHeaderRaw)
      ? authHeaderRaw[0]
      : authHeaderRaw;
    const token =
      typeof authHeader === 'string'
        ? authHeader.replace(/^Bearer\s+/i, '').trim()
        : undefined;
    const resolvedFromToken = this.normalizeUserId(token);
    if (resolvedFromToken) {
      return resolvedFromToken;
    }

    return '00000000-0000-0000-0000-000000000001';
  }

  /**
   * Create a new global template pack
   * Requires admin scope
   */
  @Post()
  @Scopes('admin:write')
  @HttpCode(HttpStatus.CREATED)
  async createTemplatePack(@Body() dto: CreateTemplatePackDto) {
    return this.templatePackService.createTemplatePack(dto);
  }

  /**
   * List all available template packs (global registry)
   */
  @Get()
  @Scopes('graph:read')
  async listTemplatePacks(@Query() query: ListTemplatePacksQueryDto) {
    return this.templatePackService.listTemplatePacks(query);
  }

  /**
   * Get template pack by ID
   */
  @Get(':id')
  @Scopes('graph:read')
  async getTemplatePack(@Param('id') id: string) {
    return this.templatePackService.getTemplatePackById(id);
  }

  /**
   * Get available templates for current project (with installation status)
   */
  @Get('projects/:projectId/available')
  @Scopes('graph:read')
  async getAvailableTemplates(@Param('projectId') projectId: string) {
    return this.templatePackService.getAvailableTemplatesForProject(projectId);
  }

  /**
   * Get compiled object type schemas from all installed packs for a project
   * This merges schemas from all active template packs
   */
  @Get('projects/:projectId/compiled-types')
  @Scopes('graph:read')
  async getCompiledObjectTypes(@Param('projectId') projectId: string) {
    return this.templatePackService.getCompiledObjectTypesForProject(projectId);
  }

  /**
   * Get installed template packs for a project
   */
  @Get('projects/:projectId/installed')
  @Scopes('graph:read')
  async getInstalledTemplatePacks(@Param('projectId') projectId: string) {
    return this.templatePackService.getProjectTemplatePacks(projectId);
  }

  /**
   * Assign template pack to project
   */
  @Post('projects/:projectId/assign')
  @Scopes('graph:write')
  @HttpCode(HttpStatus.CREATED)
  async assignTemplatePack(
    @Param('projectId') projectId: string,
    @Body() dto: AssignTemplatePackDto,
    @Req() req: any,
    @Query('org_id') queryOrgId?: string,
    @Query('user_id') queryUserId?: string
  ) {
    // In test mode, context may come from query params instead of headers
    const orgIdFromHeader =
      (req.headers['x-org-id'] as string | undefined) || queryOrgId;
    const userId = this.resolveUserId(req, queryUserId);

    // If no org ID provided in header, derive it from the project
    let orgId = orgIdFromHeader;
    if (!orgId) {
      orgId = await this.templatePackService.getOrganizationIdFromProject(
        projectId
      );
    }

    if (!orgId) {
      throw new BadRequestException(
        'Organization context required - could not derive from project'
      );
    }

    return this.templatePackService.assignTemplatePackToProject(
      projectId,
      orgId,
      userId,
      dto
    );
  }

  /**
   * Update template pack assignment
   */
  @Patch('projects/:projectId/assignments/:assignmentId')
  @Scopes('graph:write')
  async updateTemplatePackAssignment(
    @Param('projectId') projectId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateTemplatePackAssignmentDto,
    @Req() req: any
  ) {
    const orgIdFromHeader = req.headers['x-org-id'] as string | undefined;

    // If no org ID provided in header, derive it from the project
    let orgId = orgIdFromHeader;
    if (!orgId) {
      orgId = await this.templatePackService.getOrganizationIdFromProject(
        projectId
      );
    }

    if (!orgId) {
      throw new BadRequestException(
        'Organization context required - could not derive from project'
      );
    }

    return this.templatePackService.updateTemplatePackAssignment(
      assignmentId,
      projectId,
      orgId,
      dto
    );
  }

  /**
   * Uninstall template pack from project
   */
  @Delete('projects/:projectId/assignments/:assignmentId')
  @Scopes('graph:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async uninstallTemplatePack(
    @Param('projectId') projectId: string,
    @Param('assignmentId') assignmentId: string,
    @Req() req: any
  ) {
    const orgIdFromHeader = req.headers['x-org-id'] as string | undefined;

    // If no org ID provided in header, derive it from the project
    let orgId = orgIdFromHeader;
    if (!orgId) {
      orgId = await this.templatePackService.getOrganizationIdFromProject(
        projectId
      );
    }

    if (!orgId) {
      throw new BadRequestException(
        'Organization context required - could not derive from project'
      );
    }

    await this.templatePackService.uninstallTemplatePackFromProject(
      assignmentId,
      projectId,
      orgId
    );
  }

  /**
   * Delete a template pack permanently
   * Only allows deletion of non-system packs that are not installed in any project
   */
  @Delete(':id')
  @Scopes('graph:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplatePack(@Param('id') packId: string, @Req() req: any) {
    const orgId = (req.headers['x-org-id'] as string | undefined) || undefined;
    if (!orgId) {
      throw new BadRequestException('Organization context required');
    }

    await this.templatePackService.deleteTemplatePack(packId, orgId);
  }
}
