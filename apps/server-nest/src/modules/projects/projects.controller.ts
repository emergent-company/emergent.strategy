import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  Delete,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  UseGuards,
  Req,
  Patch,
} from '@nestjs/common';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import {
  ApiOkResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiQuery,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import {
  CreateProjectDto,
  ProjectDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(AuthGuard, ScopesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({
    description:
      'List projects (must create at least one before ingesting documents)',
    type: ProjectDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid filter' } },
    },
  })
  @ApiStandardErrors()
  @ApiQuery({
    name: 'orgId',
    required: false,
    description:
      'Filter projects by organization id (must be explicit elsewhere when creating projects)',
  })
  // New scope taxonomy: list projects requires project:read
  @Scopes('project:read')
  async list(
    @Query('limit') limit?: string,
    @Query('orgId', new UuidParamPipe({ nullable: true, paramName: 'orgId' }))
    orgId?: string
  ) {
    const n = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)
      : 100;
    console.log(
      '[ProjectsController.list] Called with limit:',
      n,
      'orgId:',
      orgId
    );

    const projects = await this.projects.list(n, orgId);
    console.log(
      '[ProjectsController.list] Found',
      projects.length,
      'projects:',
      projects.map((p) => ({ id: p.id, name: p.name, orgId: p.orgId }))
    );

    return projects;
  }

  @Get(':id')
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({ description: 'Get project by ID', type: ProjectDto })
  @ApiBadRequestResponse({
    description: 'Invalid id',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid id' } },
    },
  })
  @ApiStandardErrors()
  // Reading a single project requires project:read
  @Scopes('project:read')
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const project = await this.projects.getById(id);
    if (!project) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Project not found' },
      });
    }
    return project;
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiCreatedResponse({ description: 'Project created', type: ProjectDto })
  @ApiBadRequestResponse({
    description: 'Validation / duplicate / org errors',
    schema: {
      example: {
        error: {
          code: 'duplicate',
          message: 'Project with this name exists in org',
        },
      },
    },
  })
  @ApiStandardErrors()
  // Creating a project now requires org:project:create (org-level capability)
  @Scopes('org:project:create')
  async create(@Body() dto: CreateProjectDto, @Req() req: any) {
    const userId: string | undefined = req?.user?.id; // Use internal UUID, not external sub
    // Validate orgId using same pipe logic (body field so apply manually)
    const validator = new UuidParamPipe({ paramName: 'orgId' });
    dto.orgId = validator.transform(dto.orgId)!; // CreateProjectDto requires orgId
    return this.projects.create(dto.name, dto.orgId, userId);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOkResponse({ description: 'Project updated', type: ProjectDto })
  @ApiBadRequestResponse({
    description: 'Invalid id or validation error',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid id' } },
    },
  })
  @ApiStandardErrors()
  // Updating a project requires project:write
  @Scopes('project:write')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProjectDto
  ) {
    const updated = await this.projects.update(id, dto);
    if (!updated) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Project not found' },
      });
    }
    return updated;
  }

  @Delete(':id')
  @ApiOkResponse({
    description: 'Deleted project',
    schema: { example: { status: 'deleted' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid id',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid id' } },
    },
  })
  @ApiStandardErrors()
  // Deleting a project requires org:project:delete
  @Scopes('org:project:delete')
  async delete(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const deleted = await this.projects.delete(id);
    if (!deleted)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Project not found' },
      });
    return { status: 'deleted' };
  }
}
