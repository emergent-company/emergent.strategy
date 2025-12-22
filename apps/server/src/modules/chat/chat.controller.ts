import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  HttpStatus,
  Patch,
  Body,
  Delete,
  Post,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  RequireProjectId,
  ProjectContext,
  OptionalProjectId,
  OptionalProjectContext,
} from '../../common/decorators/project-context.decorator';
import {
  ApiOkResponse,
  ApiTags,
  ApiNotFoundResponse,
  ApiProduces,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

class HistoryItemDto {
  @IsString()
  role!: 'user' | 'assistant' | 'system';

  @IsString()
  content!: string;
}

class ChatRequestDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  documentIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryItemDto)
  history?: HistoryItemDto[];

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ChatService } from './chat.service';
import { ChatGenerationService } from './chat-generation.service';
import { McpClientService } from './mcp-client.service';
import { McpToolDetectorService } from './mcp-tool-detector.service';
import { McpToolSelectorService } from './mcp-tool-selector.service';
import { GraphService } from '../graph/graph.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import type { Request, Response } from 'express';

// Extra schema models for richer OpenAPI component documentation of streaming events
class CitationDto {
  @IsUUID()
  documentId!: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  score?: number;
}

// Graph object DTOs for SSE events
class GraphObjectDto {
  @IsUUID()
  id!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  properties?: Record<string, any>;

  @IsOptional()
  distance?: number;
}

/**
 * Filter internal metadata fields from graph object properties.
 * Removes fields starting with underscore (_extraction_*, _confidence, etc.)
 * while keeping all user-defined properties.
 *
 * @param obj Graph object from database
 * @returns Graph object with filtered properties
 */
function filterGraphObjectMetadata(obj: any): any {
  if (!obj || !obj.properties) return obj;

  const filteredProperties: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj.properties)) {
    // Keep all properties except those starting with underscore (internal metadata)
    if (!key.startsWith('_')) {
      filteredProperties[key] = value;
    }
  }

  return {
    id: obj.id,
    type: obj.type,
    key: obj.key,
    properties: filteredProperties,
    distance: obj.distance,
    // Include additional fields that might be useful
    labels: obj.labels,
    created_at: obj.created_at,
    version: obj.version,
  };
}

class GraphObjectNeighborsDto {
  @IsUUID()
  objectId!: string;

  @IsArray()
  neighbors!: GraphObjectDto[];
}

// SSE event variants (union). Represent each possible frame shape for POST /chat/stream
class ChatStreamMetaEvent {
  type!: 'meta';
  conversationId!: string;
  citations!: CitationDto[];
}
class ChatStreamTokenEvent {
  type!: 'token';
  token!: string;
}
class ChatStreamErrorEvent {
  type!: 'error';
  error!: string;
}
class ChatStreamDoneEvent {
  type!: 'done';
}
// MCP Tool SSE events
class ChatStreamMcpToolEvent {
  type!: 'mcp_tool';
  tool!: string;
  status!: 'started' | 'completed' | 'error';
  result?: any;
  error?: string;
}

// GET stream event frame variants (SSE) (different shape than POST stream for backward compatibility)
class GetChatStreamMetaFrame {
  meta!: { chat_model_enabled: boolean; google_key: boolean };
}
class GetChatStreamTokenFrame {
  message!: string;
  index!: number;
  streaming?: boolean;
  total?: number;
}
class GetChatStreamCitationsFrame {
  citations!: CitationDto[];
}
class GetChatStreamGraphObjectsFrame {
  graphObjects!: GraphObjectDto[];
}
class GetChatStreamGraphNeighborsFrame {
  graphNeighbors!: Record<string, GraphObjectDto[]>;
}
class GetChatStreamSummaryFrame {
  summary!: true;
  token_count!: number;
  citations_count!: number;
  graph_objects_count?: number;
}
class GetChatStreamDoneFrame {
  done!: true;
  message!: string;
}
class GetChatStreamErrorFrame {
  error!: { code: string; message: string };
  done?: true;
}

