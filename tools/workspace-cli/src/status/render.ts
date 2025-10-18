import process from 'node:process';

import type { HealthSnapshotEntry, UnifiedHealthSnapshot } from '../config/types.js';
import { parseCliArgs } from '../utils/parse-args.js';
import { collectUnifiedHealthSnapshot } from './collect.js';

const DEFAULT_PLACEHOLDER = '—';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_PLACEHOLDER;
  }

  const units: Array<[number, string]> = [
    [60 * 60 * 24, 'd'],
    [60 * 60, 'h'],
    [60, 'm'],
    [1, 's']
  ];

  let remaining = seconds;
  const parts: string[] = [];

  for (const [unitSeconds, suffix] of units) {
    if (remaining < unitSeconds) {
      continue;
    }

    const value = Math.floor(remaining / unitSeconds);
    remaining -= value * unitSeconds;
    parts.push(`${value}${suffix}`);

    if (parts.length === 2) {
      break;
    }
  }

  if (parts.length === 0) {
    return '1s';
  }

  return parts.join(' ');
}

function formatDetail(entry: HealthSnapshotEntry): string {
  const detailParts: string[] = [];

  if (entry.healthDetail) {
    detailParts.push(entry.healthDetail);
  }

  if (entry.dependencyState && entry.dependencyState.length > 0) {
    const dependencySummary = entry.dependencyState
      .map((dependency) => `${dependency.dependencyId}:${dependency.status}`)
      .join(', ');
    detailParts.push(`deps=${dependencySummary}`);
  }

  if (entry.lastExitCode !== undefined && entry.lastExitCode !== null) {
    detailParts.push(`lastExit=${entry.lastExitCode}`);
  }

  return detailParts.length > 0 ? detailParts.join(' | ') : DEFAULT_PLACEHOLDER;
}

function formatPorts(entry: HealthSnapshotEntry): string {
  const ports = entry.exposedPorts ?? [];

  if (!ports || ports.length === 0) {
    return DEFAULT_PLACEHOLDER;
  }

  return ports.join(', ');
}

function buildTableRows(snapshot: UnifiedHealthSnapshot): string[][] {
  return snapshot.services.map((entry) => [
    entry.serviceId,
    entry.type,
    entry.status,
    formatDuration(entry.uptimeSec),
    String(entry.restartCount ?? 0),
    formatPorts(entry),
    formatDetail(entry)
  ]);
}

function renderTable(headers: readonly string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No managed services found.';
  }

  const columnWidths = headers.map((header, columnIndex) => {
    return Math.max(
      header.length,
      ...rows.map((row) => row[columnIndex]?.length ?? 0)
    );
  });

  const renderRow = (values: string[]): string =>
    values
      .map((value, index) => value.padEnd(columnWidths[index], ' '))
      .join('  ');

  const headerLine = renderRow(headers as string[]);
  const separatorLine = columnWidths.map((width) => '-'.repeat(width)).join('  ');
  const bodyLines = rows.map(renderRow);

  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

export async function runStatusCommand(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv);

  if (args.unknown.length > 0) {
    process.stderr.write(`Ignoring unknown arguments: ${args.unknown.join(', ')}\n`);
  }

  const snapshot = await collectUnifiedHealthSnapshot({
    services: args.services,
    dependencies: args.dependencies,
    workspace: args.workspace,
    all: args.all,
    includeDependencies: args.includeDependencies || args.dependenciesOnly || args.all || args.workspace,
    dependenciesOnly: args.dependenciesOnly
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  const headers = ['Service', 'Type', 'Status', 'Uptime', 'Restarts', 'Ports', 'Detail'] as const;
  const tableRows = buildTableRows(snapshot);
  const tableOutput = renderTable(headers, tableRows);

  process.stdout.write(`Captured at: ${snapshot.capturedAt}\n`);
  process.stdout.write(`${tableOutput}\n`);
}