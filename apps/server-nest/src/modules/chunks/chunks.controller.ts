import { Controller, Get, UseInterceptors, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse, ApiQuery } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ChunkDto } from './dto/chunk.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { ChunksService } from './chunks.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

@ApiTags('Chunks')
@Controller('chunks')
@UseGuards(AuthGuard, ScopesGuard)
export class ChunksController {
    constructor(private readonly chunks: ChunksService) { }
    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List chunks', type: ChunkDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiQuery({ name: 'documentId', required: false, description: 'Filter by document UUID' })
    @ApiStandardErrors()
    // Chunk listing covered by documents:read (derived from project/document access)
    @Scopes('documents:read')
    list(@Query('documentId', new ParseUUIDPipe({ version: '4', optional: true })) documentId?: string) {
        return this.chunks.list(documentId);
    }
}
