import process from 'node:process';
import path from 'node:path';
import { open, readdir } from 'node:fs/promises';

import { parseCliArgs } from '../utils/parse-args.js';
import {
  getApplicationProcess,
  listApplicationProcesses,
  listDefaultApplicationProcesses,
} from '../config/application-processes.js';
import {
  getDependencyProcess,
  listDefaultDependencyProcesses,
} from '../config/dependency-processes.js';
import type {
  ApplicationProcessProfile,
  DependencyProcessProfile,
  ManagedServiceType,
} from '../config/types.js';
import { WorkspaceCliError } from '../errors.js';

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KiB
const LOG_FILE_PATTERN = /\.log(\..*)?$/i;
const LOG_SEARCH_ROOTS = [
  path.resolve(process.cwd(), 'apps/logs'),
  path.resolve(process.cwd(), 'logs'),
];

interface LogStreamSnapshot {
  readonly name: 'stdout' | 'stderr';
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly exists: boolean;
  readonly lines: readonly string[];
}

interface ServiceLogSnapshot {
  readonly serviceId: string;
  readonly type: ManagedServiceType;
  readonly label: string;
  readonly streams: readonly LogStreamSnapshot[];
}

interface ExtraLogSnapshot {
  readonly key: string;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly exists: boolean;
  readonly lines: readonly string[];
}

interface LogSnapshotPayload {
  readonly capturedAt: string;
  readonly lineCount: number;
  readonly services: readonly ServiceLogSnapshot[];
  readonly extras: readonly ExtraLogSnapshot[];
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function formatServiceLabel(
  serviceId: string,
  type: ManagedServiceType
): string {
  return type === 'application'
    ? `${serviceId} (application)`
    : `${serviceId} (dependency)`;
}

async function tailFile(
  filePath: string,
  maxLines: number
): Promise<readonly string[] | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(filePath, 'r');
    const stats = await handle.stat();

    if (stats.size === 0) {
      return [];
    }

    const chunks: string[] = [];
    let newlineCount = 0;
    let position = stats.size;

    while (position > 0 && newlineCount <= maxLines) {
      const readSize = Math.min(DEFAULT_CHUNK_SIZE, position);
      position -= readSize;

      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, position);
      const chunk = buffer.toString('utf-8');
      chunks.unshift(chunk);
      newlineCount += (chunk.match(/\n/g) ?? []).length;
    }

    const data = chunks.join('');
    const rawLines = data.split(/\r?\n/);
    const filtered =
      rawLines[rawLines.length - 1] === '' ? rawLines.slice(0, -1) : rawLines;

    if (filtered.length <= maxLines) {
      return filtered;
    }

    return filtered.slice(-maxLines);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }

    throw error;
  } finally {
    await handle?.close();
  }
}

function resolveAbsolutePath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

async function collectStreamsForApplication(
  profile: ApplicationProcessProfile,
  maxLines: number,
  knownPaths: Set<string>
): Promise<ServiceLogSnapshot> {
  const stdoutAbsolute = resolveAbsolutePath(profile.logs.outFile);
  const stderrAbsolute = resolveAbsolutePath(profile.logs.errorFile);

  knownPaths.add(stdoutAbsolute);
  knownPaths.add(stderrAbsolute);

  const [stdoutLines, stderrLines] = await Promise.all([
    tailFile(stdoutAbsolute, maxLines),
    tailFile(stderrAbsolute, maxLines),
  ]);

  const stdoutSnapshot: LogStreamSnapshot = {
    name: 'stdout',
    absolutePath: stdoutAbsolute,
    relativePath: path.relative(process.cwd(), stdoutAbsolute),
    exists: stdoutLines !== null,
    lines: (stdoutLines ?? []) as readonly string[],
  };

  const stderrSnapshot: LogStreamSnapshot = {
    name: 'stderr',
    absolutePath: stderrAbsolute,
    relativePath: path.relative(process.cwd(), stderrAbsolute),
    exists: stderrLines !== null,
    lines: (stderrLines ?? []) as readonly string[],
  };

  return {
    serviceId: profile.processId,
    type: 'application',
    label: formatServiceLabel(profile.processId, 'application'),
    streams: [stdoutSnapshot, stderrSnapshot],
  };
}

