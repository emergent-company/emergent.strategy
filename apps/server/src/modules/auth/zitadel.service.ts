import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { PostgresCacheService } from './postgres-cache.service';
import { ZitadelServiceAccountKey } from './auth.config';

/**
 * Cached service account token
 */
interface CachedToken {
  token: string;
  expiresAt: number;
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
 * 1. Management API access (user creation, metadata, roles) - Uses API service account
 * 2. Token introspection (validates user tokens from frontend) - Uses CLIENT service account
 *
 * Dual Service Account Architecture:
 * - CLIENT JWT: Used only for token introspection (minimal permissions)
 * - API JWT: Used only for Management API calls (elevated permissions)
 *
 * This separation follows security best practices:
 * - Least privilege principle (each account has only needed permissions)
 * - Blast radius reduction (compromise of one doesn't expose the other)
 * - Audit trail clarity (operations clearly attributed)
 *
 * Authentication:
 * - Uses service account JWT bearer assertion (Client Credentials flow)
 * - Caches access tokens with 1-minute safety margin
 *
 * Configuration (environment variables):
 * - ZITADEL_DOMAIN: Zitadel instance domain (e.g., zitadel.example.com)
 *
 * For introspection:
 * - ZITADEL_CLIENT_JWT or ZITADEL_CLIENT_JWT_PATH: Client service account key (JSON)
 *
 * For Management API:
 * - ZITADEL_API_JWT or ZITADEL_API_JWT_PATH: API service account key (JSON)
 *
 * Legacy (single service account):
 * - If API JWT vars not set, falls back to CLIENT JWT for both purposes
 * - This is NOT recommended for production
 *
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

  // CLIENT service account (for introspection)
  private clientServiceAccountKey?: ZitadelServiceAccountKey;
  private cachedClientToken?: CachedToken;

  // API service account (for Management API)
  private apiServiceAccountKey?: ZitadelServiceAccountKey;
  private cachedApiToken?: CachedToken;

  // Promise coalescing to prevent thundering herd
  private clientTokenPromise: Promise<string> | null = null;
  private apiTokenPromise: Promise<string> | null = null;
  private introspectionPromises = new Map<
    string,
    Promise<IntrospectionResult | null>
  >();

  // Circuit breaker for Zitadel 500 errors
  private lastFailureTime = 0;
  private readonly CIRCUIT_BREAKER_COOLDOWN = 30000; // 30 seconds

  private userinfoCache = new Map<
    string,
    {
      data: {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        given_name?: string;
        family_name?: string;
        preferred_username?: string;
      };
      expiresAt: number;
    }
  >();
  private readonly USERINFO_CACHE_TTL_MS = 60_000;
  private readonly USERINFO_CACHE_MAX_SIZE = 1000;

  constructor(private readonly cacheService: PostgresCacheService) {}

  onModuleInit(): void {
    const zitadelDomain = process.env.ZITADEL_DOMAIN;

    if (!zitadelDomain) {
      this.logger.warn(
        'Zitadel service not configured (ZITADEL_DOMAIN missing) - skipping initialization'
      );
      return;
    }

    try {
      // Load CLIENT service account (for introspection)
      this.loadClientServiceAccount();

      // Load API service account (for Management API)
      // Falls back to CLIENT account if not configured (legacy mode)
      this.loadApiServiceAccount();

      this.logger.log('Zitadel service initialized successfully');

      if (
        !this.apiServiceAccountKey ||
        this.apiServiceAccountKey === this.clientServiceAccountKey
      ) {
        this.logger.warn(
          '⚠️  Using single service account for both introspection AND Management API (not recommended for production)'
        );
        this.logger.warn(
          '💡 For better security, configure ZITADEL_API_JWT[_PATH] separately'
        );
      } else {
        this.logger.log(
          '✅ Dual service account mode active (CLIENT for introspection, API for Management)'
        );
      }
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
   * @returns true if domain and at least CLIENT service account key are available
   */
  isConfigured(): boolean {
    return !!(process.env.ZITADEL_DOMAIN && this.clientServiceAccountKey);
  }

  /**
   * Get Zitadel base URL with proper protocol
   *
   * Uses ZITADEL_ISSUER if available (includes protocol),
   * otherwise falls back to ZITADEL_DOMAIN with https://
   *
   * @returns Zitadel base URL (e.g., http://localhost:8200 or https://zitadel.example.com)
   * @private
   */
  private getBaseUrl(): string {
    return (
      process.env.ZITADEL_ISSUER || `https://${process.env.ZITADEL_DOMAIN}`
    );
  }

  /**
   * Get access token for Management API calls
   *
   * Uses API service account (or CLIENT account in legacy mode)
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
    const accountToUse =
      this.apiServiceAccountKey || this.clientServiceAccountKey;

    if (!accountToUse) {
      throw new Error('No Zitadel service account configured');
    }

    // Return cached token if still valid
    if (this.cachedApiToken && Date.now() < this.cachedApiToken.expiresAt) {
      this.logger.debug('Using cached API service account token');
      return this.cachedApiToken.token;
    }

    // Return existing promise if request in progress
    if (this.apiTokenPromise) {
      return this.apiTokenPromise;
    }

    this.logger.debug('Requesting new API service account token');

    // Create promise for the request
    this.apiTokenPromise = (async () => {
      try {
        const assertion = await this.createJwtAssertion(accountToUse);
        const token = await this.requestAccessToken(assertion);

        const expiresIn = Number(token.expires_in);

        // Cache token with 1 minute safety margin
        this.cachedApiToken = {
          token: token.access_token,
          expiresAt: Date.now() + (expiresIn - 60) * 1000,
        };

        this.logger.log(
          `API service account token acquired (expires in ${expiresIn}s)`
        );
        return token.access_token;
      } catch (err) {
        this.logger.error(
          `Failed to acquire API token: ${(err as Error).message}`,
          (err as Error).stack
        );
        throw err;
      } finally {
        // Clear promise when done
        this.apiTokenPromise = null;
      }
    })();

    return this.apiTokenPromise;
  }

  /**
   * Get access token for introspection
   *
   * Uses CLIENT service account specifically
   *
   * @returns Valid access token for introspection
   * @throws Error if CLIENT service account not configured
   * @private
   */
  private async getClientAccessToken(): Promise<string> {
    if (!this.clientServiceAccountKey) {
      throw new Error('CLIENT service account not configured');
    }

    // Check circuit breaker
    if (Date.now() - this.lastFailureTime < this.CIRCUIT_BREAKER_COOLDOWN) {
      throw new Error('Zitadel circuit breaker open');
    }

    // Return cached token if still valid
    if (
      this.cachedClientToken &&
      Date.now() < this.cachedClientToken.expiresAt
    ) {
      this.logger.debug('Using cached CLIENT service account token');
      return this.cachedClientToken.token;
    }

    if (this.cachedClientToken) {
      this.logger.debug(
        `Cached CLIENT token expired (expiresAt: ${
          this.cachedClientToken.expiresAt
        }, now: ${Date.now()})`
      );
    } else {
      this.logger.debug('No cached CLIENT token available');
    }

    // Return existing promise if request in progress
    if (this.clientTokenPromise) {
      const token = await this.clientTokenPromise;
      if (token) return token;
      // If null (failed previously), continue to retry
    }

    this.logger.debug('Requesting new CLIENT service account token');

    // Create promise for the request
    this.clientTokenPromise = (async () => {
      try {
        this.logger.debug('Starting CLIENT token acquisition...');
        const assertion = await this.createJwtAssertion(
          this.clientServiceAccountKey!
        );
        this.logger.debug('JWT assertion created, requesting token...');
        const token = await this.requestAccessToken(assertion);

        // Robust expiration parsing
        let expiresIn = 3600; // Default to 1 hour
        if (token.expires_in !== undefined && token.expires_in !== null) {
          const parsed = Number(token.expires_in);
          if (!isNaN(parsed) && parsed > 0) {
            expiresIn = parsed;
          }
        }

        // Redact access_token for logging
        const loggableToken = { ...token, access_token: 'REDACTED' };
        this.logger.debug(
          `Zitadel Token Response: ${JSON.stringify(
            loggableToken
          )} (expires_in used: ${expiresIn})`
        );

        this.logger.debug(
          `Zitadel Token Response: expires_in=${token.expires_in} (used: ${expiresIn})`
        );

        // Cache token with 1 minute safety margin
        this.cachedClientToken = {
          token: token.access_token,
          expiresAt: Date.now() + (expiresIn - 60) * 1000,
        };

        this.logger.log(
          `CLIENT service account token acquired (expires in ${expiresIn}s)`
        );
        return token.access_token;
      } catch (err) {
        this.logger.error(
          `Failed to acquire CLIENT token: ${(err as Error).message}`,
          (err as Error).stack
        );
        throw err; // MUST THROW so that result below catches it and doesn't see null
      } finally {
        // Clear promise when done
        this.logger.debug('Clearing clientTokenPromise');
        this.clientTokenPromise = null;
      }
    })();

    const result = await this.clientTokenPromise;
    if (!result) {
      throw new Error('Failed to acquire CLIENT token (promise returned null)');
    }
    return result;
  }

  /**
   * Introspect token with cache support
   *
   * Uses CLIENT service account for introspection (minimal permissions)
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
    if (!this.clientServiceAccountKey) {
      this.logger.warn(
        'Zitadel CLIENT account not configured, skipping introspection'
      );
      return null;
    }

    // Check circuit breaker
    if (Date.now() - this.lastFailureTime < this.CIRCUIT_BREAKER_COOLDOWN) {
      this.logger.verbose(
        'Circuit breaker open (recent 500 error), skipping introspection'
      );
      return null;
    }

    // Check cache first
    const cached = await this.cacheService.get(token);
    if (cached) {
      this.logger.debug('Introspection cache hit');
      return cached.data as IntrospectionResult;
    }

    // Check if request for this token is already in progress
    const existingPromise = this.introspectionPromises.get(token);
    if (existingPromise) {
      return existingPromise;
    }

    // Cache miss - call Zitadel
    this.logger.debug('Introspection cache miss, calling Zitadel');

    const promise = (async () => {
      try {
        const serviceToken = await this.getClientAccessToken();
        const apiUrl = `${this.getBaseUrl()}/oauth/v2/introspect`;

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

        const result = (await response.json()) as IntrospectionResult;

        this.logger.log(
          `Introspection result: active=${result.active}, exp=${
            result.exp
          } (type: ${typeof result.exp})`
        );

        let expiresAt: Date;

        if (result.active) {
          if (result.exp) {
            expiresAt = new Date(result.exp * 1000);
          } else {
            // Default to 5 minutes if exp missing
            // This prevents "cache miss storm" when Zitadel doesn't return exp
            this.logger.warn(
              'Introspection active but missing "exp", defaulting cache to 5m'
            );
            expiresAt = new Date(Date.now() + 5 * 60 * 1000);
          }

          // Verify date is valid and in future
          if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            this.logger.warn(
              `Introspection 'exp' resulted in invalid or past date: ${expiresAt.toISOString()} (exp claim: ${
                result.exp
              }). Defaulting to 5m.`
            );
            expiresAt = new Date(Date.now() + 5 * 60 * 1000);
          }
        } else {
          // Cache inactive tokens for 5 minutes to prevent repeated calls for the same invalid token
          expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        }

        await this.cacheService.set(token, result, expiresAt);
        this.logger.debug(
          `Introspection result cached (active: ${result.active})`
        );

        return result;
      } catch (error) {
        this.logger.error(`Introspection error: ${(error as Error).message}`);
        return null;
      } finally {
        // Remove promise from map when done
        this.introspectionPromises.delete(token);
      }
    })();

    this.introspectionPromises.set(token, promise);
    return promise;
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
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/human/_import`;

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
   * Get user info using the user's own access token
   *
   * Calls the standard OIDC userinfo endpoint to get user claims.
   * This bypasses the need for a service account token.
   *
   * @param accessToken - The user's access token (Bearer token)
   * @returns User info claims or null if request fails
   */
  async getUserInfoWithToken(accessToken: string): Promise<{
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    preferred_username?: string;
  } | null> {
    const cacheKey = this.hashToken(accessToken);
    const cached = this.userinfoCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug('Userinfo cache hit');
      return cached.data;
    }

    const userinfoUrl = `${this.getBaseUrl()}/oidc/v1/userinfo`;

    try {
      const response = await fetch(userinfoUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `Userinfo request failed (${response.status}): ${errorText}`
        );
        return null;
      }

      const userinfo = await response.json();
      this.logger.debug(
        `Got userinfo: email=${userinfo.email || '(none)'}, name=${
          userinfo.name || '(none)'
        }`
      );

      this.cacheUserinfo(cacheKey, userinfo);

      return userinfo;
    } catch (error) {
      this.logger.error(
        `Failed to fetch userinfo: ${(error as Error).message}`
      );
      return null;
    }
  }

  private hashToken(token: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256').update(token).digest('hex').substring(0, 32);
  }

  private cacheUserinfo(
    cacheKey: string,
    data: {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
      preferred_username?: string;
    }
  ): void {
    if (this.userinfoCache.size >= this.USERINFO_CACHE_MAX_SIZE) {
      const oldestKey = this.userinfoCache.keys().next().value;
      if (oldestKey) {
        this.userinfoCache.delete(oldestKey);
      }
    }

    this.userinfoCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.USERINFO_CACHE_TTL_MS,
    });
  }

  /**
   * Get user by Zitadel user ID
   *
   * Fetches full user information including email and profile data.
   * Used to get user email when the access token doesn't include it.
   *
   * @param userId - Zitadel user ID (numeric string)
   * @returns Zitadel user or null if not found/error
   */
  async getUserById(userId: string): Promise<ZitadelUser | null> {
    const token = await this.getAccessToken();
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/${userId}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-zitadel-orgid': process.env.ZITADEL_MAIN_ORG_ID || '',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.debug(`User not found by ID: ${userId}`);
          return null;
        }
        const errorText = await response.text();
        throw new Error(
          `Failed to get user (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      const user = data.user;

      if (!user) {
        this.logger.debug(`User response empty for ID: ${userId}`);
        return null;
      }

      // Map Zitadel response to ZitadelUser interface
      const result: ZitadelUser = {
        id: user.id || userId,
        state: user.state || 'UNKNOWN',
        userName: user.userName || user.preferredLoginName || '',
        preferredLoginName: user.preferredLoginName,
        email: user.human?.email?.email,
        emailVerified: user.human?.email?.isEmailVerified,
        phone: user.human?.phone
          ? {
              phone: user.human.phone.phone,
              isPhoneVerified: user.human.phone.isPhoneVerified,
            }
          : undefined,
        profile: user.human?.profile
          ? {
              firstName: user.human.profile.firstName,
              lastName: user.human.profile.lastName,
              displayName: user.human.profile.displayName,
            }
          : undefined,
      };

      this.logger.debug(
        `Got user by ID: ${userId} -> ${result.email || '(no email)'}`
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get user by ID ${userId}: ${(error as Error).message}`
      );
      return null;
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
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/_search`;

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

    try {
      // Metadata must be set one key at a time
      // Zitadel API: POST /management/v1/users/{userId}/metadata/{key}
      for (const [key, value] of Object.entries(metadata)) {
        const apiUrl = `${this.getBaseUrl()}/management/v1/users/${userId}/metadata/${key}`;
        const payload = {
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
        `Updated metadata for user ${userId}: ${Object.keys(metadata).join(
          ', '
        )}`
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
    // Zitadel API: POST /management/v1/users/{userId}/password/_reset
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/${userId}/password/_reset`;

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
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/${userId}/grants`;

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
   * Deactivate a user in Zitadel
   *
   * Sets user state to INACTIVE, preventing login.
   * Used when soft-deleting user accounts.
   *
   * @param userId - Zitadel user ID
   * @throws Error on API failure
   */
  async deactivateUser(userId: string): Promise<void> {
    const token = await this.getAccessToken();
    const orgId = process.env.ZITADEL_MAIN_ORG_ID;
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/${userId}/_deactivate`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-zitadel-orgid': orgId || '',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to deactivate user (${response.status}): ${errorText}`
        );
      }

      this.logger.log(`Deactivated Zitadel user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to deactivate user ${userId}: ${(error as Error).message}`
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
    const apiUrl = `${this.getBaseUrl()}/management/v1/users/${userId}/grants/_search`;

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
   * Load CLIENT service account (for introspection)
   *
   * Supports two configuration methods:
   * 1. ZITADEL_CLIENT_JWT: JSON string directly in env var
   * 2. ZITADEL_CLIENT_JWT_PATH: Path to JSON file
   *
   * @throws Error if neither env var set or key invalid
   * @private
   */
  private loadClientServiceAccount(): void {
    const clientJwt = process.env.ZITADEL_CLIENT_JWT;
    const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;

    this.clientServiceAccountKey = this.parseServiceAccountKey(
      clientJwt,
      clientJwtPath,
      'CLIENT'
    );

    this.logger.log(
      `✅ CLIENT service account loaded (keyId: ${this.clientServiceAccountKey.keyId}) - for introspection`
    );
  }

  /**
   * Load API service account (for Management API)
   *
   * Supports two configuration methods:
   * 1. ZITADEL_API_JWT: JSON string directly in env var
   * 2. ZITADEL_API_JWT_PATH: Path to JSON file
   *
   * Falls back to CLIENT account if not configured (legacy mode)
   *
   * @private
   */
  private loadApiServiceAccount(): void {
    const apiJwt = process.env.ZITADEL_API_JWT;
    const apiJwtPath = process.env.ZITADEL_API_JWT_PATH;

    // If no API-specific env vars, fall back to CLIENT account (legacy)
    if (!apiJwt && !apiJwtPath) {
      this.logger.debug(
        'ZITADEL_API_JWT[_PATH] not set, using CLIENT account for Management API (legacy mode)'
      );
      this.apiServiceAccountKey = this.clientServiceAccountKey;
      return;
    }

    this.apiServiceAccountKey = this.parseServiceAccountKey(
      apiJwt,
      apiJwtPath,
      'API'
    );

    this.logger.log(
      `✅ API service account loaded (keyId: ${this.apiServiceAccountKey.keyId}) - for Management API`
    );
  }

  /**
   * Parse service account key from environment variable or file
   *
   * Handles various JSON escaping formats from different platforms (Coolify, etc.)
   *
   * @param inlineJwt - Inline JSON string
   * @param jwtPath - Path to JSON file
   * @param accountType - Type of account (for logging)
   * @returns Parsed service account key
   * @throws Error if neither parameter set or key invalid
   * @private
   */
  private parseServiceAccountKey(
    inlineJwt: string | undefined,
    jwtPath: string | undefined,
    accountType: 'CLIENT' | 'API'
  ): ZitadelServiceAccountKey {
    let keyJson: string;

    if (inlineJwt) {
      this.logger.debug(
        `Loading ${accountType} service account from inline env var`
      );
      keyJson = inlineJwt;
    } else if (jwtPath) {
      this.logger.debug(
        `Loading ${accountType} service account from file: ${jwtPath}`
      );
      try {
        keyJson = readFileSync(jwtPath, 'utf-8');
        this.logger.debug(
          `Raw file content keyId: ${JSON.parse(keyJson).keyId}`
        );
      } catch (error) {
        throw new Error(
          `Failed to read ${accountType} service account key from ${jwtPath}: ${
            (error as Error).message
          }`
        );
      }
    } else {
      throw new Error(
        `Either ZITADEL_${accountType}_JWT or ZITADEL_${accountType}_JWT_PATH must be set`
      );
    }

    let serviceAccountKey: ZitadelServiceAccountKey;

    // Handle different JSON escaping formats from environment variables
    // Some platforms (like Coolify) may double-escape quotes and newlines
    try {
      // First attempt: Parse as-is
      serviceAccountKey = JSON.parse(keyJson);
    } catch (firstError) {
      this.logger.debug(
        `First parse attempt failed, trying to unescape: ${
          (firstError as Error).message
        }`
      );

      try {
        // Second attempt: Unescape double-escaped strings
        // Replace \\n with \n and \" with "
        const unescaped = keyJson
          .replace(/\\\\n/g, '\\n') // Fix double-escaped newlines
          .replace(/\\"/g, '"'); // Fix escaped quotes

        serviceAccountKey = JSON.parse(unescaped);
        this.logger.debug('Successfully parsed after unescaping');
      } catch (secondError) {
        throw new Error(
          `Failed to parse ${accountType} Zitadel key after trying multiple formats: ${
            (secondError as Error).message
          }`
        );
      }
    }

    // After parsing, fix any literal \n sequences in the RSA key
    // (Coolify double-escapes newlines, so after JSON.parse they become literal \n)
    if (serviceAccountKey?.key) {
      const originalKey = serviceAccountKey.key;

      // Replace literal \n, \r, \t with actual escape sequences
      serviceAccountKey.key = originalKey
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');

      if (originalKey !== serviceAccountKey.key) {
        this.logger.debug(
          `Fixed escape sequences in ${accountType} RSA private key`
        );
      }
    }

    // Validate the key
    try {
      if (!serviceAccountKey?.keyId || !serviceAccountKey?.key) {
        throw new Error('Invalid key format: missing keyId or key');
      }

      if (
        !serviceAccountKey.userId &&
        !serviceAccountKey.appId &&
        !serviceAccountKey.clientId
      ) {
        throw new Error(
          'Invalid key format: missing userId, appId, or clientId'
        );
      }

      this.logger.debug(
        `${accountType} service account key parsed and validated (keyId: ${serviceAccountKey.keyId})`
      );

      return serviceAccountKey;
    } catch (error) {
      throw new Error(
        `Failed to validate ${accountType} Zitadel key: ${
          (error as Error).message
        }`
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
   * @param serviceAccountKey - Service account key to use for signing
   * @returns Signed JWT assertion
   * @private
   */
  private async createJwtAssertion(
    serviceAccountKey: ZitadelServiceAccountKey
  ): Promise<string> {
    // Dynamically import jose library
    const jose = await import('jose');

    let privateKey: any;
    let keyToImport = serviceAccountKey.key;

    // Check if this is PKCS#1 format (BEGIN RSA PRIVATE KEY)
    // If so, convert to PKCS#8 format using Node.js crypto module
    if (keyToImport.includes('BEGIN RSA PRIVATE KEY')) {
      this.logger.debug('Detected PKCS#1 format key, converting to PKCS#8...');
      try {
        const crypto = await import('crypto');
        // Import PKCS#1 key
        const keyObject = crypto.createPrivateKey({
          key: keyToImport,
          format: 'pem',
          type: 'pkcs1',
        });
        // Export as PKCS#8
        keyToImport = keyObject.export({
          type: 'pkcs8',
          format: 'pem',
        }) as string;

        // Update the key in the source object to prevent re-conversion on next call
        serviceAccountKey.key = keyToImport;

        this.logger.debug(
          'Successfully converted PKCS#1 to PKCS#8 and updated cached key'
        );
      } catch (conversionError) {
        this.logger.error(
          'Failed to convert PKCS#1 to PKCS#8:',
          conversionError
        );
        throw new Error(
          `Key format conversion failed: ${(conversionError as Error).message}`
        );
      }
    }

    try {
      // Import PKCS#8 key (either original or converted)
      privateKey = await jose.importPKCS8(keyToImport, 'RS256');
      this.logger.debug('Successfully imported private key');
    } catch (importError) {
      this.logger.error('Failed to import private key:', importError);
      throw new Error(
        `Failed to import private key: ${(importError as Error).message}`
      );
    }

    const now = Math.floor(Date.now() / 1000);
    // Use clientId for both issuer and subject (matches Zitadel SDK implementation)
    // Fall back to userId for service accounts (which don't have clientId)
    const issuer = serviceAccountKey.clientId || serviceAccountKey.userId!;
    const subject = serviceAccountKey.clientId || serviceAccountKey.userId!;
    const audience = this.getBaseUrl();

    this.logger.debug(
      `Creating JWT assertion with: issuer=${issuer}, subject=${subject}, audience=${audience}, kid=${serviceAccountKey.keyId}`
    );

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({
        alg: 'RS256',
        kid: serviceAccountKey.keyId,
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
    const tokenUrl = `${this.getBaseUrl()}/oauth/v2/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
        scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // If 500 error, trip circuit breaker
      if (response.status >= 500) {
        this.lastFailureTime = Date.now();
        this.logger.warn(
          `Zitadel returned ${response.status}, tripping circuit breaker for ${
            this.CIRCUIT_BREAKER_COOLDOWN / 1000
          }s`
        );
      }

      throw new Error(
        `Token request failed (${response.status}): ${errorText}`
      );
    }

    return response.json();
  }
}
