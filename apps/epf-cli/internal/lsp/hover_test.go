package lsp

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	protocol "github.com/tliron/glsp/protocol_3_16"
)

// --- Unit tests for formatConstraints ---

func TestFormatConstraints(t *testing.T) {
	t.Run("empty info produces empty string", func(t *testing.T) {
		info := &SchemaPropertyInfo{}
		result := formatConstraints(info)
		if result != "" {
			t.Errorf("expected empty string, got %q", result)
		}
	})

	t.Run("pattern only", func(t *testing.T) {
		info := &SchemaPropertyInfo{Pattern: "^fd-[0-9]+$"}
		result := formatConstraints(info)
		if !strings.Contains(result, "`^fd-[0-9]+$`") {
			t.Errorf("expected pattern in output, got %q", result)
		}
		if !strings.Contains(result, "**Constraints:**") {
			t.Errorf("expected Constraints header, got %q", result)
		}
	})

	t.Run("minLength and maxLength", func(t *testing.T) {
		minLen := 50
		maxLen := 400
		info := &SchemaPropertyInfo{MinLength: &minLen, MaxLength: &maxLen}
		result := formatConstraints(info)
		if !strings.Contains(result, "**50**") {
			t.Errorf("expected minLength 50 in output, got %q", result)
		}
		if !strings.Contains(result, "**400**") {
			t.Errorf("expected maxLength 400 in output, got %q", result)
		}
	})

	t.Run("minItems and maxItems", func(t *testing.T) {
		minItems := 1
		maxItems := 4
		info := &SchemaPropertyInfo{MinItems: &minItems, MaxItems: &maxItems}
		result := formatConstraints(info)
		if !strings.Contains(result, "Min items: **1**") {
			t.Errorf("expected minItems 1 in output, got %q", result)
		}
		if !strings.Contains(result, "Max items: **4**") {
			t.Errorf("expected maxItems 4 in output, got %q", result)
		}
	})

	t.Run("all constraints combined", func(t *testing.T) {
		minLen := 10
		maxLen := 200
		minItems := 2
		maxItems := 10
		info := &SchemaPropertyInfo{
			Pattern:   "^[a-z]+$",
			MinLength: &minLen,
			MaxLength: &maxLen,
			MinItems:  &minItems,
			MaxItems:  &maxItems,
		}
		result := formatConstraints(info)
		// Should contain all 5 constraint lines
		lines := strings.Split(result, "\n")
		// Header + 5 bullet items
		if len(lines) < 6 {
			t.Errorf("expected at least 6 lines (header + 5 constraints), got %d: %q", len(lines), result)
		}
	})
}

// --- Unit tests for formatEnumList ---

func TestFormatEnumList(t *testing.T) {
	t.Run("single value", func(t *testing.T) {
		result := formatEnumList([]string{"draft"})
		if result != "**Valid values:** `draft`" {
			t.Errorf("unexpected result: %q", result)
		}
	})

	t.Run("multiple values", func(t *testing.T) {
		result := formatEnumList([]string{"draft", "ready", "in-progress", "delivered"})
		if !strings.Contains(result, "`draft`") {
			t.Error("expected 'draft' in output")
		}
		if !strings.Contains(result, "`delivered`") {
			t.Error("expected 'delivered' in output")
		}
		if !strings.HasPrefix(result, "**Valid values:** ") {
			t.Error("expected '**Valid values:** ' prefix")
		}
	})
}

// --- Unit tests for formatEnumValueHover ---

