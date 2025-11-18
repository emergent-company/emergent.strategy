import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      // Exclude Playwright E2E specs (run via Playwright, not Vitest)
      'tests/e2e/**',
      'playwright-report/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'node_modules/**',
        'tests/e2e/**',
        'playwright-report/**',
        'storybook-static/**',
        '**/*.d.ts',
        '**/*.stories.*',
        'tests/setup.ts',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 65,
        branches: 60,
      },
    },
  },
});
