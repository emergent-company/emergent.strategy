import process from 'node:process';
import {
  getApplicationProcess,
  listDefaultApplicationProcesses,
} from '../config/application-processes.js';
import type { EnvironmentProfileId } from '../config/types.js';
import { parseCliArgs } from '../utils/parse-args.js';
import { stopProcess, getProcessStatus } from '../process/manager.js';
import {
  getDependencyProcess,
  listDefaultDependencyProcesses,
} from '../config/dependency-processes.js';
import {
  stopDockerComposeService,
  getDockerComposeServiceStatus,
} from '../process/docker.js';
import { timestamp } from '../utils/format.js';

export async function runStopCommand(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv);
  const profileId: EnvironmentProfileId = args.profile;

  // Check if we should skip Docker dependencies (remote mode)
  const skipDockerDeps = process.env.SKIP_DOCKER_DEPS === 'true';
  if (skipDockerDeps && (args.dependenciesOnly || args.all || args.workspace)) {
    process.stdout.write(
      `[${timestamp()}] 🌐 Remote mode: Skipping Docker dependencies (using remote services)\n\n`
    );
  }

  const includeDependencies =
    !skipDockerDeps &&
    (args.includeDependencies ||
      args.dependenciesOnly ||
      args.all ||
      args.workspace);
  const includeServices = !args.dependenciesOnly;

  // Determine which services to stop
  let serviceIds: string[] = [];
  if (includeServices) {
    if (args.services.length > 0) {
      serviceIds = [...args.services];
    } else {
      serviceIds = listDefaultApplicationProcesses().map((p) => p.processId);
    }
  }

  // Determine which dependencies to stop
  let dependencyIds: string[] = [];
  if (includeDependencies) {
    if (args.dependencies.length > 0) {
      dependencyIds = [...args.dependencies];
    } else {
      dependencyIds = listDefaultDependencyProcesses().map(
        (p) => p.dependencyId
      );
    }
  }

  if (serviceIds.length === 0 && dependencyIds.length === 0) {
    process.stdout.write(
      `[${timestamp()}] ⚠️  No services or dependencies requested for stop command.\n`
    );
    return;
  }

  // Stop services first (before dependencies)
  if (serviceIds.length > 0) {
    process.stdout.write(
      `[${timestamp()}] ⏹️  Stopping services [${serviceIds.join(
        ', '
      )}] with profile ${profileId}\n`
    );

    for (const serviceId of serviceIds) {
      try {
        const status = await getProcessStatus(serviceId);

        if (!status.running) {
          process.stdout.write(
            `[${timestamp()}] ∙ ${serviceId} is not running\n`
          );
          continue;
        }

        process.stdout.write(
          `[${timestamp()}] ∙ Stopping ${serviceId} (PID ${status.pid})...\n`
        );
        await stopProcess(serviceId, { timeout: 10000 });
        process.stdout.write(`[${timestamp()}]   ✓ Stopped ${serviceId}\n`);
      } catch (error) {
        process.stderr.write(
          `[${timestamp()}]   ✗ Failed to stop ${serviceId}: ${
            error instanceof Error ? error.message : String(error)
          }\n`
        );
      }
    }

    process.stdout.write('\n');
  }

  // Stop dependencies
  if (dependencyIds.length > 0) {
    process.stdout.write(
      `[${timestamp()}] 🛑 Stopping dependencies [${dependencyIds.join(
        ', '
      )}]\n`
    );

    for (const depId of dependencyIds) {
      try {
        const depProfile = getDependencyProcess(depId);

        // Check if this is a Docker dependency
        if (depProfile.composeService) {
          // Docker-based dependency
          const dockerStatus = await getDockerComposeServiceStatus(
            depProfile.composeService
          );

          if (!dockerStatus.running) {
            process.stdout.write(
              `[${timestamp()}] ∙ ${depId} is not running\n`
            );
            continue;
          }

          process.stdout.write(
            `[${timestamp()}] ∙ Stopping ${depId} (Docker)...\n`
          );
          await stopDockerComposeService(depProfile.composeService);
          process.stdout.write(`[${timestamp()}]   ✓ Stopped ${depId}\n`);
        } else {
          // Regular process-based dependency
          const status = await getProcessStatus(depId);

          if (!status.running) {
            process.stdout.write(
              `[${timestamp()}] ∙ ${depId} is not running\n`
            );
            continue;
          }

          process.stdout.write(
            `[${timestamp()}] ∙ Stopping ${depId} (PID ${status.pid})...\n`
          );
          await stopProcess(depId, { timeout: 10000 });
          process.stdout.write(`[${timestamp()}]   ✓ Stopped ${depId}\n`);
        }
      } catch (error) {
        process.stderr.write(
          `[${timestamp()}]   ✗ Failed to stop ${depId}: ${
            error instanceof Error ? error.message : String(error)
          }\n`
        );
      }
    }

    process.stdout.write('\n');
  }

  process.stdout.write(`[${timestamp()}] ✅ Stop command complete\n`);
}
