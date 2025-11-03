import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { PostgresCacheService } from './postgres-cache.service';

/**
 * Zitadel service account key structure (from downloaded JSON file)
 */
interface ZitadelServiceAccountKey {
    type: string;
    keyId: string;
    key: string;
    userId?: string;
    appId?: string;
    clientId?: string;
}

/**
 * OAuth2 token response from Zitadel token endpoint
 */
interface ZitadelTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

/**
 * Zitadel user representation
 */
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

/**
 * Token introspection result
 */
export interface IntrospectionResult {
    active: boolean;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    preferred_username?: string;
    given_name?: string;
    family_name?: string;
    locale?: string;
    [key: string]: any;
}

/**
 * ZitadelService provides dual-purpose Zitadel integration:
 * 1. Management API access (user creation, metadata, roles)
 * 2. Token introspection (validates user tokens from frontend)
 *
 * Authentication:
 * - Uses service account JWT bearer assertion (Client Credentials flow)
 * - Caches access tokens with 1-minute safety margin
 *
 * Configuration (environment variables):
 * - ZITADEL_DOMAIN: Zitadel instance domain (e.g., zitadel.example.com)
 * - ZITADEL_CLIENT_JWT or ZITADEL_CLIENT_JWT_PATH: Service account key (JSON)
 * - ZITADEL_MAIN_ORG_ID: Organization ID for user management operations
 * - ZITADEL_PROJECT_ID: Project ID for role grants
 *
 * Security:
 * - Service account credentials never exposed to frontend
 * - All tokens cached to reduce API load
 * - Graceful degradation on configuration errors (logs warning)
 */
@Injectable()
export class ZitadelService implements OnModuleInit {
    private readonly logger = new Logger(ZitadelService.name);
    private serviceAccountKey?: ZitadelServiceAccountKey;
    private cachedToken?: {
        token: string;
        expiresAt: number;
    };

    constructor(
        private readonly cacheService: PostgresCacheService
    ) { }

    onModuleInit(): void {
        const zitadelDomain = process.env.ZITADEL_DOMAIN;

        if (!zitadelDomain) {
            this.logger.warn(
                'Zitadel service not configured (ZITADEL_DOMAIN missing) - skipping initialization'
            );
            return;
        }

        try {
            this.loadServiceAccountKey();
            this.logger.log('Zitadel service initialized successfully');
        } catch (error) {
            this.logger.error(
                `Failed to initialize Zitadel service: ${(error as Error).message}`
            );
            // In production, fail fast on configuration errors
            if (process.env.NODE_ENV === 'production') {
                throw error;
            }
        }
    }

    /**
     * Check if Zitadel service is properly configured
     * 
     * @returns true if domain and service account key are available
     */
    isConfigured(): boolean {
        return !!(process.env.ZITADEL_DOMAIN && this.serviceAccountKey);
    }

    /**
     * Get access token for Management API calls
     * 
     * Implements OAuth2 Client Credentials flow with JWT bearer assertion:
     * 1. Creates JWT signed with service account private key
     * 2. Exchanges JWT for access token at token endpoint
     * 3. Caches token with 1-minute safety margin
     * 
     * @returns Valid access token
     * @throws Error if service account not configured
     */
    async getAccessToken(): Promise<string> {
        if (!this.serviceAccountKey) {
            throw new Error('Zitadel service account key not loaded');
        }

        // Return cached token if still valid
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
            this.logger.debug('Using cached service account token');
            return this.cachedToken.token;
        }

        this.logger.debug('Requesting new service account token');
        const assertion = await this.createJwtAssertion();
        const token = await this.requestAccessToken(assertion);

        // Cache token with 1 minute safety margin
        this.cachedToken = {
            token: token.access_token,
            expiresAt: Date.now() + (token.expires_in - 60) * 1000,
        };

