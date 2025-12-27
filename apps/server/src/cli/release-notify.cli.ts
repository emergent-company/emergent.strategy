#!/usr/bin/env ts-node
/**
 * Release Notification CLI
 *
 * Two-step release notification system:
 * 1. Create a release (draft) - generates changelog, stores in DB
 * 2. Send notifications - references existing release by ID or version
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/cli/release-notify.cli.ts [options]
 *
 * Commands:
 *   --create           Create a release (draft) without sending notifications
 *   --send <version>   Send notifications for an existing release (by version or ID)
 *   --list             List recent releases (drafts and published)
 *
 * Create options:
 *   --from <commit>    Start commit (defaults to last notified commit or tag)
 *   --to <commit>      End commit (defaults to HEAD)
 *   --since <date>     Get commits since date (e.g., "2024-12-01", "1 week ago")
 *   --until <date>     Get commits until date (defaults to now)
 *   --raw-commits      Skip LLM changelog generation, use raw commit messages
 *
 * Send options:
 *   --user-id <id>     Send to a single user
 *   --project-id <id>  Send to all members of a project
 *   --all-users        Send to all active users
 *   --resend           Force resend even if user already received this release
 *   --dry-run          Preview without sending
 *   --force            Bypass debounce window (1 hour)
 *
 * Legacy mode (create + send in one step):
 *   --user-id/--project-id/--all-users without --send triggers legacy mode
 *
 * Status:
 *   --status [id]      Check delivery status (optional release ID, defaults to latest)
 *   --status-count <n> Show status for last N releases (default: 5)
 *
 * Other:
 *   --reset            Reset notification state (for git history rewrites)
 *   --help, -h         Show this help message
 *
 * Examples:
 *   # Step 1: Create a release (draft)
 *   npx ts-node src/cli/release-notify.cli.ts --create
 *
 *   # Step 2: Preview sending to all users
 *   npx ts-node src/cli/release-notify.cli.ts --send v2025.01.15 --all-users --dry-run
 *
 *   # Step 2: Actually send to all users
 *   npx ts-node src/cli/release-notify.cli.ts --send v2025.01.15 --all-users
 *
 *   # Resend to a specific user who already received it
 *   npx ts-node src/cli/release-notify.cli.ts --send v2025.01.15 --user-id abc123 --resend
 *
 *   # List recent releases
 *   npx ts-node src/cli/release-notify.cli.ts --list
 *
 *   # Check delivery status
 *   npx ts-node src/cli/release-notify.cli.ts --status
 *
 *   # Legacy: Create and send in one step (backward compatible)
 *   npx ts-node src/cli/release-notify.cli.ts --all-users
 */

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../common/config/config.module';
import { AppConfigService } from '../common/config/config.service';
import { ReleasesModule } from '../modules/releases/releases.module';
import {
  ReleaseChangelogService,
  ChangelogResult,
} from '../modules/releases/services/release-changelog.service';
import {
  ReleaseNotificationsService,
  SendNotificationResult,
} from '../modules/releases/services/release-notifications.service';
import { ReleaseStatusService } from '../modules/releases/services/release-status.service';
import { entities } from '../entities';

