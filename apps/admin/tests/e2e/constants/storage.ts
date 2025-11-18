/**
 * localStorage key constants for E2E tests
 * These should match the constants in src/constants/storage.ts
 */

/**
 * Key for storing authentication state (tokens, user info)
 */
export const AUTH_STORAGE_KEY = 'spec-server-auth';

/**
 * Legacy auth storage key - used for migration from old key
 * @deprecated Use AUTH_STORAGE_KEY instead
 */
export const OLD_AUTH_STORAGE_KEY = '__nexus_auth_v1__';

/**
 * Key for storing application configuration (theme, org/project preferences)
 */
export const CONFIG_STORAGE_KEY = 'spec-server';

/**
 * Base URL for the admin app (frontend)
 * Uses E2E_BASE_URL if set, otherwise constructs from ADMIN_PORT
 */
export const BASE_URL =
  process.env.E2E_BASE_URL ||
  `http://localhost:${process.env.ADMIN_PORT || 5176}`;

/**
 * Base URL for the backend API
 * Uses E2E_API_BASE_URL if set, otherwise constructs from SERVER_PORT
 */
export const API_BASE_URL =
  process.env.E2E_API_BASE_URL ||
  `http://localhost:${process.env.SERVER_PORT || 3001}`;
