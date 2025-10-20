import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SchemaVersionService } from './services/schema-version.service';
import { SchemaVersionDto, SchemaChangeDto } from './dto/schema.dto';

@Controller('mcp')
@ApiTags('MCP')
export class McpController {
    constructor(
        private readonly schemaVersionService: SchemaVersionService,
    ) { }

    @Get('schema/version')
    @ApiOperation({
        summary: 'Get current schema version hash',
        description:
            'Returns a hash representing the current state of all schemas. ' +
            'Agents can use this to determine if cached tools are still valid.',
    })
    @ApiResponse({
        status: 200,
        description: 'Current schema version information',
        type: SchemaVersionDto,
    })
    async getSchemaVersion(): Promise<SchemaVersionDto> {
        const details = await this.schemaVersionService.getSchemaVersionDetails();

        return {
            version: details.version,
            updated_at: details.latest_update || new Date().toISOString(),
            cache_hint_ttl: 300, // Suggest 5 min cache
        };
    }

    @Get('schema/changelog')
    @ApiOperation({
        summary: 'Get schema change history',
        description: 'Returns recent schema changes for debugging and tracking',
    })
    @ApiResponse({
        status: 200,
        description: 'Schema change history',
        type: [SchemaChangeDto],
    })
    async getSchemaChangelog(
        @Query('since') since?: string,
        @Query('limit') limit: number = 10,
    ): Promise<SchemaChangeDto[]> {
        // TODO: Implement changelog retrieval in TemplatePackService
        // return this.templatePackService.getSchemaChangelog(since, limit);
        return [];
    }
}
