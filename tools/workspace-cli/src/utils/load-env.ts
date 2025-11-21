import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

/**
 * Parse and load environment variables from a file
 */
function loadEnvFile(filePath: string): void {
  const envContent = readFileSync(filePath, 'utf-8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE format
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // ALWAYS set the value from .env files (override existing env vars)
      // This ensures .env files take precedence over shell environment
      process.env[key] = value;
    }
  }
}

/**
 * Load environment variables from .env and .env.local files in the repository root.
 * This must be called before any other modules that depend on environment variables.
 *
 * Loading order (later files override earlier ones):
 * 1. .env - Base configuration (committed to git)
 * 2. .env.local - Local overrides (gitignored)
 *
 * @returns Path to the base .env file that was loaded, or null if not found
 */
export function loadEnvironmentVariables(): string | null {
  // Find the repository root by looking for .env file
  // Start from the CLI directory and go up until we find it
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  let currentDir = resolve(__dirname, '..', '..', '..', '..'); // Go to repo root
  const envPath = resolve(currentDir, '.env');
  const envLocalPath = resolve(currentDir, '.env.local');

  if (!existsSync(envPath)) {
    process.stderr.write(`⚠️  Warning: .env file not found at ${envPath}\n`);
    return null;
  }

  try {
    // Load base .env file first
    loadEnvFile(envPath);

    // Load .env.local if it exists (overrides .env)
    if (existsSync(envLocalPath)) {
      loadEnvFile(envLocalPath);
    }

    return envPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`⚠️  Warning: Failed to load .env file: ${message}\n`);
    return null;
  }
}
