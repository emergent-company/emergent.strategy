import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { UserEmailPreferencesService } from './user-email-preferences.service';
import {
  ApiOkResponse,
  ApiTags,
  ApiOperation,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import {
  UnsubscribeResultDto,
  UnsubscribeInfoDto,
} from './dto/email-preferences.dto';

class UnsubscribeBodyDto {
  emailType?: 'release' | 'marketing' | 'all';
}

@ApiTags('Unsubscribe')
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly prefsService: UserEmailPreferencesService) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Get unsubscribe info for token',
    description:
      'Public endpoint to get masked email and current preferences for unsubscribe page',
  })
  @ApiOkResponse({ type: UnsubscribeInfoDto })
  @ApiNotFoundResponse({ description: 'Invalid or expired token' })
  async getUnsubscribeInfo(
    @Param('token') token: string
  ): Promise<UnsubscribeInfoDto> {
    const info = await this.prefsService.getUnsubscribeInfo(token);
    if (!info) {
      throw new NotFoundException('Invalid or expired unsubscribe link');
    }
    return info;
  }

  @Post(':token')
  @ApiOperation({
    summary: 'Unsubscribe from emails',
    description: 'Public endpoint to unsubscribe from emails using token',
  })
  @ApiOkResponse({ type: UnsubscribeResultDto })
  async unsubscribe(
    @Param('token') token: string,
    @Body() body: UnsubscribeBodyDto
  ): Promise<UnsubscribeResultDto> {
    return this.prefsService.unsubscribeByToken(token, body.emailType || 'all');
  }
}
