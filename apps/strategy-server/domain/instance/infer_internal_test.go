package instance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/epfimport"
)

func TestInferArtifactType_WorkPackageKeys(t *testing.T) {
	cases := []struct{ key, want string }{
		{"wp-001", "work_package"},
		{"wp-042", "work_package"},
		{"fd-001", "feature"},
		{"work_packages/notes", "artifact"},
		{"north_star", "north_star"},
	}
	for _, c := range cases {
		if got := inferArtifactType(c.key); got != c.want {
			t.Errorf("inferArtifactType(%q) = %q, want %q", c.key, got, c.want)
		}
	}
}

// Every artifact the canonical READY templates define must import to the type
// the validator detects from its root key. Otherwise a page that reads that type
// says the artifact does not exist although the file is there and valid.
func TestEveryCanonicalREADYTemplateImportsToTheTypeTheValidatorDetects(t *testing.T) {
	paths, err := embedded.ListTemplates()
	if err != nil {
		t.Fatal(err)
	}
	checked := map[string]string{}
	for _, p := range paths {
		if !strings.HasPrefix(p, "READY/") || strings.Contains(p, "/_legacy/") || strings.HasSuffix(p, ".template.yaml") {
			continue
		}
		data, err := embedded.GetTemplate(p)
		if err != nil {
			t.Fatal(err)
		}
		var doc any
		if err := yaml.Unmarshal(data, &doc); err != nil {
			t.Fatalf("%s: %v", p, err)
		}
		payload, err := json.Marshal(normalizeForJSON(doc))
		if err != nil {
			t.Fatalf("%s: %v", p, err)
		}
		detected, ok := embedded.DetectArtifactType(payload)
		if !ok {
			t.Errorf("%s: the validator detects no type from its root keys", p)
			continue
		}
		name := p[strings.LastIndex(p, "/")+1:]
		key := epfimport.ArtifactKey(p, name)
		if got := inferArtifactType(key); got != detected {
			t.Errorf("%s imports as key %q, type %q; the validator detects %q", p, key, got, detected)
		}
		checked[p] = detected
	}
	if len(checked) < 7 {
		t.Errorf("checked only %d READY templates (%v), expected the six numbered ones and the portfolio", len(checked), checked)
	}
}

func TestImportArtifactType_ReportsAFileThatLooksLikeAKnownTypeButIsStoredGeneric(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	portfolio := []byte(`{"portfolio":{"id":"x"}}`)
	if got := importArtifactType("READY/07_misnamed", portfolio); got != "artifact" {
		t.Errorf("type = %q, want the generic artifact: the key says nothing about it", got)
	}
	if out := buf.String(); !strings.Contains(out, "READY/07_misnamed") || !strings.Contains(out, "product_portfolio") {
		t.Errorf("expected a warning naming the key and the detected type, got %q", out)
	}

	buf.Reset()
	if got := importArtifactType("product_portfolio", portfolio); got != "product_portfolio" || buf.Len() != 0 {
		t.Errorf("a recognised key gives its type quietly, got %q and log %q", got, buf.String())
	}
	if got := importArtifactType("notes/readme", []byte(`{"anything":1}`)); got != "artifact" || buf.Len() != 0 {
		t.Errorf("a file with no known signature stays generic quietly, got %q and log %q", got, buf.String())
	}
}

func normalizeForJSON(v any) any {
	switch t := v.(type) {
	case map[string]any:
		for k, vv := range t {
			t[k] = normalizeForJSON(vv)
		}
		return t
	case map[any]any:
		out := make(map[string]any, len(t))
		for k, vv := range t {
			out[fmt.Sprint(k)] = normalizeForJSON(vv)
		}
		return out
	case []any:
		for i, vv := range t {
			t[i] = normalizeForJSON(vv)
		}
		return t
	}
	return v
}
