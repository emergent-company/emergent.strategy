import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { listEnvironmentProfiles } from '../config/env-profiles.js';
import {
  getApplicationProcess,
  listApplicationProcesses,
  listDefaultApplicationProcesses,
} from '../config/application-processes.js';
import { listDefaultDependencyProcesses } from '../config/dependency-processes.js';
import type {
  EnvironmentProfile,
  EnvironmentProfileId,
} from '../config/types.js';
import { getProcessStatus } from '../process/manager.js';
import { WorkspaceCliError } from '../errors.js';
import { parseCliArgs } from '../utils/parse-args.js';

const execFileAsync = promisify(execFile);

const MIN_NODE_VERSION = { major: 20, minor: 19 } as const;
const ROOT_DIR = path.resolve(process.cwd());

// Infrastructure services are managed externally via emergent-infra
// No ports need to be checked/blocked by workspace-cli
const DEPENDENCY_PORT_MAP: Record<string, readonly number[]> = {
  // postgres: managed by emergent-infra/postgres (port 5432)
  // zitadel: managed by emergent-infra/zitadel (port 8080)
};

interface PortConflict {
  readonly serviceId: string;
  readonly port: number;
  readonly type: 'application' | 'dependency';
}

interface EnvWarning {
  readonly message: string;
}

export async function runPreflightChecks(
  command: string,
  argv: readonly string[]
): Promise<void> {
  const args = parseCliArgs(argv);
  const profile = resolveProfile(args.profile);

  // Ensure NAMESPACE is set before proceeding
  ensureNamespaceSet();

  await ensureHostTooling(
    command,
    profile,
    args.includeDependencies ||
      args.dependenciesOnly ||
      args.all ||
      args.workspace
  );

  const warnings: EnvWarning[] = await collectEnvWarnings(command);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      process.stdout.write(`⚠️  ${warning.message}\n`);
    }
  }

  if (command === 'start' || command === 'restart') {
    await enforcePortAvailability(command, argv, profile);
  }
}

/**
 * Run validation checks after dependencies are started
 * Should be called from start-service.ts after dependencies start
 */
export async function runPostDependencyValidations(): Promise<void> {
  process.stdout.write('🔍 Validating configuration...\n');

  // Check 1: Database schema validation
  await validateDatabaseSchema();

  // Check 2: Zitadel auth configuration
  await validateZitadelConfiguration();

  process.stdout.write('✅ All validations passed\n\n');
}

async function runStartupValidations(): Promise<void> {
  process.stdout.write('🔍 Running startup validation checks...\n');

  // Check 1: Database schema validation
  await validateDatabaseSchema();

  // Check 2: Zitadel auth configuration
  await validateZitadelConfiguration();

  process.stdout.write('✅ All validation checks passed\n\n');
}

async function validateDatabaseSchema(): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(execFile);

  // Retry validation up to 5 times with delays (database might still be starting)
  const maxRetries = 5;
  const retryDelay = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await execAsync('npx', ['tsx', 'scripts/validate-schema.ts'], {
        cwd: ROOT_DIR,
        env: process.env,
        timeout: 30000,
      });

      // Validation passed
      process.stdout.write('  ✓ Database schema validated\n');
      return;
    } catch (error: any) {
      // Check if it's a connection error (database not ready yet)
      const errorOutput = (
        error.stderr ||
        error.stdout ||
        error.message ||
        ''
      ).toString();
      const isConnectionError =
        errorOutput.includes('ECONNREFUSED') ||
        errorOutput.includes('Connection refused') ||
        errorOutput.includes('connect ECONNREFUSED') ||
        error.code === 'ECONNREFUSED';

      if (isConnectionError && attempt < maxRetries) {
        process.stdout.write(
          `  ⏳ Database not ready, waiting ${
            retryDelay / 1000
          }s (attempt ${attempt}/${maxRetries})...\n`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }

      // Check if it's an exit code 2 (fatal error from validation script)
      if (error.code === 2 && attempt < maxRetries) {
        // Could be connection error, retry
        process.stdout.write(
          `  ⏳ Database not ready, waiting ${
            retryDelay / 1000
          }s (attempt ${attempt}/${maxRetries})...\n`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }

      // Validation failed or max retries exceeded
      throw new WorkspaceCliError(
        'PRECHECK_DATABASE_SCHEMA_INVALID',
        'Database schema validation failed. Critical tables are missing or incomplete.',
        {
          recommendation:
            'Run: npm run db:validate to see details, then npm run db:fix to repair schema',
        }
      );
    }
  }
}

