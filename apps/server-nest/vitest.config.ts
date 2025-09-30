import { defineConfig } from 'vitest/config';

const ci = process.env.CI === '1' || process.env.CI === 'true';

export default defineConfig({
    test: {
        globals: true,
        include: ['tests/**/*.spec.ts', 'src/**/__tests__/**/*.spec.ts'],
        // Exclude E2E specs from the main coverage run; they have a dedicated config (vitest.e2e.config.ts)
        exclude: ['tests/e2e/**'],
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
                'src/**/*.spec.ts'
            ],
            ...(ci ? {
                thresholds: {
                    // Enforced only in CI to keep local focused runs frictionless.
                    lines: 70,
                    statements: 70,
                    functions: 70,
                    branches: 65,
                }
            } : {}),
        },
    },
});