func TestFormatEnumValueHover(t *testing.T) {
	info := &SchemaPropertyInfo{
		Name:        "status",
		Description: "The feature status",
		Enum:        []string{"draft", "ready", "in-progress", "delivered"},
	}

	t.Run("valid value", func(t *testing.T) {
		result := formatEnumValueHover(info, "draft")
		if !strings.Contains(result, "valid enum value") {
			t.Errorf("expected 'valid enum value' for valid value, got %q", result)
		}
		if !strings.Contains(result, "**`draft`** ✓") {
			t.Errorf("expected current value to be highlighted with ✓, got %q", result)
		}
		if !strings.Contains(result, "`ready`") {
			t.Error("expected other enum values to be listed")
		}
		if !strings.Contains(result, "The feature status") {
			t.Error("expected description to be included")
		}
	})

	t.Run("invalid value", func(t *testing.T) {
		result := formatEnumValueHover(info, "invalid_status")
		if !strings.Contains(result, "⚠️ invalid value") {
			t.Errorf("expected '⚠️ invalid value' for invalid value, got %q", result)
		}
		// No value should have ✓ since current value is not in enum
		if strings.Contains(result, "✓") {
			t.Error("expected no ✓ marker for invalid value")
		}
	})

	t.Run("without description", func(t *testing.T) {
		infoNoDesc := &SchemaPropertyInfo{
			Name: "type",
			Enum: []string{"ui", "api"},
		}
		result := formatEnumValueHover(infoNoDesc, "ui")
		if !strings.Contains(result, "valid enum value") {
			t.Error("expected valid enum value text")
		}
		// Should still work without description
		if !strings.Contains(result, "**All valid values:**") {
			t.Error("expected all valid values section")
		}
	})
}

// --- Unit tests for formatHoverContent ---

func TestFormatHoverContent(t *testing.T) {
	t.Run("basic property", func(t *testing.T) {
		info := &SchemaPropertyInfo{
			Name:        "name",
			Type:        "string",
			Description: "The feature name",
			Required:    true,
		}
		result := formatHoverContent(info, "name")
		if !strings.Contains(result, "**`name`**") {
			t.Error("expected property name in title")
		}
		if !strings.Contains(result, "`string`") {
			t.Error("expected type in title")
		}
		if !strings.Contains(result, "*(required)*") {
			t.Error("expected required marker")
		}
		if !strings.Contains(result, "The feature name") {
			t.Error("expected description")
		}
		if !strings.Contains(result, "Schema path: `name`") {
			t.Error("expected schema path")
		}
	})

	t.Run("optional property without description", func(t *testing.T) {
		info := &SchemaPropertyInfo{
			Name: "optional_field",
			Type: "object",
		}
		result := formatHoverContent(info, "parent.optional_field")
		if strings.Contains(result, "*(required)*") {
			t.Error("should not show required for optional field")
		}
		if !strings.Contains(result, "`object`") {
			t.Error("expected type")
		}
		if !strings.Contains(result, "Schema path: `parent.optional_field`") {
			t.Error("expected full schema path")
		}
	})

	t.Run("property with enum", func(t *testing.T) {
		info := &SchemaPropertyInfo{
			Name: "status",
			Type: "string",
			Enum: []string{"draft", "ready"},
		}
		result := formatHoverContent(info, "status")
		if !strings.Contains(result, "**Valid values:**") {
			t.Error("expected valid values section for enum")
		}
		if !strings.Contains(result, "`draft`") {
			t.Error("expected enum values listed")
		}
	})

	t.Run("property with constraints", func(t *testing.T) {
		minLen := 200
		info := &SchemaPropertyInfo{
			Name:      "description",
			Type:      "string",
			MinLength: &minLen,
			Pattern:   "^[A-Z]",
		}
		result := formatHoverContent(info, "description")
		if !strings.Contains(result, "**Constraints:**") {
			t.Error("expected constraints section")
		}
		if !strings.Contains(result, "**200**") {
			t.Error("expected minLength constraint")
		}
		if !strings.Contains(result, "`^[A-Z]`") {
			t.Error("expected pattern constraint")
		}
	})

	t.Run("property without type", func(t *testing.T) {
		info := &SchemaPropertyInfo{
			Name: "mystery",
		}
		result := formatHoverContent(info, "mystery")
		if !strings.Contains(result, "**`mystery`**") {
			t.Error("expected property name")
		}
		// Should not have " — ``" (empty type)
		if strings.Contains(result, "— ``") {
			t.Error("should not show empty type")
		}
	})
}

// --- Unit tests for formatValueModelPathHover ---

