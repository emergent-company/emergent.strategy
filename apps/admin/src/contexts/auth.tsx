import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { exchangeCodeForTokens, startAuth, type OidcConfig, type TokenResponse } from '@/auth/oidc';

type AuthState = {
    accessToken?: string;
    idToken?: string;
    expiresAt?: number; // epoch ms
    user?: { sub: string; email?: string; name?: string };
};

type AuthContextType = {
    isAuthenticated: boolean;
    user?: AuthState['user'];
    beginLogin: () => Promise<void>; // triggers OIDC redirect
    logout: () => void;
    getAccessToken: () => string | undefined;
    handleCallback: (code: string) => Promise<void>;
    ensureAuthenticated: () => void; // auto-redirect helper
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'spec-server-auth';

function getConfigFromEnv(): OidcConfig {
    const env: any = (import.meta as any).env || {};
    return {
        issuer: env.VITE_ZITADEL_ISSUER || 'http://localhost:8080',
        clientId: env.VITE_ZITADEL_CLIENT_ID || 'NOT_SET',
        redirectUri: env.VITE_ZITADEL_REDIRECT_URI || `${window.location.origin}/auth/callback`,
        postLogoutRedirectUri: env.VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI || `${window.location.origin}/`,
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>(() => {
        // Hydrate from localStorage on first mount
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw) as AuthState;
            // Drop expired tokens eagerly
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) return {};
            return parsed ?? {};
        } catch {
            return {};
        }
    });
    const env: any = (import.meta as any).env || {};
    const cfg = useMemo(() => getConfigFromEnv(), []);

    // Token application callback must be declared before login usage
    const applyTokenResponse = useCallback((t: TokenResponse) => {
        const now = Date.now();
        const expiresAt = now + Math.max(0, (t.expires_in || 0) * 1000) - 10_000;
        const claims = parseJwtPayload(t.id_token || t.access_token || '') || {};
        const next: AuthState = {
            accessToken: t.access_token,
            idToken: t.id_token,
            expiresAt,
            user: {
                sub: claims.sub,
                email: claims.email,
                name: claims.name || claims.preferred_username,
            },
        };
        setState(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }, []);

    const authStartRef = React.useRef(false);
    const beginLogin = useCallback(async () => {
        if (authStartRef.current) return;
        authStartRef.current = true;
        await startAuth(cfg);
    }, [cfg]);

    const logout = useCallback(() => {
        setState({});
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore storage errors
        }
        try {
            // Optional: use end_session endpoint via redirect; keeping a local clear is fine for dev
            window.location.assign(cfg.postLogoutRedirectUri || '/');
        } catch {
            // ignore
        }
    }, [cfg.postLogoutRedirectUri]);


    const handleCallback = useCallback(async (code: string) => {
        const t: TokenResponse = await exchangeCodeForTokens(cfg, code);
        applyTokenResponse(t);
    }, [cfg, applyTokenResponse]);

    const getAccessToken = useCallback(() => {
        // Prefer access_token if present and not expired
        const expired = state.expiresAt && Date.now() > state.expiresAt;
        if (expired) return undefined;
        const at = state.accessToken;
        if (at) {
            // If token looks like a JWT (three segments), use it
            if (at.split('.').length === 3) return at;
            // Otherwise, fall back to id_token (Zitadel may issue opaque access tokens unless configured)
            if (state.idToken) return state.idToken;
            return at; // last resort: send opaque token
        }
        // If no access token, try id_token
        if (state.idToken) return state.idToken;
        return undefined;
    }, [state.accessToken, state.idToken, state.expiresAt]);

    // Persist auth state changes
    useEffect(() => {
        try {
            if (state.accessToken && (!state.expiresAt || Date.now() < state.expiresAt)) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch {
            // ignore storage errors
        }
    }, [state]);


    const ensureAuthenticated = useCallback(() => {
        if (!getAccessToken()) void beginLogin();
    }, [getAccessToken, beginLogin]);

    const value = useMemo<AuthContextType>(() => ({
        isAuthenticated: !!getAccessToken(),
        user: state.user,
        beginLogin,
        logout,
        getAccessToken,
        handleCallback,
        ensureAuthenticated,
    }), [getAccessToken, beginLogin, logout, state.user, handleCallback, ensureAuthenticated]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
