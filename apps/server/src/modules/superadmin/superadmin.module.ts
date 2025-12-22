import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Superadmin } from '../../entities/superadmin.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { EmailJob } from '../../entities/email-job.entity';
import { SuperadminService } from './superadmin.service';
import { SuperadminGuard } from './superadmin.guard';
import { SuperadminController } from './superadmin.controller';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Superadmin,
      UserProfile,
      Org,
      Project,
      OrganizationMembership,
      EmailJob,
    ]),
    EmailModule,
    AuthModule,
  ],
  controllers: [SuperadminController],
  providers: [SuperadminService, SuperadminGuard],
  exports: [SuperadminService, SuperadminGuard],
})
export class SuperadminModule {}
