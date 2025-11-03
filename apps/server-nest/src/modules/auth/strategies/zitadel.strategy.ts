import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ZitadelIntrospectionStrategy } from 'passport-zitadel';

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
 * Configuration is loaded from ZITADEL_CLIENT_JWT environment variable.
 */
@Injectable()
export class ZitadelStrategy extends PassportStrategy(
    ZitadelIntrospectionStrategy,
    'zitadel',
) {
    private readonly logger = new Logger(ZitadelStrategy.name);

    constructor() {
        // Parse service account key from environment
        const serviceAccountKey = JSON.parse(process.env.ZITADEL_CLIENT_JWT || '{}');
        const authority = process.env.ZITADEL_DOMAIN;

        if (!authority) {
            throw new Error('ZITADEL_DOMAIN environment variable is required');
        }

        if (!serviceAccountKey.keyId || !serviceAccountKey.key || !serviceAccountKey.clientId) {
            throw new Error('ZITADEL_CLIENT_JWT must contain keyId, key, and clientId');
        }

        super({
            authority: `https://${authority}`,
            authorization: {
                type: 'jwt-profile',
                profile: {
                    type: 'application',
                    keyId: serviceAccountKey.keyId,
                    key: serviceAccountKey.key,
                    appId: serviceAccountKey.appId,
                    clientId: serviceAccountKey.clientId,
                },
            },
        });

        this.logger.log(`Zitadel strategy initialized for authority: https://${authority}`);
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
        this.logger.debug(`Token validated for user: ${payload.sub || payload.username || 'unknown'}`);
        
        // Log available claims for debugging
        if (process.env.NODE_ENV !== 'production') {
            this.logger.debug(`Available claims: ${Object.keys(payload).join(', ')}`);
        }

        // Return the full payload - passport will attach it to request.user
        return payload;
    }
}
