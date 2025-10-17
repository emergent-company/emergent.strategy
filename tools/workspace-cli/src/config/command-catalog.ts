import type { EnvironmentProfileId, WorkspaceCommandDescriptor } from './types.js';

const DEFAULT_PROFILE: EnvironmentProfileId = 'development';
const CLI_ENTRY = 'tools/workspace-cli/src/cli.ts';

export const WORKSPACE_COMMAND_CATALOG: readonly WorkspaceCommandDescriptor[] = [
  {
    commandId: 'workspace:start',
    project: 'workspace-cli',
    action: 'start',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} start --workspace`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Start the default application stack (API + Admin) under PM2 supervision.'
  },
  {
    commandId: 'workspace:start-all',
    project: 'workspace-cli',
    action: 'start',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} start --all`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Ensure every registered application and dependency process is online.'
  },
  {
    commandId: 'workspace:deps:start',
    project: 'workspace-cli',
    action: 'start',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} start --deps-only`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Start foundational docker dependencies (e.g., Postgres, Zitadel).'
  },
  {
    commandId: 'workspace:restart',
    project: 'workspace-cli',
    action: 'restart',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} restart --workspace`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Restart the default application stack with supervised policies enforced.'
  },
  {
    commandId: 'workspace:deps:restart',
    project: 'workspace-cli',
    action: 'restart',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} restart --deps-only`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Restart docker dependencies under PM2 supervision.'
  },
  {
    commandId: 'workspace:stop',
    project: 'workspace-cli',
    action: 'stop',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} stop --workspace`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Stop the default application stack and release managed resources.'
  },
  {
    commandId: 'workspace:deps:stop',
    project: 'workspace-cli',
    action: 'stop',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} stop --deps-only`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Stop docker dependencies and wait for clean shutdowns.'
  },
  {
    commandId: 'workspace:status',
    project: 'workspace-cli',
    action: 'status',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} status --workspace --dependencies`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: false,
    description: 'Render consolidated health snapshot for applications and dependencies.'
  },
  {
    commandId: 'workspace:logs',
    project: 'workspace-cli',
    action: 'logs',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} logs --workspace --dependencies`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: false,
    description: 'Retrieve recent or historical logs for a managed service.'
  },
  {
    commandId: 'admin:setup',
    project: 'admin',
    action: 'setup',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} setup --service=admin`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: false,
    description: 'Install dependencies and prepare the admin workspace for development.'
  },
  {
    commandId: 'admin:start',
    project: 'admin',
    action: 'start',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} start --service=admin`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: ['admin:setup'],
    requiresDocker: false,
    description: 'Launch the admin Vite development server under PM2 supervision.'
  },
  {
    commandId: 'admin:restart',
    project: 'admin',
    action: 'restart',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} restart --service=admin`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: false,
    description: 'Restart the admin service with restart policies enforced.'
  },
  {
    commandId: 'admin:stop',
    project: 'admin',
    action: 'stop',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} stop --service=admin`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: false,
    description: 'Stop the admin service using the supervised workflow.'
  },
  {
    commandId: 'admin:test',
    project: 'admin',
    action: 'test',
    executor: 'nx:run-commands',
    script: 'apps/admin/node_modules/.bin/vitest',
    envProfile: DEFAULT_PROFILE,
    dependsOn: ['admin:setup'],
    requiresDocker: false,
    description: 'Execute admin project tests with standardized environment setup.'
  },
  {
    commandId: 'server:setup',
    project: 'server-nest',
    action: 'setup',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} setup --service=server`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Install server dependencies and prepare local environment.'
  },
  {
    commandId: 'server:start',
    project: 'server-nest',
    action: 'start',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} start --service=server`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: ['server:setup'],
    requiresDocker: true,
    description: 'Launch the Nest API under PM2 supervision using the selected profile.'
  },
  {
    commandId: 'server:restart',
    project: 'server-nest',
    action: 'restart',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} restart --service=server`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Restart the Nest API with supervised restart thresholds applied.'
  },
  {
    commandId: 'server:stop',
    project: 'server-nest',
    action: 'stop',
    executor: 'nx:run-commands',
    script: `${CLI_ENTRY} stop --service=server`,
    envProfile: DEFAULT_PROFILE,
    dependsOn: [],
    requiresDocker: true,
    description: 'Stop the Nest API process using PM2 supervision.'
  },
  {
    commandId: 'server:test',
    project: 'server-nest',
    action: 'test',
    executor: 'nx:run-commands',
    script: 'apps/server-nest/node_modules/.bin/jest',
    envProfile: DEFAULT_PROFILE,
    dependsOn: ['server:setup'],
    requiresDocker: false,
    description: 'Run Nest API test suite with orchestrated preflight checks.'
  }
];
