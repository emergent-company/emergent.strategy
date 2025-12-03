import path from 'node:path';

import type { DependencyProcessProfile, EnvironmentProfileId, RestartPolicy } from './types.js';

const WORKSPACE_DEPENDENCY_NAMESPACE = process.env.NAMESPACE || 'workspace-cli';

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

// NOTE: Database and Zitadel are now deployed independently in ../emergent-infra/
// See ../emergent-infra/postgres/README.md and ../emergent-infra/zitadel/README.md

const DEPENDENCY_PROFILES: readonly DependencyProcessProfile[] = [
  // All infrastructure services managed externally via emergent-infra
  // - postgres: emergent-infra/postgres (port 5432)
  // - zitadel: emergent-infra/zitadel (port 8080)
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
