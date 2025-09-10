import { Controller, Get, Param, NotFoundException, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List settings (placeholder)', schema: { example: [{ key: 'theme', value: 'dark' }] } })
    @ApiStandardErrors()
    list() {
        return [{ key: 'theme', value: 'dark' }];
    }

    @Get(':key')
    @ApiOkResponse({ description: 'Get a single setting (placeholder)', schema: { example: { key: 'theme', value: 'dark' } } })
    @ApiNotFoundResponse({ description: 'Setting not found', schema: { example: { error: { code: 'not-found', message: 'Setting not found' } } } })
    @ApiStandardErrors({ notFound: true })
    getOne(@Param('key') key: string) {
        const allowed = new Map<string, string>([['theme', 'dark']]);
        if (!allowed.has(key)) throw new NotFoundException('Setting not found');
        return { key, value: allowed.get(key) };
    }
}
