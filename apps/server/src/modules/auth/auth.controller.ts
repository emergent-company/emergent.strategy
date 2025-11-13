import { Controller, Get, UseGuards, Req } from '@nestjs/common';
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

import { AuthGuard } from './auth.guard';
import { ScopesGuard } from './scopes.guard';
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard, ScopesGuard)
  @ApiBearerAuth()
  // Basic self info requires minimal visibility scope
  @Scopes('org:read')
  @ApiOkResponse({
    description: 'Return current authenticated user (mock)',
    schema: { example: { sub: 'mock-user-id', email: 'demo@example.com' } },
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
  me(): { sub: string; email?: string } {
    return { sub: 'mock-user-id', email: 'demo@example.com' };
  }

  @Get('test-passport')
  @UseGuards(PassportAuthGuard('zitadel'))
  @ApiBearerAuth()
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
