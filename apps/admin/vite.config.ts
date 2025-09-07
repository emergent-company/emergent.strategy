import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import fs from 'fs';
import dotenv from 'dotenv';

// Load root .env early so proxy picks up API_* vars when running from package script
const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
}

// Single canonical admin dev port env: ADMIN_PORT (fallback 5175)
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);

// Derive API target for proxy. Prefer explicit API_ORIGIN, else use SERVER_PORT (single canonical backend port var)
const API_TARGET = process.env.API_ORIGIN || `http://localhost:${process.env.SERVER_PORT || 3001}`;
console.log(`[vite] dev server on :${DEV_PORT} proxy /api -> ${API_TARGET}`);

// https://vite.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react()],
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
                rewrite: (path) => path,
            },
        },
    },
    preview: {
        port: DEV_PORT,
        host: true,
    },
});
