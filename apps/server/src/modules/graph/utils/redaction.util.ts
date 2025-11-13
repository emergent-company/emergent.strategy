/**
 * Sensitive Data Redaction Utilities (Phase 3 - Task 8a)
 *
 * Provides utilities for automatically redacting sensitive fields in graph objects
 * and relationships based on field naming patterns and explicit sensitivity flags.
 *
 * Redaction ensures that sensitive data is never exposed to users without proper
 * permissions, supporting compliance with data protection regulations (GDPR, HIPAA, etc.).
 */

/**
 * Redaction marker value used to replace sensitive field values.
 * This is a non-reversible placeholder indicating data was redacted.
 */
export const REDACTED = '[REDACTED]';

/**
 * Sensitivity metadata for a field.
 * Can be attached to object properties to explicitly mark sensitivity.
 */
export interface SensitivityMetadata {
  /** Whether this field contains sensitive data */
  is_sensitive?: boolean;
  /** Required permission/scope to view this field */
  required_scope?: string;
  /** Reason for sensitivity (for audit trail) */
  sensitivity_reason?: string;
  /** Classification level (e.g., 'pii', 'phi', 'confidential') */
  classification?: string;
}

/**
 * Configuration for redaction behavior.
 */
export interface RedactionConfig {
  /** User's effective scopes/permissions */
  userScopes: Set<string>;
  /** Whether to enable pattern-based redaction (default: true) */
  enablePatternRedaction?: boolean;
  /** Whether to enable explicit metadata-based redaction (default: true) */
  enableMetadataRedaction?: boolean;
  /** Additional custom sensitive field patterns (regex) */
  customPatterns?: RegExp[];
  /** Whether to log redaction events (default: true) */
  logRedactions?: boolean;
}

/**
 * Result of a redaction operation.
 */
export interface RedactionResult<T> {
  /** The redacted data object */
  data: T;
  /** Fields that were redacted (dot-notation paths) */
  redactedFields: string[];
  /** Total number of fields redacted */
  redactionCount: number;
}

/**
 * Standard sensitive field patterns (case-insensitive).
 * These patterns match common sensitive field names.
 */
const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  // Personal Identifiable Information (PII)
  /^(ssn|social_security|social_security_number)$/i,
  /^(tax_id|taxpayer_id|ein)$/i,
  /^(passport|passport_number|passport_id)$/i,
  /^(drivers_license|driver_license|dl_number)$/i,
  /^(national_id|citizen_id)$/i,

  // Financial Information
  /^(credit_card|cc_number|card_number|pan)$/i,
  /^(cvv|cvc|security_code)$/i,
  /^(bank_account|account_number|routing_number)$/i,
  /^(iban|swift|bic)$/i,

  // Authentication Credentials
  /^(password|passwd|pwd)$/i,
  /^(secret|api_key|api_secret|auth_token)$/i,
  /^(private_key|priv_key|secret_key)$/i,
  /^(access_token|refresh_token|bearer_token)$/i,

  // Protected Health Information (PHI)
  /^(medical_record|mrn|patient_id)$/i,
  /^(diagnosis|condition|prescription|medication)$/i,
  /^(blood_type|dna|genetic)$/i,

  // Biometric Data
  /^(fingerprint|biometric|facial_recognition)$/i,

  // Communication that may contain sensitive content
  /^(encrypted_data|cipher_text)$/i,
];

/**
 * Check if a field name matches sensitive patterns.
 *
 * @param fieldName - The field name to check
 * @param customPatterns - Optional additional patterns to check
 * @returns true if the field is considered sensitive based on name
 */
export function isSensitiveFieldName(
  fieldName: string,
  customPatterns?: RegExp[]
): boolean {
  const allPatterns = [...SENSITIVE_FIELD_PATTERNS, ...(customPatterns || [])];
  return allPatterns.some((pattern) => pattern.test(fieldName));
}

/**
 * Check if a field has explicit sensitivity metadata.
 *
 * @param value - The field value (may contain metadata)
 * @returns Sensitivity metadata if present, undefined otherwise
 */
export function extractSensitivityMetadata(
  value: any
): SensitivityMetadata | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  // Check for sensitivity metadata in the object
  if (
    'is_sensitive' in value ||
    'required_scope' in value ||
    'sensitivity_reason' in value ||
    'classification' in value
  ) {
    return {
      is_sensitive: value.is_sensitive,
      required_scope: value.required_scope,
      sensitivity_reason: value.sensitivity_reason,
      classification: value.classification,
    };
  }

  return undefined;
}

/**
 * Check if a field should be redacted based on metadata and user scopes.
 *
 * @param metadata - Sensitivity metadata for the field
 * @param userScopes - User's effective scopes
 * @returns true if the field should be redacted
 */
