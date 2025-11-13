/**
 * Configuration for dual Zitadel service accounts
 *
 * CLIENT JWT - Used for token introspection (verifying frontend user tokens)
 * API JWT - Used for Management API operations (creating/managing users)
 */
export interface ZitadelDualServiceAccountConfig {
  /**
   * Inline JSON for client service account (introspection)
   * Takes precedence over clientJwtPath if both are set
   */
  clientJwt?: string;

  /**
   * Path to client service account JSON file (introspection)
   * Used if clientJwt is not set
   */
  clientJwtPath?: string;

  /**
   * Inline JSON for API service account (Management API)
   * Takes precedence over apiJwtPath if both are set
   */
  apiJwt?: string;

  /**
   * Path to API service account JSON file (Management API)
   * Used if apiJwt is not set
   */
  apiJwtPath?: string;

  /**
   * Zitadel domain (e.g., auth.yourdomain.com)
   */
  domain: string;

  /**
   * Organization ID
   */
  orgId?: string;

  /**
   * Project ID
   */
  projectId?: string;
}

/**
 * Structure of Zitadel service account JSON key file
 */
export interface ZitadelServiceAccountKey {
  type: string;
  keyId: string;
  key: string;
  userId?: string;
  appId?: string;
  clientId?: string;
}