interface CliArgs {
  create: boolean;
  send?: string;
  list: boolean;
  resend: boolean;
  userId?: string;
  projectId?: string;
  allUsers: boolean;
  from?: string;
  to?: string;
  since?: string;
  until?: string;
  dryRun: boolean;
  force: boolean;
  expandAudience: boolean;
  reset: boolean;
  rawCommits: boolean;
  status: boolean | string;
  statusCount: number;
  listCount: number;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    create: false,
    list: false,
    resend: false,
    allUsers: false,
    dryRun: false,
    force: false,
    expandAudience: false,
    reset: false,
    rawCommits: false,
    status: false,
    statusCount: 5,
    listCount: 10,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--create':
        result.create = true;
        break;
      case '--send':
        if (nextArg && !nextArg.startsWith('--')) {
          result.send = nextArg;
          i++;
        } else {
          console.error('Error: --send requires a version or release ID');
          process.exit(1);
        }
        break;
      case '--list':
        result.list = true;
        break;
      case '--list-count':
        result.listCount = parseInt(nextArg, 10) || 10;
        i++;
        break;
      case '--resend':
        result.resend = true;
        break;
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
      case '--since':
        result.since = nextArg;
        i++;
        break;
      case '--until':
        result.until = nextArg;
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

Usage: npx ts-node src/cli/release-notify.cli.ts [command] [options]

Commands:
  --create              Create a release (draft) without sending notifications
  --send <version>      Send notifications for an existing release
  --list                List recent releases (drafts and published)

Create options (use with --create):
  --from <commit>       Start commit (defaults to last notified or tag)
  --to <commit>         End commit (defaults to HEAD)
  --since <date>        Get commits since date (e.g., "2024-12-01", "1 week ago")
  --until <date>        Get commits until date (defaults to now)
  --raw-commits         Skip LLM processing, use raw commit messages

Note: Use either --from/--to (commit range) OR --since/--until (date range), not both.

Send options (use with --send):
  --user-id <id>        Send to a single user by ID
  --project-id <id>     Send to all members of a project
  --all-users           Send to all active users
  --resend              Force resend even if user already received this release
  --dry-run             Preview recipients without sending
  --force               Bypass 1-hour debounce window

Legacy mode (backward compatible):
  Using --user-id/--project-id/--all-users without --send
  will create AND send a release in one step (original behavior)

Status:
  --status [id]         Check delivery status (defaults to latest release)
  --status-count <n>    Show status for last N releases (default: 5)

Other:
  --expand-audience     Add new recipients to existing release
  --reset               Reset notification state (use after git history rewrites)
  --help, -h            Show this help message

Examples:
  # Two-step workflow (recommended):
  # Step 1: Create a draft release
  npx ts-node src/cli/release-notify.cli.ts --create

  # Step 1 (alt): Create release from commits since a specific date
  npx ts-node src/cli/release-notify.cli.ts --create --since "2024-12-01"

  # Step 1 (alt): Create release from last week's commits (raw, no LLM)
  npx ts-node src/cli/release-notify.cli.ts --create --since "1 week ago" --raw-commits

  # Step 2: Preview sending
  npx ts-node src/cli/release-notify.cli.ts --send v2025.01.15 --all-users --dry-run

  # Step 2: Actually send
  npx ts-node src/cli/release-notify.cli.ts --send v2025.01.15 --all-users

  # Resend to specific user
  npx ts-node src/cli/release-notify.cli.ts --send v2025.01.15 --user-id abc123 --resend

  # List releases
  npx ts-node src/cli/release-notify.cli.ts --list

  # Check delivery status
  npx ts-node src/cli/release-notify.cli.ts --status

  # Legacy: Create and send in one step
  npx ts-node src/cli/release-notify.cli.ts --all-users --dry-run
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
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(
    ReleaseNotifyCLIModule,
    {
      logger: ['error', 'warn'],
    }
  );

  const changelogService = app.get(ReleaseChangelogService);
  const notificationsService = app.get(ReleaseNotificationsService);
  const statusService = app.get(ReleaseStatusService);

  try {
    if (args.reset) {
      console.log('Resetting notification state...');
      await notificationsService.resetNotificationState();
      console.log('✓ Notification state reset successfully.');
      await app.close();
      process.exit(0);
    }

    if (args.status) {
      await handleStatus(statusService, args);
      await app.close();
      process.exit(0);
    }

    if (args.list) {
      await handleList(notificationsService, args);
      await app.close();
      process.exit(0);
    }

    if (args.create) {
      await handleCreate(changelogService, notificationsService, args);
      await app.close();
      process.exit(0);
    }

    if (args.send) {
      await handleSend(notificationsService, args);
      await app.close();
      process.exit(0);
    }

    const hasTarget = args.userId || args.projectId || args.allUsers;
    if (hasTarget) {
      await handleLegacyMode(changelogService, notificationsService, args);
      await app.close();
      process.exit(0);
    }

    console.error(
      'Error: Must specify a command (--create, --send <version>, --list) or targeting (--user-id, --project-id, --all-users)'
    );
    printUsage();
    process.exit(1);
  } catch (error) {
    console.error('Error:', (error as Error).message);
    await app.close();
    process.exit(1);
  }
}

