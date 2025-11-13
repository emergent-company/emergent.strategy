# 🎯 Authentication System Implementation Plan for spec-server-2

**Based on**: Working implementation from huma-blueprint-ui  
**Date**: October 31, 2025  
**Target**: spec-server-2 (apps/server/)  
**Status**: Ready to Implement

---

## Executive Summary

This plan implements **Zitadel Token Introspection** using the **proven, working code** from huma-blueprint-ui. The current spec-server-2 system already has excellent foundations, and we'll enhance it with:

1. ✅ **Zitadel Token Introspection** (production-grade)
2. ✅ **PostgreSQL Cache Layer** (no Redis needed)
3. ✅ **Role-Based Authorization** (alongside existing scope system)
4. ✅ **Production Environment Hardening**
5. ✅ **Automated Cache Cleanup**

**Timeline**: 2-3 weeks  
**Risk Level**: Low (using proven code)  
**Breaking Changes**: Minimal (additive changes)

---

## Current State Analysis

### ✅ What's Already Excellent in spec-server-2

```typescript
// Already implemented:
✅ core.user_profiles (id UUID + zitadel_user_id TEXT)
✅ UserProfileService with CRUD operations
✅ Alternative email management
✅ Auto-membership on org/project creation
✅ Membership-based filtering  
✅ AuditService + AuditInterceptor
✅ PermissionService for scope mapping
✅ Mock token support for testing
✅ Transaction safety in services
```

### ⚠️ What Needs Enhancement

```typescript
// Missing from huma-blueprint-ui:
❌ Zitadel token introspection
❌ PostgreSQL cache for introspection
❌ Role-based authorization (@Roles decorator)
❌ Production environment validation
❌ Automated cache cleanup service
❌ ZitadelService for OAuth2 client
```

---

## Implementation Plan (3 Phases)

### Phase 1: Infrastructure & Cache (Week 1)

#### 1.1 Database Migration

**File**: `apps/server/migrations/0004_auth_introspection_cache.sql`

```sql
-- Migration: Auth Introspection Cache
-- Description: Creates PostgreSQL-based cache for Zitadel token introspection
-- Date: 2025-10-31

CREATE TABLE IF NOT EXISTS kb.auth_introspection_cache (
    token_hash VARCHAR(128) PRIMARY KEY,
    introspection_data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_introspection_cache_expires_at 
    ON kb.auth_introspection_cache(expires_at);

COMMENT ON TABLE kb.auth_introspection_cache IS 
    'Caches Zitadel OAuth2 token introspection results to reduce API calls';

COMMENT ON COLUMN kb.auth_introspection_cache.token_hash IS 
    'SHA-512 hash of the access token (used as cache key)';

COMMENT ON COLUMN kb.auth_introspection_cache.introspection_data IS 
    'Full introspection response from Zitadel stored as JSONB';

COMMENT ON COLUMN kb.auth_introspection_cache.expires_at IS 
    'Timestamp when cache entry expires (based on token expiry and TTL)';
```

#### 1.2 PostgreSQL Cache Service

