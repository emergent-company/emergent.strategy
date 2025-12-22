import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseNotification } from './entities/release-notification.entity';
import { ReleaseNotificationRecipient } from './entities/release-notification-recipient.entity';
import { ReleaseNotificationState } from './entities/release-notification-state.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { LlmModule } from '../llm/llm.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppConfigModule } from '../../common/config/config.module';
import { AuthModule } from '../auth/auth.module';
import { UserEmailPreferencesModule } from '../user-email-preferences/user-email-preferences.module';
import { ReleaseChangelogService } from './services/release-changelog.service';
import { ReleaseNotificationsService } from './services/release-notifications.service';
import { ReleaseStatusService } from './services/release-status.service';
import { ReleasesController } from './releases.controller';

/**
 * Releases Module
 *
 * Provides release notification functionality:
 * - Git changelog generation via LLM
 * - Email notifications via Mailgun
 * - In-app notifications
 * - Delivery status tracking
 * - Public API for viewing releases
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Release entities
      ReleaseNotification,
      ReleaseNotificationRecipient,
      ReleaseNotificationState,
      // User entities needed for targeting
      UserProfile,
      UserEmail,
      ProjectMembership,
    ]),
    LlmModule,
    EmailModule,
    NotificationsModule,
    AppConfigModule,
    AuthModule,
    UserEmailPreferencesModule,
  ],
  controllers: [ReleasesController],
  providers: [
    ReleaseChangelogService,
    ReleaseNotificationsService,
    ReleaseStatusService,
  ],
  exports: [
    ReleaseChangelogService,
    ReleaseNotificationsService,
    ReleaseStatusService,
  ],
})
export class ReleasesModule {}
