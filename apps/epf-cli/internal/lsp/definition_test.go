package lsp

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
	"gopkg.in/yaml.v3"
)

// --- isDependencyIDField ---

func TestIsDependencyIDField(t *testing.T) {
	tests := []struct {
		schemaPath string
		want       bool
	}{
		// Positive cases
		{"dependencies.requires.id", true},
		{"dependencies.enables.id", true},
		{"dependencies.requires.items.id", true},
		{"dependencies.enables.items.id", true},
		{"some_prefix.dependencies.requires.id", true},
		{"some_prefix.dependencies.enables.id", true},

		// Negative cases
		{"dependencies.requires.name", false},
		{"dependencies.enables.reason", false},
		{"dependencies.requires", false},
		{"dependencies.enables", false},
		{"status", false},
		{"id", false},
		{"dependencies.id", false},
		{"some.other.id", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.schemaPath, func(t *testing.T) {
			got := isDependencyIDField(tt.schemaPath)
			if got != tt.want {
				t.Errorf("isDependencyIDField(%q) = %v, want %v", tt.schemaPath, got, tt.want)
			}
		})
	}
}

// --- normalizeForMatch ---

func TestNormalizeForMatch(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"knowledge-graph", "knowledgegraph"},
		{"Knowledge Graph", "knowledgegraph"},
		{"KNOWLEDGE_GRAPH", "knowledgegraph"},
		{"KnowledgeGraph", "knowledgegraph"},
		{"", ""},
		{"simple", "simple"},
		{"a-b_c d", "abcd"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeForMatch(tt.input)
			if got != tt.want {
				t.Errorf("normalizeForMatch(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// --- yamlToLSPLine ---

func TestYamlToLSPLine(t *testing.T) {
	tests := []struct {
		yamlLine int
		want     uint32
	}{
		{1, 0},   // Line 1 in YAML → line 0 in LSP
		{2, 1},   // Line 2 → line 1
		{10, 9},  // Line 10 → line 9
		{0, 0},   // Edge case: 0 → 0
		{-1, 0},  // Edge case: negative → 0
		{-10, 0}, // Edge case: very negative → 0
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			got := yamlToLSPLine(tt.yamlLine)
			if got != tt.want {
				t.Errorf("yamlToLSPLine(%d) = %d, want %d", tt.yamlLine, got, tt.want)
			}
		})
	}
}

// --- pathToURI ---

func TestPathToURI(t *testing.T) {
	t.Run("absolute path", func(t *testing.T) {
		uri := pathToURI("/home/user/project/file.yaml")
		if uri != "file:///home/user/project/file.yaml" {
			t.Errorf("pathToURI: got %q, want file:///home/user/project/file.yaml", uri)
		}
	})

	t.Run("relative path gets resolved to absolute", func(t *testing.T) {
		uri := pathToURI("relative/file.yaml")
		if !strings.HasPrefix(string(uri), "file://") {
			t.Errorf("pathToURI: result %q should start with file://", uri)
		}
		// It should convert to an absolute path
		if strings.Contains(string(uri), "relative/file.yaml") {
			// Still contains the relative part, but should be absolute overall
			cwd, _ := os.Getwd()
			expected := "file://" + filepath.Join(cwd, "relative/file.yaml")
			if string(uri) != expected {
				t.Errorf("pathToURI: got %q, want %q", uri, expected)
			}
		}
	})
}

// --- matchesIDOrName ---

func TestMatchesIDOrName(t *testing.T) {
	// Helper to create a YAML mapping node with id and name fields
	makeNode := func(yamlContent string) *yamlNodeForTest {
		return parseYAMLMapping(t, yamlContent)
	}

	tests := []struct {
		name    string
		yaml    string
		id      string
		matchID string
		want    bool
	}{
		{
			name:    "exact ID match",
			yaml:    "id: knowledge-graph\nname: Knowledge Graph",
			id:      "knowledge-graph",
			matchID: "Knowledge Graph",
			want:    true,
		},
		{
			name:    "case-insensitive ID match",
			yaml:    "id: Knowledge-Graph\nname: Knowledge Graph",
			id:      "knowledge-graph",
			matchID: "Knowledge Graph",
			want:    true,
		},
		{
			name:    "normalized ID match (kebab vs PascalCase)",
			yaml:    "id: knowledge-graph\nname: Knowledge Graph",
			id:      "KnowledgeGraph",
			matchID: "",
			want:    true,
		},
		{
			name:    "exact name match",
			yaml:    "id: something-else\nname: Knowledge Graph",
			id:      "different-id",
			matchID: "Knowledge Graph",
			want:    true,
		},
		{
			name:    "case-insensitive name match",
			yaml:    "id: other\nname: knowledge graph",
			id:      "different",
			matchID: "Knowledge Graph",
			want:    true,
		},
		{
			name:    "no match",
			yaml:    "id: foo\nname: Bar",
			id:      "baz",
			matchID: "Quux",
			want:    false,
		},
		{
			name:    "only id field present",
			yaml:    "id: knowledge-graph",
			id:      "knowledge-graph",
			matchID: "",
			want:    true,
		},
		{
			name:    "only name field present",
			yaml:    "name: Knowledge Graph",
			id:      "",
			matchID: "Knowledge Graph",
			want:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			node := makeNode(tt.yaml)
			if node == nil {
				t.Fatal("failed to parse YAML for test")
			}
			got := matchesIDOrName(node.node, tt.id, tt.matchID)
			if got != tt.want {
				t.Errorf("matchesIDOrName() = %v, want %v", got, tt.want)
			}
		})
	}
}

