package lsp

import (
	"encoding/json"
	"os"
	"testing"

	"gopkg.in/yaml.v3"
)

// ---------------------------------------------------------------------------
// ResolveYAMLPosition tests
// ---------------------------------------------------------------------------

func TestResolveYAMLPosition_SimpleMapping(t *testing.T) {
	content := []byte(`name: hello
version: "1.0"
description: A thing
`)

	tests := []struct {
		name      string
		line      uint32
		character uint32
		wantPath  string
		wantIsKey bool
		wantIsVal bool
		wantKey   string
	}{
		{
			name:      "cursor on key 'name'",
			line:      0,
			character: 0,
			wantPath:  "name",
			wantIsKey: true,
			wantKey:   "name",
		},
		{
			name:      "cursor on value 'hello'",
			line:      0,
			character: 8,
			wantPath:  "name",
			wantIsVal: true,
			wantKey:   "name",
		},
		{
			name:      "cursor on key 'version'",
			line:      1,
			character: 0,
			wantPath:  "version",
			wantIsKey: true,
			wantKey:   "version",
		},
		{
			name:      "cursor on key 'description'",
			line:      2,
			character: 0,
			wantPath:  "description",
			wantIsKey: true,
			wantKey:   "description",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := ResolveYAMLPosition(content, tt.line, tt.character)
			if pos.SchemaPath != tt.wantPath {
				t.Errorf("SchemaPath = %q, want %q", pos.SchemaPath, tt.wantPath)
			}
			if pos.IsKey != tt.wantIsKey {
				t.Errorf("IsKey = %v, want %v", pos.IsKey, tt.wantIsKey)
			}
			if pos.IsValue != tt.wantIsVal {
				t.Errorf("IsValue = %v, want %v", pos.IsValue, tt.wantIsVal)
			}
			if pos.Key != tt.wantKey {
				t.Errorf("Key = %q, want %q", pos.Key, tt.wantKey)
			}
		})
	}
}

func TestResolveYAMLPosition_NestedMapping(t *testing.T) {
	content := []byte(`north_star:
  vision:
    vision_statement: "We see a world where..."
    timeframe: "10 years"
  mission:
    mission_statement: "To empower..."
`)

	tests := []struct {
		name      string
		line      uint32
		character uint32
		wantPath  string
		wantIsKey bool
		wantIsVal bool
		wantKey   string
	}{
		{
			name:      "top-level key 'north_star'",
			line:      0,
			character: 0,
			wantPath:  "north_star",
			wantIsKey: true,
			wantKey:   "north_star",
		},
		{
			name:      "second-level key 'vision'",
			line:      1,
			character: 2,
			wantPath:  "north_star.vision",
			wantIsKey: true,
			wantKey:   "vision",
		},
		{
			name:      "third-level key 'vision_statement'",
			line:      2,
			character: 4,
			wantPath:  "north_star.vision.vision_statement",
			wantIsKey: true,
			wantKey:   "vision_statement",
		},
		{
			name:      "third-level value for vision_statement",
			line:      2,
			character: 30,
			wantPath:  "north_star.vision.vision_statement",
			wantIsVal: true,
			wantKey:   "vision_statement",
		},
		{
			name:      "second-level key 'mission'",
			line:      4,
			character: 2,
			wantPath:  "north_star.mission",
			wantIsKey: true,
			wantKey:   "mission",
		},
		{
			name:      "third-level key 'mission_statement'",
			line:      5,
			character: 4,
			wantPath:  "north_star.mission.mission_statement",
			wantIsKey: true,
			wantKey:   "mission_statement",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := ResolveYAMLPosition(content, tt.line, tt.character)
			if pos.SchemaPath != tt.wantPath {
				t.Errorf("SchemaPath = %q, want %q", pos.SchemaPath, tt.wantPath)
			}
			if pos.IsKey != tt.wantIsKey {
				t.Errorf("IsKey = %v, want %v", pos.IsKey, tt.wantIsKey)
			}
			if pos.IsValue != tt.wantIsVal {
				t.Errorf("IsValue = %v, want %v", pos.IsValue, tt.wantIsVal)
			}
			if pos.Key != tt.wantKey {
				t.Errorf("Key = %q, want %q", pos.Key, tt.wantKey)
			}
		})
	}
}

