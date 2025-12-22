#!/usr/bin/env ts-node
/**
 * User Profile Sync CLI
 *
 * Synchronizes user profile data (name, email) from Zitadel to the local database.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/cli/user-sync.cli.ts [options]
 *
 * Options:
 *   --all              Sync all users with incomplete data
 *   --user-id <id>     Sync a specific user by internal UUID
 *   --batch-size <n>   Number of users per batch (default: 10)
 *   --dry-run          Preview without making changes
 *   --stats            Show worker statistics
 *   --help             Show this help message
 *
 * Examples:
 *   # Sync all users with missing data (dry run)
 *   npx ts-node src/cli/user-sync.cli.ts --all --dry-run
 *
 *   # Sync a specific user
 *   npx ts-node src/cli/user-sync.cli.ts --user-id abc123-def456
 *
 *   # Sync with larger batch size
 *   npx ts-node src/cli/user-sync.cli.ts --all --batch-size 50
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../common/config/config.module';
import { AppConfigService } from '../common/config/config.service';
import { UserProfileModule } from '../modules/user-profile/user-profile.module';
import { UserProfileSyncWorkerService } from '../modules/user-profile/user-profile-sync-worker.service';
import { entities } from '../entities';

// CLI argument parsing
interface CliArgs {
  all: boolean;
  userId?: string;
  batchSize: number;
  dryRun: boolean;
  stats: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    all: false,
    batchSize: 10,
    dryRun: false,
    stats: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--all':
        result.all = true;
        break;
      case '--user-id':
        result.userId = nextArg;
        i++;
        break;
      case '--batch-size':
        result.batchSize = parseInt(nextArg, 10);
        i++;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--stats':
        result.stats = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
User Profile Sync CLI

Synchronizes user profile data (name, email) from Zitadel to the local database.

Usage:
  npx ts-node -r tsconfig-paths/register src/cli/user-sync.cli.ts [options]

Options:
  --all              Sync all users with incomplete data
  --user-id <id>     Sync a specific user by internal UUID
  --batch-size <n>   Number of users per batch (default: 10)
  --dry-run          Preview without making changes
  --stats            Show worker statistics
  --help             Show this help message

Examples:
  # Sync all users with missing data (dry run)
  npx ts-node src/cli/user-sync.cli.ts --all --dry-run

  # Sync a specific user
  npx ts-node src/cli/user-sync.cli.ts --user-id abc123-def456

  # Sync with larger batch size
  npx ts-node src/cli/user-sync.cli.ts --all --batch-size 50
`);
}

/**
 * Minimal module for CLI that includes user profile sync functionality
 */
@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (config: AppConfigService) => ({
        type: 'postgres',
        host: config.dbHost,
        port: config.dbPort,
        username: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        entities,
        synchronize: false,
        logging: false,
      }),
      inject: [AppConfigService],
    }),
    UserProfileModule,
  ],
})
class UserSyncCliModule {}