// --- findValueModelNodeLine ---

func TestFindValueModelNodeLine(t *testing.T) {
	// Create a temporary value model YAML file
	vmYAML := `meta:
  epf_version: "2.0.0"
track_name: Product
layers:
  - id: memory-reasoning
    name: Memory & Reasoning Engine
    description: Core intelligence layer
    components:
      - id: knowledge-graph
        name: Knowledge Graph
        subs:
          - id: entity-storage
            name: Entity Storage
          - id: relationship-mapping
            name: Relationship Mapping
      - id: vector-search
        name: Vector Search
        subs:
          - id: embedding-generation
            name: Embedding Generation
  - id: discovery
    name: Discovery
    description: Search and exploration
    components:
      - id: knowledge-exploration
        name: Knowledge Exploration
`

	tmpDir := t.TempDir()
	vmFile := filepath.Join(tmpDir, "product.value_model.yaml")
	if err := os.WriteFile(vmFile, []byte(vmYAML), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}

	tests := []struct {
		name       string
		resolution *valuemodel.PathResolution
		wantLine   uint32
	}{
		{
			name: "resolve to layer",
			resolution: &valuemodel.PathResolution{
				Layer: &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
			},
			wantLine: yamlToLSPLine(5), // "- id: memory-reasoning" is line 5
		},
		{
			name: "resolve to component",
			resolution: &valuemodel.PathResolution{
				Layer:     &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
				Component: &valuemodel.Component{ID: "knowledge-graph", Name: "Knowledge Graph"},
			},
			wantLine: yamlToLSPLine(9), // "- id: knowledge-graph" is line 9
		},
		{
			name: "resolve to sub-component",
			resolution: &valuemodel.PathResolution{
				Layer:        &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
				Component:    &valuemodel.Component{ID: "knowledge-graph", Name: "Knowledge Graph"},
				SubComponent: &valuemodel.SubComponent{ID: "entity-storage", Name: "Entity Storage"},
			},
			wantLine: yamlToLSPLine(12), // "- id: entity-storage" is line 12
		},
		{
			name: "resolve to second sub-component",
			resolution: &valuemodel.PathResolution{
				Layer:        &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
				Component:    &valuemodel.Component{ID: "knowledge-graph", Name: "Knowledge Graph"},
				SubComponent: &valuemodel.SubComponent{ID: "relationship-mapping", Name: "Relationship Mapping"},
			},
			wantLine: yamlToLSPLine(14), // "- id: relationship-mapping" is line 14
		},
		{
			name: "resolve to second component",
			resolution: &valuemodel.PathResolution{
				Layer:     &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
				Component: &valuemodel.Component{ID: "vector-search", Name: "Vector Search"},
			},
			wantLine: yamlToLSPLine(16), // "- id: vector-search" is line 16
		},
		{
			name: "resolve to second layer",
			resolution: &valuemodel.PathResolution{
				Layer: &valuemodel.Layer{ID: "discovery", Name: "Discovery"},
			},
			wantLine: yamlToLSPLine(21), // "- id: discovery" is line 21
		},
		{
			name: "nil layer returns 0",
			resolution: &valuemodel.PathResolution{
				Layer: nil,
			},
			wantLine: 0,
		},
		{
			name: "non-existent layer returns 0",
			resolution: &valuemodel.PathResolution{
				Layer: &valuemodel.Layer{ID: "nonexistent", Name: "Nonexistent"},
			},
			wantLine: 0,
		},
		{
			name: "non-existent component falls back to layer line",
			resolution: &valuemodel.PathResolution{
				Layer:     &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
				Component: &valuemodel.Component{ID: "nonexistent", Name: "Nonexistent"},
			},
			wantLine: yamlToLSPLine(5), // falls back to layer
		},
		{
			name: "non-existent sub-component falls back to component line",
			resolution: &valuemodel.PathResolution{
				Layer:        &valuemodel.Layer{ID: "memory-reasoning", Name: "Memory & Reasoning Engine"},
				Component:    &valuemodel.Component{ID: "knowledge-graph", Name: "Knowledge Graph"},
				SubComponent: &valuemodel.SubComponent{ID: "nonexistent", Name: "Nonexistent"},
			},
			wantLine: yamlToLSPLine(9), // falls back to component
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findValueModelNodeLine(vmFile, tt.resolution)
			if got != tt.wantLine {
				t.Errorf("findValueModelNodeLine() = %d, want %d", got, tt.wantLine)
			}
		})
	}

	t.Run("non-existent file returns 0", func(t *testing.T) {
		got := findValueModelNodeLine("/nonexistent/file.yaml", &valuemodel.PathResolution{
			Layer: &valuemodel.Layer{ID: "test", Name: "Test"},
		})
		if got != 0 {
			t.Errorf("expected 0 for non-existent file, got %d", got)
		}
	})

	t.Run("invalid YAML returns 0", func(t *testing.T) {
		badFile := filepath.Join(tmpDir, "bad.yaml")
		if err := os.WriteFile(badFile, []byte("{{not yaml"), 0644); err != nil {
			t.Fatalf("failed to write bad file: %v", err)
		}
		got := findValueModelNodeLine(badFile, &valuemodel.PathResolution{
			Layer: &valuemodel.Layer{ID: "test", Name: "Test"},
		})
		if got != 0 {
			t.Errorf("expected 0 for invalid YAML, got %d", got)
		}
	})
}

