import path from 'node:path';

import type { DependencyProcessProfile, EnvironmentProfileId, RestartPolicy } from './types.js';

const WORKSPACE_DEPENDENCY_NAMESPACE = 'workspace-cli-deps';

const DEFAULT_RESTART_POLICY: RestartPolicy = {
  maxRestarts: 3,
  minUptimeSec: 90,
  sleepBetweenMs: 5000,
  expBackoffInitialMs: 5000,
  expBackoffMaxMs: 120000
};

const DEPENDENCY_LOG_ROOT = 'apps/logs/dependencies';

function buildLogConfig(dependencyId: string) {
  const dependencyLogDir = path.join(DEPENDENCY_LOG_ROOT, dependencyId);
  return {
    outFile: path.join(dependencyLogDir, 'out.log'),
    errorFile: path.join(dependencyLogDir, 'error.log')
  } as const;
}

const DEFAULT_ENV_PROFILE: EnvironmentProfileId = 'development';

const DEPENDENCY_PROFILES: readonly DependencyProcessProfile[] = [
  {
    dependencyId: 'postgres',
    composeService: 'db',
    startScript: 'docker compose up db',
    stopScript: 'docker compose stop db',
    envProfile: DEFAULT_ENV_PROFILE,
    healthCheck: {
      type: 'docker-healthcheck',
      timeoutSec: 120
    },
    logs: buildLogConfig('postgres'),
    restartPolicy: DEFAULT_RESTART_POLICY,
    exposedPorts: ['5432']
  },
  {
    dependencyId: 'zitadel',
    composeService: 'zitadel',
    startScript: 'docker compose up zitadel',
    stopScript: 'docker compose stop zitadel',
    envProfile: DEFAULT_ENV_PROFILE,
    healthCheck: {
      type: 'docker-healthcheck',
      timeoutSec: 180
    },
    logs: buildLogConfig('zitadel'),
    restartPolicy: DEFAULT_RESTART_POLICY,
    exposedPorts: ['8100->8080', '8101->3000']
  }
] satisfies readonly DependencyProcessProfile[];

export function listDependencyProcesses(): readonly DependencyProcessProfile[] {
  return DEPENDENCY_PROFILES;
}

export function getDependencyProcess(dependencyId: string): DependencyProcessProfile {
  const profile = DEPENDENCY_PROFILES.find((item) => item.dependencyId === dependencyId);

  if (!profile) {
    throw new Error(`Unknown dependency process: ${dependencyId}`);
  }

  return profile;
}

export function listDefaultDependencyProcesses(): readonly DependencyProcessProfile[] {
  return DEPENDENCY_PROFILES;
}

export function getDependencyNamespace(): string {
  return WORKSPACE_DEPENDENCY_NAMESPACE;
}
