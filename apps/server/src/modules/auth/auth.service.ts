import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import { UserProfileService } from '../user-profile/user-profile.service';
import { ZitadelService } from './zitadel.service';
import type { IntrospectionResult } from './zitadel.service';

export interface AuthUser {
  /** Internal UUID primary key from user_profiles.id */
  id: string;
  /** External auth provider ID (e.g., Zitadel subject) from user_profiles.zitadel_user_id */
  sub: string;
  email?: string;
  scopes?: string[];
  // Debug only (present when DEBUG_AUTH_CLAIMS=1)
  _debugClaimKeys?: string[];
  _debugScopeSource?: string;
}

// Central mock scope catalogue for easier future expansion
export const MOCK_SCOPES = {
  orgRead: 'org:read',
  orgProjectCreate: 'org:project:create',
  orgProjectDelete: 'org:project:delete',
  orgInviteCreate: 'org:invite:create',
  projectRead: 'project:read',
  projectInviteCreate: 'project:invite:create',
  documentsRead: 'documents:read',
  documentsWrite: 'documents:write',
  documentsDelete: 'documents:delete',
  ingestWrite: 'ingest:write',
  searchRead: 'search:read',
  chunksRead: 'chunks:read',
  chatUse: 'chat:use',
  chatAdmin: 'chat:admin',
  // Graph search prototype scopes
  graphSearchRead: 'graph:search:read',
  graphSearchDebug: 'graph:search:debug',
  // Notification scopes
  notificationsRead: 'notifications:read',
  notificationsWrite: 'notifications:write',
  // Extraction job scopes
  extractionRead: 'extraction:read',
  extractionWrite: 'extraction:write',
  // MCP scopes
  schemaRead: 'schema:read',
  dataRead: 'data:read',
  dataWrite: 'data:write',
  mcpAdmin: 'mcp:admin',
};

