import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { createRequire } from 'node:module';

import type {
  ApplicationProcessProfile,
  DependencyProcessProfile,
  DependencyStateEntry,
  HealthSnapshotEntry,
  UnifiedHealthSnapshot
} from '../config/types.js';
import {
  getApplicationProcess,
  listDefaultApplicationProcesses
} from '../config/application-processes.js';
import {
  getDependencyProcess,
  listDefaultDependencyProcesses
} from '../config/dependency-processes.js';
import type { ProcessDescription } from 'pm2';
import { listProcesses } from '../pm2/client.js';

interface EcosystemProcessConfig {
  readonly name: string;
  readonly namespace?: string;
}

interface EcosystemModule {
  readonly apps: readonly EcosystemProcessConfig[];
}

const require = createRequire(import.meta.url);
const applicationEcosystem = require('../../pm2/ecosystem.apps.cjs') as EcosystemModule;
const dependencyEcosystem = require('../../pm2/ecosystem.dependencies.cjs') as EcosystemModule;

const execFileAsync = promisify(execFile);

interface DockerComposeEntry {
  readonly Service: string;
  readonly State: string;
  readonly Health?: string | null;
}

interface DockerStatus {
  readonly state: string;
  readonly health?: string | null;
}

export interface CollectStatusOptions {
  readonly services: readonly string[];
  readonly dependencies: readonly string[];
  readonly workspace: boolean;
  readonly all: boolean;
  readonly includeDependencies: boolean;
  readonly dependenciesOnly: boolean;
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
  includeDependencies: boolean,
  dependenciesOnly: boolean,
  all: boolean
): readonly string[] {
  if (requested.length > 0) {
    return requested;
  }

  if (!includeDependencies && !dependenciesOnly && !all) {
    return [];
  }

  return listDefaultDependencyProcesses().map((profile) => profile.dependencyId);
}

function resolveApplicationProcessName(serviceId: string): EcosystemProcessConfig {
  const namespace = process.env.NAMESPACE || 'workspace-cli';
  const expectedName = `${namespace}-${serviceId}`;
  const match = applicationEcosystem.apps.find((entry) => entry.name === expectedName);

  if (!match) {
    throw new Error(`Missing PM2 ecosystem entry for service ${serviceId} (expected name: ${expectedName})`);
  }

  return match;
}

function resolveDependencyProcessName(dependencyId: string): EcosystemProcessConfig {
  const namespace = process.env.NAMESPACE || 'workspace-cli';
  const expectedName = `${namespace}-${dependencyId}-dependency`;
  const match = dependencyEcosystem.apps.find((entry) => entry.name === expectedName);

  if (!match) {
    throw new Error(`Missing PM2 ecosystem entry for dependency ${dependencyId} (expected name: ${expectedName})`);
  }

  return match;
}

async function fetchDockerStatuses(): Promise<Map<string, DockerStatus>> {
  const dockerCwd = path.resolve(process.cwd(), 'docker');
  try {
    const { stdout } = await execFileAsync('docker', ['compose', 'ps', '--format', 'json'], {
      cwd: dockerCwd
    });

    if (!stdout) {
      return new Map();
    }

    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsed: DockerComposeEntry[] = [];

    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as DockerComposeEntry);
      } catch {
        // Ignore malformed lines from docker compose output (e.g. progress messages)
      }
    }

    if (parsed.length === 0) {
      return new Map();
    }

    const map = new Map<string, DockerStatus>();

    for (const entry of parsed) {
      const serviceName = entry.Service;
      if (!serviceName) {
        continue;
      }

      map.set(serviceName, {
        state: entry.State,
        health: entry.Health ?? null
      });
    }

    return map;
  } catch (error) {
    return new Map();
  }
}

function mapPm2Status(status?: string): 'online' | 'stopped' | 'starting' | 'failing' | 'degraded' {
  switch (status) {
    case 'online':
      return 'online';
    case 'stopped':
    case 'stoppping':
    case 'offline':
      return 'stopped';
    case 'launching':
    case 'starting':
    case 'init':
    case 'waiting restart':
      return 'starting';
    case 'errored':
    case 'waiting to restart':
      return 'failing';
    default:
      return 'degraded';
  }
}

function computeUptime(pm2Env: ProcessDescription['pm2_env'] | undefined): number {
  if (!pm2Env) {
    return 0;
  }

  const startedAt = pm2Env.pm_uptime;
  if (!startedAt) {
    return 0;
  }

  const uptimeMs = Date.now() - startedAt;
  return uptimeMs > 0 ? Math.floor(uptimeMs / 1000) : 0;
}

function formatDockerDetail(docker: DockerStatus | undefined): string | undefined {
  if (!docker) {
    return undefined;
  }

  const healthSuffix = docker.health ? ` / health=${docker.health}` : '';
  return `docker=${docker.state}${healthSuffix}`;
}

