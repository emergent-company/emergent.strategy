import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  RequireUserId,
} from '../../common/decorators/project-context.decorator';
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
  UpdatePackNameDto,
} from './template-pack-studio.service';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { LangfuseService } from '../langfuse/langfuse.service';
import { TEMPLATE_STUDIO_PROMPT_NAMES } from '../langfuse/prompts/types';
import { isAIMessage } from '@langchain/core/messages';
import { isToolMessage } from '@langchain/core/messages';
import { createIconSearchTool } from './tools/icon-search.tool';
import { createQueryRefinementTool } from './tools/query-refinement.tool';

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

class UpdatePackNameRequestDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
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

## CRITICAL: Use refine_request Tool for Complex Requests
For complex, ambiguous, or multi-part requests, use the **refine_request** tool FIRST, then EXECUTE based on its output.

**When to use refine_request:**
- User requests multiple types/entities (e.g., "I need to track projects, tasks, and team members")
- Request is ambiguous or could be interpreted multiple ways
- User describes a domain/scenario without specifying exact types
- You need to think through the relationships between entities

**When you can skip refine_request:**
- Simple, single-type requests (e.g., "Add a phone field to Person")
- Clear, specific modifications (e.g., "Change the icon for Task to check-square")
- Follow-up questions or clarifications

**IMPORTANT: The refine_request tool returns a REFINED INSTRUCTION. You MUST then generate schema suggestions based on that instruction.**

**Example workflow:**
1. User: "I want to model a project management system"
2. You: Call refine_request({ userMessage: "I want to model a project management system", packContext: "Empty pack" })
3. Tool returns refined instruction: "Create Project type with name, description, status properties... Create Task type with... Create ASSIGNED_TO relationship..."
4. You: Generate add_object_type and add_relationship_type suggestions based on the refined instruction (NOT the original user message)
5. You: Explain to the user what you're suggesting and why

**DO NOT just acknowledge the refined instruction. You MUST generate actual schema suggestions based on it.**

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

## Icon Usage (IMPORTANT)
When suggesting UI configurations with icons, you MUST use the search_icons tool to find valid Lucide icon names.

**Workflow for icons:**
1. Before creating an update_ui_config suggestion, call search_icons with a relevant term
2. Use only icons that are returned by the tool
3. If you're unsure about an icon name, use validate mode: search_icons({ query: "icon-name", validate: true })

**Common icons you can use without searching:**
- People: user, users, user-circle, contact, id-card
- Documents: file, file-text, folder, clipboard
- Communication: mail, message-square, phone, bell
- Business: briefcase, building, building-2, landmark, credit-card, dollar-sign, package
- Time: calendar, calendar-days, clock, timer, history
- Data: chart-bar, chart-line, chart-pie, trending-up, activity
- Objects: box, gift, key, lock, tag, bookmark, star, heart, flag
- Technology: laptop, smartphone, server, database, globe, link, code
- Navigation: home, settings, search, menu, plus, check, x, arrow-right, arrow-left
- Status: info, alert-circle, alert-triangle, help-circle, check-circle, x-circle

Icon names use lowercase with hyphens (e.g., "user-circle", "calendar-days").

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
      "required": ["name"],
      "ui_config": { "icon": "user", "color": "#3B82F6" }
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
      "source_types": ["Person"],
      "target_types": ["Organization"],
      "properties": {
        "role": { "type": "string", "description": "Job title or role", "examples": ["Software Engineer", "Product Manager", "CEO"] },
        "startDate": { "type": "string", "format": "date", "examples": ["2024-01-15", "2023-06-01"] }
      },
      "ui_config": { "icon": "arrow-right", "color": "#6B7280" }
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

