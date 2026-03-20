## 1. Decomposer Schema Definition (Go code as source of truth)

- [ ] 1.1 Create `internal/decompose/schema.go` with `ObjectTypeDefinition` and `RelTypeDefinition` structs
- [ ] 1.2 Define all 14 object types as Go constants with name, description, inertia tier, and property schema
- [ ] 1.3 Define all 16 structural relationship types as Go constants with name, description, and directionality
- [ ] 1.4 Export `ObjectTypes()` and `RelationshipTypes()` functions for reconciliation use
- [ ] 1.5 Write test verifying the schema definition covers all types the decomposer produces

## 2. Memory Client: Type Management API

- [ ] 2.1 Add `ListObjectTypes(ctx)` method — list types registered in the project
- [ ] 2.2 Add `CreateObjectType(ctx, TypeDefinition)` method — create a type if not exists
- [ ] 2.3 Add `ListRelationshipTypes(ctx)` method
- [ ] 2.4 Add `CreateRelationshipType(ctx, TypeDefinition)` method
- [ ] 2.5 If type-level APIs don't exist, fall back to template pack generation: `GenerateTemplatePack()` from Go definitions and `InstallTemplatePack()`

## 3. Declarative Reconciliation

- [ ] 3.1 Add `Reconcile(ctx, client) (*ReconcileResult, error)` function in `internal/decompose/`
- [ ] 3.2 List existing types in Memory project, compare against Go definitions
- [ ] 3.3 Create missing object types (additive only — never remove)
- [ ] 3.4 Create missing relationship types (additive only)
- [ ] 3.5 Return reconciliation result with created/skipped/total counts
- [ ] 3.6 Handle graceful degradation if type management API is unavailable
- [ ] 3.7 Call `Reconcile` at the start of `Ingester.Ingest()` and `Ingester.Sync()`
- [ ] 3.8 Write tests for create-missing, all-present, and API-unavailable scenarios

## 4. MCP Tool Updates

- [ ] 4.1 Update `handleMemoryStatus` to report reconciliation status (types present vs expected)
- [ ] 4.2 List any missing types in the status response
- [ ] 4.3 Update `validEPFObjectTypes` list to include `IntegrationPoint`, `Constraint`, `Opportunity`, `CrossTrackDependency`

## 5. Decomposer: New Object Types

- [ ] 5.1 Add `IntegrationPoint` extraction from roadmap `integration_points[]`
- [ ] 5.2 Add `Constraint` extraction from feature `constraints[]` and roadmap `technical_constraints[]`
- [ ] 5.3 Add `Opportunity` extraction from insight analyses `opportunities[]`
- [ ] 5.4 Add `CrossTrackDependency` extraction from roadmap `cross_track_dependencies[]`
- [ ] 5.5 Add raw YAML struct types for new sections
- [ ] 5.6 Write tests for each new object type extraction

## 6. Decomposer: New Structural Relationships

- [ ] 6.1 Add `informs` edges: Belief → Positioning
- [ ] 6.2 Add `constrains` edges: Assumption → Feature (reverse of `tests_assumption`)
- [ ] 6.3 Add `delivers` edges: OKR → Feature (from KR feature references and cross_track_dependencies)
- [ ] 6.4 Add `validates` edges: Capability → Assumption (proven caps validate assumptions)
- [ ] 6.5 Add `shared_technology` edges: Feature → Feature (overlapping `contributes_to` paths)
- [ ] 6.6 Add `addresses` edges: Feature → Opportunity
- [ ] 6.7 Add `converges_at` edges: CrossTrackDependency → OKR
- [ ] 6.8 Add `unlocks` edges: IntegrationPoint → Feature
- [ ] 6.9 Write tests for each new relationship type

## 7. Deprecate schema JSON file

- [ ] 7.1 Remove or mark `.memory/blueprints/epf-engine/packs/epf-engine.json` as deprecated
- [ ] 7.2 Update any references to the schema file in documentation or blueprints
- [ ] 7.3 Add comment in old file pointing to `internal/decompose/schema.go` as the source of truth

## 8. Testing

- [ ] 8.1 Run existing decomposer tests to verify no regressions
- [ ] 8.2 Add test fixtures with integration_points, constraints, opportunities, cross_track_dependencies
- [ ] 8.3 Test full ingest pipeline on Emergent EPF instance with reconciliation
- [ ] 8.4 Verify graph object/relationship counts increase as expected
- [ ] 8.5 Run `go test ./...` and confirm all tests pass
- [ ] 8.6 Build `epf-cli` and verify new types appear in decomposer output

## 9. Documentation

- [ ] 9.1 Update AGENTS.md: document that decomposer code defines the schema, not JSON files
- [ ] 9.2 Update decomposer header comment with type/relationship counts
