package embedded

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Every schema that uses a relative "$ref" must compile.
//
// This existed as a silent, total failure: commercial_definition_schema.json,
// org_ops_definition_schema.json and strategy_definition_schema.json each
// reference track_definition_base_schema.json, which is embedded and present,
// but the compiler was resolving the relative ref against the process working
// directory and failing to find it on disk.
//
// Nothing caught it because the failure did not look like a failure. Artifacts
// of those types came back Valid=false with a message about the schema, and
// that was counted as "invalid artifact" — 131 of them on the live instance,
// none of which had ever actually been checked against anything.
//
// The generic assertion matters more than the three known names: a new schema
// that adds a "$ref" must fail here rather than quietly stop validating.
func TestAllSchemasWithRefsCompile(t *testing.T) {
	entries, err := schemasFS.ReadDir("schemas")
	if err != nil {
		t.Fatalf("read embedded schemas: %v", err)
	}

	var withRefs []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		b, err := GetSchema(e.Name())
		if err != nil {
			t.Errorf("%s: cannot read: %v", e.Name(), err)
			continue
		}
		if !strings.Contains(string(b), `"$ref"`) {
			continue
		}
		withRefs = append(withRefs, e.Name())
	}

	if len(withRefs) == 0 {
		t.Fatal("no embedded schema contains a $ref — this test has stopped testing anything, " +
			"which most likely means the schemas moved rather than that the refs went away")
	}

	for _, name := range withRefs {
		artifactType := artifactTypeForSchema(name)
		if artifactType == "" {
			// Base/fragment schemas are only meaningful via a $ref from
			// another schema, so there is no artifact type to validate as.
			continue
		}

		// An empty object is not valid against these schemas, but it must
		// fail on CONTENT, not because the schema could not be built.
		res := ValidateArtifact(artifactType, []byte(`{}`))
		for _, f := range res.Findings {
			if f.Rule == ruleSchemaUnavailable {
				t.Errorf("%s (artifact type %q) could not be compiled, so artifacts of this type are "+
					"not being validated at all: %s", name, artifactType, f.Message)
			}
		}
	}
}

// TestTrackDefinitionRefResolvesFromEmbeddedFS pins the specific regression.
func TestTrackDefinitionRefResolvesFromEmbeddedFS(t *testing.T) {
	// Run from a directory that definitely does not contain the schemas, to
	// prove resolution no longer depends on the process working directory.
	orig, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(orig) })
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatalf("chdir: %v", err)
	}

	for _, artifactType := range []string{
		"commercial_def", "org_ops_def", "strategy_def",
	} {
		res := ValidateArtifact(artifactType, []byte(`{}`))
		for _, f := range res.Findings {
			if f.Rule == ruleSchemaUnavailable {
				t.Errorf("%s: schema still unresolvable from a foreign working directory: %s",
					artifactType, f.Message)
			}
		}
	}
}

// artifactTypeForSchema reverses artifactTypeToSchema. Returns "" when no
// artifact type maps to the file.
func artifactTypeForSchema(schemaFile string) string {
	for at, sf := range artifactTypeToSchema {
		if sf == schemaFile {
			return at
		}
	}
	return ""
}

// TestSchemaRefTargetsAreEmbedded catches the other half of the same class of
// bug: a $ref pointing at a file that was never vendored.
func TestSchemaRefTargetsAreEmbedded(t *testing.T) {
	entries, err := schemasFS.ReadDir("schemas")
	if err != nil {
		t.Fatalf("read embedded schemas: %v", err)
	}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		b, err := GetSchema(e.Name())
		if err != nil {
			t.Errorf("%s: %v", e.Name(), err)
			continue
		}
		var doc any
		if err := json.Unmarshal(b, &doc); err != nil {
			t.Errorf("%s: not valid JSON: %v", e.Name(), err)
			continue
		}
		for _, ref := range collectRefs(doc) {
			// Only local, relative file refs are our problem; "#/..." is
			// internal and absolute URLs are not resolved from the FS.
			if strings.HasPrefix(ref, "#") || strings.Contains(ref, "://") {
				continue
			}
			target := filepath.Base(strings.SplitN(ref, "#", 2)[0])
			if target == "" {
				continue
			}
			if _, err := GetSchema(target); err != nil {
				t.Errorf("%s references %q, which is not in the embedded schema set: %v",
					e.Name(), target, err)
			}
		}
	}
}

func collectRefs(node any) []string {
	var out []string
	switch v := node.(type) {
	case map[string]any:
		for k, child := range v {
			if k == "$ref" {
				if s, ok := child.(string); ok {
					out = append(out, s)
				}
				continue
			}
			out = append(out, collectRefs(child)...)
		}
	case []any:
		for _, child := range v {
			out = append(out, collectRefs(child)...)
		}
	}
	return out
}

// TestFindingsFlattenToLeaves pins that an applicator keyword does not swallow
// the problems underneath it.
//
// Before this, a definition artifact with 18 distinct field-level violations
// produced exactly one finding: rule "schema.allOf", no path, and all 18
// problems concatenated into one newline-delimited message. A consumer could
// neither act on that (nothing named a field) nor baseline it (fixing 17 of
// the 18 left an identical (key, rule, path) triple).
func TestFindingsFlattenToLeaves(t *testing.T) {
	// org_ops_def composes its constraints with allOf, so a payload that
	// violates several nested fields exercises the applicator path.
	payload := []byte(`{
		"id": "pd-001",
		"name": "x",
		"domain_context": {
			"anti_patterns": [{"not": "a string"}, {"also": "not"}],
			"best_practices": [{"nor": "this"}]
		}
	}`)

	res := ValidateArtifact("org_ops_def", payload)
	if res.Valid {
		t.Fatal("payload unexpectedly valid; this test needs a failing payload to be meaningful")
	}

	nested := 0
	for _, f := range res.Findings {
		if f.Path != "" {
			nested++
		}
	}
	if nested < 3 {
		t.Errorf("only %d findings carry a path; nested violations must report where they are", nested)
	}

	if len(res.Findings) < 3 {
		t.Fatalf("got %d findings for a payload with several distinct violations — "+
			"an applicator keyword is still collapsing them into one", len(res.Findings))
	}

	seen := map[string]bool{}
	for i, f := range res.Findings {
		if strings.Contains(f.Message, "\n") {
			t.Errorf("finding %d message spans multiple lines, so it is a subtree rather than a leaf: %q",
				i, f.Message)
		}
		switch f.Rule {
		case "schema.allOf", "schema.anyOf", "schema.oneOf", "schema.properties", "schema.items":
			t.Errorf("finding %d has applicator rule %q; findings must name the failing keyword "+
				"at the leaf, not the combinator above it", i, f.Rule)
		}
		// An empty path is correct for a violation at the document root
		// (a missing top-level property), but not for anything nested.
		key := f.Rule + "|" + f.Path
		if seen[key] {
			t.Errorf("duplicate finding identity %q — (rule, path) must be unique per problem", key)
		}
		seen[key] = true
	}
}
