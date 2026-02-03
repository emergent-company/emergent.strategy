# Migration Intelligence Design

## Overview

Migration Intelligence helps AI agents upgrade EPF instances when schema/template versions change. It follows the "Agent as Writer, Tool as Linter" principle:

1. **epf-cli detects** - Version drift between EPF schemas/templates and instance artifacts
2. **epf-cli guides** - Generates detailed per-file migration instructions
3. **AI agent writes** - Makes the actual content changes
4. **epf-cli validates** - Confirms migrated files pass the new schema

## Version Sources

### Schema Version

- Location: `docs/EPF/schemas/<artifact>_schema.json`
- Field: `"version": "1.13.0"` at root of schema
- Represents: The schema definition version

### Instance Artifact Version

- Location: `_instances/{product}/<artifact>.yaml`
- Field: `meta.epf_version: "1.9.6"` (if present)
- May also have header comment: `# EPF v1.9.6`

### Version Relationship

- Schema version and artifact version are **not the same thing**
- Schema version = definition of what fields are valid
- Artifact version = which EPF release the content was written for
- A migration may update the artifact version without schema changes, or vice versa

## Detection Strategy

### 1. Schema Changes

Compare current schema with previous version to detect:

- **Added required fields** → Migration must add them
- **Removed fields** → Migration should remove them (or warn)
- **Type changes** → Migration must transform data
- **New enum values** → Migration may use new options
- **Pattern changes** → Migration must update format

### 2. Template Changes

Compare current template with previous version to detect:

- **New recommended sections** → Migration should consider adding
- **Structural changes** → Migration should follow new patterns
- **New best practices** → Migration guide should mention

### 3. Instance Drift

For each file in an instance:

- Extract `meta.epf_version` or header version
- Compare to current EPF version
- Check if file validates against current schema
- Identify specific validation errors that need fixing

## Migration Guide Output

### Per-File Instructions

```yaml
file: 'FIRE/feature_definitions/fd-001.yaml'
artifact_type: 'feature_definition'
current_version: '1.8.0'
target_version: '1.13.0'
needs_migration: true

changes_required:
  - type: 'add_field'
    path: 'meta.epf_version'
    value: '1.13.0'
    reason: 'Version tracking field now required'

  - type: 'add_field'
    path: 'strategic_context.contributes_to'
    suggested_value: ['Product.Layer1LocalTools.EpfCli']
    reason: 'New required field for value model targeting'
    hint: 'Choose from available value model paths'

  - type: 'restructure'
    path: 'personas'
    from_format: 'array of strings'
    to_format: 'array of objects with role, description, goals, pain_points'
    example: |
      personas:
        - role: "Product Manager"
          description: "Manages product roadmap and priorities"
          goals:
            - "Ship features that customers love"
          pain_points:
            - "Too many competing priorities"

validation_errors:
  - path: '/definition/capabilities'
    error: 'missing required field: key_interactions'
    fix: 'Add key_interactions array describing main user interactions'

template_reference: |
  # From docs/EPF/templates/FIRE/feature-definition-template.yaml
  # Shows the current recommended structure...

schema_diff:
  added_fields:
    - 'meta.epf_version (required)'
    - 'strategic_context.contributes_to (required)'
    - 'personas[].goals (optional)'
  removed_fields: []
  type_changes: []
```

## Implementation Plan

### Files to Create

```
internal/migration/
├── detector.go          # Detect version drift
├── schema_diff.go       # Compare schemas
├── template_diff.go     # Compare templates
├── guide.go             # Generate migration guide
├── types.go             # Shared types
└── guide_test.go        # Tests
```

### Integration Points

1. **Health Command** - Add migration status check
   - Shows: "⚠️ Migration Available: 1.8.0 → 1.13.0 (run `epf-cli migrate check`)"
2. **Migrate Command** - Enhance existing

   - `epf-cli migrate check` - Show detailed migration needs
   - `epf-cli migrate guide [file]` - Generate per-file instructions
   - Keep existing `migrate` for version number updates

3. **MCP Tool** - `epf_get_migration_guide`
   - Input: `instance_path`, optional `file_path`
   - Output: Full migration guide JSON

## Schema Diff Algorithm

```go
type SchemaDiff struct {
    AddedRequiredFields   []FieldChange
    AddedOptionalFields   []FieldChange
    RemovedFields         []FieldChange
    TypeChanges           []TypeChange
    PatternChanges        []PatternChange
    EnumChanges           []EnumChange
}

// Compare two JSON schemas recursively
func DiffSchemas(old, new *jsonschema.Schema) *SchemaDiff
```

## Template Diff Algorithm

```go
type TemplateDiff struct {
    AddedSections     []string      // New YAML paths
    RemovedSections   []string      // Removed YAML paths
    StructureChanges  []StructChange
    CommentChanges    []string      // Documentation changes
}

// Compare two YAML templates
func DiffTemplates(old, new string) *TemplateDiff
```

## Open Questions

1. **Schema Versioning** - Should we track schema versions separately from EPF version?

   - Current: Schemas have their own version (e.g., 1.13.0)
   - Proposal: Also track "last compatible EPF version" metadata

2. **Breaking vs Non-Breaking** - How to classify changes?

   - Breaking: Added required field, removed field, type change
   - Non-breaking: Added optional field, new enum value

3. **Automatic vs Manual** - What can be auto-migrated?

   - Auto: Version numbers, simple field additions with defaults
   - Manual: Data restructuring, semantic changes, new required content

4. **History** - Should we maintain a migration changelog?
   - Could help generate migration paths: 1.5 → 1.8 → 1.13
