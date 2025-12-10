import { defineConfig } from 'vitest/config';

const ci = process.env.CI === '1' || process.env.CI === 'true';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/unit/**/*.spec.ts'],
    // Exclude all tests requiring external infrastructure (DB, APIs, services)
    // These run via vitest.e2e.config.ts with: npm run test:e2e
    exclude: ['tests/e2e/**', 'tests/integration/**'],
    // Setup file to initialize test environment before any modules are loaded
    setupFiles: ['./tests/vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'node_modules/**',
        '**/scripts/**',
        '**/*.d.ts',
        '**/tests/**',
        '**/__tests__/**',
        'reference/**', // exclude embedded reference frontend
        // Bootstrap & CLIs
        'openapi-generate.ts',
        'src/openapi-generate.ts',
        'main.ts', // bootstrap (fallback)
        'src/main.ts', // explicit bootstrap path
        // Nest structural layers (controllers/modules are exercised only via spawned server processes in E2E, not in-process)
        '**/*.module.ts',
        '**/*.controller.ts',
        // Cross-cutting framework plumbing (thin wrappers / a11y / infra)
        '**/decorators/**',
        '**/interceptors/**',
        '**/pipes/**',
        '**/filters/**',
        '**/dto/**', // DTOs are structural types
        'vitest.config.ts',
        'vitest.e2e.config.ts',
        // Do not measure test implementation files themselves
        'src/**/*.spec.ts',
      ],
      ...(ci
        ? {
            thresholds: {
              // Enforced only in CI to keep local focused runs frictionless.
              lines: 70,
              statements: 70,
              functions: 70,
              branches: 65,
            },
          }
        : {}),
    },
  },
});
