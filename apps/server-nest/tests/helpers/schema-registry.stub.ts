// Shared schema registry stub factory for GraphService unit tests.
// Allows supplying optional object/relationship validators and multiplicity overrides.

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
