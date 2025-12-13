import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import path from 'path';
import { defineConfig, UserConfig } from 'vite';
import { infisicalPlugin } from './vite-plugin-infisical';

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

// https://vite.dev/config/
export default defineConfig(async (): Promise<UserConfig> => {
  // Load secrets from Infisical at build time
  const infisicalSecrets = await infisicalPlugin();

  return {
    plugins: [
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
    // Inject Infisical secrets into import.meta.env
    define: infisicalSecrets,
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
