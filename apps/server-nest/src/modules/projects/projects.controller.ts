import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ProjectDto } from './dto/project.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List projects', type: ProjectDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiStandardErrors()
    list() {
        return [{ id: 'proj_1', name: 'Demo Project', orgId: 'org_1' }];
    }
}