**File**: `apps/server/src/modules/auth/postgres-cache.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';

export interface CachedIntrospection {
    data: Record<string, any>;
    expiresAt: Date;
}

@Injectable()
export class PostgresCacheService {
    private readonly logger = new Logger(PostgresCacheService.name);

    constructor(private readonly db: DatabaseService) {}

    async get(token: string): Promise<CachedIntrospection | null> {
        if (!this.db.isOnline()) {
            return null;
        }

        const tokenHash = this.hashToken(token);

        try {
            const result = await this.db.query(
                `SELECT introspection_data, expires_at
                 FROM kb.auth_introspection_cache
                 WHERE token_hash = $1
                   AND expires_at > NOW()`,
                [tokenHash]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];
            return {
                data: row.introspection_data,
                expiresAt: new Date(row.expires_at),
            };
        } catch (error) {
            this.logger.error(
                `Failed to get cached introspection: ${(error as Error).message}`
            );
            return null;
        }
    }

    async set(
        token: string,
        introspectionData: Record<string, any>,
        expiresAt: Date
    ): Promise<void> {
        if (!this.db.isOnline()) {
            return;
        }

        const tokenHash = this.hashToken(token);

        try {
            await this.db.query(
                `INSERT INTO kb.auth_introspection_cache (token_hash, introspection_data, expires_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (token_hash) DO UPDATE
                 SET introspection_data = EXCLUDED.introspection_data,
                     expires_at = EXCLUDED.expires_at,
                     created_at = NOW()`,
                [tokenHash, JSON.stringify(introspectionData), expiresAt]
            );

            this.logger.debug(`Cached introspection result (expires: ${expiresAt.toISOString()})`);
        } catch (error) {
            this.logger.error(
                `Failed to cache introspection: ${(error as Error).message}`
            );
        }
    }

    async invalidate(token: string): Promise<void> {
        if (!this.db.isOnline()) {
            return;
        }

        const tokenHash = this.hashToken(token);

        try {
            await this.db.query(
                `DELETE FROM kb.auth_introspection_cache WHERE token_hash = $1`,
                [tokenHash]
            );

            this.logger.debug('Invalidated cached introspection');
        } catch (error) {
            this.logger.error(
                `Failed to invalidate cache: ${(error as Error).message}`
            );
        }
    }

    async cleanupExpired(): Promise<number> {
        if (!this.db.isOnline()) {
            return 0;
        }

        try {
            const result = await this.db.query(
                `DELETE FROM kb.auth_introspection_cache
                 WHERE expires_at <= NOW()
                 RETURNING token_hash`
            );

            const deletedCount = result.rows.length;
            if (deletedCount > 0) {
                this.logger.log(`Cleaned up ${deletedCount} expired cache entries`);
            }

            return deletedCount;
        } catch (error) {
            this.logger.error(
                `Failed to cleanup expired cache entries: ${(error as Error).message}`
            );
            return 0;
        }
    }

    private hashToken(token: string): string {
        return createHash('sha512').update(token).digest('hex');
    }
}
```

#### 1.3 Cache Cleanup Service

**File**: `apps/server/src/modules/auth/cache-cleanup.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PostgresCacheService } from './postgres-cache.service';

@Injectable()
export class CacheCleanupService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CacheCleanupService.name);
    private cleanupInterval?: NodeJS.Timeout;

    constructor(private readonly cacheService: PostgresCacheService) {}

    onModuleInit(): void {
        const intervalSeconds = parseInt(process.env.CACHE_CLEANUP_INTERVAL || '900', 10);
        const intervalMs = intervalSeconds * 1000;

        this.logger.log(
            `Starting cache cleanup service (interval: ${intervalSeconds}s)`
        );

        this.cleanupInterval = setInterval(async () => {
            await this.runCleanup();
        }, intervalMs);

        // Run immediately on startup
        this.runCleanup();
    }

    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.logger.log('Cache cleanup service stopped');
        }
    }

    private async runCleanup(): Promise<void> {
        try {
            const deletedCount = await this.cacheService.cleanupExpired();
            if (deletedCount > 0) {
                this.logger.debug(`Cache cleanup completed: ${deletedCount} entries removed`);
            }
        } catch (error) {
            this.logger.error(
                `Cache cleanup failed: ${(error as Error).message}`
            );
        }
    }
}
```

### Phase 2: Zitadel Integration (Week 1-2)

#### 2.1 Zitadel Service

**File**: `apps/server/src/modules/auth/zitadel.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';

interface ZitadelServiceAccountKey {
    type: string;
    keyId: string;
    key: string;
    userId?: string;
    appId?: string;
    clientId?: string;
}

interface ZitadelTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

@Injectable()
export class ZitadelService implements OnModuleInit {
    private readonly logger = new Logger(ZitadelService.name);
    private serviceAccountKey?: ZitadelServiceAccountKey;
    private cachedToken?: {
        token: string;
        expiresAt: number;
    };

    onModuleInit(): void {
        const zitadelDomain = process.env.ZITADEL_DOMAIN;
        
        if (!zitadelDomain) {
            this.logger.warn('Zitadel service not configured - skipping initialization');
            return;
        }

        try {
            this.loadServiceAccountKey();
            this.logger.log('Zitadel service initialized successfully');
        } catch (error) {
            this.logger.error(
                `Failed to initialize Zitadel service: ${(error as Error).message}`
            );
            if (process.env.NODE_ENV === 'production') {
                throw error;
            }
        }
    }

    async getAccessToken(): Promise<string> {
        if (!this.serviceAccountKey) {
            throw new Error('Zitadel service account key not loaded');
        }

        // Return cached token if still valid
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
            return this.cachedToken.token;
        }

        const assertion = await this.createJwtAssertion();
        const token = await this.requestAccessToken(assertion);

        // Cache token with 1 minute safety margin
        this.cachedToken = {
            token: token.access_token,
            expiresAt: Date.now() + (token.expires_in - 60) * 1000,
        };

        return token.access_token;
    }

    private loadServiceAccountKey(): void {
        let keyJson: string;

        const clientJwt = process.env.ZITADEL_CLIENT_JWT;
        const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;

        if (clientJwt) {
            keyJson = clientJwt;
        } else if (clientJwtPath) {
            try {
                keyJson = readFileSync(clientJwtPath, 'utf-8');
            } catch (error) {
                throw new Error(
                    `Failed to read Zitadel service account key from ${clientJwtPath}: ${(error as Error).message}`
                );
            }
        } else {
            throw new Error(
                'Either ZITADEL_CLIENT_JWT or ZITADEL_CLIENT_JWT_PATH must be set'
            );
        }

        try {
            this.serviceAccountKey = JSON.parse(keyJson);
            if (
                !this.serviceAccountKey?.keyId ||
                !this.serviceAccountKey?.key
            ) {
                throw new Error('Invalid key format: missing keyId or key');
            }
            
            // Support both service account keys (userId) and application keys (appId/clientId)
            if (!this.serviceAccountKey.userId && !this.serviceAccountKey.appId) {
                throw new Error('Invalid key format: missing userId or appId');
            }
        } catch (error) {
            throw new Error(
                `Failed to parse Zitadel key: ${(error as Error).message}`
            );
        }
    }

    private async createJwtAssertion(): Promise<string> {
        if (!this.serviceAccountKey) {
            throw new Error('Service account key not loaded');
        }

        const { SignJWT, importPKCS8 } = await import('jose');

        const privateKey = await importPKCS8(
            this.serviceAccountKey.key,
            'RS256'
        );

        const now = Math.floor(Date.now() / 1000);
        // Use userId for service accounts, appId for application keys
        const issuer = this.serviceAccountKey.userId || this.serviceAccountKey.appId!;
        const subject = this.serviceAccountKey.userId || this.serviceAccountKey.clientId!;
        const audience = `https://${process.env.ZITADEL_DOMAIN}`;

        const jwt = await new SignJWT({})
            .setProtectedHeader({
                alg: 'RS256',
                kid: this.serviceAccountKey.keyId,
            })
            .setIssuer(issuer)
            .setSubject(subject)
            .setAudience(audience)
            .setIssuedAt(now)
            .setExpirationTime(now + 3600)
            .sign(privateKey);

        return jwt;
    }

    private async requestAccessToken(
        assertion: string
    ): Promise<ZitadelTokenResponse> {
        const tokenUrl = `https://${process.env.ZITADEL_DOMAIN}/oauth/v2/token`;

        const params = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
            scope: 'openid profile email urn:zitadel:iam:org:project:id:zitadel:aud',
        });

        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Zitadel token request failed (${response.status}): ${errorText}`
                );
            }

            const data = await response.json();
            return data as ZitadelTokenResponse;
        } catch (error) {
            this.logger.error(
                `Failed to get Zitadel access token: ${(error as Error).message}`
            );
            throw error;
        }
    }
}
```

