import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService, MOCK_SCOPES } from '../src/modules/auth/auth.service';

// Helper to run service with controlled env (mock mode => no issuer/jwks)
function createService(env: Record<string, string | undefined> = {}) {
    const backup: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) {
        backup[k] = process.env[k];
        const val = env[k];
        if (val === undefined) {
            delete process.env[k];
        } else {
            process.env[k] = val;
        }
    }
    const svc = new AuthService();
    return {
        svc,
        restore: () => {
            for (const k of Object.keys(env)) {
                const prev = backup[k];
                if (prev === undefined) delete process.env[k]; else process.env[k] = prev;
            }
        }
    };
}

describe('AuthService.validateToken (mock/static mode)', () => {
    let restore: () => void;
    let svc: AuthService;
    beforeEach(() => {
        ({ svc, restore } = createService({ AUTH_ISSUER: undefined, AUTH_JWKS_URI: undefined }));
    });
    afterEach(() => restore());

    it('returns null when token undefined', async () => {
        const res = await svc.validateToken(undefined);
        expect(res).toBeNull();
    });

    it('static token: no-scope', async () => {
        const res = await svc.validateToken('no-scope');
        expect(res).toEqual({ sub: '00000000-0000-0000-0000-000000000001', scopes: [] });
    });

    it('static token: with-scope', async () => {
        const res = await svc.validateToken('with-scope');
        expect(res?.scopes).toEqual([MOCK_SCOPES.orgRead]);
    });

    it('static token: graph-read (adds graph scopes)', async () => {
        const res = await svc.validateToken('graph-read');
        expect(res?.scopes).toContain(MOCK_SCOPES.graphSearchRead);
    });

    it('static token: e2e-all has full scope catalog', async () => {
        const res = await svc.validateToken('e2e-all');
        expect(res?.scopes?.length).toBe(Object.values(MOCK_SCOPES).length);
    });

    it('static token: arbitrary e2e-* token yields all scopes', async () => {
        const res = await svc.validateToken('e2e-something');
        expect(res?.scopes?.length).toBe(Object.values(MOCK_SCOPES).length);
    });

    it('malformed token (punctuation) => null', async () => {
        const res = await svc.validateToken('bad!token');
        expect(res).toBeNull();
    });

    it('default mock mode (unrecognized token) returns orgRead scope', async () => {
        const res = await svc.validateToken('randomValue');
        expect(res?.scopes).toEqual([MOCK_SCOPES.orgRead]);
    });
});

describe('AuthService.mapClaims variations', () => {
    // We access private method via casting for focused unit tests.
    let svc: AuthService; let restore: () => void;
    beforeEach(() => { ({ svc, restore } = createService({ AUTH_ISSUER: 'issuer', AUTH_JWKS_URI: 'https://jwks.example' })); });
    afterEach(() => restore());

    it('returns null if no sub', () => {
        // @ts-expect-error private access for testing
        expect(svc.mapClaims({})).toBeNull();
    });

    it('preserves UUID sub', () => {
        const sub = '11111111-2222-3333-4444-555555555555';
        // @ts-expect-error private access
        const u = svc.mapClaims({ sub });
        expect(u?.sub).toBe(sub);
    });

    it('normalizes non-uuid sub deterministically', () => {
        // @ts-expect-error private access
        const u1 = svc.mapClaims({ sub: 'alice@example.com' });
        // @ts-expect-error private access
        const u2 = svc.mapClaims({ sub: 'alice@example.com' });
        expect(u1?.sub).toBe(u2?.sub);
        // Service now preserves sub as-is for direct ownership comparisons
        expect(u1?.sub).toBe('alice@example.com');
    });

    it('parses scopes from space-separated string', () => {
        // @ts-expect-error private access
        const u = svc.mapClaims({ sub: 's', scope: `${MOCK_SCOPES.orgRead} ${MOCK_SCOPES.chatUse}` });
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
    });

    it('parses scopes from comma-separated string', () => {
        // @ts-expect-error private access
        const u = svc.mapClaims({ sub: 's', scope: `${MOCK_SCOPES.orgRead},${MOCK_SCOPES.chatUse}` });
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
    });

    it('deduplicates scopes', () => {
        // @ts-expect-error private access
        const u = svc.mapClaims({ sub: 's', scope: `${MOCK_SCOPES.orgRead} ${MOCK_SCOPES.orgRead}` });
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead]);
    });

    it('accepts array scopes', () => {
        // @ts-expect-error private access
        const u = svc.mapClaims({ sub: 's', scopes: [MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse] });
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
    });

    it('handles no scopes gracefully', () => {
        // @ts-expect-error private access
        const u = svc.mapClaims({ sub: 's' });
        expect(u?.scopes).toBeUndefined();
    });
});
