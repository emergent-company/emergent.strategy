import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ChunkDto } from './dto/chunk.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';

@ApiTags('Chunks')
@Controller('chunks')
export class ChunksController {
    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List chunks', type: ChunkDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiStandardErrors()
    list() {
        return [{ id: 'chunk_1', documentId: 'doc_1', size: 512 }];
    }
}
