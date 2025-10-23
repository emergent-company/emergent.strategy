import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import {
  getApplicationProcess,
  listDefaultApplicationProcesses,
  resolveEnvironmentOverrides
} from '../config/application-processes.js';
import { getEnvironmentProfile } from '../config/env-profiles.js';
import {
  getDependencyNamespace,
  getDependencyProcess,
  listDefaultDependencyProcesses
} from '../config/dependency-processes.js';
import type {
  ApplicationProcessProfile,
  DependencyProcessProfile,
  EnvironmentProfileId
} from '../config/types.js';
import {
  describeProcess,
  reloadProcess,
  startProcess,
  type StartProcessOptions
} from '../pm2/client.js';
import { parseCliArgs } from '../utils/parse-args.js';
import { waitForProcessStability } from './lifecycle-utils.js';

const require = createRequire(import.meta.url);

interface EcosystemProcessConfig {
  readonly name: string;
  readonly namespace?: string;
  readonly script: string;
  readonly args?: string | readonly string[];
  readonly cwd?: string;
  readonly max_restarts?: number;
  readonly min_uptime?: number;
  readonly restart_delay?: number;
  readonly exp_backoff_restart_delay?: number;
  readonly out_file?: string;
  readonly error_file?: string;
  readonly merge_logs?: boolean;
  readonly log_date_format?: string;
  readonly autorestart?: boolean;
  readonly env?: Record<string, string>;
  readonly env_development?: Record<string, string>;
  readonly env_staging?: Record<string, string>;
  readonly env_production?: Record<string, string>;
}

interface EcosystemModule {
  readonly apps: readonly EcosystemProcessConfig[];
}

const ecosystemModule = require('../../pm2/ecosystem.apps.cjs') as EcosystemModule;

interface DependencyEcosystemProcessConfig extends EcosystemProcessConfig { }

interface DependencyEcosystemModule {
  readonly apps: readonly DependencyEcosystemProcessConfig[];
}

const dependencyEcosystemModule = require('../../pm2/ecosystem.dependencies.cjs') as DependencyEcosystemModule;

function getEcosystemEntry(serviceId: string): EcosystemProcessConfig {
  const namespace = process.env.NAMESPACE || 'workspace-cli';
  const expectedName = `${namespace}-${serviceId}`;
  const entry = ecosystemModule.apps.find((app) => app.name === expectedName);

  if (!entry) {
    throw new Error(`Missing PM2 ecosystem entry for service: ${serviceId}`);
  }

  return entry;
}

function getDependencyEcosystemEntry(dependencyId: string): DependencyEcosystemProcessConfig {
  const namespace = process.env.NAMESPACE || 'workspace-cli';
  const expectedName = `${namespace}-${dependencyId}-dependency`;
  const entry = dependencyEcosystemModule.apps.find((app) => app.name === expectedName);

  if (!entry) {
    throw new Error(`Missing PM2 ecosystem entry for dependency: ${dependencyId}`);
  }

  return entry;
}

function toArrayArgs(args: EcosystemProcessConfig['args'], fallback?: readonly string[]): readonly string[] | undefined {
  if (!args && !fallback) {
    return undefined;
  }

  if (Array.isArray(args)) {
    return args;
  }

  if (typeof args === 'string') {
    return args.split(' ').filter(Boolean);
  }

  return fallback;
}

interface ServiceStartContext {
  readonly options: StartProcessOptions;
  readonly profile: ApplicationProcessProfile;
}

function resolveStartContext(
  serviceId: string,
  profileId: EnvironmentProfileId
): ServiceStartContext {
  const processProfile = getApplicationProcess(serviceId);
  const ecosystemEntry = getEcosystemEntry(serviceId);
  const envProfile = getEnvironmentProfile(profileId);
  const envOverrides = resolveEnvironmentOverrides(serviceId, profileId);
  const restartPolicy = processProfile.restartPolicy;

  const pm2Env = {
    WORKSPACE_PROFILE: profileId,
    WORKSPACE_SERVICE_ID: serviceId,
    WORKSPACE_RESTART_MAX: String(restartPolicy.maxRestarts),
    WORKSPACE_RESTART_WINDOW_SEC: '600',
    ...envProfile.variables,
    ...ecosystemEntry.env,
    ...envOverrides,
    ...resolveEnvironmentNamespaceEnv(ecosystemEntry, profileId)
  };

  const cwd = ecosystemEntry.cwd ?? path.resolve(process.cwd(), processProfile.cwd);
  const outFile = ecosystemEntry.out_file ?? path.resolve(process.cwd(), processProfile.logs.outFile);
  const errorFile = ecosystemEntry.error_file ?? path.resolve(process.cwd(), processProfile.logs.errorFile);
  const minUptimeMs =
    ecosystemEntry.min_uptime !== undefined
      ? ecosystemEntry.min_uptime
      : processProfile.restartPolicy.minUptimeSec * 1000;
  const restartDelayMs =
    ecosystemEntry.restart_delay !== undefined
      ? ecosystemEntry.restart_delay
      : processProfile.restartPolicy.sleepBetweenMs;
  const expBackoffMs =
    ecosystemEntry.exp_backoff_restart_delay !== undefined
      ? ecosystemEntry.exp_backoff_restart_delay
      : processProfile.restartPolicy.expBackoffInitialMs;

  const options: StartProcessOptions = {
    script: ecosystemEntry.script ?? processProfile.entryPoint,
    name: ecosystemEntry.name ?? processProfile.processId,
    cwd,
    env: pm2Env,
    maxRestarts: ecosystemEntry.max_restarts ?? processProfile.restartPolicy.maxRestarts,
    minUptime: minUptimeMs,
    restartDelay: restartDelayMs,
    expBackoffRestartDelay: expBackoffMs,
    interpreter: processProfile.interpreter,
    args: toArrayArgs(ecosystemEntry.args, processProfile.args),
    namespace: process.env.NAMESPACE || ecosystemEntry.namespace || processProfile.namespace,
    outFile,
    errorFile,
    mergeLogs: ecosystemEntry.merge_logs ?? true,
    logDateFormat: ecosystemEntry.log_date_format,
    autorestart: ecosystemEntry.autorestart ?? true,
    force: true
  } satisfies StartProcessOptions;

  return {
    options,
    profile: processProfile
  };
}

