import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../../common/config/config.module';
import { EmailJob } from '../../entities/email-job.entity';
import { EmailLog } from '../../entities/email-log.entity';
import { EmailConfig } from './email.config';
import { MailgunProvider } from './mailgun.provider';
import { EmailTemplateService } from './email-template.service';
import { EmailJobsService } from './email-jobs.service';
import { EmailWorkerService } from './email-worker.service';
import { EmailStatusSyncService } from './email-status-sync.service';
import { EmailService } from './email.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailJob, EmailLog]), AppConfigModule],
  providers: [
    EmailConfig,
    MailgunProvider,
    EmailTemplateService,
    EmailJobsService,
    EmailWorkerService,
    EmailStatusSyncService,
    EmailService,
  ],
  exports: [EmailService, EmailTemplateService, MailgunProvider, EmailConfig],
})
export class EmailModule {}
