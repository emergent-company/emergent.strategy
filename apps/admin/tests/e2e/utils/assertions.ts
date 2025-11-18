import { expect } from '@playwright/test';

/** Assert there were no captured console, page, or API errors; include contextual route in failure messages. */
export function expectNoRuntimeErrors(
    routeLabel: string,
    consoleErrors: string[],
    pageErrors: string[],
    apiErrors?: string[]
): void {
    expect(consoleErrors, `console errors on ${routeLabel}:\n${consoleErrors.join('\n')}`).toHaveLength(0);
    expect(pageErrors, `page errors on ${routeLabel}:\n${pageErrors.join('\n')}`).toHaveLength(0);
    if (apiErrors) {
        expect(apiErrors, `API errors on ${routeLabel}:\n${apiErrors.join('\n')}`).toHaveLength(0);
    }
}