interface DependencyStartContext {
  readonly options: StartProcessOptions;
  readonly profile: DependencyProcessProfile;
}

function resolveDependencyStartContext(
  dependencyId: string,
  profileId: EnvironmentProfileId
): DependencyStartContext {
  const dependencyProfile = getDependencyProcess(dependencyId);
  const ecosystemEntry = getDependencyEcosystemEntry(dependencyId);
  const envProfile = getEnvironmentProfile(profileId);
  const namespace = process.env.NAMESPACE ? `${process.env.NAMESPACE}-deps` : (ecosystemEntry.namespace ?? getDependencyNamespace());
  const fallbackCommand = dependencyProfile.startScript.split(' ').filter(Boolean);
  const [fallbackScript, ...fallbackArgs] = fallbackCommand;

  const script = ecosystemEntry.script ?? fallbackScript ?? 'docker';

  const pm2Env = {
    WORKSPACE_PROFILE: profileId,
    WORKSPACE_DEPENDENCY_ID: dependencyId,
    WORKSPACE_RESTART_MAX: String(dependencyProfile.restartPolicy.maxRestarts),
    WORKSPACE_PROCESS_NAMESPACE: namespace,
    ...envProfile.variables,
    ...ecosystemEntry.env,
    ...resolveEnvironmentNamespaceEnv(ecosystemEntry, profileId)
  } as Record<string, string>;

  const cwd = ecosystemEntry.cwd ?? path.resolve(process.cwd(), 'docker');
  const outFile = ecosystemEntry.out_file ?? path.resolve(process.cwd(), dependencyProfile.logs.outFile);
  const errorFile = ecosystemEntry.error_file ?? path.resolve(process.cwd(), dependencyProfile.logs.errorFile);
  const minUptimeMs =
    ecosystemEntry.min_uptime !== undefined
      ? ecosystemEntry.min_uptime
      : dependencyProfile.restartPolicy.minUptimeSec * 1000;
  const restartDelayMs =
    ecosystemEntry.restart_delay !== undefined
      ? ecosystemEntry.restart_delay
      : dependencyProfile.restartPolicy.sleepBetweenMs;
  const expBackoffMs =
    ecosystemEntry.exp_backoff_restart_delay !== undefined
      ? ecosystemEntry.exp_backoff_restart_delay
      : dependencyProfile.restartPolicy.expBackoffInitialMs;

  const options: StartProcessOptions = {
    script,
    name: ecosystemEntry.name,
    cwd,
    env: pm2Env,
    maxRestarts: ecosystemEntry.max_restarts ?? dependencyProfile.restartPolicy.maxRestarts,
    minUptime: minUptimeMs,
    restartDelay: restartDelayMs,
    expBackoffRestartDelay: expBackoffMs,
    args: toArrayArgs(ecosystemEntry.args, fallbackArgs),
    namespace,
    outFile,
    errorFile,
    mergeLogs: ecosystemEntry.merge_logs ?? true,
    logDateFormat: ecosystemEntry.log_date_format,
    autorestart: ecosystemEntry.autorestart ?? true,
    force: true
  } satisfies StartProcessOptions;

  return {
    options,
    profile: dependencyProfile
  };
}

function resolveEnvironmentNamespaceEnv(
  entry: EcosystemProcessConfig,
  profileId: EnvironmentProfileId
): Record<string, string> {
  switch (profileId) {
    case 'development':
      return entry.env_development ?? {};
    case 'staging':
      return entry.env_staging ?? {};
    case 'production':
      return entry.env_production ?? {};
    default:
      return {};
  }
}