// --- findValueModelNodeLine with sub_components key variant ---

func TestFindValueModelNodeLineSubComponentsKey(t *testing.T) {
	// Test with "sub_components" key instead of "subs"
	vmYAML := `layers:
  - id: test-layer
    name: Test Layer
    components:
      - id: test-comp
        name: Test Component
        sub_components:
          - id: test-sub
            name: Test Sub
`

	tmpDir := t.TempDir()
	vmFile := filepath.Join(tmpDir, "test.value_model.yaml")
	if err := os.WriteFile(vmFile, []byte(vmYAML), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}

	resolution := &valuemodel.PathResolution{
		Layer:        &valuemodel.Layer{ID: "test-layer", Name: "Test Layer"},
		Component:    &valuemodel.Component{ID: "test-comp", Name: "Test Component"},
		SubComponent: &valuemodel.SubComponent{ID: "test-sub", Name: "Test Sub"},
	}

	got := findValueModelNodeLine(vmFile, resolution)
	expectedLine := yamlToLSPLine(8) // "- id: test-sub" is line 8
	if got != expectedLine {
		t.Errorf("findValueModelNodeLine() with sub_components key = %d, want %d", got, expectedLine)
	}
}

// --- findValueModelNodeLine component without subs ---

func TestFindValueModelNodeLineNoSubs(t *testing.T) {
	// Component has no subs/sub_components at all — should fall back to component line
	vmYAML := `layers:
  - id: test-layer
    name: Test Layer
    components:
      - id: test-comp
        name: Test Component
`

	tmpDir := t.TempDir()
	vmFile := filepath.Join(tmpDir, "test.value_model.yaml")
	if err := os.WriteFile(vmFile, []byte(vmYAML), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}

	resolution := &valuemodel.PathResolution{
		Layer:        &valuemodel.Layer{ID: "test-layer", Name: "Test Layer"},
		Component:    &valuemodel.Component{ID: "test-comp", Name: "Test Component"},
		SubComponent: &valuemodel.SubComponent{ID: "any-sub", Name: "Any Sub"},
	}

	got := findValueModelNodeLine(vmFile, resolution)
	// Should fall back to component line since there are no subs
	expectedLine := yamlToLSPLine(5) // "- id: test-comp" is line 5
	if got != expectedLine {
		t.Errorf("findValueModelNodeLine() without subs = %d, want %d", got, expectedLine)
	}
}

// --- Helper to parse YAML mapping nodes for matchesIDOrName tests ---

type yamlNodeForTest struct {
	node *yaml.Node
}

func parseYAMLMapping(t *testing.T, content string) *yamlNodeForTest {
	t.Helper()

	var docNode yaml.Node
	if err := yaml.Unmarshal([]byte(content), &docNode); err != nil {
		t.Fatalf("failed to parse YAML: %v", err)
	}

	if docNode.Kind != yaml.DocumentNode || len(docNode.Content) == 0 {
		t.Fatal("expected document node with content")
	}

	return &yamlNodeForTest{node: docNode.Content[0]}
}
