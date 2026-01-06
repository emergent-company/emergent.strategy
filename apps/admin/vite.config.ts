import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import path from 'path';
import { defineConfig, UserConfig } from 'vite';
import { envPlugin } from './vite-env-plugin';

// In dev mode, the root .env is loaded by the npm script (via dotenv-cli or similar)
// In production Docker builds, all env vars come from --build-arg, so dotenv is not needed

// Single canonical admin dev port env: ADMIN_PORT (fallback 5175)
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);

// Derive API target for proxy. Prefer explicit API_ORIGIN, else use SERVER_PORT (single canonical backend port var)
const API_TARGET =
  process.env.API_ORIGIN ||
  `http://localhost:${process.env.SERVER_PORT || 3001}`;
console.log(`[vite] dev server on :${DEV_PORT} proxy /api -> ${API_TARGET}`);

// HTTP logging setup
const LOG_DIR = path.resolve(process.cwd(), '..', '..', 'logs', 'admin');
const HTTP_LOG_PATH = path.join(LOG_DIR, 'admin.http.log');
const HTTP_LOG_ENABLED = process.env.HTTP_LOG_ENABLED !== 'false';

// Ensure log directory exists and create write stream
let httpLogStream: fs.WriteStream | null = null;
if (HTTP_LOG_ENABLED) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    httpLogStream = fs.createWriteStream(HTTP_LOG_PATH, { flags: 'a' });
    console.log(`[vite] HTTP logging enabled: ${HTTP_LOG_PATH}`);
  } catch (err) {
    console.warn(`[vite] Failed to setup HTTP logging: ${err}`);
  }
}

/**
 * Log HTTP proxy request/response
 */
function logHttpRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  error?: string
) {
  if (!httpLogStream) return;

  const timestamp = new Date().toISOString();
  let logLine = `${timestamp} ${method} ${url} ${statusCode} ${duration}ms`;
  if (error) {
    logLine += ` ERROR: ${error}`;
  }
  logLine += '\n';

  httpLogStream.write(logLine);
}

/**
 * Workspace health check plugin - provides /__workspace_health endpoint
 * for workspace-cli to verify Vite dev server is running
 */
function workspaceHealthPlugin() {
  return {
    name: 'workspace-health',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/__workspace_health') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', service: 'admin' }));
          return;
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async (): Promise<UserConfig> => {
  // Load env vars from .env and .env.local at build time
  const envSecrets = await envPlugin();

  return {
    plugins: [
      workspaceHealthPlugin(),
      tailwindcss() as any,
      react({
        babel: {
          plugins: [
            // Remove data-testid attributes in production builds
            process.env.NODE_ENV === 'production' && [
              'babel-plugin-react-remove-properties',
              { properties: ['data-testid'] },
            ],
          ].filter(Boolean),
        },
      }),
    ],
    // Inject env secrets into import.meta.env
    define: envSecrets,
    resolve: {
      alias: {
        '@': path.resolve(path.resolve(), 'src'),
      },
    },
    server: {
      port: DEV_PORT,
      strictPort: true, // fail fast if chosen port is taken to avoid silent proxy logs
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (proxyPath) => proxyPath.replace(/^\/api/, ''),
          configure: (proxy) => {
            // Track request start times for duration calculation
            const requestTimes = new Map<string, number>();

            proxy.on('proxyReq', (proxyReq, req) => {
              const requestId = `${req.method}-${req.url}-${Date.now()}`;
              requestTimes.set(requestId, Date.now());
              (req as any).__proxyRequestId = requestId;
            });

            proxy.on('proxyRes', (proxyRes, req) => {
              const requestId = (req as any).__proxyRequestId;
              const startTime = requestTimes.get(requestId) || Date.now();
              const duration = Date.now() - startTime;
              requestTimes.delete(requestId);

              logHttpRequest(
                req.method || 'UNKNOWN',
                req.url || '/',
                proxyRes.statusCode || 0,
                duration
              );
            });

            proxy.on('error', (err, req) => {
              const requestId = (req as any).__proxyRequestId;
              const startTime = requestTimes.get(requestId) || Date.now();
              const duration = Date.now() - startTime;
              requestTimes.delete(requestId);

              logHttpRequest(
                req.method || 'UNKNOWN',
                req.url || '/',
                500,
                duration,
                err.message
              );
            });
          },
        },
      },
    },
    preview: {
      port: DEV_PORT,
      host: true,
    },
  };
});