#### 2.2 Zitadel Introspection Service

**File**: `apps/server/src/modules/auth/zitadel-introspection.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ZitadelService } from './zitadel.service';
import { PostgresCacheService } from './postgres-cache.service';

export interface IntrospectionContext {
    active: boolean;
    sub?: string;
    email?: string;
    emailVerified?: boolean;
    givenName?: string;
    familyName?: string;
    organizationId?: string;
    roles?: string[];
    scopes?: string[];
    exp?: number;
    iat?: number;
    iss?: string;
    aud?: string[];
}

interface ZitadelIntrospectionResponse {
    active: boolean;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
    'urn:zitadel:iam:org:id'?: string;
    'urn:zitadel:iam:org:project:roles'?: Record<string, Record<string, string>>;
    scope?: string;
    exp?: number;
    iat?: number;
    iss?: string;
    aud?: string[];
}

@Injectable()
export class ZitadelIntrospectionService {
    private readonly logger = new Logger(ZitadelIntrospectionService.name);

    constructor(
        private readonly zitadelService: ZitadelService,
        private readonly cacheService: PostgresCacheService
    ) {}

    async introspect(token: string): Promise<IntrospectionContext | null> {
        // Check cache first
        const cached = await this.cacheService.get(token);
        if (cached) {
            this.logger.debug('Using cached introspection result');
            return this.mapIntrospectionResponse(cached.data);
        }

        // Perform introspection
        const introspectionData = await this.performIntrospection(token);
        if (!introspectionData || !introspectionData.active) {
            return null;
        }

        const context = this.mapIntrospectionResponse(introspectionData);
        if (context) {
            await this.cacheIntrospection(token, introspectionData);
        }

        return context;
    }

    private async performIntrospection(
        token: string
    ): Promise<ZitadelIntrospectionResponse | null> {
        const zitadelDomain = process.env.ZITADEL_DOMAIN;
        
        if (!zitadelDomain) {
            throw new Error('Zitadel domain not configured');
        }

        try {
            const serviceToken = await this.zitadelService.getAccessToken();
            const introspectionUrl = `https://${zitadelDomain}/oauth/v2/introspect`;

            const params = new URLSearchParams({
                token,
            });

            const response = await fetch(introspectionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Bearer ${serviceToken}`,
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(
                    `Introspection request failed (${response.status}): ${errorText}`
                );
                return null;
            }

            const data = await response.json();
            return data as ZitadelIntrospectionResponse;
        } catch (error) {
            this.logger.error(
                `Failed to introspect token: ${(error as Error).message}`
            );
            return null;
        }
    }

    private mapIntrospectionResponse(
        response: Record<string, any>
    ): IntrospectionContext | null {
        if (!response.active) {
            return null;
        }

        const organizationId =
            response['urn:zitadel:iam:org:id'] ||
            process.env.ZITADEL_MAIN_ORG_ID;

        const rolesData = response['urn:zitadel:iam:org:project:roles'] as
            | Record<string, Record<string, string>>
            | undefined;

        const roles: string[] = [];
        if (rolesData && organizationId) {
            const orgRoles = rolesData[organizationId];
            if (orgRoles) {
                roles.push(...Object.keys(orgRoles));
            }
        }

        // Parse scopes from space-separated string
        let scopes: string[] = [];
        if (response.scope && typeof response.scope === 'string') {
            scopes = response.scope.split(' ').filter(Boolean);
        }

        return {
            active: response.active,
            sub: response.sub,
            email: response.email,
            emailVerified: response.email_verified,
            givenName: response.given_name,
            familyName: response.family_name,
            organizationId,
            roles,
            scopes,
            exp: response.exp,
            iat: response.iat,
            iss: response.iss,
            aud: response.aud,
        };
    }

    private async cacheIntrospection(
        token: string,
        introspectionData: Record<string, any>
    ): Promise<void> {
        const defaultTtl = parseInt(process.env.INTROSPECTION_CACHE_TTL || '300', 10);
        const now = Math.floor(Date.now() / 1000);

        let expiresAt: Date;
        if (introspectionData.exp && typeof introspectionData.exp === 'number') {
            const tokenExpiry = introspectionData.exp;
            const cacheExpiry = Math.min(tokenExpiry, now + defaultTtl);
            expiresAt = new Date(cacheExpiry * 1000);
        } else {
            expiresAt = new Date((now + defaultTtl) * 1000);
        }

        await this.cacheService.set(token, introspectionData, expiresAt);
    }
}
```

### Phase 3: Auth Service Integration & Role Guards (Week 2)

#### 3.1 Update AuthService

**File**: `apps/server/src/modules/auth/auth.service.ts`

**Changes at line 72 (`validateToken` method)**:

```typescript
async validateToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;

    // PRODUCTION SAFETY: Reject mock tokens in production
    if (this.isProductionMode() && this.isMockToken(token)) {
        Logger.error(
            `Rejected mock token in production environment: ${token}`,
            'AuthService'
        );
        return null;
    }

    // Static token mode - check BEFORE introspection
    if (this.isMockToken(token)) {
        if (process.env.AUTH_TEST_STATIC_TOKENS !== '1') {
            return null;
        }
        // Existing mock token logic...
        return await this.ensureUserProfile(zitadelUserId, undefined, scopes);
    }

    // NEW: Try Zitadel introspection first (if configured)
    if (this.introspectionService && process.env.ZITADEL_DOMAIN) {
        try {
            const introspectionResult = await this.introspectionService.introspect(token);
            if (introspectionResult && introspectionResult.active) {
                const user = await this.ensureUserProfile(
                    introspectionResult.sub || '',
                    introspectionResult.email,
                    introspectionResult.scopes || []
                );
                
                // Add roles if present
                if (user && introspectionResult.roles) {
                    user.roles = introspectionResult.roles;
                    user.organizationId = introspectionResult.organizationId;
                }
                
                return user;
            }
        } catch (e) {
            Logger.warn(`Token introspection failed, falling back to JWT: ${(e as Error).message}`, 'AuthService');
        }
    }

    // Fallback to JWT validation (existing logic)
    if (!this.jwksUri || !this.issuer) {
        // Existing fallback mock mode...
    }

    // Existing JWT verification logic...
}

private isProductionMode(): boolean {
    return process.env.NODE_ENV === 'production';
}

private isMockToken(token: string): boolean {
    return /^(no-scope|with-scope|graph-read|schema-read-token|data-read-token|data-write-token|mcp-admin-token|e2e-all|e2e-[A-Za-z0-9_-]+)$/.test(token);
}
```

**Update AuthUser interface** (line 5):

```typescript
export interface AuthUser {
    /** Internal UUID primary key from user_profiles.id */
    id: string;
    /** External auth provider ID (e.g., Zitadel subject) from user_profiles.zitadel_user_id */
    sub: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    scopes?: string[];
    roles?: string[];  // NEW: Role-based authorization
    organizationId?: string;  // NEW: Zitadel organization ID
    // Debug only (present when DEBUG_AUTH_CLAIMS=1)
    _debugClaimKeys?: string[];
    _debugScopeSource?: string;
}
```

#### 3.2 Roles Decorator & Guard

**File**: `apps/server/src/modules/auth/roles.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

**File**: `apps/server/src/modules/auth/roles.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import type { AuthUser } from './auth.service';

@Injectable()
export class RolesGuard implements CanActivate {
    private readonly logger = new Logger(RolesGuard.name);

    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user as AuthUser | undefined;

        if (!user) {
            this.logger.warn('RolesGuard: No user found in request');
            return false;
        }

        const userRoles = user.roles || [];

        const hasRole = requiredRoles.some((role) => userRoles.includes(role));

        if (!hasRole) {
            this.logger.warn(
                `RolesGuard: User ${user.sub} does not have required roles. ` +
                `Required: [${requiredRoles.join(', ')}], Has: [${userRoles.join(', ')}]`
            );
        }

        return hasRole;
    }
}
```

#### 3.3 Update Auth Module

**File**: `apps/server/src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { ScopesGuard } from './scopes.guard';
import { RolesGuard } from './roles.guard';  // NEW
import { ZitadelService } from './zitadel.service';  // NEW
import { ZitadelIntrospectionService } from './zitadel-introspection.service';  // NEW
import { PostgresCacheService } from './postgres-cache.service';  // NEW
import { CacheCleanupService } from './cache-cleanup.service';  // NEW
import { PermissionService } from './permission.service';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { UserProfileModule } from '../user-profile/user-profile.module';

