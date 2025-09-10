import { Controller, Get, Param, ParseUUIDPipe, Query, UseInterceptors, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { DocumentDto } from './dto/document.dto';
import { DocumentsService } from './documents.service';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
    constructor(private readonly documents: DocumentsService) { }
    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List ingested documents', type: DocumentDto, isArray: true, headers: { 'x-next-cursor': { description: 'Base64 cursor for next page', schema: { type: 'string' } } } })
    @ApiQuery({ name: 'limit', required: false, schema: { type: 'number', minimum: 1, maximum: 500, default: 100 } })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiStandardErrors()
    async list(@Query('limit') limit?: string, @Query('cursor') cursor?: string, @Res({ passthrough: true }) res?: Response) {
        const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500) : 100;
        const decoded = this.documents.decodeCursor(cursor);
        const { items, nextCursor } = await this.documents.list(n, decoded);
        if (nextCursor) res?.setHeader('x-next-cursor', nextCursor);
        return items;
    }

    @Get(':id')
    @ApiOkResponse({ description: 'Get a document', type: DocumentDto })
    @ApiParam({ name: 'id', description: 'Document UUID' })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid id' } } } })
    @ApiStandardErrors()
    async get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
        const doc = await this.documents.get(id);
        if (!doc) throw new NotFoundException({ error: { code: 'not-found', message: 'Document not found' } });
        return doc;
    }
}