async function handleCreate(
  changelogService: ReleaseChangelogService,
  notificationsService: ReleaseNotificationsService,
  args: CliArgs
) {
  console.log('='.repeat(60));
  console.log('CREATE RELEASE (DRAFT)');
  console.log('='.repeat(60));

  const state = await notificationsService.getNotificationState();
  const fromCommit = args.from || state?.lastNotifiedCommit;

  // Display parameters based on mode (date range vs commit range)
  if (args.since) {
    console.log(`Since: ${args.since}`);
    if (args.until) console.log(`Until: ${args.until}`);
  } else {
    console.log(`From commit: ${fromCommit || '(auto-detect from tags)'}`);
    console.log(`To commit: ${args.to || 'HEAD'}`);
  }
  if (args.rawCommits) console.log('Raw commits: YES (skipping LLM)');
  console.log('');

  console.log('Generating changelog...');
  const changelog = await changelogService.generateChangelog({
    fromCommit,
    toCommit: args.to,
    since: args.since,
    until: args.until,
    rawCommits: args.rawCommits,
  });

  printChangelogSummary(changelog);

  console.log('\nCreating draft release...');
  const result = await notificationsService.createRelease(changelog);

  if (result.success) {
    console.log('');
    console.log('✓ DRAFT RELEASE CREATED');
    console.log(`  Release ID: ${result.releaseId}`);
    console.log(`  Version: ${result.version}`);
    console.log('');
    console.log('Next step: Send notifications with:');
    console.log(
      `  npx ts-node src/cli/release-notify.cli.ts --send ${result.version} --all-users --dry-run`
    );
  } else {
    console.log('');
    console.log('✗ FAILED');
    console.log(`  Error: ${result.error}`);
  }
}

async function handleSend(
  notificationsService: ReleaseNotificationsService,
  args: CliArgs
) {
  console.log('='.repeat(60));
  console.log('SEND NOTIFICATIONS FOR RELEASE');
  console.log('='.repeat(60));
  console.log(`Mode: ${args.dryRun ? 'DRY RUN (preview only)' : 'LIVE'}`);
  console.log(`Release: ${args.send}`);
  console.log(
    `Target: ${
      args.userId
        ? `User ${args.userId}`
        : args.projectId
        ? `Project ${args.projectId}`
        : 'All Users'
    }`
  );
  if (args.force) console.log('Force: YES (bypassing debounce)');
  if (args.resend) console.log('Resend: YES (force resend to users)');
  console.log('');

  const targetCount = [args.userId, args.projectId, args.allUsers].filter(
    Boolean
  ).length;
  if (targetCount !== 1) {
    console.error(
      'Error: Must specify exactly one of: --user-id, --project-id, or --all-users'
    );
    process.exit(1);
  }

  const result = await notificationsService.sendNotificationsForRelease(
    args.send!,
    {
      userId: args.userId,
      projectId: args.projectId,
      allUsers: args.allUsers,
      dryRun: args.dryRun,
      force: args.force,
      resend: args.resend,
    }
  );

  printSendResult(result, args.dryRun);
}