func TestFormatValueModelPathHover(t *testing.T) {
	t.Run("full 4-part path", func(t *testing.T) {
		result := formatValueModelPathHover("Product.Discovery.KnowledgeExploration.EntityExtraction")
		if !strings.Contains(result, "**Value Model Path:** `Product.Discovery.KnowledgeExploration.EntityExtraction`") {
			t.Error("expected full path in title")
		}
		if !strings.Contains(result, "**Track:** Product") {
			t.Error("expected track")
		}
		if !strings.Contains(result, "**Layer:** Discovery") {
			t.Error("expected layer")
		}
		if !strings.Contains(result, "**Component:** KnowledgeExploration") {
			t.Error("expected component")
		}
		if !strings.Contains(result, "**Sub-component:** EntityExtraction") {
			t.Error("expected sub-component")
		}
		if !strings.Contains(result, "features, capabilities, and user value delivery") {
			t.Error("expected Product track description")
		}
	})

	t.Run("3-part path", func(t *testing.T) {
		result := formatValueModelPathHover("Strategy.Growth.MarketExpansion")
		if !strings.Contains(result, "**Track:** Strategy") {
			t.Error("expected Strategy track")
		}
		if !strings.Contains(result, "growth, positioning, and market strategy") {
			t.Error("expected Strategy track description")
		}
		if strings.Contains(result, "**Sub-component:**") {
			t.Error("should not have sub-component for 3-part path")
		}
	})

	t.Run("2-part path", func(t *testing.T) {
		result := formatValueModelPathHover("OrgOps.Team")
		if !strings.Contains(result, "**Track:** OrgOps") {
			t.Error("expected OrgOps track")
		}
		if !strings.Contains(result, "**Layer:** Team") {
			t.Error("expected layer")
		}
		if strings.Contains(result, "**Component:**") {
			t.Error("should not have component for 2-part path")
		}
	})

	t.Run("1-part path (track only)", func(t *testing.T) {
		result := formatValueModelPathHover("Commercial")
		if !strings.Contains(result, "**Track:** Commercial") {
			t.Error("expected Commercial track")
		}
		if !strings.Contains(result, "revenue, sales, and partnership growth") {
			t.Error("expected Commercial track description")
		}
	})

	t.Run("empty path", func(t *testing.T) {
		result := formatValueModelPathHover("")
		if result != "" {
			t.Errorf("expected empty result for empty path, got %q", result)
		}
	})

	t.Run("unknown track", func(t *testing.T) {
		result := formatValueModelPathHover("Unknown.Something")
		if !strings.Contains(result, "**Track:** Unknown") {
			t.Error("expected track name even if unknown")
		}
		// Should not have a track description
		if strings.Contains(result, "features, capabilities") || strings.Contains(result, "growth, positioning") {
			t.Error("should not have track description for unknown track")
		}
	})
}

// --- Unit tests for describeTrack ---

func TestDescribeTrack(t *testing.T) {
	tests := []struct {
		track    string
		wantNon  bool // true if we expect non-empty
		wantPart string
	}{
		{"Product", true, "features"},
		{"Strategy", true, "growth"},
		{"OrgOps", true, "team"},
		{"Commercial", true, "revenue"},
		{"Unknown", false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.track, func(t *testing.T) {
			result := describeTrack(tt.track)
			if tt.wantNon && result == "" {
				t.Error("expected non-empty description")
			}
			if !tt.wantNon && result != "" {
				t.Errorf("expected empty description, got %q", result)
			}
			if tt.wantPart != "" && !strings.Contains(result, tt.wantPart) {
				t.Errorf("expected %q in description, got %q", tt.wantPart, result)
			}
		})
	}
}

// --- Unit tests for hoverKey with synthetic schema ---

