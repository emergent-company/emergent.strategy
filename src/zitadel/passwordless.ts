/**
 * ZITADEL Passwordless (Passkey) integration helpers.
 * This module wraps the ZITADEL passwordless begin/finish APIs.
 * NOTE: Endpoint paths are placeholders and may need adjustment to match the deployed ZITADEL version.
 * Uses the global fetch available in Node 18+ / modern runtimes.
 */

export interface ZitadelPasswordlessCreationOptions {
    publicKey: PublicKeyCredentialCreationOptions;
    flowId: string; // Transaction / flow handle from ZITADEL
}

export interface ZitadelPasswordlessRequestOptions {
    publicKey: PublicKeyCredentialRequestOptions;
    flowId: string;
}

export interface ZitadelTokenResponse {
    access_token: string;
    id_token?: string;
    expires_in: number;
    refresh_token?: string;
    token_type?: string;
}

export interface BeginRegistrationParams { email?: string; }
export interface BeginLoginParams { email?: string; }

// Minimal shape of a serialized WebAuthn credential we expect from the frontend.
export interface SerializedPublicKeyCredential {
    id: string;
    rawId: string; // base64url
    type: 'public-key';
    response: Record<string, unknown>; // attestation / assertion response (ArrayBuffers already b64url-encoded client side)
    clientExtensionResults?: Record<string, unknown>;
    authenticatorAttachment?: string;
}

export interface FinishRegistrationParams {
    flowId: string;
    credential: SerializedPublicKeyCredential;
}

export interface FinishLoginParams {
    flowId: string;
    credential: SerializedPublicKeyCredential;
}

const DEFAULTS = {
    REGISTER_BEGIN: '/api/v2/passwordless/registration/begin',
    REGISTER_FINISH: '/api/v2/passwordless/registration/finish',
    LOGIN_BEGIN: '/api/v2/passwordless/login/begin',
    LOGIN_FINISH: '/api/v2/passwordless/login/finish',
};

function env(name: string, fallback?: string): string {
    const v = process.env[name];
    if (!v && fallback === undefined) throw new Error(`Missing required env var ${name}`);
    return v || fallback || '';
}

let warnedLegacyIssuer = false;
function resolveIssuer(): string {
    if (process.env.ZITADEL_ISSUER) return process.env.ZITADEL_ISSUER;
    if (process.env.ZITADEL_ISSUER_URL) {
        if (!warnedLegacyIssuer) {
            console.warn('[zitadel] Using legacy env var ZITADEL_ISSUER_URL; please migrate to ZITADEL_ISSUER');
            warnedLegacyIssuer = true;
        }
        return process.env.ZITADEL_ISSUER_URL;
    }
    return env('ZITADEL_ISSUER');
}

let warnedServiceKey = false;
function serviceKey(): string {
    const v = process.env.ZITADEL_SERVICE_KEY || process.env.ZITADEL_SERVICE_TOKEN;
    if (!v) throw new Error('Missing ZITADEL_SERVICE_KEY (or fallback ZITADEL_SERVICE_TOKEN) for passwordless integration');
    if (!process.env.ZITADEL_SERVICE_KEY && !warnedServiceKey) {
        console.warn('[zitadel] Using fallback env var ZITADEL_SERVICE_TOKEN; prefer ZITADEL_SERVICE_KEY');
        warnedServiceKey = true;
    }
    return v;
}

async function zFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const issuer = resolveIssuer();
    const url = new URL(path, issuer).toString();
    const res = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey()}`,
            ...(init?.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Zitadel request failed ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<T>;
}

export async function beginRegistration(params: BeginRegistrationParams): Promise<ZitadelPasswordlessCreationOptions> {
    const path = process.env.ZITADEL_PWLESS_REGISTER_BEGIN_PATH || DEFAULTS.REGISTER_BEGIN;
    // Hypothetical payload structure; adjust to real API spec.
    const body = { email: params.email };
    return zFetch<ZitadelPasswordlessCreationOptions>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function finishRegistration(params: FinishRegistrationParams): Promise<ZitadelTokenResponse | { code: string; expires_in?: number }> {
    const path = process.env.ZITADEL_PWLESS_REGISTER_FINISH_PATH || DEFAULTS.REGISTER_FINISH;
    const body = { flowId: params.flowId, credential: params.credential };
    return zFetch<any>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function beginLogin(params: BeginLoginParams): Promise<ZitadelPasswordlessRequestOptions> {
    const path = process.env.ZITADEL_PWLESS_LOGIN_BEGIN_PATH || DEFAULTS.LOGIN_BEGIN;
    const body = { email: params.email };
    return zFetch<ZitadelPasswordlessRequestOptions>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function finishLogin(params: FinishLoginParams): Promise<ZitadelTokenResponse | { code: string; expires_in?: number }> {
    const path = process.env.ZITADEL_PWLESS_LOGIN_FINISH_PATH || DEFAULTS.LOGIN_FINISH;
    const body = { flowId: params.flowId, credential: params.credential };
    return zFetch<any>(path, { method: 'POST', body: JSON.stringify(body) });
}

// If finish methods return an authorization code instead of tokens, exchange it using standard OIDC token endpoint.
export async function exchangeAuthCode(code: string): Promise<ZitadelTokenResponse> {
    const issuer = resolveIssuer();
    const clientId = env('ZITADEL_CLIENT_ID');
    const redirectUri = env('ZITADEL_REDIRECT_URI', '');
    const tokenEndpoint = new URL('/oauth/v2/token', issuer).toString();
    const form = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
    });
    if (redirectUri) form.set('redirect_uri', redirectUri);
    // No PKCE code_verifier here since this path is backend-driven, unless Zitadel mandates one for passwordless; adjust if required.
    const res = await fetch(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token exchange failed ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<ZitadelTokenResponse>;
}

export function zitadelPasswordlessEnabled(): boolean {
    const issuer = process.env.ZITADEL_ISSUER || process.env.ZITADEL_ISSUER_URL;
    return !!(issuer && (process.env.ZITADEL_SERVICE_KEY || process.env.ZITADEL_SERVICE_TOKEN));
}
