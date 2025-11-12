import { Injectable } from '@nestjs/common';
import Ajv, { ValidateFunction } from 'ajv';

interface CachedSchema {
  validator: ValidateFunction | null; // null means no validation required (type exists but has no schema)
  organization_id: string | null;
  type_name: string;
}

interface CachedMultiplicity {
  multiplicity: { src: 'one' | 'many'; dst: 'one' | 'many' };
  organization_id: string | null;
  type_name: string;
}

/**
 * SchemaRegistryService provides validation for object and relationship types.
 *
 * NEW SCHEMA DESIGN (refactored):
 * - Types are defined at ORG level in object_type_schemas/relationship_type_schemas
 * - Projects enable/disable types via project_object_type_registry
 * - No versioning system (single schema per org+type)
 * - Properties stored as JSONB array (not JSON Schema format)
 *
 * This service currently returns undefined for all queries to allow TypeRegistryService
 * to handle validation. This is a transitional state while migrating to the new system.
 */
@Injectable()
export class SchemaRegistryService {
  private ajv = new Ajv({ allErrors: true });
  private objectCache = new Map<string, CachedSchema>(); // key: org|type
  private relationshipCache = new Map<string, CachedSchema>();
  private relationshipMultiplicityCache = new Map<string, CachedMultiplicity>();

  constructor() {}

  private cacheKey(organizationId: string | null, type: string) {
    return `${organizationId || 'null'}|${type}`;
  }

  /**
   * Get validator for an object type.
   *
   * NEW SCHEMA: Queries organization_id + type_name from object_type_schemas.
   * Returns undefined (no validation) since TypeRegistryService handles this now.
   *
   * @param projectId - Not used in new schema (org-level types)
   * @param type - The type name to look up
   */
  async getObjectValidator(
    projectId: string | null,
    type: string
  ): Promise<ValidateFunction | undefined> {
    // In the new schema, validation is handled by TypeRegistryService
    // Return undefined to allow fallback to TypeRegistry
    return undefined;
  }

  /**
   * Get validator for a relationship type.
   *
   * NEW SCHEMA: Queries organization_id + type_name from relationship_type_schemas.
   * Returns undefined (no validation) since TypeRegistryService handles this now.
   *
   * @param projectId - Not used in new schema (org-level types)
   * @param type - The relationship type name to look up
   */
  async getRelationshipValidator(
    projectId: string | null,
    type: string
  ): Promise<ValidateFunction | undefined> {
    // In the new schema, validation is handled by TypeRegistryService
    // Return undefined to allow fallback to TypeRegistry
    return undefined;
  }

  /**
   * Get multiplicity for a relationship type.
   *
   * NEW SCHEMA: Relationship schemas don't have multiplicity field.
   * Returns default many-to-many.
   *
   * @param projectId - Not used in new schema (org-level types)
   * @param type - The relationship type name to look up
   */
  async getRelationshipMultiplicity(
    projectId: string | null,
    type: string
  ): Promise<{ src: 'one' | 'many'; dst: 'one' | 'many' }> {
    // New schema doesn't have multiplicity field in relationship_type_schemas
    // Return default many-to-many (most permissive)
    return { src: 'many', dst: 'many' };
  }
}
