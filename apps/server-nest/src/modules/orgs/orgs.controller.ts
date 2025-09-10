import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { OrgDto } from './dto/org.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';

@ApiTags('Orgs')
@Controller('orgs')
export class OrgsController {
    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List organizations', type: OrgDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiStandardErrors()
    list() {
        return [{ id: 'org_1', name: 'Example Org' }];
    }
}
