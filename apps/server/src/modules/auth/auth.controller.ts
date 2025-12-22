import {
  Controller,
  Get,
  UseGuards,
  Req,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import {
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { Scopes } from './scopes.decorator';
import { RequireUserId } from '../../common/decorators/project-context.decorator';

import { AuthGuard } from './auth.guard';
import { ScopesGuard } from './scopes.guard';
import { UserProfileService } from '../user-profile/user-profile.service';
import { UserProfileDto } from '../user-profile/dto/profile.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get('me')
  @UseGuards(AuthGuard, ScopesGuard)
  @ApiBearerAuth()
  // Basic self info requires minimal visibility scope
  @Scopes('org:read')
  @ApiOkResponse({
    description: 'Return current authenticated user',
    type: UserProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid bearer token',
    schema: {
      example: { error: { code: 'unauthorized', message: 'Unauthorized' } },
    },
  })
  @ApiForbiddenResponse({
    description: 'Insufficient scope',
    schema: { example: { error: { code: 'forbidden', message: 'Forbidden' } } },
  })
  @ApiStandardErrors({})
  async me(@RequireUserId() userId: string): Promise<UserProfileDto> {
    const profile = await this.userProfileService.getById(userId);
    if (!profile) {
      throw new InternalServerErrorException('User profile not found');
    }
    return profile;
  }

  @Get('test-passport')
  @UseGuards(PassportAuthGuard('zitadel'))
  @ApiBearerAuth()
  @Scopes('org:read')
  @ApiOkResponse({ description: 'Test passport-zitadel introspection' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiStandardErrors({})
  testPassport(@Req() req: any): any {
    return {
      message: 'Passport authentication successful!',
      user: req.user,
    };
  }
}