func TestResolveYAMLPosition_Sequence(t *testing.T) {
	content := []byte(`items:
  - name: first
    value: 1
  - name: second
    value: 2
`)

	tests := []struct {
		name     string
		line     uint32
		char     uint32
		wantPath string
		wantKey  string
	}{
		{
			name:     "top-level key 'items'",
			line:     0,
			char:     0,
			wantPath: "items",
			wantKey:  "items",
		},
		{
			name:     "first array item key 'name'",
			line:     1,
			char:     4,
			wantPath: "items.name",
			wantKey:  "name",
		},
		{
			name:     "first array item key 'value'",
			line:     2,
			char:     4,
			wantPath: "items.value",
			wantKey:  "value",
		},
		{
			name:     "second array item key 'name'",
			line:     3,
			char:     4,
			wantPath: "items.name",
			wantKey:  "name",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := ResolveYAMLPosition(content, tt.line, tt.char)
			if pos.SchemaPath != tt.wantPath {
				t.Errorf("SchemaPath = %q, want %q", pos.SchemaPath, tt.wantPath)
			}
			if pos.Key != tt.wantKey {
				t.Errorf("Key = %q, want %q", pos.Key, tt.wantKey)
			}
		})
	}
}

func TestResolveYAMLPosition_EmptyContent(t *testing.T) {
	pos := ResolveYAMLPosition([]byte{}, 0, 0)
	if pos.SchemaPath != "" {
		t.Errorf("SchemaPath = %q, want empty", pos.SchemaPath)
	}
}

func TestResolveYAMLPosition_InvalidYAML(t *testing.T) {
	content := []byte(`{invalid: [yaml: broken`)
	pos := ResolveYAMLPosition(content, 0, 0)
	if pos.SchemaPath != "" {
		t.Errorf("SchemaPath = %q, want empty", pos.SchemaPath)
	}
}

func TestResolveYAMLPosition_Depth(t *testing.T) {
	content := []byte(`a:
  b:
    c: value
`)

	pos := ResolveYAMLPosition(content, 2, 4) // "c: value"
	if pos.Depth != 3 {
		t.Errorf("Depth = %d, want 3", pos.Depth)
	}
	if pos.SchemaPath != "a.b.c" {
		t.Errorf("SchemaPath = %q, want %q", pos.SchemaPath, "a.b.c")
	}
}

func TestResolveYAMLPosition_RealNorthStarStructure(t *testing.T) {
	// Mimics the structure of a real north_star artifact
	content := []byte(`north_star:
  vision:
    vision_statement: "We see a world where knowledge flows freely"
    timeframe: "10 years"
  mission:
    mission_statement: "To empower builders with AI-native tools"
    what_we_do:
      - "Build knowledge graphs"
      - "Provide AI-native interfaces"
  purpose:
    problem_we_solve: "Knowledge is trapped in silos"
`)

	tests := []struct {
		name     string
		line     uint32
		char     uint32
		wantPath string
	}{
		{"north_star root", 0, 0, "north_star"},
		{"vision section", 1, 2, "north_star.vision"},
		{"vision_statement key", 2, 4, "north_star.vision.vision_statement"},
		{"mission section", 4, 2, "north_star.mission"},
		{"mission_statement key", 5, 4, "north_star.mission.mission_statement"},
		{"what_we_do key", 6, 4, "north_star.mission.what_we_do"},
		{"what_we_do first item", 7, 8, "north_star.mission.what_we_do"},
		{"purpose section", 9, 2, "north_star.purpose"},
		{"problem_we_solve", 10, 4, "north_star.purpose.problem_we_solve"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := ResolveYAMLPosition(content, tt.line, tt.char)
			if pos.SchemaPath != tt.wantPath {
				t.Errorf("SchemaPath = %q, want %q", pos.SchemaPath, tt.wantPath)
			}
		})
	}
}

