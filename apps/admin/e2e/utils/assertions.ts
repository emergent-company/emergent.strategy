import { expect } from '@playwright/test';

/** Assert there were no captured console or page errors; include contextual route in failure messages. */
export function expectNoRuntimeErrors(routeLabel: string, consoleErrors: string[], pageErrors: string[]): void {
    expect(consoleErrors, `console errors on ${routeLabel}:\n${consoleErrors.join('\n')}`).toHaveLength(0);
    expect(pageErrors, `page errors on ${routeLabel}:\n${pageErrors.join('\n')}`).toHaveLength(0);
}
