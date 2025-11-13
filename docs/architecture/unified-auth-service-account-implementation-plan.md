# 🎯 Unified Auth & Service Account Implementation Plan

**Project**: spec-server-2  
**Date**: January 2025  
**Status**: Ready to Implement  
**Timeline**: 3-4 weeks  
**Risk Level**: Low (using proven patterns)

---

## Executive Summary

This plan **unifies two critical authentication enhancements** for spec-server-2:

1. **Token Introspection System** (from auth-zitadel-introspection-implementation-plan.md)
   - Production-grade Zitadel OAuth2 introspection
   - PostgreSQL-based cache layer
   - Role-based authorization (@Roles decorator)
   - Automated cache cleanup

2. **Service Account Integration** (new requirement)
   - Zitadel Management API access
   - Programmatic user creation
   - Invitation flow automation
   - User metadata management

**Key Insight**: These features complement each other perfectly:
- **Introspection** validates user tokens coming FROM frontend
- **Service Account** makes API calls TO Zitadel on behalf of backend

**Combined Timeline**: 3-4 weeks (12-20 hours development)  
**Combined Benefits**: Complete end-to-end auth system with user lifecycle management

---

## Architecture Overview

### Current State Analysis

#### ✅ What's Already Excellent

```typescript
// Existing strong foundations:
✅ core.user_profiles (id UUID + zitadel_user_id TEXT)
✅ UserProfileService with CRUD operations
✅ Alternative email management
✅ Auto-membership on org/project creation
✅ Membership-based filtering
✅ AuditService + AuditInterceptor
✅ PermissionService for scope mapping
✅ Mock token support for testing
✅ Transaction safety in services
✅ InvitesService for invitation records
```

#### ⚠️ What Needs Enhancement

```typescript
// Missing critical components:
❌ Zitadel token introspection (validates user tokens)
❌ PostgreSQL cache for introspection results
❌ Role-based authorization (@Roles decorator)
❌ Zitadel Management API integration (creates users)
❌ Programmatic user creation in invitation flow
❌ User metadata management (invitation context)
❌ Production environment validation
❌ Automated cache cleanup service
```

### Unified Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  - User authentication (OIDC/PKCE)                              │
│  - Sends access tokens in Authorization header                  │
└───────────────────┬─────────────────────────────────────────────┘
                    │ Bearer <token>
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NestJS Backend API                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AuthGuard (validates tokens)                 │  │
│  │                                                            │  │
│  │  1. Check PostgreSQL cache first                          │  │
│  │  2. If miss, call Zitadel introspection                  │  │
│  │  3. Cache result                                          │  │
│  │  4. Extract roles, scopes, user info                     │  │
│  └─────────────┬────────────────────────────────────────────┘  │
│                │                                                 │
│                ▼                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │     RolesGuard + ScopesGuard (enforce permissions)        │  │
│  └─────────────┬────────────────────────────────────────────┘  │
│                │                                                 │
│                ▼                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Controller Methods                           │  │
│  │                                                            │  │
│  │  - @Roles('org_admin', 'project_admin')                  │  │
│  │  - @Scopes('documents:write')                            │  │
│  └─────────────┬────────────────────────────────────────────┘  │
│                │                                                 │
│                ▼                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         InvitesService (create users)                     │  │
│  │                                                            │  │
│  │  1. Generate invitation token                             │  │
│  │  2. Create Zitadel user via Management API               │  │
│  │  3. Store invitation record in database                   │  │
│  │  4. Send email with magic link                           │  │
│  │  5. On accept, grant project role in Zitadel            │  │
│  └─────────────┬────────────────────────────────────────────┘  │
│                │                                                 │
└────────────────┼─────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Zitadel (Auth Provider)                     │
│                                                                   │
│  ┌──────────────────────┐    ┌────────────────────────────┐   │
│  │  OAuth2 Introspection│    │   Management API            │   │
│  │                       │    │                             │   │
│  │  - Validates tokens  │    │  - Create users             │   │
│  │  - Returns roles     │    │  - Update metadata          │   │
│  │  - Returns scopes    │    │  - Grant project roles      │   │
│  │  - Returns user info │    │  - Send notifications       │   │
│  └──────────────────────┘    └────────────────────────────┘   │
│                                                                   │
│  Used by: AuthGuard          Used by: InvitesService             │
│  Client: Frontend app        Client: Service Account             │
│  Auth: Frontend token        Auth: Client Credentials (JWT)      │
└─────────────────────────────────────────────────────────────────┘
```

### Two Zitadel Clients Explained

| Client | Purpose | Auth Flow | Used By | Permissions |
|--------|---------|-----------|---------|-------------|
| **Frontend Client** | User authentication | OIDC/PKCE | React app | User login |
| **Service Account** | Management API | Client Credentials (JWT) | Backend | User creation, metadata, roles |

**Why Two Clients?**
- **Frontend**: Users authenticate, get access tokens, call backend API
- **Backend**: Introspects user tokens + makes management API calls
- **Security**: Service account credentials never exposed to frontend

---

## Implementation Plan (4 Phases)

### Phase 1: Infrastructure & Cache (Week 1)

**Objective**: Set up PostgreSQL cache layer for token introspection

#### 1.1 Database Migration

**File**: `apps/server/migrations/0004_auth_introspection_cache.sql`

```sql
-- Migration: Auth Introspection Cache
-- Description: Creates PostgreSQL-based cache for Zitadel token introspection
-- Date: 2025-01-XX

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

