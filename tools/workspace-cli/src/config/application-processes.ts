import path from 'node:path';

import type {
  ApplicationProcessProfile,
  EnvironmentProfileId,
} from './types.js';

const WORKSPACE_NAMESPACE = 'workspace-cli';

const DEFAULT_RESTART_POLICY = {
  maxRestarts: 5,
  minUptimeSec: 60,
  sleepBetweenMs: 5000,
  expBackoffInitialMs: 5000,
  expBackoffMaxMs: 120000,
} as const;

const DEFAULT_LOG_ROOT = 'apps/logs';

function buildLogConfig(serviceId: string) {
  const serviceLogDir = path.join(DEFAULT_LOG_ROOT, serviceId);
  return {
    outFile: path.join(serviceLogDir, 'out.log'),
    errorFile: path.join(serviceLogDir, 'error.log'),
  } as const;
}

const ADMIN_PORT = process.env.ADMIN_PORT || '5175';
const SERVER_PORT = process.env.SERVER_PORT || '3001';

const APPLICATION_PROFILES: readonly ApplicationProcessProfile[] = [
  {
    processId: 'admin',
    entryPoint: 'npm',
    args: ['run', 'dev'],
    cwd: 'apps/admin',
    envProfile: 'development',
    restartPolicy: DEFAULT_RESTART_POLICY,
    logs: buildLogConfig('admin'),
    healthCheck: {
      url: `http://localhost:${ADMIN_PORT}/__workspace_health`,
      timeoutMs: 15000,
    },
    dependencies: [],
    namespace: WORKSPACE_NAMESPACE,
    defaultEnabled: true,
    setupCommands: ['npm install'],
    exposedPorts: [ADMIN_PORT],
    environmentOverrides: {
      staging: {
        VITE_APP_ENV: 'staging',
      },
      production: {
        VITE_APP_ENV: 'production',
      },
    },
  },
  {
    processId: 'server',
    entryPoint: 'npm',
    args: ['run', 'start:dev'],
    cwd: 'apps/server',
    envProfile: 'development',
    restartPolicy: DEFAULT_RESTART_POLICY,
    logs: buildLogConfig('server'),
    healthCheck: {
      url: `http://localhost:${SERVER_PORT}/healthz`,
      timeoutMs: 15000,
    },
    dependencies: [],
    namespace: WORKSPACE_NAMESPACE,
    defaultEnabled: true,
    setupCommands: ['npm install'],
    exposedPorts: [SERVER_PORT],
    environmentOverrides: {
      staging: {
        NODE_ENV: 'staging',
      },
      production: {
        NODE_ENV: 'production',
      },
    },
  },
] satisfies readonly ApplicationProcessProfile[];

export function listApplicationProcesses(): readonly ApplicationProcessProfile[] {
  return APPLICATION_PROFILES;
}

export function getApplicationProcess(
  processId: string
): ApplicationProcessProfile {
  const profile = APPLICATION_PROFILES.find(
    (item) => item.processId === processId
  );

  if (!profile) {
    throw new Error(`Unknown application process: ${processId}`);
  }

  return profile;
}

export function listDefaultApplicationProcesses(): readonly ApplicationProcessProfile[] {
  return APPLICATION_PROFILES.filter((profile) => profile.defaultEnabled);
}

export function resolveEnvironmentOverrides(
  processId: string,
  environment: EnvironmentProfileId
): Readonly<Record<string, string>> {
  const profile = getApplicationProcess(processId);
  const overrides = profile.environmentOverrides?.[environment];
  return overrides ?? {};
}
