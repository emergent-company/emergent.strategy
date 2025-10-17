const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveCwd(relativePath) {
  return path.join(repoRoot, relativePath);
}

function resolveLog(serviceId, fileName) {
  return path.join(repoRoot, 'apps', 'logs', serviceId, fileName);
}

const LOG_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const DEFAULT_MAX_RESTARTS = 5;
const DEFAULT_MIN_UPTIME_MS = 60_000;
const DEFAULT_RESTART_DELAY_MS = 5_000;
const DEFAULT_BACKOFF_INITIAL_MS = 5_000;

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: 'admin',
    namespace: 'workspace-cli',
    script: 'npm',
    args: ['run', 'dev'],
    cwd: resolveCwd('apps/admin'),
    max_restarts: DEFAULT_MAX_RESTARTS,
    min_uptime: DEFAULT_MIN_UPTIME_MS,
    restart_delay: DEFAULT_RESTART_DELAY_MS,
    exp_backoff_restart_delay: DEFAULT_BACKOFF_INITIAL_MS,
    out_file: resolveLog('admin', 'out.log'),
    error_file: resolveLog('admin', 'error.log'),
    merge_logs: true,
    log_date_format: LOG_DATE_FORMAT,
    autorestart: true,
    env: {
      WORKSPACE_SERVICE_ID: 'admin',
      WORKSPACE_PROCESS_NAMESPACE: 'workspace-cli',
      WORKSPACE_RESTART_MAX: String(DEFAULT_MAX_RESTARTS),
      WORKSPACE_RESTART_WINDOW_SEC: '600'
    },
    env_development: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug'
    },
    env_staging: {
      NODE_ENV: 'staging',
      LOG_LEVEL: 'info'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    }
  },
  {
    name: 'server',
    namespace: 'workspace-cli',
    script: 'npm',
    args: ['run', 'start:dev'],
    cwd: resolveCwd('apps/server-nest'),
    max_restarts: DEFAULT_MAX_RESTARTS,
    min_uptime: DEFAULT_MIN_UPTIME_MS,
    restart_delay: DEFAULT_RESTART_DELAY_MS,
    exp_backoff_restart_delay: DEFAULT_BACKOFF_INITIAL_MS,
    out_file: resolveLog('server', 'out.log'),
    error_file: resolveLog('server', 'error.log'),
    merge_logs: true,
    log_date_format: LOG_DATE_FORMAT,
    autorestart: true,
    env: {
      WORKSPACE_SERVICE_ID: 'server',
      WORKSPACE_PROCESS_NAMESPACE: 'workspace-cli',
      WORKSPACE_RESTART_MAX: String(DEFAULT_MAX_RESTARTS),
      WORKSPACE_RESTART_WINDOW_SEC: '600'
    },
    env_development: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug'
    },
    env_staging: {
      NODE_ENV: 'staging',
      LOG_LEVEL: 'info'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    }
  }
];

module.exports = {
  apps
};
