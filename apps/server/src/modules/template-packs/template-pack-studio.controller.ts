import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
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
import {
  TemplatePackStudioService,
  CreateStudioSessionDto,
  SavePackDto,
  StudioSessionState,
} from './template-pack-studio.service';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { LangfuseService } from '../langfuse/langfuse.service';
import { TEMPLATE_STUDIO_PROMPT_NAMES } from '../langfuse/prompts/types';
import { isAIMessage } from '@langchain/core/messages';

// DTO classes for API documentation
class StudioMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}

class ApplyStudioSuggestionDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  suggestionId!: string;
}

class RejectStudioSuggestionDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  suggestionId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

// SSE event types for streaming
class StudioStreamMetaEvent {
  type!: 'meta';
  sessionId!: string;
  packId!: string;
}

class StudioStreamTokenEvent {
  type!: 'token';
  token!: string;
}

class StudioStreamSuggestionsEvent {
  type!: 'suggestions';
  suggestions!: any[];
}

class StudioStreamErrorEvent {
  type!: 'error';
  error!: string;
}

class StudioStreamDoneEvent {
  type!: 'done';
}

/**
 * Fallback system prompt for template pack studio LLM.
 * Used when Langfuse prompt management is not available.
 */
const TEMPLATE_STUDIO_SYSTEM_PROMPT_FALLBACK = `You are an expert JSON Schema designer helping users create and refine template packs for a knowledge graph system.

## Your Role
You help users define object types and relationship types using JSON Schema. Each type has:
- A JSON Schema defining its properties
- UI configuration (icon, color)
- Optional extraction prompts for AI-assisted data extraction

## JSON Schema Best Practices
When creating schemas:
1. Use descriptive property names in camelCase
2. Add "description" fields to explain the purpose of properties
3. Use appropriate types: string, number, integer, boolean, array, object
4. Use "enum" for fixed value sets
5. Mark required properties appropriately
6. Use "format" for special strings (date, date-time, email, uri)
7. Keep schemas focused - one concept per object type
8. Add "examples" arrays to properties to illustrate expected values - examples help users understand what data to enter and improve AI extraction accuracy

## Examples in Properties
When defining properties, include an "examples" array with 2-5 representative values. Examples must match the property type:
- String properties: \`"examples": ["Genesis", "Exodus", "Matthew"]\`
- Number properties: \`"examples": [1, 42, 100]\`
- Integer properties: \`"examples": [1, 10, 50]\`
- Boolean properties: \`"examples": [true, false]\`
- Array properties: \`"examples": [["tag1", "tag2"], ["item1"]]\`

Examples are especially useful for:
- Properties with domain-specific values (names, categories, technical terms)
- Properties where the expected format might be ambiguous
- Properties that will be extracted by AI from documents

## Response Format
When suggesting schema changes, include structured suggestions in your response using this format:

\`\`\`suggestions
[
  {
    "type": "add_object_type",
    "target_type": "Person",
    "description": "A human entity with identifying information",
    "after": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "Full name", "examples": ["John Smith", "Jane Doe", "Robert Johnson"] },
        "email": { "type": "string", "format": "email", "description": "Email address", "examples": ["john@example.com", "jane.doe@company.org"] }
      },
      "required": ["name"]
    }
  },
  {
    "type": "modify_object_type",
    "target_type": "Person",
    "description": "Add phone number field",
    "before": { "...current schema..." },
    "after": { "...updated schema..." }
  },
  {
    "type": "add_relationship_type",
    "target_type": "WORKS_AT",
    "description": "Employment relationship between Person and Organization",
    "after": {
      "type": "object",
      "properties": {
        "role": { "type": "string", "description": "Job title or role", "examples": ["Software Engineer", "Product Manager", "CEO"] },
        "startDate": { "type": "string", "format": "date", "examples": ["2024-01-15", "2023-06-01"] }
      }
    }
  },
  {
    "type": "remove_object_type",
    "target_type": "DeprecatedType",
    "description": "Remove unused type"
  },
  {
    "type": "update_ui_config",
    "target_type": "Person",
    "description": "Update visual appearance",
    "after": { "icon": "user", "color": "#3B82F6" }
  }
]
\`\`\`

Suggestion types:
- **add_object_type**: Create a new object type with schema
- **modify_object_type**: Update an existing object type's schema
- **remove_object_type**: Delete an object type
- **add_relationship_type**: Create a new relationship type
- **modify_relationship_type**: Update a relationship type's schema
- **remove_relationship_type**: Delete a relationship type
- **update_ui_config**: Change icon/color for a type
- **update_extraction_prompt**: Set AI extraction guidance for a type

## Guidelines
1. Start by understanding what domain the user wants to model
2. Suggest object types that represent key entities in their domain
3. Suggest relationship types that capture how entities relate
4. Be specific about property types and constraints
5. Explain why each suggestion improves the template pack
6. If the user's request is unclear, ask clarifying questions first`;

