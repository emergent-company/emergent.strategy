#!/usr/bin/env ts-node
/**
 * Release Notification CLI
 *
 * Sends release notifications to users via email and in-app notifications.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/cli/release-notify.cli.ts [options]
 *
 * Targeting (exactly one required):
 *   --user-id <id>     Notify a single user
 *   --project-id <id>  Notify all members of a project
 *   --all-users        Notify all active users
 *
 * Commit range:
 *   --from <commit>    Start commit (defaults to last notified commit or tag)
 *   --to <commit>      End commit (defaults to HEAD)
 *
 * Options:
 *   --dry-run          Preview without sending
 *   --force            Bypass debounce window (1 hour)
 *   --expand-audience  Add recipients to existing release notification
 *   --reset            Reset notification state (for git history rewrites)
 *   --raw-commits      Skip LLM changelog generation, use raw commit messages
 *
 * Status:
 *   --status [id]      Check delivery status (optional release ID, defaults to latest)
 *   --status-count <n> Show status for last N releases (default: 5)
 *
 * Examples:
 *   # Send to a single user (dry run)
 *   npx ts-node src/cli/release-notify.cli.ts --user-id abc123 --dry-run
 *
 *   # Send to all users
 *   npx ts-node src/cli/release-notify.cli.ts --all-users
 *
 *   # Check delivery status
 *   npx ts-node src/cli/release-notify.cli.ts --status
 *
 *   # Force send within debounce window
 *   npx ts-node src/cli/release-notify.cli.ts --all-users --force
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../common/config/config.module';
import { AppConfigService } from '../common/config/config.service';
import { ReleasesModule } from '../modules/releases/releases.module';
import { ReleaseChangelogService } from '../modules/releases/services/release-changelog.service';
import { ReleaseNotificationsService } from '../modules/releases/services/release-notifications.service';
import { ReleaseStatusService } from '../modules/releases/services/release-status.service';
import { entities } from '../entities';

// CLI argument parsing
interface CliArgs {
  userId?: string;
  projectId?: string;
  allUsers: boolean;
  from?: string;
  to?: string;
  dryRun: boolean;
  force: boolean;
  expandAudience: boolean;
  reset: boolean;
  rawCommits: boolean;
  status: boolean | string;
  statusCount: number;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    allUsers: false,
    dryRun: false,
    force: false,
    expandAudience: false,
    reset: false,
    rawCommits: false,
    status: false,
    statusCount: 5,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--user-id':
        result.userId = nextArg;
        i++;
        break;
      case '--project-id':
        result.projectId = nextArg;
        i++;
        break;
      case '--all-users':
        result.allUsers = true;
        break;
      case '--from':
        result.from = nextArg;
        i++;
        break;
      case '--to':
        result.to = nextArg;
        i++;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--force':
        result.force = true;
        break;
      case '--expand-audience':
        result.expandAudience = true;
        break;
      case '--reset':
        result.reset = true;
        break;
      case '--raw-commits':
        result.rawCommits = true;
        break;
      case '--status':
        // --status can be followed by an optional release ID
        if (nextArg && !nextArg.startsWith('--')) {
          result.status = nextArg;
          i++;
        } else {
          result.status = true;
        }
        break;
      case '--status-count':
        result.statusCount = parseInt(nextArg, 10) || 5;
        i++;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function printUsage() {
  console.log(`
Release Notification CLI

Usage: npx ts-node src/cli/release-notify.cli.ts [options]

Targeting (exactly one required):
  --user-id <id>       Notify a single user by ID
  --project-id <id>    Notify all members of a project
  --all-users          Notify all active users

Commit range:
  --from <commit>      Start commit (defaults to last notified or tag)
  --to <commit>        End commit (defaults to HEAD)

Options:
  --dry-run            Preview recipients without sending
  --force              Bypass 1-hour debounce window
  --expand-audience    Add new recipients to existing release
  --reset              Reset notification state (use after git history rewrites)
  --raw-commits        Skip LLM processing, use raw commit messages

Status:
  --status [id]        Check delivery status (defaults to latest release)
  --status-count <n>   Show status for last N releases (default: 5)

  --help, -h           Show this help message

Examples:
  # Preview sending to all users
  npx ts-node src/cli/release-notify.cli.ts --all-users --dry-run

  # Send to a specific user
  npx ts-node src/cli/release-notify.cli.ts --user-id abc-123

  # Check delivery status of latest release
  npx ts-node src/cli/release-notify.cli.ts --status

  # Force send within debounce window
  npx ts-node src/cli/release-notify.cli.ts --all-users --force
`);
}

// Minimal module for CLI
@Module({
  imports: [
    AppConfigModule,
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
        logging: false,
      }),
      inject: [AppConfigService],
    }),
    ReleasesModule,
  ],
})
class ReleaseNotifyCLIModule {}

async function main() {
  // Suppress NestJS logs for cleaner CLI output
  Logger.overrideLogger(false);

  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Initialize NestJS application context
  const app = await NestFactory.createApplicationContext(
    ReleaseNotifyCLIModule,
    {
      logger: false,
    }
  );

  const changelogService = app.get(ReleaseChangelogService);
  const notificationsService = app.get(ReleaseNotificationsService);
  const statusService = app.get(ReleaseStatusService);

  try {
    // Handle --reset flag
    if (args.reset) {
      console.log('Resetting notification state...');
      await notificationsService.resetNotificationState();
      console.log('✓ Notification state reset successfully.');
      await app.close();
      process.exit(0);
    }

    // Handle --status flag
    if (args.status) {
      await handleStatus(statusService, args);
      await app.close();
      process.exit(0);
    }

    // Validate targeting
    const targetCount = [args.userId, args.projectId, args.allUsers].filter(
      Boolean
    ).length;
    if (targetCount !== 1) {
      console.error(
        'Error: Must specify exactly one of: --user-id, --project-id, or --all-users'
      );
      printUsage();
      process.exit(1);
    }

    // Get notification state to determine starting commit
    const state = await notificationsService.getNotificationState();
    const fromCommit = args.from || state?.lastNotifiedCommit;

    console.log('='.repeat(60));
    console.log('RELEASE NOTIFICATION');
    console.log('='.repeat(60));
    console.log(`Mode: ${args.dryRun ? 'DRY RUN (preview only)' : 'LIVE'}`);
    console.log(
      `Target: ${
        args.userId
          ? `User ${args.userId}`
          : args.projectId
          ? `Project ${args.projectId}`
          : 'All Users'
      }`
    );
    console.log(`From commit: ${fromCommit || '(auto-detect from tags)'}`);
    console.log(`To commit: ${args.to || 'HEAD'}`);
    if (args.force) console.log('Force: YES (bypassing debounce)');
    if (args.expandAudience) console.log('Expand audience: YES');
    if (args.rawCommits) console.log('Raw commits: YES (skipping LLM)');
    console.log('');

    // Generate changelog
    console.log('Generating changelog...');
    const changelog = await changelogService.generateChangelog({
      fromCommit,
      toCommit: args.to,
      rawCommits: args.rawCommits,
    });

    console.log(`\nVersion: ${changelog.version}`);
    console.log(
      `Commits: ${changelog.commitCount} (${changelog.fromCommit}..${changelog.toCommit})`
    );
    console.log(`\nSummary: ${changelog.changelog.summary}`);

    if (changelog.changelog.features.length > 0) {
      console.log(`\nFeatures (${changelog.changelog.features.length}):`);
      changelog.changelog.features.forEach((f) =>
        console.log(`  • ${f.title}`)
      );
    }

    if (changelog.changelog.improvements.length > 0) {
      console.log(
        `\nImprovements (${changelog.changelog.improvements.length}):`
      );
      changelog.changelog.improvements.forEach((i) =>
        console.log(`  • ${i.title}`)
      );
    }

    if (changelog.changelog.bugFixes.length > 0) {
      console.log(`\nBug Fixes (${changelog.changelog.bugFixes.length}):`);
      changelog.changelog.bugFixes.forEach((b) =>
        console.log(`  • ${b.title}`)
      );
    }

    if (changelog.changelog.breakingChanges.length > 0) {
      console.log(
        `\n⚠️  Breaking Changes (${changelog.changelog.breakingChanges.length}):`
      );
      changelog.changelog.breakingChanges.forEach((b) =>
        console.log(`  • ${b.title}`)
      );
    }

    // Send notifications
    console.log('\n' + '-'.repeat(60));
    console.log('Sending notifications...');
    console.log('-'.repeat(60));

    const result = await notificationsService.sendNotifications(changelog, {
      userId: args.userId,
      projectId: args.projectId,
      allUsers: args.allUsers,
      dryRun: args.dryRun,
      force: args.force,
      expandAudience: args.expandAudience,
    });

    // Print results
    console.log('');
    if (result.success) {
      console.log('✓ SUCCESS');
      if (result.releaseId) {
        console.log(`  Release ID: ${result.releaseId}`);
      }
      if (result.version) {
        console.log(`  Version: ${result.version}`);
      }
      console.log(`  Recipients: ${result.recipientCount}`);
      console.log(`  Emails sent: ${result.emailsSent}`);
      if (result.emailsFailed > 0) {
        console.log(`  Emails failed: ${result.emailsFailed}`);
      }
      console.log(`  In-app notifications: ${result.inAppSent}`);
      if (result.skippedUsers > 0) {
        console.log(`  Skipped (no email): ${result.skippedUsers}`);
      }

      if (args.dryRun && result.recipients) {
        console.log('\nRecipients (dry run):');
        result.recipients.forEach((r) => {
          const email = r.email || '(no email)';
          const name = r.displayName || '(no name)';
          console.log(`  • ${r.userId}: ${name} <${email}>`);
        });
      }
    } else {
      console.log('✗ FAILED');
      console.log(`  Error: ${result.error}`);
    }

    console.log('');
  } catch (error) {
    console.error('Error:', (error as Error).message);
    await app.close();
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

async function handleStatus(
  statusService: ReleaseStatusService,
  args: CliArgs
) {
  console.log('='.repeat(60));
  console.log('RELEASE DELIVERY STATUS');
  console.log('='.repeat(60));

  try {
    if (typeof args.status === 'string') {
      // Specific release ID or version
      const releaseIdOrVersion = args.status;

      // Try as UUID first, then as version
      let status;
      if (releaseIdOrVersion.match(/^[0-9a-f-]{36}$/i)) {
        status = await statusService.getDeliveryStatus(releaseIdOrVersion);
      } else {
        status = await statusService.getDeliveryStatusByVersion(
          releaseIdOrVersion
        );
      }

      if (!status) {
        console.log(`\nRelease not found: ${releaseIdOrVersion}`);
        return;
      }

      printReleaseStatus(status);
    } else {
      // Show recent releases
      const statuses = await statusService.getRecentDeliveryStatuses(
        args.statusCount
      );

      if (statuses.length === 0) {
        console.log('\nNo release notifications found.');
        return;
      }

      console.log(`\nShowing ${statuses.length} most recent releases:\n`);

      for (const status of statuses) {
        printReleaseStatus(status, true);
        console.log('');
      }
    }
  } catch (error) {
    console.error('Error fetching status:', (error as Error).message);
  }
}

function printReleaseStatus(
  status: Awaited<ReturnType<ReleaseStatusService['getDeliveryStatus']>>,
  compact = false
) {
  const dateStr = status.createdAt.toISOString().split('T')[0];

  if (compact) {
    // Compact summary for list view
    const total = status.totalRecipients;
    const delivered = status.delivered + status.opened;
    const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(0) : 0;

    console.log(`${status.version} (${dateStr})`);
    console.log(
      `  Recipients: ${total} | Delivered: ${delivered} (${deliveryRate}%) | Opened: ${status.opened} | Failed: ${status.failed} | Pending: ${status.pending}`
    );
  } else {
    // Detailed view for single release
    console.log(`\nRelease: ${status.version}`);
    console.log(`ID: ${status.releaseId}`);
    console.log(`Created: ${status.createdAt.toISOString()}`);
    console.log('');
    console.log('Delivery Summary:');
    console.log(`  Total recipients: ${status.totalRecipients}`);
    console.log(`  Pending: ${status.pending}`);
    console.log(`  Delivered: ${status.delivered}`);
    console.log(`  Opened: ${status.opened}`);
    console.log(`  Failed: ${status.failed}`);

    if (status.recipients.length > 0 && status.recipients.length <= 20) {
      console.log('\nRecipient Details:');
      for (const r of status.recipients) {
        const statusIcon =
          r.emailStatus === 'delivered' || r.emailStatus === 'opened'
            ? '✓'
            : r.emailStatus === 'failed'
            ? '✗'
            : '○';
        const email = r.email || '(no email)';
        console.log(`  ${statusIcon} ${r.userId}: ${email} [${r.emailStatus}]`);
      }
    } else if (status.recipients.length > 20) {
      console.log(
        `\n(${status.recipients.length} recipients - use API for full list)`
      );
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
