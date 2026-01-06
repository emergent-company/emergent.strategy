import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuthService,
  MOCK_SCOPES,
} from '../../../src/modules/auth/auth.service';
import type { IntrospectionResult } from '../../../src/modules/auth/zitadel.service';

// Mock ZitadelService
const createMockZitadelService = () =>
  ({
    isConfigured: vi.fn(() => false),
    introspect: vi.fn(),
    getAccessToken: vi.fn(),
    createUser: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUserMetadata: vi.fn(),
    sendSetPasswordNotification: vi.fn(),
    grantProjectRole: vi.fn(),
    getUserProjectRoles: vi.fn(),
  } as any);

// Mock UserProfileService
const createMockUserProfileService = () =>
  ({
    upsertBase: vi.fn(),
    get: vi.fn(async (zitadelUserId: string) => ({
      id: `uuid-for-${zitadelUserId}`,
      zitadelUserId,
      subjectId: zitadelUserId,
      displayName: 'Test User',
      email: 'test@example.com',
    })),
  } as any);

// Mock ApiToken Repository
const createMockApiTokenRepository = () =>
  ({
    findOne: vi.fn(async () => null),
    update: vi.fn(async () => ({ affected: 1 })),
  } as any);

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
  const svc = new AuthService(
    createMockUserProfileService(),
    createMockZitadelService(),
    createMockApiTokenRepository()
  );
  return {
    svc,
    restore: () => {
      for (const k of Object.keys(env)) {
        const prev = backup[k];
        if (prev === undefined) delete process.env[k];
        else process.env[k] = prev;
      }
    },
  };
}

describe('AuthService.validateToken (mock/static mode)', () => {
  let restore: () => void;
  let svc: AuthService;
  beforeEach(() => {
    ({ svc, restore } = createService({
      AUTH_ISSUER: undefined,
      AUTH_JWKS_URI: undefined,
    }));
  });
  afterEach(() => restore());

  it('returns null when token undefined', async () => {
    const res = await svc.validateToken(undefined);
    expect(res).toBeNull();
  });

  it('static token: no-scope', async () => {
    const res = await svc.validateToken('no-scope');
    expect(res?.sub).toBe('test-user-no-scope'); // Zitadel ID from token
    expect(res?.id).toBeTruthy(); // Internal UUID from user_profiles.id
    expect(res?.scopes).toEqual([]);
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
  let svc: AuthService;
  let restore: () => void;
  beforeEach(() => {
    ({ svc, restore } = createService({
      AUTH_ISSUER: 'issuer',
      AUTH_JWKS_URI: 'https://jwks.example',
    }));
  });
  afterEach(() => restore());

  it('returns null if no sub', async () => {
    // @ts-expect-error private access for testing
    expect(await svc.mapClaims({})).toBeNull();
  });

  it('preserves UUID sub', async () => {
    const sub = '11111111-2222-3333-4444-555555555555';
    // @ts-expect-error private access
    const u = await svc.mapClaims({ sub });
    expect(u?.sub).toBe(sub);
  });

  it('normalizes non-uuid sub deterministically', async () => {
    // @ts-expect-error private access
    const u1 = await svc.mapClaims({ sub: 'alice@example.com' });
    // @ts-expect-error private access
    const u2 = await svc.mapClaims({ sub: 'alice@example.com' });
    expect(u1?.sub).toBe(u2?.sub);
    // Service now preserves sub as-is for direct ownership comparisons
    expect(u1?.sub).toBe('alice@example.com');
  });

  it('parses scopes from space-separated string', async () => {
    // @ts-expect-error private access
    const u = await svc.mapClaims({
      sub: 's',
      scope: `${MOCK_SCOPES.orgRead} ${MOCK_SCOPES.chatUse}`,
    });
    expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
  });

  it('parses scopes from comma-separated string', async () => {
    // @ts-expect-error private access
    const u = await svc.mapClaims({
      sub: 's',
      scope: `${MOCK_SCOPES.orgRead},${MOCK_SCOPES.chatUse}`,
    });
    expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
  });

  it('deduplicates scopes', async () => {
    // @ts-expect-error private access
    const u = await svc.mapClaims({
      sub: 's',
      scope: `${MOCK_SCOPES.orgRead} ${MOCK_SCOPES.orgRead}`,
    });
    expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead]);
  });

  it('accepts array scopes', async () => {
    // @ts-expect-error private access
    const u = await svc.mapClaims({
      sub: 's',
      scopes: [MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse],
    });
    expect(u?.scopes).toEqual([MOCK_SCOPES.orgRead, MOCK_SCOPES.chatUse]);
  });

  it('handles no scopes gracefully', async () => {
    // @ts-expect-error private access
    const u = await svc.mapClaims({ sub: 's' });
    expect(u?.scopes).toBeUndefined();
  });
});

