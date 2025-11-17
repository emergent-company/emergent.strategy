/**
 * localStorage key constants
 * Centralized storage keys to avoid magic strings throughout the codebase
 *
 * ## Logout Behavior
 *
 * When a user logs out, the following keys are cleared:
 * - AUTH_STORAGE_KEY: Removed entirely (contains JWT tokens)
 * - OLD_AUTH_STORAGE_KEY: Removed entirely (legacy auth tokens)
 * - CONFIG_STORAGE_KEY: User-scoped fields are cleared (activeOrgId, activeOrgName,
 *   activeProjectId, activeProjectName) while UI preferences are preserved
 *   (theme, direction, fontFamily, sidebarTheme, fullscreen)
 *
 * Keys that persist across logout:
 * - Theme preferences (theme, direction, fontFamily)
 * - UI settings (sidebarTheme, fullscreen)
 */

/**
 * Key for storing authentication state (tokens, user info)
 * @cleared-on-logout Removed entirely
 */
export const AUTH_STORAGE_KEY = 'spec-server-auth';

/**
 * Legacy auth storage key - used for migration from old key
 * @deprecated Use AUTH_STORAGE_KEY instead
 * @cleared-on-logout Removed entirely
 */
export const OLD_AUTH_STORAGE_KEY = '__nexus_auth_v1__';

/**
 * Key for storing application configuration (theme, org/project preferences)
 * @cleared-on-logout User-scoped fields (activeOrgId, activeProjectId) are cleared;
 * UI preferences (theme, direction, fontFamily, sidebarTheme, fullscreen) are preserved
 */
export const CONFIG_STORAGE_KEY = 'spec-server';
