/**
 * Unit tests for Sensitive Data Redaction Utilities (Phase 3 - Task 8a)
 */

import { describe, it, expect } from 'vitest';
import {
  REDACTED,
  isSensitiveFieldName,
  extractSensitivityMetadata,
  shouldRedactField,
  redactObject,
  redactGraphObject,
  redactGraphObjects,
  createRedactionConfig,
  canViewSensitiveData,
} from '../../../src/modules/graph/utils/redaction.util';

describe('redaction.util', () => {
  describe('isSensitiveFieldName', () => {
    it('should detect PII field names', () => {
      expect(isSensitiveFieldName('ssn')).toBe(true);
      expect(isSensitiveFieldName('social_security_number')).toBe(true);
      expect(isSensitiveFieldName('passport')).toBe(true);
      expect(isSensitiveFieldName('drivers_license')).toBe(true);
    });

    it('should detect financial field names', () => {
      expect(isSensitiveFieldName('credit_card')).toBe(true);
      expect(isSensitiveFieldName('cvv')).toBe(true);
      expect(isSensitiveFieldName('bank_account')).toBe(true);
      expect(isSensitiveFieldName('iban')).toBe(true);
    });

    it('should detect authentication credential field names', () => {
      expect(isSensitiveFieldName('password')).toBe(true);
      expect(isSensitiveFieldName('api_key')).toBe(true);
      expect(isSensitiveFieldName('secret')).toBe(true);
      expect(isSensitiveFieldName('access_token')).toBe(true);
    });

    it('should detect PHI field names', () => {
      expect(isSensitiveFieldName('medical_record')).toBe(true);
      expect(isSensitiveFieldName('diagnosis')).toBe(true);
      expect(isSensitiveFieldName('prescription')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isSensitiveFieldName('SSN')).toBe(true);
      expect(isSensitiveFieldName('Password')).toBe(true);
      expect(isSensitiveFieldName('CREDIT_CARD')).toBe(true);
    });

    it('should not flag non-sensitive field names', () => {
      expect(isSensitiveFieldName('name')).toBe(false);
      expect(isSensitiveFieldName('email')).toBe(false);
      expect(isSensitiveFieldName('id')).toBe(false);
      expect(isSensitiveFieldName('created_at')).toBe(false);
    });

    it('should support custom patterns', () => {
      const customPatterns = [/^internal_notes$/i];

      expect(isSensitiveFieldName('internal_notes', customPatterns)).toBe(true);
      expect(isSensitiveFieldName('public_notes', customPatterns)).toBe(false);
    });
  });

  describe('extractSensitivityMetadata', () => {
    it('should extract sensitivity metadata from object', () => {
      const value = {
        is_sensitive: true,
        required_scope: 'data:pii:read',
        sensitivity_reason: 'Contains PII',
        classification: 'pii',
        actual_value: 'secret data',
      };

      const metadata = extractSensitivityMetadata(value);

      expect(metadata).toEqual({
        is_sensitive: true,
        required_scope: 'data:pii:read',
        sensitivity_reason: 'Contains PII',
        classification: 'pii',
      });
    });

    it('should return undefined for non-objects', () => {
      expect(extractSensitivityMetadata('string')).toBeUndefined();
      expect(extractSensitivityMetadata(123)).toBeUndefined();
      expect(extractSensitivityMetadata(null)).toBeUndefined();
      expect(extractSensitivityMetadata(undefined)).toBeUndefined();
    });

    it('should return undefined for objects without metadata', () => {
      expect(extractSensitivityMetadata({ name: 'test' })).toBeUndefined();
    });

    it('should extract partial metadata', () => {
      const value = { is_sensitive: true };
      const metadata = extractSensitivityMetadata(value);

      expect(metadata?.is_sensitive).toBe(true);
      expect(metadata?.required_scope).toBeUndefined();
    });
  });

  describe('shouldRedactField', () => {
    it('should not redact when no metadata', () => {
      const userScopes = new Set(['some:scope']);
      expect(shouldRedactField(undefined, userScopes)).toBe(false);
    });

    it('should not redact when explicitly not sensitive', () => {
      const metadata = { is_sensitive: false };
      const userScopes = new Set<string>();

      expect(shouldRedactField(metadata, userScopes)).toBe(false);
    });

    it('should redact sensitive field without scope requirement', () => {
      const metadata = { is_sensitive: true };
      const userScopes = new Set<string>();

      expect(shouldRedactField(metadata, userScopes)).toBe(true);
    });

    it('should not redact when user has required scope', () => {
      const metadata = { required_scope: 'data:pii:read' };
      const userScopes = new Set(['data:pii:read']);

      expect(shouldRedactField(metadata, userScopes)).toBe(false);
    });

    it('should redact when user lacks required scope', () => {
      const metadata = { required_scope: 'data:pii:read' };
      const userScopes = new Set(['data:public:read']);

      expect(shouldRedactField(metadata, userScopes)).toBe(true);
    });
  });

  describe('redactObject', () => {
    it('should redact sensitive fields by pattern', () => {
      const obj = {
        name: 'John Doe',
        email: 'john@example.com',
        ssn: '123-45-6789',
        password: 'secret123',
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
      };

      const result = redactObject(obj, config);

      expect(result.data.name).toBe('John Doe');
      expect(result.data.email).toBe('john@example.com');
      expect(result.data.ssn).toBe(REDACTED);
      expect(result.data.password).toBe(REDACTED);
      expect(result.redactionCount).toBe(2);
      expect(result.redactedFields).toContain('ssn');
      expect(result.redactedFields).toContain('password');
    });

    it('should redact nested sensitive fields', () => {
      const obj = {
        user: {
          name: 'John Doe',
          credentials: {
            password: 'secret',
            api_key: 'key123',
          },
        },
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
      };

      const result = redactObject(obj, config);

      expect(result.data.user.name).toBe('John Doe');
      expect(result.data.user.credentials.password).toBe(REDACTED);
      expect(result.data.user.credentials.api_key).toBe(REDACTED);
      expect(result.redactionCount).toBe(2);
      expect(result.redactedFields).toContain('user.credentials.password');
      expect(result.redactedFields).toContain('user.credentials.api_key');
    });

    it('should redact fields in arrays', () => {
      const obj = {
        users: [
          { name: 'Alice', password: 'pass1' },
          { name: 'Bob', password: 'pass2' },
        ],
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
      };

      const result = redactObject(obj, config);

      expect(result.data.users[0].name).toBe('Alice');
      expect(result.data.users[0].password).toBe(REDACTED);
      expect(result.data.users[1].name).toBe('Bob');
      expect(result.data.users[1].password).toBe(REDACTED);
      expect(result.redactionCount).toBe(2);
    });

    it('should handle metadata-based redaction', () => {
      const obj = {
        public_field: 'visible',
        sensitive_field: {
          is_sensitive: true,
          value: 'secret data',
        },
      };

      const config = {
        userScopes: new Set<string>(),
        enableMetadataRedaction: true,
      };

      const result = redactObject(obj, config);

      expect(result.data.public_field).toBe('visible');
      expect(result.data.sensitive_field).toBe(REDACTED);
      expect(result.redactionCount).toBe(1);
    });

    it('should respect user scopes for metadata-based redaction', () => {
      const obj = {
        field1: {
          required_scope: 'data:pii:read',
          value: 'pii data',
        },
        field2: {
          required_scope: 'data:admin:read',
          value: 'admin data',
        },
      };

      const config = {
        userScopes: new Set(['data:pii:read']),
        enableMetadataRedaction: true,
      };

      const result = redactObject(obj, config);

      // User has scope for field1, not redacted
      expect(result.data.field1).not.toBe(REDACTED);
      // User lacks scope for field2, redacted
      expect(result.data.field2).toBe(REDACTED);
      expect(result.redactionCount).toBe(1);
    });

    it('should allow disabling pattern redaction', () => {
      const obj = {
        password: 'secret',
        ssn: '123-45-6789',
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: false,
      };

      const result = redactObject(obj, config);

      // Pattern redaction disabled, fields not redacted
      expect(result.data.password).toBe('secret');
      expect(result.data.ssn).toBe('123-45-6789');
      expect(result.redactionCount).toBe(0);
    });

    it('should handle null and undefined values', () => {
      const obj = {
        field1: null,
        field2: undefined,
        field3: 'value',
      };

      const config = {
        userScopes: new Set<string>(),
      };

      const result = redactObject(obj, config);

      expect(result.data.field1).toBeNull();
      expect(result.data.field2).toBeUndefined();
      expect(result.data.field3).toBe('value');
    });
  });

  describe('redactGraphObject', () => {
    it('should redact properties in graph object', () => {
      const graphObject = {
        id: '123',
        type: 'User',
        properties: {
          name: 'John Doe',
          password: 'secret',
          ssn: '123-45-6789',
        },
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
      };

      const result = redactGraphObject(graphObject, config);

      expect(result.data.id).toBe('123');
      expect(result.data.type).toBe('User');
      expect(result.data.properties.name).toBe('John Doe');
      expect(result.data.properties.password).toBe(REDACTED);
      expect(result.data.properties.ssn).toBe(REDACTED);
      expect(result.redactionCount).toBe(2);
    });

    it('should handle graph object without properties', () => {
      const graphObject: any = {
        id: '123',
        type: 'Node',
      };

      const config = {
        userScopes: new Set<string>(),
      };

      const result = redactGraphObject(graphObject, config);

      expect(result.data).toEqual(graphObject);
      expect(result.redactionCount).toBe(0);
    });

    it('should preserve other graph object fields', () => {
      const graphObject = {
        id: '123',
        type: 'User',
        labels: ['Person', 'Employee'],
        created_at: '2025-01-01',
        properties: {
          password: 'secret',
        },
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
      };

      const result = redactGraphObject(graphObject, config);

      expect(result.data.labels).toEqual(['Person', 'Employee']);
      expect(result.data.created_at).toBe('2025-01-01');
      expect(result.data.properties.password).toBe(REDACTED);
    });
  });

  describe('redactGraphObjects', () => {
    it('should redact multiple graph objects', () => {
      const objects = [
        {
          id: '1',
          properties: { name: 'Alice', ssn: '111-11-1111' },
        },
        {
          id: '2',
          properties: { name: 'Bob', password: 'secret' },
        },
      ];

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
      };

      const result = redactGraphObjects(objects, config);

      expect(result.data[0].properties.name).toBe('Alice');
      expect(result.data[0].properties.ssn).toBe(REDACTED);
      expect(result.data[1].properties.name).toBe('Bob');
      expect(result.data[1].properties.password).toBe(REDACTED);
      expect(result.redactionCount).toBe(2);
      expect(result.redactedFields).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const config = {
        userScopes: new Set<string>(),
      };

      const result = redactGraphObjects([], config);

      expect(result.data).toEqual([]);
      expect(result.redactionCount).toBe(0);
    });
  });

  describe('createRedactionConfig', () => {
    it('should create config from user with scopes', () => {
      const user = {
        scopes: ['read:public', 'write:own'],
      };

      const config = createRedactionConfig(user);

      expect(config.userScopes.has('read:public')).toBe(true);
      expect(config.userScopes.has('write:own')).toBe(true);
      expect(config.enablePatternRedaction).toBe(true);
      expect(config.enableMetadataRedaction).toBe(true);
    });

    it('should create config from user with permissions', () => {
      const user = {
        permissions: {
          scopes: ['admin', 'data:sensitive:read'],
        },
      };

      const config = createRedactionConfig(user);

      expect(config.userScopes.has('admin')).toBe(true);
      expect(config.userScopes.has('data:sensitive:read')).toBe(true);
    });

    it('should combine scopes and permissions', () => {
      const user = {
        scopes: ['read:public'],
        permissions: {
          scopes: ['admin'],
        },
      };

      const config = createRedactionConfig(user);

      expect(config.userScopes.has('read:public')).toBe(true);
      expect(config.userScopes.has('admin')).toBe(true);
    });

    it('should create config for user without scopes', () => {
      const config = createRedactionConfig(undefined);

      expect(config.userScopes.size).toBe(0);
    });
  });

  describe('canViewSensitiveData', () => {
    it('should return true for user with sensitive data scope', () => {
      const config = {
        userScopes: new Set(['data:sensitive:read']),
      };

      expect(canViewSensitiveData(config)).toBe(true);
    });

    it('should return true for admin user', () => {
      const config = {
        userScopes: new Set(['admin']),
      };

      expect(canViewSensitiveData(config)).toBe(true);
    });

    it('should return true for user with PII read scope', () => {
      const config = {
        userScopes: new Set(['data:pii:read']),
      };

      expect(canViewSensitiveData(config)).toBe(true);
    });

    it('should return false for user without sensitive scopes', () => {
      const config = {
        userScopes: new Set(['read:public']),
      };

      expect(canViewSensitiveData(config)).toBe(false);
    });

    it('should return false for user with no scopes', () => {
      const config = {
        userScopes: new Set<string>(),
      };

      expect(canViewSensitiveData(config)).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex nested structure with mixed redaction', () => {
      const obj = {
        user_profile: {
          public_info: {
            name: 'John Doe',
            email: 'john@example.com',
          },
          private_info: {
            ssn: '123-45-6789',
            credit_card: '4111-1111-1111-1111',
            medical_history: {
              is_sensitive: true,
              required_scope: 'data:phi:read',
              diagnoses: ['condition1', 'condition2'],
            },
          },
        },
      };

      const config = {
        userScopes: new Set<string>(),
        enablePatternRedaction: true,
        enableMetadataRedaction: true,
      };

      const result = redactObject(obj, config);

      // Public info preserved
      expect(result.data.user_profile.public_info.name).toBe('John Doe');
      expect(result.data.user_profile.public_info.email).toBe(
        'john@example.com'
      );

      // Pattern-based redaction
      expect(result.data.user_profile.private_info.ssn).toBe(REDACTED);
      expect(result.data.user_profile.private_info.credit_card).toBe(REDACTED);

      // Metadata-based redaction
      expect(result.data.user_profile.private_info.medical_history).toBe(
        REDACTED
      );

      expect(result.redactionCount).toBe(3);
    });

    it('should allow admin to view all data', () => {
      const obj = {
        public_field: 'visible',
        password: 'secret',
        sensitive_data: {
          is_sensitive: true,
          required_scope: 'data:pii:read',
          value: 'pii',
        },
      };

      const config = {
        userScopes: new Set(['admin', 'data:pii:read']),
        enablePatternRedaction: true,
        enableMetadataRedaction: true,
      };

      const result = redactObject(obj, config);

      // Admin can see public field
      expect(result.data.public_field).toBe('visible');

      // Pattern-based still redacts credentials (intentional security)
      expect(result.data.password).toBe(REDACTED);

      // But has scope for metadata-protected field
      expect(result.data.sensitive_data).not.toBe(REDACTED);
    });
  });
});
