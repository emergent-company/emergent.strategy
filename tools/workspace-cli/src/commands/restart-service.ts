import process from 'node:process';
import path from 'node:path';
import {
  getApplicationProcess,
  listDefaultApplicationProcesses,
  resolveEnvironmentOverrides,
} from '../config/application-processes.js';
import { getEnvironmentProfile } from '../config/env-profiles.js';
import type { EnvironmentProfileId } from '../config/types.js';
import { parseCliArgs } from '../utils/parse-args.js';
import {
  restartProcess,
  getProcessStatus,
  type StartProcessOptions,
} from '../process/manager.js';
import { waitForHealthy } from '../process/health-check.js';
import {
  getDependencyProcess,
  listDefaultDependencyProcesses,
} from '../config/dependency-processes.js';
import {
  validateRequiredEnvVars,
  printValidationErrors,
} from '../config/env-validation.js';
import {
  restartDockerComposeService,
  getDockerComposeServiceStatus,
} from '../process/docker.js';

export async function runRestartCommand(
  argv: readonly string[]
): Promise<void> {
  // Validate required environment variables first
  const validation = validateRequiredEnvVars();
  if (!validation.valid) {
    printValidationErrors(validation.missing);
    process.exit(1);
  }
  const args = parseCliArgs(argv);
  const profileId: EnvironmentProfileId = args.profile;
  const envProfile = getEnvironmentProfile(profileId);

  // Check if we should skip Docker dependencies (remote mode)
  const skipDockerDeps = process.env.SKIP_DOCKER_DEPS === 'true';
  if (skipDockerDeps) {
    process.stdout.write('🌐 Remote mode: Skipping local Docker dependencies\n');
    process.stdout.write('   Using remote services:\n');
    if (process.env.POSTGRES_HOST) {
      process.stdout.write(`   • Database: ${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}\n`);
    }
    if (process.env.ZITADEL_DOMAIN) {
      process.stdout.write(`   • Zitadel: ${process.env.ZITADEL_DOMAIN}\n`);
    }
    process.stdout.write('\n');
  }

  const includeDependencies =
    !skipDockerDeps && (args.includeDependencies ||
      args.dependenciesOnly ||
      args.all ||
      args.workspace);
  const includeServices = !args.dependenciesOnly;

  // Determine which services to restart
  let serviceIds: string[] = [];
  if (includeServices) {
    if (args.services.length > 0) {
      serviceIds = [...args.services];
    } else {
      serviceIds = listDefaultApplicationProcesses().map((p) => p.processId);
    }
  }

  // Determine which dependencies to restart
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
      '⚠️  No services or dependencies requested for restart command.\n'
    );
    return;
  }

  // Restart dependencies first
  if (dependencyIds.length > 0) {
    process.stdout.write(
      `🔄 Restarting dependencies [${dependencyIds.join(', ')}]\n`
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

          if (dockerStatus.running) {
            process.stdout.write(`∙ Restarting ${depId} (Docker)...\n`);
          } else {
            process.stdout.write(`∙ Starting ${depId} (was not running)...\n`);
          }

          await restartDockerComposeService(depProfile.composeService);
          process.stdout.write(`  ✓ Restarted ${depId} (Docker)\n`);
        } else {
          // Regular process-based dependency
          const status = await getProcessStatus(depId);
          const [command, ...cmdArgs] = depProfile.startScript.split(' ');

          const startOptions: StartProcessOptions = {
            name: depId,
            command,
            args: cmdArgs,
            cwd: process.cwd(),
            env: {
              ...envProfile.variables,
            },
          };

          if (status.running) {
            process.stdout.write(
              `∙ Restarting ${depId} (PID ${status.pid})...\n`
            );
          } else {
            process.stdout.write(`∙ Starting ${depId} (was not running)...\n`);
          }

          const pid = await restartProcess(startOptions);
          process.stdout.write(`  ✓ Restarted ${depId} (PID ${pid})\n`);
        }
      } catch (error) {
        process.stderr.write(
          `  ✗ Failed to restart ${depId}: ${error instanceof Error ? error.message : String(error)
          }\n`
        );
      }
    }

    process.stdout.write('\n');
  }

  // Restart services
  if (serviceIds.length > 0) {
    process.stdout.write(
      `🔁 Restarting services [${serviceIds.join(
        ', '
      )}] with profile ${profileId}\n`
    );

    for (const serviceId of serviceIds) {
      try {
        const profile = getApplicationProcess(serviceId);
        const status = await getProcessStatus(serviceId);
        const envOverrides = resolveEnvironmentOverrides(serviceId, profileId);

        const startOptions: StartProcessOptions = {
          name: serviceId,
          command: profile.entryPoint,
          args: profile.args,
          cwd: path.resolve(process.cwd(), profile.cwd),
          env: {
            ...envProfile.variables,
            ...envOverrides,
          },
        };

        if (status.running) {
          process.stdout.write(
            `∙ Restarting ${serviceId} (PID ${status.pid})...\n`
          );
        } else {
          process.stdout.write(
            `∙ Starting ${serviceId} (was not running)...\n`
          );
        }

        const pid = await restartProcess(startOptions);
        process.stdout.write(`  ✓ Restarted ${serviceId} (PID ${pid})\n`);

        // Run health check if configured
        if (profile.healthCheck?.url) {
          process.stdout.write(`  ⏳ Checking health...`);
          const healthResult = await waitForHealthy({
            url: profile.healthCheck.url,
            timeoutMs: 5000,
            maxWaitMs: profile.healthCheck.timeoutMs,
          });

          if (healthResult.healthy) {
            process.stdout.write(` ✓ Healthy (${healthResult.latencyMs}ms)\n`);
          } else {
            const errorMsg = healthResult.error ?? 'Unknown error';
            process.stdout.write(` ⚠️  Health check failed: ${errorMsg}\n`);
          }
        }
      } catch (error) {
        process.stderr.write(
          `  ✗ Failed to restart ${serviceId}: ${error instanceof Error ? error.message : String(error)
          }\n`
        );
      }
    }

    process.stdout.write('\n');
  }

  process.stdout.write('✅ Restart command complete\n');
}
