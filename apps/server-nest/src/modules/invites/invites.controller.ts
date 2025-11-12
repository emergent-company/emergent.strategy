import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { IsEmail, IsOptional, IsString, IsUUID, IsIn } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';

class CreateInviteDto {
  @IsUUID()
  orgId!: string;
  @IsOptional()
  @IsUUID()
  projectId?: string;
  @IsEmail()
  email!: string;
  @IsString()
  role!: 'org_admin' | 'project_admin' | 'project_user';
}

class CreateInviteWithUserDto {
  @IsEmail()
  email!: string;
  @IsString()
  firstName!: string;
  @IsString()
  lastName!: string;
  @IsOptional()
  @IsUUID()
  organizationId?: string;
  @IsOptional()
  @IsUUID()
  projectId?: string;
  @IsIn(['org_admin', 'project_admin', 'project_user'])
  role!: 'org_admin' | 'project_admin' | 'project_user';
}

class AcceptInviteDto {
  @IsString()
  token!: string;
}

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
  async create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateInviteDto
  ) {
    return this.invites.create(dto.orgId, dto.role, dto.email, dto.projectId);
  }

  @Post('accept')
  @Scopes('org:read')
  async accept(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: AcceptInviteDto,
    @Req() req: any
  ) {
    return this.invites.accept(dto.token, req.user?.sub);
  }
}