@Module({
    imports: [UserProfileModule],
    providers: [
        AuthService,
        AuthGuard,
        ScopesGuard,
        RolesGuard,  // NEW
        ZitadelService,  // NEW
        ZitadelIntrospectionService,  // NEW
        PostgresCacheService,  // NEW
        CacheCleanupService,  // NEW
        PermissionService,
        AuditService,
        AuditInterceptor,
    ],
    exports: [
        AuthService,
        AuthGuard,
        ScopesGuard,
        RolesGuard,  // NEW
        ZitadelService,  // NEW
        PermissionService,
        AuditService,
    ],
})
export class AuthModule {}
```

#### 3.4 Environment Variables

**File**: `.env.example` (root or `apps/server/.env.example`)

```bash
# --- Node Environment ---
NODE_ENV=development  # development | production | test

# --- Authentication Configuration ---
# Zitadel OAuth Configuration (Required for production)
AUTH_ISSUER=https://your-zitadel-instance.zitadel.cloud/
AUTH_AUDIENCE=your-api-identifier
AUTH_JWKS_URI=https://your-zitadel-instance.zitadel.cloud/.well-known/jwks.json

# Zitadel Introspection (NEW - Recommended for production)
ZITADEL_DOMAIN=your-zitadel-instance.zitadel.cloud
ZITADEL_MAIN_ORG_ID=your-organization-id
ZITADEL_CLIENT_JWT_PATH=/path/to/service-account-key.json
# OR
ZITADEL_CLIENT_JWT={"type":"serviceaccount","keyId":"..."}

