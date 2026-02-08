package validator

import (
	"testing"
)

// TestJsonPointerToPath tests conversion of JSON pointers to human-readable paths
func TestJsonPointerToPath(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty pointer",
			input:    "",
			expected: "(root)",
		},
		{
			name:     "root pointer",
			input:    "/",
			expected: "(root)",
		},
		{
			name:     "simple field",
			input:    "/name",
			expected: "name",
		},
		{
			name:     "nested fields",
			input:    "/meta/version",
			expected: "meta.version",
		},
		{
			name:     "array index",
			input:    "/items/0",
			expected: "items[0]",
		},
		{
			name:     "array with field",
			input:    "/key_insights/0/insight",
			expected: "key_insights[0].insight",
		},
		{
			name:     "nested arrays",
			input:    "/target_users/0/problems/0/severity",
			expected: "target_users[0].problems[0].severity",
		},
		{
			name:     "deep nesting",
			input:    "/a/0/b/1/c/2/d",
			expected: "a[0].b[1].c[2].d",
		},
		{
			name:     "array at end",
			input:    "/items/0/subitems/1",
			expected: "items[0].subitems[1]",
		},
		{
			name:     "multiple fields then array",
			input:    "/definition/personas/0/name",
			expected: "definition.personas[0].name",
		},
		{
			name:     "double-digit index",
			input:    "/items/10/name",
			expected: "items[10].name",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := jsonPointerToPath(tt.input)
			if result != tt.expected {
				t.Errorf("jsonPointerToPath(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// TestIsNumeric tests the numeric string detection
func TestIsNumeric(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"0", true},
		{"1", true},
		{"10", true},
		{"123", true},
		{"", false},
		{"a", false},
		{"1a", false},
		{"a1", false},
		{"-1", false},
		{"1.0", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := isNumeric(tt.input)
			if result != tt.expected {
				t.Errorf("isNumeric(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

// TestClassifyError tests error classification
func TestClassifyError(t *testing.T) {
	tests := []struct {
		name         string
		message      string
		expectedType ErrorType
	}{
		{
			name:         "type mismatch object/string",
			message:      "expected object, but got string",
			expectedType: ErrorTypeMismatch,
		},
		{
			name:         "type mismatch array/string",
			message:      "expected array, but got string",
			expectedType: ErrorTypeMismatch,
		},
		{
			name:         "missing properties",
			message:      "missing properties: 'name', 'description'",
			expectedType: ErrorMissingRequired,
		},
		{
			name:         "invalid enum",
			message:      "value must be one of \"critical\", \"high\", \"medium\", \"low\"",
			expectedType: ErrorInvalidEnum,
		},
		{
			name:         "min length constraint",
			message:      "length must be >= 30, but got 4",
			expectedType: ErrorConstraintViolation,
		},
		{
			name:         "max length constraint",
			message:      "length must be <= 100, but got 150",
			expectedType: ErrorConstraintViolation,
		},
		{
			name:         "min items constraint",
			message:      "minimum 4 items required, but found 2",
			expectedType: ErrorConstraintViolation,
		},
		{
			name:         "additional properties",
			message:      "additionalProperties 'unknown_field' not allowed",
			expectedType: ErrorUnknownField,
		},
		{
			name:         "pattern mismatch",
			message:      "does not match pattern '^[a-z]+$'",
			expectedType: ErrorPatternMismatch,
		},
		{
			name:         "unknown error",
			message:      "some random error message",
			expectedType: ErrorUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			enhanced := &EnhancedValidationError{}
			classifyError(enhanced, tt.message)
			if enhanced.ErrorType != tt.expectedType {
				t.Errorf("classifyError(%q) type = %q, want %q", tt.message, enhanced.ErrorType, tt.expectedType)
			}
		})
	}
}

// TestGetPriority tests priority assignment for error types
func TestGetPriority(t *testing.T) {
	tests := []struct {
		errorType ErrorType
		expected  ErrorPriority
	}{
		{ErrorTypeMismatch, PriorityCritical},
		{ErrorMissingRequired, PriorityCritical},
		{ErrorInvalidEnum, PriorityHigh},
		{ErrorPatternMismatch, PriorityHigh},
		{ErrorConstraintViolation, PriorityMedium},
		{ErrorUnknownField, PriorityLow},
		{ErrorUnknown, PriorityMedium},
	}

	for _, tt := range tests {
		t.Run(string(tt.errorType), func(t *testing.T) {
			result := getPriority(tt.errorType)
			if result != tt.expected {
				t.Errorf("getPriority(%q) = %q, want %q", tt.errorType, result, tt.expected)
			}
		})
	}
}

// TestGetTopLevelSection tests extraction of top-level section from path
func TestGetTopLevelSection(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"(root)", "(root)"},
		{"", "(root)"},
		{"name", "name"},
		{"meta.version", "meta"},
		{"items[0]", "items"},
		{"target_users[0].problems[0].severity", "target_users"},
		{"definition.personas[0].name", "definition"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := GetTopLevelSection(tt.path)
			if result != tt.expected {
				t.Errorf("GetTopLevelSection(%q) = %q, want %q", tt.path, result, tt.expected)
			}
		})
	}
}

// TestGroupErrorsBySection tests error grouping
func TestGroupErrorsBySection(t *testing.T) {
	errors := []*EnhancedValidationError{
		{Path: "meta.version", Priority: PriorityMedium},
		{Path: "items[0].name", Priority: PriorityCritical},
		{Path: "items[1].name", Priority: PriorityCritical},
		{Path: "definition.field", Priority: PriorityHigh},
	}

	sections := GroupErrorsBySection(errors)

	// Should have 3 sections
	if len(sections) != 3 {
		t.Errorf("GroupErrorsBySection() returned %d sections, want 3", len(sections))
	}

	// First section should be items (2 errors, sorted by count)
	if len(sections) > 0 && sections[0].Section != "items" {
		t.Errorf("First section = %q, want 'items'", sections[0].Section)
	}
	if len(sections) > 0 && sections[0].ErrorCount != 2 {
		t.Errorf("First section error count = %d, want 2", sections[0].ErrorCount)
	}
}

// TestCreateAIFriendlyResult tests the full result creation
func TestCreateAIFriendlyResult(t *testing.T) {
	errors := []*EnhancedValidationError{
		{Path: "meta.version", Priority: PriorityCritical, ErrorType: ErrorTypeMismatch},
		{Path: "items[0].name", Priority: PriorityHigh, ErrorType: ErrorInvalidEnum},
		{Path: "items[1].name", Priority: PriorityMedium, ErrorType: ErrorConstraintViolation},
		{Path: "other.field", Priority: PriorityLow, ErrorType: ErrorUnknownField},
	}

	result := CreateAIFriendlyResult("/test/file.yaml", "insight_analyses", errors)

	if result.Valid {
		t.Error("Result should be invalid when there are errors")
	}
	if result.ErrorCount != 4 {
		t.Errorf("ErrorCount = %d, want 4", result.ErrorCount)
	}
	if result.File != "/test/file.yaml" {
		t.Errorf("File = %q, want '/test/file.yaml'", result.File)
	}
	if result.ArtifactType != "insight_analyses" {
		t.Errorf("ArtifactType = %q, want 'insight_analyses'", result.ArtifactType)
	}

	// Check summary counts
	if result.Summary.CriticalCount != 1 {
		t.Errorf("CriticalCount = %d, want 1", result.Summary.CriticalCount)
	}
	if result.Summary.HighCount != 1 {
		t.Errorf("HighCount = %d, want 1", result.Summary.HighCount)
	}
	if result.Summary.MediumCount != 1 {
		t.Errorf("MediumCount = %d, want 1", result.Summary.MediumCount)
	}
	if result.Summary.LowCount != 1 {
		t.Errorf("LowCount = %d, want 1", result.Summary.LowCount)
	}
}

// TestGenerateFixHint tests fix hint generation
func TestGenerateFixHint(t *testing.T) {
	tests := []struct {
		name     string
		enhanced *EnhancedValidationError
		contains string // Check that hint contains this substring
	}{
		{
			name: "type mismatch object->string",
			enhanced: &EnhancedValidationError{
				ErrorType: ErrorTypeMismatch,
				Details:   ErrorDetails{ExpectedType: "object", ActualType: "string"},
			},
			contains: "Convert string to object",
		},
		{
			name: "type mismatch array->string",
			enhanced: &EnhancedValidationError{
				ErrorType: ErrorTypeMismatch,
				Details:   ErrorDetails{ExpectedType: "array", ActualType: "string"},
			},
			contains: "array format",
		},
		{
			name: "missing required single",
			enhanced: &EnhancedValidationError{
				ErrorType: ErrorMissingRequired,
				Details:   ErrorDetails{MissingFields: []string{"name"}},
			},
			contains: "Add the required field",
		},
		{
			name: "missing required multiple",
			enhanced: &EnhancedValidationError{
				ErrorType: ErrorMissingRequired,
				Details:   ErrorDetails{MissingFields: []string{"name", "description"}},
			},
			contains: "Add all missing required fields",
		},
		{
			name: "invalid enum",
			enhanced: &EnhancedValidationError{
				ErrorType: ErrorInvalidEnum,
				Details:   ErrorDetails{AllowedValues: []string{"a", "b", "c"}},
			},
			contains: "allowed values",
		},
		{
			name: "unknown field",
			enhanced: &EnhancedValidationError{
				ErrorType: ErrorUnknownField,
			},
			contains: "Remove unknown field",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hint := generateFixHint(tt.enhanced)
			if !containsSubstring(hint, tt.contains) {
				t.Errorf("generateFixHint() = %q, should contain %q", hint, tt.contains)
			}
		})
	}
}

// TestSuggestFixOrder tests that fix order prioritizes critical errors
func TestSuggestFixOrder(t *testing.T) {
	sections := []*SectionErrors{
		{
			Section: "low_priority",
			Errors: []*EnhancedValidationError{
				{Priority: PriorityLow},
				{Priority: PriorityLow},
			},
		},
		{
			Section: "high_priority",
			Errors: []*EnhancedValidationError{
				{Priority: PriorityCritical},
			},
		},
	}

	order := suggestFixOrder(sections)

	if len(order) != 2 {
		t.Fatalf("suggestFixOrder() returned %d items, want 2", len(order))
	}
	if order[0] != "high_priority" {
		t.Errorf("First in fix order = %q, want 'high_priority'", order[0])
	}
}

// Helper function
func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
