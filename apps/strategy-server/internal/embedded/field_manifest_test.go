package embedded

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// TestDecomposerFieldsMatchSchemas verifies that every field path in the
// DecomposerFieldManifest exists in the corresponding JSON schema. This catches
// drift between the decomposer's extraction logic and the canonical EPF schemas.
//
// Run this test after syncing schemas from canonical-epf:
//
//	go test ./internal/embedded/... -run TestDecomposerFieldsMatchSchemas
func TestDecomposerFieldsMatchSchemas(t *testing.T) {
	if len(DecomposerFieldManifest) == 0 {
		t.Fatal("DecomposerFieldManifest is empty — this should never happen")
	}

	// Load and parse all referenced schemas once.
	schemaCache := make(map[string]map[string]any)

	for _, entry := range DecomposerFieldManifest {
		if _, ok := schemaCache[entry.SchemaFile]; ok {
			continue
		}
		raw, err := GetSchema(entry.SchemaFile)
		if err != nil {
			t.Fatalf("failed to load schema %q: %v", entry.SchemaFile, err)
		}
		var schema map[string]any
		if err := json.Unmarshal(raw, &schema); err != nil {
			t.Fatalf("failed to parse schema %q: %v", entry.SchemaFile, err)
		}
		schemaCache[entry.SchemaFile] = schema
	}

	// Verify each manifest entry against its schema.
	var failures []string
	for _, entry := range DecomposerFieldManifest {
		schema := schemaCache[entry.SchemaFile]
		if !resolveJSONPath(schema, entry.JSONPath) {
			failures = append(failures, fmt.Sprintf(
				"decomposer reads %q from %s but schema %s does not define it (function: %s)",
				entry.JSONPath, entry.ArtifactType, entry.SchemaFile, entry.DecomposerFunc))
		}
	}

	if len(failures) > 0 {
		t.Errorf("decomposer field manifest has %d path(s) not found in schemas:\n  %s",
			len(failures), strings.Join(failures, "\n  "))
	}

	t.Logf("verified %d field paths across %d schemas", len(DecomposerFieldManifest), len(schemaCache))
}

// TestManifestIsNotEmpty ensures the manifest has a reasonable number of entries.
// This catches accidental deletion of manifest entries.
func TestManifestIsNotEmpty(t *testing.T) {
	const minExpectedEntries = 30 // conservative lower bound
	if len(DecomposerFieldManifest) < minExpectedEntries {
		t.Errorf("DecomposerFieldManifest has only %d entries, expected at least %d — did entries get deleted?",
			len(DecomposerFieldManifest), minExpectedEntries)
	}
}

// resolveJSONPath walks the JSON schema's properties tree to verify a path exists.
// It handles dot-separated paths and array notation ("[]").
//
// Examples:
//
//	"name"                              → properties.name
//	"strategic_context.contributes_to"  → properties.strategic_context.properties.contributes_to
//	"definition.capabilities[].name"    → properties.definition.properties.capabilities.items.properties.name
func resolveJSONPath(schema map[string]any, path string) bool {
	segments := splitJSONPath(path)
	current := schema

	for _, seg := range segments {
		if seg == "[]" {
			// Navigate into items.
			items, ok := current["items"]
			if !ok {
				return false
			}
			itemsMap, ok := items.(map[string]any)
			if !ok {
				return false
			}
			current = itemsMap
			continue
		}

		// Navigate into properties.
		props, ok := current["properties"]
		if !ok {
			return false
		}
		propsMap, ok := props.(map[string]any)
		if !ok {
			return false
		}
		prop, ok := propsMap[seg]
		if !ok {
			return false
		}
		propMap, ok := prop.(map[string]any)
		if !ok {
			// Property exists but is not an object (e.g., a string type).
			// This is valid — the path resolves.
			return true
		}
		current = propMap
	}
	return true
}

// splitJSONPath splits "definition.capabilities[].name" into
// ["definition", "capabilities", "[]", "name"].
func splitJSONPath(path string) []string {
	var segments []string
	for _, part := range strings.Split(path, ".") {
		if strings.HasSuffix(part, "[]") {
			segments = append(segments, strings.TrimSuffix(part, "[]"))
			segments = append(segments, "[]")
		} else {
			segments = append(segments, part)
		}
	}
	return segments
}