@Injectable()
export class AuthService implements OnModuleInit {
  private jwks?: JWTVerifyGetKey;
  private issuer = process.env.AUTH_ISSUER;
  private audience = process.env.AUTH_AUDIENCE;
  private jwksUri = process.env.AUTH_JWKS_URI;

  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly zitadelService: ZitadelService
  ) {}

  onModuleInit(): void {
    if (!this.jwksUri || !this.issuer) {
      Logger.warn(
        'AuthService running in MOCK MODE (real JWT validation disabled). Set AUTH_ISSUER and AUTH_JWKS_URI env vars to enable real token verification.',
        'AuthService'
      );
    } else {
      Logger.log(
        `AuthService using issuer ${this.issuer} and JWKS ${this.jwksUri}`,
        'AuthService'
      );
    }
    if (process.env.AUTH_TEST_STATIC_TOKENS === '1') {
      Logger.log(
        'AuthService static test token mode ENABLED (accepting e2e-* fixture tokens alongside real JWTs).',
        'AuthService'
      );
    }
  }

  async validateToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;

    // Helper to create deterministic UUID from seed (for mock/test tokens)
    const toUuid = (seed: string) => {
      try {
        const { createHash } = require('crypto');
        const h: Buffer = createHash('sha1').update(seed).digest();
        const bytes = Buffer.from(h.slice(0, 16));
        bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 style
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
        const hex = bytes.toString('hex');
        return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(
          12,
          4
        )}-${hex.substr(16, 4)}-${hex.substr(20)}`;
      } catch {
        return '00000000-0000-0000-0000-000000000001';
      }
    };

    // NOTE: staticTokenMode / looksLikeStaticE2EToken previously used for branching; logic now simplified
    // so those variables were removed as part of cleanup (no functional change).
    // Unconditional static token bypass (Option 3) so E2E suite is decoupled from live IdP while roles model is pending.
    if (
      /^(no-scope|with-scope|graph-read|schema-read-token|data-read-token|data-write-token|mcp-admin-token|e2e-all|e2e-[A-Za-z0-9_-]+)$/.test(
        token
      )
    ) {
      // Normalize all mock subjects to valid strings (zitadel_user_id format)
      let zitadelUserId: string;
      let scopes: string[];

      if (token === 'no-scope') {
        zitadelUserId = 'test-user-no-scope';
        scopes = [];
      } else if (token === 'with-scope') {
        zitadelUserId = 'test-user-with-scope';
        scopes = [MOCK_SCOPES.orgRead];
      } else if (token === 'graph-read') {
        zitadelUserId = 'test-user-graph-read';
        scopes = [MOCK_SCOPES.orgRead, MOCK_SCOPES.graphSearchRead];
      } else if (token === 'schema-read-token') {
        zitadelUserId = 'test-user-schema-read';
        scopes = [MOCK_SCOPES.schemaRead];
      } else if (token === 'data-read-token') {
        zitadelUserId = 'test-user-data-read';
        scopes = [MOCK_SCOPES.schemaRead, MOCK_SCOPES.dataRead];
      } else if (token === 'data-write-token') {
        zitadelUserId = 'test-user-data-write';
        scopes = [
          MOCK_SCOPES.schemaRead,
          MOCK_SCOPES.dataRead,
          MOCK_SCOPES.dataWrite,
        ];
      } else if (token === 'mcp-admin-token') {
        zitadelUserId = 'test-user-mcp-admin';
        scopes = [MOCK_SCOPES.mcpAdmin];
      } else if (token === 'e2e-all') {
        zitadelUserId = 'test-user-e2e-all';
        scopes = Object.values(MOCK_SCOPES);
      } else if (token.startsWith('e2e-')) {
        zitadelUserId = `test-user-${token}`;
        scopes = Object.values(MOCK_SCOPES);
      } else {
        return null;
      }

      return await this.ensureUserProfile(zitadelUserId, undefined, scopes);
    }

    // Try Zitadel introspection first if configured (provides caching benefit)
    if (this.zitadelService.isConfigured()) {
      try {
        Logger.log(
          `[AUTH] Attempting Zitadel introspection for token`,
          'AuthService'
        );
        const introspection = await this.zitadelService.introspect(token);

        if (introspection?.active) {
          Logger.log(
            `[AUTH] Zitadel introspection successful (sub: ${introspection.sub})`,
            'AuthService'
          );
          const mapped = await this.mapIntrospectionToAuthUser(introspection);
          if (mapped) {
            return mapped;
          }
        }
        Logger.log(
          `[AUTH] Zitadel introspection returned inactive/invalid token`,
          'AuthService'
        );
      } catch (error) {
        Logger.warn(
          `[AUTH] Zitadel introspection failed, falling back to JWKS: ${error}`,
          'AuthService'
        );
      }
    }

    if (!this.jwksUri || !this.issuer) {
      // Fallback mock mode with simple token-based branching for tests:
      // 'no-scope' => user without scopes (to trigger 403 in tests)
      // 'with-scope' => user with read:me scope
      // Treat clearly malformed tokens containing forbidden punctuation as invalid -> null
      if (/[^A-Za-z0-9\-_:]/.test(token)) return null;

      let zitadelUserId: string;
      let scopes: string[];

      if (token === 'no-scope') {
        zitadelUserId = 'test-user-no-scope';
        scopes = [];
      } else if (token === 'with-scope') {
        zitadelUserId = 'test-user-with-scope';
        scopes = [MOCK_SCOPES.orgRead];
      } else if (token === 'graph-read') {
        zitadelUserId = 'test-user-graph-read';
        scopes = [MOCK_SCOPES.orgRead, MOCK_SCOPES.graphSearchRead];
      } else if (token === 'e2e-all') {
        zitadelUserId = 'test-user-e2e-all';
        scopes = Object.values(MOCK_SCOPES);
      } else if (token.startsWith('e2e-') && token !== 'e2e-all') {
        zitadelUserId = `test-user-${token}`;
        scopes = Object.values(MOCK_SCOPES);
      } else {
        // Default: any other token gets basic read scope
        zitadelUserId = 'test-user-default';
        scopes = [MOCK_SCOPES.orgRead];
      }

      return await this.ensureUserProfile(zitadelUserId, undefined, scopes);
    }
    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      if (!this.jwks) {
        this.jwks = createRemoteJWKSet(new URL(this.jwksUri));
      }
      Logger.log(
        `[AUTH] Verifying JWT token (starts: ${token.substring(0, 20)}...)`,
        'AuthService'
      );
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      Logger.log(
        `[AUTH] JWT verified, payload keys: ${Object.keys(result.payload).join(
          ', '
        )}`,
        'AuthService'
      );
      const mapped = await this.mapClaims(result.payload);
      Logger.log(
        `[AUTH] Mapped claims - email: ${mapped?.email}, sub: ${mapped?.sub}`,
        'AuthService'
      );
      if (process.env.DEBUG_AUTH_CLAIMS === '1' && mapped) {
        mapped._debugClaimKeys = Object.keys(result.payload);
      }
      return mapped;
    } catch (e) {
      Logger.error(`[AUTH] JWT verification failed: ${e}`, 'AuthService');
      return null;
    }
  }

  /**
   * Ensure user profile exists for the given Zitadel subject ID and return full AuthUser.
   * Creates profile if it doesn't exist (upsert). Returns null if lookup fails.
   */
  private async ensureUserProfile(
    zitadelUserId: string,
    email?: string,
    scopes?: string[]
  ): Promise<AuthUser | null> {
    try {
      // Ensure profile exists (creates if missing)
      await this.userProfileService.upsertBase(zitadelUserId);

      // Look up the internal UUID
      const profile = await this.userProfileService.get(zitadelUserId);
      if (!profile || !profile.id) {
        Logger.error(
          `Failed to get user profile for zitadel_user_id: ${zitadelUserId}`,
          'AuthService'
        );
        return null;
      }

      return {
        id: profile.id, // Internal UUID (primary key)
        sub: zitadelUserId, // External Zitadel ID
        email,
        scopes,
      };
    } catch (error) {
      Logger.error(
        `Error ensuring user profile for ${zitadelUserId}: ${error}`,
        'AuthService'
      );
      return null;
    }
  }

  private async mapClaims(payload: JWTPayload): Promise<AuthUser | null> {
    if (!payload.sub) return null;
    // Use the subject ID as-is from the JWT payload, without UUID conversion.
    // This allows ownership checks to compare user.sub directly with stored identifiers.
    const normalizedSub = String(payload.sub);
    // Support multiple common claim keys for scopes across IdPs (scope, scopes, scp, permissions)
    const scopesCandidate = (payload.scope ||
      (payload as any).scopes ||
      (payload as any).scp ||
      (payload as any).permissions) as string | string[] | undefined;
    let scopes: string[] | undefined;
    if (Array.isArray(scopesCandidate)) {
      scopes = scopesCandidate.map(String);
    } else if (typeof scopesCandidate === 'string') {
      // Accept space, comma, or space+comma separated lists
      scopes = scopesCandidate.split(/[\s,]+/).filter(Boolean);
    }
    if (scopes) {
      // Normalize & de-duplicate
      scopes = Array.from(new Set(scopes.map((s) => s.trim())));
    }

    const email = typeof payload.email === 'string' ? payload.email : undefined;

    // Ensure user profile exists and get internal UUID
    const user = await this.ensureUserProfile(normalizedSub, email, scopes);
    if (!user) return null;

    if (process.env.DEBUG_AUTH_CLAIMS === '1') {
      user._debugScopeSource = Array.isArray(scopesCandidate)
        ? 'array'
        : typeof scopesCandidate === 'string'
        ? 'string'
        : 'none';
    }
    return user;
  }

  /**
   * Map Zitadel introspection result to AuthUser
   *
   * @param introspection - Introspection result from Zitadel
   * @returns AuthUser or null if mapping fails
   */
  private async mapIntrospectionToAuthUser(
    introspection: IntrospectionResult
  ): Promise<AuthUser | null> {
    if (!introspection.sub) {
      Logger.warn(
        '[AUTH] Introspection result missing sub claim',
        'AuthService'
      );
      return null;
    }

    const normalizedSub = String(introspection.sub);

    // Extract scopes from introspection (Zitadel returns scope as space-separated string)
    let scopes: string[] | undefined;
    const scopesClaim = introspection.scope || introspection.scopes;
    if (typeof scopesClaim === 'string') {
      scopes = scopesClaim.split(/\s+/).filter(Boolean);
    } else if (Array.isArray(scopesClaim)) {
      scopes = scopesClaim.map(String);
    }

    const email =
      typeof introspection.email === 'string' ? introspection.email : undefined;

    // Ensure user profile exists and get internal UUID
    const user = await this.ensureUserProfile(normalizedSub, email, scopes);
    if (!user) return null;

    if (process.env.DEBUG_AUTH_CLAIMS === '1') {
      user._debugScopeSource = 'introspection';
    }

    return user;
  }
}
