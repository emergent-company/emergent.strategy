package fixplan

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
)

func TestNewGenerator(t *testing.T) {
	t.Run("default options", func(t *testing.T) {
		gen := NewGenerator(GeneratorOptions{})
		if gen.options.MaxErrorsPerChunk != DefaultMaxErrorsPerChunk {
			t.Errorf("MaxErrorsPerChunk = %d, want %d", gen.options.MaxErrorsPerChunk, DefaultMaxErrorsPerChunk)
		}
		if gen.options.MaxCharsPerChunk != DefaultMaxCharsPerChunk {
			t.Errorf("MaxCharsPerChunk = %d, want %d", gen.options.MaxCharsPerChunk, DefaultMaxCharsPerChunk)
		}
	})

	t.Run("custom options", func(t *testing.T) {
		gen := NewGenerator(GeneratorOptions{
			MaxErrorsPerChunk: 5,
			MaxCharsPerChunk:  3000,
		})
		if gen.options.MaxErrorsPerChunk != 5 {
			t.Errorf("MaxErrorsPerChunk = %d, want 5", gen.options.MaxErrorsPerChunk)
		}
		if gen.options.MaxCharsPerChunk != 3000 {
			t.Errorf("MaxCharsPerChunk = %d, want 3000", gen.options.MaxCharsPerChunk)
		}
	})
}

func TestGenerate_EmptyResult(t *testing.T) {
	gen := NewGenerator(GeneratorOptions{})

	result := &validator.AIFriendlyResult{
		File:         "/path/to/file.yaml",
		ArtifactType: "test_artifact",
		Valid:        true,
		ErrorCount:   0,
	}

	plan := gen.Generate(result)

	if plan.TotalErrors != 0 {
		t.Errorf("TotalErrors = %d, want 0", plan.TotalErrors)
	}
	if plan.TotalChunks != 0 {
		t.Errorf("TotalChunks = %d, want 0", plan.TotalChunks)
	}
	if plan.EstimatedTime != "0 minutes" {
		t.Errorf("EstimatedTime = %q, want %q", plan.EstimatedTime, "0 minutes")
	}
}

func TestGenerate_WithErrors(t *testing.T) {
	gen := NewGenerator(GeneratorOptions{MaxErrorsPerChunk: 5})

	// Create test errors
	errors := []*validator.EnhancedValidationError{
		{
			Path:      "target_users[0].name",
			ErrorType: validator.ErrorMissingRequired,
			Priority:  validator.PriorityCritical,
			Message:   "Missing required field",
			Details: validator.ErrorDetails{
				MissingFields: []string{"name"},
			},
			FixHint: "Add the required field 'name'",
		},
		{
			Path:      "target_users[0].problems[0].severity",
			ErrorType: validator.ErrorInvalidEnum,
			Priority:  validator.PriorityHigh,
			Message:   "Invalid enum value",
			Details: validator.ErrorDetails{
				AllowedValues: []string{"critical", "high", "medium", "low"},
			},
			FixHint: "Use one of the allowed values",
		},
	}

	sections := []*validator.SectionErrors{
		{
			Section:    "target_users",
			ErrorCount: 2,
			Errors:     errors,
		},
	}

	result := &validator.AIFriendlyResult{
		File:            "/path/to/file.yaml",
		ArtifactType:    "insight_analyses",
		Valid:           false,
		ErrorCount:      2,
		ErrorsBySection: sections,
	}

	plan := gen.Generate(result)

	if plan.TotalErrors != 2 {
		t.Errorf("TotalErrors = %d, want 2", plan.TotalErrors)
	}
	if plan.TotalChunks == 0 {
		t.Error("TotalChunks = 0, want > 0")
	}
	if len(plan.Chunks) == 0 {
		t.Error("Chunks is empty, want at least one chunk")
	}
}

func TestGetChunkPriority(t *testing.T) {
	tests := []struct {
		errType  validator.ErrorType
		expected ChunkPriority
	}{
		{validator.ErrorTypeMismatch, ChunkPriorityUrgent},
		{validator.ErrorMissingRequired, ChunkPriorityUrgent},
		{validator.ErrorInvalidEnum, ChunkPriorityNormal},
		{validator.ErrorPatternMismatch, ChunkPriorityNormal},
		{validator.ErrorConstraintViolation, ChunkPriorityNormal},
		{validator.ErrorUnknownField, ChunkPriorityLow},
		{validator.ErrorUnknown, ChunkPriorityNormal},
	}

	for _, tt := range tests {
		t.Run(string(tt.errType), func(t *testing.T) {
			got := getChunkPriority(tt.errType)
			if got != tt.expected {
				t.Errorf("getChunkPriority(%s) = %s, want %s", tt.errType, got, tt.expected)
			}
		})
	}
}

func TestEstimateTime(t *testing.T) {
	tests := []struct {
		chunks   int
		contains string
	}{
		{0, "0 minutes"},
		{1, "under 5 minutes"},
		{2, "under 5 minutes"},
		{5, "10 minutes"},
		{30, "hour"}, // 60 minutes = 1 hour
	}

	for _, tt := range tests {
		t.Run(itoa(tt.chunks)+"_chunks", func(t *testing.T) {
			got := estimateTime(tt.chunks)
			if !containsString(got, tt.contains) {
				t.Errorf("estimateTime(%d) = %q, want to contain %q", tt.chunks, got, tt.contains)
			}
		})
	}
}

