import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse, ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
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
    @Scopes('read:me')
    @ApiOkResponse({ description: 'Return current authenticated user (mock)', schema: { example: { sub: 'mock-user-id', email: 'demo@example.com' } } })
    @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token', schema: { example: { error: { code: 'unauthorized', message: 'Unauthorized' } } } })
    @ApiForbiddenResponse({ description: 'Insufficient scope', schema: { example: { error: { code: 'forbidden', message: 'Forbidden' } } } })
    @ApiStandardErrors({})
    me(): { sub: string; email?: string } {
        return { sub: 'mock-user-id', email: 'demo@example.com' };
    }
}
