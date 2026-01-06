import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { TasksService } from './tasks.service';
import { ResolveTaskDto, TaskStatus } from './dto/task.dto';
import {
  MergeChatSendDto,
  MergeChatApplyDto,
  MergeChatRejectDto,
} from './dto/merge-chat.dto';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { RequireUserId } from '../../common/decorators/project-context.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MergeSuggestionService } from './merge-suggestion.service';
import { MergeChatService } from './merge-chat.service';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly notificationsService: NotificationsService,
    private readonly mergeSuggestionService: MergeSuggestionService,
    private readonly mergeChatService: MergeChatService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get tasks for a project' })
  @ApiOkResponse({ description: 'List of tasks' })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Project ID to get tasks for',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskStatus,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by type (e.g., "merge_suggestion")',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 50)',
  })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getTasks(
    @Query('project_id', ParseUUIDPipe) projectId: string,
    @Query('status') status?: TaskStatus,
    @Query('type') type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number
  ) {
    const result = await this.tasksService.getForProject(projectId, {
      status,
      type,
      page,
      limit,
    });

    return {
      success: true,
      data: result.tasks,
      meta: {
        total: result.total,
        page,
        limit,
      },
    };
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get task counts by status for a project' })
  @ApiOkResponse({ description: 'Task counts' })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Project ID',
  })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getCounts(@Query('project_id', ParseUUIDPipe) projectId: string) {
    const counts = await this.tasksService.getCounts(projectId);
    return { success: true, data: counts };
  }

  @Get('all')
  @ApiOperation({
    summary: 'Get tasks across all projects the user has access to',
    description:
      'Returns tasks from all projects the authenticated user can access, with project name included for each task.',
  })
  @ApiOkResponse({
    description: 'List of tasks across all accessible projects',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskStatus,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by type (e.g., "merge_suggestion")',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 50)',
  })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getAllTasks(
    @RequireUserId() userId: string,
    @Query('status') status?: TaskStatus,
    @Query('type') type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number
  ) {
    const result = await this.tasksService.getAllForUser(userId, {
      status,
      type,
      page,
      limit,
    });

    return {
      success: true,
      data: result.tasks,
      meta: {
        total: result.total,
        page,
        limit,
      },
    };
  }

  @Get('all/counts')
  @ApiOperation({
    summary: 'Get task counts by status across all accessible projects',
    description:
      'Returns aggregated task counts from all projects the authenticated user can access.',
  })
  @ApiOkResponse({ description: 'Aggregated task counts' })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getAllCounts(@RequireUserId() userId: string) {
    const counts = await this.tasksService.getAllCounts(userId);
    return { success: true, data: counts };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task by ID' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Task details' })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getTask(@Param('id', ParseUUIDPipe) id: string) {
    const task = await this.tasksService.findOne(id);
    return { success: true, data: task };
  }

  @Get(':id/merge-suggestion')
  @ApiOperation({
    summary: 'Get LLM-powered merge suggestion for a merge_suggestion task',
    description:
      'Generates an AI-powered suggestion for how to merge two similar objects. Only applicable to tasks of type "merge_suggestion".',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({
    description: 'Merge suggestion with property-level recommendations',
  })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getMergeSuggestion(@Param('id', ParseUUIDPipe) id: string) {
    // Get the task to extract source/target IDs
    const task = await this.tasksService.findOne(id);

    if (task.type !== 'merge_suggestion') {
      return {
        success: false,
        error: 'This endpoint is only available for merge_suggestion tasks',
      };
    }

    const metadata = task.metadata as {
      sourceId?: string;
      targetId?: string;
      similarityPercent?: number;
    };

    if (!metadata?.sourceId || !metadata?.targetId) {
      return {
        success: false,
        error: 'Task metadata is missing required sourceId or targetId',
      };
    }

    try {
      const suggestion =
        await this.mergeSuggestionService.generateMergeSuggestion(
          metadata.sourceId,
          metadata.targetId,
          metadata.similarityPercent || 0
        );

      return {
        success: true,
        data: suggestion,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate merge suggestion',
      };
    }
  }

  @Post(':id/resolve')
  @ApiOperation({
    summary: 'Resolve a task (accept or reject)',
    description:
      'Resolves a pending task and marks any linked notifications as read. For merge_suggestion tasks that are accepted, this also executes the merge operation.',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Task resolved' })
  @ApiStandardErrors()
  @Scopes('tasks:write')
  async resolve(
    @RequireUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveTaskDto
  ) {
    // Resolve the task (and execute merge if applicable)
    const result = await this.tasksService.resolve(
      id,
      userId,
      body.status,
      body.notes
    );

    // Mark any notifications linked to this task as read for the current user
    await this.notificationsService.markReadByTaskId(id, userId);

    return {
      success: result.mergeResult ? result.mergeResult.success : true,
      data: result.task,
      merge: result.mergeResult,
      error: result.mergeResult?.error,
    };
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a task',
    description: 'Cancels a pending task. Only applicable to pending tasks.',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Task cancelled' })
  @ApiStandardErrors()
  @Scopes('tasks:write')
  async cancel(
    @RequireUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string }
  ) {
    const task = await this.tasksService.cancel(id, userId, body.reason);
    return { success: true, data: task };
  }

  // =========================================================================
  // MERGE CHAT ENDPOINTS
  // =========================================================================

  @Get(':id/merge-chat')
  @ApiOperation({
    summary: 'Get or create merge chat conversation for a task',
    description:
      'Loads an existing merge chat conversation or creates a new one for a merge_suggestion task.',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Merge chat conversation with messages' })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getMergeChat(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-project-id') projectId: string
  ) {
    const userId = req.user?.id || null;
    const result = await this.mergeChatService.loadOrCreateConversation(
      id,
      userId,
      projectId
    );
    return result;
  }

  @Post(':id/merge-chat')
  @ApiOperation({
    summary: 'Send a message to the merge chat',
    description:
      'Sends a user message and streams the AI response for merge assistance.',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({
    description: 'Server-sent events stream with AI response',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          description: 'Server-sent events stream',
        },
      },
    },
  })
  @ApiStandardErrors()
  @Scopes('tasks:write')
  async sendMergeChatMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MergeChatSendDto,
    @Headers('x-project-id') projectId: string,
    @Req() req: any,
    @Res() res: ExpressResponse
  ): Promise<void> {
    const userId = req.user?.id || null;

    // First get or create the conversation
    const { conversation } =
      await this.mergeChatService.loadOrCreateConversation(
        id,
        userId,
        projectId
      );

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(HttpStatus.OK);

    // Stream the response
    await this.mergeChatService.streamChatResponse(
      id,
      conversation.id,
      body.content,
      body.sourceObjectId,
      body.targetObjectId,
      res
    );
  }

  @Get(':id/merge-chat/messages')
  @ApiOperation({
    summary: 'Get messages for a merge chat conversation',
    description: 'Returns messages for the merge chat (used for polling).',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Array of messages' })
  @ApiStandardErrors()
  @Scopes('tasks:read')
  async getMergeChatMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-project-id') projectId: string,
    @Req() req: any
  ) {
    const userId = req.user?.id || null;
    const { conversation, messages } =
      await this.mergeChatService.loadOrCreateConversation(
        id,
        userId,
        projectId
      );
    return messages;
  }

  @Post(':id/merge-chat/apply')
  @ApiOperation({
    summary: 'Apply a merge suggestion',
    description:
      'Accepts a merge suggestion, marking it as applied and updating the merge preview.',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Result of applying the suggestion' })
  @ApiStandardErrors()
  @Scopes('tasks:write')
  async applyMergeSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MergeChatApplyDto
  ) {
    const result = await this.mergeChatService.applySuggestion(
      id,
      body.messageId,
      body.suggestionIndex
    );
    return result;
  }

  @Post(':id/merge-chat/reject')
  @ApiOperation({
    summary: 'Reject a merge suggestion',
    description: 'Rejects a merge suggestion with an optional reason.',
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiOkResponse({ description: 'Result of rejecting the suggestion' })
  @ApiStandardErrors()
  @Scopes('tasks:write')
  async rejectMergeSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MergeChatRejectDto
  ) {
    const result = await this.mergeChatService.rejectSuggestion(
      id,
      body.messageId,
      body.suggestionIndex,
      body.reason
    );
    return result;
  }
}
