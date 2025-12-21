import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { UserSearchResponseDto } from './dto/user-search.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(AuthGuard, ScopesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Search for users by email address
   * Used for inviting users to projects - returns matching users
   */
  @Get('search')
  @Scopes('org:read')
  @ApiOperation({
    summary: 'Search users by email',
    description:
      'Search for existing users by email address for invitation purposes. Returns up to 10 matches.',
  })
  @ApiQuery({
    name: 'email',
    required: true,
    description:
      'Email address to search for (partial match, min 2 characters)',
  })
  @ApiOkResponse({
    description: 'List of matching users',
    type: UserSearchResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid search query',
  })
  async searchByEmail(
    @Query('email') email: string,
    @Req() req: any
  ): Promise<UserSearchResponseDto> {
    if (!email || email.trim().length < 2) {
      throw new BadRequestException({
        error: {
          code: 'validation-failed',
          message: 'Email query must be at least 2 characters',
        },
      });
    }

    const users = await this.usersService.searchByEmail(email, req.user?.id);

    return { users };
  }
}