export function shouldRedactField(
  metadata: SensitivityMetadata | undefined,
  userScopes: Set<string>
): boolean {
  if (!metadata) {
    return false;
  }

  // If explicitly not sensitive, don't redact
  if (metadata.is_sensitive === false) {
    return false;
  }

  // If marked sensitive without scope requirement, always redact
  if (metadata.is_sensitive === true && !metadata.required_scope) {
    return true;
  }

  // If scope required, check if user has it
  if (metadata.required_scope) {
    return !userScopes.has(metadata.required_scope);
  }

  return false;
}

/**
 * Redact sensitive fields in an object recursively.
 *
 * @param obj - The object to redact
 * @param config - Redaction configuration
 * @param path - Current path in object (for nested fields)
 * @returns Redaction result with redacted object and metadata
 */
export function redactObject<T extends Record<string, any>>(
  obj: T,
  config: RedactionConfig,
  path: string = ''
): RedactionResult<T> {
  const redactedFields: string[] = [];
  const enablePattern = config.enablePatternRedaction !== false;
  const enableMetadata = config.enableMetadataRedaction !== false;

  const redactValue = (value: any, fieldPath: string): any => {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Extract metadata if present
    const metadata = enableMetadata
      ? extractSensitivityMetadata(value)
      : undefined;

    // Check if field should be redacted based on metadata
    if (metadata && shouldRedactField(metadata, config.userScopes)) {
      redactedFields.push(fieldPath);
      return REDACTED;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        redactValue(item, `${fieldPath}[${index}]`)
      );
    }

    // Handle objects (recursively)
    if (typeof value === 'object') {
      const redacted: any = {};
      for (const [key, val] of Object.entries(value)) {
        const nestedPath = fieldPath ? `${fieldPath}.${key}` : key;

        // Check pattern-based redaction
        if (enablePattern && isSensitiveFieldName(key, config.customPatterns)) {
          redacted[key] = REDACTED;
          redactedFields.push(nestedPath);
          continue;
        }

        // Recursively process nested values
        redacted[key] = redactValue(val, nestedPath);
      }
      return redacted;
    }

    // Primitive values pass through
    return value;
  };

  const redactedObj = redactValue(obj, path) as T;

  return {
    data: redactedObj,
    redactedFields,
    redactionCount: redactedFields.length,
  };
}

/**
 * Redact properties field in a graph object.
 *
 * @param graphObject - Graph object with properties field
 * @param config - Redaction configuration
 * @returns Redacted graph object with metadata
 */
export function redactGraphObject<T extends { properties?: any }>(
  graphObject: T,
  config: RedactionConfig
): RedactionResult<T> {
  if (!graphObject.properties || typeof graphObject.properties !== 'object') {
    return {
      data: graphObject,
      redactedFields: [],
      redactionCount: 0,
    };
  }

  const result = redactObject(graphObject.properties, config, 'properties');

  return {
    data: {
      ...graphObject,
      properties: result.data,
    },
    redactedFields: result.redactedFields,
    redactionCount: result.redactionCount,
  };
}

/**
 * Redact multiple graph objects.
 *
 * @param objects - Array of graph objects
 * @param config - Redaction configuration
 * @returns Array of redacted objects with aggregate metadata
 */
export function redactGraphObjects<T extends { properties?: any }>(
  objects: T[],
  config: RedactionConfig
): RedactionResult<T[]> {
  const allRedactedFields: string[] = [];
  let totalCount = 0;

  const redactedObjects = objects.map((obj, index) => {
    const result = redactGraphObject(obj, config);

    // Track redacted fields with object index
    result.redactedFields.forEach((field) => {
      allRedactedFields.push(`[${index}].${field}`);
    });

    totalCount += result.redactionCount;

    return result.data;
  });

  return {
    data: redactedObjects,
    redactedFields: allRedactedFields,
    redactionCount: totalCount,
  };
}

/**
 * Create a default redaction config from user context.
 *
 * @param user - User object with scopes/permissions
 * @returns Redaction configuration
 */
export function createRedactionConfig(user?: {
  scopes?: string[];
  permissions?: { scopes: string[] };
}): RedactionConfig {
  const scopes = new Set<string>([
    ...(user?.scopes || []),
    ...(user?.permissions?.scopes || []),
  ]);

  return {
    userScopes: scopes,
    enablePatternRedaction: true,
    enableMetadataRedaction: true,
    logRedactions: true,
  };
}

/**
 * Check if user has permission to view sensitive data.
 * This is a convenience function for checking common sensitive data scopes.
 *
 * @param config - Redaction configuration
 * @returns true if user has sensitive data viewing permissions
 */
export function canViewSensitiveData(config: RedactionConfig): boolean {
  // Check for common sensitive data scopes
  const sensitiveScopes = [
    'data:sensitive:read',
    'data:pii:read',
    'data:phi:read',
    'admin',
    'superuser',
  ];

  return sensitiveScopes.some((scope) => config.userScopes.has(scope));
}
