import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../common/database/database.module';
import { EmailModule } from '../email/email.module';
import { Invite } from '../../entities/invite.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { Project } from '../../entities/project.entity';
import { Org } from '../../entities/org.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invite,
      UserProfile,
      UserEmail,
      ProjectMembership,
      OrganizationMembership,
      Project,
      Org,
    ]),
    AuthModule,
    DatabaseModule,
    EmailModule,
  ],
  providers: [InvitesService],
  controllers: [InvitesController],
  exports: [InvitesService],
})
export class InvitesModule {}
