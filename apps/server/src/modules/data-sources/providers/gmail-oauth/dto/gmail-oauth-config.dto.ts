import { IsString, IsOptional, IsNumber } from 'class-validator';

/**
 * Gmail OAuth Configuration DTO
 *
 * Stores OAuth tokens and user info for Gmail IMAP access.
 * This data is encrypted before storage.
 */
export class GmailOAuthConfigDto {
  /**
   * Gmail email address
   * @example 'user@gmail.com'
   */
  @IsString()
  email: string;

  /**
   * OAuth2 access token
   */
  @IsString()
  accessToken: string;

  /**
   * OAuth2 refresh token
   */
  @IsString()
  refreshToken: string;

  /**
   * Access token expiration timestamp (milliseconds since epoch)
   */
  @IsNumber()
  @IsOptional()
  expiresAt?: number;

  /**
   * OAuth2 scope granted
   */
  @IsString()
  @IsOptional()
  scope?: string;
}

/**
 * JSON Schema for Gmail OAuth configuration
 * Note: This schema is minimal since OAuth flow handles authentication
 */
export const GMAIL_OAUTH_CONFIG_SCHEMA = {
  type: 'object',
  required: [],
  properties: {
    email: {
      type: 'string',
      title: 'Gmail Address',
      description: 'Your Gmail email address (set automatically after OAuth)',
      readOnly: true,
    },
  },
  // UI hints - OAuth flow will populate these
  'ui:authType': 'oauth',
  'ui:authProvider': 'google',
};

/**
 * Gmail IMAP server settings (fixed for Gmail)
 */
export const GMAIL_IMAP_CONFIG = {
  host: 'imap.gmail.com',
  port: 993,
  security: 'tls' as const,
};