function createDependencyStateEntries(
  dependencyIds: readonly string[],
  dependencySnapshots: Map<string, HealthSnapshotEntry>
): readonly DependencyStateEntry[] {
  return dependencyIds.map((dependencyId) => {
    const snapshot = dependencySnapshots.get(dependencyId);

    if (!snapshot) {
      return {
        dependencyId,
        status: 'stopped',
        healthDetail: 'dependency not registered'
      } satisfies DependencyStateEntry;
    }

    return {
      dependencyId,
      status: snapshot.status,
      healthDetail: snapshot.healthDetail
    } satisfies DependencyStateEntry;
  });
}

function buildApplicationEntry(
  profile: ApplicationProcessProfile,
  pm2Process: ProcessDescription | undefined,
  dependencySnapshots: Map<string, HealthSnapshotEntry>
): HealthSnapshotEntry {
  const pm2Env = pm2Process?.pm2_env;
  const status = mapPm2Status(pm2Env?.status);
  const dependencyState = createDependencyStateEntries(profile.dependencies, dependencySnapshots);

  return {
    serviceId: profile.processId,
    type: 'application',
    status,
    uptimeSec: computeUptime(pm2Env),
    restartCount: pm2Env?.restart_time ?? 0,
    lastExitCode: pm2Env?.exit_code ?? undefined,
    healthDetail: pm2Env?.status,
    dependencyState,
    exposedPorts: profile.exposedPorts
  } satisfies HealthSnapshotEntry;
}

function buildDependencyEntry(
  profile: DependencyProcessProfile,
  pm2Process: ProcessDescription | undefined,
  dockerStatus: DockerStatus | undefined
): HealthSnapshotEntry {
  const pm2Env = pm2Process?.pm2_env;
  let status = mapPm2Status(pm2Env?.status);
  const dockerDetail = formatDockerDetail(dockerStatus);
  const detailParts = [pm2Env?.status, dockerDetail].filter(Boolean);

  if (!dockerStatus) {
    detailParts.push('docker=not-found');
  }

  if (status === 'online' && dockerStatus && !dockerStatus.state.toLowerCase().includes('running')) {
    status = 'degraded';
  }

  if (!pm2Process && dockerStatus) {
    status = 'degraded';
    detailParts.unshift('pm2=missing');
  }

  if (!pm2Process && !dockerStatus) {
    status = 'stopped';
    detailParts.unshift('pm2=missing');
  }

  return {
    serviceId: profile.dependencyId,
    type: 'dependency',
    status,
    uptimeSec: computeUptime(pm2Env),
    restartCount: pm2Env?.restart_time ?? 0,
    lastExitCode: pm2Env?.exit_code ?? undefined,
    healthDetail: detailParts.join(' | ') || undefined,
    exposedPorts: profile.exposedPorts
  } satisfies HealthSnapshotEntry;
}

export async function collectUnifiedHealthSnapshot(options: CollectStatusOptions): Promise<UnifiedHealthSnapshot> {
  const includeServices = !options.dependenciesOnly;
  const services = resolveTargetServices(options.services, options.workspace, options.all, includeServices);
  const dependencyTargets = resolveTargetDependencies(
    options.dependencies,
    options.includeDependencies,
    options.dependenciesOnly,
    options.all
  );

  const dependencySet = new Set<string>(dependencyTargets);

  const applicationProfiles: Array<{ serviceId: string; profile: ApplicationProcessProfile }> = [];

  for (const serviceId of services) {
    const profile = getApplicationProcess(serviceId);
    applicationProfiles.push({ serviceId, profile });

    for (const dependencyId of profile.dependencies) {
      dependencySet.add(dependencyId);
    }
  }

  const pm2List = await listProcesses();
  const pm2Map = new Map<string, ProcessDescription>();

  for (const entry of pm2List) {
    if (entry.name) {
      pm2Map.set(entry.name, entry);
    }
  }

  const dockerStatuses = await fetchDockerStatuses();

  const dependencySnapshots = new Map<string, HealthSnapshotEntry>();

  for (const dependencyId of dependencySet) {
    const dependencyProfile = getDependencyProcess(dependencyId);
    const ecosystemEntry = resolveDependencyProcessName(dependencyId);
    const pm2Process = pm2Map.get(ecosystemEntry.name);
    const dockerStatus = dockerStatuses.get(dependencyProfile.composeService);

    dependencySnapshots.set(
      dependencyId,
      buildDependencyEntry(dependencyProfile, pm2Process, dockerStatus)
    );
  }

  const applicationEntries: HealthSnapshotEntry[] = [];

  for (const { serviceId, profile } of applicationProfiles) {
    const ecosystemEntry = resolveApplicationProcessName(serviceId);
    const pm2Process = pm2Map.get(ecosystemEntry.name);

    applicationEntries.push(buildApplicationEntry(profile, pm2Process, dependencySnapshots));
  }

  const dependencyEntries = Array.from(dependencySet.values()).map((dependencyId) => {
    return dependencySnapshots.get(dependencyId) ?? {
      serviceId: dependencyId,
      type: 'dependency',
      status: 'stopped',
      uptimeSec: 0,
      restartCount: 0,
      healthDetail: 'dependency not registered'
    } satisfies HealthSnapshotEntry;
  });

  return {
    capturedAt: new Date().toISOString(),
    services: [...applicationEntries, ...dependencyEntries]
  } satisfies UnifiedHealthSnapshot;
}
