import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    Logger,
    Req,
    BadRequestException,
} from '@nestjs/common';
import { TypeRegistryService } from './type-registry.service';
import {
    CreateObjectTypeDto,
    UpdateObjectTypeDto,
    TypeRegistryEntryDto,
    ListObjectTypesQueryDto,
    ValidateObjectDataDto,
    ValidationResult,
} from './dto/type-registry.dto';
import { ProjectTypeRegistryRow } from '../template-packs/template-pack.types';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@Controller('type-registry')
@UseGuards(...(process.env.E2E_MINIMAL_DB ? [] : [AuthGuard, ScopesGuard]))
export class TypeRegistryController {
    private readonly logger = new Logger(TypeRegistryController.name);

    constructor(private readonly typeRegistryService: TypeRegistryService) { }

    @Get('projects/:projectId')
    @Scopes('graph:read')
    async getProjectTypes(
        @Param('projectId') projectId: string,
        @Query() query: ListObjectTypesQueryDto,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<TypeRegistryEntryDto[]> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.getProjectTypes(projectId, orgId, query);
    }

    @Get('projects/:projectId/types/:typeName')
    @Scopes('graph:read')
    async getType(
        @Param('projectId') projectId: string,
        @Param('typeName') typeName: string,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<TypeRegistryEntryDto> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.getTypeByName(projectId, orgId, typeName);
    }

    @Post('projects/:projectId/types')
    @Scopes('graph:write')
    @HttpCode(HttpStatus.CREATED)
    async createType(
        @Param('projectId') projectId: string,
        @Body() dto: CreateObjectTypeDto,
        @Query('org_id') orgIdParam: string | undefined,
        @Query('tenant_id') tenantIdParam: string | undefined,
        @Query('user_id') userIdParam: string | undefined,
        @Req() req: any
    ): Promise<ProjectTypeRegistryRow> {
        const orgId = orgIdParam || req.context?.organization_id;
        const tenantId = tenantIdParam || req.context?.tenant_id;
        const userId = userIdParam || req.context?.user_id;

        if (!orgId || !tenantId || !userId) {
            throw new BadRequestException('Full auth context required');
        }

        return this.typeRegistryService.createCustomType(projectId, orgId, tenantId, userId, dto);
    }

    @Patch('projects/:projectId/types/:typeName')
    @Scopes('graph:write')
    async updateType(
        @Param('projectId') projectId: string,
        @Param('typeName') typeName: string,
        @Body() dto: UpdateObjectTypeDto,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<ProjectTypeRegistryRow> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.updateType(projectId, orgId, typeName, dto);
    }

    @Delete('projects/:projectId/types/:typeName')
    @Scopes('graph:write')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteType(
        @Param('projectId') projectId: string,
        @Param('typeName') typeName: string,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<void> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        await this.typeRegistryService.deleteType(projectId, orgId, typeName);
    }

    @Post('projects/:projectId/validate')
    @Scopes('graph:read')
    async validateData(
        @Param('projectId') projectId: string,
        @Body() dto: ValidateObjectDataDto,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<ValidationResult> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.validateObjectData(projectId, orgId, dto);
    }

    @Get('projects/:projectId/types/:typeName/schema')
    @Scopes('graph:read')
    async getTypeSchema(
        @Param('projectId') projectId: string,
        @Param('typeName') typeName: string,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<object> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.getTypeSchema(projectId, orgId, typeName);
    }

    @Patch('projects/:projectId/types/:typeName/toggle')
    @Scopes('graph:write')
    async toggleType(
        @Param('projectId') projectId: string,
        @Param('typeName') typeName: string,
        @Body('enabled') enabled: boolean,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<ProjectTypeRegistryRow> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.toggleType(projectId, orgId, typeName, enabled);
    }

    @Get('projects/:projectId/stats')
    @Scopes('graph:read')
    async getProjectStats(
        @Param('projectId') projectId: string,
        @Query('org_id') orgIdParam: string | undefined,
        @Req() req: any
    ): Promise<{
        total_types: number;
        enabled_types: number;
        template_types: number;
        custom_types: number;
        discovered_types: number;
        total_objects: number;
        types_with_objects: number;
    }> {
        const orgId = orgIdParam || req.context?.organization_id;
        if (!orgId) {
            throw new BadRequestException('Organization ID required');
        }
        return this.typeRegistryService.getTypeStatistics(projectId, orgId);
    }
}
