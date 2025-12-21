/**
 * Centralized API configuration utilities.
 *
 * This module provides consistent API URL construction across the application.
 * All API calls should use these utilities to ensure proper routing through
 * the proxy layer (Vite dev server in development, nginx in production).
 *
 * For React components, prefer using the `useApi` hook from `@/hooks/use-api.ts`
 * which provides additional functionality like auth headers and error handling.
 *
 * Use these utilities directly only in non-React code (e.g., loggers, utilities).
 */

/**
 * Get the API base URL from environment.
 *
 * Returns empty string by default - all API paths should be relative
 * and go through the proxy (Vite in dev, nginx in prod).
 *
 * The VITE_API_BASE env var can be set to override for special cases
 * like connecting to a different backend during development.
 *
 * @returns The API base URL (empty string if not configured)
 *
 * @example
 * // Default (empty string) - uses relative URLs through proxy
 * getApiBase() // => ''
 *
 * // With VITE_API_BASE set
 * getApiBase() // => 'https://api.example.com'
 */
export function getApiBase(): string {
  const env = (import.meta as any).env || {};
  return env.VITE_API_BASE || '';
}

/**
 * Build a full API URL with the configured base.
 *
 * Ensures consistent URL construction across the app.
 * The path should include the /api/ prefix.
 *
 * @param path - The API path (e.g., '/api/health', '/api/users')
 * @returns Full URL with base prepended
 *
 * @example
 * buildApiUrl('/api/health') // => '/api/health' (default)
 * buildApiUrl('/api/users/me') // => '/api/users/me'
 *
 * // With VITE_API_BASE='https://api.example.com'
 * buildApiUrl('/api/health') // => 'https://api.example.com/api/health'
 */
export function buildApiUrl(path: string): string {
  const base = getApiBase();
  return `${base}${path}`;
}
