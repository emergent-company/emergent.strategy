import { Body, Controller, Get, Post, Query, UseInterceptors, UsePipes, ValidationPipe, Delete, Param, ParseUUIDPipe, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse, ApiQuery } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { CreateProjectDto, ProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(AuthGuard, ScopesGuard)
export class ProjectsController {
    constructor(private readonly projects: ProjectsService) { }

    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List projects (must create at least one before ingesting documents)', type: ProjectDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiStandardErrors()
    @ApiQuery({ name: 'orgId', required: false, description: 'Filter projects by organization id (must be explicit elsewhere when creating projects)' })
    @Scopes('projects:read')
    async list(@Query('limit') limit?: string, @Query('orgId') orgId?: string) {
        const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500) : 100;
        return this.projects.list(n, orgId);
    }

    @Post()
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    @ApiOkResponse({ description: 'Create a project', type: ProjectDto })
    @ApiBadRequestResponse({ description: 'Validation / duplicate / org errors', schema: { example: { error: { code: 'duplicate', message: 'Project with this name exists in org' } } } })
    @ApiStandardErrors()
    @Scopes('projects:write')
    async create(@Body() dto: CreateProjectDto) {
        return this.projects.create(dto.name, dto.orgId);
    }

    @Delete(':id')
    @ApiOkResponse({ description: 'Deleted project', schema: { example: { status: 'deleted' } } })
    @ApiBadRequestResponse({ description: 'Invalid id', schema: { example: { error: { code: 'bad-request', message: 'Invalid id' } } } })
    @ApiStandardErrors()
    @Scopes('projects:write')
    async delete(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
        const deleted = await this.projects.delete(id);
        if (!deleted) throw new NotFoundException({ error: { code: 'not-found', message: 'Project not found' } });
        return { status: 'deleted' };
    }
}
