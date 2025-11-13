import {
  Body,
  Controller,
  Post,
  Query,
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
} from '@nestjs/swagger';
import { GraphSearchService } from './graph-search.service';
import { GraphSearchRequestDto } from './dto/graph-search-request.dto';
import { GraphSearchResponseDto } from './dto/graph-search-response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@Controller('graph/search')
@ApiTags('Graph')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopesGuard)
export class GraphSearchController {
  constructor(private readonly service: GraphSearchService) {}

  @Post()
  @HttpCode(200)
  @Scopes('graph:search:read')
  @ApiBody({ type: GraphSearchRequestDto })
  @ApiOkResponse({
    type: GraphSearchResponseDto,
    description: 'Graph hybrid search results (prototype)',
  })
  @ApiForbiddenResponse({
    description: 'Missing required scope (e.g., debug scope)',
    schema: {
      example: {
        error: {
          code: 'insufficient_scope',
          message: 'Debug scope required',
          details: { missing: ['graph:search:debug'] },
        },
      },
    },
  })
  async search(
    @Body() body: GraphSearchRequestDto,
    @Query('debug') debug?: string,
    @Req() req?: any
  ): Promise<GraphSearchResponseDto> {
    const wantsDebug = body.includeDebug || debug === 'true';
    const userScopes: string[] = Array.isArray(req?.user?.scopes)
      ? req.user.scopes
      : [];
    if (wantsDebug && !userScopes.includes('graph:search:debug')) {
      throw new ForbiddenException({
        error: {
          code: 'insufficient_scope',
          message: 'Debug scope required',
          details: { missing: ['graph:search:debug'] },
        },
      });
    }
    return this.service.search(body, { debug: wantsDebug, scopes: userScopes });
  }
}
