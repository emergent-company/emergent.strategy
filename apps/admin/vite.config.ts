import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Allow overriding dev server port via environment; priority: ADMIN_APP_PORT > VITE_PORT > PORT; default 5175
const DEV_PORT = Number(process.env.ADMIN_APP_PORT || process.env.VITE_PORT || process.env.PORT || 5175);

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
        host: true,
    },
    preview: {
        port: DEV_PORT,
        host: true,
    },
});
