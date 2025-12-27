import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Superadmin } from '../../entities/superadmin.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { Org } from '../../entities/org.entity';
import { Project } from '../../entities/project.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { EmailJob } from '../../entities/email-job.entity';
import { EmailTemplate } from '../../entities/email-template.entity';
import { EmailTemplateVersion } from '../../entities/email-template-version.entity';
import { SuperadminService } from './superadmin.service';
import { SuperadminGuard } from './superadmin.guard';
import { SuperadminController } from './superadmin.controller';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { ChatUiModule } from '../chat-ui/chat-ui.module';
import { LangfuseModule } from '../langfuse/langfuse.module';
import { AppConfigModule } from '../../common/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Superadmin,
      UserProfile,
      Org,
      Project,
      OrganizationMembership,
      EmailJob,
      EmailTemplate,
      EmailTemplateVersion,
    ]),
    EmailModule,
    AuthModule,
    ChatUiModule,
    LangfuseModule,
    AppConfigModule,
  ],
  controllers: [SuperadminController, EmailTemplatesController],
  providers: [SuperadminService, SuperadminGuard],
  exports: [SuperadminService, SuperadminGuard],
})
export class SuperadminModule {}
