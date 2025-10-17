import { spawn } from 'node:child_process';
import process from 'node:process';

import { listDefaultApplicationProcesses, getApplicationProcess } from '../config/application-processes.js';
import { parseCliArgs } from '../utils/parse-args.js';

async function executeShellCommand(command: string, cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: process.env
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Setup command failed with exit code ${code} in ${cwd}: ${command}`));
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function resolveTargetServices(requested: readonly string[]): readonly string[] {
  if (requested.length > 0) {
    return requested;
  }

  return listDefaultApplicationProcesses().map((profile) => profile.processId);
}

export async function runSetupCommand(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv);
  const services = resolveTargetServices(args.services);

  if (services.length === 0) {
    process.stdout.write('⚠️  No services selected for setup. Nothing to do.\n');
    return;
  }

  process.stdout.write(`🛠️  Running setup for services: ${services.join(', ')}\n`);

  for (const serviceId of services) {
    const profile = getApplicationProcess(serviceId);

    if (profile.setupCommands.length === 0) {
      process.stdout.write(`ℹ️  ${serviceId} has no setup commands registered. Skipping.\n`);
      continue;
    }

    for (const command of profile.setupCommands) {
      if (args.dryRun) {
        process.stdout.write(`∙ [dry-run] (${profile.cwd}) ${command}\n`);
        continue;
      }

      process.stdout.write(`∙ (${profile.cwd}) ${command}\n`);
      await executeShellCommand(command, profile.cwd);
    }
  }

  process.stdout.write('✅ Setup complete\n');
}
