import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Delete,
  ParseUUIDPipe,
  ParseBoolPipe,
  DefaultValuePipe,
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
import { NotificationsService } from './notifications.service';
import { SnoozeNotificationDto } from './dto/create-notification.dto';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiOkResponse({ description: 'List of notifications' })
  @ApiQuery({
    name: 'tab',
    required: false,
    enum: ['important', 'other', 'snoozed', 'cleared'],
    description: 'Filter by tab',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category (e.g., "import", "extraction")',
  })
  @ApiQuery({
    name: 'unread_only',
    required: false,
    type: Boolean,
    description: 'Show only unread notifications',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search in title and message',
  })
  @ApiStandardErrors()
  @Scopes('notifications:read')
  async getNotifications(
    @Req() req: any,
    @Query('tab', new DefaultValuePipe('important'))
    tab: 'important' | 'other' | 'snoozed' | 'cleared',
    @Query('category') category?: string,
    @Query('unread_only', new DefaultValuePipe(false), ParseBoolPipe)
    unreadOnly?: boolean,
    @Query('search') search?: string
  ) {
    const userId = req.user?.id;
    const notifications = await this.notificationsService.getForUser(
      userId,
      tab,
      {
        category,
        unread_only: unreadOnly,
        search,
      }
    );

    return { success: true, data: notifications };
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get unread notification counts' })
  @ApiOkResponse({ description: 'Notification counts by tab' })
  @ApiStandardErrors()
  @Scopes('notifications:read')
  async getUnreadCounts(@Req() req: any) {
    const userId = req.user?.id;
    const counts = await this.notificationsService.getUnreadCounts(userId);
    return { success: true, data: counts };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get notification statistics (unread, dismissed, total)',
  })
  @ApiOkResponse({ description: 'Notification statistics' })
  @ApiStandardErrors()
  @Scopes('notifications:read')
  async getStats(@Req() req: any) {
    const userId = req.user?.id;
    const stats = await this.notificationsService.getCounts(userId);
    return { success: true, data: stats };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification marked as read' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async markRead(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    await this.notificationsService.markRead(id, userId);
    return { success: true };
  }

  @Post(':id/unread')
  @ApiOperation({ summary: 'Mark notification as unread' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification marked as unread' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async markUnread(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    await this.notificationsService.markUnread(id, userId);
    return { success: true };
  }

  @Post(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification dismissed' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async dismiss(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    await this.notificationsService.dismiss(id, userId);
    return { success: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Clear notification (move to cleared tab)' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification cleared' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async clear(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    await this.notificationsService.clear(id, userId);
    return { success: true };
  }

  @Post(':id/unclear')
  @ApiOperation({ summary: 'Restore notification from cleared tab' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification restored' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async unclear(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    await this.notificationsService.unclear(id, userId);
    return { success: true };
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all notifications in a tab' })
  @ApiQuery({
    name: 'tab',
    required: false,
    enum: ['important', 'other'],
    description: 'Tab to clear',
  })
  @ApiOkResponse({ description: 'All notifications cleared' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async clearAll(
    @Req() req: any,
    @Query('tab', new DefaultValuePipe('important'))
    tab: 'important' | 'other'
  ) {
    const userId = req.user?.id;
    const count = await this.notificationsService.clearAll(userId, tab);
    return { success: true, cleared: count };
  }

  @Post(':id/snooze')
  @ApiOperation({ summary: 'Snooze notification until a specific time' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification snoozed' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async snooze(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SnoozeNotificationDto
  ) {
    const userId = req.user?.id;
    const until = new Date(body.until);
    await this.notificationsService.snooze(id, userId, until);
    return { success: true };
  }

  @Post(':id/unsnooze')
  @ApiOperation({ summary: 'Unsnooze notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification unsnoozed' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async unsnooze(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user?.id;
    await this.notificationsService.unsnooze(id, userId);
    return { success: true };
  }

  @Post(':id/resolve')
  @ApiOperation({
    summary: 'Resolve an actionable notification (accept or reject)',
    description:
      'Used for notifications that require user action (e.g., merge suggestions). Once resolved, the notification no longer counts toward pending limits.',
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Notification resolved' })
  @ApiStandardErrors()
  @Scopes('notifications:write')
  async resolve(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: 'accepted' | 'rejected' }
  ) {
    const userId = req.user?.id;
    await this.notificationsService.resolve(id, userId, body.status);
    return { success: true };
  }
}
