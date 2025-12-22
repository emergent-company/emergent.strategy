import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import {
  RequireProjectId,
  ProjectContext,
  OptionalProjectId,
  OptionalProjectContext,
  RequireUserId,
} from '../../common/decorators/project-context.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiProduces,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { ObjectRefinementService } from './object-refinement.service';
import { GraphService } from '../graph/graph.service';
import { ChatGenerationService } from '../chat/chat-generation.service';
import { LangfuseService } from '../langfuse/langfuse.service';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { UnifiedSearchService } from '../unified-search/unified-search.service';
import { TypeRegistryService } from '../type-registry/type-registry.service';
import { DatabaseService } from '../../common/database/database.service';
import { createChatSearchTool } from '../chat-sdk/tools/chat-search.tool';
import { createWebSearchTool } from '../chat-sdk/tools/web-search.tool';
import { createGetDatabaseSchemaTool } from '../chat-sdk/tools/schema.tool';
import { createObjectQueryTool } from '../chat-sdk/tools/object-query.tool';
import { AIMessage, isAIMessage } from '@langchain/core/messages';
import {
  RefinementMessageDto,
  ApplySuggestionDto,
  RejectSuggestionDto,
  RefinementConversationDto,
  RefinementChatMessageDto,
  ApplySuggestionResultDto,
} from './dto/refinement.dto';

// SSE event types for streaming
class RefinementStreamMetaEvent {
  type!: 'meta';
  conversationId!: string;
  objectId!: string;
  objectVersion!: number;
}

class RefinementStreamTokenEvent {
  type!: 'token';
  token!: string;
}

class RefinementStreamSuggestionsEvent {
  type!: 'suggestions';
  suggestions!: any[];
}

class RefinementStreamErrorEvent {
  type!: 'error';
  error!: string;
}

class RefinementStreamDoneEvent {
  type!: 'done';
}

/**
 * Controller for object refinement chat functionality
 *
 * Provides endpoints for:
 * - Getting/creating refinement conversations for objects
 * - Sending messages (with streaming responses)
 * - Applying/rejecting suggestions
 */
@ApiTags('Object Refinement')
@ApiExtraModels(
  RefinementStreamMetaEvent,
  RefinementStreamTokenEvent,
  RefinementStreamSuggestionsEvent,
  RefinementStreamErrorEvent,
  RefinementStreamDoneEvent
)
@Controller('objects')
@UseGuards(AuthGuard, ScopesGuard)
export class ObjectRefinementController {
  private readonly logger = new Logger(ObjectRefinementController.name);

  constructor(
    private readonly refinementService: ObjectRefinementService,
    private readonly graphService: GraphService,
    private readonly chatGenerationService: ChatGenerationService,
    private readonly langGraphService: LangGraphService,
    private readonly unifiedSearchService: UnifiedSearchService,
    private readonly typeRegistryService: TypeRegistryService,
    private readonly db: DatabaseService,
    @Optional() private readonly langfuseService?: LangfuseService
  ) {}

  /**
   * Get organization ID from project ID for tool context
   */
  private async getOrganizationIdFromProject(
    projectId: string
  ): Promise<string | null> {
    const result = await this.db.query<{ organization_id: string }>(
      'SELECT organization_id FROM kb.projects WHERE id = $1',
      [projectId]
    );

    if (!result.rows[0]) {
      this.logger.warn(`Project ${projectId} not found`);
      return null;
    }

    return result.rows[0].organization_id ?? null;
  }

  /**
   * Create tools for refinement chat
   * Includes knowledge base search, web search, schema inspection, and object query
   */
  private async createRefinementTools(
    projectId: string,
    orgId: string
  ): Promise<any[]> {
    const tools: any[] = [];

    // Search Tool - for finding related information in the knowledge base
    const searchTool = createChatSearchTool(this.unifiedSearchService, {
      orgId,
      projectId,
      scopes: ['search:read', 'graph:search:read'],
    });
    tools.push(searchTool);

    // Schema Tool - for understanding object types and their attributes
    const schemaTool = createGetDatabaseSchemaTool(this.typeRegistryService, {
      projectId,
    });
    tools.push(schemaTool);

    // Object Query Tool - for finding specific objects by criteria
    const queryTool = createObjectQueryTool(this.graphService, {
      projectId,
      orgId,
    });
    tools.push(queryTool);

    // Web Search Tool - for external information (DuckDuckGo, no API key required)
    const webSearchTool = createWebSearchTool();
    tools.push(webSearchTool);

    return tools;
  }

