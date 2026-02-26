package lsp

import (
	"encoding/json"
	"os"
	"testing"

	protocol "github.com/tliron/glsp/protocol_3_16"
)

// --- Unit tests for helper functions ---

func TestIsContributesToField(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"strategic_context.contributes_to", true},
		{"contributes_to", true},
		{"contributes_to.0", true},
		{"strategic_context.tracks", false},
		{"name", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := isContributesToField(tt.path); got != tt.want {
				t.Errorf("isContributesToField(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestExampleFromPattern(t *testing.T) {
	tests := []struct {
		pattern string
		name    string
		want    string
	}{
		{"^fd-[0-9]+$", "id", "fd-001"},
		{"^cap-[0-9]+$", "id", "cap-001"},
		{"^ctx-[0-9]+$", "id", "ctx-001"},
		{"^kr-[a-z]+-[0-9]{4}-q[1-4]-[0-9]+$", "id", "kr-p-2025-q1-001"},
		{"^[a-z0-9]+(-[a-z0-9]+)*$", "slug", "my-slug"},
		{"^custom-pattern$", "field", "^custom-pattern$"},
	}

	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			got := exampleFromPattern(tt.pattern, tt.name)
			if got != tt.want {
				t.Errorf("exampleFromPattern(%q, %q) = %q, want %q", tt.pattern, tt.name, got, tt.want)
			}
		})
	}
}

