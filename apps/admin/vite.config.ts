import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// In dev mode, the root .env is loaded by the npm script (via dotenv-cli or similar)
// In production Docker builds, all env vars come from --build-arg, so dotenv is not needed

// Single canonical admin dev port env: ADMIN_PORT (fallback 5175)
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);

// Derive API target for proxy. Prefer explicit API_ORIGIN, else use SERVER_PORT (single canonical backend port var)
const API_TARGET = process.env.API_ORIGIN || `http://localhost:${process.env.SERVER_PORT || 3001}`;
console.log(`[vite] dev server on :${DEV_PORT} proxy /api -> ${API_TARGET}`);

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
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
    resolve: {
        alias: {
            "@": path.resolve(path.resolve(), "src"),
        },
    },
    server: {
        port: DEV_PORT,
        strictPort: true, // fail fast if chosen port is taken to avoid silent auto-increment hiding proxy logs
        host: true,
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
});
