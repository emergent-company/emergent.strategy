import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { UserActivityService } from './user-activity.service';
import {
  RecordActivityDto,
  RecentItemsResponseDto,
  RecentItemDto,
} from './dto/record-activity.dto';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';

@ApiTags('User Activity')
@Controller('user-activity')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class UserActivityController {
  constructor(private readonly userActivityService: UserActivityService) {}

  @Post('record')
  @ApiOperation({
    summary: 'Record user activity (view or edit of a resource)',
    description:
      'Records that the current user accessed a document or object. Uses upsert to update existing records.',
  })
  @ApiOkResponse({ description: 'Activity recorded successfully' })
  @ApiStandardErrors()
  @Scopes('user-activity:write')
  @HttpCode(HttpStatus.OK)
  async recordActivity(@Req() req: any, @Body() body: RecordActivityDto) {
    const userId = req.user?.id;
    const projectId = req.headers['x-project-id'] as string | undefined;

    // Fire-and-forget: don't await, just let it run in background
    // This ensures the main request is not blocked
    this.userActivityService
      .recordActivity(userId, projectId, body)
      .catch(() => {
        // Error is already logged in the service
      });

    return { success: true };
  }

  @Get('recent')
  @ApiOperation({
    summary: 'Get recent items for the current user',
    description:
      'Returns recently accessed objects and documents for the current user in the current project.',
  })
  @ApiOkResponse({
    description: 'Recent items retrieved successfully',
    type: RecentItemsResponseDto,
  })
  @ApiStandardErrors()
  @Scopes('user-activity:read')
  async getRecentItems(@Req() req: any) {
    const userId = req.user?.id;
    const projectId = req.headers['x-project-id'] as string | undefined;

    const data = await this.userActivityService.getRecentItems(
      userId,
      projectId
    );

    return { success: true, data };
  }

  @Get('recent/:type')
  @ApiOperation({
    summary: 'Get recent items by type',
    description:
      'Returns recently accessed items of a specific type (documents or objects).',
  })
  @ApiParam({
    name: 'type',
    enum: ['document', 'object'],
    description: 'Type of resource to retrieve',
  })
  @ApiOkResponse({
    description: 'Recent items retrieved successfully',
    type: [RecentItemDto],
  })
  @ApiStandardErrors()
  @Scopes('user-activity:read')
  async getRecentItemsByType(
    @Req() req: any,
    @Param('type') type: 'document' | 'object'
  ) {
    const userId = req.user?.id;
    const projectId = req.headers['x-project-id'] as string | undefined;

    const data = await this.userActivityService.getRecentItemsByType(
      userId,
      projectId,
      type
    );

    return { success: true, data };
  }

  @Delete('recent/:type/:resourceId')
  @ApiOperation({
    summary: 'Remove a specific item from recent items',
    description:
      'Removes a specific document or object from the recent items list.',
  })
  @ApiParam({
    name: 'type',
    enum: ['document', 'object'],
    description: 'Type of resource',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'UUID of the resource to remove',
  })
  @ApiNoContentResponse({ description: 'Item removed successfully' })
  @ApiStandardErrors()
  @Scopes('user-activity:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRecentItem(
    @Req() req: any,
    @Param('type') type: 'document' | 'object',
    @Param('resourceId', ParseUUIDPipe) resourceId: string
  ) {
    const userId = req.user?.id;
    const projectId = req.headers['x-project-id'] as string | undefined;

    await this.userActivityService.removeRecentItem(
      userId,
      projectId,
      type,
      resourceId
    );
  }

  @Delete('recent')
  @ApiOperation({
    summary: 'Clear all recent items',
    description:
      'Removes all recent items for the current user in the current project.',
  })
  @ApiNoContentResponse({ description: 'All items cleared successfully' })
  @ApiStandardErrors()
  @Scopes('user-activity:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearAllRecentItems(@Req() req: any) {
    const userId = req.user?.id;
    const projectId = req.headers['x-project-id'] as string | undefined;

    await this.userActivityService.clearAllRecentItems(userId, projectId);
  }
}
