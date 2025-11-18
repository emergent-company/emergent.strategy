import type { Page } from '@playwright/test';
import { BASE_URL } from '../constants/storage';

/**
 * Returns the canonical origin for tests, resolving the port precedence used in playwright.config.
 * Falls back to localhost:5176 (configured ADMIN_PORT) if no env overrides are present.
 */
export function getOrigin(): string {
  return BASE_URL;
}

/**
 * Navigate to a path ("/admin/..." or full URL) with a domcontentloaded wait.
 * Uses explicit absolute URL construction to avoid failures if baseURL isn't applied.
 */
export async function navigate(page: Page, pathOrUrl: string): Promise<void> {
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${getOrigin()}${pathOrUrl}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

/** Convenience assertion to ensure we ended up on a path segment (regex tested) */
export async function expectUrlContains(
  page: Page,
  pattern: RegExp
): Promise<void> {
  // Wait briefly for potential redirects then assert
  await page.waitForURL(pattern, { timeout: 30_000 });
}
