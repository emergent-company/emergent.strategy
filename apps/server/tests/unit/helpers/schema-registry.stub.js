"use strict";
// Shared schema registry stub factory for GraphService unit tests.
// Allows supplying optional object/relationship validators and multiplicity overrides.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeSchemaRegistryStub = makeSchemaRegistryStub;
exports.withMultiplicities = withMultiplicities;
function makeSchemaRegistryStub(opts = {}) {
    const { objectValidator = null, relationshipValidator = null, multiplicity = { src: 'many', dst: 'many' }, multiplicityMap = {} } = opts;
    return {
        async getObjectValidator() { return objectValidator || undefined; },
        async getRelationshipValidator() { return relationshipValidator || undefined; },
        async getRelationshipMultiplicity(_projectId, type) {
            return multiplicityMap[type] || multiplicity;
        }
    };
}
// Convenience helper for tests needing quick per-type multiplicities
function withMultiplicities(map, base) {
    return makeSchemaRegistryStub({ ...base, multiplicityMap: map });
}
//# sourceMappingURL=schema-registry.stub.js.map