async function validateZitadelConfiguration(): Promise<void> {
  const zitadelDomain = process.env.ZITADEL_DOMAIN;
  const zitadelIssuer = process.env.ZITADEL_ISSUER;
  const oauthClientId =
    process.env.ZITADEL_OAUTH_CLIENT_ID ||
    process.env.ZITADEL_CLIENT_ID ||
    process.env.VITE_ZITADEL_CLIENT_ID;

  if (!zitadelDomain) {
    throw new WorkspaceCliError(
      'PRECHECK_ZITADEL_CONFIG_MISSING',
      'ZITADEL_DOMAIN not set. Configure via Infisical or .env file.',
      {
        recommendation:
          'Set ZITADEL_DOMAIN in Infisical (dev/server) or add to .env (e.g., ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai)',
      }
    );
  }

  if (!oauthClientId) {
    throw new WorkspaceCliError(
      'PRECHECK_ZITADEL_CONFIG_MISSING',
      'OAuth client ID not set. ZITADEL_OAUTH_CLIENT_ID required.',
      {
        recommendation:
          'Run bootstrap in emergent-infra/zitadel: ./scripts/bootstrap.sh',
      }
    );
  }

  // Check if Zitadel is reachable (with retries)
  // NOTE: Zitadel is managed externally via emergent-infra/zitadel
  const maxRetries = 6;
  const retryDelay = 5000; // 5 seconds
  let lastError: any = null;

  // Use ZITADEL_ISSUER if set (includes https://), otherwise construct from domain
  const baseUrl = zitadelIssuer || `https://${zitadelDomain}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${baseUrl}/debug/ready`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if (attempt < maxRetries) {
          process.stdout.write(
            `  ⏳ Zitadel not ready (HTTP ${response.status}), waiting ${
              retryDelay / 1000
            }s (attempt ${attempt}/${maxRetries})...\n`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        throw new WorkspaceCliError(
          'PRECHECK_ZITADEL_NOT_READY',
          `Zitadel is not ready at ${baseUrl} (HTTP ${response.status})`,
          {
            recommendation:
              'Check Zitadel: cd ../emergent-infra/zitadel && ./scripts/health-check.sh',
          }
        );
      }

      process.stdout.write('  ✓ Zitadel is reachable and ready\n');
      break;
    } catch (error: any) {
      lastError = error;

      if (
        error.name === 'AbortError' ||
        error.cause?.code === 'ECONNREFUSED' ||
        error.message?.includes('fetch failed')
      ) {
        if (attempt < maxRetries) {
          process.stdout.write(
            `  ⏳ Zitadel not ready, waiting ${
              retryDelay / 1000
            }s (attempt ${attempt}/${maxRetries})...\n`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
      }

      if (error instanceof WorkspaceCliError) {
        throw error;
      }

      throw new WorkspaceCliError(
        'PRECHECK_ZITADEL_UNREACHABLE',
        `Cannot reach Zitadel at ${baseUrl} after ${maxRetries} attempts: ${error.message}`,
        {
          recommendation:
            'Check Zitadel: cd ../emergent-infra/zitadel && ./scripts/health-check.sh',
        }
      );
    }
  }

  // Quick OAuth app validation
  try {
    const oauthBaseUrl = zitadelIssuer || `https://${zitadelDomain}`;
    const testUrl = `${oauthBaseUrl}/oauth/v2/authorize?response_type=code&client_id=${oauthClientId}&redirect_uri=http://localhost:5176/auth/callback&scope=openid&code_challenge=test&code_challenge_method=S256`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(testUrl, {
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 400) {
      const body = (await response.json()) as any;
      if (
        body.error === 'invalid_request' &&
        body.error_description?.includes('NotFound')
      ) {
        throw new WorkspaceCliError(
          'PRECHECK_OAUTH_APP_NOT_FOUND',
          `OAuth client ID ${oauthClientId} not found in Zitadel.`,
          {
            recommendation:
              'Run bootstrap in emergent-infra/zitadel: ./scripts/bootstrap.sh',
          }
        );
      }
    }

    process.stdout.write('  ✓ OAuth configuration validated\n');
  } catch (error: any) {
    if (error instanceof WorkspaceCliError) {
      throw error;
    }
    // Don't fail on OAuth validation errors, just warn
    process.stdout.write(
      `  ⚠️  Could not verify OAuth app: ${error.message}\n`
    );
  }
}

function ensureNamespaceSet(): void {
  const namespace = process.env.NAMESPACE;

  if (!namespace || namespace.trim().length === 0) {
    throw new WorkspaceCliError(
      'PRECHECK_NAMESPACE_MISSING',
      'NAMESPACE environment variable is not set. This is required for process management.',
      {
        recommendation:
          'Set NAMESPACE in your .env file (e.g., NAMESPACE=spec-server-2). See .env.example for reference.',
      }
    );
  }
}

function resolveProfile(profileId: EnvironmentProfileId): EnvironmentProfile {
  const profile = listEnvironmentProfiles().find(
    (candidate) => candidate.profileId === profileId
  );

  if (!profile) {
    const available = listEnvironmentProfiles()
      .map((candidate) => candidate.profileId)
      .join(', ');
    throw new WorkspaceCliError(
      'PRECHECK_UNKNOWN_PROFILE',
      `Environment profile "${profileId}" is not registered. Available profiles: ${available}.`,
      {
        profile: profileId,
        recommendation:
          'Pass --profile with one of the registered environment profiles.',
      }
    );
  }

  return profile;
}

async function ensureHostTooling(
  command: string,
  profile: EnvironmentProfile,
  dependenciesRequested: boolean
): Promise<void> {
  if (profile.hostRequirements.includes('node')) {
    ensureNodeVersion();
  }

  const needsDocker =
    dependenciesRequested ||
    profile.hostRequirements.includes('docker') ||
    new Set(['start', 'restart', 'stop', 'status', 'logs']).has(command);

  if (needsDocker) {
    await ensureBinaryAvailable(
      'docker',
      ['--version'],
      'Docker CLI',
      'Install Docker Desktop or docker CLI'
    );
  }
}

function ensureNodeVersion(): void {
  const [majorStr, minorStr] = process.versions.node.split('.', 3);
  const major = Number.parseInt(majorStr ?? '0', 10);
  const minor = Number.parseInt(minorStr ?? '0', 10);

  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return;
  }

  if (
    major < MIN_NODE_VERSION.major ||
    (major === MIN_NODE_VERSION.major && minor < MIN_NODE_VERSION.minor)
  ) {
    throw new WorkspaceCliError(
      'PRECHECK_NODE_VERSION_UNSUPPORTED',
      `Node.js ${MIN_NODE_VERSION.major}.${MIN_NODE_VERSION.minor}+ is required. Current version: ${process.versions.node}.`,
      {
        recommendation:
          'Upgrade to Node.js 20.19 or later before running workspace commands.',
      }
    );
  }
}

async function ensureBinaryAvailable(
  binary: string,
  args: readonly string[],
  friendlyName: string,
  installHint: string
): Promise<void> {
  try {
    await execFileAsync(binary, [...args]);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === 'ENOENT') {
      throw new WorkspaceCliError(
        'PRECHECK_TOOL_MISSING',
        `${friendlyName} is not available on PATH (missing executable: ${binary}).`,
        {
          recommendation: `Install the tool and retry. Example: ${installHint}`,
        }
      );
    }

    throw new WorkspaceCliError(
      'PRECHECK_TOOL_FAILED',
      `${friendlyName} check failed while running \\"${binary} ${args.join(
        ' '
      )}\\": ${nodeError.message}`,
      {
        recommendation: `Verify the ${friendlyName} installation before retrying.`,
      }
    );
  }
}