describe('AuthService Zitadel Introspection Integration', () => {
  let svc: AuthService;
  let restore: () => void;
  let mockZitadelService: any;
  let mockUserProfileService: any;

  beforeEach(() => {
    mockUserProfileService = createMockUserProfileService();
    mockZitadelService = createMockZitadelService();

    // Create service with JWKS configured to enable introspection flow
    ({ restore } = createService({
      AUTH_ISSUER: 'https://zitadel.example.com',
      AUTH_JWKS_URI: 'https://zitadel.example.com/.well-known/jwks',
    }));

    // Manually inject mocks (constructor dependency injection in test setup)
    svc = new AuthService(
      mockUserProfileService,
      mockZitadelService,
      createMockApiTokenRepository()
    );
  });

  afterEach(() => restore());

  describe('introspection when Zitadel configured', () => {
    it('should use introspection if Zitadel is configured', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);
      mockZitadelService.introspect.mockResolvedValue({
        active: true,
        sub: 'zitadel-user-123',
        email: 'user@example.com',
        scope: 'openid profile email',
      } as IntrospectionResult);

      const result = await svc.validateToken('real-bearer-token');

      expect(mockZitadelService.isConfigured).toHaveBeenCalled();
      expect(mockZitadelService.introspect).toHaveBeenCalledWith(
        'real-bearer-token'
      );
      expect(result).not.toBeNull();
      expect(result?.sub).toBe('zitadel-user-123');
      expect(result?.email).toBe('user@example.com');
    });

    it('should return null if introspection returns inactive token', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);
      mockZitadelService.introspect.mockResolvedValue({
        active: false,
      } as IntrospectionResult);

      const result = await svc.validateToken('inactive-token');

      expect(result).toBeNull();
      expect(mockZitadelService.introspect).toHaveBeenCalledWith(
        'inactive-token'
      );
    });

    it('should parse scopes from introspection result', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);
      mockZitadelService.introspect.mockResolvedValue({
        active: true,
        sub: 'zitadel-user-456',
        email: 'admin@example.com',
        scope: 'org:read org:project:create chat:use',
      } as IntrospectionResult);

      const result = await svc.validateToken('admin-token');

      expect(result?.scopes).toEqual([
        'org:read',
        'org:project:create',
        'chat:use',
      ]);
    });

    it('should handle introspection with array scopes', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);
      mockZitadelService.introspect.mockResolvedValue({
        active: true,
        sub: 'zitadel-user-789',
        email: 'dev@example.com',
        scopes: ['documents:read', 'documents:write'],
      } as IntrospectionResult);

      const result = await svc.validateToken('dev-token');

      expect(result?.scopes).toEqual(['documents:read', 'documents:write']);
    });

    it('should fall back to JWKS if introspection fails', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);
      mockZitadelService.introspect.mockRejectedValue(
        new Error('Network error')
      );

      // Mock token doesn't match static patterns, so should attempt JWKS
      // (which will fail in test env, but we verify introspection was attempted)
      const result = await svc.validateToken('some-jwt-token');

      expect(mockZitadelService.introspect).toHaveBeenCalled();
      // Result will be null because JWKS validation not mocked in this test
    });

    it('should ensure user profile exists with introspection data', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);
      mockZitadelService.introspect.mockResolvedValue({
        active: true,
        sub: 'new-zitadel-user',
        email: 'newuser@example.com',
        scope: 'openid',
      } as IntrospectionResult);

      const result = await svc.validateToken('new-user-token');

      expect(mockUserProfileService.upsertBase).toHaveBeenCalledWith(
        'new-zitadel-user'
      );
      expect(mockUserProfileService.get).toHaveBeenCalledWith(
        'new-zitadel-user'
      );
      expect(result?.id).toBe('uuid-for-new-zitadel-user');
      expect(result?.sub).toBe('new-zitadel-user');
    });
  });

  describe('introspection when Zitadel not configured', () => {
    it('should skip introspection if Zitadel not configured', async () => {
      mockZitadelService.isConfigured.mockReturnValue(false);

      // Use a non-static token to test introspection path
      // (static tokens like 'no-scope' bypass introspection entirely)
      const result = await svc.validateToken('some-real-token');

      expect(mockZitadelService.isConfigured).toHaveBeenCalled();
      expect(mockZitadelService.introspect).not.toHaveBeenCalled();
      // Result will be null because JWKS validation not mocked
    });
  });

  describe('static tokens always bypass introspection', () => {
    it('should not attempt introspection for e2e-* tokens', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);

      const result = await svc.validateToken('e2e-test-user');

      expect(mockZitadelService.introspect).not.toHaveBeenCalled();
      expect(result?.sub).toBe('test-user-e2e-test-user');
      expect(result?.scopes?.length).toBe(Object.values(MOCK_SCOPES).length);
    });

    it('should not attempt introspection for named static tokens', async () => {
      mockZitadelService.isConfigured.mockReturnValue(true);

      const result = await svc.validateToken('with-scope');

      expect(mockZitadelService.introspect).not.toHaveBeenCalled();
      expect(result?.scopes).toEqual([MOCK_SCOPES.orgRead]);
    });
  });
});
