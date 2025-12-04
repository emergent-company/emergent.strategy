// Minimal OIDC PKCE utilities for SPA with Zitadel
// Strictly typed, no external deps

export type OidcConfig = {
    issuer: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri?: string;
    scopes: string;
    audience?: string;
};

export type TokenResponse = {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    token_type: 'Bearer' | string;
    expires_in: number; // seconds
};

export type DiscoveryDoc = {
    authorization_endpoint: string;
    token_endpoint: string;
    end_session_endpoint?: string;
};

const CODE_VERIFIER_KEY = 'oidc.code_verifier';

async function sha256(input: string): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    return crypto.subtle.digest('SHA-256', enc.encode(input));
}

function base64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randString(len = 64): string {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

let discoveryCache: Record<string, Promise<DiscoveryDoc>> = {};
export async function discover(issuer: string): Promise<DiscoveryDoc> {
    if (!discoveryCache[issuer]) {
        discoveryCache[issuer] = (async () => {
            const url = new URL('/.well-known/openid-configuration', issuer);
            const res = await fetch(url.toString(), { cache: 'no-cache' });
            if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
            const json = (await res.json()) as DiscoveryDoc;
            if (!json.authorization_endpoint || !json.token_endpoint) throw new Error('Invalid discovery document');
            return json;
        })();
    }
    return discoveryCache[issuer];
}

let authInFlight = false;

export async function startAuth(config: OidcConfig) {
    if (authInFlight) return; // suppress duplicate clicks / renders
    authInFlight = true;
    console.log('[OIDC] startAuth called', { issuer: config.issuer, clientId: config.clientId, redirectUri: config.redirectUri, scopes: config.scopes });
    try {
        const disc = await discover(config.issuer);
        const codeVerifier = randString(64);
        const challenge = base64url(await sha256(codeVerifier));
        sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
        console.log('[OIDC] Code verifier stored in sessionStorage');

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes,
            code_challenge: challenge,
            code_challenge_method: 'S256',
        });
        if (config.audience) params.set('audience', config.audience);
        const authUrl = `${disc.authorization_endpoint}?${params.toString()}`;
        console.log('[OIDC] Redirecting to authorization endpoint', { authUrl });
        window.location.assign(authUrl);
    } finally {
        // Do not reset flag; navigation replaces document. If navigation canceled, allow retry after slight delay.
        setTimeout(() => { authInFlight = false; }, 2000);
    }
}

export async function exchangeCodeForTokens(config: OidcConfig, code: string): Promise<TokenResponse> {
    console.log('[OIDC] exchangeCodeForTokens called', { code: code.substring(0, 20) + '...', issuer: config.issuer });
    const disc = await discover(config.issuer);
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY) || '';
    console.log('[OIDC] Code verifier retrieved from sessionStorage', { hasVerifier: !!codeVerifier });
    
    // Check for missing code_verifier before making the request
    // This happens when session storage was cleared (tab closed, browser restart, etc.)
    if (!codeVerifier) {
        console.error('[OIDC] Missing code_verifier - session may have expired or been cleared');
        throw new Error('session_expired');
    }
    
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
    });
    if (config.audience) body.set('audience', config.audience);
    console.log('[OIDC] Token exchange request', { tokenEndpoint: disc.token_endpoint, clientId: config.clientId });

    const res = await fetch(disc.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    console.log('[OIDC] Token exchange response', { status: res.status, ok: res.ok });
    if (!res.ok) {
        // Log detailed error for diagnostics but surface generic message to user
        let detail: unknown = null;
        try {
            detail = await res.json();
        } catch {
            // ignore body parse errors
        }
        console.error('[OIDC] Token exchange failed', { status: res.status, detail });
        throw new Error('login_failed');
    }
    const tokenResponse = (await res.json()) as TokenResponse;
    console.log('[OIDC] Token exchange successful', { hasAccessToken: !!tokenResponse.access_token, hasIdToken: !!tokenResponse.id_token, expiresIn: tokenResponse.expires_in });
    return tokenResponse;
}

export function parseCallbackParams(): { code?: string; state?: string; error?: string } {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code') || undefined;
    const state = url.searchParams.get('state') || undefined;
    const error = url.searchParams.get('error') || undefined;
    return { code, state, error };
}

/**
 * Check if a valid code_verifier exists in session storage.
 * This is used to detect if the PKCE session is still valid before attempting token exchange.
 */
export function hasValidCodeVerifier(): boolean {
    const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    return !!verifier && verifier.length > 0;
}
