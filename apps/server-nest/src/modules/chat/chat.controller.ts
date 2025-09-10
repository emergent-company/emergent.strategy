import { Controller, Get, Param, Sse, NotFoundException, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse, ApiNotFoundResponse, ApiProduces } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { Observable, interval, map, take } from 'rxjs';

interface ChatMessageEvent {
    id: string;
    message: string;
    index: number;
    done?: boolean;
}

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
    @Get('conversations')
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List chat conversations', schema: { example: [{ id: 'c1', updatedAt: '2025-01-01T00:00:00Z' }] } })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid query' } } } })
    @ApiStandardErrors()
    listConversations() {
        return [{ id: 'c1', updatedAt: new Date().toISOString() }];
    }

    @Get(':id')
    @ApiOkResponse({ description: 'Get a conversation', schema: { example: { id: 'c1', messages: [] } } })
    @ApiNotFoundResponse({ description: 'Conversation not found', schema: { example: { error: { code: 'not-found', message: 'Conversation not found' } } } })
    @ApiStandardErrors({ notFound: true })
    getConversation(@Param('id') id: string) {
        if (id !== 'c1') throw new NotFoundException('Conversation not found');
        return { id, messages: [] };
    }

    @Get(':id/stream')
    @Sse()
    @ApiProduces('text/event-stream')
    @ApiOkResponse({ description: 'Stream conversation messages (Server-Sent Events)', content: { 'text/event-stream': { schema: { type: 'object', properties: { id: { type: 'string' }, message: { type: 'string' }, index: { type: 'integer' }, done: { type: 'boolean' } } } } } })
    @ApiNotFoundResponse({ description: 'Conversation not found', schema: { example: { error: { code: 'not-found', message: 'Conversation not found' } } } })
    @ApiStandardErrors({ notFound: true })
    streamConversation(@Param('id') id: string): Observable<MessageEvent<ChatMessageEvent>> {
        // Mock stream of 5 chunks then a done event
        return interval(150).pipe(
            take(6),
            map(i => {
                if (i < 5) {
                    return { data: { id, message: `token-${i}`, index: i } } as MessageEvent<ChatMessageEvent>;
                }
                return { data: { id, message: '[DONE]', index: i - 1, done: true } } as MessageEvent<ChatMessageEvent>;
            }),
        );
    }
}
