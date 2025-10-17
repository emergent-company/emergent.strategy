#!/usr/bin/env node
import process from 'node:process';

import { runSetupCommand } from './commands/setup-service.js';
import { runStartCommand } from './commands/start-service.js';
import { runRestartCommand } from './commands/restart-service.js';
import { runStopCommand } from './commands/stop-service.js';
import { runStatusCommand } from './status/render.js';
import { runLogsCommand } from './logs/read.js';
import { isWorkspaceCliError } from './errors.js';
import { ensureLogrotateModule } from './pm2/logrotate.js';
import { runPreflightChecks } from './preflight/checks.js';

async function main(): Promise<void> {
  const [, , rawCommand, ...rest] = process.argv;

  if (rawCommand === undefined || rawCommand === '--help' || rawCommand === '-h') {
    printHelp();
    return;
  }

  const preflightCommands = new Set(['setup', 'start', 'restart', 'stop', 'status', 'logs']);
  if (preflightCommands.has(rawCommand)) {
    await runPreflightChecks(rawCommand, rest);
  }

  const logrotateEnabledCommands = new Set(['start', 'restart', 'stop', 'status', 'logs']);

  if (logrotateEnabledCommands.has(rawCommand)) {
    await ensureLogrotateModule();
  }

  switch (rawCommand) {
    case 'setup':
      await runSetupCommand(rest);
      return;

    case 'start':
      await runStartCommand(rest);
      return;

    case 'restart':
      await runRestartCommand(rest);
      return;

    case 'stop':
      await runStopCommand(rest);
      return;

    case 'status':
      await runStatusCommand(rest);
      return;

    case 'logs':
      await runLogsCommand(rest);
      return;

    default:
      process.stderr.write(`Unknown command: ${rawCommand}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  process.stdout.write(`Workspace CLI

Usage:
  npx tsx tools/workspace-cli/src/cli.ts <command> [options]

Commands:
  setup    Install dependencies and prepare services (use --service or --workspace)
  start    Launch services and/or dependencies under PM2 supervision
  restart  Restart services or dependencies with restart policies enforced
  stop     Gracefully stop services or dependencies managed by PM2
  status   Report consolidated health for managed services and dependencies
  logs     Tail recent log output for managed services and dependencies

Options:
  --service <id>     Target a specific service (repeatable)
  --services=a,b     Comma-separated service list shorthand
  --dependency <id>  Target a specific dependency (repeatable)
  --workspace        Target the default workspace service set (includes dependencies)
  --all              Target every registered application service
  --dependencies     Include the default dependency set
  --deps-only        Restrict the command to dependencies only
  --lines <n>        Limit the number of log lines per file (default: 100)
  --profile <name>   Select environment profile (development, staging, production)
  --dry-run          Print actions without executing them
  --json             Emit status output as structured JSON
  --help             Show this message
`);
}

main().catch((error: unknown) => {
  if (isWorkspaceCliError(error)) {
    process.stderr.write(`❌ ${error.code}: ${error.message}\n`);

    if (error.details) {
      const payload = {
        code: error.code,
        message: error.message,
        ...error.details
      } satisfies Record<string, unknown>;

      process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    }
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`❌ workspace-cli failed: ${message}\n`);
  }

  process.exitCode = 1;
});
