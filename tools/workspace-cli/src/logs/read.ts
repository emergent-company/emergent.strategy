import process from 'node:process';
import path from 'node:path';
import { open, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

import pm2 from 'pm2';

import { parseCliArgs } from '../utils/parse-args.js';
import {
  getApplicationProcess,
  listApplicationProcesses,
  listDefaultApplicationProcesses
} from '../config/application-processes.js';
import {
  getDependencyProcess,
  listDefaultDependencyProcesses
} from '../config/dependency-processes.js';
import type { ApplicationProcessProfile, DependencyProcessProfile, ManagedServiceType } from '../config/types.js';
import { WorkspaceCliError } from '../errors.js';

const require = createRequire(import.meta.url);

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KiB
const LOG_FILE_PATTERN = /\.log(\..*)?$/i;
const LOG_SEARCH_ROOTS = [
  path.resolve(process.cwd(), 'apps/logs'),
  path.resolve(process.cwd(), 'logs')
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

interface EcosystemProcessConfig {
  readonly name: string;
  readonly namespace?: string;
  readonly env?: Record<string, unknown>;
}

interface EcosystemModule {
  readonly apps: readonly EcosystemProcessConfig[];
}

interface Pm2LogPacket {
  readonly data: string;
  readonly at?: number;
  readonly process: {
    readonly name: string;
    readonly namespace?: string;
    readonly pm_id?: number;
  };
}

interface Pm2Bus {
  on(event: string, handler: (packet: Pm2LogPacket) => void): void;
  removeListener(event: string, handler: (packet: Pm2LogPacket) => void): void;
  close(): void;
}

const applicationEcosystem = require('../../pm2/ecosystem.apps.cjs') as EcosystemModule;
const dependencyEcosystem = require('../../pm2/ecosystem.dependencies.cjs') as EcosystemModule;

const COLOR_RESET = '\u001B[0m';
const COLOR_DIM = '\u001B[2m';
const COLOR_PALETTE = [36, 32, 33, 35, 34, 96, 92, 93, 95, 94, 91, 90] as const;
const STDOUT_COLOR = 90;
const STDERR_COLOR = 91;
const STDOUT_SYMBOL = '▸';
const STDERR_SYMBOL = '✖';

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function formatServiceLabel(serviceId: string, type: ManagedServiceType): string {
  return type === 'application' ? `${serviceId} (application)` : `${serviceId} (dependency)`;
}

async function tailFile(filePath: string, maxLines: number): Promise<readonly string[] | null> {
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
    const filtered = rawLines[rawLines.length - 1] === '' ? rawLines.slice(0, -1) : rawLines;

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
    tailFile(stderrAbsolute, maxLines)
  ]);

  const stdoutSnapshot: LogStreamSnapshot = {
    name: 'stdout',
    absolutePath: stdoutAbsolute,
    relativePath: path.relative(process.cwd(), stdoutAbsolute),
    exists: stdoutLines !== null,
    lines: (stdoutLines ?? []) as readonly string[]
  };

  const stderrSnapshot: LogStreamSnapshot = {
    name: 'stderr',
    absolutePath: stderrAbsolute,
    relativePath: path.relative(process.cwd(), stderrAbsolute),
    exists: stderrLines !== null,
    lines: (stderrLines ?? []) as readonly string[]
  };

  return {
    serviceId: profile.processId,
    type: 'application',
    label: formatServiceLabel(profile.processId, 'application'),
    streams: [stdoutSnapshot, stderrSnapshot]
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
    tailFile(stderrAbsolute, maxLines)
  ]);

  const stdoutSnapshot: LogStreamSnapshot = {
    name: 'stdout',
    absolutePath: stdoutAbsolute,
    relativePath: path.relative(process.cwd(), stdoutAbsolute),
    exists: stdoutLines !== null,
    lines: (stdoutLines ?? []) as readonly string[]
  };

  const stderrSnapshot: LogStreamSnapshot = {
    name: 'stderr',
    absolutePath: stderrAbsolute,
    relativePath: path.relative(process.cwd(), stderrAbsolute),
    exists: stderrLines !== null,
    lines: (stderrLines ?? []) as readonly string[]
  };

  return {
    serviceId: profile.dependencyId,
    type: 'dependency',
    label: formatServiceLabel(profile.dependencyId, 'dependency'),
    streams: [stdoutSnapshot, stderrSnapshot]
  };
}