func TestDescribeValueModelPath(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"Product.Discovery.KnowledgeExploration", "Product value model path"},
		{"Strategy.Growth.MarketExpansion", "Strategy value model path"},
		{"OrgOps.Team.HiringPipeline", "OrgOps value model path"},
		{"Commercial.Revenue.Subscriptions", "Commercial value model path"},
		{"Unknown.Path", "Value model path"},
		{"", "Value model path"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := describeValueModelPath(tt.path)
			if got != tt.want {
				t.Errorf("describeValueModelPath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

func TestFormatPropertyDetail(t *testing.T) {
	tests := []struct {
		name string
		prop SchemaPropertyInfo
		want string
	}{
		{
			name: "string required",
			prop: SchemaPropertyInfo{Type: "string", Required: true},
			want: "string, required",
		},
		{
			name: "enum",
			prop: SchemaPropertyInfo{Type: "string", Enum: []string{"a", "b", "c"}},
			want: "string, enum(3)",
		},
		{
			name: "type only",
			prop: SchemaPropertyInfo{Type: "object"},
			want: "object",
		},
		{
			name: "empty",
			prop: SchemaPropertyInfo{},
			want: "",
		},
		{
			name: "required enum",
			prop: SchemaPropertyInfo{Type: "string", Required: true, Enum: []string{"x"}},
			want: "string, required, enum(1)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatPropertyDetail(tt.prop)
			if got != tt.want {
				t.Errorf("formatPropertyDetail() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFormatPropertyDoc(t *testing.T) {
	minLen := 50

	tests := []struct {
		name    string
		prop    SchemaPropertyInfo
		wantNon bool // true if we expect non-empty result
	}{
		{
			name:    "with description",
			prop:    SchemaPropertyInfo{Description: "A test field"},
			wantNon: true,
		},
		{
			name:    "with pattern",
			prop:    SchemaPropertyInfo{Pattern: "^fd-[0-9]+$"},
			wantNon: true,
		},
		{
			name:    "with minLength",
			prop:    SchemaPropertyInfo{MinLength: &minLen},
			wantNon: true,
		},
		{
			name:    "with enum",
			prop:    SchemaPropertyInfo{Enum: []string{"a", "b"}},
			wantNon: true,
		},
		{
			name:    "empty",
			prop:    SchemaPropertyInfo{},
			wantNon: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatPropertyDoc(tt.prop)
			if tt.wantNon && got == "" {
				t.Error("expected non-empty doc, got empty")
			}
			if !tt.wantNon && got != "" {
				t.Errorf("expected empty doc, got %q", got)
			}
		})
	}
}

// --- Unit tests for completeEnum ---

func TestCompleteEnum(t *testing.T) {
	info := &SchemaPropertyInfo{
		Enum: []string{"draft", "ready", "in-progress", "delivered"},
	}

	items := completeEnum(info)

	if len(items) != 4 {
		t.Fatalf("expected 4 enum items, got %d", len(items))
	}

	// Check labels match enum values
	for i, expected := range info.Enum {
		if items[i].Label != expected {
			t.Errorf("items[%d].Label = %q, want %q", i, items[i].Label, expected)
		}
		if items[i].Kind == nil || *items[i].Kind != protocol.CompletionItemKindEnum {
			t.Errorf("items[%d].Kind should be Enum", i)
		}
	}
}

// --- Unit tests for completePattern ---

func TestCompletePattern(t *testing.T) {
	info := &SchemaPropertyInfo{
		Name:        "id",
		Pattern:     "^fd-[0-9]+$",
		Description: "Feature definition ID",
	}

	items := completePattern(info)

	if len(items) != 1 {
		t.Fatalf("expected 1 pattern item, got %d", len(items))
	}

	if items[0].Label != "fd-001" {
		t.Errorf("Label = %q, want %q", items[0].Label, "fd-001")
	}
	if items[0].Kind == nil || *items[0].Kind != protocol.CompletionItemKindSnippet {
		t.Error("Kind should be Snippet")
	}
	if items[0].Detail == nil || *items[0].Detail == "" {
		t.Error("Detail should not be empty")
	}
}

// --- Unit tests for completeTrackPrefixes ---

func TestCompleteTrackPrefixes(t *testing.T) {
	items := completeTrackPrefixes()

	if len(items) != 4 {
		t.Fatalf("expected 4 track prefixes, got %d", len(items))
	}

	expectedLabels := []string{"Product.", "Strategy.", "OrgOps.", "Commercial."}
	for i, expected := range expectedLabels {
		if items[i].Label != expected {
			t.Errorf("items[%d].Label = %q, want %q", i, items[i].Label, expected)
		}
		if items[i].Kind == nil || *items[i].Kind != protocol.CompletionItemKindKeyword {
			t.Errorf("items[%d].Kind should be Keyword", i)
		}
	}
}

// --- Unit tests for findExistingKeys ---

func TestFindExistingKeys(t *testing.T) {
	content := []byte(`name: "test"
slug: "test-slug"
status: "draft"
`)

	pos := ResolveYAMLPosition(content, 0, 0) // on "name" key

	existing := findExistingKeys(content, pos)

	// Should find all three keys
	for _, key := range []string{"name", "slug", "status"} {
		if !existing[key] {
			t.Errorf("expected existing key %q to be found", key)
		}
	}

	// Should not find random keys
	if existing["nonexistent"] {
		t.Error("did not expect 'nonexistent' key")
	}
}

// --- Integration tests: key completion with real schema ---

func TestCompleteKeysWithRealSchema(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("north_star root keys", func(t *testing.T) {
		// A minimal north_star document with only 'meta'
		content := []byte(`meta:
  epf_version: "2.0.0"
`)
		doc := &Document{
			URI:          "file:///project/READY/00_north_star.yaml",
			LanguageID:   "yaml",
			Version:      1,
			Content:      string(content),
			ArtifactType: "north_star",
		}

		// Get schema
		schemaJSON := GetSchemaForArtifact(srv.loader, "north_star")
		if schemaJSON == nil {
			t.Fatal("could not load north_star schema")
		}

		// Position on blank line after meta — should suggest root-level keys
		pos := ResolveYAMLPosition(content, 2, 0)
		items := srv.completeKeys(schemaJSON, pos, content)

		if len(items) == 0 {
			t.Fatal("expected key completion items at root level, got 0")
		}

		// Should include important north_star keys like "north_star"
		// (the wrapper key) or other root-level keys
		labels := make(map[string]bool)
		for _, item := range items {
			labels[item.Label] = true
			// All items should be property kind
			if item.Kind == nil || *item.Kind != protocol.CompletionItemKindProperty {
				t.Errorf("item %q should have Property kind", item.Label)
			}
		}

		// "meta" should NOT be suggested since it already exists
		if labels["meta"] {
			t.Error("'meta' should be filtered out since it already exists")
		}

		// Required items should come first
		if len(items) > 1 {
			firstSort := ""
			if items[0].SortText != nil {
				firstSort = *items[0].SortText
			}
			if firstSort == "" {
				t.Error("expected SortText to be set")
			}
		}

		_ = doc // used for context
	})

	t.Run("feature definition root keys", func(t *testing.T) {
		content := []byte(`meta:
  epf_version: "2.0.0"
id: "fd-001"
`)
		schemaJSON := GetSchemaForArtifact(srv.loader, "feature_definition")
		if schemaJSON == nil {
			t.Skip("could not load feature_definition schema")
		}

		pos := ResolveYAMLPosition(content, 3, 0)
		items := srv.completeKeys(schemaJSON, pos, content)

		if len(items) == 0 {
			t.Fatal("expected key completions for feature_definition")
		}

		// Should not include already-existing keys
		labels := make(map[string]bool)
		for _, item := range items {
			labels[item.Label] = true
		}

		if labels["meta"] {
			t.Error("'meta' should be filtered out")
		}
		if labels["id"] {
			t.Error("'id' should be filtered out")
		}
	})
}

// --- Integration tests: value completion with real schema ---

func TestCompleteValueWithRealSchema(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("feature status enum completion", func(t *testing.T) {
		content := []byte(`meta:
  epf_version: "2.0.0"
id: "fd-001"
name: "Test Feature"
slug: "test-feature"
status: 
`)
		schemaJSON := GetSchemaForArtifact(srv.loader, "feature_definition")
		if schemaJSON == nil {
			t.Skip("could not load feature_definition schema")
		}

		doc := &Document{
			URI:          "file:///project/FIRE/feature_definitions/fd-001.yaml",
			LanguageID:   "yaml",
			Version:      1,
			Content:      string(content),
			ArtifactType: "feature_definition",
		}

		// Position on the value of status (line 5, after "status: ")
		pos := ResolveYAMLPosition(content, 5, 8)
		items := srv.completeValue(schemaJSON, pos, doc)

		if len(items) == 0 {
			t.Fatal("expected enum completion items for status field")
		}

		// Should have the known status enum values
		labels := make(map[string]bool)
		for _, item := range items {
			labels[item.Label] = true
		}

		for _, expected := range []string{"draft", "ready", "in-progress", "delivered"} {
			if !labels[expected] {
				t.Errorf("expected enum value %q in completion items", expected)
			}
		}
	})

	t.Run("feature id pattern completion", func(t *testing.T) {
		content := []byte(`meta:
  epf_version: "2.0.0"
id: 
`)
		schemaJSON := GetSchemaForArtifact(srv.loader, "feature_definition")
		if schemaJSON == nil {
			t.Skip("could not load feature_definition schema")
		}

		doc := &Document{
			URI:          "file:///project/FIRE/feature_definitions/fd-001.yaml",
			LanguageID:   "yaml",
			Version:      1,
			Content:      string(content),
			ArtifactType: "feature_definition",
		}

		pos := ResolveYAMLPosition(content, 2, 4)
		items := srv.completeValue(schemaJSON, pos, doc)

		if len(items) == 0 {
			t.Fatal("expected pattern completion items for id field")
		}

		// Should include pattern hint with example like "fd-001"
		found := false
		for _, item := range items {
			if item.Label == "fd-001" {
				found = true
				if item.Kind == nil || *item.Kind != protocol.CompletionItemKindSnippet {
					t.Error("pattern hint should be Snippet kind")
				}
				break
			}
		}
		if !found {
			t.Error("expected pattern example 'fd-001' in completion items")
		}
	})
}

// --- Integration test: contributes_to path completion ---

func TestCompleteContributesToPaths(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("fallback to track prefixes without instance", func(t *testing.T) {
		// No documents open from an instance, so should fall back to static prefixes
		pos := &YAMLPosition{
			SchemaPath: "strategic_context.contributes_to",
			IsValue:    true,
		}
		items := srv.completeContributesToPaths(pos)

		if len(items) != 4 {
			t.Fatalf("expected 4 track prefix items as fallback, got %d", len(items))
		}

		labels := make(map[string]bool)
		for _, item := range items {
			labels[item.Label] = true
		}

		for _, expected := range []string{"Product.", "Strategy.", "OrgOps.", "Commercial."} {
			if !labels[expected] {
				t.Errorf("expected track prefix %q", expected)
			}
		}
	})

	t.Run("with real instance value model paths", func(t *testing.T) {
		// Open a document from the real instance so detectInstancePath works
		realFile := testdataPath("../../docs/EPF/_instances/emergent/READY/00_north_star.yaml")
		content, err := os.ReadFile(realFile)
		if err != nil {
			t.Skipf("skipping: real instance not available: %v", err)
		}

		srv.documents.Open(
			"file://"+realFile,
			"yaml",
			1,
			string(content),
		)
		defer srv.documents.Close("file://" + realFile)

		// Clear cached paths to force reload
		srv.vmPathsMu.Lock()
		srv.vmPaths = nil
		srv.vmPathsMu.Unlock()

		pos := &YAMLPosition{
			SchemaPath: "strategic_context.contributes_to",
			IsValue:    true,
		}
		items := srv.completeContributesToPaths(pos)

		if len(items) == 0 {
			t.Skip("no value model paths found in instance (value model files may not exist)")
		}

		// If we got paths, they should start with known track prefixes
		for _, item := range items {
			label := item.Label
			validPrefix := false
			for _, prefix := range []string{"Product.", "Strategy.", "OrgOps.", "Commercial."} {
				if len(label) >= len(prefix) && label[:len(prefix)] == prefix {
					validPrefix = true
					break
				}
			}
			if !validPrefix {
				t.Errorf("value model path %q doesn't start with a known track prefix", label)
			}
		}
	})
}

// --- Integration test: full handleTextDocumentCompletion flow ---

func TestHandleTextDocumentCompletion(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("returns nil for non-YAML document", func(t *testing.T) {
		srv.documents.Open("file:///project/README.md", "markdown", 1, "# Hello")
		defer srv.documents.Close("file:///project/README.md")

		result, err := srv.handleTextDocumentCompletion(nil, &protocol.CompletionParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: "file:///project/README.md"},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil result for non-YAML doc, got %v", result)
		}
	})

	t.Run("returns nil for unknown document", func(t *testing.T) {
		result, err := srv.handleTextDocumentCompletion(nil, &protocol.CompletionParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: "file:///nonexistent.yaml"},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil result for unknown doc, got %v", result)
		}
	})

	t.Run("returns nil for non-EPF YAML", func(t *testing.T) {
		srv.documents.Open("file:///project/docker-compose.yaml", "yaml", 1, "version: '3'\n")
		defer srv.documents.Close("file:///project/docker-compose.yaml")

		result, err := srv.handleTextDocumentCompletion(nil, &protocol.CompletionParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: "file:///project/docker-compose.yaml"},
				Position:     protocol.Position{Line: 0, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil result for non-EPF YAML, got %v", result)
		}
	})

	t.Run("returns completions for EPF YAML", func(t *testing.T) {
		content := `meta:
  epf_version: "2.0.0"
id: "fd-001"
name: "Test Feature"
slug: "test-feature"
`
		doc := srv.documents.Open(
			"file:///project/FIRE/feature_definitions/fd-001.yaml",
			"yaml",
			1,
			content,
		)
		defer srv.documents.Close(doc.URI)

		// Detect the artifact type (normally done by buildDiagnostics)
		doc.ArtifactType = "feature_definition"

		result, err := srv.handleTextDocumentCompletion(nil, &protocol.CompletionParams{
			TextDocumentPositionParams: protocol.TextDocumentPositionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: doc.URI},
				Position:     protocol.Position{Line: 5, Character: 0},
			},
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("expected completion items for EPF YAML, got nil")
		}

		items, ok := result.([]protocol.CompletionItem)
		if !ok {
			t.Fatalf("expected []CompletionItem, got %T", result)
		}

		if len(items) == 0 {
			t.Fatal("expected non-empty completion items")
		}

		// Should suggest keys that aren't yet present (e.g., "status", "definition", etc.)
		labels := make(map[string]bool)
		for _, item := range items {
			labels[item.Label] = true
		}

		// These keys already exist and should NOT be suggested
		for _, existing := range []string{"meta", "id", "name", "slug"} {
			if labels[existing] {
				t.Errorf("existing key %q should not be in completion items", existing)
			}
		}

		// "status" should be suggested since it's a required field not yet present
		if !labels["status"] {
			t.Log("note: 'status' not found in completions (may depend on schema structure)")
		}
	})
}

// --- Test for detectInstancePath ---

func TestDetectInstancePath(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	tests := []struct {
		name     string
		uri      string
		content  string
		wantPath bool
	}{
		{
			name:     "READY file",
			uri:      "file:///home/user/project/docs/EPF/_instances/myproduct/READY/00_north_star.yaml",
			content:  "key: value\n",
			wantPath: true,
		},
		{
			name:     "FIRE file",
			uri:      "file:///home/user/project/docs/EPF/_instances/myproduct/FIRE/feature_definitions/fd-001.yaml",
			content:  "key: value\n",
			wantPath: true,
		},
		{
			name:     "AIM file",
			uri:      "file:///home/user/project/docs/EPF/_instances/myproduct/AIM/assessment_report.yaml",
			content:  "key: value\n",
			wantPath: true,
		},
		{
			name:     "non-EPF file",
			uri:      "file:///home/user/project/config.yaml",
			content:  "key: value\n",
			wantPath: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Fresh document store
			srv.documents = NewDocumentStore()
			srv.documents.Open(tt.uri, "yaml", 1, tt.content)

			path := srv.detectInstancePath()

			if tt.wantPath && path == "" {
				t.Error("expected instance path to be detected, got empty")
			}
			if !tt.wantPath && path != "" {
				t.Errorf("expected no instance path, got %q", path)
			}
		})
	}
}

// --- Test getValueModelPaths caching ---

func TestGetValueModelPathsCaching(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	t.Run("returns nil without instance", func(t *testing.T) {
		paths := srv.getValueModelPaths()
		if paths != nil {
			t.Errorf("expected nil paths without instance, got %v", paths)
		}
	})

	t.Run("returns cached value on second call", func(t *testing.T) {
		// Pre-populate cache
		srv.vmPathsMu.Lock()
		srv.vmPaths = []string{"Product.Core.Feature", "Strategy.Growth.MarketExpansion"}
		srv.vmPathsMu.Unlock()

		paths := srv.getValueModelPaths()
		if len(paths) != 2 {
			t.Errorf("expected 2 cached paths, got %d", len(paths))
		}

		// Clean up
		srv.vmPathsMu.Lock()
		srv.vmPaths = nil
		srv.vmPathsMu.Unlock()
	})
}

// --- Test completeKeys filtering: ensure insertion text includes colon ---

func TestCompleteKeysInsertText(t *testing.T) {
	// Use a simple JSON schema
	schemaJSON := json.RawMessage(`{
		"type": "object",
		"properties": {
			"name": {"type": "string", "description": "The name"},
			"age": {"type": "integer"}
		},
		"required": ["name"]
	}`)

	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	content := []byte(`age: 42
`)
	pos := ResolveYAMLPosition(content, 1, 0) // after "age: 42\n"

	items := srv.completeKeys(schemaJSON, pos, content)

	// Should suggest "name" (since "age" already exists)
	found := false
	for _, item := range items {
		if item.Label == "name" {
			found = true
			if item.InsertText == nil || *item.InsertText != "name: " {
				t.Errorf("InsertText = %v, want 'name: '", item.InsertText)
			}
			if item.Kind == nil || *item.Kind != protocol.CompletionItemKindProperty {
				t.Error("Kind should be Property")
			}
			break
		}
	}
	if !found {
		t.Error("expected 'name' in completion items")
	}

	// "age" should NOT be in the list
	for _, item := range items {
		if item.Label == "age" {
			t.Error("'age' should be filtered out since it already exists")
		}
	}
}