@ApiTags('Chat')
@ApiExtraModels(
  ChatRequestDto,
  CitationDto,
  GraphObjectDto,
  GraphObjectNeighborsDto,
  ChatStreamMetaEvent,
  ChatStreamTokenEvent,
  ChatStreamErrorEvent,
  ChatStreamDoneEvent,
  ChatStreamMcpToolEvent,
  GetChatStreamMetaFrame,
  GetChatStreamTokenFrame,
  GetChatStreamCitationsFrame,
  GetChatStreamGraphObjectsFrame,
  GetChatStreamGraphNeighborsFrame,
  GetChatStreamSummaryFrame,
  GetChatStreamDoneFrame,
  GetChatStreamErrorFrame
)
@Controller('chat')
@UseGuards(AuthGuard, ScopesGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly gen: ChatGenerationService,
    private readonly mcpClient: McpClientService,
    private readonly mcpDetector: McpToolDetectorService,
    private readonly mcpSelector: McpToolSelectorService,
    private readonly graphService: GraphService
  ) {}
  private static readonly UUID_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

  @Get('conversations')
  @ApiOkResponse({
    description: 'List chat conversations',
    schema: {
      example: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: '2025-01-01 — Hello world',
          is_private: false,
        },
      ],
    },
  })
  @ApiStandardErrors()
  // Listing conversations = chat usage scope
  @Scopes('chat:use')
  async listConversations(
    @RequireProjectId() ctx: ProjectContext,
    @Req() req: any
  ) {
    const userId = req.user?.id || null;
    const { shared, private: priv } = await this.chat.listConversations(
      userId,
      ctx.orgId || null,
      ctx.projectId
    );
    // E2E tests expect an object with private array property (and optionally shared)
    return { shared, private: priv };
  }

  @Post('conversations')
  @ApiOkResponse({
    description: 'Create a new conversation (201)',
    schema: {
      example: {
        conversationId: '11111111-1111-4111-8111-111111111111',
        id: '11111111-1111-4111-8111-111111111111',
        title: '2025-01-01 — New Conversation',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'message required' } },
    },
  })
  // Creating conversation = chat usage scope (admin not required)
  @Scopes('chat:use')
  async createConversation(
    @Body() body: { message?: string; isPrivate?: boolean },
    @Req() req: any,
    @Res() res: Response
  ) {
    const message = String(body?.message || '').trim();
    if (!message)
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: { code: 'bad-request', message: 'message required' } });
    const userId = req.user?.id || null;
    const orgId = (req.headers['x-org-id'] as string | undefined) || null;
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId)
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'bad-request',
          message: 'x-project-id header required',
        },
      });
    const isPrivate =
      typeof body?.isPrivate === 'boolean' ? body.isPrivate : false; // default public for unauth tests
    const id = await this.chat.createConversationIfNeeded(
      undefined,
      message,
      userId,
      orgId,
      projectId,
      isPrivate
    );
    const meta = await this.chat.getConversation(id, userId, orgId, projectId);
    // Creation semantics: respond with 201
    // Backward compatibility: include both conversationId and id in response (tests may use either field)
    return res.status(HttpStatus.CREATED).json({
      conversationId: id,
      id,
      title: meta && meta !== 'forbidden' ? meta.title : message,
    });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get a conversation with messages' })
  @ApiNotFoundResponse({
    description: 'Conversation not found',
    schema: {
      example: {
        error: { code: 'not-found', message: 'Conversation not found' },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Forbidden',
    schema: { example: { error: { code: 'forbidden', message: 'Forbidden' } } },
  })
  @ApiStandardErrors({ notFound: true })
  // Reading a conversation requires chat:use
  @Scopes('chat:use')
  async getConversation(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    const userId = req.user?.id || null;
    const orgId = (req.headers['x-org-id'] as string | undefined) || null;
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    const conv = await this.chat.getConversation(id, userId, orgId, projectId);
    if (conv === null)
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    if (conv === 'forbidden')
      return res
        .status(HttpStatus.FORBIDDEN)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
    return res.json(conv);
  }

  @Get(':id/stream')
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description:
      'Chat streaming endpoint (SSE). Emits a sequence of JSON frames each prefixed by "data: ".',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(GetChatStreamMetaFrame) },
            { $ref: getSchemaPath(GetChatStreamTokenFrame) },
            { $ref: getSchemaPath(GetChatStreamCitationsFrame) },
            { $ref: getSchemaPath(GetChatStreamSummaryFrame) },
            { $ref: getSchemaPath(GetChatStreamDoneFrame) },
            { $ref: getSchemaPath(GetChatStreamErrorFrame) },
          ],
        },
        examples: {
          meta: {
            value:
              'data: {"meta":{"chat_model_enabled":true,"google_key":true}}\n\n',
          },
          token: {
            value: 'data: {"message":"token-0","index":0,"streaming":true}\n\n',
          },
          citations: {
            value:
              'data: {"citations":[{"documentId":"11111111-1111-4111-8111-111111111111"}]}\n\n',
          },
          summary: {
            value:
              'data: {"summary":true,"token_count":5,"citations_count":2}\n\n',
          },
          done: { value: 'data: {"done":true,"message":"[DONE]"}\n\n' },
          error: {
            value:
              'data: {"error":{"code":"upstream-failed","message":"Simulated upstream model failure"},"done":true}\n\n',
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Missing project header',
    schema: {
      example: {
        error: { code: 'bad-request', message: 'x-project-id header required' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Conversation not found',
    schema: {
      example: {
        error: { code: 'not-found', message: 'Conversation not found' },
      },
    },
  })
  // Streaming (GET) also requires chat:use
  @Scopes('chat:use')
  async streamGet(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    // Validation tightening: enforce x-project-id header & UUID format before streaming.
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'bad-request',
          message: 'x-project-id header required',
        },
      });
    }
    if (!ChatController.UUID_RE.test(id)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    }
    // Check conversation existence & access BEFORE switching to SSE headers to return proper JSON errors.
    const userId = req.user?.id || null;
    const orgId = (req.headers['x-org-id'] as string | undefined) || null;
    const conv = await this.chat.getConversation(id, userId, orgId, projectId);
    if (conv === null) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    }
    if (conv === 'forbidden') {
      return res
        .status(HttpStatus.FORBIDDEN)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    // Enhanced SSE: deterministic tokens plus optional citation batch before DONE.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    // Emit initial meta frame so tests/dev can see flags early
    try {
      const meta = {
        meta: {
          chat_model_enabled: this.gen.enabled,
          google_key: (this.gen as any).hasKey ?? false,
        },
      };
      res.write(`data: ${JSON.stringify(meta)}\n\n`);
    } catch {
      /* ignore meta errors */
    }

    // Forced error simulation (for E2E test chat.streaming-error.e2e.spec.ts)
    const forceError = String(req.query?.forceError ?? '').trim() === '1';
    if (forceError) {
      // Emit a single error frame with done=true and NO summary frame.
      res.write(
        `data: ${JSON.stringify({
          error: {
            code: 'upstream-failed',
            message: 'Simulated upstream model failure',
          },
          done: true,
        })}\n\n`
      );
      return res.end();
    }

    // Graph search for contextual augmentation - retrieves relevant knowledge graph objects
    let graphObjects: any[] = [];
    let graphNeighbors: Record<string, any[]> = {};
    const userQuestion = conv.messages?.[0]?.content || 'Hello';

    // Feature flag to enable/disable graph search (default: enabled)
    const graphSearchEnabled = process.env.CHAT_ENABLE_GRAPH_SEARCH !== '0';

    // eslint-disable-next-line no-console
    console.log(
      '[stream] Starting graph search - enabled:',
      graphSearchEnabled,
      'question:',
      userQuestion,
      'projectId:',
      projectId,
      'orgId:',
      orgId
    );

    if (graphSearchEnabled) {
      try {
        // eslint-disable-next-line no-console
        console.log(
          '[stream] Calling graphService.searchObjectsWithNeighbors...'
        );

        const graphContext = await this.graphService.searchObjectsWithNeighbors(
          userQuestion,
          {
            limit: 5,
            includeNeighbors: true,
            maxNeighbors: 3,
            maxDistance: 0.5,
            projectId,
            orgId: orgId || undefined,
          }
        );

        // Filter metadata from objects and neighbors
        graphObjects = graphContext.primaryResults.map(
          filterGraphObjectMetadata
        );
        graphNeighbors = Object.fromEntries(
          Object.entries(graphContext.neighbors).map(([objId, neighbors]) => [
            objId,
            neighbors.map(filterGraphObjectMetadata),
          ])
        );

        // eslint-disable-next-line no-console
        console.log(
          '[stream] Graph search returned:',
          graphObjects.length,
          'objects with',
          Object.keys(graphNeighbors).length,
          'neighbor groups'
        );

        // Log first object with full properties for debugging
        if (graphObjects.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            '[stream] First object (full):',
            JSON.stringify(graphObjects[0], null, 2)
          );
        }

        // Emit graph objects in SSE event
        if (graphObjects.length > 0) {
          // eslint-disable-next-line no-console
          console.log('[stream] Emitting graphObjects SSE event...');
          res.write(`data: ${JSON.stringify({ graphObjects })}\n\n`);
        }

        // Emit graph neighbors in SSE event
        if (Object.keys(graphNeighbors).length > 0) {
          // eslint-disable-next-line no-console
          console.log('[stream] Emitting graphNeighbors SSE event...');
          res.write(`data: ${JSON.stringify({ graphNeighbors })}\n\n`);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          '[stream] Graph search FAILED:',
          (e as Error).message,
          (e as Error).stack
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        '[stream] Graph search disabled (CHAT_ENABLE_GRAPH_SEARCH=0)'
      );
    }

    // DISABLED: Legacy citation retrieval system (hybrid search)
    // Citations are replaced by graph search for richer contextual knowledge
    let citations: any[] = []; // Keep for backward compatibility with SSE events

    // Feature flag to re-enable citations if needed (default: disabled)
    const citationsEnabled = process.env.CHAT_ENABLE_CITATIONS === '1';
    if (citationsEnabled) {
      try {
        citations = (await this.chat.retrieveCitations(
          userQuestion,
          4,
          orgId,
          projectId,
          null
        )) as any[];
        if (process.env.E2E_DEBUG_CHAT === '1') {
          // eslint-disable-next-line no-console
          console.log(
            '[stream] pre-retrieval citations count=',
            citations.length
          );
        }
      } catch (e) {
        if (process.env.E2E_DEBUG_CHAT === '1') {
          // eslint-disable-next-line no-console
          console.log(
            '[stream] retrieval failed pre-generation:',
            (e as Error).message
          );
        }
      }
    } else if (process.env.E2E_DEBUG_CHAT === '1') {
      // eslint-disable-next-line no-console
      console.log('[stream] citations disabled (CHAT_ENABLE_CITATIONS=0)');
    }
    const tokens: string[] = [];
    if (this.gen.enabled) {
      if (process.env.E2E_DEBUG_CHAT === '1') {
        // eslint-disable-next-line no-console
        console.log(`[stream] generation enabled for conversation ${id}`);
      }
      try {
        let idx = 0;

        // Build enhanced context from graph objects and neighbors
        let contextParts: string[] = [];

        // Add graph objects context
        if (graphObjects.length > 0) {
          contextParts.push('**Relevant Knowledge Graph Objects:**\n');
          for (const obj of graphObjects) {
            const name = obj.properties?.name || obj.key || obj.id;
            const description = obj.properties?.description || '';
            contextParts.push(
              `- [${obj.type}] ${name}${description ? ': ' + description : ''}`
            );

            // Add neighbors for this object
            const neighbors = graphNeighbors[obj.id] || [];
            if (neighbors.length > 0) {
              contextParts.push(`  Related objects:`);
              for (const neighbor of neighbors.slice(0, 3)) {
                const neighborName =
                  neighbor.properties?.name || neighbor.key || neighbor.id;
                contextParts.push(`    • [${neighbor.type}] ${neighborName}`);
              }
            }
          }
          contextParts.push('');
        }

        // Add citations context if available (for backward compatibility)
        if (citations.length > 0) {
          contextParts.push('**Relevant Documents:**\n');
          for (const citation of citations) {
            contextParts.push(`- ${citation.text}`);
          }
          contextParts.push('');
        }

        const contextString =
          contextParts.length > 0
            ? `\n\nContext:\n${contextParts.join('\n')}\n`
            : '';

        const prompt = `You are a helpful assistant for querying knowledge graphs and schemas. Answer questions clearly and concisely based on the provided context.${contextString}\nQuestion: ${userQuestion}\nAnswer:`;

        const content = await this.gen.generateStreaming(prompt, (t) => {
          const token = t;
          tokens.push(token);
          // Deterministic test mode adds total field to simplify assertions
          const frame: any = { message: token, index: idx++, streaming: true }; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (process.env.CHAT_TEST_DETERMINISTIC === '1') frame.total = 5;
          res.write(`data: ${JSON.stringify(frame)}\n\n`);
        });
        // Optional debug: log and stream a truncated preview of the final assembled model response
        if (process.env.E2E_DEBUG_CHAT === '1') {
          const preview = content.slice(0, 400);
          // eslint-disable-next-line no-console
          console.log(
            '[stream] model full content preview (truncated 400 chars):',
            preview
          );
          try {
            res.write(
              `data: ${JSON.stringify({
                meta: { model_content_preview: preview },
              })}\n\n`
            );
          } catch {
            /* ignore */
          }
        }
        // Overwrite tokens summary generation based on content length
      } catch (e) {
        if (process.env.E2E_DEBUG_CHAT === '1') {
          // eslint-disable-next-line no-console
          console.log(
            '[stream] generation failed, falling back synthetic:',
            (e as Error).message
          );
        }
        try {
          res.write(
            `data: ${JSON.stringify({
              meta: { generation_error: (e as Error).message },
            })}\n\n`
          );
        } catch {
          /* ignore */
        }
        // Fallback to synthetic if generation fails
        for (let i = 0; i < 5; i++) {
          const t = `token-${i} `;
          tokens.push(t);
          res.write(
            `data: ${JSON.stringify({ message: t, index: i, total: 5 })}\n\n`
          );
        }
      }
    } else {
      if (process.env.E2E_DEBUG_CHAT === '1') {
        // eslint-disable-next-line no-console
        console.log(
          `[stream] generation disabled (enabled flag false) conversation ${id}`
        );
      }
      try {
        res.write(
          `data: ${JSON.stringify({ meta: { generation_disabled: true } })}\n\n`
        );
      } catch {
        /* ignore */
      }
      for (let i = 0; i < 5; i++) {
        const t = `token-${i} `;
        tokens.push(t);
        res.write(
          `data: ${JSON.stringify({ message: t, index: i, total: 5 })}\n\n`
        );
      }
    }
    // DISABLED: Fallback citation retrieval
    // citations already retrieved pre-generation; if empty we can attempt a fallback retrieval using conversation identifier
    // if (!citations.length && citationsEnabled) {
    //     try { citations = await this.chat.retrieveCitations(`conversation:${id}`, 3, orgId, projectId, null) as any[]; } catch { /* swallow */ }
    // }
    // Note: citations array intentionally kept empty (backward compatibility for SSE events)
    if (citations.length && citationsEnabled) {
      res.write(`data: ${JSON.stringify({ citations })}\n\n`);
    }
    // No codename injection – rely on real model output OR generation_error meta path.
    // Persist assistant message if conversation exists (avoid FK violation for arbitrary ids in tests)
    try {
      const exists = await this.chat.hasConversation(id);
      if (exists) {
        // Join tokens without separator to preserve newlines and formatting from LLM
        const content = tokens.join('');
        await this.chat.persistAssistantMessage(id, content, citations);
        if (process.env.E2E_DEBUG_CHAT === '1') {
          this.logger.log(
            `[stream] persisted assistant message (${tokens.length} tokens, ${citations.length} citations) for conversation ${id}`
          );
        }
      } else if (process.env.E2E_DEBUG_CHAT === '1') {
        this.logger.log(
          `[stream] conversation ${id} does not exist, skipping persistence`
        );
      }
    } catch (e) {
      // Log persistence errors in debug mode but don't break the stream
      if (process.env.E2E_DEBUG_CHAT === '1') {
        this.logger.error(
          `[stream] Failed to persist assistant message for conversation ${id}: ${
            (e as Error).message
          }`,
          (e as Error).stack
        );
      }
    }
    // Emit summary frame BEFORE final done marker to allow clients to surface stats progressively
    const summary = {
      summary: true,
      token_count: tokens.length,
      citations_count: citations.length,
      graph_objects_count: graphObjects.length,
    };
    res.write(`data: ${JSON.stringify(summary)}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, message: '[DONE]' })}\n\n`);
    res.end();
  }

  @Patch(':id')
  @ApiOkResponse({
    description: 'Rename conversation',
    schema: { example: { ok: true, id: 'c1', title: 'New Title' } },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'title required' } },
    },
  })
  @ApiNotFoundResponse({
    description: 'Conversation not found',
    schema: {
      example: {
        error: { code: 'not-found', message: 'Conversation not found' },
      },
    },
  })
  // Renaming conversation considered admin-only mutation
  @Scopes('chat:admin')
  async rename(
    @Param('id') id: string,
    @Body() body: { title?: string },
    @Req() req: any,
    @Res() res: Response
  ) {
    const title = String(body?.title || '').trim();
    if (!title)
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: { code: 'bad-request', message: 'title required' } });
    // For real UUID conversations, persist via service
    const userId = req.user?.id || null;
    const orgId = (req.headers['x-org-id'] as string | undefined) || null;
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!ChatController.UUID_RE.test(id)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    }
    const result = await this.chat.renameConversation(
      id,
      title,
      userId,
      orgId,
      projectId
    );
    if (result === 'not-found')
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    if (result === 'forbidden')
      return res
        .status(HttpStatus.FORBIDDEN)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
    return res.json({ ok: true, id, title });
  }

  @Delete(':id')
  @ApiOkResponse({
    description: 'Delete conversation',
    schema: { example: { ok: true, id: 'c1' } },
  })
  @ApiNotFoundResponse({
    description: 'Conversation not found',
    schema: {
      example: {
        error: { code: 'not-found', message: 'Conversation not found' },
      },
    },
  })
  // Deleting conversation = admin
  @Scopes('chat:admin')
  async delete(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const userId = req.user?.id || null;
    const orgId = (req.headers['x-org-id'] as string | undefined) || null;
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!ChatController.UUID_RE.test(id)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    }
    const result = await this.chat.deleteConversation(
      id,
      userId,
      orgId,
      projectId
    );
    if (result === 'not-found')
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { code: 'not-found', message: 'Conversation not found' },
      });
    if (result === 'forbidden')
      return res
        .status(HttpStatus.FORBIDDEN)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
    return res.status(HttpStatus.NO_CONTENT).send();
  }

  // Compatibility endpoint: POST /chat/stream (SSE) expected by admin frontend useChat hook
  // Mirrors simple Express server behavior: create (or reuse) conversation, persist user message, stream citations + tokens
  @Post('stream')
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description:
      'Chat streaming endpoint (SSE). Each line is an SSE data frame beginning with "data: ", followed by one of the JSON event shapes.',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(ChatStreamMetaEvent) },
            { $ref: getSchemaPath(ChatStreamTokenEvent) },
            { $ref: getSchemaPath(ChatStreamMcpToolEvent) },
            { $ref: getSchemaPath(ChatStreamErrorEvent) },
            { $ref: getSchemaPath(ChatStreamDoneEvent) },
          ],
          description:
            'Union of possible chat stream events (serialized per line as SSE frame).',
        },
        examples: {
          meta: {
            value:
              'data: {"type":"meta","conversationId":"11111111-1111-4111-8111-111111111111","citations":[]}\n\n',
          },
          mcp_started: {
            value:
              'data: {"type":"mcp_tool","tool":"schema_version","status":"started"}\n\n',
          },
          mcp_completed: {
            value:
              'data: {"type":"mcp_tool","tool":"schema_version","status":"completed","result":{"version":"1.0.0"}}\n\n',
          },
          mcp_error: {
            value:
              'data: {"type":"mcp_tool","tool":"schema_version","status":"error","error":"MCP server unavailable"}\n\n',
          },
          token: { value: 'data: {"type":"token","token":"Hello"}\n\n' },
          error: {
            value: 'data: {"type":"error","error":"model key missing"}\n\n',
          },
          done: { value: 'data: {"type":"done"}\n\n' },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'message required' } },
    },
  })
  @ApiBody({ type: ChatRequestDto })
  @ApiStandardErrors()
  // Streaming (POST) usage (create message) requires chat:use
  @Scopes('chat:use')
  async streamPost(
    @Body() body: ChatRequestDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    const message = String(body?.message || '').trim();
    if (!message)
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: { code: 'bad-request', message: 'message required' } });
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId)
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'bad-request',
          message: 'x-project-id header required',
        },
      });
    const orgId = (req.headers['x-org-id'] as string | undefined) || null;
    const userId = req.user?.id || null;
    const topK = Math.min(Math.max(Number(body?.topK || 5), 1), 20);
    const filterIds =
      Array.isArray(body?.documentIds) && body.documentIds.length
        ? body.documentIds
        : null;
    let convId: string;
    try {
      convId = await this.chat.createConversationIfNeeded(
        body?.conversationId,
        message,
        userId,
        orgId,
        projectId,
        !!body?.isPrivate
      );
      // If we reused an existing conversation (createConversationIfNeeded only persists message when NEW), persist user message explicitly.
      if (body?.conversationId && body.conversationId === convId) {
        await this.chat.persistUserMessage(convId, message);
      }
    } catch (e: any) {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      if ((e as Error).message === 'forbidden')
        return res
          .status(HttpStatus.FORBIDDEN)
          .json({ error: { code: 'forbidden', message: 'Forbidden' } });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'internal',
          message: 'failed to initialize conversation',
        },
      });
    }
    // Prepare SSE headers (explicit 200 OK status)
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    // Graph search for contextual augmentation - retrieves relevant knowledge graph objects
    let graphObjects: any[] = [];
    let graphNeighbors: Record<string, any[]> = {};

    const graphSearchEnabled = process.env.CHAT_ENABLE_GRAPH_SEARCH !== '0';

    // eslint-disable-next-line no-console
    console.log(
      '[stream-post] Starting graph search - enabled:',
      graphSearchEnabled,
      'question:',
      message,
      'projectId:',
      projectId,
      'orgId:',
      orgId
    );

    if (graphSearchEnabled) {
      try {
        // eslint-disable-next-line no-console
        console.log(
          '[stream-post] Calling graphService.searchObjectsWithNeighbors...'
        );

        const graphContext = await this.graphService.searchObjectsWithNeighbors(
          message,
          {
            limit: 5,
            includeNeighbors: true,
            maxNeighbors: 3,
            maxDistance: 0.5,
            projectId,
            orgId: orgId || undefined,
          }
        );

        // Filter metadata from objects and neighbors
        graphObjects = graphContext.primaryResults.map(
          filterGraphObjectMetadata
        );
        graphNeighbors = Object.fromEntries(
          Object.entries(graphContext.neighbors).map(([objId, neighbors]) => [
            objId,
            neighbors.map(filterGraphObjectMetadata),
          ])
        );

        // eslint-disable-next-line no-console
        console.log(
          '[stream-post] Graph search returned:',
          graphObjects.length,
          'objects with',
          Object.keys(graphNeighbors).length,
          'neighbor groups'
        );

        // Log first object with full properties for debugging
        if (graphObjects.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            '[stream-post] First object (full):',
            JSON.stringify(graphObjects[0], null, 2)
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          '[stream-post] Graph search FAILED:',
          (e as Error).message,
          (e as Error).stack
        );
        this.logger.warn(`Graph search failed: ${(e as Error).message}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        '[stream-post] Graph search disabled (CHAT_ENABLE_GRAPH_SEARCH=0)'
      );
    }

    // DISABLED: Legacy citation retrieval (hybrid search)
    // Citations are replaced by graph search for richer contextual knowledge
    let citations: any[] = []; // Keep for backward compatibility
    const citationsEnabled = process.env.CHAT_ENABLE_CITATIONS === '1';
    if (citationsEnabled) {
      try {
        citations = (await this.chat.retrieveCitations(
          message,
          topK,
          orgId,
          projectId,
          filterIds
        )) as any[];
      } catch {
        citations = [];
      }
    }

    // Build graph context string for LLM prompt (similar to GET endpoint)
    let graphContextString: string | undefined;
    if (graphObjects.length > 0) {
      const contextParts: string[] = [];
      contextParts.push('**Relevant Knowledge Graph Objects:**\n');
      for (const obj of graphObjects) {
        const name = obj.properties?.name || obj.key || obj.id;
        const description = obj.properties?.description || '';
        contextParts.push(
          `- [${obj.type}] ${name}${description ? ': ' + description : ''}`
        );

        // Add neighbors for this object
        const neighbors = graphNeighbors[obj.id] || [];
        if (neighbors.length > 0) {
          contextParts.push(`  Related objects:`);
          for (const neighbor of neighbors.slice(0, 3)) {
            const neighborName =
              neighbor.properties?.name || neighbor.key || neighbor.id;
            contextParts.push(`    • [${neighbor.type}] ${neighborName}`);
          }
        }
      }
      graphContextString = contextParts.join('\n');
      // eslint-disable-next-line no-console
      console.log(
        '[stream-post] Built graph context string:',
        graphContextString.length,
        'chars'
      );
    }

    // Emit meta frame first with conversationId and graph objects
    try {
      const meta: any = { type: 'meta', conversationId: convId, citations: [] };
      if (citationsEnabled && citations.length) {
        meta.citations = citations;
      }
      if (graphSearchEnabled && graphObjects.length) {
        // eslint-disable-next-line no-console
        console.log(
          '[stream-post] Adding',
          graphObjects.length,
          'graphObjects to meta frame'
        );
        meta.graphObjects = graphObjects;
        meta.graphNeighbors = graphNeighbors;
      }
      // eslint-disable-next-line no-console
      console.log('[stream-post] Emitting meta frame:', Object.keys(meta));
      res.write(`data: ${JSON.stringify(meta)}\n\n`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        '[stream-post] Failed to emit meta frame:',
        (e as Error).message
      );
    }

    // MCP Tool Detection & Execution
    // Detect if message is a schema-related query that should invoke MCP tools
    let mcpToolContext = '';
    let detectedIntent:
      | 'schema-version'
      | 'schema-changes'
      | 'type-info'
      | 'entity-query'
      | 'entity-list'
      | 'general' = 'general';
    const mcpEnabled = process.env.CHAT_ENABLE_MCP !== '0'; // Default enabled unless explicitly disabled
    const useLlmSelection = process.env.USE_LLM_TOOL_SELECTION !== '0'; // Default enabled unless explicitly disabled

    if (mcpEnabled) {
      let detection: {
        shouldUseMcp: boolean;
        suggestedTool?: string;
        suggestedArguments?: any;
        detectedIntent?: string;
        confidence?: number;
      } = {
        shouldUseMcp: false,
      };

      // Try LLM-based tool selection first (more flexible, context-aware)
      if (useLlmSelection) {
        try {
          const llmSelection = await this.mcpSelector.selectTool(
            message,
            orgId || '',
            projectId || ''
          );

          if (
            llmSelection.shouldUseMcp &&
            llmSelection.suggestedTool &&
            llmSelection.confidence &&
            llmSelection.confidence > 0.7
          ) {
            // LLM selection successful with high confidence
            detection = {
              shouldUseMcp: true,
              suggestedTool: llmSelection.suggestedTool,
              suggestedArguments: llmSelection.suggestedArguments,
              detectedIntent: llmSelection.detectedIntent || 'general',
              confidence: llmSelection.confidence,
            };
            this.logger.log(
              `LLM tool selection: ${detection.suggestedTool} (confidence: ${detection.confidence})`
            );
          } else {
            // LLM selection low confidence, fallback to pattern matching
            this.logger.log(
              `LLM tool selection low confidence (${llmSelection.confidence}), falling back to pattern matching`
            );
            detection = this.mcpDetector.detect(message);
          }
        } catch (llmError: any) {
          // LLM selection failed, fallback to pattern matching
          this.logger.warn(
            `LLM tool selection failed: ${llmError.message}, falling back to pattern matching`
          );
          detection = this.mcpDetector.detect(message);
        }
      } else {
        // LLM selection disabled, use pattern matching directly
        detection = this.mcpDetector.detect(message);
      }

      // Store detected intent for prompt building
      if (detection.detectedIntent && detection.detectedIntent !== 'none') {
        detectedIntent = detection.detectedIntent as any;
      }

      if (detection.shouldUseMcp && detection.suggestedTool) {
        // Emit MCP tool started event
        try {
          res.write(
            `data: ${JSON.stringify({
              type: 'mcp_tool',
              tool: detection.suggestedTool,
              status: 'started',
            })}\n\n`
          );
        } catch {
          /* ignore SSE write errors */
        }

        try {
          // Initialize MCP client (reads MCP_SERVER_URL from config)
          const mcpServerUrl =
            process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp/rpc';

          // Extract user's auth token from request
          const authHeader = req.headers.authorization;
          const authToken = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : undefined;

          await this.mcpClient.initialize({
            serverUrl: mcpServerUrl,
            authToken, // Pass user's token for MCP authentication
            clientInfo: {
              name: 'nexus-chat',
              version: '1.0.0',
            },
          });

          // Call MCP tool with detected arguments
          const toolResult = await this.mcpClient.callTool(
            detection.suggestedTool,
            detection.suggestedArguments || {}
          );

          // Extract text content from tool result
          if (toolResult.content && toolResult.content.length > 0) {
            const textContent = toolResult.content
              .filter((c) => c.type === 'text' && c.text)
              .map((c) => c.text)
              .join('\n');

            if (textContent) {
              mcpToolContext = textContent;
            }
          }

          // Emit MCP tool completed event
          try {
            res.write(
              `data: ${JSON.stringify({
                type: 'mcp_tool',
                tool: detection.suggestedTool,
                status: 'completed',
                result: toolResult,
              })}\n\n`
            );
          } catch {
            /* ignore SSE write errors */
          }
        } catch (mcpError: any) {
          // Emit MCP tool error event but continue with generation
          try {
            res.write(
              `data: ${JSON.stringify({
                type: 'mcp_tool',
                tool: detection.suggestedTool,
                status: 'error',
                error: mcpError.message || 'MCP tool execution failed',
              })}\n\n`
            );
          } catch {
            /* ignore SSE write errors */
          }

          // Log error for debugging but don't fail the request
          this.logger.warn(
            `MCP tool execution failed: ${mcpError.message}`,
            mcpError.stack
          );
        }
      }
    }

    const tokens: string[] = [];
    const canGenerate = this.gen.enabled && this.gen.hasKey;
    if (canGenerate) {
      try {
        // Build prompt using enhanced prompt builder with MCP context, graph context, detected intent, and custom template from project settings
        const prompt = await this.gen.buildPrompt({
          message,
          mcpToolContext,
          graphContext: graphContextString,
          detectedIntent,
          projectId: projectId || undefined,
        });

        // Log prompt preview for debugging
        // eslint-disable-next-line no-console
        console.log(
          '[stream-post] Prompt preview (first 500 chars):',
          prompt.substring(0, 500)
        );

        await this.gen.generateStreaming(prompt, (t) => {
          tokens.push(t);
          try {
            res.write(
              `data: ${JSON.stringify({ type: 'token', token: t })}\n\n`
            );
          } catch {
            /* swallow */
          }
        });
      } catch (e: any) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        try {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: (e as Error).message || 'generation failed',
            })}\n\n`
          );
        } catch {}
      }
    } else {
      // Model disabled or missing key: emit a clear error frame and finish
      try {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: this.gen.enabled
              ? 'model key missing'
              : 'chat model disabled',
          })}\n\n`
        );
      } catch {
        /* ignore */
      }
    }

    // Persist assistant message if any tokens were produced
    if (tokens.length) {
      // Join tokens without separator to preserve newlines and formatting from LLM
      try {
        await this.chat.persistAssistantMessage(
          convId,
          tokens.join(''),
          citations
        );
      } catch {
        /* ignore persistence errors */
      }
    }
    try {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch {
      /* ignore */
    }
    res.end();
  }
}