async function collectExtras(knownPaths: Set<string>, maxLines: number): Promise<ExtraLogSnapshot[]> {
  const discovered = new Set<string>();

  for (const root of LOG_SEARCH_ROOTS) {
    await discoverLogsRecursively(root, knownPaths, discovered);
  }

  const sortedExtras = Array.from(discovered).sort((a, b) => a.localeCompare(b));
  const results: ExtraLogSnapshot[] = [];

  for (const absolutePath of sortedExtras) {
    const lines = await tailFile(absolutePath, maxLines);
    const exists = lines !== null;

    results.push({
      key: deriveExtraKey(absolutePath),
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath),
      exists,
      lines: (lines ?? []) as readonly string[]
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
    extras
  };
}

function renderTextSnapshot(payload: LogSnapshotPayload): void {
  const header = `🗂️ Workspace log snapshot — ${payload.capturedAt} (last ${payload.lineCount} line${payload.lineCount === 1 ? '' : 's'})`;
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
        process.stdout.write('⚠️  Log file not found. Start the service to generate logs.\n');
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
        content: stream.lines
      }))
    })),
    extras: payload.extras.map((extra) => ({
      key: extra.key,
      path: extra.relativePath,
      exists: extra.exists,
      lineCount: extra.lines.length,
      content: extra.lines
    }))
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

  const profiles = all ? listApplicationProcesses() : listDefaultApplicationProcesses();
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

  return listDefaultDependencyProcesses().map((profile) => profile.dependencyId);
}

function resolveApplicationProfile(serviceId: string): ApplicationProcessProfile {
  try {
    return getApplicationProcess(serviceId);
  } catch (error) {
    throw new WorkspaceCliError('UNKNOWN_SERVICE', `Unknown application service: ${serviceId}`, {
      serviceId,
      recommendation: 'List available services with nx graph or inspect application-processes.ts.'
    });
  }
}

function resolveDependencyProfile(dependencyId: string): DependencyProcessProfile {
  try {
    return getDependencyProcess(dependencyId);
  } catch (error) {
    throw new WorkspaceCliError('UNKNOWN_DEPENDENCY', `Unknown dependency: ${dependencyId}`, {
      serviceId: dependencyId,
      recommendation: 'Check tools/workspace-cli/src/config/dependency-processes.ts for valid IDs.'
    });
  }
}

