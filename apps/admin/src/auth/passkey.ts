// Passkey (WebAuthn) helper utilities for the SPA.
// Communicates with backend endpoints under /api/auth/passkey/*

export interface BeginPasskeyResponse<T extends 'login' | 'register'> {
    publicKey: PublicKeyCredentialRequestOptions | PublicKeyCredentialCreationOptions;
    txn: string;
    purpose: T;
}

export interface TokenShape {
    access_token: string;
    id_token?: string;
    expires_in: number; // seconds
}

export const passkeyAvailable = typeof window !== 'undefined' && 'PublicKeyCredential' in window;

// Optional explicit API base; if absent, relies on same-origin (e.g. Vite proxy)
// Define in env: VITE_API_BASE=http://localhost:3001
// Trailing slash not required.
// Cast import.meta for Vite env access.
const API_BASE: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE
    ? (import.meta as unknown as { env?: Record<string, string> }).env!.VITE_API_BASE.replace(/\/$/, '')
    : '';

if (typeof window !== 'undefined') {
    console.log('[passkey] API_BASE =', API_BASE || '(same-origin)');
}

function bufToB64Url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Internal: serialize credential into JSON-safe shape (ArrayBuffers -> base64url)
function credToJSON(cred: PublicKeyCredential): any { // intentional any for dynamic response keys
    const json: any = { id: cred.id, type: cred.type };
    if (cred.rawId) json.rawId = bufToB64Url(cred.rawId);
    const resp: any = (cred as any).response;
    json.response = {};
    for (const k of Object.keys(resp)) {
        const v = resp[k];
        json.response[k] = v instanceof ArrayBuffer ? bufToB64Url(v) : v;
    }
    return json;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
    const full = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const res = await fetch(full, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Request failed (${res.status}) ${full}: ${text || res.statusText}`);
    }
    return res.json() as Promise<T>;
}

export async function beginRegister(email?: string): Promise<BeginPasskeyResponse<'register'>> {
    return postJSON('/api/auth/passkey/begin-register', { email });
}

export async function finishRegister(txn: string, cred: PublicKeyCredential): Promise<TokenShape> {
    return postJSON('/api/auth/passkey/finish-register', { txn, credential: credToJSON(cred) });
}

export async function beginLogin(email?: string): Promise<BeginPasskeyResponse<'login'>> {
    return postJSON('/api/auth/passkey/begin-login', { email });
}

export async function finishLogin(txn: string, cred: PublicKeyCredential): Promise<TokenShape> {
    return postJSON('/api/auth/passkey/finish-login', { txn, credential: credToJSON(cred) });
}

export async function registerPasskeyFlow(email?: string): Promise<TokenShape> {
    if (!passkeyAvailable) throw new Error('Passkeys not supported in this browser');
    const { publicKey, txn } = await beginRegister(email);
    // Normalize challenge and binary fields (backend may serialize as base64url strings)
    const pk = structuredClone(publicKey) as PublicKeyCredentialCreationOptions;
    const toBuf = (b64url: string): ArrayBuffer => {
        const pad = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
        const bin = atob(pad);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    };
    const objectToBuf = (obj: unknown): ArrayBuffer => {
        if (!obj || typeof obj !== 'object') return new ArrayBuffer(0);
        const keys = Object.keys(obj).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        const bytes = new Uint8Array(keys.length);
        for (let i = 0; i < keys.length; i++) bytes[i] = Number((obj as Record<string, unknown>)[keys[i]] as number);
        return bytes.buffer;
    };
    if (pk.challenge && typeof pk.challenge === 'string') pk.challenge = toBuf(pk.challenge as unknown as string);
    else if (pk.challenge && typeof pk.challenge === 'object' && !(pk.challenge instanceof ArrayBuffer)) {
        pk.challenge = objectToBuf(pk.challenge as unknown);
    }
    if (Array.isArray((pk as any).excludeCredentials)) {
        for (const c of (pk as any).excludeCredentials) if (c.id && typeof c.id === 'string') c.id = toBuf(c.id);
    }
    if (pk.user && pk.user.id && typeof pk.user.id === 'string') pk.user.id = new TextEncoder().encode(pk.user.id);
    else if (pk.user && pk.user.id && typeof pk.user.id === 'object' && !(pk.user.id instanceof ArrayBuffer)) {
        pk.user.id = new Uint8Array(objectToBuf(pk.user.id as unknown));
    }
    const cred = (await navigator.credentials.create({ publicKey: pk })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Registration cancelled');
    return finishRegister(txn, cred);
}

export async function loginPasskeyFlow(email?: string): Promise<TokenShape> {
    if (!passkeyAvailable) throw new Error('Passkeys not supported in this browser');
    const { publicKey, txn } = await beginLogin(email);
    const pk = structuredClone(publicKey) as PublicKeyCredentialRequestOptions;
    const toBuf = (b64url: string): ArrayBuffer => {
        const pad = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
        const bin = atob(pad);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    };
    const objectToBuf = (obj: unknown): ArrayBuffer => {
        if (!obj || typeof obj !== 'object') return new ArrayBuffer(0);
        const keys = Object.keys(obj).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        const bytes = new Uint8Array(keys.length);
        for (let i = 0; i < keys.length; i++) bytes[i] = Number((obj as Record<string, unknown>)[keys[i]] as number);
        return bytes.buffer;
    };
    if (pk.challenge && typeof pk.challenge === 'string') pk.challenge = toBuf(pk.challenge as unknown as string);
    else if (pk.challenge && typeof pk.challenge === 'object' && !(pk.challenge instanceof ArrayBuffer)) {
        pk.challenge = objectToBuf(pk.challenge as unknown);
    }
    if (Array.isArray(pk.allowCredentials)) {
        for (const c of pk.allowCredentials) if (c.id && typeof c.id === 'string') c.id = toBuf(c.id as unknown as string);
    }
    const cred = (await navigator.credentials.get({ publicKey: pk })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Authentication cancelled');
    return finishLogin(txn, cred);
}