func TestChunkingSplitsLargeSection(t *testing.T) {
	gen := NewGenerator(GeneratorOptions{MaxErrorsPerChunk: 3})

	// Create 10 errors of the same type
	var errors []*validator.EnhancedValidationError
	for i := 0; i < 10; i++ {
		errors = append(errors, &validator.EnhancedValidationError{
			Path:      "items[" + itoa(i) + "].field",
			ErrorType: validator.ErrorTypeMismatch,
			Priority:  validator.PriorityCritical,
			Message:   "Type mismatch",
			FixHint:   "Fix it",
		})
	}

	sections := []*validator.SectionErrors{
		{
			Section:    "items",
			ErrorCount: 10,
			Errors:     errors,
		},
	}

	result := &validator.AIFriendlyResult{
		File:            "/path/to/file.yaml",
		ArtifactType:    "test",
		Valid:           false,
		ErrorCount:      10,
		ErrorsBySection: sections,
	}

	plan := gen.Generate(result)

	// With max 3 errors per chunk, we should get at least 4 chunks
	if plan.TotalChunks < 4 {
		t.Errorf("TotalChunks = %d, want >= 4 (10 errors / 3 per chunk)", plan.TotalChunks)
	}

	// Verify all errors are accounted for
	totalErrors := 0
	for _, chunk := range plan.Chunks {
		totalErrors += chunk.ErrorCount
	}
	if totalErrors != 10 {
		t.Errorf("Total errors in chunks = %d, want 10", totalErrors)
	}
}

func TestChunkSorting(t *testing.T) {
	gen := NewGenerator(GeneratorOptions{})

	// Create errors with different priorities
	errors := []*validator.EnhancedValidationError{
		{
			Path:      "field1",
			ErrorType: validator.ErrorUnknownField, // Low priority
			Priority:  validator.PriorityLow,
			Message:   "Unknown field",
			FixHint:   "Remove it",
		},
		{
			Path:      "field2",
			ErrorType: validator.ErrorTypeMismatch, // Critical/Urgent
			Priority:  validator.PriorityCritical,
			Message:   "Type mismatch",
			FixHint:   "Fix type",
		},
		{
			Path:      "field3",
			ErrorType: validator.ErrorInvalidEnum, // Normal priority
			Priority:  validator.PriorityHigh,
			Message:   "Invalid enum",
			FixHint:   "Fix enum",
		},
	}

	sections := []*validator.SectionErrors{
		{
			Section:    "test",
			ErrorCount: 3,
			Errors:     errors,
		},
	}

	result := &validator.AIFriendlyResult{
		File:            "/path/to/file.yaml",
		ArtifactType:    "test",
		Valid:           false,
		ErrorCount:      3,
		ErrorsBySection: sections,
	}

	plan := gen.Generate(result)

	if len(plan.Chunks) == 0 {
		t.Fatal("No chunks generated")
	}

	// First chunk should be urgent priority
	if plan.Chunks[0].Priority != ChunkPriorityUrgent {
		t.Errorf("First chunk priority = %s, want %s", plan.Chunks[0].Priority, ChunkPriorityUrgent)
	}

	// Last chunk should be low priority (if we have multiple chunks)
	if len(plan.Chunks) > 1 {
		lastIdx := len(plan.Chunks) - 1
		if plan.Chunks[lastIdx].Priority != ChunkPriorityLow {
			t.Errorf("Last chunk priority = %s, want %s", plan.Chunks[lastIdx].Priority, ChunkPriorityLow)
		}
	}
}

func TestEstimateErrorSize(t *testing.T) {
	simple := &validator.EnhancedValidationError{
		Path:    "field",
		Message: "Error",
		FixHint: "Fix it",
	}

	complex := &validator.EnhancedValidationError{
		Path:    "very.long.nested.path.to.field",
		Message: "This is a much longer error message with more details",
		FixHint: "Here is a detailed fix hint with instructions",
		Details: validator.ErrorDetails{
			AllowedValues: []string{"value1", "value2", "value3", "value4"},
			MissingFields: []string{"field1", "field2"},
			ExpectedStructure: map[string]string{
				"name":        "string",
				"description": "string",
				"count":       "integer",
			},
		},
	}

	simpleSize := estimateErrorSize(simple)
	complexSize := estimateErrorSize(complex)

	if complexSize <= simpleSize {
		t.Errorf("Complex error size (%d) should be > simple error size (%d)", complexSize, simpleSize)
	}
}

func TestFormatChunkID(t *testing.T) {
	tests := []struct {
		id       int
		expected string
	}{
		{1, "chunk-1"},
		{10, "chunk-10"},
		{100, "chunk-100"},
	}

	for _, tt := range tests {
		t.Run(itoa(tt.id), func(t *testing.T) {
			got := formatChunkID(tt.id)
			if got != tt.expected {
				t.Errorf("formatChunkID(%d) = %q, want %q", tt.id, got, tt.expected)
			}
		})
	}
}

// Helper function
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && containsStringHelper(s, substr)))
}

func containsStringHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
