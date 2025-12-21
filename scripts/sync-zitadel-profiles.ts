#!/usr/bin/env tsx
/**
 * Sync user profiles from Zitadel
 *
 * This script fetches user details from Zitadel for users that have
 * incomplete profiles (missing name/email) and updates them locally.
 *
 * Only works for real Zitadel users (numeric IDs), not test users.
 *
 * Usage:
 *   npx tsx scripts/sync-zitadel-profiles.ts [--dry-run]
 */

import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { getDbConfig } from './lib/env-validator.js';

// Load .env files early (allow override via DOTENV_PATH)
// Note: dotenv doesn't override by default, so load in reverse priority order
// (highest priority last with override: true)
(() => {
  // Load infrastructure env files first (if available)
  const infraPostgresEnv = path.resolve(
    process.cwd(),
    '../emergent-infra/postgres/.env'
  );
  const infraZitadelEnv = path.resolve(
    process.cwd(),
    '../emergent-infra/zitadel/.env'
  );
  const infraZitadelLocalEnv = path.resolve(
    process.cwd(),
    '../emergent-infra/zitadel/.env.local'
  );

  // Load in order (later files override earlier)
  for (const envFile of [
    infraPostgresEnv,
    infraZitadelEnv,
    infraZitadelLocalEnv,
  ]) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: true });
      console.log(`[sync-profiles] Loaded ${envFile}`);
    }
  }

  // Load workspace env files (these override infra)
  const envPath =
    process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    console.log(`[sync-profiles] Loaded ${envPath}`);
  }

  // .env.local has highest priority
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
    console.log(`[sync-profiles] Loaded ${envLocalPath}`);
  }
})();

interface ZitadelUser {
  id: string;
  state: string;
  userName: string;
  preferredLoginName?: string;
  email?: string;
  emailVerified?: boolean;
  profile?: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
  };
}

/**
 * Fetch user from Zitadel Management API
 */
