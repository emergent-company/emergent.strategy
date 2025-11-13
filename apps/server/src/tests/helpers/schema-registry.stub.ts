// Local copy of schema registry stub placed under src/ so that specs within src/
// can import it without TypeScript rootDir violations. This intentionally duplicates
// the implementation in tests/helpers/schema-registry.stub.ts (kept for legacy specs
// outside src). If the helper evolves, update both or consolidate by adjusting
// tsconfig rootDir to include tests/.

import type { ValidateFunction } from 'ajv';

export type RelationshipMultiplicity = { src: 'one' | 'many'; dst: 'one' | 'many' };

export interface SchemaRegistryStubOptions {
    objectValidator?: ValidateFunction | null;
    relationshipValidator?: ValidateFunction | null;
    multiplicity?: RelationshipMultiplicity; // default for all relationship types
    multiplicityMap?: Record<string, RelationshipMultiplicity>; // per relationship type override
}

export interface ISchemaRegistryLike {
    getObjectValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined>;
    getRelationshipValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined>;
    getRelationshipMultiplicity(projectId: string | null, type: string): Promise<RelationshipMultiplicity>;
}

export function makeSchemaRegistryStub(opts: SchemaRegistryStubOptions = {}): ISchemaRegistryLike {
    const {
        objectValidator = null,
        relationshipValidator = null,
        multiplicity = { src: 'many', dst: 'many' },
        multiplicityMap = {}
    } = opts;
    return {
        async getObjectValidator() { return objectValidator || undefined; },
        async getRelationshipValidator() { return relationshipValidator || undefined; },
        async getRelationshipMultiplicity(_projectId: string | null, type: string) {
            return multiplicityMap[type] || multiplicity;
        }
    };
}

// Convenience helper for tests needing quick per-type multiplicities
export function withMultiplicities(map: Record<string, RelationshipMultiplicity>, base?: SchemaRegistryStubOptions) {
    return makeSchemaRegistryStub({ ...base, multiplicityMap: map });
}