async function collectEnvWarnings(command: string): Promise<EnvWarning[]> {
  const warnings: EnvWarning[] = [];

  if (!new Set(['start', 'restart', 'setup', 'logs', 'status']).has(command)) {
    return warnings;
  }

  const rootEnvPath = path.join(ROOT_DIR, '.env');
  if (!existsSync(rootEnvPath)) {
    warnings.push({
      message:
        'Root .env file not found. Copy .env.example to .env and supply database and Zitadel settings.',
    });
  }

  const adminEnvPath = path.join(ROOT_DIR, 'apps', 'admin', '.env');
  if (!existsSync(adminEnvPath)) {
    warnings.push({
      message:
        'Admin SPA .env file missing. Copy apps/admin/.env.example to apps/admin/.env and configure Zitadel client details.',
    });
  }

  // Check for stale compiled config files that could override TypeScript configs
  const staleConfigWarnings = await checkForStaleConfigFiles();
  warnings.push(...staleConfigWarnings);

  return warnings;
}

/**
 * Check for stale .js config files that might override .ts configs.
 * Vite loads .js before .ts, so a stale .js can cause unexpected behavior.
 */
async function checkForStaleConfigFiles(): Promise<EnvWarning[]> {
  const warnings: EnvWarning[] = [];
  
  const configPairs = [
    { ts: 'apps/admin/vite.config.ts', js: 'apps/admin/vite.config.js' },
    { ts: 'apps/admin/vite-plugin-infisical.ts', js: 'apps/admin/vite-plugin-infisical.js' },
  ];

  for (const { ts, js } of configPairs) {
    const tsPath = path.join(ROOT_DIR, ts);
    const jsPath = path.join(ROOT_DIR, js);

    if (existsSync(tsPath) && existsSync(jsPath)) {
      warnings.push({
        message: `Stale ${js} found alongside ${ts}. Vite loads .js first, which may cause unexpected behavior. Delete ${js}`,
      });
    }
  }

  return warnings;
}

