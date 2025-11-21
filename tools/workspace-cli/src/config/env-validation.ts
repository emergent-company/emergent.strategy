import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RequiredEnvVar {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

export interface EnvFileIssue {
  readonly type: 'warning' | 'error';
  readonly file: string;
  readonly variable: string;
  readonly message: string;
}

export interface EnvOrganizationResult {
  readonly valid: boolean;
  readonly issues: readonly EnvFileIssue[];
}

const REQUIRED_ENV_VARS: readonly RequiredEnvVar[] = [
  {
    name: 'ADMIN_PORT',
    description: 'Admin UI port',
    required: true,
  },
  {
    name: 'SERVER_PORT',
    description: 'Server API port',
    required: true,
  },
  {
    name: 'POSTGRES_HOST',
    description: 'PostgreSQL host',
    required: true,
  },
  {
    name: 'POSTGRES_PORT',
    description: 'PostgreSQL port',
    required: true,
  },
  {
    name: 'POSTGRES_USER',
    description: 'PostgreSQL username',
    required: true,
  },
  {
    name: 'POSTGRES_PASSWORD',
    description: 'PostgreSQL password',
    required: true,
  },
  {
    name: 'POSTGRES_DB',
    description: 'PostgreSQL database name',
    required: true,
  },
] as const;

export interface ValidationResult {
  readonly valid: boolean;
  readonly missing: readonly RequiredEnvVar[];
}

export function validateRequiredEnvVars(): ValidationResult {
  const missing: RequiredEnvVar[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (envVar.required && !process.env[envVar.name]) {
      missing.push(envVar);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set. Please set it in your .env file.`
    );
  }

  return value;
}

export function printValidationErrors(
  missing: readonly RequiredEnvVar[]
): void {
  process.stderr.write('\n❌ Missing required environment variables:\n\n');

  for (const envVar of missing) {
    process.stderr.write(`  • ${envVar.name} - ${envVar.description}\n`);
  }

  process.stderr.write('\n💡 Please set these variables in your .env file\n');
  process.stderr.write('💡 See .env.example for reference\n\n');
}

/**
 * Check for common secrets patterns that should be in .env.local instead of .env
 */
function detectSecretsInFile(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const secretsFound: string[] = [];

  // Common secret patterns
  const secretPatterns = [
    { pattern: /^[A-Z_]+API_KEY=AIza/m, name: 'Google API Key (AIza...)' },
    { pattern: /^[A-Z_]+API_KEY=lsv2_pt_/m, name: 'LangSmith API Key' },
    { pattern: /^[A-Z_]+JWT=eyJhbGc/m, name: 'JWT Token' },
    {
      pattern: /^[A-Z_]+SECRET=[^y][^o][^u][^r]-/m,
      name: 'Secret (non-placeholder)',
    },
    { pattern: /^[A-Z_]+TOKEN=[A-Za-z0-9]{32,}/m, name: 'Long Token' },
  ];

  for (const { pattern, name } of secretPatterns) {
    if (pattern.test(content)) {
      secretsFound.push(name);
    }
  }

  return secretsFound;
}

/**
 * Check for server-specific variables in root .env
 */
function detectMisplacedVariables(
  filePath: string,
  scope: 'root' | 'server' | 'admin'
): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const misplaced: string[] = [];

  if (scope === 'root') {
    // Server variables that should be in apps/server/.env
    const serverVars = [
      'POSTGRES_HOST',
      'POSTGRES_PORT',
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_DB',
      'GOOGLE_API_KEY',
      'VERTEX_AI_',
      'EXTRACTION_',
      'LANGSMITH_',
      'ZITADEL_CLIENT_JWT',
      'DB_AUTOINIT',
      'EMBEDDING_',
      'CHAT_MODEL_',
    ];

    for (const varPrefix of serverVars) {
      const regex = new RegExp(`^${varPrefix}`, 'm');
      if (regex.test(content)) {
        misplaced.push(varPrefix);
      }
    }
  }

  return misplaced;
}

/**
 * Validate environment file organization
 */
export function validateEnvOrganization(): EnvOrganizationResult {
  const issues: EnvFileIssue[] = [];
  const repoRoot = process.cwd();

  // Check root .env for secrets
  const rootEnvPath = resolve(repoRoot, '.env');
  const secretsInRootEnv = detectSecretsInFile(rootEnvPath);
  for (const secret of secretsInRootEnv) {
    issues.push({
      type: 'error',
      file: '.env',
      variable: secret,
      message:
        'Secret detected in committed .env file - should be in .env.local',
    });
  }

  // Check server .env for secrets
  const serverEnvPath = resolve(repoRoot, 'apps/server/.env');
  const secretsInServerEnv = detectSecretsInFile(serverEnvPath);
  for (const secret of secretsInServerEnv) {
    issues.push({
      type: 'error',
      file: 'apps/server/.env',
      variable: secret,
      message: 'Secret detected - should be in apps/server/.env.local',
    });
  }

  // Check for misplaced server variables in root .env
  const misplacedInRoot = detectMisplacedVariables(rootEnvPath, 'root');
  for (const varPrefix of misplacedInRoot) {
    issues.push({
      type: 'warning',
      file: '.env',
      variable: varPrefix,
      message: 'Server variable in root .env - should be in apps/server/.env',
    });
  }

  // Check if .env.local exists and recommend it for secrets
  const rootEnvLocalPath = resolve(repoRoot, '.env.local');
  const serverEnvLocalPath = resolve(repoRoot, 'apps/server/.env.local');

  if (!existsSync(rootEnvLocalPath) && !existsSync(serverEnvLocalPath)) {
    issues.push({
      type: 'warning',
      file: '.env.local',
      variable: 'N/A',
      message:
        'No .env.local files found - create them for secrets and local overrides',
    });
  }

  return {
    valid: issues.filter((i) => i.type === 'error').length === 0,
    issues,
  };
}

/**
 * Print environment organization issues
 */
export function printEnvOrganizationIssues(
  result: EnvOrganizationResult
): void {
  if (result.issues.length === 0) {
    return;
  }

  const errors = result.issues.filter((i) => i.type === 'error');
  const warnings = result.issues.filter((i) => i.type === 'warning');

  if (errors.length > 0) {
    process.stderr.write('\n❌ Environment file errors:\n\n');
    for (const issue of errors) {
      process.stderr.write(`  • ${issue.file}: ${issue.variable}\n`);
      process.stderr.write(`    ${issue.message}\n`);
    }
  }

  if (warnings.length > 0) {
    process.stderr.write('\n⚠️  Environment file warnings:\n\n');
    for (const issue of warnings) {
      process.stderr.write(`  • ${issue.file}: ${issue.variable}\n`);
      process.stderr.write(`    ${issue.message}\n`);
    }
  }

  process.stderr.write(
    '\n💡 See docs/guides/ENVIRONMENT_VARIABLE_MIGRATION.md for help\n'
  );
  process.stderr.write('💡 Quick fix: Move secrets to .env.local files\n\n');
}
