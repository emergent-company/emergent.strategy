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
@UseGuards(...(process.env.NODE_ENV === 'test' ? [] : [AuthGuard, ScopesGuard]))
export class TypeRegistryController {
  private readonly logger = new Logger(TypeRegistryController.name);

  constructor(private readonly typeRegistryService: TypeRegistryService) {}

  @Get('projects/:projectId')
  @Scopes('graph:read')
  async getProjectTypes(
    @Param('projectId') projectId: string,
    @Query() query: ListObjectTypesQueryDto
  ): Promise<TypeRegistryEntryDto[]> {
    return this.typeRegistryService.getProjectTypes(projectId, query);
  }

  @Get('projects/:projectId/types/:typeName')
  @Scopes('graph:read')
  async getType(
    @Param('projectId') projectId: string,
    @Param('typeName') typeName: string
  ): Promise<TypeRegistryEntryDto> {
    return this.typeRegistryService.getTypeByName(projectId, typeName);
  }

  @Post('projects/:projectId/types')
  @Scopes('graph:write')
  @HttpCode(HttpStatus.CREATED)
  async createType(
    @Param('projectId') projectId: string,
    @Body() dto: CreateObjectTypeDto,
    @Query('org_id') orgIdParam: string | undefined,
    @Query('user_id') userIdParam: string | undefined,
    @Req() req: any
  ): Promise<ProjectTypeRegistryRow> {
    const orgId = orgIdParam || (req.headers['x-org-id'] as string | undefined);
    const userId = userIdParam || (req.user?.sub as string | undefined);

    if (!orgId || !userId) {
      throw new BadRequestException('Full auth context required');
    }

    return this.typeRegistryService.createCustomType(
      projectId,
      orgId,
      userId,
      dto
    );
  }

  @Patch('projects/:projectId/types/:typeName')
  @Scopes('graph:write')
  async updateType(
    @Param('projectId') projectId: string,
    @Param('typeName') typeName: string,
    @Body() dto: UpdateObjectTypeDto
  ): Promise<ProjectTypeRegistryRow> {
    return this.typeRegistryService.updateType(projectId, typeName, dto);
  }

  @Delete('projects/:projectId/types/:typeName')
  @Scopes('graph:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteType(
    @Param('projectId') projectId: string,
    @Param('typeName') typeName: string
  ): Promise<void> {
    await this.typeRegistryService.deleteType(projectId, typeName);
  }

  @Post('projects/:projectId/validate')
  @Scopes('graph:read')
  async validateData(
    @Param('projectId') projectId: string,
    @Body() dto: ValidateObjectDataDto
  ): Promise<ValidationResult> {
    return this.typeRegistryService.validateObjectData(projectId, dto);
  }

  @Get('projects/:projectId/types/:typeName/schema')
  @Scopes('graph:read')
  async getTypeSchema(
    @Param('projectId') projectId: string,
    @Param('typeName') typeName: string
  ): Promise<object> {
    return this.typeRegistryService.getTypeSchema(projectId, typeName);
  }

  @Patch('projects/:projectId/types/:typeName/toggle')
  @Scopes('graph:write')
  async toggleType(
    @Param('projectId') projectId: string,
    @Param('typeName') typeName: string,
    @Body('enabled') enabled: boolean
  ): Promise<ProjectTypeRegistryRow> {
    return this.typeRegistryService.toggleType(projectId, typeName, enabled);
  }

  @Get('projects/:projectId/stats')
  @Scopes('graph:read')
  async getProjectStats(@Param('projectId') projectId: string): Promise<{
    total_types: number;
    enabled_types: number;
    template_types: number;
    custom_types: number;
    discovered_types: number;
    total_objects: number;
    types_with_objects: number;
  }> {
    return this.typeRegistryService.getTypeStatistics(projectId);
  }
}