/**
 * Controller for Template Pack Studio functionality
 *
 * Provides endpoints for:
 * - Creating studio sessions (new or from existing pack)
 * - Loading existing packs for editing
 * - Sending chat messages (with streaming responses)
 * - Applying/rejecting suggestions
 * - Saving finalized packs
 * - Discarding sessions
 */
@ApiTags('Template Pack Studio')
@ApiExtraModels(
  StudioStreamMetaEvent,
  StudioStreamTokenEvent,
  StudioStreamSuggestionsEvent,
  StudioStreamErrorEvent,
  StudioStreamDoneEvent
)
@Controller('template-packs/studio')
@UseGuards(AuthGuard, ScopesGuard)
export class TemplatePackStudioController {
  private readonly logger = new Logger(TemplatePackStudioController.name);

  constructor(
    private readonly studioService: TemplatePackStudioService,
    private readonly langGraphService: LangGraphService,
    @Optional() private readonly langfuseService?: LangfuseService
  ) {}

  /**
   * Extract request context (userId, projectId)
   */
  private extractContext(req: any): {
    userId: string;
    projectId: string | null;
  } {
    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;

    return { userId, projectId };
  }

  /**
   * Get the system prompt for Template Studio.
   * Tries to fetch from Langfuse first, falls back to hardcoded prompt.
   */
  private async getSystemPrompt(): Promise<{
    prompt: string;
    fromLangfuse: boolean;
    version?: number;
  }> {
    if (this.langfuseService?.isPromptManagementAvailable()) {
      try {
        const langfusePrompt = await this.langfuseService.getTextPrompt(
          TEMPLATE_STUDIO_PROMPT_NAMES.TEMPLATE_STUDIO_SYSTEM
        );
        if (langfusePrompt) {
          this.logger.debug(
            `Using Langfuse prompt '${TEMPLATE_STUDIO_PROMPT_NAMES.TEMPLATE_STUDIO_SYSTEM}' version ${langfusePrompt.version}`
          );
          return {
            prompt: langfusePrompt.prompt as string,
            fromLangfuse: true,
            version: langfusePrompt.version,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Template Studio prompt from Langfuse, using fallback: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
    return {
      prompt: TEMPLATE_STUDIO_SYSTEM_PROMPT_FALLBACK,
      fromLangfuse: false,
    };
  }

  /**
   * Create a new studio session
   */
  @Post()
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Create a new studio session',
    description:
      'Creates a new studio session with an empty draft pack or cloned from an existing pack.',
  })
  @ApiCreatedResponse({
    description: 'Studio session created',
  })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async createSession(
    @Body() dto: CreateStudioSessionDto,
    @Req() req: any
  ): Promise<StudioSessionState> {
    const { userId, projectId } = this.extractContext(req);

    if (!projectId) {
      throw new BadRequestException('x-project-id header required');
    }

    const session = await this.studioService.createSession(
      userId,
      projectId,
      dto
    );

    this.logger.log(
      `Created studio session ${session.id} for user ${userId} in project ${projectId}`
    );

    return session;
  }

  /**
   * Load an existing pack for editing
   */
  @Post(':packId')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Load existing pack into studio',
    description:
      'Creates a studio session by cloning an existing pack for editing.',
  })
  @ApiCreatedResponse({
    description: 'Studio session created with cloned pack',
  })
  @ApiNotFoundResponse({ description: 'Pack not found' })
  async loadPackForEditing(
    @Param('packId') packId: string,
    @Req() req: any
  ): Promise<StudioSessionState> {
    const { userId, projectId } = this.extractContext(req);

    if (!projectId) {
      throw new BadRequestException('x-project-id header required');
    }

    const session = await this.studioService.createSession(userId, projectId, {
      sourcePackId: packId,
    });

    this.logger.log(
      `Loaded pack ${packId} into studio session ${session.id} for user ${userId}`
    );

    return session;
  }

