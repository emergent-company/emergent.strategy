#!/usr/bin/env ts-node
/**
 * Superadmin Management CLI
 *
 * Manages superadmin grants for the platform. Superadmins have system-wide access
 * to all organizations, projects, and can impersonate users for support.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts [options]
 *
 * Commands:
 *   --grant              Grant superadmin status to a user
 *   --revoke             Revoke superadmin status from a user
 *   --list               List all active superadmins
 *
 * User Selection (for --grant and --revoke):
 *   --user-id <uuid>     Target user by internal UUID
 *   --email <email>      Target user by email address
 *
 * Options:
 *   --notes <text>       Notes for grant/revoke (optional)
 *   --dry-run            Preview without making changes
 *   --help               Show this help message
 *
 * Examples:
 *   # List all superadmins
 *   npx ts-node src/cli/superadmin.cli.ts --list
 *
 *   # Grant superadmin to user by email (dry run)
 *   npx ts-node src/cli/superadmin.cli.ts --grant --email admin@example.com --dry-run
 *
 *   # Grant superadmin to user by UUID
 *   npx ts-node src/cli/superadmin.cli.ts --grant --user-id abc123-def456 --notes "Platform operator"
 *
 *   # Revoke superadmin from user
 *   npx ts-node src/cli/superadmin.cli.ts --revoke --user-id abc123-def456 --notes "No longer needed"
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../common/config/config.module';
import { AppConfigService } from '../common/config/config.service';
import { entities } from '../entities';
import { Superadmin } from '../entities/superadmin.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { UserEmail } from '../entities/user-email.entity';
import { DataSource } from 'typeorm';

// CLI argument parsing
interface CliArgs {
  grant: boolean;
  revoke: boolean;
  list: boolean;
  userId?: string;
  email?: string;
  notes?: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    grant: false,
    revoke: false,
    list: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--grant':
        result.grant = true;
        break;
      case '--revoke':
        result.revoke = true;
        break;
      case '--list':
        result.list = true;
        break;
      case '--user-id':
        result.userId = nextArg;
        i++;
        break;
      case '--email':
        result.email = nextArg;
        i++;
        break;
      case '--notes':
        result.notes = nextArg;
        i++;
        break;
      case '--dry-run':
        result.dryRun = true;
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
Superadmin Management CLI

Manages superadmin grants for the platform. Superadmins have system-wide access
to all organizations, projects, and can impersonate users for support.

Usage:
  npx ts-node -r tsconfig-paths/register src/cli/superadmin.cli.ts [options]

Commands:
  --grant              Grant superadmin status to a user
  --revoke             Revoke superadmin status from a user
  --list               List all active superadmins

User Selection (for --grant and --revoke):
  --user-id <uuid>     Target user by internal UUID
  --email <email>      Target user by email address

Options:
  --notes <text>       Notes for grant/revoke (optional)
  --dry-run            Preview without making changes
  --help               Show this help message

Examples:
  # List all superadmins
  npx ts-node src/cli/superadmin.cli.ts --list

  # Grant superadmin to user by email (dry run)
  npx ts-node src/cli/superadmin.cli.ts --grant --email admin@example.com --dry-run

  # Grant superadmin to user by UUID
  npx ts-node src/cli/superadmin.cli.ts --grant --user-id abc123-def456 --notes "Platform operator"

  # Revoke superadmin from user
  npx ts-node src/cli/superadmin.cli.ts --revoke --user-id abc123-def456 --notes "No longer needed"
`);
}

/**
 * Minimal module for CLI that includes superadmin and user profile entities
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
    TypeOrmModule.forFeature([Superadmin, UserProfile, UserEmail]),
  ],
})
class SuperadminCliModule {}

interface UserInfo {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

async function findUserByEmail(
  ds: DataSource,
  email: string
): Promise<UserInfo | null> {
  const result = await ds.query(
    `
    SELECT 
      p.id,
      p.display_name,
      p.first_name,
      p.last_name,
      e.email
    FROM core.user_profiles p
    JOIN core.user_emails e ON e.user_id = p.id
    WHERE LOWER(e.email) = LOWER($1)
      AND p.deleted_at IS NULL
    LIMIT 1
  `,
    [email]
  );

  if (result.length === 0) return null;

  return {
    id: result[0].id,
    displayName: result[0].display_name,
    firstName: result[0].first_name,
    lastName: result[0].last_name,
    email: result[0].email,
  };
}

async function findUserById(
  ds: DataSource,
  userId: string
): Promise<UserInfo | null> {
  const result = await ds.query(
    `
    SELECT 
      p.id,
      p.display_name,
      p.first_name,
      p.last_name,
      e.email
    FROM core.user_profiles p
    LEFT JOIN core.user_emails e ON e.user_id = p.id
    WHERE p.id = $1
      AND p.deleted_at IS NULL
    LIMIT 1
  `,
    [userId]
  );

  if (result.length === 0) return null;

  return {
    id: result[0].id,
    displayName: result[0].display_name,
    firstName: result[0].first_name,
    lastName: result[0].last_name,
    email: result[0].email,
  };
}

function formatUserDisplay(user: UserInfo): string {
  const name =
    user.displayName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    '(no name)';
  return `${name} <${user.email || 'no email'}>`;
}

async function listSuperadmins(ds: DataSource): Promise<void> {
  const result = await ds.query(`
    SELECT 
      s.user_id,
      p.display_name,
      p.first_name,
      p.last_name,
      e.email,
      s.granted_at,
      s.notes,
      gp.display_name as granted_by_name,
      ge.email as granted_by_email
    FROM core.superadmins s
    JOIN core.user_profiles p ON p.id = s.user_id
    LEFT JOIN core.user_emails e ON e.user_id = p.id
    LEFT JOIN core.user_profiles gp ON gp.id = s.granted_by
    LEFT JOIN core.user_emails ge ON ge.user_id = gp.id
    WHERE s.revoked_at IS NULL
    ORDER BY s.granted_at DESC
  `);

  if (result.length === 0) {
    console.log('No active superadmins found.');
    return;
  }

  console.log(`Found ${result.length} active superadmin(s):\n`);

  for (const row of result) {
    const name =
      row.display_name ||
      `${row.first_name || ''} ${row.last_name || ''}`.trim() ||
      '(no name)';

    console.log(`  • ${name} <${row.email || 'no email'}>`);
    console.log(`    User ID: ${row.user_id}`);
    console.log(`    Granted: ${new Date(row.granted_at).toISOString()}`);
    if (row.granted_by_name || row.granted_by_email) {
      console.log(
        `    Granted by: ${row.granted_by_name || '(unknown)'} <${
          row.granted_by_email || 'no email'
        }>`
      );
    } else {
      console.log(`    Granted by: (system/CLI)`);
    }
    if (row.notes) {
      console.log(`    Notes: ${row.notes}`);
    }
    console.log('');
  }
}

async function grantSuperadmin(
  ds: DataSource,
  user: UserInfo,
  notes?: string,
  dryRun = false
): Promise<void> {
  // Check if already a superadmin
  const existing = await ds.query(
    `
    SELECT user_id, granted_at FROM core.superadmins
    WHERE user_id = $1 AND revoked_at IS NULL
  `,
    [user.id]
  );

  if (existing.length > 0) {
    console.log(
      `✗ User ${formatUserDisplay(
        user
      )} is already a superadmin (granted ${new Date(
        existing[0].granted_at
      ).toISOString()})`
    );
    return;
  }

  if (dryRun) {
    console.log(
      `[DRY RUN] Would grant superadmin to: ${formatUserDisplay(user)}`
    );
    if (notes) {
      console.log(`[DRY RUN] Notes: ${notes}`);
    }
    return;
  }

  // Insert new superadmin grant
  await ds.query(
    `
    INSERT INTO core.superadmins (user_id, granted_by, notes)
    VALUES ($1, NULL, $2)
    ON CONFLICT (user_id) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL, granted_at = now(), notes = $2
  `,
    [user.id, notes || null]
  );

  console.log(`✓ Granted superadmin to: ${formatUserDisplay(user)}`);
  if (notes) {
    console.log(`  Notes: ${notes}`);
  }
}

async function revokeSuperadmin(
  ds: DataSource,
  user: UserInfo,
  notes?: string,
  dryRun = false
): Promise<void> {
  // Check if currently a superadmin
  const existing = await ds.query(
    `
    SELECT user_id, granted_at FROM core.superadmins
    WHERE user_id = $1 AND revoked_at IS NULL
  `,
    [user.id]
  );

  if (existing.length === 0) {
    console.log(
      `✗ User ${formatUserDisplay(user)} is not currently a superadmin`
    );
    return;
  }

  if (dryRun) {
    console.log(
      `[DRY RUN] Would revoke superadmin from: ${formatUserDisplay(user)}`
    );
    if (notes) {
      console.log(`[DRY RUN] Notes: ${notes}`);
    }
    return;
  }

  // Soft revoke by setting revoked_at
  await ds.query(
    `
    UPDATE core.superadmins
    SET revoked_at = now(), notes = COALESCE($2, notes)
    WHERE user_id = $1 AND revoked_at IS NULL
  `,
    [user.id, notes || null]
  );

  console.log(`✓ Revoked superadmin from: ${formatUserDisplay(user)}`);
  if (notes) {
    console.log(`  Notes: ${notes}`);
  }
}

async function main() {
  const logger = new Logger('SuperadminCLI');
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate command
  const commandCount = [args.grant, args.revoke, args.list].filter(
    Boolean
  ).length;
  if (commandCount === 0) {
    console.error('Error: Must specify --grant, --revoke, or --list');
    printHelp();
    process.exit(1);
  }
  if (commandCount > 1) {
    console.error('Error: Cannot combine --grant, --revoke, and --list');
    process.exit(1);
  }

  // Validate user selection for grant/revoke
  if ((args.grant || args.revoke) && !args.userId && !args.email) {
    console.error('Error: Must specify --user-id or --email for grant/revoke');
    process.exit(1);
  }
  if (args.userId && args.email) {
    console.error('Error: Cannot specify both --user-id and --email');
    process.exit(1);
  }

  console.log('============================================================');
  console.log('SUPERADMIN MANAGEMENT');
  console.log('============================================================');
  if (args.dryRun) {
    console.log('Mode: DRY RUN (preview only)');
  }
  console.log('');

  // Bootstrap NestJS application
  const app = await NestFactory.createApplicationContext(SuperadminCliModule, {
    logger: ['error', 'warn'],
  });

  try {
    const ds = app.get(DataSource);

    if (args.list) {
      await listSuperadmins(ds);
      return;
    }

    // Find user
    let user: UserInfo | null = null;
    if (args.email) {
      console.log(`Finding user by email: ${args.email}`);
      user = await findUserByEmail(ds, args.email);
    } else if (args.userId) {
      console.log(`Finding user by ID: ${args.userId}`);
      user = await findUserById(ds, args.userId);
    }

    if (!user) {
      console.error(`✗ User not found: ${args.email || args.userId}`);
      process.exit(1);
    }

    console.log(`Found user: ${formatUserDisplay(user)}`);
    console.log(`User ID: ${user.id}`);
    console.log('');

    if (args.grant) {
      await grantSuperadmin(ds, user, args.notes, args.dryRun);
    } else if (args.revoke) {
      await revokeSuperadmin(ds, user, args.notes, args.dryRun);
    }
  } catch (error) {
    logger.error(`Operation failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