async function envFileContains(
  filePath: string,
  key: string
): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('#') || line.length === 0) {
        continue;
      }

      const [entryKey] = line.split('=', 1);
      if (entryKey?.trim() === key) {
        return true;
      }
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return false;
    }
  }

  return false;
}

async function enforcePortAvailability(
  command: string,
  argv: readonly string[],
  profile: EnvironmentProfile
): Promise<void> {
  const args = parseCliArgs(argv);
  const includeDependencies =
    args.includeDependencies ||
    args.dependenciesOnly ||
    args.all ||
    args.workspace;
  const includeServices = !args.dependenciesOnly;
  const services = resolveTargetServices(args, includeServices);
  const dependencies = resolveTargetDependencies(args, includeDependencies);

  // First, clean up any orphan processes on our ports
  await cleanupOrphanProcesses(services, dependencies);

  const conflicts: PortConflict[] = [];

  for (const serviceId of services) {
    const ports = getServicePortHints(serviceId);

    for (const port of ports) {
      if (await portInUseByForeignProcess(serviceId, port, 'application')) {
        conflicts.push({ serviceId, port, type: 'application' });
      }
    }
  }

  for (const dependencyId of dependencies) {
    const ports = DEPENDENCY_PORT_MAP[dependencyId] ?? [];

    for (const port of ports) {
      if (
        await portInUseByForeignProcess(
          `${dependencyId}-dependency`,
          port,
          'dependency'
        )
      ) {
        conflicts.push({ serviceId: dependencyId, port, type: 'dependency' });
      }
    }
  }

  if (conflicts.length > 0) {
    const lines = conflicts.map(
      (conflict) =>
        `  • ${conflict.type} "${conflict.serviceId}" requires port ${conflict.port}`
    );
    throw new WorkspaceCliError(
      'PRECHECK_PORT_IN_USE',
      `Required ports are already in use:\n${lines.join('\n')}`,
      {
        recommendation:
          'Stop the conflicting processes (lsof -ti:<port> | xargs kill -9) or adjust workspace configuration before retrying.',
        profile: profile.profileId,
      }
    );
  }
}

