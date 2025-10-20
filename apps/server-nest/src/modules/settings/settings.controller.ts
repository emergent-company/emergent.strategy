import { Controller, Get, Put, Param, Body, NotFoundException, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiNotFoundResponse, ApiBody } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { DatabaseService } from '../../common/database/database.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
    constructor(private readonly db: DatabaseService) { }

    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List all settings', schema: { example: [{ key: 'theme', value: 'dark' }] } })
    @ApiStandardErrors()
    async list() {
        const result = await this.db.query('SELECT key, value FROM kb.settings ORDER BY key');
        return result.rows;
    }

    @Get(':key')
    @ApiOkResponse({ description: 'Get a single setting', schema: { example: { key: 'theme', value: 'dark' } } })
    @ApiNotFoundResponse({ description: 'Setting not found', schema: { example: { error: { code: 'not-found', message: 'Setting not found' } } } })
    @ApiStandardErrors({ notFound: true })
    async getOne(@Param('key') key: string) {
        const result = await this.db.query('SELECT key, value FROM kb.settings WHERE key = $1', [key]);
        if (result.rows.length === 0) {
            throw new NotFoundException('Setting not found');
        }
        return result.rows[0];
    }

    @Put(':key')
    @ApiBody({ schema: { example: { value: 'dark' } } })
    @ApiOkResponse({ description: 'Update or create a setting', schema: { example: { key: 'theme', value: 'dark' } } })
    @ApiStandardErrors()
    async update(@Param('key') key: string, @Body() body: { value: any }) {
        await this.db.query(
            `INSERT INTO kb.settings (key, value, updated_at) 
             VALUES ($1, $2, now()) 
             ON CONFLICT (key) 
             DO UPDATE SET value = $2, updated_at = now()`,
            [key, JSON.stringify(body.value)]
        );
        return { key, value: body.value };
    }
}
