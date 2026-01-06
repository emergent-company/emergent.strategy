import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ApiTokensService } from './api-tokens.service';
import {
  CreateApiTokenDto,
  ApiTokenDto,
  CreateApiTokenResponseDto,
  ApiTokenListResponseDto,
} from './dto/api-token.dto';

@ApiTags('API Tokens')
@Controller('projects/:projectId/tokens')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  @Post()
  @ApiOperation({
    summary: 'Create API token',
    description:
      'Generate a new API token for MCP access. The token value is only returned once.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiCreatedResponse({
    description: 'Token created successfully',
    type: CreateApiTokenResponseDto,
  })
  @ApiStandardErrors()
  @Scopes('project:read')
  async create(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateApiTokenDto,
    @Req() req: any
  ): Promise<CreateApiTokenResponseDto> {
    const userId = req.user?.id;
    return this.apiTokensService.create(
      projectId,
      userId,
      dto.name,
      dto.scopes
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List API tokens',
    description:
      'List all API tokens for a project. Token values are not included.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiOkResponse({
    description: 'List of tokens',
    type: ApiTokenListResponseDto,
  })
  @ApiStandardErrors()
  @Scopes('project:read')
  async list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string
  ): Promise<ApiTokenListResponseDto> {
    const tokens = await this.apiTokensService.listByProject(projectId);
    return {
      tokens,
      total: tokens.length,
    };
  }

  @Get(':tokenId')
  @ApiOperation({
    summary: 'Get API token details',
    description:
      'Get details of a specific API token. Token value is not included.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiParam({ name: 'tokenId', description: 'Token ID', type: 'string' })
  @ApiOkResponse({
    description: 'Token details',
    type: ApiTokenDto,
  })
  @ApiStandardErrors()
  @Scopes('project:read')
  async get(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('tokenId', new ParseUUIDPipe({ version: '4' })) tokenId: string
  ): Promise<ApiTokenDto> {
    const token = await this.apiTokensService.getById(tokenId, projectId);
    if (!token) {
      throw new NotFoundException({
        error: { code: 'token-not-found', message: 'Token not found' },
      });
    }
    return token;
  }

  @Delete(':tokenId')
  @ApiOperation({
    summary: 'Revoke API token',
    description:
      'Revoke an API token. The token will immediately stop working for authentication.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiParam({ name: 'tokenId', description: 'Token ID', type: 'string' })
  @ApiOkResponse({
    description: 'Token revoked',
    schema: { example: { status: 'revoked' } },
  })
  @ApiStandardErrors()
  @Scopes('project:read')
  async revoke(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('tokenId', new ParseUUIDPipe({ version: '4' })) tokenId: string,
    @Req() req: any
  ): Promise<{ status: string }> {
    const userId = req.user?.id;
    await this.apiTokensService.revoke(tokenId, projectId, userId);
    return { status: 'revoked' };
  }
}
