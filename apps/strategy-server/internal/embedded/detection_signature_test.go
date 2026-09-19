package embedded

import (
	"encoding/json"
	"testing"
)

// declaredProperties collects every top-level property a schema declares,
// following allOf and the $refs inside it so a type that extends a base schema
// reports the base's properties as its own.
func declaredProperties(t *testing.T, src SchemaSource, file string, seen map[string]bool) map[string]json.RawMessage {
	t.Helper()
	out := map[string]json.RawMessage{}
	if seen[file] {
		return out
	}
	seen[file] = true

	b, err := src.GetSchemaBytes(file)
	if err != nil {
		t.Fatalf("schema %s: %v", file, err)
	}
	var doc struct {
		Properties map[string]json.RawMessage `json:"properties"`
		AllOf      []json.RawMessage          `json:"allOf"`
	}
	if err := json.Unmarshal(b, &doc); err != nil {
		t.Fatalf("schema %s: %v", file, err)
	}
	for k, v := range doc.Properties {
		out[k] = v
	}
	for _, part := range doc.AllOf {
		var ref struct {
			Ref string `json:"$ref"`
		}
		if err := json.Unmarshal(part, &ref); err == nil && ref.Ref != "" {
			for k, v := range declaredProperties(t, src, ref.Ref, seen) {
				if _, exists := out[k]; !exists {
					out[k] = v
				}
			}
			continue
		}
		var inline struct {
			Properties map[string]json.RawMessage `json:"properties"`
		}
		if err := json.Unmarshal(part, &inline); err == nil {
			for k, v := range inline.Properties {
				out[k] = v
			}
		}
	}
	return out
}

// TestEverySignatureKeyIsDeclaredBySchema.
//
// A signature naming a key its schema does not declare can never match a valid
// artifact, and the failure is silent: the type is simply never detected, and a
// consumer relying on auto-detection is told "unknown" forever with nothing to
// indicate a bug rather than an unusual payload.
//
// This is not hypothetical. Before the table was rebuilt from the schemas, nine
// of seventeen entries named undeclared keys — including all three track
// definitions and value_model — and on a real 177-artifact instance 146
// artifacts could not be classified.
func TestEverySignatureKeyIsDeclaredBySchema(t *testing.T) {
	src := EmbeddedSchemaSource()
	for _, sig := range payloadSignatures {
		file, ok := artifactTypeToSchema[sig.artifactType]
		if !ok {
			t.Errorf("signature %q has no registered schema", sig.artifactType)
			continue
		}
		props := declaredProperties(t, src, file, map[string]bool{})
		if len(props) == 0 {
			t.Errorf("%s: schema %s declares no properties to match against", sig.artifactType, file)
			continue
		}
		for _, k := range sig.keys {
			if _, ok := props[k]; !ok {
				t.Errorf("%s: signature key %q is not a property of %s, so this type can never be detected",
					sig.artifactType, k, file)
			}
		}
		for k := range sig.values {
			if _, ok := props[k]; !ok {
				t.Errorf("%s: signature pins %q, which is not a property of %s",
					sig.artifactType, k, file)
			}
		}
	}
}

// TestPinnedValuesMatchTheSchemaConst.
//
// Where a signature discriminates on a value, that value must be the one the
// schema pins with const. Otherwise detection and validation disagree: a
// payload routed to a schema by the signature would then fail that schema on
// the very field used to choose it.
func TestPinnedValuesMatchTheSchemaConst(t *testing.T) {
	src := EmbeddedSchemaSource()
	for _, sig := range payloadSignatures {
		if len(sig.values) == 0 {
			continue
		}
		props := declaredProperties(t, src, artifactTypeToSchema[sig.artifactType], map[string]bool{})
		for k, want := range sig.values {
			var decl struct {
				Const *string `json:"const"`
			}
			if err := json.Unmarshal(props[k], &decl); err != nil {
				t.Errorf("%s: property %q: %v", sig.artifactType, k, err)
				continue
			}
			if decl.Const == nil {
				t.Errorf("%s: signature pins %q=%q but the schema does not fix it with const, so the pin is a guess",
					sig.artifactType, k, want)
				continue
			}
			if *decl.Const != want {
				t.Errorf("%s: signature pins %q=%q but the schema's const is %q",
					sig.artifactType, k, want, *decl.Const)
			}
		}
	}
}

// TestEverySignatureDetectsItsOwnType.
//
// Builds the minimal payload each signature describes and asserts detection
// returns that type. Catches shadowing: an entry whose keys are a subset of a
// later one's would swallow it, and the later type would never be reachable
// however correct its signature.
func TestEverySignatureDetectsItsOwnType(t *testing.T) {
	for _, sig := range payloadSignatures {
		payload := map[string]any{}
		for _, k := range sig.keys {
			payload[k] = "x"
		}
		for k, v := range sig.values {
			payload[k] = v
		}
		b, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("%s: %v", sig.artifactType, err)
		}
		got, ok := DetectArtifactType(b)
		if !ok {
			t.Errorf("%s: its own minimal payload was not detected at all", sig.artifactType)
			continue
		}
		if got != sig.artifactType {
			t.Errorf("%s: its own minimal payload detects as %q — an earlier signature shadows it",
				sig.artifactType, got)
		}
	}
}

// TestTrackDefinitionsAreSeparatedByTrack.
//
// The three definition families share one base schema and are structurally
// identical — the same top-level keys — so key presence alone cannot tell them
// apart. This is the case that made values necessary.
func TestTrackDefinitionsAreSeparatedByTrack(t *testing.T) {
	base := func(track string) []byte {
		m := map[string]any{}
		for _, k := range trackDefinitionKeys {
			m[k] = "x"
		}
		m["track"] = track
		b, _ := json.Marshal(m)
		return b
	}
	for track, want := range map[string]string{
		"org_ops":    "org_ops_def",
		"strategy":   "strategy_def",
		"commercial": "commercial_def",
	} {
		got, ok := DetectArtifactType(base(track))
		if !ok || got != want {
			t.Errorf("track %q detected as %q (ok=%v); want %q", track, got, ok, want)
		}
	}

	// A track the definitions do not claim must not be forced into one of them.
	if got, ok := DetectArtifactType(base("product")); ok && got != "feature" {
		t.Errorf("track \"product\" detected as %q; no definition schema claims it", got)
	}

	// A non-string track must not panic or match.
	m := map[string]any{}
	for _, k := range trackDefinitionKeys {
		m[k] = "x"
	}
	m["track"] = []string{"org_ops"}
	b, _ := json.Marshal(m)
	if got, ok := DetectArtifactType(b); ok {
		t.Errorf("a non-string track matched %q", got)
	}
}
