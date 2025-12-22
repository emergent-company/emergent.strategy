import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { RequireUserId } from '../../common/decorators/project-context.decorator';
import {
  ApiTags,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import {
  CreateInviteDto,
  CreateInviteWithUserDto,
  AcceptInviteDto,
  PendingInviteDto,
} from './dto/invite.dto';

@ApiTags('Invites')
@Controller('invites')
@UseGuards(AuthGuard, ScopesGuard)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /**
   * Create invitation and Zitadel user in single operation
   * Only org/project admins can invite users
   */
  @Post('with-user')
  @Scopes('org:invite:create', 'project:invite:create')
  @ApiStandardErrors()
  async createWithUser(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateInviteWithUserDto,
    @Req() req: any
  ) {
    return this.invites.createWithUser({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      organizationId: dto.organizationId,
      projectId: dto.projectId,
      role: dto.role,
      invitedByUserId: req.user?.id, // Internal UUID from AuthUser
    });
  }

  @Post()
  @Scopes('org:invite:create', 'project:invite:create')
  @ApiStandardErrors()
  async create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateInviteDto,
    @Req() req: any
  ) {
    return this.invites.create(
      dto.orgId,
      dto.role,
      dto.email,
      dto.projectId,
      req.user?.id // Pass the inviter's user ID
    );
  }

  @Post('accept')
  @Scopes('org:read')
  @ApiOkResponse({
    description: 'Invitation accepted',
    schema: { example: { status: 'accepted' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid state or token',
    schema: {
      example: {
        error: { code: 'invalid-state', message: 'Invite not pending' },
      },
    },
  })
  @ApiStandardErrors()
  async accept(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: AcceptInviteDto,
    @RequireUserId() userId: string
  ) {
    return this.invites.accept(dto.token, userId);
  }

  /**
   * List pending invitations for the current user
   */
  @Get('pending')
  @Scopes('org:read')
  @ApiOkResponse({
    description: 'List of pending invitations for the current user',
    type: PendingInviteDto,
    isArray: true,
  })
  @ApiStandardErrors()
  async listPending(
    @RequireUserId() userId: string
  ): Promise<PendingInviteDto[]> {
    return this.invites.listPendingForUser(userId);
  }

  /**
   * Decline an invitation
   */
  @Post(':id/decline')
  @Scopes('org:read')
  @ApiOkResponse({
    description: 'Invitation declined',
    schema: { example: { status: 'declined' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid state',
    schema: {
      example: {
        error: {
          code: 'invalid-state',
          message: 'Invitation is already accepted',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Not your invitation',
    schema: {
      example: {
        error: { code: 'forbidden', message: 'This invitation is not for you' },
      },
    },
  })
  @ApiStandardErrors()
  async decline(
    @Param('id', new ParseUUIDPipe({ version: '4' })) inviteId: string,
    @RequireUserId() userId: string
  ) {
    return this.invites.decline(inviteId, userId);
  }

  /**
   * Cancel/revoke a pending invitation (admin only)
   */
  @Delete(':id')
  @Scopes('project:admin')
  @ApiOkResponse({
    description: 'Invitation cancelled',
    schema: { example: { status: 'revoked' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid state',
    schema: {
      example: {
        error: {
          code: 'invalid-state',
          message: 'Cannot cancel invitation with status: accepted',
        },
      },
    },
  })
  @ApiStandardErrors()
  async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) inviteId: string,
    @RequireUserId() userId: string
  ) {
    // First verify the invite exists and get project info for authorization
    const invite = await this.invites.getById(inviteId);
    if (!invite) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Invitation not found' },
      });
    }
    // TODO: Additional authorization could check if user is admin of the project
    return this.invites.cancel(inviteId, userId);
  }
}
