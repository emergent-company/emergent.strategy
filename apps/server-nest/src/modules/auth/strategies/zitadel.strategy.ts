import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ZitadelIntrospectionStrategy } from 'passport-zitadel';
import * as fs from 'fs';

/**
 * Zitadel Passport Strategy
 *
 * Uses official passport-zitadel package for token introspection.
 * This strategy validates Bearer tokens by:
 * 1. Extracting token from Authorization header
 * 2. Using service account (JWT profile) to authenticate with Zitadel
 * 3. Calling introspection endpoint to validate token and get user info
 * 4. Returning validated user payload
 *
 * Configuration is loaded from ZITADEL_CLIENT_JWT or ZITADEL_CLIENT_JWT_PATH.
 */
@Injectable()
export class ZitadelStrategy extends PassportStrategy(
  ZitadelIntrospectionStrategy,
  'zitadel'
) {
  private readonly logger = new Logger(ZitadelStrategy.name);

  constructor() {
    // Load service account key from environment or file
    let serviceAccountKey: any;

    const clientJwt = process.env.ZITADEL_CLIENT_JWT;
    const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;

    if (clientJwt) {
      try {
        serviceAccountKey = JSON.parse(clientJwt);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse ZITADEL_CLIENT_JWT: ${errMsg}`);
      }
    } else if (clientJwtPath) {
      try {
        const fileContent = fs.readFileSync(clientJwtPath, 'utf8');
        serviceAccountKey = JSON.parse(fileContent);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to read/parse ZITADEL_CLIENT_JWT_PATH: ${errMsg}`
        );
      }
    } else {
      throw new Error(
        'Either ZITADEL_CLIENT_JWT or ZITADEL_CLIENT_JWT_PATH must be set'
      );
    }

    const authority = process.env.ZITADEL_DOMAIN;

    if (!authority) {
      throw new Error('ZITADEL_DOMAIN environment variable is required');
    }

    // Service accounts have userId, OAuth apps have clientId
    const clientId = serviceAccountKey.clientId || serviceAccountKey.userId;

    if (!serviceAccountKey.keyId || !serviceAccountKey.key || !clientId) {
      throw new Error(
        'Service account key must contain keyId, key, and clientId (or userId)'
      );
    }

    super({
      authority: `https://${authority}`,
      authorization: {
        type: 'jwt-profile',
        profile: {
          type: 'application' as const,
          keyId: serviceAccountKey.keyId,
          key: serviceAccountKey.key,
          appId: serviceAccountKey.appId,
          clientId: clientId,
        },
      },
    });

    this.logger.log(
      `Zitadel strategy initialized for authority: https://${authority}`
    );
    this.logger.log(`Service account keyId: ${serviceAccountKey.keyId}`);
  }

  /**
   * Validate method required by PassportStrategy
   *
   * The passport-zitadel package already validates the token and extracts user info.
   * This method receives the validated payload and can perform additional checks
   * or transformations if needed.
   *
   * @param payload - User information from Zitadel introspection response
   * @returns User payload to be attached to request
   */
  async validate(payload: any): Promise<any> {
    this.logger.debug(
      `Token validated for user: ${
        payload.sub || payload.username || 'unknown'
      }`
    );

    // Log available claims for debugging
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`Available claims: ${Object.keys(payload).join(', ')}`);
    }

    // Return the full payload - passport will attach it to request.user
    return payload;
  }
}