async function collectStreamsForDependency(
  profile: DependencyProcessProfile,
  maxLines: number,
  knownPaths: Set<string>
): Promise<ServiceLogSnapshot> {
  const stdoutAbsolute = resolveAbsolutePath(profile.logs.outFile);
  const stderrAbsolute = resolveAbsolutePath(profile.logs.errorFile);

  knownPaths.add(stdoutAbsolute);
  knownPaths.add(stderrAbsolute);

  const [stdoutLines, stderrLines] = await Promise.all([
    tailFile(stdoutAbsolute, maxLines),
    tailFile(stderrAbsolute, maxLines),
  ]);

  const stdoutSnapshot: LogStreamSnapshot = {
    name: 'stdout',
    absolutePath: stdoutAbsolute,
    relativePath: path.relative(process.cwd(), stdoutAbsolute),
    exists: stdoutLines !== null,
    lines: (stdoutLines ?? []) as readonly string[],
  };

  const stderrSnapshot: LogStreamSnapshot = {
    name: 'stderr',
    absolutePath: stderrAbsolute,
    relativePath: path.relative(process.cwd(), stderrAbsolute),
    exists: stderrLines !== null,
    lines: (stderrLines ?? []) as readonly string[],
  };

  return {
    serviceId: profile.dependencyId,
    type: 'dependency',
    label: formatServiceLabel(profile.dependencyId, 'dependency'),
    streams: [stdoutSnapshot, stderrSnapshot],
  };
}

async function collectExtras(
  knownPaths: Set<string>,
  maxLines: number
): Promise<ExtraLogSnapshot[]> {
  const discovered = new Set<string>();

  for (const root of LOG_SEARCH_ROOTS) {
    await discoverLogsRecursively(root, knownPaths, discovered);
  }

  const sortedExtras = Array.from(discovered).sort((a, b) =>
    a.localeCompare(b)
  );
  const results: ExtraLogSnapshot[] = [];

  for (const absolutePath of sortedExtras) {
    const lines = await tailFile(absolutePath, maxLines);
    const exists = lines !== null;

    results.push({
      key: deriveExtraKey(absolutePath),
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath),
      exists,
      lines: (lines ?? []) as readonly string[],
    });
  }

  return results;
}

async function discoverLogsRecursively(
  root: string,
  knownPaths: Set<string>,
  results: Set<string>
): Promise<void> {
  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        await discoverLogsRecursively(entryPath, knownPaths, results);
        continue;
      }

      if (!LOG_FILE_PATTERN.test(entry.name)) {
        continue;
      }

      if (knownPaths.has(entryPath)) {
        continue;
      }

      results.add(entryPath);
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

function deriveExtraKey(absolutePath: string): string {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative.replace(/[\\/]+/g, ':');
}

function buildSnapshotPayload(
  services: readonly ServiceLogSnapshot[],
  extras: readonly ExtraLogSnapshot[],
  lineCount: number
): LogSnapshotPayload {
  return {
    capturedAt: new Date().toISOString(),
    lineCount,
    services,
    extras,
  };
}

function renderTextSnapshot(payload: LogSnapshotPayload): void {
  const header = `🗂️ Workspace log snapshot — ${payload.capturedAt} (last ${
    payload.lineCount
  } line${payload.lineCount === 1 ? '' : 's'})`;
  process.stdout.write(`${header}\n`);
  process.stdout.write(`${'='.repeat(header.length)}\n`);

  if (payload.services.length === 0) {
    process.stdout.write('\n(no managed service logs selected)\n');
  }

  for (const service of payload.services) {
    process.stdout.write(`\n=== ${service.label} — ${service.serviceId} ===\n`);

    for (const stream of service.streams) {
      process.stdout.write(`-- ${stream.name} — ${stream.relativePath}\n`);

      if (!stream.exists) {
        process.stdout.write(
          '⚠️  Log file not found. Start the service to generate logs.\n'
        );
        continue;
      }

      if (stream.lines.length === 0) {
        process.stdout.write('(log is empty)\n');
        continue;
      }

      process.stdout.write(`${stream.lines.join('\n')}\n`);
    }
  }

  if (payload.extras.length > 0) {
    process.stdout.write('\n=== Additional log files ===\n');

    for (const extra of payload.extras) {
      process.stdout.write(`\n--- ${extra.key} — ${extra.relativePath} ---\n`);

      if (!extra.exists) {
        process.stdout.write('⚠️  Log file not found.\n');
        continue;
      }

      if (extra.lines.length === 0) {
        process.stdout.write('(log is empty)\n');
        continue;
      }

      process.stdout.write(`${extra.lines.join('\n')}\n`);
    }
  }
}

