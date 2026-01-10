import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  IsEnum,
} from 'class-validator';

/**
 * IMAP security modes
 */
export enum ImapSecurity {
  TLS = 'tls',
  STARTTLS = 'starttls',
  NONE = 'none',
}

/**
 * IMAP authentication methods
 */
export enum ImapAuthMethod {
  PLAIN = 'plain',
  LOGIN = 'login',
  OAUTH2 = 'oauth2',
}

/**
 * IMAP Configuration DTO
 *
 * Used for configuring IMAP server connections.
 * This data is encrypted before storage.
 */
export class ImapConfigDto {
  /**
   * IMAP server hostname
   * @example 'imap.gmail.com'
   */
  @IsString()
  host: string;

  /**
   * IMAP server port
   * Common values: 993 (TLS), 143 (STARTTLS/None)
   * @example 993
   */
  @IsNumber()
  @Min(1)
  @Max(65535)
  port: number;

  /**
   * Connection security mode
   * @example 'tls'
   */
  @IsEnum(ImapSecurity)
  security: ImapSecurity;

  /**
   * Authentication method
   * @example 'plain'
   */
  @IsEnum(ImapAuthMethod)
  @IsOptional()
  authMethod?: ImapAuthMethod;

  /**
   * IMAP username (usually email address)
   * @example 'user@example.com'
   */
  @IsString()
  username: string;

  /**
   * IMAP password or app-specific password
   * For Gmail, this should be an App Password, not the account password
   */
  @IsString()
  password: string;

  /**
   * OAuth2 access token (for oauth2 auth method)
   */
  @IsString()
  @IsOptional()
  accessToken?: string;

  /**
   * OAuth2 refresh token (for oauth2 auth method)
   */
  @IsString()
  @IsOptional()
  refreshToken?: string;

  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  @IsNumber()
  @IsOptional()
  @Min(5000)
  @Max(120000)
  connectionTimeout?: number;

  /**
   * Whether to verify TLS certificate
   * Set to false for self-signed certificates (not recommended)
   * @default true
   */
  @IsBoolean()
  @IsOptional()
  tlsVerify?: boolean;
}

/**
 * JSON Schema for IMAP configuration
 * Used for generating configuration forms in the UI
 */
export const IMAP_CONFIG_SCHEMA = {
  type: 'object',
  required: ['host', 'port', 'security', 'username', 'password'],
  properties: {
    host: {
      type: 'string',
      title: 'IMAP Server',
      description: 'Hostname of the IMAP server (e.g., imap.gmail.com)',
      minLength: 1,
    },
    port: {
      type: 'integer',
      title: 'Port',
      description: 'Server port (typically 993 for TLS, 143 for STARTTLS)',
      default: 993,
      minimum: 1,
      maximum: 65535,
    },
    security: {
      type: 'string',
      title: 'Security',
      description: 'Connection security mode',
      enum: ['tls', 'starttls', 'none'],
      enumNames: ['TLS/SSL (Recommended)', 'STARTTLS', 'None (Not Secure)'],
      default: 'tls',
    },
    authMethod: {
      type: 'string',
      title: 'Authentication Method',
      description: 'How to authenticate with the server',
      enum: ['plain', 'login', 'oauth2'],
      enumNames: ['Plain', 'Login', 'OAuth 2.0'],
      default: 'plain',
    },
    username: {
      type: 'string',
      title: 'Username',
      description: 'Email address or username for authentication',
      minLength: 1,
    },
    password: {
      type: 'string',
      title: 'Password',
      description:
        'Password or App Password (for Gmail, use an App Password from Google Account settings)',
      minLength: 1,
      'ui:widget': 'password',
    },
    connectionTimeout: {
      type: 'integer',
      title: 'Connection Timeout',
      description: 'Timeout in milliseconds for connecting to the server',
      default: 30000,
      minimum: 5000,
      maximum: 120000,
    },
    tlsVerify: {
      type: 'boolean',
      title: 'Verify TLS Certificate',
      description:
        'Whether to verify the server TLS certificate (disable only for self-signed certs)',
      default: true,
    },
  },
  // UI hints
  'ui:order': [
    'host',
    'port',
    'security',
    'authMethod',
    'username',
    'password',
    'connectionTimeout',
    'tlsVerify',
  ],
};

/**
 * Common IMAP server presets
 */
export const IMAP_SERVER_PRESETS = {
  gmail: {
    host: 'imap.gmail.com',
    port: 993,
    security: ImapSecurity.TLS,
  },
  outlook: {
    host: 'outlook.office365.com',
    port: 993,
    security: ImapSecurity.TLS,
  },
  yahoo: {
    host: 'imap.mail.yahoo.com',
    port: 993,
    security: ImapSecurity.TLS,
  },
  icloud: {
    host: 'imap.mail.me.com',
    port: 993,
    security: ImapSecurity.TLS,
  },
  aol: {
    host: 'imap.aol.com',
    port: 993,
    security: ImapSecurity.TLS,
  },
};