/**
 * Clean up orphan processes that may be holding onto our ports.
 * This handles cases where child processes (like vite or ts-node-dev) 
 * became orphaned when their parent npm process died.
 */
async function cleanupOrphanProcesses(
  services: readonly string[],
  dependencies: readonly string[]
): Promise<void> {
  const portsToClean: number[] = [];

  for (const serviceId of services) {
    const status = await getProcessStatus(serviceId);
    // If we think it's stopped but port might be in use, clean it
    if (!status.running) {
      const ports = getServicePortHints(serviceId);
      portsToClean.push(...ports);
    }
  }

  for (const dependencyId of dependencies) {
    const ports = DEPENDENCY_PORT_MAP[dependencyId] ?? [];
    portsToClean.push(...ports);
  }

  if (portsToClean.length === 0) {
    return;
  }

  // Kill any processes on these ports
  for (const port of portsToClean) {
    if (await isPortInUse(port)) {
      try {
        await execFileAsync('sh', ['-c', `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`]);
        // Wait a moment for the process to die
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        // Ignore errors - the port might already be free
      }
    }
  }
}

function resolveTargetServices(
  args: ReturnType<typeof parseCliArgs>,
  includeServices: boolean
): readonly string[] {
  if (!includeServices) {
    return [];
  }

  if (args.services.length > 0) {
    return args.services;
  }

  if (args.workspace || args.all) {
    return listDefaultApplicationProcesses().map(
      (profile) => profile.processId
    );
  }

  return listDefaultApplicationProcesses().map((profile) => profile.processId);
}

function resolveTargetDependencies(
  args: ReturnType<typeof parseCliArgs>,
  includeDependencies: boolean
): readonly string[] {
  if (!includeDependencies) {
    return [];
  }

  if (args.dependencies.length > 0) {
    return args.dependencies;
  }

  return listDefaultDependencyProcesses().map(
    (profile) => profile.dependencyId
  );
}

function getServicePortHints(serviceId: string): readonly number[] {
  try {
    const profile = getApplicationProcess(serviceId);
    const url = profile.healthCheck?.url;

    if (!url) {
      return [];
    }

    try {
      const parsed = new URL(url);
      if (parsed.port) {
        return [Number.parseInt(parsed.port, 10)];
      }

      if (parsed.protocol === 'http:') {
        return [80];
      }

      if (parsed.protocol === 'https:') {
        return [443];
      }
    } catch {
      return [];
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkspaceCliError(
      'PRECHECK_UNKNOWN_SERVICE',
      `Unable to resolve service "${serviceId}": ${message}`
    );
  }

  return [];
}

async function portInUseByForeignProcess(
  processName: string,
  port: number,
  type: 'application' | 'dependency'
): Promise<boolean> {
  // Check if process is managed by our PID system
  const status = await getProcessStatus(processName);

  if (status.running && status.pid) {
    // Port belongs to a running managed process; treat as expected.
    return false;
  }

  return await isPortInUse(port);
}

async function safeDescribeProcess(name: string) {
  try {
    return await getProcessStatus(name);
  } catch (error) {
    // If process status check fails, bubble up as workspace error
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkspaceCliError(
      'PRECHECK_PROCESS_QUERY_FAILED',
      `Failed to query process "${name}": ${message}`
    );
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.unref();

    tester.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(true);
        return;
      }

      reject(error);
    });

    tester.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      tester.close(() => {
        resolve(false);
      });
    });
  });
}
