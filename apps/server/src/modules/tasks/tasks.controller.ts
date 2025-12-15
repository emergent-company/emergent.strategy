import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { TasksService } from './tasks.service';
import { ResolveTaskDto, TaskStatus } from './dto/task.dto';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { NotificationsService } from '../notifications/notifications.service';
import { MergeSuggestionService } from './merge-suggestion.service';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly notificationsService: NotificationsService,
    private readonly mergeSuggestionService: MergeSuggestionService
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
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveTaskDto
  ) {
    const userId = req.user?.id;

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
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string }
  ) {
    const userId = req.user?.id;
    const task = await this.tasksService.cancel(id, userId, body.reason);
    return { success: true, data: task };
  }
}
