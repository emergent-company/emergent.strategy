import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, UserConfig } from 'vite';
import { infisicalPlugin } from './vite-plugin-infisical';

// In dev mode, the root .env is loaded by the npm script (via dotenv-cli or similar)
// In production Docker builds, all env vars come from --build-arg, so dotenv is not needed

// Single canonical admin dev port env: ADMIN_PORT (fallback 5175)
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);

// Derive API target for proxy. Prefer explicit API_ORIGIN, else use SERVER_PORT (single canonical backend port var)
const API_TARGET = process.env.API_ORIGIN || `http://localhost:${process.env.SERVER_PORT || 3001}`;
console.log(`[vite] dev server on :${DEV_PORT} proxy /api -> ${API_TARGET}`);

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
                        { properties: ['data-testid'] }
                    ]
                ].filter(Boolean)
            }
        })
    ],
    // Inject Infisical secrets into import.meta.env
    define: infisicalSecrets,
    resolve: {
        alias: {
            "@": path.resolve(path.resolve(), "src"),
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
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
        },
    },
        preview: {
            port: DEV_PORT,
            host: true,
        },
    };
});
