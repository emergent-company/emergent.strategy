import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthModule } from '../auth/auth.module';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { InvitesModule } from '../invites/invites.module';
import { Project } from '../../entities/project.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { Org } from '../../entities/org.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';

// Import AuthModule so AuthGuard / ScopesGuard providers (and AuthService) are resolvable when applied at controller level
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectMembership,
      Org,
      UserProfile,
      UserEmail,
    ]),
    AuthModule,
    TemplatePackModule,
    forwardRef(() => InvitesModule), // Use forwardRef to handle potential circular dependency
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService], // Export so other modules can inject ProjectsService
})
export class ProjectsModule {}
