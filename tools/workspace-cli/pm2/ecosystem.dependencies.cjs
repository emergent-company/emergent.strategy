const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveCwd(relativePath) {
    return path.join(repoRoot, relativePath);
}

function resolveLog(dependencyId, fileName) {
    return path.join(repoRoot, 'apps', 'logs', 'dependencies', dependencyId, fileName);
}

const LOG_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_MIN_UPTIME_MS = 90_000;
const DEFAULT_RESTART_DELAY_MS = 5_000;
const DEFAULT_BACKOFF_INITIAL_MS = 5_000;

const WORKSPACE_DEPENDENCY_NAMESPACE = process.env.NAMESPACE ? `${process.env.NAMESPACE}-deps` : 'workspace-cli-deps';
const NAMESPACE_PREFIX = process.env.NAMESPACE || 'workspace-cli';

/** @type {import('pm2').StartOptions[]} */
const apps = [
    {
        name: `${NAMESPACE_PREFIX}-postgres-dependency`,
        namespace: WORKSPACE_DEPENDENCY_NAMESPACE,
        script: 'docker compose --project-name ${NAMESPACE} -f docker/docker-compose.yml up db',
        cwd: repoRoot,
        interpreter: '/bin/bash',
        interpreter_args: '-c',
        max_restarts: DEFAULT_MAX_RESTARTS,
        min_uptime: DEFAULT_MIN_UPTIME_MS,
        restart_delay: DEFAULT_RESTART_DELAY_MS,
        exp_backoff_restart_delay: DEFAULT_BACKOFF_INITIAL_MS,
        out_file: resolveLog('postgres', 'out.log'),
        error_file: resolveLog('postgres', 'error.log'),
        merge_logs: true,
        log_date_format: LOG_DATE_FORMAT,
        autorestart: true,
        env: {
            WORKSPACE_DEPENDENCY_ID: 'postgres',
            WORKSPACE_PROCESS_NAMESPACE: 'workspace-cli-deps',
            WORKSPACE_RESTART_MAX: String(DEFAULT_MAX_RESTARTS),
            WORKSPACE_RESTART_WINDOW_SEC: '900',
            NAMESPACE: process.env.NAMESPACE || 'workspace-cli'
        }
    },
    {
        name: `${NAMESPACE_PREFIX}-zitadel-dependency`,
        namespace: WORKSPACE_DEPENDENCY_NAMESPACE,
        script: 'docker compose --project-name ${NAMESPACE} -f docker/docker-compose.yml up zitadel',
        cwd: repoRoot,
        interpreter: '/bin/bash',
        interpreter_args: '-c',
        max_restarts: DEFAULT_MAX_RESTARTS,
        min_uptime: DEFAULT_MIN_UPTIME_MS,
        restart_delay: DEFAULT_RESTART_DELAY_MS,
        exp_backoff_restart_delay: DEFAULT_BACKOFF_INITIAL_MS,
        out_file: resolveLog('zitadel', 'out.log'),
        error_file: resolveLog('zitadel', 'error.log'),
        merge_logs: true,
        log_date_format: LOG_DATE_FORMAT,
        autorestart: true,
        env: {
            WORKSPACE_DEPENDENCY_ID: 'zitadel',
            WORKSPACE_PROCESS_NAMESPACE: 'workspace-cli-deps',
            WORKSPACE_RESTART_MAX: String(DEFAULT_MAX_RESTARTS),
            WORKSPACE_RESTART_WINDOW_SEC: '900',
            NAMESPACE: process.env.NAMESPACE || 'workspace-cli'
        }
    }
];

module.exports = {
    apps
};
