import process from 'node:process';

export interface RequiredEnvVar {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
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
