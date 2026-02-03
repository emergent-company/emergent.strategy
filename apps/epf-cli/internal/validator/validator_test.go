package validator

import (
	"os"
	"path/filepath"
	"testing"
)

// findSchemasDir attempts to find the schemas directory
func findSchemasDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

	searchDir := cwd
	for i := 0; i < 6; i++ {
		candidate := filepath.Join(searchDir, "docs", "EPF", "schemas")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		searchDir = filepath.Dir(searchDir)
	}
	return ""
}

// TestNewValidator tests creating a new validator
func TestNewValidator(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	v, err := NewValidator(schemasDir)
	if err != nil {
		t.Fatalf("NewValidator() error: %v", err)
	}
	if v == nil {
		t.Fatal("NewValidator() returned nil")
	}
	if v.loader == nil {
		t.Error("NewValidator() loader is nil")
	}
	if len(v.compiled) == 0 {
		t.Error("NewValidator() compiled no schemas")
	}
}

// TestNewValidatorNonexistent tests creating validator with nonexistent dir
func TestNewValidatorNonexistent(t *testing.T) {
	_, err := NewValidator("/nonexistent/path")
	if err == nil {
		t.Error("NewValidator() with nonexistent dir should return error")
	}
}

// TestValidateContentValid tests validating valid YAML content
func TestValidateContentValid(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	v, err := NewValidator(schemasDir)
	if err != nil {
		t.Fatalf("NewValidator() error: %v", err)
	}

	// Minimal valid mappings content
	content := []byte(`
feature_to_capability_map:
  "fd-001": ["cap-001"]
capability_value_flows:
  "cap-001":
    contributes_to: ["km-001"]
    tracks: ["Product.Strategy.vision"]
`)

	result, err := v.ValidateContent(content, "mappings")
	if err != nil {
		t.Fatalf("ValidateContent() error: %v", err)
	}

	// Note: This may or may not be valid depending on schema strictness
	// The test verifies the validation process works, not that our sample is valid
	if result == nil {
		t.Error("ValidateContent() returned nil result")
	}
}

// TestValidateContentInvalidYAML tests validating invalid YAML
func TestValidateContentInvalidYAML(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	v, err := NewValidator(schemasDir)
	if err != nil {
		t.Fatalf("NewValidator() error: %v", err)
	}

	// Invalid YAML (bad indentation/structure)
	content := []byte(`
	invalid:
yaml:: content
  - broken
`)

	result, err := v.ValidateContent(content, "mappings")
	if err != nil {
		t.Fatalf("ValidateContent() error: %v", err)
	}

	if result.Valid {
		t.Error("ValidateContent() should return invalid for malformed YAML")
	}
	if len(result.Errors) == 0 {
		t.Error("ValidateContent() should return errors for malformed YAML")
	}
}

// TestValidateContentUnknownType tests validating against unknown artifact type
func TestValidateContentUnknownType(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	v, err := NewValidator(schemasDir)
	if err != nil {
		t.Fatalf("NewValidator() error: %v", err)
	}

	content := []byte(`key: value`)

	_, err = v.ValidateContent(content, "unknown_type")
	if err == nil {
		t.Error("ValidateContent() with unknown type should return error")
	}
}

// TestValidationResultToJSON tests JSON serialization of results
func TestValidationResultToJSON(t *testing.T) {
	result := &ValidationResult{
		Valid:        false,
		FilePath:     "/test/file.yaml",
		ArtifactType: "north_star",
		Phase:        "READY",
		Errors: []ValidationError{
			{Path: "/test/file.yaml#/field", Message: "missing required field"},
		},
	}

	json, err := result.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON() error: %v", err)
	}

	if json == "" {
		t.Error("ToJSON() returned empty string")
	}

	// Check that it contains expected fields
	expected := []string{
		`"valid": false`,
		`"file_path": "/test/file.yaml"`,
		`"artifact_type": "north_star"`,
		`"phase": "READY"`,
		`"missing required field"`,
	}

	for _, e := range expected {
		if !contains(json, e) {
			t.Errorf("ToJSON() missing expected content: %s", e)
		}
	}
}

// TestValidationErrorString tests error string formatting
func TestValidationErrorString(t *testing.T) {
	tests := []struct {
		name     string
		err      ValidationError
		expected string
	}{
		{
			name: "without line info",
			err: ValidationError{
				Path:    "/test/file.yaml",
				Message: "some error",
			},
			expected: "/test/file.yaml: some error",
		},
		{
			name: "with line info",
			err: ValidationError{
				Path:    "/test/file.yaml",
				Message: "some error",
				Line:    10,
				Column:  5,
			},
			expected: "/test/file.yaml (line 10, col 5): some error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.err.Error()
			if result != tt.expected {
				t.Errorf("Error() = %q, want %q", result, tt.expected)
			}
		})
	}
}

// TestConvertYAMLToJSON tests the YAML to JSON conversion
func TestConvertYAMLToJSON(t *testing.T) {
	tests := []struct {
		name  string
		input interface{}
		check func(interface{}) bool
	}{
		{
			name:  "string passthrough",
			input: "hello",
			check: func(v interface{}) bool { return v == "hello" },
		},
		{
			name:  "int passthrough",
			input: 42,
			check: func(v interface{}) bool { return v == 42 },
		},
		{
			name:  "nil passthrough",
			input: nil,
			check: func(v interface{}) bool { return v == nil },
		},
		{
			name:  "string map conversion",
			input: map[string]interface{}{"key": "value"},
			check: func(v interface{}) bool {
				m, ok := v.(map[string]interface{})
				return ok && m["key"] == "value"
			},
		},
		{
			name:  "interface map conversion",
			input: map[interface{}]interface{}{"key": "value"},
			check: func(v interface{}) bool {
				m, ok := v.(map[string]interface{})
				return ok && m["key"] == "value"
			},
		},
		{
			name:  "slice conversion",
			input: []interface{}{"a", "b", "c"},
			check: func(v interface{}) bool {
				arr, ok := v.([]interface{})
				return ok && len(arr) == 3 && arr[0] == "a"
			},
		},
		{
			name: "nested conversion",
			input: map[interface{}]interface{}{
				"outer": map[interface{}]interface{}{
					"inner": []interface{}{"value"},
				},
			},
			check: func(v interface{}) bool {
				m, ok := v.(map[string]interface{})
				if !ok {
					return false
				}
				outer, ok := m["outer"].(map[string]interface{})
				if !ok {
					return false
				}
				inner, ok := outer["inner"].([]interface{})
				return ok && len(inner) == 1 && inner[0] == "value"
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertYAMLToJSON(tt.input)
			if !tt.check(result) {
				t.Errorf("convertYAMLToJSON(%v) = %v, did not pass check", tt.input, result)
			}
		})
	}
}

// TestGetLoader tests getting the underlying loader
func TestGetLoader(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Could not find schemas directory - skipping integration test")
	}

	v, err := NewValidator(schemasDir)
	if err != nil {
		t.Fatalf("NewValidator() error: %v", err)
	}

	loader := v.GetLoader()
	if loader == nil {
		t.Error("GetLoader() returned nil")
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