**Apply migration:**
```bash
npx tsx scripts/run-migrations.ts
```

#### 1.2 PostgreSQL Cache Service

**File**: `apps/server/src/modules/auth/postgres-cache.service.ts`

*(Complete implementation from auth-introspection plan - see original document)*

**Key Methods**:
- `get(token: string): Promise<CachedIntrospection | null>`
- `set(token, data, expiresAt): Promise<void>`
- `invalidate(token): Promise<void>`
- `cleanupExpired(): Promise<number>`

#### 1.3 Cache Cleanup Service

**File**: `apps/server/src/modules/auth/cache-cleanup.service.ts`

*(Complete implementation from auth-introspection plan - see original document)*

**Features**:
- Runs every 15 minutes (configurable via `CACHE_CLEANUP_INTERVAL`)
- Deletes expired cache entries
- Logs cleanup operations

---

### Phase 2: Zitadel Integration - Dual Purpose Service (Week 1-2)

**Objective**: Create unified ZitadelService that handles BOTH introspection AND management API

#### 2.1 Unified Zitadel Service

**File**: `apps/server/src/modules/auth/zitadel.service.ts`

**Responsibilities**:
1. Service account authentication (Client Credentials flow)
2. Token caching for Management API calls
3. User creation via Management API
4. User metadata management
5. Role assignment
6. Email notifications

**Key Methods**:
```typescript
// Authentication (shared by all operations)
async getAccessToken(): Promise<string>

// Introspection Support
async introspect(token: string): Promise<IntrospectionContext | null>

// User Management (NEW)
async createUser(email: string, firstName: string, lastName: string): Promise<string>
async getUserByEmail(email: string): Promise<ZitadelUser | null>
async updateUserMetadata(userId: string, metadata: Record<string, any>): Promise<void>
async sendSetPasswordNotification(userId: string, invitationId: string): Promise<void>

// Role Management (NEW)
async grantProjectRole(userId: string, projectId: string, role: string): Promise<void>
async getUserProjectRoles(userId: string, projectId: string): Promise<string[]>
```

**Implementation Structure**:
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

export interface ZitadelUser {
    id: string;
    state: string;
    userName: string;
    preferredLoginName?: string;
    email?: string;
    emailVerified?: boolean;
    phone?: {
        phone: string;
        isPhoneVerified: boolean;
    };
    profile?: {
        firstName?: string;
        lastName?: string;
        displayName?: string;
    };
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

    // --- Authentication (Shared) ---
    
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

    // --- User Management (NEW) ---
    