async function fetchZitadelUser(
  zitadelUserId: string,
  accessToken: string
): Promise<ZitadelUser | null> {
  const baseUrl =
    process.env.ZITADEL_ISSUER || `https://${process.env.ZITADEL_DOMAIN}`;
  const apiUrl = `${baseUrl}/management/v1/users/${zitadelUserId}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-zitadel-orgid': process.env.ZITADEL_MAIN_ORG_ID || '',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  User not found in Zitadel: ${zitadelUserId}`);
        return null;
      }
      const errorText = await response.text();
      throw new Error(`Failed to get user (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const user = data.user;

    if (!user) {
      return null;
    }

    return {
      id: user.id || zitadelUserId,
      state: user.state || 'UNKNOWN',
      userName: user.userName || user.preferredLoginName || '',
      preferredLoginName: user.preferredLoginName,
      email: user.human?.email?.email,
      emailVerified: user.human?.email?.isEmailVerified,
      profile: user.human?.profile
        ? {
            firstName: user.human.profile.firstName,
            lastName: user.human.profile.lastName,
            displayName: user.human.profile.displayName,
          }
        : undefined,
    };
  } catch (error) {
    console.error(
      `  Error fetching user ${zitadelUserId}: ${(error as Error).message}`
    );
    return null;
  }
}

/**
 * Get access token using service account JWT
 */
async function getAccessToken(): Promise<string> {
  const jose = await import('jose');
  const crypto = await import('crypto');

  // Load API service account key
  const apiJwt = process.env.ZITADEL_API_JWT;
  const apiJwtPath = process.env.ZITADEL_API_JWT_PATH;
  const clientJwt = process.env.ZITADEL_CLIENT_JWT;
  const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;

  let keyJson: string;
  if (apiJwt) {
    keyJson = apiJwt;
  } else if (apiJwtPath && fs.existsSync(apiJwtPath)) {
    keyJson = fs.readFileSync(apiJwtPath, 'utf-8');
  } else if (clientJwt) {
    keyJson = clientJwt;
  } else if (clientJwtPath && fs.existsSync(clientJwtPath)) {
    keyJson = fs.readFileSync(clientJwtPath, 'utf-8');
  } else {
    throw new Error(
      'No Zitadel service account key found (ZITADEL_API_JWT[_PATH] or ZITADEL_CLIENT_JWT[_PATH])'
    );
  }

  const serviceAccountKey = JSON.parse(keyJson);

  // Fix escape sequences in RSA key
  if (serviceAccountKey.key) {
    serviceAccountKey.key = serviceAccountKey.key
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }

  // Convert PKCS#1 to PKCS#8 if needed
  let keyToImport = serviceAccountKey.key;
  if (keyToImport.includes('BEGIN RSA PRIVATE KEY')) {
    const keyObject = crypto.createPrivateKey({
      key: keyToImport,
      format: 'pem',
      type: 'pkcs1',
    });
    keyToImport = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string;
  }

  const privateKey = await jose.importPKCS8(keyToImport, 'RS256');
  const baseUrl =
    process.env.ZITADEL_ISSUER || `https://${process.env.ZITADEL_DOMAIN}`;
  const issuer = serviceAccountKey.clientId || serviceAccountKey.userId;
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: serviceAccountKey.keyId })
    .setIssuer(issuer)
    .setSubject(issuer)
    .setAudience(baseUrl)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  // Exchange JWT for access token
  const tokenUrl = `${baseUrl}/oauth/v2/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
      scope: 'openid',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token request failed (${response.status}): ${errorText}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('[sync-profiles] DRY RUN MODE - no changes will be made\n');
  }

  const dbConfig = getDbConfig();
  const pool = new Pool(dbConfig);

  try {
    console.log('[sync-profiles] Connected to database');

    // Find users with incomplete profiles (no name or email)
    // Only consider real Zitadel users (numeric IDs, not test-user-* patterns)
    const incompleteUsers = await pool.query(`
      SELECT 
        up.id,
        up.zitadel_user_id,
        up.first_name,
        up.last_name,
        up.display_name,
        ue.email
      FROM core.user_profiles up
      LEFT JOIN core.user_emails ue ON up.id = ue.user_id
      WHERE up.deleted_at IS NULL
        AND up.zitadel_user_id NOT LIKE 'test-user-%'
        AND (
          up.first_name IS NULL 
          OR up.display_name IS NULL 
          OR ue.email IS NULL
        )
      ORDER BY up.created_at
    `);

    if (incompleteUsers.rows.length === 0) {
      console.log('\nNo users with incomplete profiles found.');
      return;
    }

    console.log(
      `\nFound ${incompleteUsers.rows.length} users with incomplete profiles:\n`
    );
    console.table(
      incompleteUsers.rows.map((r) => ({
        id: r.id.substring(0, 8) + '...',
        zitadel_user_id: r.zitadel_user_id,
        first_name: r.first_name || '(missing)',
        display_name: r.display_name || '(missing)',
        email: r.email || '(missing)',
      }))
    );

    // Get access token for Zitadel API
    console.log('\nFetching Zitadel access token...');
    const accessToken = await getAccessToken();
    console.log('Access token acquired.\n');

    // Process each user
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of incompleteUsers.rows) {
      console.log(`\nProcessing user: ${user.id}`);
      console.log(`  Zitadel ID: ${user.zitadel_user_id}`);

      const zitadelUser = await fetchZitadelUser(
        user.zitadel_user_id,
        accessToken
      );

      if (!zitadelUser) {
        console.log('  Skipped: User not found in Zitadel');
        skipped++;
        continue;
      }

      console.log(`  Zitadel state: ${zitadelUser.state}`);
      console.log(`  Email: ${zitadelUser.email || '(none)'}`);
      console.log(
        `  First name: ${zitadelUser.profile?.firstName || '(none)'}`
      );
      console.log(`  Last name: ${zitadelUser.profile?.lastName || '(none)'}`);
      console.log(
        `  Display name: ${zitadelUser.profile?.displayName || '(none)'}`
      );

      // Check if there's anything to update
      const needsProfileUpdate =
        (!user.first_name && zitadelUser.profile?.firstName) ||
        (!user.last_name && zitadelUser.profile?.lastName) ||
        (!user.display_name && zitadelUser.profile?.displayName);

      const needsEmailUpdate = !user.email && zitadelUser.email;

      if (!needsProfileUpdate && !needsEmailUpdate) {
        console.log('  Skipped: No new data available from Zitadel');
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log('  Would update:');
        if (needsProfileUpdate) {
          console.log(
            `    - Profile: first_name=${zitadelUser.profile?.firstName}, last_name=${zitadelUser.profile?.lastName}, display_name=${zitadelUser.profile?.displayName}`
          );
        }
        if (needsEmailUpdate) {
          console.log(`    - Email: ${zitadelUser.email}`);
        }
        updated++;
        continue;
      }

      try {
        // Update profile if needed
        if (needsProfileUpdate) {
          const updateFields: string[] = [];
          const updateValues: any[] = [];
          let paramIndex = 1;

          if (!user.first_name && zitadelUser.profile?.firstName) {
            updateFields.push(`first_name = $${paramIndex++}`);
            updateValues.push(zitadelUser.profile.firstName);
          }
          if (!user.last_name && zitadelUser.profile?.lastName) {
            updateFields.push(`last_name = $${paramIndex++}`);
            updateValues.push(zitadelUser.profile.lastName);
          }
          if (!user.display_name && zitadelUser.profile?.displayName) {
            updateFields.push(`display_name = $${paramIndex++}`);
            updateValues.push(zitadelUser.profile.displayName);
          }

          if (updateFields.length > 0) {
            updateFields.push(`updated_at = NOW()`);
            updateValues.push(user.id);

            await pool.query(
              `UPDATE core.user_profiles SET ${updateFields.join(
                ', '
              )} WHERE id = $${paramIndex}`,
              updateValues
            );
            console.log('  Updated profile');
          }
        }

        // Insert email if needed
        if (needsEmailUpdate && zitadelUser.email) {
          const normalizedEmail = zitadelUser.email.trim().toLowerCase();

          // Check if email already exists for another user
          const existingEmail = await pool.query(
            `SELECT user_id FROM core.user_emails WHERE email = $1`,
            [normalizedEmail]
          );

          if (existingEmail.rows.length > 0) {
            console.log(
              `  Warning: Email ${normalizedEmail} already exists for another user`
            );
          } else {
            await pool.query(
              `INSERT INTO core.user_emails (user_id, email, verified) VALUES ($1, $2, $3)`,
              [user.id, normalizedEmail, zitadelUser.emailVerified || false]
            );
            console.log(`  Added email: ${normalizedEmail}`);
          }
        }

        updated++;
      } catch (error) {
        console.error(`  Error updating user: ${(error as Error).message}`);
        failed++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
