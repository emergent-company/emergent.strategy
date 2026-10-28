package integrity_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
	"gopkg.in/yaml.v3"
)

func currentEmbedded(t *testing.T) map[string][]byte {
	t.Helper()
	paths, err := embedded.ListTemplates()
	if err != nil {
		t.Fatalf("ListTemplates: %v", err)
	}
	out := make(map[string][]byte, len(paths))
	for _, p := range paths {
		data, err := embedded.GetTemplate(p)
		if err != nil {
			t.Fatalf("GetTemplate %s: %v", p, err)
		}
		out["templates/"+p] = data
	}
	return out
}

func embeddedClassifier(t *testing.T) *integrity.Classifier {
	t.Helper()
	c, err := integrity.NewClassifier(embedded.IntegrityManifest, func() (map[string][]byte, error) {
		return currentEmbedded(t), nil
	})
	if err != nil {
		t.Fatalf("NewClassifier: %v", err)
	}
	return c
}

// payloadOf renders a YAML document the way the importer stores it: parsed and
// marshalled to JSON.
func payloadOf(t *testing.T, y []byte) []byte {
	t.Helper()
	var doc any
	if err := yaml.Unmarshal(y, &doc); err != nil {
		t.Fatalf("yaml: %v", err)
	}
	b, err := json.Marshal(normalise(doc))
	if err != nil {
		t.Fatalf("json: %v", err)
	}
	return b
}

func normalise(v any) any {
	switch val := v.(type) {
	case map[string]any:
		for k, vv := range val {
			val[k] = normalise(vv)
		}
		return val
	case map[any]any:
		out := map[string]any{}
		for k, vv := range val {
			out[fmt.Sprintf("%v", k)] = normalise(vv)
		}
		return out
	case []any:
		for i, vv := range val {
			val[i] = normalise(vv)
		}
		return val
	}
	return v
}

// Every file the binary ships must be recognised as itself, in the current
// release, through the stored-payload path. This is what proves the sync
// pipeline, the manifest and the normalisation agree.
func TestEveryEmbeddedCanonicalFileClassifiesAsItself(t *testing.T) {
	c := embeddedClassifier(t)
	if c.FallbackUsed() {
		t.Fatal("the embedded manifest must be usable; got the fallback")
	}
	files := currentEmbedded(t)
	if len(files) < 100 {
		t.Fatalf("expected the embedded templates and definitions, got %d files", len(files))
	}
	counts := map[integrity.Class]int{}
	for p, data := range files {
		res, ok := c.Classify(payloadOf(t, data))
		if !ok {
			t.Errorf("%s is not recognised as canonical content", p)
			continue
		}
		if !res.Current {
			t.Errorf("%s matched only an older release (%s)", p, res.Release)
		}
		counts[res.Class]++
	}
	t.Logf("classified %d files: %v", len(files), counts)
	if counts[integrity.ClassCanonicalReference] < 100 {
		t.Errorf("expected 100+ canonical definitions, got %v", counts)
	}
	if counts[integrity.ClassUnmodifiedTemplate] == 0 {
		t.Errorf("expected templates to classify as unmodified_template, got %v", counts)
	}
}

func TestClassify_AuthoredContentIsNotFlagged(t *testing.T) {
	c := embeddedClassifier(t)
	authored := `{"north_star":{"organization":"Acme","vision":{"statement":"Make widgets fair"}}}`
	if res, ok := c.Classify([]byte(authored)); ok {
		t.Errorf("authored content flagged as %+v", res)
	}
}

func TestClassify_OneChangedValueIsNoLongerAnExactMatch(t *testing.T) {
	c := embeddedClassifier(t)
	var def []byte
	for p, data := range currentEmbedded(t) {
		if strings.Contains(p, "FIRE/definitions/") {
			def = data
			break
		}
	}
	var doc map[string]any
	if err := json.Unmarshal(payloadOf(t, def), &doc); err != nil {
		t.Fatal(err)
	}
	doc["edited_by_the_company"] = "yes"
	edited, _ := json.Marshal(doc)
	if res, ok := c.Classify(edited); ok && res.Class == integrity.ClassCanonicalReference {
		t.Errorf("an edited definition must not classify as an unmodified canonical reference: %+v", res)
	}
}

