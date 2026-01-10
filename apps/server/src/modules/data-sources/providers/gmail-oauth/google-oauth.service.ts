import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../../common/config/config.service';

/**
 * Google OAuth token response
 */
export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Google user info response
 */
export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  picture?: string;
}

/**
 * OAuth state payload for secure state parameter
 */
export interface OAuthStatePayload {
  integrationId?: string;
  projectId: string;
  userId: string;
  provider: string;
  returnUrl?: string;
  timestamp: number;
}

/**
 * Stored OAuth tokens with metadata
 */
export interface StoredOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  scope: string;
}

/**
 * Google OAuth Service
 *
 * Reusable service for Google OAuth 2.0 authentication.
 * Supports multiple Google APIs (Gmail, Drive, etc.) through configurable scopes.
 *
 * Required environment variables:
 * - GOOGLE_OAUTH_CLIENT_ID: OAuth 2.0 client ID from Google Cloud Console
 * - GOOGLE_OAUTH_CLIENT_SECRET: OAuth 2.0 client secret
 * - API_BASE_URL: Base URL for OAuth callback (e.g., http://localhost:3002)
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  // Google OAuth endpoints
  private readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly USERINFO_URL =
    'https://www.googleapis.com/oauth2/v2/userinfo';

  // Scope presets for different providers
  static readonly SCOPES = {
    gmail: [
      'https://mail.google.com/', // Full Gmail access (required for IMAP)
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    drive: [
      'https://www.googleapis.com/auth/drive.readonly', // Read-only Drive access
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    // Combined scopes for both
    all: [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  };

  constructor(private readonly config: AppConfigService) {}

  /**
   * Get Google OAuth client ID from config
   */
  private getClientId(): string {
    const clientId = this.config.googleOAuthClientId;
    if (!clientId) {
      throw new Error(
        'GOOGLE_OAUTH_CLIENT_ID is not configured. Please set up Google OAuth credentials.'
      );
    }
    return clientId;
  }

  /**
   * Get Google OAuth client secret from config
   */
  private getClientSecret(): string {
    const clientSecret = this.config.googleOAuthClientSecret;
    if (!clientSecret) {
      throw new Error(
        'GOOGLE_OAUTH_CLIENT_SECRET is not configured. Please set up Google OAuth credentials.'
      );
    }
    return clientSecret;
  }

  /**
   * Get the OAuth redirect URI
   */
  getRedirectUri(): string {
    return `${this.config.apiBaseUrl}/data-source-integrations/oauth/google/callback`;
  }

  /**
   * Check if Google OAuth is configured
   */
  isConfigured(): boolean {
    return this.config.googleOAuthEnabled;
  }

  /**
   * Encode state payload as base64 JSON
   */
  encodeState(payload: OAuthStatePayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  /**
   * Decode state payload from base64 JSON
   */
  decodeState(state: string): OAuthStatePayload {
    try {
      return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch {
      throw new Error('Invalid OAuth state parameter');
    }
  }

  /**
   * Generate the OAuth authorization URL
   *
   * @param state - State payload to pass through OAuth flow
   * @param provider - Provider type for scope selection ('gmail' | 'drive' | 'all')
   * @returns Authorization URL to redirect user to
   */
  getAuthorizationUrl(
    state: OAuthStatePayload,
    provider: 'gmail' | 'drive' | 'all' = 'gmail'
  ): string {
    const scopes = GoogleOAuthService.SCOPES[provider];
    const encodedState = this.encodeState(state);

    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: this.getRedirectUri(),
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline', // Required to get refresh token
      prompt: 'consent', // Force consent to always get refresh token
      state: encodedState,
    });

    return `${this.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   *
   * @param code - Authorization code from OAuth callback
   * @returns Token response with access and refresh tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    this.logger.debug('Exchanging authorization code for tokens');

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        redirect_uri: this.getRedirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Token exchange failed: ${error}`);
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokens: GoogleTokenResponse = await response.json();
    this.logger.debug('Successfully obtained tokens');

    return tokens;
  }

  /**
   * Refresh an access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns New token response (may not include new refresh token)
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    this.logger.debug('Refreshing access token');

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Token refresh failed: ${error}`);
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    const tokens: GoogleTokenResponse = await response.json();
    this.logger.debug('Successfully refreshed access token');

    return tokens;
  }

  /**
   * Get user info from Google
   *
   * @param accessToken - Valid access token
   * @returns User info including email
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(this.USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    return response.json();
  }

  /**
   * Validate and potentially refresh tokens
   *
   * @param config - Current OAuth config with tokens
   * @returns Updated config if tokens were refreshed, null if no refresh needed
   */
  async ensureValidToken(config: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  }): Promise<{ accessToken: string; expiresAt: number } | null> {
    // Check if token is still valid (with 5 minute buffer)
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (config.expiresAt && config.expiresAt - bufferMs > now) {
      // Token is still valid
      return null;
    }

    // Token expired or about to expire, refresh it
    this.logger.debug('Access token expired, refreshing...');
    const newTokens = await this.refreshAccessToken(config.refreshToken);

    return {
      accessToken: newTokens.access_token,
      expiresAt: now + newTokens.expires_in * 1000,
    };
  }

  /**
   * Complete OAuth flow: exchange code for tokens and get user info
   *
   * @param code - Authorization code from callback
   * @returns Stored tokens with user email
   */
  async completeOAuthFlow(code: string): Promise<StoredOAuthTokens> {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh token received. User may need to revoke app access and retry.'
      );
    }

    // Get user info
    const userInfo = await this.getUserInfo(tokens.access_token);

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email: userInfo.email,
      scope: tokens.scope,
    };
  }
}
