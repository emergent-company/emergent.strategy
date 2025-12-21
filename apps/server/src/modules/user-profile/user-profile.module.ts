import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { UserProfileService } from './user-profile.service';
import { UserProfileController } from './user-profile.controller';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';

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
  ],
  controllers: [UserProfileController],
  providers: [UserProfileService],
  exports: [UserProfileService],
})
export class UserProfileModule {}