function serializeSnapshot(payload: LogSnapshotPayload): void {
  const serialized = {
    capturedAt: payload.capturedAt,
    lineCount: payload.lineCount,
    services: payload.services.map((service) => ({
      serviceId: service.serviceId,
      type: service.type,
      label: service.label,
      streams: service.streams.map((stream) => ({
        name: stream.name,
        path: stream.relativePath,
        exists: stream.exists,
        lineCount: stream.lines.length,
        content: stream.lines,
      })),
    })),
    extras: payload.extras.map((extra) => ({
      key: extra.key,
      path: extra.relativePath,
      exists: extra.exists,
      lineCount: extra.lines.length,
      content: extra.lines,
    })),
  };

  process.stdout.write(`${JSON.stringify(serialized, null, 2)}\n`);
}

function resolveApplicationTargets(
  requested: readonly string[],
  includeServices: boolean,
  all: boolean
): string[] {
  if (requested.length > 0) {
    return unique(requested);
  }

  if (!includeServices) {
    return [];
  }

  const profiles = all
    ? listApplicationProcesses()
    : listDefaultApplicationProcesses();
  return profiles.map((profile) => profile.processId);
}

function resolveDependencyTargets(
  requested: readonly string[],
  includeDependencies: boolean
): string[] {
  if (requested.length > 0) {
    return unique(requested);
  }

  if (!includeDependencies) {
    return [];
  }

  return listDefaultDependencyProcesses().map(
    (profile) => profile.dependencyId
  );
}

function resolveApplicationProfile(
  serviceId: string
): ApplicationProcessProfile {
  try {
    return getApplicationProcess(serviceId);
  } catch (error) {
    throw new WorkspaceCliError(
      'UNKNOWN_SERVICE',
      `Unknown application service: ${serviceId}`,
      {
        serviceId,
        recommendation:
          'List available services with nx graph or inspect application-processes.ts.',
      }
    );
  }
}

function resolveDependencyProfile(
  dependencyId: string
): DependencyProcessProfile {
  try {
    return getDependencyProcess(dependencyId);
  } catch (error) {
    throw new WorkspaceCliError(
      'UNKNOWN_DEPENDENCY',
      `Unknown dependency: ${dependencyId}`,
      {
        serviceId: dependencyId,
        recommendation:
          'Check tools/workspace-cli/src/config/dependency-processes.ts for valid IDs.',
      }
    );
  }
}

export async function runLogsCommand(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv);

  if (args.unknown.length > 0) {
    process.stderr.write(
      `Ignoring unknown arguments: ${args.unknown.join(', ')}\n`
    );
  }

  if (args.follow && args.json) {
    throw new WorkspaceCliError(
      'INVALID_ARGUMENT',
      'Streaming logs is incompatible with --json output.',
      {
        recommendation:
          'Remove the --json flag or omit --follow to generate a static snapshot.',
      }
    );
  }

  const explicitServiceSelection = args.services.length > 0;
  const explicitDependencySelection = args.dependencies.length > 0;

  const includeServices = !args.dependenciesOnly;
  const includeDependencies =
    args.includeDependencies ||
    args.dependenciesOnly ||
    args.all ||
    args.workspace ||
    (!explicitServiceSelection &&
      !explicitDependencySelection &&
      !args.dependenciesOnly &&
      args.follow);
  const lineCount = Math.max(1, args.logLines);

  const serviceIds = resolveApplicationTargets(
    args.services,
    includeServices,
    args.all
  );
  const dependencyIds = resolveDependencyTargets(
    args.dependencies,
    includeDependencies
  );

  const knownPaths = new Set<string>();
  const serviceSnapshots: ServiceLogSnapshot[] = [];

  for (const serviceId of serviceIds) {
    const profile = resolveApplicationProfile(serviceId);
    const snapshot = await collectStreamsForApplication(
      profile,
      lineCount,
      knownPaths
    );
    serviceSnapshots.push(snapshot);
  }

  for (const dependencyId of dependencyIds) {
    const profile = resolveDependencyProfile(dependencyId);
    const snapshot = await collectStreamsForDependency(
      profile,
      lineCount,
      knownPaths
    );
    serviceSnapshots.push(snapshot);
  }

  const extras = args.follow ? [] : await collectExtras(knownPaths, lineCount);
  const payload = buildSnapshotPayload(serviceSnapshots, extras, lineCount);

  if (args.json) {
    serializeSnapshot(payload);
    return;
  }

  renderTextSnapshot(payload);

  if (args.follow) {
    throw new WorkspaceCliError(
      'FEATURE_NOT_SUPPORTED',
      'Log streaming (--follow) is not currently supported.',
      {
        recommendation:
          'Remove the --follow flag to generate a static log snapshot.',
      }
    );
  }
}