func TestClassify_KindsMapToClasses(t *testing.T) {
	manifest := `{"manifest_version":1,"normalisation":"` + integrity.NormalisationVersion + `","current_release":"2.0.0","releases":["1.0.0","2.0.0"],"entries":{}}`
	var m map[string]any
	_ = json.Unmarshal([]byte(manifest), &m)
	entries := map[string]any{}
	add := func(content, kind, ref string, releases ...string) {
		h, err := integrity.HashJSON([]byte(content))
		if err != nil {
			t.Fatal(err)
		}
		entries[h] = map[string]any{"kind": kind, "refs": []string{ref}, "releases": releases}
	}
	add(`{"id":"def"}`, "definition", "definitions/a.yaml", "1.0.0", "2.0.0")
	add(`{"id":"tpl"}`, "template", "templates/READY/x.yaml", "2.0.0")
	add(`{"id":"vm"}`, "value_model", "templates/FIRE/value_models/product.yaml", "1.0.0")
	add(`{"id":"aim"}`, "aim_template", "templates/AIM/x.yaml", "2.0.0")
	m["entries"] = entries
	raw, _ := json.Marshal(m)

	c, err := integrity.NewClassifier(raw, func() (map[string][]byte, error) { return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		payload string
		class   integrity.Class
		current bool
		ref     string
	}{
		{`{"id":"def"}`, integrity.ClassCanonicalReference, true, "definitions/a.yaml@2.0.0"},
		{`{"id":"tpl"}`, integrity.ClassUnmodifiedTemplate, true, "templates/READY/x.yaml@2.0.0"},
		{`{"id":"vm"}`, integrity.ClassPackagedDefault, false, "templates/FIRE/value_models/product.yaml@1.0.0"},
		{`{"id":"aim"}`, integrity.ClassUnmodifiedTemplate, true, "templates/AIM/x.yaml@2.0.0"},
	}
	for _, tt := range tests {
		res, ok := c.Classify([]byte(tt.payload))
		if !ok {
			t.Errorf("%s: not classified", tt.payload)
			continue
		}
		if res.Class != tt.class || res.Current != tt.current || res.Ref != tt.ref {
			t.Errorf("%s: got %+v, want class=%s current=%v ref=%s", tt.payload, res, tt.class, tt.current, tt.ref)
		}
	}
}

func TestNewClassifier_FallsBackVisiblyWhenManifestIsUnusable(t *testing.T) {
	current := func() (map[string][]byte, error) {
		return map[string][]byte{
			"templates/FIRE/definitions/x/sd-001.yaml": []byte("id: sd-001\nname: Thing\n"),
			"templates/READY/00_north_star.yaml":       []byte("north_star:\n  organization: PLACEHOLDER\n"),
		}, nil
	}
	for name, raw := range map[string][]byte{
		"empty":         []byte(`{"manifest_version":1,"normalisation":"` + integrity.NormalisationVersion + `","entries":{}}`),
		"unparseable":   []byte(`not json`),
		"other hashing": []byte(`{"manifest_version":1,"normalisation":"other","entries":{"a":{}}}`),
		"absent":        nil,
	} {
		t.Run(name, func(t *testing.T) {
			c, err := integrity.NewClassifier(raw, current)
			if err != nil {
				t.Fatalf("NewClassifier: %v", err)
			}
			if !c.FallbackUsed() {
				t.Error("the fallback must be reported, not silent")
			}
			res, ok := c.Classify([]byte(`{"id":"sd-001","name":"Thing"}`))
			if !ok || res.Class != integrity.ClassCanonicalReference {
				t.Errorf("fallback did not recognise the current definition: %+v ok=%v", res, ok)
			}
			if c.Summary() == "" || !strings.Contains(c.Summary(), "fallback") {
				t.Errorf("summary must say the fallback is in use, got %q", c.Summary())
			}
		})
	}
}

func TestSummary_NamesTheManifestRelease(t *testing.T) {
	c := embeddedClassifier(t)
	if !strings.Contains(c.Summary(), "manifest") || !strings.Contains(c.Summary(), "2.") {
		t.Errorf("summary should name the manifest and its release, got %q", c.Summary())
	}
}