## IMPORTANT: Include ui_config in add_object_type and add_relationship_type
When creating new object types or relationship types, ALWAYS include the \`ui_config\` object inside the \`after\` field. Do NOT create separate \`update_ui_config\` suggestions for new types.

**Correct (include ui_config in after):**
\`\`\`json
{
  "type": "add_object_type",
  "target_type": "Task",
  "description": "A work item to be completed",
  "after": {
    "type": "object",
    "properties": { "title": { "type": "string" } },
    "ui_config": { "icon": "check-square", "color": "#10B981" }
  }
}
\`\`\`

**Incorrect (separate ui_config suggestion - DO NOT do this):**
\`\`\`json
// First suggestion
{ "type": "add_object_type", "target_type": "Task", "after": { ... } }
// Second suggestion - WRONG!
{ "type": "update_ui_config", "target_type": "Task", "after": { "icon": "check-square", "color": "#10B981" } }
\`\`\`

Use \`update_ui_config\` ONLY when modifying the icon/color of an EXISTING type that was created earlier in the conversation or already exists in the pack.

## IMPORTANT: Include source_types and target_types in relationship types
When creating relationship types, ALWAYS include \`source_types\` and \`target_types\` arrays in the \`after\` field. These specify which object types the relationship connects.

**Correct (include source_types and target_types):**
\`\`\`json
{
  "type": "add_relationship_type",
  "target_type": "ATTENDS",
  "description": "Links attendees to meetings",
  "after": {
    "type": "object",
    "source_types": ["Attendee"],
    "target_types": ["Meeting"],
    "properties": { "role": { "type": "string" } },
    "ui_config": { "icon": "arrow-right", "color": "#6B7280" }
  }
}
\`\`\`

**Incorrect (missing source_types/target_types - DO NOT do this):**
\`\`\`json
{
  "type": "add_relationship_type",
  "target_type": "ATTENDS",
  "after": {
    "type": "object",
    "properties": { "role": { "type": "string" } }
  }
}
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
1. For complex requests, use refine_request tool FIRST, then GENERATE SUGGESTIONS based on its output
2. Start by understanding what domain the user wants to model
3. Suggest object types that represent key entities in their domain
4. Suggest relationship types that capture how entities relate
5. Be specific about property types and constraints
6. Explain why each suggestion improves the template pack
7. If the user's request is unclear, ask clarifying questions first
8. ALWAYS use the search_icons tool to validate icon names before suggesting them`;

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
   * Get the system prompt for Template Studio.
   *
   * NOTE: Temporarily bypassing Langfuse to use the updated fallback prompt
   * with the correct 'refine_request' tool name. Once Langfuse prompt is updated,
   * remove the BYPASS_LANGFUSE flag.
   *
   * TODO: Update Langfuse prompt 'template-studio-system' to use 'refine_request'
   * instead of 'analyze_request', then set BYPASS_LANGFUSE to false.
   */
  private async getSystemPrompt(): Promise<{
    prompt: string;
    fromLangfuse: boolean;
    version?: number;
  }> {
    // TEMPORARY: Bypass Langfuse until the prompt is updated with 'refine_request'
    const BYPASS_LANGFUSE = true;

    if (
      !BYPASS_LANGFUSE &&
      this.langfuseService?.isPromptManagementAvailable()
    ) {
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

    this.logger.debug('Using fallback system prompt for Template Studio');
    return {
      prompt: TEMPLATE_STUDIO_SYSTEM_PROMPT_FALLBACK,
      fromLangfuse: false,
    };
  }

  /**
   * Create a new studio session
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
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
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<StudioSessionState> {
    const { projectId } = ctx;

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
  @HttpCode(HttpStatus.CREATED)
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
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<StudioSessionState> {
    const { projectId } = ctx;

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
    @RequireUserId() userId: string
  ): Promise<StudioSessionState> {
    const session = await this.studioService.getSession(sessionId, userId);

    if (!session) {
      throw new NotFoundException('Session not found or unauthorized');
    }

    return session;
  }

  /**
   * Update pack name for a session
   */
  @Patch('session/:sessionId/name')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Update pack name',
    description: 'Updates the name of the draft pack in a studio session.',
  })
  @ApiOkResponse({
    description: 'Pack name updated',
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async updatePackName(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdatePackNameRequestDto,
    @RequireUserId() userId: string
  ): Promise<{ success: boolean; pack?: any; error?: string }> {
    const result = await this.studioService.updatePackName(
      sessionId,
      userId,
      dto.name
    );

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return result;
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
  @HttpCode(HttpStatus.OK)
  async getUserSessions(
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<StudioSessionState[]> {
    const { projectId } = ctx;

    return this.studioService.getUserSessions(userId, projectId);
  }

  /**
   * Delete all empty schema drafts for the current user
   */
  @Delete('sessions/empty')
  @Scopes('templates:write')
  @ApiOperation({
    summary: 'Delete empty draft templates',
    description:
      'Deletes all draft templates that have zero object types and zero relationship types.',
  })
  @ApiOkResponse({
    description: 'Number of deleted drafts',
    schema: {
      type: 'object',
      properties: {
        deleted: { type: 'number' },
        sessionIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async deleteEmptyDrafts(
    @RequireProjectId() ctx: ProjectContext,
    @RequireUserId() userId: string
  ): Promise<{ deleted: number; sessionIds: string[] }> {
    const { projectId } = ctx;

    return this.studioService.deleteEmptySchemaDrafts(userId, projectId);
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
    // Manual userId extraction required for SSE endpoints with @Res()
    // Parameter decorators that throw don't work with @Res() (exception filters bypassed)
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatus.FORBIDDEN).json({
        error: { code: 'forbidden', message: 'User not authenticated' },
      });
      return;
    }

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
              tools: [createQueryRefinementTool(), createIconSearchTool()],
              systemMessage: systemPrompt,
            });

          // Track emitted tool calls to avoid duplicates
          const emittedToolCalls = new Set<string>();

          // Process the stream
          for await (const chunk of langGraphStream) {
            if (chunk.messages && Array.isArray(chunk.messages)) {
              const lastMessage = chunk.messages[chunk.messages.length - 1];

              // Detect tool calls from AI messages
              if (
                isAIMessage(lastMessage) &&
                lastMessage.additional_kwargs?.tool_calls
              ) {
                for (const tc of lastMessage.additional_kwargs
                  .tool_calls as any[]) {
                  const toolCallId = tc.id || tc.function?.name;
                  if (tc.function?.name && !emittedToolCalls.has(toolCallId)) {
                    emittedToolCalls.add(toolCallId);
                    // Parse arguments if they're a string
                    let args = tc.function.arguments;
                    if (typeof args === 'string') {
                      try {
                        args = JSON.parse(args);
                      } catch {
                        // Keep as string if parsing fails
                      }
                    }
                    // Emit tool_call event (AI requesting tool use)
                    res.write(
                      `data: ${JSON.stringify({
                        type: 'tool_call',
                        toolCallId,
                        tool: tc.function.name,
                        args,
                      })}\n\n`
                    );
                  }
                }
              }

              // Detect tool results
              if (isToolMessage(lastMessage)) {
                const toolCallId = lastMessage.tool_call_id;
                // Parse the result if it's JSON
                let result = lastMessage.content;
                if (typeof result === 'string') {
                  try {
                    result = JSON.parse(result);
                  } catch {
                    // Keep as string if parsing fails
                  }
                }
                // Emit tool_result event
                res.write(
                  `data: ${JSON.stringify({
                    type: 'tool_result',
                    toolCallId,
                    tool: lastMessage.name,
                    result,
                  })}\n\n`
                );
              }

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
    @RequireUserId() userId: string
  ): Promise<{ success: boolean; error?: string; pack?: any }> {
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
    @RequireUserId() userId: string
  ): Promise<{ success: boolean; error?: string }> {
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
    @RequireUserId() userId: string
  ): Promise<any> {
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
    @RequireUserId() userId: string
  ): Promise<{ success: boolean }> {
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
    @RequireUserId() userId: string
  ): Promise<any[]> {
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
