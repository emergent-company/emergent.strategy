package lsp

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	protocol "github.com/tliron/glsp/protocol_3_16"
	"gopkg.in/yaml.v3"
)

// --- matchDiagnosticToError ---

func TestMatchDiagnosticToError(t *testing.T) {
	errors := []*validator.EnhancedValidationError{
		{
			Path:      "status",
			ErrorType: validator.ErrorInvalidEnum,
			Priority:  validator.PriorityHigh,
			Message:   "value must be one of draft, ready",
			FixHint:   "Use one of the allowed values: draft, ready",
		},
		{
			Path:      "north_star",
			ErrorType: validator.ErrorMissingRequired,
			Priority:  validator.PriorityCritical,
			Message:   "missing required field: vision",
			FixHint:   "Add the required field 'vision'",
		},
		{
			Path:      "extra_field",
			ErrorType: validator.ErrorUnknownField,
			Priority:  validator.PriorityLow,
			Message:   "unknown field 'foo'",
		},
	}

	tests := []struct {
		name      string
		diag      protocol.Diagnostic
		wantMatch bool
		wantType  validator.ErrorType
	}{
		{
			name: "matches by code and message prefix",
			diag: protocol.Diagnostic{
				Code:    &protocol.IntegerOrString{Value: "invalid_enum"},
				Message: "value must be one of draft, ready\n💡 Use one of the allowed values: draft, ready",
			},
			wantMatch: true,
			wantType:  validator.ErrorInvalidEnum,
		},
		{
			name: "matches missing_required",
			diag: protocol.Diagnostic{
				Code:    &protocol.IntegerOrString{Value: "missing_required"},
				Message: "missing required field: vision\n💡 Add the required field 'vision'",
			},
			wantMatch: true,
			wantType:  validator.ErrorMissingRequired,
		},
		{
			name: "matches unknown_field without fix hint",
			diag: protocol.Diagnostic{
				Code:    &protocol.IntegerOrString{Value: "unknown_field"},
				Message: "unknown field 'foo'",
			},
			wantMatch: true,
			wantType:  validator.ErrorUnknownField,
		},
		{
			name: "no match — wrong code",
			diag: protocol.Diagnostic{
				Code:    &protocol.IntegerOrString{Value: "type_mismatch"},
				Message: "value must be one of draft, ready",
			},
			wantMatch: false,
		},
		{
			name: "no match — wrong message",
			diag: protocol.Diagnostic{
				Code:    &protocol.IntegerOrString{Value: "invalid_enum"},
				Message: "something completely different",
			},
			wantMatch: false,
		},
		{
			name: "no match — nil code",
			diag: protocol.Diagnostic{
				Message: "value must be one of draft, ready",
			},
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := matchDiagnosticToError(tt.diag, errors)
			if tt.wantMatch {
				if result == nil {
					t.Fatal("expected a match, got nil")
				}
				if result.ErrorType != tt.wantType {
					t.Errorf("matched wrong error type: got %q, want %q", result.ErrorType, tt.wantType)
				}
			} else {
				if result != nil {
					t.Errorf("expected no match, got %v", result.ErrorType)
				}
			}
		})
	}
}

// --- findValueRange ---

func TestFindValueRange(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		path      string
		wantNil   bool
		wantLine  uint32
		wantStart uint32
		wantEnd   uint32
	}{
		{
			name:      "simple top-level key",
			content:   "status: draft\nname: test\n",
			path:      "status",
			wantLine:  0,
			wantStart: 8,
			wantEnd:   13, // "draft" length=5
		},
		{
			name:      "nested key",
			content:   "north_star:\n  vision:\n    vision_statement: hello\n",
			path:      "north_star.vision.vision_statement",
			wantLine:  2,
			wantStart: 22,
			wantEnd:   27, // "hello" length=5
		},
		{
			name:    "non-existent path",
			content: "status: draft\n",
			path:    "nonexistent.field",
			wantNil: true,
		},
		{
			name:    "invalid YAML",
			content: "{{not yaml",
			path:    "anything",
			wantNil: true,
		},
		{
			name:    "mapping node (not scalar)",
			content: "parent:\n  child: value\n",
			path:    "parent",
			wantNil: true, // parent is a mapping, not a scalar
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := findValueRange([]byte(tt.content), tt.path)
			if tt.wantNil {
				if result != nil {
					t.Errorf("expected nil, got range at line %d", result.Start.Line)
				}
				return
			}
			if result == nil {
				t.Fatal("expected a range, got nil")
			}
			if result.Start.Line != tt.wantLine {
				t.Errorf("start line: got %d, want %d", result.Start.Line, tt.wantLine)
			}
			if result.Start.Character != tt.wantStart {
				t.Errorf("start char: got %d, want %d", result.Start.Character, tt.wantStart)
			}
			if result.End.Character != tt.wantEnd {
				t.Errorf("end char: got %d, want %d", result.End.Character, tt.wantEnd)
			}
		})
	}
}

