import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
@Controller('search')
@ApiTags('Search')
@UseGuards(AuthGuard, ScopesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOkResponse({
    description: 'Hybrid / lexical / vector search over chunks',
    type: SearchResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed',
    schema: {
      example: {
        error: {
          code: 'validation-failed',
          message: 'Validation failed',
          details: { q: ['must be longer than or equal to 1 characters'] },
        },
      },
    },
  })
  @ApiStandardErrors()
  // Search requires dedicated search:read scope
  @Scopes('search:read')
  async search(@Query() query: SearchQueryDto): Promise<SearchResponseDto> {
    const startTime = performance.now();
    const {
      q = '',
      limit = 10,
      mode,
      lexicalWeight = 0.5,
      vectorWeight = 0.5,
      includePaths = false,
    } = query;
    const {
      mode: finalMode,
      results,
      warning,
      pathSummaries,
      totalCandidates,
    } = await this.searchService.search(
      q,
      limit,
      mode,
      lexicalWeight,
      vectorWeight,
      includePaths
    );
    const queryTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    // Map results and merge path summaries
    const mappedResults = results.map((r) => {
      const result: {
        id: string;
        snippet: string;
        score: number;
        source: string;
        pathSummary?: string;
      } = {
        id: r.id,
        snippet: r.text,
        score: 0,
        source: r.document_id,
      };

      // Add path summary if available
      if (pathSummaries && pathSummaries.has(r.document_id)) {
        const pathData = pathSummaries.get(r.document_id);
        result.pathSummary = pathData.summary;
      }

      return result;
    });

    return {
      mode: finalMode,
      results: mappedResults,
      warning,
      query_time_ms: queryTimeMs,
      result_count: totalCandidates || results.length,
    };
  }
}
