import type { Page } from '@playwright/test';
import { navigate } from './navigation';

export interface PerfSample {
    route: string;
    msToMainVisible: number;
    msToFirstHeading?: number;
}

export async function measureRoute(page: Page, route: string): Promise<PerfSample> {
    const start = Date.now();
    await navigate(page, route);
    // Some pages currently lack a semantic <main>; fall back to first significant container.
    const mainOrFallback = page.locator('main,[role="main"]');
    if (await mainOrFallback.first().count().then(c => c > 0)) {
        await mainOrFallback.first().waitFor({ state: 'visible', timeout: 30_000 });
    } else {
        // Fallback: wait for body content containing any interactive region (heuristic: presence of container div)
        await page.locator('body div').first().waitFor({ state: 'visible', timeout: 30_000 });
    }
    const mainVisible = Date.now();
    let headingVisible: number | undefined;
    const heading = page.getByRole('heading').first();
    if (await heading.isVisible().catch(() => false)) headingVisible = Date.now();
    return {
        route,
        msToMainVisible: mainVisible - start,
        msToFirstHeading: headingVisible ? headingVisible - start : undefined,
    };
}