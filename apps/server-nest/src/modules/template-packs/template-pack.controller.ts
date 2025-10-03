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

@Controller('template-packs')
@UseGuards(...(process.env.E2E_MINIMAL_DB ? [] : [AuthGuard, ScopesGuard]))
export class TemplatePackController {
    private readonly logger = new Logger(TemplatePackController.name);

    constructor(private readonly templatePackService: TemplatePackService) { }

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
    async getAvailableTemplates(
        @Param('projectId') projectId: string,
        @Req() req: any
    ) {
        const orgId = req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization context required');
        }
        return this.templatePackService.getAvailableTemplatesForProject(projectId, orgId);
    }

    /**
     * Get installed template packs for a project
     */
    @Get('projects/:projectId/installed')
    @Scopes('graph:read')
    async getInstalledTemplatePacks(
        @Param('projectId') projectId: string,
        @Req() req: any
    ) {
        const orgId = req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization context required');
        }
        return this.templatePackService.getProjectTemplatePacks(projectId, orgId);
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
        @Query('tenant_id') queryTenantId?: string,
        @Query('user_id') queryUserId?: string
    ) {
        // In E2E_MINIMAL_DB mode, context may come from query params instead of req.context
        const orgId = req.context?.organization_id || queryOrgId;
        const tenantId = req.context?.tenant_id || queryTenantId;
        const userId = req.user?.sub || queryUserId;

        if (!orgId || !tenantId) {
            throw new BadRequestException('Organization and tenant context required');
        }

        return this.templatePackService.assignTemplatePackToProject(
            projectId,
            orgId,
            tenantId,
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
        const orgId = req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization context required');
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
        const orgId = req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization context required');
        }

        await this.templatePackService.uninstallTemplatePackFromProject(
            assignmentId,
            projectId,
            orgId
        );
    }
}