func TestResolveYAMLPosition_RealFile(t *testing.T) {
	path := testdataPath("../../docs/EPF/_instances/emergent/READY/00_north_star.yaml")
	content, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("Skipping real file test: %v", err)
	}

	// Parse to find the actual line numbers for known keys
	var doc yaml.Node
	if err := yaml.Unmarshal(content, &doc); err != nil {
		t.Fatalf("Failed to parse north_star: %v", err)
	}

	// The root should be a DocumentNode wrapping a MappingNode
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		t.Fatal("Expected DocumentNode with content")
	}
	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		t.Fatalf("Expected MappingNode, got kind %d", root.Kind)
	}

	// Find the first key — should be "north_star"
	firstKey := root.Content[0]
	if firstKey.Value != "north_star" {
		t.Fatalf("Expected first key 'north_star', got %q", firstKey.Value)
	}

	// Test: cursor on line of "north_star" key
	pos := ResolveYAMLPosition(content, uint32(firstKey.Line-1), uint32(firstKey.Column-1))
	if pos.SchemaPath != "north_star" {
		t.Errorf("At north_star key: SchemaPath = %q, want %q", pos.SchemaPath, "north_star")
	}
	if !pos.IsKey {
		t.Error("Expected IsKey=true at north_star key")
	}
}

func TestResolveYAMLPosition_NodeIsSet(t *testing.T) {
	content := []byte(`key: value`)
	pos := ResolveYAMLPosition(content, 0, 7) // on "value"
	if pos.Node == nil {
		t.Fatal("Node should not be nil")
	}
	if pos.Node.Value != "value" {
		t.Errorf("Node.Value = %q, want %q", pos.Node.Value, "value")
	}
}

func TestResolveYAMLPosition_ParentNodeIsSet(t *testing.T) {
	content := []byte(`parent:
  child: val
`)
	pos := ResolveYAMLPosition(content, 1, 2) // on "child" key
	if pos.ParentNode == nil {
		t.Fatal("ParentNode should not be nil")
	}
	if pos.ParentNode.Kind != yaml.MappingNode {
		t.Errorf("ParentNode.Kind = %d, want MappingNode (%d)", pos.ParentNode.Kind, yaml.MappingNode)
	}
}

// ---------------------------------------------------------------------------
// ResolveSchemaPath tests
// ---------------------------------------------------------------------------

// Minimal JSON Schema for testing
var testSchema = json.RawMessage(`{
	"type": "object",
	"properties": {
		"north_star": {
			"type": "object",
			"description": "The north star artifact",
			"required": ["vision", "mission"],
			"properties": {
				"vision": {
					"type": "object",
					"description": "Product vision section",
					"required": ["vision_statement"],
					"properties": {
						"vision_statement": {
							"type": "string",
							"description": "The compelling vision statement",
							"minLength": 50
						},
						"timeframe": {
							"type": "string",
							"description": "Vision timeframe"
						}
					}
				},
				"mission": {
					"type": "object",
					"description": "Product mission section",
					"properties": {
						"mission_statement": {
							"type": "string",
							"description": "The mission statement"
						}
					}
				},
				"status": {
					"type": "string",
					"description": "Artifact status",
					"enum": ["draft", "ready", "in-progress", "delivered"]
				}
			}
		}
	}
}`)

func TestResolveSchemaPath_Basic(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		wantName    string
		wantType    string
		wantDesc    string
		wantNil     bool
		wantReq     bool
		wantMinLen  *int
		wantEnumLen int
	}{
		{
			name:     "top-level property",
			path:     "north_star",
			wantName: "north_star",
			wantType: "object",
			wantDesc: "The north star artifact",
		},
		{
			name:     "nested object",
			path:     "north_star.vision",
			wantName: "vision",
			wantType: "object",
			wantDesc: "Product vision section",
			wantReq:  true, // vision is required in north_star
		},
		{
			name:       "leaf string with minLength",
			path:       "north_star.vision.vision_statement",
			wantName:   "vision_statement",
			wantType:   "string",
			wantDesc:   "The compelling vision statement",
			wantReq:    true, // vision_statement is required in vision
			wantMinLen: intPtr(50),
		},
		{
			name:        "string with enum",
			path:        "north_star.status",
			wantName:    "status",
			wantType:    "string",
			wantDesc:    "Artifact status",
			wantEnumLen: 4,
		},
		{
			name:    "invalid path",
			path:    "north_star.nonexistent",
			wantNil: true,
		},
		{
			name:    "empty path",
			path:    "",
			wantNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info := ResolveSchemaPath(testSchema, tt.path)
			if tt.wantNil {
				if info != nil {
					t.Errorf("expected nil, got %+v", info)
				}
				return
			}
			if info == nil {
				t.Fatal("expected non-nil SchemaPropertyInfo")
			}
			if info.Name != tt.wantName {
				t.Errorf("Name = %q, want %q", info.Name, tt.wantName)
			}
			if info.Type != tt.wantType {
				t.Errorf("Type = %q, want %q", info.Type, tt.wantType)
			}
			if info.Description != tt.wantDesc {
				t.Errorf("Description = %q, want %q", info.Description, tt.wantDesc)
			}
			if info.Required != tt.wantReq {
				t.Errorf("Required = %v, want %v", info.Required, tt.wantReq)
			}
			if tt.wantMinLen != nil {
				if info.MinLength == nil || *info.MinLength != *tt.wantMinLen {
					t.Errorf("MinLength = %v, want %v", info.MinLength, *tt.wantMinLen)
				}
			}
			if tt.wantEnumLen > 0 {
				if len(info.Enum) != tt.wantEnumLen {
					t.Errorf("len(Enum) = %d, want %d", len(info.Enum), tt.wantEnumLen)
				}
			}
		})
	}
}

