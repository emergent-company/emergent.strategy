import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../common/database/database.module';
import { Invite } from '../../entities/invite.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invite,
      UserProfile,
      ProjectMembership,
      OrganizationMembership,
    ]),
    AuthModule,
    DatabaseModule,
  ],
  providers: [InvitesService],
  controllers: [InvitesController],
  exports: [InvitesService],
})
export class InvitesModule {}