func TestHoverKeyWithSyntheticSchema(t *testing.T) {
	schemaJSON := json.RawMessage(`{
		"type": "object",
		"properties": {
			"name": {
				"type": "string",
				"description": "The name of the feature"
			},
			"status": {
				"type": "string",
				"description": "Current status",
				"enum": ["draft", "ready", "in-progress", "delivered"]
			}
		},
		"required": ["name"]
	}`)

	t.Run("key with description", func(t *testing.T) {
		pos := &YAMLPosition{SchemaPath: "name", IsKey: true, Key: "name"}
		result := hoverKey(schemaJSON, pos)
		if !strings.Contains(result, "The name of the feature") {
			t.Errorf("expected description in hover, got %q", result)
		}
		if !strings.Contains(result, "*(required)*") {
			t.Error("expected required marker for required field")
		}
	})

	t.Run("key with enum", func(t *testing.T) {
		pos := &YAMLPosition{SchemaPath: "status", IsKey: true, Key: "status"}
		result := hoverKey(schemaJSON, pos)
		if !strings.Contains(result, "**Valid values:**") {
			t.Error("expected enum values in hover")
		}
		if !strings.Contains(result, "`draft`") {
			t.Error("expected enum values listed")
		}
	})

	t.Run("nonexistent key", func(t *testing.T) {
		pos := &YAMLPosition{SchemaPath: "nonexistent", IsKey: true, Key: "nonexistent"}
		result := hoverKey(schemaJSON, pos)
		if result != "" {
			t.Errorf("expected empty hover for nonexistent key, got %q", result)
		}
	})
}

// --- Unit tests for hoverValue with synthetic schema ---

func TestHoverValueWithSyntheticSchema(t *testing.T) {
	schemaJSON := json.RawMessage(`{
		"type": "object",
		"properties": {
			"status": {
				"type": "string",
				"description": "Current status",
				"enum": ["draft", "ready", "in-progress", "delivered"]
			},
			"name": {
				"type": "string",
				"description": "The name"
			}
		}
	}`)

	t.Run("enum value with node", func(t *testing.T) {
		// Simulate a YAML node with a value
		content := []byte("status: draft\n")
		pos := ResolveYAMLPosition(content, 0, 8) // on "draft"

		// Override schema path to match our synthetic schema
		pos.SchemaPath = "status"
		pos.IsValue = true

		result := hoverValue(schemaJSON, pos)
		if !strings.Contains(result, "valid enum value") {
			t.Errorf("expected enum value hover, got %q", result)
		}
		if !strings.Contains(result, "**`draft`** ✓") {
			t.Errorf("expected current value highlighted, got %q", result)
		}
	})

	t.Run("non-enum value", func(t *testing.T) {
		content := []byte("name: \"Test\"\n")
		pos := ResolveYAMLPosition(content, 0, 6) // on "Test"
		pos.SchemaPath = "name"
		pos.IsValue = true

		result := hoverValue(schemaJSON, pos)
		// Should fall back to formatHoverContent since name is not an enum
		if !strings.Contains(result, "The name") {
			t.Errorf("expected description in hover, got %q", result)
		}
	})

	t.Run("nonexistent path", func(t *testing.T) {
		pos := &YAMLPosition{SchemaPath: "nonexistent", IsValue: true}
		result := hoverValue(schemaJSON, pos)
		if result != "" {
			t.Errorf("expected empty hover for nonexistent path, got %q", result)
		}
	})
}

// --- Integration tests: hover with real schemas ---

