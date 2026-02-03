package migration

import (
	"encoding/json"
	"testing"
)

func TestExtractSchemaVersion(t *testing.T) {
	tests := []struct {
		name     string
		schema   string
		expected string
	}{
		{
			name:     "extracts version from schema",
			schema:   `{"version": "2.1.0", "type": "object"}`,
			expected: "2.1.0",
		},
		{
			name:     "returns unknown for missing version",
			schema:   `{"type": "object", "properties": {}}`,
			expected: "unknown",
		},
		{
			name:     "handles complex schema",
			schema:   `{"$schema": "http://json-schema.org/draft-07/schema#", "version": "1.13.0", "title": "Test Schema"}`,
			expected: "1.13.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExtractSchemaVersion(json.RawMessage(tt.schema))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestExtractVersionFromContent(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name:     "extracts header version",
			content:  "# EPF v1.9.6\nid: test",
			expected: "1.9.6",
		},
		{
			name:     "extracts meta.epf_version",
			content:  "id: test\nmeta:\n  epf_version: \"1.8.0\"",
			expected: "1.8.0",
		},
		{
			name:     "prefers header version over meta",
			content:  "# EPF v1.9.6\nmeta:\n  epf_version: \"1.8.0\"",
			expected: "1.9.6",
		},
		{
			name:     "handles no version",
			content:  "id: test\nname: Test Feature",
			expected: "",
		},
		{
			name:     "handles EPF without v prefix",
			content:  "# EPF 2.0.0\nid: test",
			expected: "2.0.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractVersionFromContent(tt.content)
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestDiffSchemas(t *testing.T) {
	tests := []struct {
		name              string
		oldSchema         string
		newSchema         string
		expectBreaking    bool
		expectAddedReq    int
		expectAddedOpt    int
		expectRemoved     int
		expectTypeChanges int
	}{
		{
			name: "detects added required field",
			oldSchema: `{
				"version": "1.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"}
				},
				"required": ["id"]
			}`,
			newSchema: `{
				"version": "2.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"},
					"name": {"type": "string"}
				},
				"required": ["id", "name"]
			}`,
			expectBreaking: true,
			expectAddedReq: 1,
			expectAddedOpt: 0,
		},
		{
			name: "detects added optional field",
			oldSchema: `{
				"version": "1.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"}
				},
				"required": ["id"]
			}`,
			newSchema: `{
				"version": "2.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"},
					"description": {"type": "string"}
				},
				"required": ["id"]
			}`,
			expectBreaking: false,
			expectAddedReq: 0,
			expectAddedOpt: 1,
		},
		{
			name: "detects removed field",
			oldSchema: `{
				"version": "1.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"},
					"legacy": {"type": "string"}
				},
				"required": ["id"]
			}`,
			newSchema: `{
				"version": "2.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"}
				},
				"required": ["id"]
			}`,
			expectBreaking: false,
			expectRemoved:  1,
		},
		{
			name: "detects type change",
			oldSchema: `{
				"version": "1.0.0",
				"type": "object",
				"properties": {
					"count": {"type": "string"}
				}
			}`,
			newSchema: `{
				"version": "2.0.0",
				"type": "object",
				"properties": {
					"count": {"type": "integer"}
				}
			}`,
			expectBreaking:    true,
			expectTypeChanges: 1,
		},
		{
			name: "no changes",
			oldSchema: `{
				"version": "1.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"}
				}
			}`,
			newSchema: `{
				"version": "1.0.0",
				"type": "object",
				"properties": {
					"id": {"type": "string"}
				}
			}`,
			expectBreaking: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			diff, err := DiffSchemas([]byte(tt.oldSchema), []byte(tt.newSchema))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if diff.HasBreakingChanges != tt.expectBreaking {
				t.Errorf("expected breaking=%v, got %v", tt.expectBreaking, diff.HasBreakingChanges)
			}

			if len(diff.AddedRequiredFields) != tt.expectAddedReq {
				t.Errorf("expected %d added required fields, got %d", tt.expectAddedReq, len(diff.AddedRequiredFields))
			}

			if len(diff.AddedOptionalFields) != tt.expectAddedOpt {
				t.Errorf("expected %d added optional fields, got %d", tt.expectAddedOpt, len(diff.AddedOptionalFields))
			}

			if len(diff.RemovedFields) != tt.expectRemoved {
				t.Errorf("expected %d removed fields, got %d", tt.expectRemoved, len(diff.RemovedFields))
			}

			if len(diff.TypeChanges) != tt.expectTypeChanges {
				t.Errorf("expected %d type changes, got %d", tt.expectTypeChanges, len(diff.TypeChanges))
			}
		})
	}
}

func TestSchemaDiff_Summary(t *testing.T) {
	tests := []struct {
		name     string
		diff     *SchemaDiff
		expected string
	}{
		{
			name:     "empty diff",
			diff:     &SchemaDiff{},
			expected: "No changes",
		},
		{
			name: "single added required field",
			diff: &SchemaDiff{
				AddedRequiredFields: []FieldInfo{{Path: "name"}},
				HasBreakingChanges:  true,
			},
			expected: "1 new required field(s) (BREAKING)",
		},
		{
			name: "multiple changes",
			diff: &SchemaDiff{
				AddedRequiredFields: []FieldInfo{{Path: "name"}},
				AddedOptionalFields: []FieldInfo{{Path: "desc"}, {Path: "tags"}},
				HasBreakingChanges:  true,
			},
			expected: "1 new required field(s), 2 new optional field(s) (BREAKING)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.diff.Summary()
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestSchemaDiff_IsEmpty(t *testing.T) {
	emptyDiff := &SchemaDiff{}
	if !emptyDiff.IsEmpty() {
		t.Error("expected empty diff to return IsEmpty=true")
	}

	nonEmptyDiff := &SchemaDiff{
		AddedOptionalFields: []FieldInfo{{Path: "test"}},
	}
	if nonEmptyDiff.IsEmpty() {
		t.Error("expected non-empty diff to return IsEmpty=false")
	}
}

func TestCompareEnums(t *testing.T) {
	tests := []struct {
		name          string
		oldEnum       []string
		newEnum       []string
		expectAdded   int
		expectRemoved int
		expectNil     bool
	}{
		{
			name:      "no changes",
			oldEnum:   []string{"a", "b", "c"},
			newEnum:   []string{"a", "b", "c"},
			expectNil: true,
		},
		{
			name:        "added values",
			oldEnum:     []string{"a", "b"},
			newEnum:     []string{"a", "b", "c", "d"},
			expectAdded: 2,
		},
		{
			name:          "removed values",
			oldEnum:       []string{"a", "b", "c"},
			newEnum:       []string{"a"},
			expectRemoved: 2,
		},
		{
			name:          "mixed changes",
			oldEnum:       []string{"a", "b"},
			newEnum:       []string{"b", "c"},
			expectAdded:   1,
			expectRemoved: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := compareEnums("test.field", tt.oldEnum, tt.newEnum)

			if tt.expectNil {
				if result != nil {
					t.Errorf("expected nil, got %+v", result)
				}
				return
			}

			if result == nil {
				t.Fatal("expected non-nil result")
			}

			if len(result.AddedValues) != tt.expectAdded {
				t.Errorf("expected %d added values, got %d", tt.expectAdded, len(result.AddedValues))
			}

			if len(result.RemovedValues) != tt.expectRemoved {
				t.Errorf("expected %d removed values, got %d", tt.expectRemoved, len(result.RemovedValues))
			}
		})
	}
}

func TestChangeTypes(t *testing.T) {
	// Verify all change type constants are defined
	types := []ChangeType{
		ChangeAddField,
		ChangeRemoveField,
		ChangeModifyField,
		ChangeRestructure,
		ChangeRename,
		ChangeTypeChange,
		ChangePatternChange,
		ChangeVersionUpdate,
	}

	for _, ct := range types {
		if ct == "" {
			t.Error("change type should not be empty")
		}
	}
}

func TestMigrationStatusFields(t *testing.T) {
	status := &MigrationStatus{
		NeedsMigration:  true,
		CurrentVersion:  "1.8.0",
		TargetVersion:   "2.1.0",
		Summary:         "5 of 10 files need migration",
		TotalFiles:      10,
		FilesNeedingFix: 5,
		UpToDateFiles:   5,
	}

	if !status.NeedsMigration {
		t.Error("expected NeedsMigration=true")
	}
	if status.TotalFiles != 10 {
		t.Errorf("expected TotalFiles=10, got %d", status.TotalFiles)
	}
	if status.FilesNeedingFix+status.UpToDateFiles != status.TotalFiles {
		t.Error("file counts don't add up")
	}
}

func TestFileGuideFields(t *testing.T) {
	guide := &FileGuide{
		Path:           "/path/to/file.yaml",
		ArtifactType:   "feature_definition",
		SchemaVersion:  "2.1.0",
		CurrentVersion: "1.8.0",
		TargetVersion:  "2.1.0",
		Priority:       "high",
		Changes: []Change{
			{
				Type:           ChangeAddField,
				Path:           "meta.epf_version",
				Description:    "Add version field",
				SuggestedValue: "2.1.0",
				IsBreaking:     true,
				IsAutoFixable:  true,
			},
		},
	}

	if guide.ArtifactType != "feature_definition" {
		t.Errorf("expected artifact_type=feature_definition, got %s", guide.ArtifactType)
	}
	if len(guide.Changes) != 1 {
		t.Errorf("expected 1 change, got %d", len(guide.Changes))
	}
	if guide.Changes[0].Type != ChangeAddField {
		t.Errorf("expected change type add_field, got %s", guide.Changes[0].Type)
	}
}