func TestResolveSchemaPath_EmptySchema(t *testing.T) {
	info := ResolveSchemaPath(nil, "anything")
	if info != nil {
		t.Errorf("expected nil for nil schema, got %+v", info)
	}

	info = ResolveSchemaPath(json.RawMessage(`{}`), "anything")
	if info != nil {
		t.Errorf("expected nil for empty schema, got %+v", info)
	}
}

func TestResolveSchemaPath_InvalidJSON(t *testing.T) {
	info := ResolveSchemaPath(json.RawMessage(`{invalid`), "north_star")
	if info != nil {
		t.Errorf("expected nil for invalid JSON, got %+v", info)
	}
}

// ---------------------------------------------------------------------------
// GetChildProperties tests
// ---------------------------------------------------------------------------

func TestGetChildProperties_Root(t *testing.T) {
	props := GetChildProperties(testSchema, "")
	if len(props) == 0 {
		t.Fatal("expected at least one child property at root")
	}

	found := false
	for _, p := range props {
		if p.Name == "north_star" {
			found = true
			if p.Type != "object" {
				t.Errorf("north_star.Type = %q, want %q", p.Type, "object")
			}
			break
		}
	}
	if !found {
		t.Error("expected to find 'north_star' in root properties")
	}
}

func TestGetChildProperties_NestedObject(t *testing.T) {
	props := GetChildProperties(testSchema, "north_star")
	if len(props) == 0 {
		t.Fatal("expected child properties under north_star")
	}

	names := make(map[string]bool)
	for _, p := range props {
		names[p.Name] = true
	}

	for _, expected := range []string{"vision", "mission", "status"} {
		if !names[expected] {
			t.Errorf("expected to find %q in north_star children, got %v", expected, names)
		}
	}
}

func TestGetChildProperties_DeeplyNested(t *testing.T) {
	props := GetChildProperties(testSchema, "north_star.vision")
	if len(props) == 0 {
		t.Fatal("expected child properties under north_star.vision")
	}

	names := make(map[string]bool)
	for _, p := range props {
		names[p.Name] = true
	}

	if !names["vision_statement"] {
		t.Error("expected 'vision_statement' in vision children")
	}
	if !names["timeframe"] {
		t.Error("expected 'timeframe' in vision children")
	}
}

func TestGetChildProperties_LeafNode(t *testing.T) {
	// A string leaf has no children
	props := GetChildProperties(testSchema, "north_star.vision.vision_statement")
	if len(props) != 0 {
		t.Errorf("expected no children for leaf string, got %d", len(props))
	}
}

func TestGetChildProperties_InvalidPath(t *testing.T) {
	props := GetChildProperties(testSchema, "north_star.nonexistent.deep")
	if len(props) != 0 {
		t.Errorf("expected no children for invalid path, got %d", len(props))
	}
}

func TestGetChildProperties_EmptySchema(t *testing.T) {
	props := GetChildProperties(nil, "")
	if props != nil {
		t.Errorf("expected nil for nil schema, got %v", props)
	}
}