// --- findFieldLineRange ---

func TestFindFieldLineRange(t *testing.T) {
	tests := []struct {
		name       string
		lines      []string
		parentPath string
		fieldName  string
		wantNil    bool
		wantStart  uint32
		wantEnd    uint32
	}{
		{
			name:       "simple single-line field",
			lines:      []string{"name: test", "status: draft", "slug: my-slug"},
			parentPath: "",
			fieldName:  "status",
			wantStart:  1,
			wantEnd:    2,
		},
		{
			name: "multi-line block scalar",
			lines: []string{
				"name: test",
				"description: |",
				"  This is a long",
				"  description text",
				"status: draft",
			},
			parentPath: "",
			fieldName:  "description",
			wantStart:  1,
			wantEnd:    4, // includes the indented continuation lines
		},
		{
			name: "nested object field",
			lines: []string{
				"parent:",
				"  child1: value1",
				"  child2:",
				"    grandchild: value",
				"  child3: value3",
			},
			parentPath: "parent",
			fieldName:  "child2",
			wantStart:  2,
			wantEnd:    4, // includes the indented grandchild
		},
		{
			name:       "field not found",
			lines:      []string{"name: test", "status: draft"},
			parentPath: "",
			fieldName:  "nonexistent",
			wantNil:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := findFieldLineRange(tt.lines, tt.parentPath, tt.fieldName)
			if tt.wantNil {
				if result != nil {
					t.Errorf("expected nil, got range %d-%d", result.Start.Line, result.End.Line)
				}
				return
			}
			if result == nil {
				t.Fatal("expected a range, got nil")
			}
			if result.Start.Line != tt.wantStart {
				t.Errorf("start line: got %d, want %d", result.Start.Line, tt.wantStart)
			}
			if result.End.Line != tt.wantEnd {
				t.Errorf("end line: got %d, want %d", result.End.Line, tt.wantEnd)
			}
		})
	}
}

// --- buildMissingFieldsYAML ---

func TestBuildMissingFieldsYAML(t *testing.T) {
	tests := []struct {
		name   string
		fields []string
		indent int
		check  func(t *testing.T, result string)
	}{
		{
			name:   "single field at indent 0",
			fields: []string{"name"},
			indent: 0,
			check: func(t *testing.T, result string) {
				if !strings.Contains(result, "name: \"TODO\"") {
					t.Errorf("expected 'name: \"TODO\"', got %q", result)
				}
			},
		},
		{
			name:   "multiple fields at indent 2",
			fields: []string{"name", "description", "values"},
			indent: 2,
			check: func(t *testing.T, result string) {
				if !strings.Contains(result, "  name: \"TODO\"") {
					t.Errorf("expected indented 'name: \"TODO\"', got %q", result)
				}
				if !strings.Contains(result, "  description: \"TODO\"") {
					t.Errorf("expected indented 'description: \"TODO\"', got %q", result)
				}
				// "values" ends in 's' — should be array
				if !strings.Contains(result, "  values:") {
					t.Errorf("expected 'values:' field, got %q", result)
				}
			},
		},
		{
			name:   "array-like fields",
			fields: []string{"items", "details"},
			indent: 4,
			check: func(t *testing.T, result string) {
				// "items" is a plural → array
				if !strings.Contains(result, "    items:") {
					t.Errorf("expected indented items field, got %q", result)
				}
				// "details" is a special object field
				if !strings.Contains(result, "    details: {}") {
					t.Errorf("expected 'details: {}', got %q", result)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildMissingFieldsYAML(tt.fields, tt.indent)
			tt.check(t, result)
		})
	}
}

// --- placeholderForField ---

func TestPlaceholderForField(t *testing.T) {
	tests := []struct {
		field string
		want  string
	}{
		{"name", "\"TODO\""},
		{"description", "\"TODO\""},
		{"meta", "{}"},
		{"metadata", "{}"},
		{"details", "{}"},
		{"context", "{}"},
		{"config", "{}"},
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			got := placeholderForField(tt.field)
			if got != tt.want {
				t.Errorf("placeholderForField(%q) = %q, want %q", tt.field, got, tt.want)
			}
		})
	}
}

