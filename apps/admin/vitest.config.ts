import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
    plugins: [tailwindcss(), react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@/utils": path.resolve(__dirname, "src/utils"),
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./tests/setup.ts",
        exclude: [
            "node_modules/**",
            "dist/**",
            // Exclude Playwright E2E specs (run via Playwright, not Vitest)
            "e2e/**",
            "playwright-report/**",
        ],
        coverage: {
            provider: "v8",
        },
    },
});