async function main() {
  const logger = new Logger('UserSyncCLI');
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.all && !args.userId && !args.stats) {
    console.error('Error: Must specify --all, --user-id <id>, or --stats');
    printHelp();
    process.exit(1);
  }

  // Disable worker auto-start in CLI mode
  process.env.USER_PROFILE_SYNC_ENABLED = 'false';
  process.env.USER_PROFILE_SYNC_BATCH_SIZE = args.batchSize.toString();

  console.log('============================================================');
  console.log('USER PROFILE SYNC');
  console.log('============================================================');
  console.log(`Mode: ${args.dryRun ? 'DRY RUN (preview only)' : 'LIVE'}`);
  if (args.all) {
    console.log(`Target: All users with incomplete data`);
    console.log(`Batch size: ${args.batchSize}`);
  } else if (args.userId) {
    console.log(`Target: User ${args.userId}`);
  } else if (args.stats) {
    console.log(`Target: Show statistics`);
  }
  console.log('');

  // Bootstrap NestJS application
  const app = await NestFactory.createApplicationContext(UserSyncCliModule, {
    logger: ['error', 'warn'],
  });

  try {
    const syncWorker = app.get(UserProfileSyncWorkerService);

    if (args.stats) {
      const stats = syncWorker.stats();
      console.log('Worker Statistics:');
      console.log(`  Processed: ${stats.processed}`);
      console.log(`  Succeeded: ${stats.succeeded}`);
      console.log(`  Failed: ${stats.failed}`);
      console.log(`  Running: ${stats.running}`);
      console.log(`  Last sync: ${stats.lastSyncAt || 'Never'}`);
      return;
    }

    if (args.userId) {
      // Sync single user
      console.log(`Syncing user ${args.userId}...`);

      if (args.dryRun) {
        console.log('(dry run - no changes will be made)');
        console.log('');
        // Just check if user exists and show current state
        const { DataSource } = await import('typeorm');
        const config = app.get(AppConfigService);
        const ds = new DataSource({
          type: 'postgres',
          host: config.dbHost,
          port: config.dbPort,
          username: config.dbUser,
          password: config.dbPassword,
          database: config.dbName,
        });
        await ds.initialize();

        const result = await ds.query(
          `
          SELECT 
            p.id,
            p.zitadel_user_id,
            p.first_name,
            p.last_name,
            p.display_name,
            e.email
          FROM core.user_profiles p
          LEFT JOIN core.user_emails e ON e.user_id = p.id
          WHERE p.id = $1
        `,
          [args.userId]
        );

        if (result.length === 0) {
          console.log(`User ${args.userId} not found`);
        } else {
          const user = result[0];
          console.log('Current state:');
          console.log(`  Zitadel ID: ${user.zitadel_user_id}`);
          console.log(`  First name: ${user.first_name || '(not set)'}`);
          console.log(`  Last name: ${user.last_name || '(not set)'}`);
          console.log(`  Display name: ${user.display_name || '(not set)'}`);
          console.log(`  Email: ${user.email || '(not set)'}`);
        }

        await ds.destroy();
      } else {
        const result = await syncWorker.syncUserById(args.userId);

        if (!result) {
          console.log(`User ${args.userId} not found`);
        } else if (result.success) {
          if (result.updatedFields.length > 0) {
            console.log(
              `✓ Synced successfully. Updated fields: ${result.updatedFields.join(
                ', '
              )}`
            );
          } else {
            console.log('✓ User already up to date (no changes needed)');
          }
        } else {
          console.log(`✗ Sync failed: ${result.error}`);
        }
      }
    } else if (args.all) {
      // Sync all users
      console.log('Finding users with incomplete data...');

      if (args.dryRun) {
        console.log('(dry run - no changes will be made)');
        console.log('');

        // Query users that need sync
        const { DataSource } = await import('typeorm');
        const config = app.get(AppConfigService);
        const ds = new DataSource({
          type: 'postgres',
          host: config.dbHost,
          port: config.dbPort,
          username: config.dbUser,
          password: config.dbPassword,
          database: config.dbName,
        });
        await ds.initialize();

        const users = await ds.query(
          `
          SELECT 
            p.id,
            p.zitadel_user_id,
            p.first_name,
            p.last_name,
            p.display_name,
            e.email
          FROM core.user_profiles p
          LEFT JOIN core.user_emails e ON e.user_id = p.id
          WHERE p.deleted_at IS NULL
            AND p.zitadel_user_id ~ '^[0-9]+$'
            AND (
              p.first_name IS NULL OR 
              p.last_name IS NULL OR 
              p.display_name IS NULL OR
              e.email IS NULL
            )
          LIMIT $1
        `,
          [args.batchSize]
        );

        console.log(`Found ${users.length} users needing sync:`);
        console.log('');

        for (const user of users) {
          const missing: string[] = [];
          if (!user.first_name) missing.push('firstName');
          if (!user.last_name) missing.push('lastName');
          if (!user.display_name) missing.push('displayName');
          if (!user.email) missing.push('email');

          console.log(`  • ${user.id.substring(0, 8)}...`);
          console.log(`    Zitadel ID: ${user.zitadel_user_id}`);
          console.log(`    Missing: ${missing.join(', ')}`);
        }

        await ds.destroy();
      } else {
        // Run actual sync
        await syncWorker.processBatch();

        const stats = syncWorker.stats();
        console.log('');
        console.log(
          '------------------------------------------------------------'
        );
        console.log('Sync Complete:');
        console.log(`  Processed: ${stats.processed}`);
        console.log(`  Succeeded: ${stats.succeeded}`);
        console.log(`  Failed: ${stats.failed}`);
      }
    }
  } catch (error) {
    logger.error(`Sync failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