  /**
   * Get current session state
   */
  @Get('session/:sessionId')
  @Scopes('templates:read')
  @ApiOperation({
    summary: 'Get studio session state',
    description: 'Returns the current state of a studio session.',
  })
  @ApiOkResponse({
    description: 'Session state',
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  async getSession(
    @Param('sessionId') sessionId: string,
    @Req() req: any
  ): Promise<StudioSessionState> {
    const { userId } = this.extractContext(req);

    const session = await this.studioService.getSession(sessionId, userId);

    if (!session) {
      throw new NotFoundException('Session not found or unauthorized');
    }

    return session;
  }

  /**
   * Get active sessions for current user
   */
  @Get('sessions')
  @Scopes('templates:read')
  @ApiOperation({
    summary: 'Get user studio sessions',
    description: 'Returns active studio sessions for the current user.',
  })
  @ApiOkResponse({
    description: 'List of active sessions',
  })
  async getUserSessions(@Req() req: any): Promise<StudioSessionState[]> {
    const { userId, projectId } = this.extractContext(req);

    if (!projectId) {
      throw new BadRequestException('x-project-id header required');
    }

    return this.studioService.getUserSessions(userId, projectId);
  }

  /**
   * Send a chat message (streaming response)
   */
  @Post('session/:sessionId/chat')
  @Scopes('templates:write')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Send chat message to studio',
    description:
      'Sends a user message and streams the AI response with schema suggestions.',
  })
  @ApiOkResponse({
    description: 'Streaming response with AI suggestions',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(StudioStreamMetaEvent) },
            { $ref: getSchemaPath(StudioStreamTokenEvent) },
            { $ref: getSchemaPath(StudioStreamSuggestionsEvent) },
            { $ref: getSchemaPath(StudioStreamErrorEvent) },
            { $ref: getSchemaPath(StudioStreamDoneEvent) },
          ],
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  @ApiForbiddenResponse({ description: 'Access denied' })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: StudioMessageDto,
    @Req() req: any,
    @Res() res: Response
  ): Promise<void> {
    const { userId } = this.extractContext(req);

    if (!dto.content?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: { code: 'bad-request', message: 'Message content required' },
      });
      return;
    }

    // Verify session access
    const session = await this.studioService.getSession(sessionId, userId);
    if (!session) {
      res.status(HttpStatus.NOT_FOUND).json({
        error: {
          code: 'not-found',
          message: 'Session not found or unauthorized',
        },
      });
      return;
    }

    if (session.status !== 'active') {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: { code: 'bad-request', message: 'Session is not active' },
      });
      return;
    }

    // Create Langfuse trace
    const traceId = uuidv4();
    const langfuseTraceId = this.langfuseService?.createJobTrace(
      traceId,
      {
        name: `Template Studio: ${session.pack.name}`,
        sessionId,
        packId: session.pack.id,
        userId,
      },
      undefined,
      'template-studio'
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    // Emit meta event
    const metaEvent = {
      type: 'meta',
      sessionId,
      packId: session.pack.id,
    };
    res.write(`data: ${JSON.stringify(metaEvent)}\n\n`);

    try {
      // Save user message
      await this.studioService.saveUserMessage(sessionId, dto.content);

      // Build context from current pack state
      const packContext = this.studioService.buildPackContext(session.pack);

      // Get system prompt (from Langfuse or fallback)
      const {
        prompt: baseSystemPrompt,
        fromLangfuse,
        version: promptVersion,
      } = await this.getSystemPrompt();

      if (fromLangfuse) {
        this.logger.debug(
          `Using Langfuse prompt version ${promptVersion} for Template Studio`
        );
      }

      // Build system prompt with pack context
      const systemPrompt = `${baseSystemPrompt}

${packContext}`;

      // Track response
      let responseContent = '';
      let tokenCount = 0;
      let llmError: string | null = null;

      // Create Langfuse observation
      const generation = langfuseTraceId
        ? this.langfuseService?.createObservation(
            langfuseTraceId,
            'studio_generation',
            { systemPrompt, userMessage: dto.content },
            {
              sessionId,
              packId: session.pack.id,
              objectTypeCount: Object.keys(session.pack.object_type_schemas)
                .length,
              relationshipTypeCount: Object.keys(
                session.pack.relationship_type_schemas
              ).length,
            }
          )
        : null;

      // Check if LangGraph service is ready
      if (this.langGraphService.isReady()) {
        try {
          // Stream using LangGraph
          const langGraphStream =
            await this.langGraphService.streamConversation({
              message: dto.content,
              threadId: `studio-${sessionId}`,
              tools: [], // No tools for now - pure schema design
              systemMessage: systemPrompt,
            });

          // Process the stream
          for await (const chunk of langGraphStream) {
            if (chunk.messages && Array.isArray(chunk.messages)) {
              const lastMessage = chunk.messages[chunk.messages.length - 1];

              if (isAIMessage(lastMessage)) {
                const content =
                  typeof lastMessage.content === 'string'
                    ? lastMessage.content
                    : '';

                // Stream new content as tokens
                if (content.length > responseContent.length) {
                  const newContent = content.slice(responseContent.length);
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
          this.logger.warn(`LangGraph generation failed: ${llmErrorMessage}`);

          // Emit error meta frame
          res.write(
            `data: ${JSON.stringify({
              type: 'meta',
              generation_error: llmErrorMessage,
            })}\n\n`
          );

          // Fallback response
          responseContent = `I was unable to process your request at this time due to a service issue. Please try again later.`;

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
        // LangGraph not ready
        responseContent = `Template Pack Studio is currently unavailable. Please check that the AI service is configured correctly.`;

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

      // Parse suggestions from the response
      const suggestions =
        this.studioService.parseSuggestionsFromContent(responseContent);

      // Emit suggestions if found
      if (suggestions.length > 0) {
        res.write(
          `data: ${JSON.stringify({ type: 'suggestions', suggestions })}\n\n`
        );
      }

      // Save assistant message
      await this.studioService.saveAssistantMessage(
        sessionId,
        responseContent,
        suggestions
      );

      // Update Langfuse observation
      if (generation && this.langfuseService) {
        this.langfuseService.updateObservation(
          generation,
          {
            response: responseContent,
            suggestionCount: suggestions.length,
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
          }
        );
      }

      // Emit done event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Studio chat error: ${errorMessage}`, error);
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
   * Apply a suggestion
   */
  @Post('session/:sessionId/apply')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Apply a suggestion',
    description: 'Applies a schema suggestion to the draft pack.',
  })
  @ApiOkResponse({
    description: 'Suggestion applied successfully',
  })
  @ApiNotFoundResponse({ description: 'Session or suggestion not found' })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async applySuggestion(
    @Param('sessionId') sessionId: string,
    @Body() dto: ApplyStudioSuggestionDto,
    @Req() req: any
  ): Promise<{ success: boolean; error?: string; pack?: any }> {
    const { userId } = this.extractContext(req);

    const result = await this.studioService.applySuggestion(
      sessionId,
      dto.messageId,
      dto.suggestionId,
      userId
    );

    return {
      success: result.success,
      error: result.error,
      pack: result.updatedPack,
    };
  }

  /**
   * Reject a suggestion
   */
  @Post('session/:sessionId/reject')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Reject a suggestion',
    description: 'Marks a suggestion as rejected.',
  })
  @ApiOkResponse({
    description: 'Suggestion rejected',
  })
  @ApiNotFoundResponse({ description: 'Session or suggestion not found' })
  async rejectSuggestion(
    @Param('sessionId') sessionId: string,
    @Body() dto: RejectStudioSuggestionDto,
    @Req() req: any
  ): Promise<{ success: boolean; error?: string }> {
    const { userId } = this.extractContext(req);

    return this.studioService.rejectSuggestion(
      sessionId,
      dto.messageId,
      dto.suggestionId,
      userId,
      dto.reason
    );
  }

  /**
   * Save the pack
   */
  @Post('session/:sessionId/save')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Save the template pack',
    description: 'Finalizes and publishes the draft pack.',
  })
  @ApiOkResponse({
    description: 'Pack saved successfully',
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  @ApiBadRequestResponse({ description: 'Invalid request or validation error' })
  async savePack(
    @Param('sessionId') sessionId: string,
    @Body() dto: SavePackDto,
    @Req() req: any
  ): Promise<any> {
    const { userId } = this.extractContext(req);

    const pack = await this.studioService.savePack(sessionId, userId, dto);

    this.logger.log(
      `Saved template pack ${pack.id}: ${pack.name}@${pack.version}`
    );

    return pack;
  }

  /**
   * Discard the session
   */
  @Delete('session/:sessionId')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Discard studio session',
    description: 'Discards the session and its draft pack.',
  })
  @ApiOkResponse({
    description: 'Session discarded',
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  async discardSession(
    @Param('sessionId') sessionId: string,
    @Req() req: any
  ): Promise<{ success: boolean }> {
    const { userId } = this.extractContext(req);

    return this.studioService.discardSession(sessionId, userId);
  }

  /**
   * Get messages for a session
   */
  @Get('session/:sessionId/messages')
  @Scopes('templates:read')
  @ApiOperation({
    summary: 'Get session messages',
    description: 'Returns all messages in the studio session.',
  })
  @ApiOkResponse({
    description: 'List of messages',
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Req() req: any
  ): Promise<any[]> {
    const { userId } = this.extractContext(req);

    // Verify session access
    const session = await this.studioService.getSession(sessionId, userId);
    if (!session) {
      throw new NotFoundException('Session not found or unauthorized');
    }

    return this.studioService.getMessages(sessionId);
  }

  /**
   * Clean up empty draft template packs
   * Admin endpoint to remove orphaned drafts
   */
  @Delete('cleanup/empty-drafts')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Clean up empty draft packs',
    description:
      'Removes draft template packs that have no messages (orphaned drafts).',
  })
  @ApiOkResponse({
    description: 'Cleanup result',
    schema: {
      type: 'object',
      properties: {
        cleaned: { type: 'number', description: 'Number of drafts cleaned' },
      },
    },
  })
  async cleanupEmptyDrafts(): Promise<{ cleaned: number }> {
    const cleaned = await this.studioService.cleanupEmptyDrafts();

    this.logger.log(`Cleaned up ${cleaned} empty draft template packs`);

    return { cleaned };
  }
}
