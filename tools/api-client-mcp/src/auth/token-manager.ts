/**
 * Token Manager
 *
 * Handles OAuth token acquisition and caching for the API client.
 * Supports two modes:
 * 1. Static token mode (USE_STATIC_TOKEN=true) - uses predefined test tokens
 * 2. Password grant mode - uses Zitadel OAuth password grant
 */

import { getConfig, debug } from '../config.js';

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp in seconds
  refreshToken?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Static test tokens that are recognized by the server when AUTH_TEST_STATIC_TOKENS=1
 * These map to predefined user/scope configurations in the auth service.
 */
export const STATIC_TOKENS = {
  /** User with all scopes (full access) */
  E2E_ALL: 'e2e-all',
  /** User with org:read scope */
  WITH_SCOPE: 'with-scope',
  /** User with org:read + graph_search:read scopes */
  GRAPH_READ: 'graph-read',
  /** User without any scopes (for 403 testing) */
  NO_SCOPE: 'no-scope',
} as const;

let tokenCache: TokenCache | null = null;
let refreshPromise: Promise<string> | null = null;

/**
 * Check if static token mode is enabled
 */
function useStaticToken(): boolean {
  return process.env.USE_STATIC_TOKEN === 'true';
}

/**
 * Get the static token to use (defaults to e2e-all for full access)
 */
function getStaticToken(): string {
  const token = process.env.STATIC_TOKEN || STATIC_TOKENS.E2E_ALL;
  debug('token-manager', `Using static token: ${token}`);
  return token;
}

/**
 * Check if cached token is valid (with 5 minute buffer)
 */
function isTokenValid(): boolean {
  if (!tokenCache) {
    debug('token-manager', 'No cached token');
    return false;
  }

  // Static tokens don't expire
  if (useStaticToken()) {
    debug('token-manager', 'Static token mode - token never expires');
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  const bufferSeconds = 300; // 5 minutes
  const isValid = tokenCache.expiresAt > now + bufferSeconds;

  debug('token-manager', `Token validity check`, {
    expiresAt: tokenCache.expiresAt,
    now,
    bufferSeconds,
    isValid,
    secondsUntilExpiry: tokenCache.expiresAt - now,
  });

  return isValid;
}

/**
 * Acquire a new access token using password grant
 */
async function acquireToken(): Promise<string> {
  // Static token mode - no network request needed
  if (useStaticToken()) {
    const token = getStaticToken();
    tokenCache = {
      accessToken: token,
      expiresAt: Number.MAX_SAFE_INTEGER, // Never expires
    };
    return token;
  }

  const config = getConfig();

  const tokenUrl = `${config.zitadelIssuer}/oauth/v2/token`;

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: config.zitadelClientId,
    username: config.testUserEmail,
    password: config.testUserPassword,
    scope: 'openid profile email offline_access',
  });

  debug('token-manager', `Acquiring token`, {
    tokenUrl,
    clientId: config.zitadelClientId,
    username: config.testUserEmail,
    scope: 'openid profile email offline_access',
  });
  console.error(`[token-manager] Acquiring token from ${tokenUrl}`);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();

    debug('token-manager', `Token acquisition failed`, {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });

    // Provide helpful error message for common issues
    if (errorText.includes('unsupported_grant_type')) {
      throw new Error(
        `Password grant not enabled in Zitadel. Either:\n` +
          `1. Enable password grant in Zitadel OAuth app settings, or\n` +
          `2. Use static tokens: export USE_STATIC_TOKEN=true\n` +
          `   (requires server to have AUTH_TEST_STATIC_TOKENS=1)`
      );
    }

    throw new Error(
      `Failed to acquire token: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  const data = (await response.json()) as TokenResponse;

  // Cache the token
  const now = Math.floor(Date.now() / 1000);
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in,
    refreshToken: data.refresh_token,
  };

  debug('token-manager', `Token acquired successfully`, {
    expiresIn: data.expires_in,
    expiresAt: tokenCache.expiresAt,
    hasRefreshToken: !!data.refresh_token,
    scope: data.scope,
    tokenType: data.token_type,
    // Show first/last few chars of token for debugging
    tokenPreview:
      data.access_token.slice(0, 10) + '...' + data.access_token.slice(-10),
  });
  console.error(
    `[token-manager] Token acquired, expires in ${data.expires_in}s`
  );

  return data.access_token;
}

/**
 * Refresh the access token using refresh_token grant
 */
async function refreshAccessToken(): Promise<string> {
  // Static tokens don't need refresh
  if (useStaticToken()) {
    return getStaticToken();
  }

  if (!tokenCache?.refreshToken) {
    // No refresh token, acquire new
    return acquireToken();
  }

  const config = getConfig();
  const tokenUrl = `${config.zitadelIssuer}/oauth/v2/token`;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.zitadelClientId,
    refresh_token: tokenCache.refreshToken,
  });

  console.error(`[token-manager] Refreshing token`);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    // Refresh failed, try acquiring new token
    console.error(`[token-manager] Refresh failed, acquiring new token`);
    return acquireToken();
  }

  const data = (await response.json()) as TokenResponse;

  // Update cache
  const now = Math.floor(Date.now() / 1000);
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in,
    refreshToken: data.refresh_token || tokenCache.refreshToken,
  };

  console.error(
    `[token-manager] Token refreshed, expires in ${data.expires_in}s`
  );

  return data.access_token;
}

/**
 * Get a valid access token (from cache or by acquiring/refreshing)
 *
 * This function handles concurrent requests by using a mutex pattern.
 */
export async function getAccessToken(): Promise<string> {
  // If token is valid, return it
  if (isTokenValid() && tokenCache) {
    return tokenCache.accessToken;
  }

  // If refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  // Start refresh and store promise to prevent concurrent refreshes
  refreshPromise = (async () => {
    try {
      if (tokenCache && !useStaticToken()) {
        return await refreshAccessToken();
      } else {
        return await acquireToken();
      }
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Clear the token cache (useful for testing or force re-auth)
 */
export function clearTokenCache(): void {
  tokenCache = null;
  refreshPromise = null;
}

/**
 * Check if we have a cached token (for debugging)
 */
export function hasToken(): boolean {
  return tokenCache !== null;
}

/**
 * Get current auth mode for diagnostics
 */
export function getAuthMode(): 'static' | 'password-grant' {
  return useStaticToken() ? 'static' : 'password-grant';
}