async function handleList(
  notificationsService: ReleaseNotificationsService,
  args: CliArgs
) {
  console.log('='.repeat(60));
  console.log('RELEASES');
  console.log('='.repeat(60));

  const releases = await notificationsService.getReleases(args.listCount, 0);

  if (releases.length === 0) {
    console.log('\nNo releases found.');
    return;
  }

  console.log(`\nShowing ${releases.length} most recent releases:\n`);

  for (const release of releases) {
    const dateStr = release.createdAt.toISOString().split('T')[0];
    const statusIcon = release.status === 'draft' ? '○' : '●';
    const statusText = release.status === 'draft' ? '[DRAFT]' : '[PUBLISHED]';

    console.log(`${statusIcon} ${release.version} (${dateStr}) ${statusText}`);
    console.log(`    ID: ${release.id}`);
    console.log(
      `    Commits: ${release.commitCount} (${release.fromCommit?.substring(
        0,
        7
      )}..${release.toCommit?.substring(0, 7)})`
    );
    console.log('');
  }
}

async function handleLegacyMode(
  changelogService: ReleaseChangelogService,
  notificationsService: ReleaseNotificationsService,
  args: CliArgs
) {
  const state = await notificationsService.getNotificationState();
  const fromCommit = args.from || state?.lastNotifiedCommit;

  console.log('='.repeat(60));
  console.log('RELEASE NOTIFICATION (Legacy Mode)');
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
  if (args.since) {
    console.log(`Since: ${args.since}`);
    if (args.until) console.log(`Until: ${args.until}`);
  } else {
    console.log(`From commit: ${fromCommit || '(auto-detect from tags)'}`);
    console.log(`To commit: ${args.to || 'HEAD'}`);
  }
  if (args.force) console.log('Force: YES (bypassing debounce)');
  if (args.expandAudience) console.log('Expand audience: YES');
  if (args.rawCommits) console.log('Raw commits: YES (skipping LLM)');
  console.log('');

  console.log('Generating changelog...');
  const changelog = await changelogService.generateChangelog({
    fromCommit,
    toCommit: args.to,
    since: args.since,
    until: args.until,
    rawCommits: args.rawCommits,
  });

  printChangelogSummary(changelog);

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

  printSendResult(result, args.dryRun);
}

function printChangelogSummary(changelog: ChangelogResult) {
  console.log(`\nVersion: ${changelog.version}`);
  console.log(
    `Commits: ${changelog.commitCount} (${changelog.fromCommit}..${changelog.toCommit})`
  );
  console.log(`\nSummary: ${changelog.changelog.summary}`);

  if (changelog.changelog.features.length > 0) {
    console.log(`\nFeatures (${changelog.changelog.features.length}):`);
    changelog.changelog.features.forEach((f: { title: string }) =>
      console.log(`  • ${f.title}`)
    );
  }

  if (changelog.changelog.improvements.length > 0) {
    console.log(`\nImprovements (${changelog.changelog.improvements.length}):`);
    changelog.changelog.improvements.forEach((i: { title: string }) =>
      console.log(`  • ${i.title}`)
    );
  }

  if (changelog.changelog.bugFixes.length > 0) {
    console.log(`\nBug Fixes (${changelog.changelog.bugFixes.length}):`);
    changelog.changelog.bugFixes.forEach((b: { title: string }) =>
      console.log(`  • ${b.title}`)
    );
  }

  if (changelog.changelog.breakingChanges.length > 0) {
    console.log(
      `\n⚠️  Breaking Changes (${changelog.changelog.breakingChanges.length}):`
    );
    changelog.changelog.breakingChanges.forEach((b: { title: string }) =>
      console.log(`  • ${b.title}`)
    );
  }
}

function printSendResult(result: SendNotificationResult, dryRun: boolean) {
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

    if (dryRun && result.recipients) {
      console.log('\nRecipients (dry run):');
      result.recipients.forEach(
        (r: { userId: string; email?: string; displayName?: string }) => {
          const email = r.email || '(no email)';
          const name = r.displayName || '(no name)';
          console.log(`  • ${r.userId}: ${name} <${email}>`);
        }
      );
    }
  } else {
    console.log('✗ FAILED');
    console.log(`  Error: ${result.error}`);
  }

  console.log('');
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