    async createUser(
        email: string,
        firstName: string,
        lastName: string
    ): Promise<string> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/human/_import`;

        const payload = {
            userName: email,
            profile: {
                firstName,
                lastName,
                displayName: `${firstName} ${lastName}`,
            },
            email: {
                email,
                isEmailVerified: false,
            },
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'x-zitadel-orgid': orgId || '',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to create user (${response.status}): ${errorText}`
                );
            }

            const data = await response.json();
            const userId = data.userId;

            this.logger.log(`Created Zitadel user: ${userId} (${email})`);
            return userId;
        } catch (error) {
            this.logger.error(
                `Failed to create user ${email}: ${(error as Error).message}`
            );
            throw error;
        }
    }

    async getUserByEmail(email: string): Promise<ZitadelUser | null> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/_search`;

        const payload = {
            queries: [
                {
                    emailQuery: {
                        emailAddress: email,
                        method: 'TEXT_QUERY_METHOD_EQUALS',
                    },
                },
            ],
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'x-zitadel-orgid': orgId || '',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to search user (${response.status}): ${errorText}`
                );
            }

            const data = await response.json();
            const users = data.result || [];

            if (users.length === 0) {
                return null;
            }

            return users[0] as ZitadelUser;
        } catch (error) {
            this.logger.error(
                `Failed to get user by email ${email}: ${(error as Error).message}`
            );
            throw error;
        }
    }

    async updateUserMetadata(
        userId: string,
        metadata: Record<string, any>
    ): Promise<void> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/${userId}/metadata`;

        try {
            for (const [key, value] of Object.entries(metadata)) {
                const payload = {
                    key,
                    value: Buffer.from(JSON.stringify(value)).toString('base64'),
                };

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        'x-zitadel-orgid': orgId || '',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `Failed to set metadata ${key} (${response.status}): ${errorText}`
                    );
                }
            }

            this.logger.log(`Updated metadata for user ${userId}`);
        } catch (error) {
            this.logger.error(
                `Failed to update user metadata: ${(error as Error).message}`
            );
            throw error;
        }
    }

    async sendSetPasswordNotification(
        userId: string,
        invitationId: string
    ): Promise<void> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/${userId}/password/_set`;

        const payload = {
            sendMail: true,
            returnCode: false,
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'x-zitadel-orgid': orgId || '',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to send password notification (${response.status}): ${errorText}`
                );
            }

            this.logger.log(
                `Sent password set notification to user ${userId} for invitation ${invitationId}`
            );
        } catch (error) {
            this.logger.error(
                `Failed to send password notification: ${(error as Error).message}`
            );
            throw error;
        }
    }

    async grantProjectRole(
        userId: string,
        projectId: string,
        role: string
    ): Promise<void> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/${userId}/grants`;

        const payload = {
            projectId,
            roleKeys: [role],
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'x-zitadel-orgid': orgId || '',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to grant role (${response.status}): ${errorText}`
                );
            }

            this.logger.log(
                `Granted role ${role} in project ${projectId} to user ${userId}`
            );
        } catch (error) {
            this.logger.error(
                `Failed to grant project role: ${(error as Error).message}`
            );
            throw error;
        }
    }

    async getUserProjectRoles(
        userId: string,
        projectId: string
    ): Promise<string[]> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/${userId}/grants/_search`;

        const payload = {
            queries: [
                {
                    projectIdQuery: {
                        projectId,
                    },
                },
            ],
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'x-zitadel-orgid': orgId || '',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to get user roles (${response.status}): ${errorText}`
                );
            }

            const data = await response.json();
            const grants = data.result || [];

            if (grants.length === 0) {
                return [];
            }

            const roles = grants[0].roleKeys || [];
            return roles;
        } catch (error) {
            this.logger.error(
                `Failed to get user project roles: ${(error as Error).message}`
            );
            throw error;
        }
    }

    // --- Private Helpers ---

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

*(Complete implementation from auth-introspection plan - delegates to ZitadelService for token and introspection call)*

---

### Phase 3: Enhanced Invitation Flow (Week 2)

**Objective**: Integrate ZitadelService into InvitesService for programmatic user creation

#### 3.1 Update InvitesService

**File**: `apps/server/src/modules/invites/invites.service.ts`

**New Method**: `createWithUser()`

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ZitadelService } from '../auth/zitadel.service';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

interface CreateInviteWithUserDto {
    email: string;
    firstName: string;
    lastName: string;
    organizationId?: string;  // For org invites
    projectId?: string;       // For project invites
    role: 'org_admin' | 'project_admin' | 'project_user';
    invitedByUserId: string;
}

@Injectable()
export class InvitesService {
    private readonly logger = new Logger(InvitesService.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly zitadelService: ZitadelService  // NEW DEPENDENCY
    ) {}

    /**
     * Create invitation AND Zitadel user in a single operation
     * 
     * Flow:
     * 1. Check if user already exists in Zitadel
     * 2. If not, create new Zitadel user
     * 3. Store invitation metadata in Zitadel
     * 4. Create invitation record in database
     * 5. Send password set notification email
     * 6. Return invitation details
     */
    async createWithUser(dto: CreateInviteWithUserDto): Promise<{
        inviteId: string;
        token: string;
        zitadelUserId: string;
        email: string;
    }> {
        const { email, firstName, lastName, organizationId, projectId, role, invitedByUserId } = dto;

        // Validate input
        if (!organizationId && !projectId) {
            throw new BadRequestException('Either organizationId or projectId must be provided');
        }

        try {
            // Step 1: Check if user already exists in Zitadel
            let existingUser = await this.zitadelService.getUserByEmail(email);
            let zitadelUserId: string;

            if (existingUser) {
                this.logger.log(`User already exists in Zitadel: ${existingUser.id} (${email})`);
                zitadelUserId = existingUser.id;
            } else {
                // Step 2: Create new Zitadel user
                zitadelUserId = await this.zitadelService.createUser(email, firstName, lastName);
                this.logger.log(`Created new Zitadel user: ${zitadelUserId} (${email})`);
            }

            // Step 3: Generate invitation token
            const inviteId = uuidv4();
            const token = randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);  // 7 days expiry

            // Step 4: Store invitation metadata in Zitadel
            const inviteMetadata = {
                inviteId,
                role,
                organizationId: organizationId || null,
                projectId: projectId || null,
                invitedByUserId,
                invitedAt: new Date().toISOString(),
            };

            await this.zitadelService.updateUserMetadata(zitadelUserId, {
                'spec-server-invite': inviteMetadata,
            });

            // Step 5: Create invitation record in database
            await this.db.query(
                `INSERT INTO kb.invites (id, token, email, organization_id, project_id, invited_by_user_id, expires_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [inviteId, token, email, organizationId || null, projectId || null, invitedByUserId, expiresAt]
            );

            // Step 6: Send password set notification email
            await this.zitadelService.sendSetPasswordNotification(zitadelUserId, inviteId);

            this.logger.log(
                `Created invitation ${inviteId} for ${email} (Zitadel user: ${zitadelUserId})`
            );

            return {
                inviteId,
                token,
                zitadelUserId,
                email,
            };
        } catch (error) {
            this.logger.error(
                `Failed to create invitation with user: ${(error as Error).message}`
            );
            throw error;
        }
    }

    /**
     * Accept invitation - grants role in Zitadel + creates membership in database
     */
    async accept(token: string, userId: string): Promise<void> {
        // Step 1: Fetch invitation
        const result = await this.db.query(
            `SELECT id, email, organization_id, project_id, expires_at
             FROM kb.invites
             WHERE token = $1 AND accepted_at IS NULL`,
            [token]
        );

        if (result.rows.length === 0) {
            throw new BadRequestException('Invalid or expired invitation token');
        }

        const invite = result.rows[0];

        // Step 2: Check expiry
        if (new Date(invite.expires_at) < new Date()) {
            throw new BadRequestException('Invitation has expired');
        }

        // Step 3: Get user's zitadel_user_id
        const userResult = await this.db.query(
            `SELECT zitadel_user_id FROM core.user_profiles WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw new BadRequestException('User profile not found');
        }

        const zitadelUserId = userResult.rows[0].zitadel_user_id;

        try {
            // Step 4: Grant role in Zitadel (if projectId present)
            if (invite.project_id) {
                const projectId = process.env.ZITADEL_PROJECT_ID;
                if (!projectId) {
                    throw new Error('ZITADEL_PROJECT_ID not configured');
                }

                // Determine role based on invite
                const role = invite.organization_id ? 'org_admin' : 'project_user';
                await this.zitadelService.grantProjectRole(zitadelUserId, projectId, role);

                this.logger.log(
                    `Granted role ${role} in project ${projectId} to user ${zitadelUserId}`
                );
            }

            // Step 5: Create membership in database
            if (invite.organization_id) {
                await this.db.query(
                    `INSERT INTO kb.organization_memberships (organization_id, user_id, role, created_at)
                     VALUES ($1, $2, 'admin', NOW())
                     ON CONFLICT (organization_id, user_id) DO NOTHING`,
                    [invite.organization_id, userId]
                );
            }

            if (invite.project_id) {
                await this.db.query(
                    `INSERT INTO kb.project_memberships (project_id, user_id, role, created_at)
                     VALUES ($1, $2, 'user', NOW())
                     ON CONFLICT (project_id, user_id) DO NOTHING`,
                    [invite.project_id, userId]
                );
            }

            // Step 6: Mark invitation as accepted
            await this.db.query(
                `UPDATE kb.invites SET accepted_at = NOW() WHERE id = $1`,
                [invite.id]
            );

            this.logger.log(`User ${userId} accepted invitation ${invite.id}`);
        } catch (error) {
            this.logger.error(
                `Failed to accept invitation: ${(error as Error).message}`
            );
            throw error;
        }
    }

    // Keep existing create() method for backwards compatibility
    async create(dto: any): Promise<any> {
        // Original implementation without Zitadel integration
        // Used for cases where user already exists
    }
}
```

#### 3.2 Update InvitesController

**File**: `apps/server/src/modules/invites/invites.controller.ts`

**New Endpoint**: `POST /invites/with-user`

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InvitesService } from './invites.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

@Controller('invites')
@UseGuards(AuthGuard, RolesGuard)
export class InvitesController {
    constructor(private readonly invitesService: InvitesService) {}

    /**
     * Create invitation and Zitadel user in single operation
     * Only org/project admins can invite users
     */
    @Post('with-user')
    @Roles('org_admin', 'project_admin')
    async createWithUser(
        @Body() dto: {
            email: string;
            firstName: string;
            lastName: string;
            organizationId?: string;
            projectId?: string;
            role: 'org_admin' | 'project_admin' | 'project_user';
        },
        @CurrentUser() user: AuthUser
    ) {
        return this.invitesService.createWithUser({
            ...dto,
            invitedByUserId: user.id,
        });
    }

    // Keep existing endpoints...
}
```

#### 3.3 Update InvitesModule

**File**: `apps/server/src/modules/invites/invites.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { AuthModule } from '../auth/auth.module';  // Already imported
import { DatabaseModule } from '../../common/database/database.module';

@Module({
    imports: [
        AuthModule,  // Now includes ZitadelService
        DatabaseModule,
    ],
    providers: [InvitesService],
    controllers: [InvitesController],
    exports: [InvitesService],
})
export class InvitesModule {}
```

---

### Phase 4: Auth Service Integration & Role Guards (Week 2-3)

**Objective**: Complete auth system with introspection, roles, and guards

#### 4.1 Update AuthService

**File**: `apps/server/src/modules/auth/auth.service.ts`

**Key Changes**:
1. Add `ZitadelIntrospectionService` dependency
2. Update `validateToken()` to try introspection first
3. Add `roles` and `organizationId` to `AuthUser` interface
4. Add production safety checks for mock tokens

*(Complete implementation from auth-introspection plan - see section 3.1)*

#### 4.2 Roles Decorator & Guard

**Files**:
- `apps/server/src/modules/auth/roles.decorator.ts`
- `apps/server/src/modules/auth/roles.guard.ts`

*(Complete implementations from auth-introspection plan - see section 3.2)*

#### 4.3 Update Auth Module

**File**: `apps/server/src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { ScopesGuard } from './scopes.guard';
import { RolesGuard } from './roles.guard';
import { ZitadelService } from './zitadel.service';
import { ZitadelIntrospectionService } from './zitadel-introspection.service';
import { PostgresCacheService } from './postgres-cache.service';
import { CacheCleanupService } from './cache-cleanup.service';
import { PermissionService } from './permission.service';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
    imports: [
        UserProfileModule,
        DatabaseModule,
    ],
    providers: [
        AuthService,
        AuthGuard,
        ScopesGuard,
        RolesGuard,
        ZitadelService,
        ZitadelIntrospectionService,
        PostgresCacheService,
        CacheCleanupService,
        PermissionService,
        AuditService,
        AuditInterceptor,
    ],
    exports: [
        AuthService,
        AuthGuard,
        ScopesGuard,
        RolesGuard,
        ZitadelService,  // Export for use in InvitesModule
        PermissionService,
        AuditService,
    ],
})
export class AuthModule {}
```

---

## Environment Variables (Complete List)

**File**: `.env.example`

```bash
# --- Node Environment ---
NODE_ENV=development  # development | production | test

