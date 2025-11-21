#!/usr/bin/env node
/**
 * Get Access Token from Zitadel using Service Account
 *
 * This script uses the JWT Bearer grant flow to obtain an access token
 * from Zitadel using a service account.
 *
 * Usage:
 *   node scripts/get-access-token.mjs
 *
 * Environment variables:
 *   ZITADEL_ISSUER - Zitadel issuer URL (default: http://localhost:8200)
 *   SERVICE_ACCOUNT_PATH - Path to service account JSON (default: ./secrets/zitadel-api-service-account.json)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createSign } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ZITADEL_ISSUER = process.env.ZITADEL_ISSUER || 'http://localhost:8200';
const SERVICE_ACCOUNT_PATH =
  process.env.SERVICE_ACCOUNT_PATH ||
  path.resolve(__dirname, '..', 'secrets', 'zitadel-api-service-account.json');

/**
 * Base64 URL encode
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create JWT assertion for JWT Bearer grant
 */
function createJWTAssertion(serviceAccount, audience) {
  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    alg: 'RS256',
    kid: serviceAccount.keyId,
    typ: 'JWT',
  };

  // JWT Payload
  const payload = {
    iss: serviceAccount.userId,
    sub: serviceAccount.userId,
    aud: audience,
    iat: now,
    exp: now + 3600, // 1 hour
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with RS256
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();

  const signature = sign.sign(serviceAccount.key, 'base64');
  const encodedSignature = signature
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Get access token using JWT Bearer grant
 */
async function getAccessToken() {
  try {
    // Load service account
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.error(
        `Error: Service account file not found: ${SERVICE_ACCOUNT_PATH}`
      );
      console.error('\nExpected file format:');
      console.error(
        JSON.stringify(
          {
            type: 'serviceaccount',
            keyId: '...',
            key: '-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----\\n',
            userId: '...',
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const serviceAccount = JSON.parse(
      fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')
    );

    if (
      !serviceAccount.keyId ||
      !serviceAccount.key ||
      !serviceAccount.userId
    ) {
      console.error('Error: Invalid service account format');
      process.exit(1);
    }

    console.error('=== Getting Access Token from Zitadel ===\n');
    console.error(`Zitadel Issuer: ${ZITADEL_ISSUER}`);
    console.error(`Service Account: ${serviceAccount.userId}`);
    console.error(`Key ID: ${serviceAccount.keyId}\n`);

    // Create JWT assertion
    const audience = ZITADEL_ISSUER;
    const assertion = createJWTAssertion(serviceAccount, audience);

    // Request access token
    const tokenUrl = `${ZITADEL_ISSUER}/oauth/v2/token`;
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion,
      scope: 'openid profile email urn:zitadel:iam:org:project:id:zitadel:aud',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: Failed to get access token: ${response.status}`);
      console.error(error);
      process.exit(1);
    }

    const data = await response.json();

    console.error('✅ Access token obtained successfully\n');
    console.error(`Token type: ${data.token_type}`);
    console.error(`Expires in: ${data.expires_in} seconds`);
    console.error(`Scopes: ${data.scope}\n`);

    // Output just the token to stdout for easy piping
    console.log(data.access_token);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

getAccessToken();