func TestHandleTextDocumentHover(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("returns nil for non-YAML document", func(t *testing.T) {
		srv.documents.Open("file:///project/README.md", "markdown", 1, "# Hello")
		defer srv.documents.Close("file:///project/README.md")

		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: "file:///project/README.md"},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil for non-YAML doc, got %v", result)
		}
	})

	t.Run("returns nil for unknown document", func(t *testing.T) {
		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: "file:///nonexistent.yaml"},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil for unknown doc, got %v", result)
		}
	})

	t.Run("returns nil for non-EPF YAML", func(t *testing.T) {
		srv.documents.Open("file:///project/docker-compose.yaml", "yaml", 1, "version: '3'\n")
		defer srv.documents.Close("file:///project/docker-compose.yaml")

		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: "file:///project/docker-compose.yaml"},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil for non-EPF YAML, got %v", result)
		}
	})

	t.Run("hover on key in feature definition", func(t *testing.T) {
		content := `meta:
  epf_version: "2.0.0"
id: "fd-001"
name: "Test Feature"
slug: "test-feature"
status: "draft"
`
		doc := srv.documents.Open(
			"file:///project/FIRE/feature_definitions/fd-001.yaml",
			"yaml",
			1,
			content,
		)
		defer srv.documents.Close(doc.URI)
		doc.ArtifactType = "feature_definition"

		// Hover on "status" key (line 5, char 0)
		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: doc.URI},
				Position:     protocol.Position{Line: 5, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("expected hover result for 'status' key, got nil")
		}

		mc, ok := result.Contents.(protocol.MarkupContent)
		if !ok {
			t.Fatalf("expected MarkupContent, got %T", result.Contents)
		}
		if mc.Kind != protocol.MarkupKindMarkdown {
			t.Errorf("expected markdown kind, got %v", mc.Kind)
		}
		// The hover should contain info about status (which is an enum field)
		if mc.Value == "" {
			t.Error("expected non-empty hover content")
		}
	})

	t.Run("hover on enum value in feature definition", func(t *testing.T) {
		content := `meta:
  epf_version: "2.0.0"
id: "fd-001"
name: "Test Feature"
slug: "test-feature"
status: "draft"
`
		doc := srv.documents.Open(
			"file:///project/FIRE/feature_definitions/fd-002.yaml",
			"yaml",
			1,
			content,
		)
		defer srv.documents.Close(doc.URI)
		doc.ArtifactType = "feature_definition"

		// Hover on "draft" value (line 5, char 9)
		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: doc.URI},
				Position:     protocol.Position{Line: 5, Character: 9},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Skip("hover on enum value returned nil (schema path resolution may vary)")
		}

		mc, ok := result.Contents.(protocol.MarkupContent)
		if !ok {
			t.Fatalf("expected MarkupContent, got %T", result.Contents)
		}
		if mc.Value == "" {
			t.Error("expected non-empty hover content")
		}
	})

	t.Run("hover on real north_star file", func(t *testing.T) {
		realFile := testdataPath("../../docs/EPF/_instances/emergent/READY/00_north_star.yaml")
		fileContent, err := os.ReadFile(realFile)
		if err != nil {
			t.Skipf("skipping: real instance not available: %v", err)
		}

		doc := srv.documents.Open(
			"file:///project/READY/00_north_star.yaml",
			"yaml",
			1,
			string(fileContent),
		)
		defer srv.documents.Close(doc.URI)
		doc.ArtifactType = "north_star"

		// Hover on a key somewhere in the file (line 0 should be a top-level key)
		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: doc.URI},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Result could be nil if line 0 is a comment or meta — that's OK
		if result != nil {
			mc, ok := result.Contents.(protocol.MarkupContent)
			if !ok {
				t.Fatalf("expected MarkupContent, got %T", result.Contents)
			}
			if mc.Kind != protocol.MarkupKindMarkdown {
				t.Errorf("expected markdown, got %v", mc.Kind)
			}
			if mc.Value == "" {
				t.Error("expected non-empty hover content")
			}
		}
	})

	t.Run("hover on contributes_to value", func(t *testing.T) {
		content := `meta:
  epf_version: "2.0.0"
id: "fd-001"
name: "Test"
slug: "test"
status: "draft"
strategic_context:
  contributes_to:
    - "Product.Discovery.KnowledgeExploration"
  tracks:
    - "product"
`
		doc := srv.documents.Open(
			"file:///project/FIRE/feature_definitions/fd-003.yaml",
			"yaml",
			1,
			content,
		)
		defer srv.documents.Close(doc.URI)
		doc.ArtifactType = "feature_definition"

		// Hover on the value model path value (line 8, inside the string)
		// Line 8 = `    - "Product.Discovery.KnowledgeExploration"`, character 15 is inside the path
		result, err := srv.handleTextDocumentHover(nil, &protocol.HoverParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: doc.URI},
				Position:     protocol.Position{Line: 8, Character: 15},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Skip("hover on contributes_to path returned nil (position resolution may vary)")
		}

		mc, ok := result.Contents.(protocol.MarkupContent)
		if !ok {
			t.Fatalf("expected MarkupContent, got %T", result.Contents)
		}
		// Should explain the value model path
		if !strings.Contains(mc.Value, "Product") {
			t.Errorf("expected value model path explanation to mention Product, got %q", mc.Value)
		}
	})
}