# --- Zitadel Configuration ---
# Domain (without https://)
ZITADEL_DOMAIN=your-zitadel-instance.zitadel.cloud
ZITADEL_MAIN_ORG_ID=your-organization-id
ZITADEL_PROJECT_ID=your-project-id

# Frontend Client (for token validation via introspection)
ZITADEL_FRONTEND_CLIENT_ID=344995930577111044
ZITADEL_ISSUER=${ZITADEL_DOMAIN}

# Service Account (for Management API)
ZITADEL_SERVICE_CLIENT_ID=<to-be-created>
ZITADEL_SERVICE_CLIENT_SECRET=<to-be-created>
ZITADEL_CLIENT_JWT_PATH=/path/to/service-account-key.json
# OR
ZITADEL_CLIENT_JWT={"type":"serviceaccount","keyId":"..."}

# --- Authentication (JWT Validation) ---
AUTH_ISSUER=https://${ZITADEL_DOMAIN}/
AUTH_AUDIENCE=${ZITADEL_FRONTEND_CLIENT_ID}
AUTH_JWKS_URI=https://${ZITADEL_DOMAIN}/oauth/v2/keys

# --- Cache Configuration ---
INTROSPECTION_CACHE_TTL=300  # 5 minutes (in seconds)
CACHE_CLEANUP_INTERVAL=900   # 15 minutes (in seconds)

