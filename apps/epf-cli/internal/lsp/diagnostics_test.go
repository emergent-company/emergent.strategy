package lsp

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	protocol "github.com/tliron/glsp/protocol_3_16"
)

func TestMapSeverity(t *testing.T) {
	tests := []struct {
		name     string
		priority validator.ErrorPriority
		want     protocol.DiagnosticSeverity
	}{
		{
			name:     "critical maps to error",
			priority: validator.PriorityCritical,
			want:     protocol.DiagnosticSeverityError,
		},
		{
			name:     "high maps to error",
			priority: validator.PriorityHigh,
			want:     protocol.DiagnosticSeverityError,
		},
		{
			name:     "medium maps to warning",
			priority: validator.PriorityMedium,
			want:     protocol.DiagnosticSeverityWarning,
		},
		{
			name:     "low maps to information",
			priority: validator.PriorityLow,
			want:     protocol.DiagnosticSeverityInformation,
		},
		{
			name:     "unknown priority defaults to warning",
			priority: validator.ErrorPriority("unknown"),
			want:     protocol.DiagnosticSeverityWarning,
		},
		{
			name:     "empty priority defaults to warning",
			priority: validator.ErrorPriority(""),
			want:     protocol.DiagnosticSeverityWarning,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mapSeverity(tt.priority)
			if got != tt.want {
				t.Errorf("mapSeverity(%q) = %d, want %d", tt.priority, got, tt.want)
			}
		})
	}
}

func TestMapEnhancedErrorToDiagnostic(t *testing.T) {
	tests := []struct {
		name           string
		err            *validator.EnhancedValidationError
		wantLine       uint32
		wantSeverity   protocol.DiagnosticSeverity
		wantCode       string
		wantMsgContain string
		wantFixHint    bool
	}{
		{
			name: "basic error at line 10",
			err: &validator.EnhancedValidationError{
				Path:      "target_users[0].name",
				Line:      10,
				ErrorType: validator.ErrorMissingRequired,
				Priority:  validator.PriorityHigh,
				Message:   "required field missing",
				FixHint:   "",
			},
			wantLine:       9, // 0-indexed
			wantSeverity:   protocol.DiagnosticSeverityError,
			wantCode:       "missing_required",
			wantMsgContain: "required field missing",
			wantFixHint:    false,
		},
		{
			name: "error at line 0 clamps to 0",
			err: &validator.EnhancedValidationError{
				Path:      "root",
				Line:      0,
				ErrorType: validator.ErrorTypeMismatch,
				Priority:  validator.PriorityCritical,
				Message:   "wrong type",
				FixHint:   "",
			},
			wantLine:       0,
			wantSeverity:   protocol.DiagnosticSeverityError,
			wantCode:       "type_mismatch",
			wantMsgContain: "wrong type",
			wantFixHint:    false,
		},
		{
			name: "error at line 1 maps to line 0",
			err: &validator.EnhancedValidationError{
				Path:      "meta",
				Line:      1,
				ErrorType: validator.ErrorInvalidEnum,
				Priority:  validator.PriorityHigh,
				Message:   "invalid enum value",
				FixHint:   "Use one of: draft, ready, in-progress",
			},
			wantLine:       0,
			wantSeverity:   protocol.DiagnosticSeverityError,
			wantCode:       "invalid_enum",
			wantMsgContain: "invalid enum value",
			wantFixHint:    true,
		},
		{
			name: "fix hint is appended to message",
			err: &validator.EnhancedValidationError{
				Path:      "status",
				Line:      5,
				ErrorType: validator.ErrorInvalidEnum,
				Priority:  validator.PriorityHigh,
				Message:   "invalid value",
				FixHint:   "Use one of: draft, ready",
			},
			wantLine:       4,
			wantSeverity:   protocol.DiagnosticSeverityError,
			wantCode:       "invalid_enum",
			wantMsgContain: "Use one of: draft, ready",
			wantFixHint:    true,
		},
		{
			name: "low priority maps to information",
			err: &validator.EnhancedValidationError{
				Path:      "extra_field",
				Line:      20,
				ErrorType: validator.ErrorUnknownField,
				Priority:  validator.PriorityLow,
				Message:   "unknown field",
				FixHint:   "",
			},
			wantLine:       19,
			wantSeverity:   protocol.DiagnosticSeverityInformation,
			wantCode:       "unknown_field",
			wantMsgContain: "unknown field",
			wantFixHint:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			diag := mapEnhancedErrorToDiagnostic(tt.err)

			// Check line (0-indexed)
			if diag.Range.Start.Line != tt.wantLine {
				t.Errorf("line: got %d, want %d", diag.Range.Start.Line, tt.wantLine)
			}

			// Check severity
			if diag.Severity == nil {
				t.Fatal("severity is nil")
			}
			if *diag.Severity != tt.wantSeverity {
				t.Errorf("severity: got %d, want %d", *diag.Severity, tt.wantSeverity)
			}

			// Check code
			if diag.Code == nil {
				t.Fatal("code is nil")
			}
			if diag.Code.Value != tt.wantCode {
				t.Errorf("code: got %q, want %q", diag.Code.Value, tt.wantCode)
			}

			// Check source
			if diag.Source == nil || *diag.Source != "epf" {
				t.Error("source should be 'epf'")
			}

			// Check message contains expected text
			if !contains(diag.Message, tt.wantMsgContain) {
				t.Errorf("message %q should contain %q", diag.Message, tt.wantMsgContain)
			}

			// Check fix hint presence
			if tt.wantFixHint && !contains(diag.Message, "💡") {
				t.Error("expected fix hint (💡) in message")
			}
			if !tt.wantFixHint && contains(diag.Message, "💡") {
				t.Error("unexpected fix hint (💡) in message")
			}

			// Range start and end should be on the same line
			if diag.Range.Start.Line != diag.Range.End.Line {
				t.Error("start and end line should match for single-line diagnostics")
			}
		})
	}
}