// --- splitYAMLPath ---

func TestSplitYAMLPath(t *testing.T) {
	tests := []struct {
		path string
		want []string
	}{
		{"status", []string{"status"}},
		{"north_star.vision", []string{"north_star", "vision"}},
		{"items[0].name", []string{"items", "name"}},
		{"a.b[2].c[1].d", []string{"a", "b", "c", "d"}},
		{"", nil},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := splitYAMLPath(tt.path)
			if len(got) != len(tt.want) {
				t.Fatalf("splitYAMLPath(%q) = %v, want %v", tt.path, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("splitYAMLPath(%q)[%d] = %q, want %q", tt.path, i, got[i], tt.want[i])
				}
			}
		})
	}
}

// --- isAllDigits ---

func TestIsAllDigits(t *testing.T) {
	tests := []struct {
		s    string
		want bool
	}{
		{"0", true},
		{"123", true},
		{"", false},
		{"abc", false},
		{"12a", false},
	}

	for _, tt := range tests {
		t.Run(tt.s, func(t *testing.T) {
			if got := isAllDigits(tt.s); got != tt.want {
				t.Errorf("isAllDigits(%q) = %v, want %v", tt.s, got, tt.want)
			}
		})
	}
}

// --- navigateYAMLPath ---

func TestNavigateYAMLPath(t *testing.T) {
	content := `north_star:
  vision:
    vision_statement: "We see a world..."
  mission:
    mission_statement: "To empower..."
status: draft
`
	var docNode yaml.Node
	if err := yaml.Unmarshal([]byte(content), &docNode); err != nil {
		t.Fatalf("failed to parse YAML: %v", err)
	}
	root := docNode.Content[0]

	t.Run("empty path returns root", func(t *testing.T) {
		node := navigateYAMLPath(root, "")
		if node != root {
			t.Error("empty path should return root node")
		}
	})

	t.Run("(root) returns root", func(t *testing.T) {
		node := navigateYAMLPath(root, "(root)")
		if node != root {
			t.Error("(root) should return root node")
		}
	})

	t.Run("top-level key", func(t *testing.T) {
		node := navigateYAMLPath(root, "status")
		if node == nil {
			t.Fatal("expected node for 'status'")
		}
		if node.Value != "draft" {
			t.Errorf("status value: got %q, want %q", node.Value, "draft")
		}
	})

	t.Run("nested key", func(t *testing.T) {
		node := navigateYAMLPath(root, "north_star.vision.vision_statement")
		if node == nil {
			t.Fatal("expected node for nested path")
		}
		if node.Value != "We see a world..." {
			t.Errorf("vision_statement: got %q, want %q", node.Value, "We see a world...")
		}
	})

	t.Run("non-existent path", func(t *testing.T) {
		node := navigateYAMLPath(root, "nonexistent.field")
		if node != nil {
			t.Error("expected nil for non-existent path")
		}
	})
}

// --- endOfDocumentRange ---

func TestEndOfDocumentRange(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    uint32 // expected last line
	}{
		{"empty", "", 0},
		{"single line", "hello", 0},
		{"two lines", "hello\nworld", 1},
		{"trailing newline", "hello\nworld\n", 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := endOfDocumentRange([]byte(tt.content))
			if r.Start.Line != tt.want {
				t.Errorf("endOfDocumentRange line: got %d, want %d", r.Start.Line, tt.want)
			}
		})
	}
}

// --- actionsForInvalidEnum (integration) ---

