import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService, MOCK_SCOPES } from '../../../src/modules/auth/auth.service';

// We will mock 'jose' to control jwtVerify behavior & JWKS creation.
vi.mock('jose', () => {
    return {
        createRemoteJWKSet: vi.fn(() => ({ jwks: true })),
        jwtVerify: vi.fn(async (token: string) => {
            if (token === 'jwt-error') throw new Error('verify-fail');
            // simulate various payload claim shapes based on token value
            if (token === 'jwt-scp-array') {
                return { payload: { sub: 'user-abc', scp: [MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse] } } as any;
            }
            if (token === 'jwt-scp-string') {
                return { payload: { sub: 'user-def', scp: `${MOCK_SCOPES.orgRead} ${MOCK_SCOPES.chatUse}` } } as any;
            }
            if (token === 'jwt-permissions') {
                return { payload: { sub: 'user-ghi', permissions: `${MOCK_SCOPES.orgRead},${MOCK_SCOPES.chatUse}` } } as any;
            }
            if (token === 'jwt-email-debug') {
                return { payload: { sub: 'user-jkl', email: 'a@example.com', scope: MOCK_SCOPES.orgRead } } as any;
            }
            return { payload: { sub: 'plain-sub', scope: MOCK_SCOPES.orgRead } } as any;
        }),
    };
});

function withEnv(vars: Record<string, string>) {
    const backups: Record<string, string | undefined> = {};
    beforeEach(() => {
        for (const k of Object.keys(vars)) { backups[k] = process.env[k]; process.env[k] = vars[k]; }
    });
    afterEach(() => {
        for (const k of Object.keys(vars)) { const prev = backups[k]; if (prev === undefined) delete process.env[k]; else process.env[k] = prev; }
    });
}

describe('AuthService real JWT mode (mocked jose)', () => {
    withEnv({ AUTH_ISSUER: 'issuer', AUTH_JWKS_URI: 'https://example/jwks', AUTH_AUDIENCE: 'aud' });
    let svc: AuthService;
    beforeEach(() => {
        // Mock UserProfileService
        const mockUserProfileService = {
            upsertBase: vi.fn(),
            get: vi.fn(async (zitadelUserId: string) => ({
                id: `uuid-${zitadelUserId}`,
                zitadelUserId,
                displayName: 'Test User',
                email: 'test@example.com',
            })),
        } as any;
        // Mock ZitadelService
        const mockZitadelService = {
            isConfigured: vi.fn(() => false), // Return false to skip Zitadel introspection path
        } as any;
        svc = new AuthService(mockUserProfileService, mockZitadelService);
    });

    it('fast-path static token bypass still works when real mode configured', async () => {
        const u = await svc.validateToken('with-scope');
        expect(u?.scopes).toContain(MOCK_SCOPES.orgRead); // returned from static branch
    });

    it('initializes JWKS and verifies token (scp array)', async () => {
        const u = await svc.validateToken('jwt-scp-array');
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
    });

    it('parses scp string scopes', async () => {
        const u = await svc.validateToken('jwt-scp-string');
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
    });

    it('parses permissions CSV scopes', async () => {
        const u = await svc.validateToken('jwt-permissions');
        expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
    });

    it('adds debug fields when DEBUG_AUTH_CLAIMS=1', async () => {
        process.env.DEBUG_AUTH_CLAIMS = '1';
        const u = await svc.validateToken('jwt-email-debug');
        expect(u?._debugClaimKeys).toBeDefined();
        expect(u?._debugScopeSource).toBe('string');
        delete process.env.DEBUG_AUTH_CLAIMS;
    });

    it('jwtVerify error returns null', async () => {
        const u = await svc.validateToken('jwt-error');
        expect(u).toBeNull();
    });
});

describe('AuthService mapClaims additional branches', () => {
    withEnv({ AUTH_ISSUER: 'issuer', AUTH_JWKS_URI: 'https://example/jwks' });
    let svc: AuthService;
    beforeEach(() => {
        // Mock UserProfileService
        const mockUserProfileService = {
            upsertBase: vi.fn(),
            get: vi.fn(async (zitadelUserId: string) => ({
                id: `uuid-${zitadelUserId}`,
                zitadelUserId,
                displayName: 'Test User',
                email: 'test@example.com',
            })),
        } as any;
        // Mock ZitadelService
        const mockZitadelService = {
            isConfigured: vi.fn(() => false),
        } as any;
        svc = new AuthService(mockUserProfileService, mockZitadelService);
    });

    it('debug scope source none', async () => {
        process.env.DEBUG_AUTH_CLAIMS = '1';
        // @ts-expect-error private access
        const u = await svc.mapClaims({ sub: 'abc-no-scope' });
        expect(u?._debugScopeSource).toBe('none');
        delete process.env.DEBUG_AUTH_CLAIMS;
    });

    it('crypto failure fallback UUID path', async () => {
        // @ts-expect-error private access
        const u = await svc.mapClaims({ sub: 'not-a-uuid' });
        expect(u?.sub).toBe('not-a-uuid');
    });
});