# --- Testing ---
AUTH_TEST_STATIC_TOKENS=1  # Enable e2e-*, no-scope, with-scope tokens (auto-disabled in production)

# --- Debug (Development Only) ---
DEBUG_AUTH_CLAIMS=0
DEBUG_AUTH_SCOPES=0

# --- Audit ---
AUDIT_DATABASE_LOGGING=true
AUDIT_CONSOLE_LOGGING=false
```

---

## Coolify Deployment Updates

### docker-compose.coolify.yml Updates

**Already Applied** (from previous session):
```yaml
services:
  server:
    environment:
      # Frontend Client (for token validation)
      ZITADEL_ISSUER: ${ZITADEL_ISSUER}
      ZITADEL_FRONTEND_CLIENT_ID: ${ZITADEL_FRONTEND_CLIENT_ID}
      
      # Service Account (for Management API)
      ZITADEL_SERVICE_CLIENT_ID: ${ZITADEL_SERVICE_CLIENT_ID}
      ZITADEL_SERVICE_CLIENT_SECRET: ${ZITADEL_SERVICE_CLIENT_SECRET}
      ZITADEL_MAIN_ORG_ID: ${ZITADEL_MAIN_ORG_ID}
      ZITADEL_PROJECT_ID: ${ZITADEL_PROJECT_ID}
      ZITADEL_DOMAIN: ${ZITADEL_DOMAIN}
      
      # Auth (JWT validation - validates tokens from frontend)
      AUTH_ISSUER: ${ZITADEL_ISSUER}
      AUTH_AUDIENCE: ${ZITADEL_FRONTEND_CLIENT_ID}
      AUTH_JWKS_URI: ${ZITADEL_ISSUER}/oauth/v2/keys
      
      # Service account key (choose one)
      # ZITADEL_CLIENT_JWT_PATH: /app/zitadel-service-account-key.json
      # ZITADEL_CLIENT_JWT: ${ZITADEL_CLIENT_JWT}
