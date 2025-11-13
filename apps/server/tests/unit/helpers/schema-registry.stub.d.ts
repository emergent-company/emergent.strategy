import type { ValidateFunction } from 'ajv';
export type RelationshipMultiplicity = {
    src: 'one' | 'many';
    dst: 'one' | 'many';
};
export interface SchemaRegistryStubOptions {
    objectValidator?: ValidateFunction | null;
    relationshipValidator?: ValidateFunction | null;
    multiplicity?: RelationshipMultiplicity;
    multiplicityMap?: Record<string, RelationshipMultiplicity>;
}
export interface ISchemaRegistryLike {
    getObjectValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined>;
    getRelationshipValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined>;
    getRelationshipMultiplicity(projectId: string | null, type: string): Promise<RelationshipMultiplicity>;
}
export declare function makeSchemaRegistryStub(opts?: SchemaRegistryStubOptions): ISchemaRegistryLike;
export declare function withMultiplicities(map: Record<string, RelationshipMultiplicity>, base?: SchemaRegistryStubOptions): ISchemaRegistryLike;