# Cache Configuration
INTROSPECTION_CACHE_TTL=300  # 5 minutes (in seconds)
CACHE_CLEANUP_INTERVAL=900   # 15 minutes (in seconds)

# Mock tokens for testing (automatically disabled in production)
AUTH_TEST_STATIC_TOKENS=1  # Enable e2e-*, no-scope, with-scope tokens

# Debug authentication claims (development only)
DEBUG_AUTH_CLAIMS=0
DEBUG_AUTH_SCOPES=0

# --- Audit Configuration ---
AUDIT_DATABASE_LOGGING=true   # Enable database audit logging
AUDIT_CONSOLE_LOGGING=false   # Enable console audit logging
```

---

## Usage Examples

### Using @Roles() Decorator

```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('documents')
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
    // Anyone authenticated can read
    @Get()
    @Roles('org_admin', 'project_admin', 'project_user')
    async list() { }

    // Only org/project admins can create
    @Post()
    @Roles('org_admin', 'project_admin')
    async create() { }
    
    // Only org admins can delete
    @Delete(':id')
    @Roles('org_admin')
    async delete() { }
}
```

### Backwards Compatibility

The system supports **both** scope-based (`@Scopes`) and role-based (`@Roles`) authorization:

```typescript
// Option 1: Use existing @Scopes decorator (no changes needed)
@Get()
@Scopes(MOCK_SCOPES.documentsRead)
async list() { }

