import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['tests/e2e/**/*.e2e.spec.ts'],
        watch: false,
        setupFiles: ['tests/e2e/global-org-cleanup.ts']
    },
});
