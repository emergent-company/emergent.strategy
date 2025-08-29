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

export async function discover(issuer: string): Promise<DiscoveryDoc> {
    const url = new URL('/.well-known/openid-configuration', issuer);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
    const json = (await res.json()) as DiscoveryDoc;
    if (!json.authorization_endpoint || !json.token_endpoint) throw new Error('Invalid discovery document');
    return json;
}

export async function startAuth(config: OidcConfig) {
    const disc = await discover(config.issuer);
    const codeVerifier = randString(64);
    const challenge = base64url(await sha256(codeVerifier));
    sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

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
    window.location.assign(authUrl);
}

export async function exchangeCodeForTokens(config: OidcConfig, code: string): Promise<TokenResponse> {
    const disc = await discover(config.issuer);
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY) || '';
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
    });
    if (config.audience) body.set('audience', config.audience);

    const res = await fetch(disc.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    return (await res.json()) as TokenResponse;
}

export function parseCallbackParams(): { code?: string; state?: string; error?: string } {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code') || undefined;
    const state = url.searchParams.get('state') || undefined;
    const error = url.searchParams.get('error') || undefined;
    return { code, state, error };
}
