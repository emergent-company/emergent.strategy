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
    constructor(private readonly searchService: SearchService) { }

    @Get()
    @ApiOkResponse({ description: 'Hybrid / lexical / vector search over chunks', type: SearchResponseDto })
    @ApiBadRequestResponse({ description: 'Validation failed', schema: { example: { error: { code: 'validation-failed', message: 'Validation failed', details: { q: ['must be longer than or equal to 1 characters'] } } } } })
    @ApiStandardErrors()
    @Scopes('search:read')
    async search(@Query() query: SearchQueryDto): Promise<SearchResponseDto> {
        const { q = '', limit = 10, mode } = query;
        const { mode: finalMode, results, warning } = await this.searchService.search(q, limit, mode);
        return { mode: finalMode, results: results.map(r => ({ id: r.id, snippet: r.text, score: 0 })), warning };
    }
}
