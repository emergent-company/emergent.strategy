/**
 * Integration test for invitation email flow with live Mailgun.
 *
 * Prerequisites:
 * - MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_API_URL configured in .env.local
 * - EMAIL_ENABLED=true
 * - Database running with email_jobs table
 *
 * This test:
 * 1. Queues an invitation email via EmailService
 * 2. Processes it with EmailWorkerService
 * 3. Verifies the email was sent via Mailgun (checks for messageId)
 *
 * Run with: nx run server:test-e2e -- --testPathPattern=email-invitation
 * Or set RUN_EMAIL_INTEGRATION=1 to include in full e2e suite
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppConfigModule } from '../../../../src/common/config/config.module';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { DatabaseModule } from '../../../../src/common/database/database.module';
import { EmailModule } from '../../../../src/modules/email/email.module';
import { EmailService } from '../../../../src/modules/email/email.service';
import { EmailJobsService } from '../../../../src/modules/email/email-jobs.service';
import { EmailWorkerService } from '../../../../src/modules/email/email-worker.service';
import { EmailConfig } from '../../../../src/modules/email/email.config';
import { EmailLog } from '../../../../src/entities/email-log.entity';
import { entities } from '../../../../src/entities';

// Skip unless explicitly enabled - requires live Mailgun credentials
const shouldRun =
  process.env.RUN_EMAIL_INTEGRATION === '1' ||
  process.env.RUN_EMAIL_INTEGRATION === 'true';

describe.skipIf(!shouldRun)('EmailService Integration (Live Mailgun)', () => {
  let module: TestingModule;
  let emailService: EmailService;
  let emailJobs: EmailJobsService;
  let emailWorker: EmailWorkerService;
  let emailConfig: EmailConfig;
  let dataSource: DataSource;

  beforeAll(async () => {
    // Set up environment for integration testing
    process.env.DB_AUTOINIT = '1';
    process.env.SKIP_MIGRATIONS = '1';
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_ENABLED = 'true';

    module = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        DatabaseModule,
        // TypeORM root configuration - required for EmailModule's forFeature repositories
        TypeOrmModule.forRootAsync({
          imports: [AppConfigModule],
          useFactory: (configService: AppConfigService) => ({
            type: 'postgres' as const,
            host: configService.dbHost,
            port: configService.dbPort,
            username: configService.dbUser,
            password: configService.dbPassword,
            database: configService.dbName,
            entities,
            synchronize: false,
            logging: ['error'],
          }),
          inject: [AppConfigService],
        }),
        EmailModule,
      ],
    }).compile();

    emailService = module.get(EmailService);
    emailJobs = module.get(EmailJobsService);
    emailWorker = module.get(EmailWorkerService);
    emailConfig = module.get(EmailConfig);
    dataSource = module.get(DataSource);

    // Stop the background worker - we'll invoke processBatch manually
    emailWorker.stop();

    // Verify email is properly configured
    const configErrors = emailConfig.validate();
    if (configErrors.length > 0) {
      throw new Error(
        `Email configuration invalid for integration test: ${configErrors.join(
          '; '
        )}\n` +
          'Ensure MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_API_URL, ' +
          'MAILGUN_FROM_EMAIL, MAILGUN_FROM_NAME are set in .env.local'
      );
    }
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should send invitation email via live Mailgun', async () => {
    // Use a unique test email with timestamp to avoid conflicts
    const timestamp = Date.now();
    const testEmail = `test+invitation-${timestamp}@${emailConfig.mailgunDomain}`;
    const inviteId = randomUUID();

    // 1. Queue the invitation email
    const result = await emailService.sendTemplatedEmail({
      templateName: 'invitation',
      toEmail: testEmail,
      toName: 'Test User',
      subject: `[TEST] You've been invited to join Test Organization`,
      templateData: {
        recipientName: 'Test User',
        inviterName: 'Integration Test',
        organizationName: 'Test Organization',
        inviteUrl: 'https://example.com/accept?token=test-token',
        expiresAt: 'January 1, 2030',
      },
      sourceType: 'invite',
      sourceId: inviteId,
    });

    expect(result.queued).toBe(true);
    expect(result.jobId).toBeDefined();

    // 2. Verify job is in pending state
    const pendingJob = await emailJobs.getJob(result.jobId!);
    expect(pendingJob).not.toBeNull();
    expect(pendingJob!.status).toBe('pending');
    expect(pendingJob!.template_name).toBe('invitation');
    expect(pendingJob!.to_email).toBe(testEmail);

    // 3. Process the job via worker (with retries for async processing)
    let finalJob = pendingJob;
    let attempts = 0;
    const maxAttempts = 5;

    while (
      finalJob &&
      (finalJob.status === 'pending' || finalJob.status === 'processing') &&
      attempts < maxAttempts
    ) {
      attempts++;

      await emailWorker.processBatch();

      // Wait a bit for Mailgun API response
      await new Promise((resolve) => setTimeout(resolve, 2000));

      finalJob = await emailJobs.getJob(result.jobId!);
    }

    // 4. Verify email was sent successfully
    expect(finalJob).not.toBeNull();
    expect(finalJob!.status).toBe('sent');
    expect(finalJob!.mailgun_message_id).toBeDefined();
    expect(finalJob!.mailgun_message_id).toMatch(/^<.+@.+>$/); // Mailgun message ID format

    // 5. Verify email log was created (using TypeORM to use same connection as worker)
    const emailLogRepo = dataSource.getRepository(EmailLog);
    const logs = await emailLogRepo.find({
      where: { emailJobId: result.jobId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].eventType).toBe('sent');
  });

  it('should handle template rendering with all invitation fields', async () => {
    const timestamp = Date.now();
    const testEmail = `test+render-${timestamp}@${emailConfig.mailgunDomain}`;
    const sourceId = randomUUID();

    // Test with all optional fields populated
    const result = await emailService.sendTemplatedEmail({
      templateName: 'invitation',
      toEmail: testEmail,
      toName: 'Full Template Test User',
      subject: `[TEST] Complete invitation template test`,
      templateData: {
        recipientName: 'Full Template Test User',
        inviterName: 'Jane Doe (Admin)',
        organizationName: 'Acme Corporation',
        inviteUrl: 'https://app.example.com/invites/accept?token=abc123xyz',
        expiresAt: 'December 31, 2025',
      },
      sourceType: 'invite',
      sourceId,
    });

    expect(result.queued).toBe(true);

    // Process the email
    await emailWorker.processBatch();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const job = await emailJobs.getJob(result.jobId!);
    expect(job?.status).toBe('sent');
  });

  it('should track source type and source ID for invite emails', async () => {
    const timestamp = Date.now();
    const testEmail = `test+tracking-${timestamp}@${emailConfig.mailgunDomain}`;
    const sourceId = randomUUID();

    const result = await emailService.sendTemplatedEmail({
      templateName: 'invitation',
      toEmail: testEmail,
      subject: `[TEST] Tracking test`,
      templateData: {
        organizationName: 'Tracking Test Org',
        inviteUrl: 'https://example.com/accept',
      },
      sourceType: 'invite',
      sourceId,
    });

    expect(result.queued).toBe(true);

    // Verify we can find jobs by source
    const jobsBySource = await emailJobs.getJobsBySource('invite', sourceId);
    expect(jobsBySource.length).toBe(1);
    expect(jobsBySource[0].source_type).toBe('invite');
    expect(jobsBySource[0].source_id).toBe(sourceId);

    // Process and verify
    await emailWorker.processBatch();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const processedJobs = await emailJobs.getJobsBySource('invite', sourceId);
    expect(processedJobs[0].status).toBe('sent');
  });

  it('should report queue statistics', async () => {
    const stats = await emailService.getQueueStats();

    expect(stats).toHaveProperty('pending');
    expect(stats).toHaveProperty('processing');
    expect(stats).toHaveProperty('sent');
    expect(stats).toHaveProperty('failed');

    // We should have some sent emails from previous tests
    expect(stats.sent).toBeGreaterThan(0);
  });
});
