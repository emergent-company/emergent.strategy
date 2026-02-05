package validator

import (
	"encoding/json"
	"testing"
)

// TestSchemaIntrospector tests the schema introspection functionality
func TestSchemaIntrospector(t *testing.T) {
	// Sample schema for testing
	sampleSchema := `{
		"type": "object",
		"properties": {
			"name": {"type": "string", "minLength": 5},
			"status": {"type": "string", "enum": ["active", "inactive", "pending"]},
			"items": {
				"type": "array",
				"items": {
					"type": "object",
					"required": ["id", "value"],
					"properties": {
						"id": {"type": "string"},
						"value": {"type": "integer"},
						"optional_field": {"type": "boolean"}
					}
				}
			},
			"nested": {
				"type": "object",
				"properties": {
					"deep": {
						"type": "object",
						"required": ["required_field"],
						"properties": {
							"required_field": {"type": "string"},
							"optional_field": {"type": "number"}
						}
					}
				}
			}
		},
		"required": ["name", "items"]
	}`

	schemas := map[string]json.RawMessage{
		"test_schema.json": json.RawMessage(sampleSchema),
	}
	introspector := NewSchemaIntrospector(schemas)

	t.Run("ExtractRootStructure", func(t *testing.T) {
		structure := introspector.ExtractExpectedStructure("test_schema.json", "/")
		if structure == nil {
			t.Fatal("Expected structure at root, got nil")
		}
		if _, ok := structure["name"]; !ok {
			t.Error("Expected 'name' field in structure")
		}
		if _, ok := structure["items"]; !ok {
			t.Error("Expected 'items' field in structure")
		}
	})

	t.Run("ExtractArrayItemStructure", func(t *testing.T) {
		structure := introspector.ExtractExpectedStructure("test_schema.json", "/items/0")
		if structure == nil {
			t.Fatal("Expected structure for array item, got nil")
		}
		if _, ok := structure["id"]; !ok {
			t.Error("Expected 'id' field in array item structure")
		}
		if _, ok := structure["value"]; !ok {
			t.Error("Expected 'value' field in array item structure")
		}
	})

	t.Run("ExtractNestedObjectStructure", func(t *testing.T) {
		structure := introspector.ExtractExpectedStructure("test_schema.json", "/nested/deep")
		if structure == nil {
			t.Fatal("Expected structure for nested object, got nil")
		}
		if _, ok := structure["required_field"]; !ok {
			t.Error("Expected 'required_field' in nested structure")
		}
		// Check that required indicator is present
		if desc, ok := structure["required_field"]; ok {
			if !containsSubstring(desc, "required") {
				t.Errorf("Expected 'required' marker in description, got: %s", desc)
			}
		}
	})

	t.Run("NonexistentPath", func(t *testing.T) {
		structure := introspector.ExtractExpectedStructure("test_schema.json", "/nonexistent/path")
		if structure != nil {
			t.Error("Expected nil for nonexistent path")
		}
	})

	t.Run("NonexistentSchema", func(t *testing.T) {
		structure := introspector.ExtractExpectedStructure("nonexistent.json", "/")
		if structure != nil {
			t.Error("Expected nil for nonexistent schema")
		}
	})
}

// TestDescribeType tests type description generation
func TestDescribeType(t *testing.T) {
	introspector := NewSchemaIntrospector(nil)

	tests := []struct {
		name     string
		prop     *SchemaProperty
		contains string
	}{
		{
			name:     "string type",
			prop:     &SchemaProperty{Type: "string"},
			contains: "string",
		},
		{
			name:     "string with minLength",
			prop:     &SchemaProperty{Type: "string", MinLength: intPtr(10)},
			contains: "min:10",
		},
		{
			name:     "enum type",
			prop:     &SchemaProperty{Enum: []interface{}{"a", "b", "c"}},
			contains: "enum: a|b|c",
		},
		{
			name:     "array of strings",
			prop:     &SchemaProperty{Type: "array", Items: &SchemaProperty{Type: "string"}},
			contains: "array of string",
		},
		{
			name: "object with properties",
			prop: &SchemaProperty{Type: "object", Properties: map[string]SchemaProperty{
				"foo": {Type: "string"},
				"bar": {Type: "number"},
			}},
			contains: "object",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			desc := introspector.describeType(tt.prop)
			if !containsSubstring(desc, tt.contains) {
				t.Errorf("describeType() = %q, should contain %q", desc, tt.contains)
			}
		})
	}
}

// TestNavigateToPath tests path navigation in schemas
func TestNavigateToPath(t *testing.T) {
	schema := &SchemaProperty{
		Type: "object",
		Properties: map[string]SchemaProperty{
			"level1": {
				Type: "object",
				Properties: map[string]SchemaProperty{
					"level2": {Type: "string"},
				},
			},
			"array_field": {
				Type: "array",
				Items: &SchemaProperty{
					Type: "object",
					Properties: map[string]SchemaProperty{
						"item_prop": {Type: "string"},
					},
				},
			},
		},
	}

	introspector := NewSchemaIntrospector(nil)

	tests := []struct {
		path    string
		wantNil bool
	}{
		{"/", false},
		{"/level1", false},
		{"/level1/level2", false},
		{"/array_field/0", false},
		{"/array_field/0/item_prop", false},
		{"/nonexistent", true},
		{"/level1/nonexistent", true},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := introspector.navigateToPath(schema, tt.path)
			if tt.wantNil && result != nil {
				t.Errorf("navigateToPath(%q) = non-nil, want nil", tt.path)
			}
			if !tt.wantNil && result == nil {
				t.Errorf("navigateToPath(%q) = nil, want non-nil", tt.path)
			}
		})
	}
}

// Helper function to create int pointer
func intPtr(i int) *int {
	return &i
}
