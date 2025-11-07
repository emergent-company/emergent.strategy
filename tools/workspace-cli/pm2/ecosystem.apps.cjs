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

const WORKSPACE_NAMESPACE = process.env.NAMESPACE || 'workspace-cli';

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: `${WORKSPACE_NAMESPACE}-admin`,
    namespace: WORKSPACE_NAMESPACE,
    script: 'npm run dev',
    cwd: resolveCwd('apps/admin'),
    interpreter: '/bin/bash',
    interpreter_args: '-c',
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
      WORKSPACE_PROCESS_NAMESPACE: WORKSPACE_NAMESPACE,
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
    name: `${WORKSPACE_NAMESPACE}-server`,
    namespace: WORKSPACE_NAMESPACE,
    script: 'npm run start:dev',
    cwd: resolveCwd('apps/server-nest'),
    interpreter: '/bin/bash',
    interpreter_args: '-c',
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
      WORKSPACE_PROCESS_NAMESPACE: WORKSPACE_NAMESPACE,
      WORKSPACE_RESTART_MAX: String(DEFAULT_MAX_RESTARTS),
      WORKSPACE_RESTART_WINDOW_SEC: '600',
      HTTP_LOG_PATH: path.join(repoRoot, 'logs', 'http.log')
    },
    env_development: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      HTTP_LOG_PATH: path.join(repoRoot, 'logs', 'http.log')
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