async function ensureLogDirectories(options: StartProcessOptions): Promise<void> {
  const directories = [options.outFile, options.errorFile]
    .filter(Boolean)
    .map((filePath) => path.dirname(filePath as string));

  await Promise.all(
    directories.map((directory) => mkdir(directory, { recursive: true }))
  );
}

function resolveTargetServices(
  requested: readonly string[],
  workspace: boolean,
  all: boolean,
  includeServices: boolean
): readonly string[] {
  if (requested.length > 0) {
    return requested;
  }

  if (!includeServices) {
    return [];
  }

  if (workspace || all) {
    return listDefaultApplicationProcesses().map((profile) => profile.processId);
  }

  return listDefaultApplicationProcesses().map((profile) => profile.processId);
}

function resolveTargetDependencies(
  requested: readonly string[],
  includeDependencies: boolean
): readonly string[] {
  if (requested.length > 0) {
    return requested;
  }

  if (!includeDependencies) {
    return [];
  }

  return listDefaultDependencyProcesses().map((profile) => profile.dependencyId);
}

export async function runStartCommand(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv);
  const includeDependencies =
    args.includeDependencies || args.dependenciesOnly || args.all || args.workspace;
  const includeServices = !args.dependenciesOnly;
  const services = resolveTargetServices(args.services, args.workspace, args.all, includeServices);
  const dependencies = resolveTargetDependencies(args.dependencies, includeDependencies);

  if (services.length === 0 && dependencies.length === 0) {
    process.stdout.write('⚠️  No services or dependencies requested for start command.\n');
    return;
  }

  const profileId = args.profile;

  if (dependencies.length > 0) {
    process.stdout.write(`🛢️  Starting dependencies [${dependencies.join(', ')}] with profile ${profileId}\n`);

    for (const dependencyId of dependencies) {
      const { options, profile: dependencyProfile } = resolveDependencyStartContext(dependencyId, profileId);

      if (args.dryRun) {
        process.stdout.write(`∙ [dry-run] pm2 start ${options.name}
  script: ${options.script}
  cwd: ${options.cwd}
  args: ${options.args?.join(' ') ?? '(none)'}
  namespace: ${options.namespace ?? '(default)'}
`);
        continue;
      }

      await ensureLogDirectories(options);

      const existing = await describeProcess(options.name);
      const existingNamespace = existing?.pm2_env?.namespace;

      if (existing && existingNamespace !== options.namespace) {
        throw new Error(
          `Conflicting PM2 process detected for ${options.name}. Expected namespace ${options.namespace}, found ${existingNamespace ?? 'unknown'}.`
        );
      }

      if (existing && existing.pm2_env?.status === 'online') {
        process.stdout.write(`∙ Reloading ${options.name} with updated configuration\n`);
        await reloadProcess(options.name);
        await waitForProcessStability({
          serviceId: dependencyId,
          processName: options.name,
          profileId,
          namespace: options.namespace,
          policy: dependencyProfile.restartPolicy,
          action: 'restart'
        });
        continue;
      }

      process.stdout.write(`∙ Starting ${options.name}\n`);
      await startProcess(options);
      await waitForProcessStability({
        serviceId: dependencyId,
        processName: options.name,
        profileId,
        namespace: options.namespace,
        policy: dependencyProfile.restartPolicy,
        action: 'start'
      });
    }
  }

  if (services.length > 0) {
    process.stdout.write(`🚀 Starting services [${services.join(', ')}] with profile ${profileId}\n`);

    for (const serviceId of services) {
      const { options, profile: processProfile } = resolveStartContext(serviceId, profileId);

      if (args.dryRun) {
        process.stdout.write(`∙ [dry-run] pm2 start ${options.name}
  script: ${options.script}
  cwd: ${options.cwd}
  args: ${options.args?.join(' ') ?? '(none)'}
  namespace: ${options.namespace ?? '(default)'}
`);
        continue;
      }

      await ensureLogDirectories(options);

      const existing = await describeProcess(options.name);
      const existingNamespace = existing?.pm2_env?.namespace;

      if (existing && existingNamespace !== options.namespace) {
        throw new Error(
          `Conflicting PM2 process detected for ${options.name}. Expected namespace ${options.namespace}, found ${existingNamespace ?? 'unknown'}.`
        );
      }

      if (existing && existing.pm2_env?.status === 'online') {
        process.stdout.write(`∙ Reloading ${options.name} with updated configuration\n`);
        await reloadProcess(options.name);
        await waitForProcessStability({
          serviceId,
          processName: options.name,
          profileId,
          namespace: options.namespace,
          policy: processProfile.restartPolicy,
          action: 'restart'
        });
        continue;
      }

      process.stdout.write(`∙ Starting ${options.name}\n`);
      await startProcess(options);
      await waitForProcessStability({
        serviceId,
        processName: options.name,
        profileId,
        namespace: options.namespace,
        policy: processProfile.restartPolicy,
        action: 'start'
      });
    }
  }

  process.stdout.write('✅ Start command complete\n');
}