export async function runLogsCommand(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv);

  if (args.unknown.length > 0) {
    process.stderr.write(`Ignoring unknown arguments: ${args.unknown.join(', ')}\n`);
  }

  if (args.follow && args.json) {
    throw new WorkspaceCliError(
      'INVALID_ARGUMENT',
      'Streaming logs is incompatible with --json output.',
      {
        recommendation: 'Remove the --json flag or omit --follow to generate a static snapshot.'
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
    (!explicitServiceSelection && !explicitDependencySelection && !args.dependenciesOnly && args.follow);
  const lineCount = Math.max(1, args.logLines);

  const serviceIds = resolveApplicationTargets(args.services, includeServices, args.all);
  const dependencyIds = resolveDependencyTargets(args.dependencies, includeDependencies);

  const knownPaths = new Set<string>();
  const serviceSnapshots: ServiceLogSnapshot[] = [];

  for (const serviceId of serviceIds) {
    const profile = resolveApplicationProfile(serviceId);
    const snapshot = await collectStreamsForApplication(profile, lineCount, knownPaths);
    serviceSnapshots.push(snapshot);
  }

  for (const dependencyId of dependencyIds) {
    const profile = resolveDependencyProfile(dependencyId);
    const snapshot = await collectStreamsForDependency(profile, lineCount, knownPaths);
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
    process.stdout.write('\n');
    await streamManagedLogs(serviceIds, dependencyIds);
    return;
  }
}

function getEnvString(entry: EcosystemProcessConfig, key: string): string | undefined {
  if (!entry.env) {
    return undefined;
  }

  const value = entry.env[key];
  return typeof value === 'string' ? value : undefined;
}

function resolveApplicationEcosystemEntry(serviceId: string): EcosystemProcessConfig {
  const entry = applicationEcosystem.apps.find((candidate) => {
    const envServiceId = getEnvString(candidate, 'WORKSPACE_SERVICE_ID');
    return envServiceId === serviceId || candidate.name === serviceId;
  });

  if (!entry) {
    throw new WorkspaceCliError('UNKNOWN_SERVICE', `Unknown application service: ${serviceId}`, {
      serviceId,
      recommendation: 'Register the service in pm2/ecosystem.apps.cjs to enable log streaming.'
    });
  }

  return entry;
}

function resolveDependencyEcosystemEntry(dependencyId: string): EcosystemProcessConfig {
  const entry = dependencyEcosystem.apps.find((candidate) => {
    const envDependencyId = getEnvString(candidate, 'WORKSPACE_DEPENDENCY_ID');
    return envDependencyId === dependencyId || candidate.name === `${dependencyId}-dependency`;
  });

  if (!entry) {
    throw new WorkspaceCliError('UNKNOWN_DEPENDENCY', `Unknown dependency: ${dependencyId}`, {
      serviceId: dependencyId,
      recommendation: 'Register the dependency in pm2/ecosystem.dependencies.cjs to enable log streaming.'
    });
  }

  return entry;
}

function applyColor(code: number, text: string): string {
  return `\u001B[${code}m${text}${COLOR_RESET}`;
}

function dimText(text: string): string {
  return `${COLOR_DIM}${text}${COLOR_RESET}`;
}

function formatChannelLabel(channel: 'stdout' | 'stderr'): string {
  const code = channel === 'stderr' ? STDERR_COLOR : STDOUT_COLOR;
  const symbol = channel === 'stderr' ? STDERR_SYMBOL : STDOUT_SYMBOL;
  return applyColor(code, `${symbol} ${channel}`);
}

function timestampLabel(at?: number): string {
  const time = at ?? Date.now();
  const iso = new Date(time).toISOString();
  return dimText(`[${iso}]`);
}

async function connectPm2(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    pm2.connect((error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function launchPm2Bus(): Promise<Pm2Bus> {
  return await new Promise((resolve, reject) => {
    const pm2WithBus = pm2 as unknown as {
      launchBus: (callback: (error: Error | null, bus?: unknown) => void) => void;
    };

    pm2WithBus.launchBus((error: Error | null, bus?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      if (!bus) {
        reject(new Error('PM2 log bus unavailable.'));
        return;
      }

      resolve(bus as Pm2Bus);
    });
  });
}

async function streamManagedLogs(
  serviceIds: readonly string[],
  dependencyIds: readonly string[]
): Promise<void> {
  const targetProcesses = new Map<string, { namespace?: string }>();

  for (const serviceId of serviceIds) {
    const entry = resolveApplicationEcosystemEntry(serviceId);
    targetProcesses.set(entry.name, { namespace: entry.namespace });
  }

  for (const dependencyId of dependencyIds) {
    const entry = resolveDependencyEcosystemEntry(dependencyId);
    targetProcesses.set(entry.name, { namespace: entry.namespace });
  }

  if (targetProcesses.size === 0) {
    process.stdout.write('⚠️  No managed services selected. Nothing to stream.\n');
    return;
  }

  const allowedNames = new Set(targetProcesses.keys());
  const allowedNamespaces = new Set(
    Array.from(targetProcesses.values())
      .map((item) => item.namespace)
      .filter((namespace): namespace is string => typeof namespace === 'string' && namespace.length > 0)
  );

  await connectPm2();
  let bus: Pm2Bus | undefined;

  try {
    bus = await launchPm2Bus();

    process.stdout.write('📡 Streaming realtime logs (press Ctrl+C to stop)\n');

    const colorAssignments = new Map<string, number>();
    let paletteIndex = 0;

    const resolveColorCode = (name: string): number => {
      if (!colorAssignments.has(name)) {
        const code = COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length];
        colorAssignments.set(name, code);
        paletteIndex += 1;
      }

      return colorAssignments.get(name)!;
    };

    const emitLine = (channel: 'stdout' | 'stderr', packet: Pm2LogPacket) => {
      const processName = packet.process.name;
      if (!allowedNames.has(processName)) {
        const namespace = packet.process.namespace;
        if (!namespace || !allowedNamespaces.has(namespace)) {
          return;
        }
      }

      const label = applyColor(resolveColorCode(processName), `[${processName}]`);
      const channelLabel = formatChannelLabel(channel);
      const prefix = `${timestampLabel(packet.at)} ${label} ${channelLabel}`;
      const raw = packet.data ?? '';
      const segments = raw.split(/\r?\n/);

      for (const segment of segments) {
        if (segment.length === 0) {
          continue;
        }

        process.stdout.write(`${prefix} ${segment}\n`);
      }
    };

    const handleStdout = (packet: Pm2LogPacket) => emitLine('stdout', packet);
    const handleStderr = (packet: Pm2LogPacket) => emitLine('stderr', packet);

    bus.on('log:out', handleStdout);
    bus.on('log:err', handleStderr);

    await new Promise<void>((resolve) => {
      let closed = false;
      const signals: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];

      const finalize = () => {
        if (closed) {
          return;
        }

        closed = true;

        for (const signal of signals) {
          process.removeListener(signal, finalize);
        }

        if (bus) {
          try {
            if (typeof bus.removeListener === 'function') {
              bus.removeListener('log:out', handleStdout);
              bus.removeListener('log:err', handleStderr);
            }

            if (typeof bus.close === 'function') {
              bus.close();
            }
          } catch {
            // ignore cleanup errors
          }
        }

        process.stdout.write('\n🛑 Log streaming stopped.\n');
        resolve();
      };

      signals.forEach((signal) => {
        process.once(signal, finalize);
      });
    });
  } finally {
    try {
      pm2.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
}