```

### Coolify Environment Variables to Set

| Variable | Value | Notes |
|----------|-------|-------|
| `ZITADEL_DOMAIN` | `spec-zitadel.kucharz.net` | Without https:// |
| `ZITADEL_ISSUER` | `https://spec-zitadel.kucharz.net/` | With trailing slash |
| `ZITADEL_FRONTEND_CLIENT_ID` | `344995930577111044` | Existing frontend app |
| `ZITADEL_SERVICE_CLIENT_ID` | `<create-in-zitadel>` | Service account app |
| `ZITADEL_SERVICE_CLIENT_SECRET` | `<create-in-zitadel>` | Service account secret |
| `ZITADEL_MAIN_ORG_ID` | `<from-zitadel>` | Organization ID |
| `ZITADEL_PROJECT_ID` | `<from-zitadel>` | Project ID for role grants |
| `ZITADEL_CLIENT_JWT` | `{"type":"serviceaccount",...}` | Service account key JSON |

---

## Implementation Timeline

### Week 1: Infrastructure
- **Monday**: Database migration, PostgresCacheService, CacheCleanupService
- **Tuesday**: ZitadelService (authentication methods)
- **Wednesday**: ZitadelService (user management methods)
- **Thursday**: ZitadelIntrospectionService
- **Friday**: Unit tests for cache and Zitadel services

### Week 2: Integration
- **Monday**: Update AuthService with introspection
- **Tuesday**: InvitesService.createWithUser() method
- **Wednesday**: InvitesController + frontend integration
- **Thursday**: RolesGuard + @Roles decorator
- **Friday**: Update auth module, integration tests

### Week 3: Testing & Deployment
- **Monday**: E2E tests for invitation flow
- **Tuesday**: Create service account in Zitadel
- **Wednesday**: Update Coolify environment variables
- **Thursday**: Deploy to production, smoke tests
- **Friday**: Documentation, monitoring, validation

### Week 4 (Buffer): Polish & Documentation
- **Monday-Tuesday**: Final testing, edge cases
- **Wednesday-Thursday**: Documentation updates
- **Friday**: Team review, knowledge transfer

---

## Testing Strategy

### Unit Tests (11 files)

1. **PostgresCacheService**
   - `get()` - cache hit/miss scenarios
   - `set()` - cache storage
   - `invalidate()` - cache removal
   - `cleanupExpired()` - expired entry deletion

2. **ZitadelService**
   - `getAccessToken()` - token generation, caching
   - `createUser()` - user creation API call
   - `getUserByEmail()` - user search
   - `updateUserMetadata()` - metadata storage
   - `sendSetPasswordNotification()` - email trigger
   - `grantProjectRole()` - role assignment
   - `getUserProjectRoles()` - role retrieval

