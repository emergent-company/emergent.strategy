package decompose

import (
	"bytes"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// The READY templates a new instance starts from, per artifact type.
var readyTemplates = []struct{ file, artifactType string }{
	{"READY/01_insight_analyses.yaml", "insight_analyses"},
	{"READY/02_strategy_foundations.yaml", "strategy_foundations"},
	{"READY/04_strategy_formula.yaml", "strategy_formula"},
}

// An instance copied from the embedded READY templates decomposes: the typed
// decoders accept every template, and the decomposer says nothing about a file with
// an unexpected shape. Before canonical 2.37.0 the templates held strings where the
// schemas have objects, and the decoders refused them.
func TestFreshInstanceFromTemplatesDecomposes(t *testing.T) {
	dir := t.TempDir()
	for _, tm := range readyTemplates {
		raw, err := embedded.GetTemplate(tm.file)
		if err != nil {
			t.Fatal(err)
		}
		dst := filepath.Join(dir, "READY", filepath.Base(tm.file))
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(dst, raw, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelWarn})))
	defer slog.SetDefault(prev)

	result, err := New(dir).DecomposeInstance()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(logs.String(), "none of its objects were produced") {
		t.Errorf("a template was refused by its decoder:\n%s", logs.String())
	}
	if len(result.Objects) == 0 {
		t.Error("the templates produced no objects")
	}
}

// The payload route, which the web page uses, accepts each template too.
func TestDecomposePayloadAcceptsTheTemplates(t *testing.T) {
	for _, tm := range readyTemplates {
		t.Run(tm.artifactType, func(t *testing.T) {
			raw, err := embedded.GetTemplate(tm.file)
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]any
			if err := yaml.Unmarshal(raw, &payload); err != nil {
				t.Fatal(err)
			}
			result, err := DecomposePayload(tm.artifactType, payload)
			if err != nil {
				t.Fatalf("the template was refused: %v", err)
			}
			if len(result.Objects) == 0 {
				t.Error("the template produced no objects")
			}
		})
	}
}
