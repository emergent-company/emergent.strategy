import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  exchangeCodeForTokens,
  refreshTokens,
  startAuth,
  buildEndSessionUrl,
  type OidcConfig,
  type TokenResponse,
} from '@/auth/oidc';
import { AUTH_STORAGE_KEY, OLD_AUTH_STORAGE_KEY } from '@/constants/storage';

type AuthState = {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  user?: { sub: string; email?: string; name?: string };
};

// Refresh threshold - refresh token when less than 2 minutes remaining
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

export type AuthContextType = {
  isAuthenticated: boolean;
  isInitialized: boolean; // Add this to track if auth state has been loaded from localStorage
  user?: AuthState['user'];
  beginLogin: () => Promise<void>; // triggers OIDC redirect
  logout: () => void;
  getAccessToken: () => string | undefined;
  handleCallback: (code: string) => Promise<void>;
  ensureAuthenticated: () => void; // auto-redirect helper
  refreshAccessToken: () => Promise<boolean>; // attempt token refresh
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

function getConfigFromEnv(): OidcConfig {
  const env: any = (import.meta as any).env || {};
  return {
    issuer: env.VITE_ZITADEL_ISSUER || 'http://localhost:8080',
    clientId: env.VITE_ZITADEL_CLIENT_ID || 'NOT_SET',
    redirectUri:
      env.VITE_ZITADEL_REDIRECT_URI ||
      `${window.location.origin}/auth/callback`,
    postLogoutRedirectUri:
      env.VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI ||
      `${window.location.origin}/auth/logged-out`,
    scopes: env.VITE_ZITADEL_SCOPES || 'openid profile email',
    audience: env.VITE_ZITADEL_AUDIENCE || undefined,
  };
}

function parseJwtPayload(token: string): any | undefined {
  try {
    const [, payload] = token.split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState<AuthState>(() => {
    // Hydrate from localStorage on first mount
    console.log('[AuthProvider] Initializing state from localStorage');
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      console.log('[AuthProvider] Retrieved from localStorage', {
        hasData: !!raw,
        dataLength: raw?.length || 0,
      });
      if (!raw) {
        console.log(
          '[AuthProvider] No auth data in localStorage, starting with empty state'
        );
        return {};
      }
      const parsed = JSON.parse(raw) as AuthState;
      // Drop expired tokens eagerly
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        console.log('[AuthProvider] Token expired, clearing state');
        return {};
      }
      console.log('[AuthProvider] Successfully hydrated state', {
        hasAccessToken: !!parsed.accessToken,
        hasUser: !!parsed.user,
      });
      return parsed ?? {};
    } catch (e) {
      console.error('[AuthProvider] Failed to parse localStorage', e);
      return {};
    }
  });
  const cfg = useMemo(() => getConfigFromEnv(), []);

  // Mark as initialized after first render
  useEffect(() => {
    console.log('[AuthProvider] Marking as initialized');
    setIsInitialized(true);
  }, []);

  // Token application callback must be declared before login usage
  const applyTokenResponse = useCallback((t: TokenResponse) => {
    console.log('[AuthContext] applyTokenResponse called', {
      hasAccessToken: !!t.access_token,
      hasIdToken: !!t.id_token,
      hasRefreshToken: !!t.refresh_token,
      expiresIn: t.expires_in,
    });
    const now = Date.now();
    const expiresAt = now + Math.max(0, (t.expires_in || 0) * 1000) - 10_000;
    const claims = parseJwtPayload(t.id_token || t.access_token || '') || {};
    console.log('[AuthContext] Parsed JWT claims', {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    const next: AuthState = {
      accessToken: t.access_token,
      idToken: t.id_token,
      refreshToken: t.refresh_token,
      expiresAt,
      user: {
        sub: claims.sub,
        email: claims.email,
        name: claims.name || claims.preferred_username,
      },
    };
    setState(next);
    console.log('[AuthContext] State updated, saving to localStorage', {
      key: AUTH_STORAGE_KEY,
    });
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      console.log(
        '[AuthContext] Successfully saved auth state to localStorage'
      );
    } catch (e) {
      console.error('[AuthContext] Failed to save to localStorage', e);
    }
  }, []);

  const authStartRef = React.useRef(false);
  const refreshInProgressRef = React.useRef(false);

  const beginLogin = useCallback(async () => {
    if (authStartRef.current) return;
    authStartRef.current = true;
    await startAuth(cfg);
  }, [cfg]);

  /**
   * Attempt to refresh the access token using the refresh token.
   * Returns true if refresh was successful, false otherwise.
   */
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (refreshInProgressRef.current) {
      console.log('[AuthContext] Token refresh already in progress');
      return false;
    }

    if (!state.refreshToken) {
      console.log('[AuthContext] No refresh token available');
      return false;
    }

    refreshInProgressRef.current = true;
    console.log('[AuthContext] Attempting token refresh');

    try {
      const t = await refreshTokens(cfg, state.refreshToken);
      applyTokenResponse(t);
      console.log('[AuthContext] Token refresh successful');
      return true;
    } catch (e) {
      console.error('[AuthContext] Token refresh failed', e);
      // Don't clear state here - let the 401 handler deal with logout
      return false;
    } finally {
      refreshInProgressRef.current = false;
    }
  }, [cfg, state.refreshToken, applyTokenResponse]);

  /**
   * Logs out the current user and clears all authentication data from localStorage.
   *
   * This function:
   * - Clears the auth state in memory
   * - Removes all auth-related localStorage keys (both legacy and current)
   * - Clears user-scoped config (activeOrgId, activeProjectId) from spec-server key
   * - Preserves non-auth preferences (theme, UI settings)
   * - Redirects to Zitadel's end_session endpoint to terminate the SSO session
   */
  const logout = useCallback(() => {
    // Capture id_token before clearing state (needed for end_session hint)
    const idToken = state.idToken;

    // Clear in-memory auth state
    setState({});

    try {
      // Remove current auth key
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }

    try {
      // Remove legacy auth key for backwards compatibility
      localStorage.removeItem(OLD_AUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }

    try {
      // Clear user-scoped config from spec-server key while preserving UI preferences
      const configRaw = localStorage.getItem('spec-server');
      if (configRaw) {
        const config = JSON.parse(configRaw);
        // Remove user-scoped fields
        delete config.activeOrgId;
        delete config.activeOrgName;
        delete config.activeProjectId;
        delete config.activeProjectName;
        // Preserve UI preferences: theme, direction, fontFamily, sidebarTheme, fullscreen
        localStorage.setItem('spec-server', JSON.stringify(config));
      }
    } catch {
      // If parsing fails or other error, remove the entire key for safety
      try {
        localStorage.removeItem('spec-server');
      } catch {
        // ignore storage errors
      }
    }

    // Redirect to Zitadel's end_session endpoint to fully terminate the SSO session
    // This prevents auto-login when the user returns to the app
    buildEndSessionUrl(cfg, idToken)
      .then((endSessionUrl) => {
        console.log(
          '[AuthContext] Redirecting to Zitadel end_session endpoint'
        );
        window.location.assign(endSessionUrl);
      })
      .catch((err) => {
        // If end_session URL building fails, fall back to local redirect
        console.warn(
          '[AuthContext] Failed to build end_session URL, falling back to local redirect',
          err
        );
        window.location.assign(cfg.postLogoutRedirectUri || '/');
      });
  }, [cfg, state.idToken]);

  const handleCallback = useCallback(
    async (code: string) => {
      console.log('[AuthContext] handleCallback called', {
        codeLength: code.length,
      });
      const t: TokenResponse = await exchangeCodeForTokens(cfg, code);
      console.log(
        '[AuthContext] Token exchange completed, applying token response'
      );
      applyTokenResponse(t);
      console.log('[AuthContext] handleCallback completed successfully');
    },
    [cfg, applyTokenResponse]
  );

  const getAccessToken = useCallback(() => {
    // Prefer access_token if present and not expired
    const expired = state.expiresAt && Date.now() > state.expiresAt;
    if (expired) {
      return undefined;
    }
    const at = state.accessToken;
    if (at) {
      // If token looks like a JWT (three segments), use it
      if (at.split('.').length === 3) {
        return at;
      }
      // Otherwise, fall back to id_token (Zitadel may issue opaque access tokens unless configured)
      if (state.idToken) {
        console.log(
          '[AuthContext] Access token is opaque, falling back to id_token'
        );
        return state.idToken;
      }
      console.log('[AuthContext] Returning opaque access token');
      return at; // last resort: send opaque token
    }
    // If no access token, try id_token
    if (state.idToken) {
      console.log('[AuthContext] No access token, returning id_token');
      return state.idToken;
    }
    console.log('[AuthContext] No tokens available, returning undefined');
    return undefined;
  }, [state.accessToken, state.idToken, state.expiresAt]);

  // Persist auth state changes
  useEffect(() => {
    try {
      if (
        state.accessToken &&
        (!state.expiresAt || Date.now() < state.expiresAt)
      ) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [state]);

  // Proactive token refresh before expiry
  useEffect(() => {
    if (!state.expiresAt || !state.refreshToken) return;

    const timeUntilExpiry = state.expiresAt - Date.now();
    const timeUntilRefresh = timeUntilExpiry - REFRESH_THRESHOLD_MS;

    if (timeUntilRefresh <= 0) {
      // Token is about to expire or already expired, refresh immediately
      console.log('[AuthContext] Token near expiry, refreshing immediately');
      void refreshAccessToken();
      return;
    }

    console.log(
      '[AuthContext] Scheduling token refresh in',
      Math.round(timeUntilRefresh / 1000),
      'seconds'
    );

    const timer = setTimeout(() => {
      console.log('[AuthContext] Proactive token refresh triggered');
      void refreshAccessToken();
    }, timeUntilRefresh);

    return () => clearTimeout(timer);
  }, [state.expiresAt, state.refreshToken, refreshAccessToken]);

  const ensureAuthenticated = useCallback(() => {
    if (!getAccessToken()) void beginLogin();
  }, [getAccessToken, beginLogin]);

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: !!getAccessToken(),
      isInitialized,
      user: state.user,
      beginLogin,
      logout,
      getAccessToken,
      handleCallback,
      ensureAuthenticated,
      refreshAccessToken,
    }),
    [
      getAccessToken,
      isInitialized,
      beginLogin,
      logout,
      state.user,
      handleCallback,
      ensureAuthenticated,
      refreshAccessToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