func TestActionsForInvalidEnum(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{
		URI:        "file:///project/FIRE/feature_definitions/fd-001.yaml",
		LanguageID: "yaml",
		Version:    1,
		Content:    "status: invalid_value\nname: test\n",
	}

	severity := protocol.DiagnosticSeverityError
	diag := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 80},
		},
		Severity: &severity,
		Code:     &protocol.IntegerOrString{Value: "invalid_enum"},
		Message:  "value must be one of draft, ready",
	}

	enhancedErr := &validator.EnhancedValidationError{
		Path:      "status",
		ErrorType: validator.ErrorInvalidEnum,
		Priority:  validator.PriorityHigh,
		Message:   "value must be one of draft, ready",
		FixHint:   "Use one of the allowed values: draft, ready, in-progress, delivered",
		Details: validator.ErrorDetails{
			AllowedValues: []string{"draft", "ready", "in-progress", "delivered"},
		},
	}

	actions := srv.actionsForInvalidEnum(doc.URI, doc, diag, enhancedErr)

	if len(actions) != 4 {
		t.Fatalf("expected 4 code actions (one per enum value), got %d", len(actions))
	}

	// Each action should offer a different enum value
	for i, action := range actions {
		expectedVal := enhancedErr.Details.AllowedValues[i]
		expectedTitle := "Change to '" + expectedVal + "'"
		if action.Title != expectedTitle {
			t.Errorf("action[%d] title: got %q, want %q", i, action.Title, expectedTitle)
		}
		if action.Kind == nil || *action.Kind != protocol.CodeActionKindQuickFix {
			t.Errorf("action[%d] should be QuickFix kind", i)
		}
		if action.Edit == nil {
			t.Fatalf("action[%d] should have an edit", i)
		}
		edits, ok := action.Edit.Changes[doc.URI]
		if !ok || len(edits) != 1 {
			t.Fatalf("action[%d] should have exactly 1 text edit for the URI", i)
		}
		if edits[0].NewText != expectedVal {
			t.Errorf("action[%d] edit text: got %q, want %q", i, edits[0].NewText, expectedVal)
		}
	}
}

func TestActionsForInvalidEnumNoAllowedValues(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{URI: "file:///test.yaml", Content: "key: val\n"}
	diag := protocol.Diagnostic{}
	enhancedErr := &validator.EnhancedValidationError{
		ErrorType: validator.ErrorInvalidEnum,
		Details:   validator.ErrorDetails{AllowedValues: nil},
	}

	actions := srv.actionsForInvalidEnum(doc.URI, doc, diag, enhancedErr)
	if len(actions) != 0 {
		t.Errorf("expected 0 actions when no allowed values, got %d", len(actions))
	}
}

// --- actionsForMissingRequired (integration) ---

func TestActionsForMissingRequired(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{
		URI:        "file:///project/test.yaml",
		LanguageID: "yaml",
		Version:    1,
		Content:    "north_star:\n  vision:\n    vision_statement: hello\n",
	}

	diag := protocol.Diagnostic{
		Code:    &protocol.IntegerOrString{Value: "missing_required"},
		Message: "missing required fields: purpose, mission",
	}

	enhancedErr := &validator.EnhancedValidationError{
		Path:      "north_star",
		ErrorType: validator.ErrorMissingRequired,
		Priority:  validator.PriorityCritical,
		Message:   "missing required fields: purpose, mission",
		FixHint:   "Add all missing required fields: purpose, mission",
		Details: validator.ErrorDetails{
			MissingFields: []string{"purpose", "mission"},
		},
	}

	actions := srv.actionsForMissingRequired(doc.URI, doc, diag, enhancedErr)

	if len(actions) != 1 {
		t.Fatalf("expected 1 code action for missing fields, got %d", len(actions))
	}

	action := actions[0]
	if !strings.Contains(action.Title, "2 missing fields") {
		t.Errorf("title should mention 2 missing fields, got %q", action.Title)
	}
	if action.Kind == nil || *action.Kind != protocol.CodeActionKindQuickFix {
		t.Error("action should be QuickFix kind")
	}
	if action.Edit == nil {
		t.Fatal("action should have an edit")
	}

	edits := action.Edit.Changes[doc.URI]
	if len(edits) != 1 {
		t.Fatalf("expected 1 text edit, got %d", len(edits))
	}
	if !strings.Contains(edits[0].NewText, "purpose:") {
		t.Errorf("edit should contain 'purpose:', got %q", edits[0].NewText)
	}
	if !strings.Contains(edits[0].NewText, "mission:") {
		t.Errorf("edit should contain 'mission:', got %q", edits[0].NewText)
	}
}