  /**
   * Verify user has access to the object's project
   */
  private async verifyObjectAccess(
    objectId: string,
    projectId: string | null
  ): Promise<void> {
    this.logger.debug(
      `[verifyObjectAccess] objectId=${objectId}, projectId=${projectId}`
    );

    // Get the object to verify it exists and get its project
    try {
      const object = await this.graphService.getObject(objectId, {
        projectId: projectId || undefined,
      });

      this.logger.debug(
        `[verifyObjectAccess] getObject result: ${
          object ? `found (project_id=${object.project_id})` : 'null'
        }`
      );

      if (!object) {
        throw new NotFoundException(`Object ${objectId} not found`);
      }

      // If projectId header provided, verify object belongs to that project
      if (projectId && object.project_id !== projectId) {
        throw new ForbiddenException(
          'Object does not belong to the specified project'
        );
      }
    } catch (error) {
      this.logger.error(
        `[verifyObjectAccess] Error: ${
          error instanceof Error ? error.message : error
        }`
      );
      throw error;
    }
  }

  /**
   * Get or create a refinement conversation for an object
   */
  @Get(':objectId/refinement-chat')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Get or create refinement conversation for an object',
    description:
      'Returns the existing refinement conversation for the object, or creates a new one if none exists.',
  })
  @ApiOkResponse({
    description: 'Refinement conversation',
    type: RefinementConversationDto,
  })
  @ApiNotFoundResponse({ description: 'Object not found' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  async getOrCreateConversation(
    @Param('objectId') objectId: string,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<{
    conversation: RefinementConversationDto;
    messages: RefinementChatMessageDto[];
    objectVersion: number;
  }> {
    const { projectId } = ctx;

    // Verify access
    await this.verifyObjectAccess(objectId, projectId);

    // Get or create conversation
    const conversation = await this.refinementService.getOrCreateConversation(
      objectId,
      projectId,
      userId
    );

    // Get messages
    const rawMessages = await this.refinementService.getMessages(
      conversation.id
    );

    // Get object version for apply suggestion functionality
    const objectVersion =
      (await this.refinementService.getObjectVersion(objectId, projectId)) ?? 1;

    // Transform messages to DTO format
    const messages: RefinementChatMessageDto[] = rawMessages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      userId: m.userId,
      suggestions: m.metadata?.suggestions?.map((s, idx) => ({
        index: idx,
        type: s.type,
        explanation: s.explanation,
        details: this.getSuggestionDetails(s),
        status:
          m.metadata?.suggestionStatuses?.find((st) => st.index === idx)
            ?.status || 'pending',
      })),
      createdAt: m.createdAt,
    }));

    return { conversation, messages, objectVersion };
  }

  /**
   * Send a message to the refinement chat (streaming response)
   */
  @Post(':objectId/refinement-chat')
  @Scopes('graph:write')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Send a message to refinement chat',
    description:
      'Sends a user message and streams the AI response with refinement suggestions.',
  })
  @ApiOkResponse({
    description: 'Streaming response with AI suggestions',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(RefinementStreamMetaEvent) },
            { $ref: getSchemaPath(RefinementStreamTokenEvent) },
            { $ref: getSchemaPath(RefinementStreamSuggestionsEvent) },
            { $ref: getSchemaPath(RefinementStreamErrorEvent) },
            { $ref: getSchemaPath(RefinementStreamDoneEvent) },
          ],
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Object not found' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async sendMessage(
    @Param('objectId') objectId: string,
    @Body() dto: RefinementMessageDto,
    @OptionalProjectId() ctx: OptionalProjectContext,
    @Req() req: any,
    @Res() res: Response
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatus.FORBIDDEN).json({
        error: { code: 'forbidden', message: 'User not authenticated' },
      });
      return;
    }

    const { projectId } = ctx;
    if (!projectId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'bad-request',
          message: 'x-project-id header required',
        },
      });
      return;
    }

    if (!dto.content?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: { code: 'bad-request', message: 'Message content required' },
      });
      return;
    }

    try {
      // Verify access
      await this.verifyObjectAccess(objectId, projectId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        res
          .status(HttpStatus.NOT_FOUND)
          .json({ error: { code: 'not-found', message: error.message } });
        return;
      }
      if (error instanceof ForbiddenException) {
        res
          .status(HttpStatus.FORBIDDEN)
          .json({ error: { code: 'forbidden', message: error.message } });
        return;
      }
      throw error;
    }

    // Get or create conversation
    const conversation = await this.refinementService.getOrCreateConversation(
      objectId,
      projectId,
      userId
    );

    // Get object version for optimistic locking context
    const objectVersion = await this.refinementService.getObjectVersion(
      objectId,
      projectId
    );

    // Create Langfuse trace for this refinement chat message
    const traceId = uuidv4();
    const langfuseTraceId = this.langfuseService?.createJobTrace(
      traceId,
      {
        name: `Refinement Chat: ${objectId.slice(0, 8)}`,
        objectId,
        conversationId: conversation.id,
        objectVersion,
        userId,
        projectId,
      },
      undefined,
      'refinement-chat'
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    // Emit meta event
    const metaEvent = {
      type: 'meta',
      conversationId: conversation.id,
      objectId,
      objectVersion,
    };
    res.write(`data: ${JSON.stringify(metaEvent)}\n\n`);

    try {
      // Save user message
      await this.refinementService.saveUserMessage(
        conversation.id,
        dto.content,
        userId
      );

      // Assemble context for the object
      const context = await this.refinementService.assembleContext(objectId);

      // Build the system prompt with object context
      const systemPrompt = this.refinementService.buildSystemPrompt(context);

      // Track response, token count, and errors
      let responseContent = '';
      let tokenCount = 0;
      let llmError: string | null = null;
      let toolsUsed: string[] = [];

      // Create Langfuse generation observation for the LLM call
      const generation = langfuseTraceId
        ? this.langfuseService?.createObservation(
            langfuseTraceId,
            'refinement_generation',
            { systemPrompt, userMessage: dto.content },
            {
              objectId,
              conversationId: conversation.id,
              contextChunks: context.sourceChunks?.length ?? 0,
              contextRelationships: context.relationships?.length ?? 0,
            }
          )
        : null;

      // Check if LangGraph service is ready
      if (this.langGraphService.isReady()) {
        try {
          // Get org ID for tools
          const orgId = await this.getOrganizationIdFromProject(projectId);

          // Create tools if we have org context
          let tools: any[] = [];
          if (orgId) {
            tools = await this.createRefinementTools(projectId, orgId);
            this.logger.log(
              `Created ${tools.length} tools for refinement chat`
            );
          }

          // Build enhanced system message with tool instructions
          const enhancedSystemMessage = `${systemPrompt}

## Available Tools
You have access to tools that help you provide better refinement suggestions:
1. search_knowledge_base - Search for related objects, documents, and information
2. query_graph_objects - Find specific objects by type, status, or other criteria
3. get_database_schema - Inspect object types and their attributes
4. search_web - Search the internet for external information

Use these tools when:
- You need to understand how similar objects are structured
- You want to find related objects that might inform suggestions
- You need to verify object types or schema before suggesting changes
- The user asks about external best practices or standards`;

          // Stream using LangGraph with tools
          const langGraphStream =
            await this.langGraphService.streamConversation({
              message: dto.content,
              threadId: conversation.id,
              tools,
              systemMessage: enhancedSystemMessage,
            });

          // Process the LangGraph stream and emit SSE events
          for await (const chunk of langGraphStream) {
            // LangGraph with streamMode: 'values' emits full state on each step
            if (chunk.messages && Array.isArray(chunk.messages)) {
              const lastMessage = chunk.messages[chunk.messages.length - 1];

              // Track tool calls
              if (lastMessage.additional_kwargs?.tool_calls) {
                for (const tc of lastMessage.additional_kwargs.tool_calls) {
                  if (
                    tc.function?.name &&
                    !toolsUsed.includes(tc.function.name)
                  ) {
                    toolsUsed.push(tc.function.name);
                    // Emit tool use event for UI feedback
                    res.write(
                      `data: ${JSON.stringify({
                        type: 'tool_use',
                        tool: tc.function.name,
                      })}\n\n`
                    );
                  }
                }
              }

              // Extract AI message content for streaming
              if (isAIMessage(lastMessage)) {
                const content =
                  typeof lastMessage.content === 'string'
                    ? lastMessage.content
                    : '';

                // Stream new content as tokens
                if (content.length > responseContent.length) {
                  const newContent = content.slice(responseContent.length);
                  // Split by words for smoother streaming
                  const tokens = newContent.split(/(\s+)/);
                  for (const token of tokens) {
                    if (token) {
                      tokenCount++;
                      res.write(
                        `data: ${JSON.stringify({ type: 'token', token })}\n\n`
                      );
                    }
                  }
                  responseContent = content;
                }
              }
            }
          }
        } catch (llmErr) {
          const llmErrorMessage =
            llmErr instanceof Error ? llmErr.message : 'LLM error';
          llmError = llmErrorMessage;
          this.logger.warn(
            `LangGraph generation failed, using fallback: ${llmErrorMessage}`
          );

          // Emit error meta frame
          res.write(
            `data: ${JSON.stringify({
              type: 'meta',
              generation_error: llmErrorMessage,
            })}\n\n`
          );

          // Fallback response
          const objectName =
            (context.object.properties?.name as string) ||
            context.object.key ||
            context.object.id;
          responseContent = `I was unable to analyze "${objectName}" at this time due to a service issue. Please try again later.`;

          // Stream fallback tokens
          const fallbackTokens = responseContent.split(/(\s+)/);
          for (const token of fallbackTokens) {
            if (token) {
              res.write(
                `data: ${JSON.stringify({ type: 'token', token })}\n\n`
              );
            }
          }
        }
      } else {
        // LangGraph not ready - provide informative message
        const objectName =
          (context.object.properties?.name as string) ||
          context.object.key ||
          context.object.id;
        responseContent = `Object refinement chat is currently unavailable. The object "${objectName}" has ${
          Object.keys(context.object.properties || {}).length
        } properties and ${context.relationships.length} relationships.`;

        res.write(
          `data: ${JSON.stringify({
            type: 'meta',
            generation_disabled: true,
          })}\n\n`
        );

        const disabledTokens = responseContent.split(/(\s+)/);
        for (const token of disabledTokens) {
          if (token) {
            res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
          }
        }
      }

      // Parse suggestions from the response content
      const suggestions =
        this.refinementService.parseSuggestionsFromContent(responseContent);

      // If suggestions were found, emit them
      if (suggestions.length > 0) {
        res.write(
          `data: ${JSON.stringify({ type: 'suggestions', suggestions })}\n\n`
        );
      }

      // Save assistant message with suggestions
      await this.refinementService.saveAssistantMessage(
        conversation.id,
        responseContent,
        suggestions,
        objectVersion || undefined
      );

      // Update Langfuse generation observation with output
      if (generation && this.langfuseService) {
        this.langfuseService.updateObservation(
          generation,
          {
            response: responseContent,
            suggestionCount: suggestions.length,
            toolsUsed,
          },
          { completionTokens: tokenCount },
          undefined,
          llmError ? 'error' : 'success',
          llmError || undefined
        );
      }

      // Finalize Langfuse trace
      if (langfuseTraceId && this.langfuseService) {
        await this.langfuseService.finalizeTrace(
          langfuseTraceId,
          llmError ? 'error' : 'success',
          {
            responseLength: responseContent.length,
            suggestionCount: suggestions.length,
            tokenCount,
            toolsUsed,
          }
        );
      }

      // Emit done event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Refinement chat error: ${errorMessage}`, error);
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`
      );

      // Finalize Langfuse trace with error
      if (langfuseTraceId && this.langfuseService) {
        await this.langfuseService.finalizeTrace(langfuseTraceId, 'error', {
          error: errorMessage,
        });
      }
    }

    res.end();
  }

  /**
   * Apply a suggestion from the refinement chat
   */
  @Post(':objectId/refinement-chat/apply')
  @HttpCode(HttpStatus.OK)
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Apply a suggestion to the object',
    description:
      'Applies a specific suggestion from an assistant message to modify the object.',
  })
  @ApiOkResponse({
    description: 'Result of applying the suggestion',
    type: ApplySuggestionResultDto,
  })
  @ApiNotFoundResponse({ description: 'Object or suggestion not found' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiBadRequestResponse({ description: 'Invalid request or version conflict' })
  async applySuggestion(
    @Param('objectId') objectId: string,
    @Body() dto: ApplySuggestionDto,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<ApplySuggestionResultDto> {
    const { projectId } = ctx;

    // Verify access
    await this.verifyObjectAccess(objectId, projectId);

    // Apply the suggestion
    const result = await this.refinementService.applySuggestion(
      objectId,
      dto.messageId,
      dto.suggestionIndex,
      dto.expectedVersion,
      userId,
      projectId
    );

    if (!result.success) {
      // Return error in response body rather than throwing
      // This allows frontend to handle version conflicts gracefully
      return result;
    }

    return result;
  }

  /**
   * Reject a suggestion from the refinement chat
   */
  @Post(':objectId/refinement-chat/reject')
  @HttpCode(HttpStatus.OK)
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Reject a suggestion',
    description: 'Marks a suggestion as rejected with an optional reason.',
  })
  @ApiOkResponse({
    description: 'Suggestion rejected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Suggestion not found' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  async rejectSuggestion(
    @Param('objectId') objectId: string,
    @Body() dto: RejectSuggestionDto,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { projectId } = ctx;

    // Verify access
    await this.verifyObjectAccess(objectId, projectId);

    // Reject the suggestion
    return this.refinementService.rejectSuggestion(
      dto.messageId,
      dto.suggestionIndex,
      userId,
      dto.reason
    );
  }

  /**
   * Get messages for a refinement conversation
   */
  @Get(':objectId/refinement-chat/messages')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Get messages for refinement conversation',
    description:
      'Returns all messages in the refinement conversation for an object.',
  })
  @ApiOkResponse({
    description: 'List of messages',
    type: [RefinementChatMessageDto],
  })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  async getMessages(
    @Param('objectId') objectId: string,
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<RefinementChatMessageDto[]> {
    const { projectId } = ctx;

    // Verify access
    await this.verifyObjectAccess(objectId, projectId);

    // Find the conversation for this object
    const conversation = await this.refinementService.getOrCreateConversation(
      objectId,
      projectId,
      userId
    );

    // Get messages
    const rawMessages = await this.refinementService.getMessages(
      conversation.id
    );

    // Transform to DTO format
    return rawMessages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      userId: m.userId,
      suggestions: m.metadata?.suggestions?.map((s, idx) => ({
        index: idx,
        type: s.type,
        explanation: s.explanation,
        details: this.getSuggestionDetails(s),
        status:
          m.metadata?.suggestionStatuses?.find((st) => st.index === idx)
            ?.status || 'pending',
      })),
      createdAt: m.createdAt,
    }));
  }

  /**
   * Helper to extract suggestion details based on type
   */
  private getSuggestionDetails(suggestion: any): Record<string, unknown> {
    switch (suggestion.type) {
      case 'property_change':
        return {
          propertyKey: suggestion.propertyKey,
          oldValue: suggestion.oldValue,
          newValue: suggestion.newValue,
        };
      case 'rename':
        return {
          oldName: suggestion.oldName,
          newName: suggestion.newName,
        };
      case 'relationship_add':
        return {
          relationshipType: suggestion.relationshipType,
          targetObjectId: suggestion.targetObjectId,
          targetObjectName: suggestion.targetObjectName,
          properties: suggestion.properties,
        };
      case 'relationship_remove':
        return {
          relationshipId: suggestion.relationshipId,
          relationshipType: suggestion.relationshipType,
        };
      default:
        return {};
    }
  }
}
