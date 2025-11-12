import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SchemaVersionService } from './services/schema-version.service';
import { SchemaVersionDto, SchemaChangeDto } from './dto/schema.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@Controller('mcp')
@ApiTags('MCP')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class McpController {
  constructor(private readonly schemaVersionService: SchemaVersionService) {}

  @Get('schema/version')
  @Scopes('schema:read')
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
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid bearer token',
    schema: {
      example: { error: { code: 'unauthorized', message: 'Unauthorized' } },
    },
  })
  @ApiForbiddenResponse({
    description: 'Insufficient scope - requires schema:read',
    schema: {
      example: {
        error: {
          code: 'forbidden',
          message: 'Forbidden',
          details: { missing: ['schema:read'] },
        },
      },
    },
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
  @Scopes('schema:read')
  @ApiOperation({
    summary: 'Get schema change history',
    description: 'Returns recent schema changes for debugging and tracking',
  })
  @ApiResponse({
    status: 200,
    description: 'Schema change history',
    type: [SchemaChangeDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid bearer token',
    schema: {
      example: { error: { code: 'unauthorized', message: 'Unauthorized' } },
    },
  })
  @ApiForbiddenResponse({
    description: 'Insufficient scope - requires schema:read',
    schema: {
      example: {
        error: {
          code: 'forbidden',
          message: 'Forbidden',
          details: { missing: ['schema:read'] },
        },
      },
    },
  })
  async getSchemaChangelog(
    @Query('since') since?: string,
    @Query('limit') limit: number = 10
  ): Promise<SchemaChangeDto[]> {
    // TODO: Implement changelog retrieval in TemplatePackService
    // return this.templatePackService.getSchemaChangelog(since, limit);
    return [];
  }
}