3. **ZitadelIntrospectionService**
   - `introspect()` - token validation
   - Cache integration
   - Response mapping

4. **RolesGuard**
   - Role validation (single, multiple)
   - OR logic (any role matches)
   - Missing user handling

5. **InvitesService**
   - `createWithUser()` - full invitation flow
   - `accept()` - role granting + membership creation
   - Error handling (existing user, expired invite)

### Integration Tests (5 scenarios)

1. **Cache Flow**: Token → introspect → cache → cached response (verify 2nd call skips API)
2. **Auth Flow**: Real token → introspection → user profile sync → roles extracted
3. **Invite Flow**: Create with user → Zitadel user created → metadata stored → email sent
4. **Accept Flow**: Accept invite → role granted in Zitadel → membership created → invite marked accepted
5. **Cleanup**: Insert expired cache entries → run cleanup → verify deletion

### E2E Tests (7 scenarios)

1. **Mock Tokens**: Verify `e2e-*` tokens work in test mode, rejected in production
2. **Real Tokens**: Test full auth flow with actual Zitadel tokens
3. **Role Enforcement**: Test 403 for insufficient roles
4. **Invite New User**: POST /invites/with-user → verify Zitadel user + email
5. **Invite Existing User**: POST /invites/with-user with existing email → verify no duplicate
6. **Accept Invite**: POST /invites/:token/accept → verify role in Zitadel + membership in DB
7. **Expired Invite**: Attempt to accept expired invite → verify 400 error

---

## Success Metrics

### Performance
- ✅ <50ms auth time (cached introspection)
- ✅ 80-95% cache hit rate in production
- ✅ <200ms auth time (uncached introspection)
- ✅ <500ms user creation time (Zitadel API call)

### Quality
- ✅ All existing tests still pass
- ✅ New tests achieve >80% coverage
- ✅ Zero production errors in first week
- ✅ Mock tokens work in dev/test only

### Security
- ✅ Mock tokens disabled in production
- ✅ Introspection working with real tokens
- ✅ Role-based access control functional
- ✅ Cache properly expires
- ✅ Service account credentials never exposed to frontend

### Functionality
- ✅ Users can be invited and created in single operation
- ✅ Invitation emails sent automatically
- ✅ Roles granted in Zitadel on invite acceptance
- ✅ Backwards compatibility maintained

---

## Rollback Plan

### If Issues Arise

1. **Cache Issues**: Disable cache by setting `INTROSPECTION_CACHE_TTL=0` (falls back to uncached)
2. **Introspection Failures**: Auth falls back to JWT validation automatically
3. **User Creation Failures**: Use original `create()` method (manual Zitadel user creation)
4. **Service Account Issues**: Verify key JSON format, regenerate if needed

### Database Rollback

```sql
-- Remove cache table if needed
DROP TABLE IF EXISTS kb.auth_introspection_cache;
```

### Code Rollback

```bash
# Revert to previous commit
git revert <commit-hash>
git push

# Redeploy in Coolify
```

---

## Monitoring & Observability

### Metrics to Track

1. **Auth Performance**
   - Cache hit rate: `SELECT COUNT(*) FROM kb.auth_introspection_cache WHERE created_at > NOW() - INTERVAL '1 hour'`
   - Average auth time: Log in AuthService
   - Failed introspection rate: Count 401 responses

2. **Invitation Flow**
   - User creation success rate: Count successful `createUser()` calls
   - Invitation acceptance rate: `SELECT COUNT(*) FROM kb.invites WHERE accepted_at IS NOT NULL`
   - Email delivery failures: Log in `sendSetPasswordNotification()`

3. **Cache Health**
   - Expired entries cleaned: Log in CacheCleanupService
   - Cache size: `SELECT COUNT(*) FROM kb.auth_introspection_cache`
   - Oldest cache entry: `SELECT MIN(created_at) FROM kb.auth_introspection_cache`

### Logging Strategy

- **INFO**: Successful user creation, role grants, cache hits
- **WARN**: Introspection failures (fallback to JWT), cache misses
- **ERROR**: User creation failures, role grant failures, service account auth failures

---

## Documentation Deliverables

1. **Architecture Documentation**
   - This unified plan (current file)
   - Architecture diagrams (token flow, invitation flow)
   - API endpoints reference

2. **Developer Guides**
   - Migration guide from current to new system
   - Testing guide (how to test with mock vs real tokens)
   - Troubleshooting guide (common issues)