func TestGetChildProperties_RequiredFlag(t *testing.T) {
	props := GetChildProperties(testSchema, "north_star")

	for _, p := range props {
		switch p.Name {
		case "vision":
			if !p.Required {
				t.Error("vision should be required under north_star")
			}
		case "mission":
			if !p.Required {
				t.Error("mission should be required under north_star")
			}
		case "status":
			if p.Required {
				t.Error("status should not be required under north_star")
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Schema with arrays — test array navigation
// ---------------------------------------------------------------------------

var testSchemaWithArrays = json.RawMessage(`{
	"type": "object",
	"properties": {
		"feature": {
			"type": "object",
			"properties": {
				"personas": {
					"type": "array",
					"description": "Target personas",
					"minItems": 1,
					"maxItems": 4,
					"items": {
						"type": "object",
						"required": ["name"],
						"properties": {
							"name": {
								"type": "string",
								"description": "Persona name"
							},
							"role": {
								"type": "string",
								"description": "Persona role"
							}
						}
					}
				},
				"tags": {
					"type": "array",
					"description": "Feature tags",
					"items": {
						"type": "string"
					}
				}
			}
		}
	}
}`)

func TestResolveSchemaPath_Array(t *testing.T) {
	info := ResolveSchemaPath(testSchemaWithArrays, "feature.personas")
	if info == nil {
		t.Fatal("expected non-nil for array property")
	}
	if info.Type != "array" {
		t.Errorf("Type = %q, want %q", info.Type, "array")
	}
	if info.Description != "Target personas" {
		t.Errorf("Description = %q, want %q", info.Description, "Target personas")
	}
	if info.MinItems == nil || *info.MinItems != 1 {
		t.Errorf("MinItems = %v, want 1", info.MinItems)
	}
	if info.MaxItems == nil || *info.MaxItems != 4 {
		t.Errorf("MaxItems = %v, want 4", info.MaxItems)
	}
}

func TestGetChildProperties_ArrayItems(t *testing.T) {
	// GetChildProperties for an array path should return the items' properties
	props := GetChildProperties(testSchemaWithArrays, "feature.personas")
	if len(props) == 0 {
		t.Fatal("expected child properties for array items")
	}

	names := make(map[string]bool)
	for _, p := range props {
		names[p.Name] = true
	}

	if !names["name"] {
		t.Error("expected 'name' in persona item children")
	}
	if !names["role"] {
		t.Error("expected 'role' in persona item children")
	}
}

func TestGetChildProperties_StringArray(t *testing.T) {
	// A string array has no object children
	props := GetChildProperties(testSchemaWithArrays, "feature.tags")
	if len(props) != 0 {
		t.Errorf("expected no children for string array, got %d", len(props))
	}
}

// ---------------------------------------------------------------------------
// GetSchemaForArtifact tests — requires real validator
// ---------------------------------------------------------------------------

func TestGetSchemaForArtifact_NorthStar(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	schemaJSON := GetSchemaForArtifact(srv.loader, "north_star")
	if len(schemaJSON) == 0 {
		t.Fatal("expected non-empty schema for north_star")
	}

	// Verify it's valid JSON
	var m map[string]any
	if err := json.Unmarshal(schemaJSON, &m); err != nil {
		t.Fatalf("schema is not valid JSON: %v", err)
	}

	// Should have "properties" at top level
	if _, ok := m["properties"]; !ok {
		t.Error("expected 'properties' key in north_star schema")
	}
}

func TestGetSchemaForArtifact_FeatureDefinition(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	schemaJSON := GetSchemaForArtifact(srv.loader, "feature_definition")
	if len(schemaJSON) == 0 {
		t.Fatal("expected non-empty schema for feature_definition")
	}

	// Verify it parses
	var m map[string]any
	if err := json.Unmarshal(schemaJSON, &m); err != nil {
		t.Fatalf("schema is not valid JSON: %v", err)
	}
}

func TestGetSchemaForArtifact_Unknown(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	schemaJSON := GetSchemaForArtifact(srv.loader, "nonexistent_type")
	if schemaJSON != nil {
		t.Errorf("expected nil for unknown artifact type, got %d bytes", len(schemaJSON))
	}
}

// ---------------------------------------------------------------------------
// Integration: ResolveSchemaPath with real schemas
// ---------------------------------------------------------------------------

func TestResolveSchemaPath_RealNorthStarSchema(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	schemaJSON := GetSchemaForArtifact(srv.loader, "north_star")
	if len(schemaJSON) == 0 {
		t.Skip("north_star schema not available")
	}

	// The north_star schema has a top-level "north_star" property
	info := ResolveSchemaPath(schemaJSON, "north_star")
	if info == nil {
		t.Fatal("expected to resolve 'north_star' in real schema")
	}
	if info.Type != "object" {
		t.Errorf("north_star.Type = %q, want 'object'", info.Type)
	}
}

func TestGetChildProperties_RealNorthStarSchema(t *testing.T) {
	srv, err := NewServer("")
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	schemaJSON := GetSchemaForArtifact(srv.loader, "north_star")
	if len(schemaJSON) == 0 {
		t.Skip("north_star schema not available")
	}

	props := GetChildProperties(schemaJSON, "north_star")
	if len(props) == 0 {
		t.Fatal("expected children under north_star in real schema")
	}

	// north_star should have vision, mission, purpose, values, meta among others
	names := make(map[string]bool)
	for _, p := range props {
		names[p.Name] = true
	}

	for _, expected := range []string{"vision", "mission", "purpose"} {
		if !names[expected] {
			t.Errorf("expected %q in north_star children, found: %v", expected, names)
		}
	}
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

func TestResolveYAMLPosition_BlankLineInMapping(t *testing.T) {
	content := []byte(`top:
  key1: val1

  key2: val2
`)
	// Line 2 (0-indexed) is blank between key1 and key2.
	// Since key1 spans from its line to (key2.Line - 1), the blank line
	// falls within key1's range, so the resolver reports it as part of key1.
	pos := ResolveYAMLPosition(content, 2, 0)
	// Accept key1 context or top mapping context
	if pos.SchemaPath != "top.key1" && pos.SchemaPath != "top" && pos.SchemaPath != "" {
		t.Errorf("SchemaPath on blank line = %q, want 'top.key1', 'top', or empty", pos.SchemaPath)
	}
}

func TestResolveYAMLPosition_ScalarOnly(t *testing.T) {
	content := []byte(`hello`)
	pos := ResolveYAMLPosition(content, 0, 0)
	// A bare scalar at root — limited information
	if pos.Node != nil && pos.Node.Value != "hello" {
		t.Errorf("Node.Value = %q, want %q", pos.Node.Value, "hello")
	}
}

func TestEstimateEndLine(t *testing.T) {
	tests := []struct {
		name string
		node *yaml.Node
		want int
	}{
		{
			name: "nil node",
			node: nil,
			want: 0,
		},
		{
			name: "scalar node",
			node: &yaml.Node{Kind: yaml.ScalarNode, Line: 5, Value: "hello"},
			want: 5,
		},
		{
			name: "multiline scalar",
			node: &yaml.Node{Kind: yaml.ScalarNode, Line: 5, Value: "line1\nline2\nline3"},
			want: 7,
		},
		{
			name: "empty mapping",
			node: &yaml.Node{Kind: yaml.MappingNode, Line: 3},
			want: 3,
		},
		{
			name: "mapping with children",
			node: &yaml.Node{
				Kind: yaml.MappingNode,
				Line: 3,
				Content: []*yaml.Node{
					{Kind: yaml.ScalarNode, Line: 4, Value: "key"},
					{Kind: yaml.ScalarNode, Line: 4, Value: "val"},
				},
			},
			want: 4,
		},
		{
			name: "empty sequence",
			node: &yaml.Node{Kind: yaml.SequenceNode, Line: 10},
			want: 10,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := estimateEndLine(tt.node)
			if got != tt.want {
				t.Errorf("estimateEndLine() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestJoinPath(t *testing.T) {
	tests := []struct {
		parts []string
		want  string
	}{
		{nil, ""},
		{[]string{}, ""},
		{[]string{"a"}, "a"},
		{[]string{"a", "b", "c"}, "a.b.c"},
	}
	for _, tt := range tests {
		got := joinPath(tt.parts)
		if got != tt.want {
			t.Errorf("joinPath(%v) = %q, want %q", tt.parts, got, tt.want)
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func intPtr(i int) *int {
	return &i
}
