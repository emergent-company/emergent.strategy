import {
  Body,
  Controller,
  Post,
  UseGuards,
  ForbiddenException,
  HttpCode,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiForbiddenResponse,
  ApiBody,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { UnifiedSearchService } from './unified-search.service';
import { UnifiedSearchRequestDto } from './dto/unified-search-request.dto';
import { UnifiedSearchResponseDto } from './dto/unified-search-response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

/**
 * Controller for unified search combining graph objects and document chunks
 *
 * This endpoint provides a single search interface that:
 * - Searches both graph objects (decisions, requirements, etc.) and document chunks
 * - Fuses results using configurable strategies (weighted, RRF, interleave)
 * - Optionally expands relationships for graph results
 * - Returns unified results with consistent scoring
 */
@Controller('search/unified')
@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopesGuard)
export class UnifiedSearchController {
  constructor(private readonly service: UnifiedSearchService) {}

  /**
   * Unified search across graph objects and document chunks
   *
   * Executes parallel search across:
   * - Graph search: Hybrid search over nodes with optional relationship expansion
   * - Text search: Hybrid search over document chunks
   *
   * Results are fused using the specified strategy and returned in a unified format.
   *
   * @param body - Search request with query, fusion strategy, and options
   * @param req - Request object containing user context and scopes
   * @returns Unified search results with metadata
   */
  @Post()
  @HttpCode(200)
  @Scopes('search:read')
  @ApiBody({ type: UnifiedSearchRequestDto })
  @ApiOkResponse({
    type: UnifiedSearchResponseDto,
    description:
      'Unified search results combining graph objects and document chunks',
  })
  @ApiBadRequestResponse({
    description: 'Validation failed',
    schema: {
      example: {
        error: {
          code: 'validation-failed',
          message: 'Validation failed',
          details: {
            query: ['query must be shorter than or equal to 800 characters'],
          },
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Missing required scope (e.g., debug scope)',
    schema: {
      example: {
        error: {
          code: 'insufficient_scope',
          message: 'Debug scope required for includeDebug=true',
          details: { missing: ['search:debug'] },
        },
      },
    },
  })
  async search(
    @Body() body: UnifiedSearchRequestDto,
    @Req() req?: any
  ): Promise<UnifiedSearchResponseDto> {
    // Extract user scopes for authorization
    const userScopes: string[] = Array.isArray(req?.user?.scopes)
      ? req.user.scopes
      : [];

    // Check if debug mode is requested and user has required scope
    if (body.includeDebug && !userScopes.includes('search:debug')) {
      throw new ForbiddenException({
        error: {
          code: 'insufficient_scope',
          message: 'Debug scope required for includeDebug=true',
          details: { missing: ['search:debug'] },
        },
      });
    }

    // Extract organization and project context from request
    const orgId = req?.user?.orgId;
    const projectId = req?.user?.projectId;

    // Execute unified search
    return this.service.search(body, {
      orgId,
      projectId,
      scopes: userScopes,
    });
  }
}
