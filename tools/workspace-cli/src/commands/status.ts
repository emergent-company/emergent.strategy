import process from 'node:process';
import {
  getApplicationProcess,
  listDefaultApplicationProcesses,
} from '../config/application-processes.js';
import type { EnvironmentProfileId } from '../config/types.js';
import { parseCliArgs } from '../utils/parse-args.js';
import { listProcesses, type ProcessStatus } from '../process/manager.js';
import {
  getDependencyProcess,
  listDefaultDependencyProcesses,
} from '../config/dependency-processes.js';
import {
  validateRequiredEnvVars,
  printValidationErrors,
} from '../config/env-validation.js';
import { getDockerComposeServiceStatus } from '../process/docker.js';
import { timestamp, formatUptime } from '../utils/format.js';

function formatStatus(status: ProcessStatus): string {
  if (status.running) {
    return '🟢 online';
  }
  return '⚪ stopped';
}

export async function runStatusCommand(argv: readonly string[]): Promise<void> {
  // Validate required environment variables first
  const validation = validateRequiredEnvVars();
  if (!validation.valid) {
    printValidationErrors(validation.missing);
    process.exit(1);
  }

  const args = parseCliArgs(argv);
  const profileId: EnvironmentProfileId = args.profile;

  const allProcesses = await listProcesses();

  // Check if using remote services
  const skipDockerDeps = process.env.SKIP_DOCKER_DEPS === 'true';

  // Separate services and dependencies
  const serviceStatuses: ProcessStatus[] = [];
  const dependencyStatuses: ProcessStatus[] = [];

  const serviceIds = listDefaultApplicationProcesses().map((p) => p.processId);
  const dependencyIds = listDefaultDependencyProcesses().map(
    (p) => p.dependencyId
  );

  for (const status of allProcesses) {
    if (serviceIds.includes(status.name)) {
      serviceStatuses.push(status);
    } else if (dependencyIds.includes(status.name)) {
      dependencyStatuses.push(status);
    }
  }

  // Add missing services/dependencies that aren't in PID files
  for (const serviceId of serviceIds) {
    if (!serviceStatuses.find((s) => s.name === serviceId)) {
      serviceStatuses.push({
        name: serviceId,
        running: false,
        pid: null,
        metadata: null,
      });
    }
  }

  // Only check dependencies if not in remote mode
  if (!skipDockerDeps) {
    for (const depId of dependencyIds) {
      if (!dependencyStatuses.find((s) => s.name === depId)) {
        // Check if this is a Docker dependency
        try {
          const depProfile = getDependencyProcess(depId);
          if (depProfile.composeService) {
            // Use Docker status check
            const dockerStatus = await getDockerComposeServiceStatus(
              depProfile.composeService
            );
            dependencyStatuses.push({
              name: depId,
              running: dockerStatus.running,
              pid: null, // Docker containers don't have PIDs in our system
              metadata: null,
            });
          } else {
            // Regular process (check PID file)
            dependencyStatuses.push({
              name: depId,
              running: false,
              pid: null,
              metadata: null,
            });
          }
        } catch (error) {
          // Dependency not found in config
          dependencyStatuses.push({
            name: depId,
            running: false,
            pid: null,
            metadata: null,
          });
        }
      }
    }
  }

  process.stdout.write(
    `\n[${timestamp()}] 📊 Workspace Status (profile: ${profileId})\n`
  );

  // Show remote services info if applicable
  if (skipDockerDeps) {
    process.stdout.write('\n🌐 Remote Services Mode:\n');
    process.stdout.write('─'.repeat(80) + '\n');
    if (process.env.POSTGRES_HOST) {
      const dbInfo = `${process.env.POSTGRES_HOST}:${
        process.env.POSTGRES_PORT || 5432
      }/${process.env.POSTGRES_DB || 'zitadel'}`;
      process.stdout.write(`  Database:  ${dbInfo}\n`);
    }
    if (process.env.ZITADEL_DOMAIN) {
      const zitadelInfo = `${process.env.ZITADEL_DOMAIN}:${
        process.env.ZITADEL_URL?.includes(':8100') ? '8100' : '8080'
      }`;
      process.stdout.write(`  Zitadel:   ${zitadelInfo}\n`);
    }
    if (process.env.ZITADEL_ORG_ID) {
      process.stdout.write(`  Org ID:    ${process.env.ZITADEL_ORG_ID}\n`);
    }
    if (process.env.ZITADEL_PROJECT_ID) {
      process.stdout.write(`  Project:   ${process.env.ZITADEL_PROJECT_ID}\n`);
    }
  }
  process.stdout.write('\n');

  // Display services
  if (serviceStatuses.length > 0) {
    process.stdout.write('🚀 Services:\n');
    process.stdout.write('─'.repeat(80) + '\n');
    process.stdout.write(
      `${'Name'.padEnd(15)} ${'Status'.padEnd(12)} ${'PID'.padEnd(
        8
      )} ${'Ports'.padEnd(15)} ${'Uptime'.padEnd(12)}\n`
    );
    process.stdout.write('─'.repeat(80) + '\n');

    for (const status of serviceStatuses) {
      try {
        const profile = getApplicationProcess(status.name);
        const ports = profile.exposedPorts?.join(', ') || '-';
        const uptime = status.uptime ? formatUptime(status.uptime) : '-';
        const pid = status.pid?.toString() || '-';

        process.stdout.write(
          `${status.name.padEnd(15)} ${formatStatus(status).padEnd(
            12
          )} ${pid.padEnd(8)} ${ports.padEnd(15)} ${uptime.padEnd(12)}\n`
        );
      } catch (error) {
        // Process not found in configuration
        process.stdout.write(
          `${status.name.padEnd(15)} ${formatStatus(status).padEnd(12)} ${
            status.pid?.toString().padEnd(8) || '-'.padEnd(8)
          } -               -\n`
        );
      }
    }

    process.stdout.write('\n');
  }

  // Display dependencies (only if not in remote mode)
  if (!skipDockerDeps && dependencyStatuses.length > 0) {
    process.stdout.write('🛢️  Dependencies:\n');
    process.stdout.write('─'.repeat(80) + '\n');
    process.stdout.write(
      `${'Name'.padEnd(15)} ${'Status'.padEnd(12)} ${'Type'.padEnd(
        8
      )} ${'Ports'.padEnd(15)} ${'Uptime'.padEnd(12)}\n`
    );
    process.stdout.write('─'.repeat(80) + '\n');

    for (const status of dependencyStatuses) {
      try {
        const profile = getDependencyProcess(status.name);
        const ports = profile.exposedPorts?.join(', ') || '-';
        const uptime = status.uptime ? formatUptime(status.uptime) : '-';
        // For Docker services, show "Docker" instead of PID
        const pid = profile.composeService
          ? 'Docker'
          : status.pid?.toString() || '-';

        process.stdout.write(
          `${status.name.padEnd(15)} ${formatStatus(status).padEnd(
            12
          )} ${pid.padEnd(8)} ${ports.padEnd(15)} ${uptime.padEnd(12)}\n`
        );
      } catch (error) {
        // Process not found in configuration
        process.stdout.write(
          `${status.name.padEnd(15)} ${formatStatus(status).padEnd(12)} ${
            status.pid?.toString().padEnd(8) || '-'.padEnd(8)
          } -               -\n`
        );
      }
    }

    process.stdout.write('\n');
  }

  // Summary
  const runningServices = serviceStatuses.filter((s) => s.running).length;
  const runningDependencies = dependencyStatuses.filter(
    (s) => s.running
  ).length;

  // Adjust summary based on remote mode
  if (skipDockerDeps) {
    process.stdout.write(
      `📈 Summary: ${runningServices}/${serviceStatuses.length} services running (remote mode: dependencies managed externally)\n\n`
    );
  } else {
    process.stdout.write(
      `📈 Summary: ${runningServices}/${serviceStatuses.length} services, ${runningDependencies}/${dependencyStatuses.length} dependencies running\n\n`
    );
  }
}