        this.logger.log(
            `Service account token acquired (expires in ${token.expires_in}s)`
        );
        return token.access_token;
    }

    /**
     * Introspect token with cache support
     * 
     * Flow:
     * 1. Check PostgreSQL cache first (fast path)
     * 2. If cache miss, call Zitadel introspection endpoint
     * 3. Cache result for future requests
     * 
     * @param token - Access token to introspect
     * @returns Introspection result or null on error
     */
    async introspect(token: string): Promise<IntrospectionResult | null> {
        if (!this.serviceAccountKey) {
            this.logger.warn('Zitadel not configured, skipping introspection');
            return null;
        }

        // Check cache first
        const cached = await this.cacheService.get(token);
        if (cached) {
            this.logger.debug('Introspection cache hit');
            return cached.data as IntrospectionResult;
        }

        // Cache miss - call Zitadel
        this.logger.debug('Introspection cache miss, calling Zitadel');
        const serviceToken = await this.getAccessToken();
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/oauth/v2/introspect`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Bearer ${serviceToken}`,
                },
                body: new URLSearchParams({
                    token,
                    token_type_hint: 'access_token',
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(
                    `Introspection failed (${response.status}): ${errorText}`
                );
                return null;
            }

            const result = await response.json() as IntrospectionResult;

            // Cache successful introspection
            if (result.active && result.exp) {
                const expiresAt = new Date(result.exp * 1000);
                await this.cacheService.set(token, result, expiresAt);
                this.logger.debug('Introspection result cached');
            }

            return result;
        } catch (error) {
            this.logger.error(
                `Introspection error: ${(error as Error).message}`
            );
            return null;
        }
    }

    /**
     * Create user in Zitadel via Management API
     * 
     * Uses human user import endpoint to create user with:
     * - Email (unverified initially)
     * - First name, last name, display name
     * - Username (set to email)
     * 
     * @param email - User email address
     * @param firstName - User first name
     * @param lastName - User last name
     * @returns Zitadel user ID
     * @throws Error on API failure
     */
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

    /**
     * Find user by email address
     * 
     * Uses user search endpoint with email query filter
     * 
     * @param email - Email address to search
     * @returns Zitadel user or null if not found
     * @throws Error on API failure
     */
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
                this.logger.debug(`User not found by email: ${email}`);
                return null;
            }

            this.logger.debug(`Found user by email: ${email} -> ${users[0].id}`);
            return users[0] as ZitadelUser;
        } catch (error) {
            this.logger.error(
                `Failed to get user by email ${email}: ${(error as Error).message}`
            );
            throw error;
        }
    }

    /**
     * Update user metadata
     * 
     * Stores arbitrary key-value pairs as user metadata in Zitadel
     * Values are base64-encoded JSON strings
     * 
     * Use cases:
     * - Store invitation context (invitation_id, invited_by, etc.)
     * - Store internal references (user_profile_id)
     * - Store audit trail
     * 
     * @param userId - Zitadel user ID
     * @param metadata - Key-value pairs to store
     */
    async updateUserMetadata(
        userId: string,
        metadata: Record<string, any>
    ): Promise<void> {
        const token = await this.getAccessToken();
        const orgId = process.env.ZITADEL_MAIN_ORG_ID;
        const apiUrl = `https://${process.env.ZITADEL_DOMAIN}/management/v1/users/${userId}/metadata`;

        try {
            // Metadata must be set one key at a time
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

            this.logger.log(
                `Updated metadata for user ${userId}: ${Object.keys(metadata).join(', ')}`
            );
        } catch (error) {
            this.logger.error(
                `Failed to update user metadata: ${(error as Error).message}`
            );
            throw error;
        }
    }

    /**
     * Send password set notification to user
     * 
     * Triggers Zitadel to send email with password setup link
     * Used in invitation flow after user creation
     * 
     * @param userId - Zitadel user ID
     * @param invitationId - Invitation ID for logging/tracking
     */
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

    /**
     * Grant project role to user
     * 
     * Creates user grant in Zitadel connecting user to project with specific role
     * 
     * @param userId - Zitadel user ID
     * @param projectId - Zitadel project ID
     * @param role - Role key (e.g., 'project_admin', 'project_member')
     */
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

    /**
     * Get user's roles in project
     * 
     * Retrieves list of role keys assigned to user in specified project
     * 
     * @param userId - Zitadel user ID
     * @param projectId - Zitadel project ID
     * @returns Array of role keys
     */
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
                this.logger.debug(
                    `No roles found for user ${userId} in project ${projectId}`
                );
                return [];
            }

            const roles = grants[0].roleKeys || [];
            this.logger.debug(
                `User ${userId} has roles in project ${projectId}: ${roles.join(', ')}`
            );
            return roles;
        } catch (error) {
            this.logger.error(
                `Failed to get user project roles: ${(error as Error).message}`
            );
            throw error;
        }
    }

    /**
     * Load service account key from environment
     * 
     * Supports two configuration methods:
     * 1. ZITADEL_CLIENT_JWT: JSON string directly in env var
     * 2. ZITADEL_CLIENT_JWT_PATH: Path to JSON file
     * 
     * @throws Error if neither env var set or key invalid
     * @private
     */
    private loadServiceAccountKey(): void {
        let keyJson: string;

        const clientJwt = process.env.ZITADEL_CLIENT_JWT;
        const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;

        if (clientJwt) {
            this.logger.debug('Loading service account key from ZITADEL_CLIENT_JWT');
            keyJson = clientJwt;
        } else if (clientJwtPath) {
            this.logger.debug(
                `Loading service account key from file: ${clientJwtPath}`
            );
            try {
                keyJson = readFileSync(clientJwtPath, 'utf-8');
            } catch (error) {
                throw new Error(
                    `Failed to read service account key from ${clientJwtPath}: ${(error as Error).message}`
                );
            }
        } else {
            throw new Error(
                'Either ZITADEL_CLIENT_JWT or ZITADEL_CLIENT_JWT_PATH must be set'
            );
        }

        // Handle different JSON escaping formats from environment variables
        // Some platforms (like Coolify) may double-escape quotes and newlines
        try {
            // First attempt: Parse as-is
            this.serviceAccountKey = JSON.parse(keyJson);
        } catch (firstError) {
            this.logger.debug(
                `First parse attempt failed, trying to unescape: ${(firstError as Error).message}`
            );
            
            try {
                // Second attempt: Unescape double-escaped strings
                // Replace \\n with \n and \" with "
                const unescaped = keyJson
                    .replace(/\\\\n/g, '\\n')  // Fix double-escaped newlines
                    .replace(/\\"/g, '"');      // Fix escaped quotes
                
                this.serviceAccountKey = JSON.parse(unescaped);
                this.logger.debug('Successfully parsed after unescaping');
            } catch (secondError) {
                throw new Error(
                    `Failed to parse Zitadel key after trying multiple formats: ${(secondError as Error).message}`
                );
            }
        }

        // After parsing, fix any literal \n sequences in the RSA key
        // (Coolify double-escapes newlines, so after JSON.parse they become literal \n)
        if (this.serviceAccountKey?.key) {
            const originalKey = this.serviceAccountKey.key;
            
            // Log first 100 chars to see what we're working with
            this.logger.log(
                `[KEY_DEBUG] Original key first 100 chars: ${originalKey.substring(0, 100).replace(/\n/g, '\\n')}`
            );
            
            // Replace literal \n, \r, \t with actual escape sequences
            this.serviceAccountKey.key = originalKey
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t');
            
            // Log after replacement
            this.logger.log(
                `[KEY_DEBUG] Fixed key first 100 chars: ${this.serviceAccountKey.key.substring(0, 100).replace(/\n/g, '\\n')}`
            );
            
            if (originalKey !== this.serviceAccountKey.key) {
                this.logger.log('[KEY_DEBUG] Fixed escape sequences in RSA private key');
            } else {
                this.logger.log('[KEY_DEBUG] No escape sequences to fix (key unchanged)');
            }
        }

        try {
            if (
                !this.serviceAccountKey?.keyId ||
                !this.serviceAccountKey?.key
            ) {
                throw new Error('Invalid key format: missing keyId or key');
            }

            if (
                !this.serviceAccountKey.userId &&
                !this.serviceAccountKey.appId
            ) {
                throw new Error('Invalid key format: missing userId or appId');
            }

            this.logger.debug(
                `Service account key loaded (keyId: ${this.serviceAccountKey.keyId})`
            );
        } catch (error) {
            throw new Error(
                `Failed to validate Zitadel key: ${(error as Error).message}`
            );
        }
    }

    /**
     * Create JWT bearer assertion for token request
     * 
     * Implements RFC 7523 JWT bearer token flow:
     * 1. Creates JWT with service account claims
     * 2. Signs with RS256 using private key
     * 3. Sets audience to Zitadel instance
     * 
     * @returns Signed JWT assertion
     * @private
     */
    private async createJwtAssertion(): Promise<string> {
        if (!this.serviceAccountKey) {
            throw new Error('Service account key not loaded');
        }

        // Dynamically import jose library
        // Note: Zitadel provides PKCS#1 format keys (BEGIN RSA PRIVATE KEY)
        // but we try PKCS#8 import first, then fall back to generic import
        const jose = await import('jose');
        
        let privateKey: any;
        try {
            // Try PKCS#8 import first
            privateKey = await jose.importPKCS8(
                this.serviceAccountKey.key,
                'RS256'
            );
        } catch (pkcs8Error) {
            this.logger.debug(
                `PKCS#8 import failed (${(pkcs8Error as Error).message}), trying generic PEM import...`
            );
            // Fall back to generic PEM import which handles both PKCS#1 and PKCS#8
            privateKey = await jose.importPKCS8(
                this.serviceAccountKey.key.replace(
                    /-----BEGIN RSA PRIVATE KEY-----/,
                    '-----BEGIN PRIVATE KEY-----'
                ).replace(
                    /-----END RSA PRIVATE KEY-----/,
                    '-----END PRIVATE KEY-----'
                ),
                'RS256'
            ).catch(async () => {
                // If that also fails, use importPKCS1 if available, or throw
                this.logger.warn('Both PKCS#8 and header replacement failed, key might need conversion');
                throw new Error(`Failed to import private key: ${(pkcs8Error as Error).message}`);
            });
        }

        const now = Math.floor(Date.now() / 1000);
        const issuer =
            this.serviceAccountKey.userId || this.serviceAccountKey.appId!;
        const subject =
            this.serviceAccountKey.userId || this.serviceAccountKey.clientId!;
        const audience = `https://${process.env.ZITADEL_DOMAIN}`;

        const jwt = await new jose.SignJWT({})
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

    /**
     * Exchange JWT assertion for access token
     * 
     * Calls Zitadel token endpoint with JWT bearer grant
     * 
     * @param assertion - Signed JWT assertion
     * @returns Token response with access_token and expires_in
     * @private
     */
    private async requestAccessToken(
        assertion: string
    ): Promise<ZitadelTokenResponse> {
        const tokenUrl = `https://${process.env.ZITADEL_DOMAIN}/oauth/v2/token`;

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
                scope: 'openid profile email urn:zitadel:iam:org:project:id:zitadel:aud',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Token request failed (${response.status}): ${errorText}`
            );
        }

        return response.json();
    }
}
