import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { UserEmailPreferencesService } from './user-email-preferences.service';
import { ApiOkResponse, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import {
  EmailPreferencesDto,
  UpdateEmailPreferencesDto,
} from './dto/email-preferences.dto';

@ApiTags('UserProfile')
@Controller('user/email-preferences')
@UseGuards(AuthGuard, ScopesGuard)
export class UserEmailPreferencesController {
  constructor(private readonly prefsService: UserEmailPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get email preferences for current user' })
  @ApiOkResponse({ type: EmailPreferencesDto })
  @ApiStandardErrors()
  async getPreferences(@Req() req: any): Promise<EmailPreferencesDto> {
    const userId: string = req?.user?.id;
    return this.prefsService.getPreferences(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update email preferences for current user' })
  @ApiOkResponse({ type: EmailPreferencesDto })
  @ApiStandardErrors()
  async updatePreferences(
    @Req() req: any,
    @Body() dto: UpdateEmailPreferencesDto
  ): Promise<EmailPreferencesDto> {
    const userId: string = req?.user?.id;
    return this.prefsService.updatePreferences(userId, dto);
  }
}