func TestActionsForMissingRequiredSingleField(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{
		URI:     "file:///test.yaml",
		Content: "name: test\n",
	}

	diag := protocol.Diagnostic{}
	enhancedErr := &validator.EnhancedValidationError{
		Path:      "",
		ErrorType: validator.ErrorMissingRequired,
		Details: validator.ErrorDetails{
			MissingFields: []string{"status"},
		},
	}

	actions := srv.actionsForMissingRequired(doc.URI, doc, diag, enhancedErr)
	if len(actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(actions))
	}
	if actions[0].Title != "Add missing field" {
		t.Errorf("single field title: got %q, want %q", actions[0].Title, "Add missing field")
	}
}

func TestActionsForMissingRequiredNoFields(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{URI: "file:///test.yaml", Content: "key: val\n"}
	diag := protocol.Diagnostic{}
	enhancedErr := &validator.EnhancedValidationError{
		ErrorType: validator.ErrorMissingRequired,
		Details:   validator.ErrorDetails{MissingFields: nil},
	}

	actions := srv.actionsForMissingRequired(doc.URI, doc, diag, enhancedErr)
	if len(actions) != 0 {
		t.Errorf("expected 0 actions when no missing fields, got %d", len(actions))
	}
}

// --- actionsForUnknownField (integration) ---

func TestActionsForUnknownField(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{
		URI:        "file:///project/test.yaml",
		LanguageID: "yaml",
		Version:    1,
		Content:    "name: test\nunknown_key: should_not_exist\nstatus: draft\n",
	}

	diag := protocol.Diagnostic{
		Code:    &protocol.IntegerOrString{Value: "unknown_field"},
		Message: "unknown field 'unknown_key'",
	}

	enhancedErr := &validator.EnhancedValidationError{
		Path:      "",
		ErrorType: validator.ErrorUnknownField,
		Priority:  validator.PriorityLow,
		Message:   "unknown field 'unknown_key'",
		Details: validator.ErrorDetails{
			UnknownFields: []string{"unknown_key"},
		},
	}

	actions := srv.actionsForUnknownField(doc.URI, doc, diag, enhancedErr)

	if len(actions) != 1 {
		t.Fatalf("expected 1 code action for unknown field, got %d", len(actions))
	}

	action := actions[0]
	if !strings.Contains(action.Title, "Remove unknown field 'unknown_key'") {
		t.Errorf("title should mention removing unknown_key, got %q", action.Title)
	}
	if action.Kind == nil || *action.Kind != protocol.CodeActionKindQuickFix {
		t.Error("action should be QuickFix kind")
	}
	if action.Edit == nil {
		t.Fatal("action should have an edit")
	}
	edits := action.Edit.Changes[doc.URI]
	if len(edits) != 1 {
		t.Fatalf("expected 1 text edit, got %d", len(edits))
	}
	// The edit should replace the line range with empty text (removal)
	if edits[0].NewText != "" {
		t.Errorf("edit should be empty (removal), got %q", edits[0].NewText)
	}
	// Should target line 1 (the unknown_key line)
	if edits[0].Range.Start.Line != 1 {
		t.Errorf("edit should start at line 1, got %d", edits[0].Range.Start.Line)
	}
}

func TestActionsForUnknownFieldNotFound(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{
		URI:     "file:///test.yaml",
		Content: "name: test\n",
	}

	diag := protocol.Diagnostic{}
	enhancedErr := &validator.EnhancedValidationError{
		ErrorType: validator.ErrorUnknownField,
		Details: validator.ErrorDetails{
			UnknownFields: []string{"nonexistent_in_doc"},
		},
	}

	actions := srv.actionsForUnknownField(doc.URI, doc, diag, enhancedErr)
	// Field not found in document → no actions
	if len(actions) != 0 {
		t.Errorf("expected 0 actions when field not in doc, got %d", len(actions))
	}
}

