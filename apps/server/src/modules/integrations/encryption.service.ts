import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { DatabaseService } from '../../common/database/database.service';
import { IntegrationSettings } from './dto/integration.dto';

/**
 * Encryption Service for Integration Settings
 *
 * **STRATEGIC RAW SQL** - Uses PostgreSQL pgcrypto extension
 * TypeORM migration NOT recommended - requires pgp_sym_encrypt/decrypt functions
 *
 * Uses PostgreSQL pgcrypto extension for AES-256 encryption
 * Encryption key is stored in environment variable: INTEGRATION_ENCRYPTION_KEY
 *
 * Security considerations:
 * - Key should be 32 bytes (256-bit AES)
 * - Key should be rotated periodically
 * - Production: use secrets manager (AWS Secrets Manager, etc.)
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private encryptionKey: string = '';

  constructor(
    private readonly config: AppConfigService,
    private readonly db: DatabaseService
  ) {}

  onModuleInit() {
    this.encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY || '';

    // Validate encryption key
    const isProduction = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';

    if (!this.encryptionKey) {
      if (isProduction) {
        throw new Error(
          'INTEGRATION_ENCRYPTION_KEY is required in production. ' +
            'Set a 32-character key for AES-256 encryption. ' +
            'Generate with: openssl rand -base64 24'
        );
      } else if (!isTest) {
        this.logger.error(
          '⚠️  CRITICAL: INTEGRATION_ENCRYPTION_KEY not set! ' +
            'Integration credentials will NOT be encrypted. ' +
            'Generate a key: openssl rand -base64 24'
        );
      }
    } else if (this.encryptionKey.length < 32) {
      const warning =
        `INTEGRATION_ENCRYPTION_KEY is only ${this.encryptionKey.length} characters. ` +
        'For AES-256, use at least 32 characters. ' +
        'Generate a new key: openssl rand -base64 24';

      if (isProduction) {
        throw new Error(warning);
      } else {
        this.logger.warn(warning);
      }
    }
  }

  /**
   * Encrypt integration settings using PostgreSQL pgcrypto
   *
   * @param settings - Plain text settings object
   * @returns Base64-encoded encrypted data or plain JSON string if no key
   */
  async encrypt(settings: IntegrationSettings): Promise<string> {
    if (!this.encryptionKey) {
      this.logger.warn(
        'Encryption key not set. Storing settings as plain JSON (INSECURE).'
      );
      return JSON.stringify(settings);
    }

    const settingsJson = JSON.stringify(settings);

    // Use digest() to hash the key to ensure it's the right length for AES
    const result = await this.db.query<{ encrypted: string }>(
      `SELECT encode(
                pgp_sym_encrypt($1::text, $2::text),
                'base64'
            ) as encrypted`,
      [settingsJson, this.encryptionKey]
    );

    return result.rows[0].encrypted;
  }

  /**
   * Decrypt integration settings using PostgreSQL pgcrypto
   *
   * @param encryptedData - Base64-encoded encrypted data or Buffer from BYTEA column
   * @returns Decrypted settings object
   */
  async decrypt(encryptedData: string | Buffer): Promise<IntegrationSettings> {
    if (!this.encryptionKey) {
      // If no encryption key, settings are stored as plain JSON in BYTEA
      // PostgreSQL returns BYTEA as base64 string by default, so we need to decode it first
      try {
        let plainText: string;
        if (Buffer.isBuffer(encryptedData)) {
          // Already a Buffer, just convert to UTF-8 string
          plainText = encryptedData.toString('utf-8');
        } else {
          // String from PostgreSQL - it's base64-encoded BYTEA, decode to get UTF-8 JSON
          plainText = Buffer.from(encryptedData, 'base64').toString('utf-8');
        }
        return JSON.parse(plainText);
      } catch (error) {
        this.logger.error('Failed to parse unencrypted settings');
        this.logger.error(error);
        return {};
      }
    }

    // With encryption key: decrypt the base64-encoded encrypted data
    const base64Data = Buffer.isBuffer(encryptedData)
      ? encryptedData.toString('base64')
      : encryptedData;

    try {
      // Try new pgp_sym_decrypt method first
      const result = await this.db.query<{ decrypted: string }>(
        `SELECT pgp_sym_decrypt(decode($1, 'base64'), $2::text) as decrypted`,
        [base64Data, this.encryptionKey]
      );

      const decryptedJson = result.rows[0].decrypted;
      return JSON.parse(decryptedJson);
    } catch (error) {
      // If pgp_sym_decrypt fails, try legacy decrypt method for backwards compatibility
      this.logger.warn('pgp_sym_decrypt failed, trying legacy decrypt method');
      try {
        const result = await this.db.query<{ decrypted: string }>(
          `SELECT convert_from(
                        decrypt(decode($1, 'base64'), digest($2, 'sha256'), 'aes-cbc'),
                        'utf-8'
                    ) as decrypted`,
          [base64Data, this.encryptionKey]
        );

        const decryptedJson = result.rows[0].decrypted;
        this.logger.log('Successfully decrypted using legacy method');
        return JSON.parse(decryptedJson);
      } catch (legacyError) {
        this.logger.error(
          'Failed to decrypt integration settings with both methods'
        );
        this.logger.error(error);
        throw new Error(
          'Failed to decrypt integration settings. The encryption key may be incorrect.'
        );
      }
    }
  }

  /**
   * Check if encryption is properly configured
   */
  isConfigured(): boolean {
    return !!this.encryptionKey && this.encryptionKey.length >= 32;
  }
}
