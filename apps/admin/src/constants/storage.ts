/**
 * localStorage key constants
 * Centralized storage keys to avoid magic strings throughout the codebase
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