3. **Operations Documentation**
   - Deployment checklist
   - Monitoring guide
   - Incident response playbook

4. **API Documentation**
   - Updated OpenAPI spec with new `/invites/with-user` endpoint
   - Updated AuthUser interface documentation
   - @Roles decorator usage examples

---

## File Checklist

### New Files (15)

**Database**
- [ ] `migrations/0004_auth_introspection_cache.sql`

**Auth Module**
- [ ] `src/modules/auth/postgres-cache.service.ts`
- [ ] `src/modules/auth/cache-cleanup.service.ts`
- [ ] `src/modules/auth/zitadel.service.ts` (enhanced with user management)
- [ ] `src/modules/auth/zitadel-introspection.service.ts`
- [ ] `src/modules/auth/roles.decorator.ts`
- [ ] `src/modules/auth/roles.guard.ts`

**Tests**
- [ ] `src/modules/auth/__tests__/postgres-cache.service.spec.ts`
- [ ] `src/modules/auth/__tests__/zitadel.service.spec.ts`
- [ ] `src/modules/auth/__tests__/zitadel-introspection.service.spec.ts`
- [ ] `src/modules/auth/__tests__/roles.guard.spec.ts`
- [ ] `src/modules/invites/__tests__/invites.service.spec.ts` (enhanced)

**Documentation**
- [ ] `docs/architecture/unified-auth-service-account-implementation-plan.md` (this file)
- [ ] `docs/guides/auth-migration-guide.md`
- [ ] `docs/guides/invitation-flow-guide.md`

### Modified Files (6)

- [ ] `src/modules/auth/auth.service.ts` (add introspection, roles to AuthUser)
- [ ] `src/modules/auth/auth.module.ts` (register new services)
- [ ] `src/modules/invites/invites.service.ts` (add createWithUser method)
- [ ] `src/modules/invites/invites.controller.ts` (add /with-user endpoint)
- [ ] `src/modules/invites/invites.module.ts` (import AuthModule)
- [ ] `.env.example` (add Zitadel environment variables)

---

## Pre-Implementation Checklist

### Zitadel Configuration

- [ ] Create service account in Zitadel
- [ ] Download service account key JSON
- [ ] Verify service account has Management API permissions:
  - `urn:zitadel:iam:org:project:id:zitadel:aud` scope
  - User management permissions
  - Role management permissions
- [ ] Get ZITADEL_MAIN_ORG_ID from Zitadel console
- [ ] Get ZITADEL_PROJECT_ID from Zitadel console
- [ ] Define project roles: `org_admin`, `project_admin`, `project_user`

### Environment Setup

- [ ] Update `.env.example` with all variables
- [ ] Update Coolify environment variables
- [ ] Store service account key securely (environment variable or mounted file)
- [ ] Verify AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URI are correct

### Database Preparation

- [ ] Review migration SQL
- [ ] Plan downtime (if needed for migration)
- [ ] Backup production database
- [ ] Test migration on staging environment first

---

## Support & References

### Proven Implementations

1. **Introspection System**: huma-blueprint-ui (apps/api/src/auth/)
   - Status: Production-ready, fully tested (51 passing tests)
   - Features: Introspection, PostgreSQL cache, role guards

2. **Existing Spec-Server-2**: Solid foundations
   - UserProfileService: `src/modules/user-profile/`
   - InvitesService: `src/modules/invites/`
   - Database schema: Migrations 0001, 0003

### Key Files to Review

- `apps/server/src/modules/auth/auth.service.ts` - Current auth logic
- `apps/server/src/modules/invites/invites.service.ts` - Current invite logic
- `apps/server/src/modules/user-profile/user-profile.service.ts` - User profile management
- `docker-compose.coolify.yml` - Production configuration

### External Documentation

- [Zitadel Management API](https://zitadel.com/docs/apis/resources/mgmt)
- [Zitadel OAuth2 Introspection](https://zitadel.com/docs/apis/openidoauth/endpoints#introspection_endpoint)
- [Zitadel Service Accounts](https://zitadel.com/docs/guides/integrate/service-users)

---

## Next Steps

1. **Read & Approve Plan**: Review this unified plan with team
2. **Create Service Account**: Set up in Zitadel, download key
3. **Week 1: Infrastructure**: Cache + Zitadel services
4. **Week 2: Integration**: Auth + Invites
5. **Week 3: Testing & Deploy**: E2E tests + production deployment
6. **Week 4: Documentation**: Guides + monitoring

**Ready to implement!** This plan merges proven introspection code with new user management capabilities, creating a complete end-to-end authentication system for spec-server-2.
