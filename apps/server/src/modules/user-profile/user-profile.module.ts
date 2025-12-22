import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { UserProfileService } from './user-profile.service';
import { UserProfileController } from './user-profile.controller';
import { UserProfileSyncAdminController } from './user-profile-sync-admin.controller';
import { UserProfileSyncWorkerService } from './user-profile-sync-worker.service';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserProfile,
      UserEmail,
      Org,
      Project,
      OrganizationMembership,
      ProjectMembership,
    ]),
    forwardRef(() => AuthModule),
    EmailModule,
    DatabaseModule,
  ],
  controllers: [UserProfileController, UserProfileSyncAdminController],
  providers: [UserProfileService, UserProfileSyncWorkerService],
  exports: [UserProfileService, UserProfileSyncWorkerService],
})
export class UserProfileModule {}