// Option 2: Use new @Roles decorator (recommended for new code)
@Get()
@Roles('org_admin', 'project_admin', 'project_user')
async list() { }

// Option 3: Use both (AND logic - user must have both)
@Get()
@Scopes(MOCK_SCOPES.documentsRead)
@Roles('org_admin')
async list() { }
```

---

## Testing Strategy

### Unit Tests

1. **PostgresCacheService**: Test get, set, invalidate, cleanup
2. **ZitadelService**: Test token generation, caching, error handling
3. **ZitadelIntrospectionService**: Test introspection, caching, mapping
4. **RolesGuard**: Test role validation, OR logic
5. **AuthService**: Test introspection integration, fallback to JWT

### Integration Tests

1. **Cache Flow**: Token → introspect → cache → cached response
2. **Auth Flow**: Real token → introspection → user profile sync
3. **Cleanup**: Verify expired entries are removed

### E2E Tests

1. **Mock Tokens**: Verify e2e-* tokens still work in test mode
2. **Real Tokens**: Test with actual Zitadel tokens
3. **Role Enforcement**: Test 403 for insufficient roles
4. **Production Mode**: Verify mock tokens rejected

---

## File Checklist

### New Files (9)
- [ ] `migrations/0004_auth_introspection_cache.sql`
- [ ] `src/modules/auth/postgres-cache.service.ts`
- [ ] `src/modules/auth/cache-cleanup.service.ts`
- [ ] `src/modules/auth/zitadel.service.ts`
- [ ] `src/modules/auth/zitadel-introspection.service.ts`
- [ ] `src/modules/auth/roles.decorator.ts`
- [ ] `src/modules/auth/roles.guard.ts`
- [ ] `src/modules/auth/__tests__/postgres-cache.service.spec.ts`
- [ ] `src/modules/auth/__tests__/zitadel-introspection.service.spec.ts`

### Modified Files (3)
- [ ] `src/modules/auth/auth.service.ts` (update validateToken, add roles to AuthUser)
- [ ] `src/modules/auth/auth.module.ts` (register new services)
- [ ] `.env.example` (add new environment variables)

### Documentation Files (2)
- [ ] `docs/architecture/auth-introspection-implementation.md`
- [ ] `docs/guides/auth-roles-migration-guide.md`

---

## Migration Timeline

### Week 1: Infrastructure
- **Day 1-2**: Database migration + PostgresCacheService + CacheCleanupService
- **Day 3-4**: ZitadelService + ZitadelIntrospectionService
- **Day 5**: Unit tests for cache and Zitadel services

### Week 2: Integration
- **Day 1-2**: Update AuthService with introspection
- **Day 3**: RolesGuard + @Roles decorator
- **Day 4**: Update auth module, add environment variables
- **Day 5**: Integration tests

### Week 3: Testing & Documentation
- **Day 1-2**: E2E tests, production environment testing
- **Day 3-4**: Documentation, migration guide
- **Day 5**: Final review, deployment preparation

---

## Success Metrics

### Performance
- ✅ <50ms auth time (cached)
- ✅ 80-95% cache hit rate
- ✅ <200ms auth time (uncached)

### Quality
- ✅ All existing tests still pass
- ✅ New tests achieve >80% coverage
- ✅ Zero production errors
- ✅ Mock tokens work in dev/test only

### Security
- ✅ Mock tokens disabled in production
- ✅ Introspection working with real tokens
- ✅ Role-based access control functional
- ✅ Cache properly expires

---

## Deployment Checklist

### Prerequisites
- [ ] Zitadel service account created
- [ ] Service account key downloaded (JSON file)
- [ ] Environment variables configured
- [ ] Database migration applied

### Validation
- [ ] App starts without errors
- [ ] Mock tokens work in development
- [ ] Real tokens work via introspection
- [ ] Cache is populating
- [ ] Cleanup service is running
- [ ] Role guards enforce correctly

### Monitoring
- [ ] Check cache hit/miss rate
- [ ] Monitor introspection latency
- [ ] Watch for auth failures
- [ ] Verify cleanup job runs

---

## Support & References

### Proven Implementation
- **Source**: huma-blueprint-ui (apps/api/src/auth/)
- **Status**: Production-ready, fully tested
- **Tests**: 51 passing tests
- **Documentation**: Complete migration guide

### Existing Spec-Server-2 Features
- UserProfileService: `src/modules/user-profile/`
- PermissionService: `src/modules/auth/permission.service.ts`
- AuditService: `src/modules/auth/audit.service.ts`
- Database schema: `migrations/0001_init.sql`, `migrations/0003_add_user_id_architecture.sql`

---

**Ready to implement!** This plan uses proven, tested code from a working production system and integrates seamlessly with spec-server-2's existing excellent architecture.