func TestActionsForUnknownFieldNoFields(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	doc := &Document{URI: "file:///test.yaml", Content: "key: val\n"}
	diag := protocol.Diagnostic{}
	enhancedErr := &validator.EnhancedValidationError{
		ErrorType: validator.ErrorUnknownField,
		Details:   validator.ErrorDetails{UnknownFields: nil},
	}

	actions := srv.actionsForUnknownField(doc.URI, doc, diag, enhancedErr)
	if len(actions) != 0 {
		t.Errorf("expected 0 actions when no unknown fields, got %d", len(actions))
	}
}

// --- findInsertPositionForMissing ---

func TestFindInsertPositionForMissing(t *testing.T) {
	content := "north_star:\n  vision:\n    vision_statement: hello\n"

	pos := findInsertPositionForMissing([]byte(content), "north_star", []string{"mission"})

	// Should point to somewhere in the north_star mapping (after vision block)
	// The exact position depends on the implementation, but it should not be 0,0
	// for a valid parent mapping
	if pos.indent < 0 {
		t.Error("indent should be non-negative")
	}
}

func TestFindInsertPositionInvalidYAML(t *testing.T) {
	pos := findInsertPositionForMissing([]byte("{{bad"), "", []string{"field"})

	// Should fall back to end of document
	if pos.indent != 0 {
		t.Errorf("expected indent 0 for invalid YAML, got %d", pos.indent)
	}
}

// --- Integration: handleTextDocumentCodeAction with real server ---

func TestHandleTextDocumentCodeActionIntegration(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Pre-populate the error cache for a document URI
	uri := "file:///project/FIRE/feature_definitions/fd-001.yaml"
	doc := &Document{
		URI:        uri,
		LanguageID: "yaml",
		Version:    1,
		Content:    "status: oops\nname: test\nslug: test\n",
	}
	srv.documents.Open(uri, "yaml", 1, doc.Content)

	// Populate cached errors
	errors := []*validator.EnhancedValidationError{
		{
			Path:      "status",
			ErrorType: validator.ErrorInvalidEnum,
			Priority:  validator.PriorityHigh,
			Message:   "value must be one of: draft, ready, in-progress, delivered",
			FixHint:   "Use one of the allowed values: draft, ready, in-progress, delivered",
			Details: validator.ErrorDetails{
				AllowedValues: []string{"draft", "ready", "in-progress", "delivered"},
			},
		},
	}
	srv.cacheErrors(doc, errors)

	// Simulate a code action request with a matching diagnostic
	severity := protocol.DiagnosticSeverityError
	params := &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 12},
		},
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{
				{
					Range: protocol.Range{
						Start: protocol.Position{Line: 0, Character: 0},
						End:   protocol.Position{Line: 0, Character: 12},
					},
					Severity: &severity,
					Code:     &protocol.IntegerOrString{Value: "invalid_enum"},
					Message:  "value must be one of: draft, ready, in-progress, delivered\n💡 Use one of the allowed values: draft, ready, in-progress, delivered",
				},
			},
		},
	}

	result, resultErr := srv.handleTextDocumentCodeAction(nil, params)
	if resultErr != nil {
		t.Fatalf("handleTextDocumentCodeAction failed: %v", resultErr)
	}
	if result == nil {
		t.Fatal("expected code actions, got nil")
	}

	actions, ok := result.([]protocol.CodeAction)
	if !ok {
		t.Fatalf("expected []CodeAction, got %T", result)
	}
	if len(actions) != 4 {
		t.Errorf("expected 4 actions, got %d", len(actions))
	}
}

func TestHandleTextDocumentCodeActionNoCachedErrors(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	uri := "file:///project/test.yaml"
	srv.documents.Open(uri, "yaml", 1, "key: val\n")

	params := &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{
				{Message: "some error"},
			},
		},
	}

	result, resultErr := srv.handleTextDocumentCodeAction(nil, params)
	if resultErr != nil {
		t.Fatalf("unexpected error: %v", resultErr)
	}
	if result != nil {
		t.Errorf("expected nil when no cached errors, got %v", result)
	}
}

func TestHandleTextDocumentCodeActionNoDiagnostics(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	uri := "file:///project/test.yaml"
	params := &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{},
		},
	}

	result, resultErr := srv.handleTextDocumentCodeAction(nil, params)
	if resultErr != nil {
		t.Fatalf("unexpected error: %v", resultErr)
	}
	if result != nil {
		t.Errorf("expected nil when no diagnostics, got %v", result)
	}
}