func TestMapValidationErrorToDiagnostic(t *testing.T) {
	tests := []struct {
		name           string
		err            *validator.ValidationError
		wantLine       uint32
		wantMsgContain string
	}{
		{
			name: "basic error with path and message",
			err: &validator.ValidationError{
				Path:    "/key_insights/0",
				Message: "expected array",
				Line:    15,
			},
			wantLine:       14, // 0-indexed
			wantMsgContain: "/key_insights/0: expected array",
		},
		{
			name: "error at line 0",
			err: &validator.ValidationError{
				Path:    "",
				Message: "invalid YAML",
				Line:    0,
			},
			wantLine:       0,
			wantMsgContain: "invalid YAML",
		},
		{
			name: "error at line 1",
			err: &validator.ValidationError{
				Path:    "root",
				Message: "missing field",
				Line:    1,
			},
			wantLine:       0, // 1-indexed to 0-indexed
			wantMsgContain: "root: missing field",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			diag := mapValidationErrorToDiagnostic(tt.err)

			// Check line
			if diag.Range.Start.Line != tt.wantLine {
				t.Errorf("line: got %d, want %d", diag.Range.Start.Line, tt.wantLine)
			}

			// All basic errors should be severity Error
			if diag.Severity == nil {
				t.Fatal("severity is nil")
			}
			if *diag.Severity != protocol.DiagnosticSeverityError {
				t.Errorf("severity: got %d, want Error", *diag.Severity)
			}

			// Check source
			if diag.Source == nil || *diag.Source != "epf" {
				t.Error("source should be 'epf'")
			}

			// Check message
			if !contains(diag.Message, tt.wantMsgContain) {
				t.Errorf("message %q should contain %q", diag.Message, tt.wantMsgContain)
			}

			// No code on basic diagnostics
			if diag.Code != nil {
				t.Error("basic diagnostics should not have a code")
			}
		})
	}
}

func TestStrPtr(t *testing.T) {
	s := strPtr("hello")
	if s == nil {
		t.Fatal("strPtr returned nil")
	}
	if *s != "hello" {
		t.Errorf("got %q, want %q", *s, "hello")
	}
}

func contains(s, substr string) bool {
	return len(substr) > 0 && len(s) >= len(substr) && containsStr(s, substr)
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
