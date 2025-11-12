import { Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('api/auth/password')
export class AuthPasswordController {
  @Post()
  @ApiOkResponse({
    description: 'Initiate password auth (placeholder)',
    schema: { example: { status: 'ok' } },
  })
  start() {
    return { status: 'ok' };
  }

  @Post('login')
  @ApiOkResponse({
    description: 'Password login (placeholder)',
    schema: { example: { token: 'jwt-token' } },
  })
  login() {
    return { token: 'jwt-token' };
  }
}
