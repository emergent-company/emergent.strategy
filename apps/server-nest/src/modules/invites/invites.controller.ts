import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
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

class AcceptInviteDto {
    @IsString()
    token!: string;
}

@Controller('invites')
@UseGuards(AuthGuard, ScopesGuard)
export class InvitesController {
    constructor(private readonly invites: InvitesService) { }

    @Post()
    @Scopes('org:invite:create', 'project:invite:create')
    async create(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateInviteDto) {
        return this.invites.create(dto.orgId, dto.role, dto.email, dto.projectId);
    }

    @Post('accept')
    @Scopes('org:read')
    async accept(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: AcceptInviteDto, @Req() req: any) {
        return this.invites.accept(dto.token, req.user?.sub);
    }
}
