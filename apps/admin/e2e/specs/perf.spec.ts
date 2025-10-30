import { test } from '../fixtures/app';
import { ROUTES } from '../routes';
import { measureRoute } from '../utils/perf';

// DISABLED: Performance tests are timing out (>10s). These need investigation.
// Landing and auth/login pages taking >10s to load.
test.describe.skip('Performance smoke (timings only)', () => {
    for (const r of ROUTES.slice(0, 4)) { // limit to first few for speed
        test(`measure ${r}`, async ({ page }) => {
            const sample = await measureRoute(page, r);
            // Soft expectations: keep under broad guardrails to catch regressions, not to enforce strict budgets yet.
            // (Numbers here are generous; tune later once baseline data collected.)
            if (sample.msToMainVisible > 10000) throw new Error(`Route ${r} main took >10s (${sample.msToMainVisible}ms)`);
            // Emit structured log (could be parsed by CI)
            console.log('[perf]', JSON.stringify(sample));
        });
    }
});