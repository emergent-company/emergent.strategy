import type { Page, Locator } from '@playwright/test';

/**
 * Open the profile/org selection dropdown that contains the Organizations section.
 * Tries multiple trigger selectors and falls back to scanning clickable elements.
 */
export async function openOrgMenu(page: Page, opts: { timeoutMs?: number } = {}): Promise<Locator> {
    const timeout = opts.timeoutMs ?? 15_000;
    const start = Date.now();
    const dropdownSelector = '.dropdown-content';
    const wants = /organizations/i;

    async function dropdownVisible(): Promise<Locator | null> {
        const candidate = page.locator(dropdownSelector).filter({ hasText: wants }).first();
        if (await candidate.count() > 0) {
            try { await candidate.waitFor({ state: 'visible', timeout: 500 }); return candidate; } catch { /* not yet */ }
        }
        return null;
    }

    // If already open, return immediately
    const pre = await dropdownVisible();
    if (pre) return pre;

    const triggerSelectors = [
        '.dropdown-end .avatar img',
        '.avatar img[alt="Avatar"]',
        '.avatar img',
        'button:has(.avatar)',
        'button:has-text("Profile")',
        'button:has-text("Account")',
        '.avatar',
    ];

    while (Date.now() - start < timeout) {
        for (const sel of triggerSelectors) {
            const loc = page.locator(sel).first();
            if (await loc.count() === 0) continue;
            try {
                await loc.scrollIntoViewIfNeeded();
                // Some avatar images might be visually hidden; click parent button if exists
                let clickTarget: Locator = loc;
                const parentButton = loc.locator('xpath=ancestor-or-self::button[1]').first();
                if (await parentButton.count() > 0) clickTarget = parentButton;
                await clickTarget.click({ timeout: 1000 });
            } catch { /* try next */ }
            const dd = await dropdownVisible();
            if (dd) return dd;
        }
        // Fallback scan: click any button containing text Organizations or My Profile
        const genericButtons = page.getByRole('button').filter({ hasText: /profile|account|menu/i });
        const count = await genericButtons.count();
        for (let i = 0; i < count; i++) {
            const btn = genericButtons.nth(i);
            try { await btn.click({ timeout: 500 }); } catch { continue; }
            const dd = await dropdownVisible();
            if (dd) return dd;
        }
    }
    const bodySnippet = (await page.locator('body').innerHTML()).slice(0, 500);
    throw new Error('Failed to open Organizations dropdown within timeout. Body snippet: ' + bodySnippet);
}

export async function getOrgRow(page: Page, orgName: string): Promise<Locator> {
    const dropdown = await openOrgMenu(page);
    return dropdown.getByRole('button', { name: new RegExp(orgName, 'i') }).first();
}
