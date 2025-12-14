/**
 * Configuration
 *
 * Reads environment variables and provides typed configuration.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  testUserEmail: string;
  testUserPassword: string;
  zitadelIssuer: string;
  zitadelClientId: string;
  serverUrl: string;
  debug: boolean;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return (
    process.env.API_CLIENT_DEBUG === 'true' || process.env.DEBUG === 'true'
  );
}

/**
 * Log debug message (only if debug is enabled)
 */
export function debug(
  component: string,
  message: string,
  data?: unknown
): void {
  if (!isDebugEnabled()) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [api-client:${component}]`;

  if (data !== undefined) {
    console.error(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.error(`${prefix} ${message}`);
  }
}

let cachedConfig: Config | null = null;

/**
 * Load environment variables from .env files
 */
function loadEnvFiles(): void {
  // From src/ -> api-client-mcp/ -> tools/ -> emergent/
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

  // Load .env first, then .env.local (which overrides)
  const envFiles = [
    path.join(workspaceRoot, '.env'),
    path.join(workspaceRoot, '.env.local'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        // Remove quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Only set if not already set (allows actual env vars to take precedence)
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

/**
 * Get required environment variable or throw
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Get configuration (loads from env files on first call)
 */
export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load env files
  loadEnvFiles();

  // Build server URL from port or use explicit value
  const serverPort = optionalEnv('SERVER_PORT', '3002');
  const defaultServerUrl = `http://localhost:${serverPort}`;

  cachedConfig = {
    testUserEmail: requireEnv('TEST_USER_EMAIL'),
    testUserPassword: requireEnv('TEST_USER_PASSWORD'),
    zitadelIssuer: requireEnv('ZITADEL_ISSUER'),
    zitadelClientId: requireEnv('ZITADEL_OAUTH_CLIENT_ID'),
    serverUrl: optionalEnv('SERVER_URL', defaultServerUrl),
    debug: isDebugEnabled(),
  };

  debug('config', 'Configuration loaded', {
    testUserEmail: cachedConfig.testUserEmail,
    zitadelIssuer: cachedConfig.zitadelIssuer,
    zitadelClientId: cachedConfig.zitadelClientId,
    serverUrl: cachedConfig.serverUrl,
    debug: cachedConfig.debug,
    // Note: password is intentionally not logged
  });

  return cachedConfig;
}

/**
 * Validate configuration on startup
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    loadEnvFiles();
  } catch {
    errors.push('Failed to load .env files');
  }

  const required = [
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD',
    'ZITADEL_ISSUER',
    'ZITADEL_OAUTH_CLIENT_ID',
  ];

  for (const name of required) {
    if (!process.env[name]) {
      errors.push(`Missing required environment variable: ${name}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Clear cached config (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
