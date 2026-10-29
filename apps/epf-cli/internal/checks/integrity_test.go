package checks

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
)

func firstEmbedded(t *testing.T, fragment string) (string, []byte) {
	t.Helper()
	var found string
	_ = fs.WalkDir(embedded.Templates, "templates", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && found == "" && strings.Contains(p, fragment) && strings.HasSuffix(p, ".yaml") {
			found = p
		}
		return nil
	})
	if found == "" {
		t.Fatalf("no embedded file contains %q", fragment)
	}
	data, err := embedded.Templates.ReadFile(found)
	if err != nil {
		t.Fatal(err)
	}
	return found, data
}

func writeFile(t *testing.T, root, rel string, data []byte) {
	t.Helper()
	p := filepath.Join(root, rel)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestContentReadiness_ReportsUnmodifiedFrameworkContent(t *testing.T) {
	root := t.TempDir()
	_, template := firstEmbedded(t, "READY/00_north_star")
	_, definition := firstEmbedded(t, "FIRE/definitions/strategy/")
	_, valueModel := firstEmbedded(t, "value_models/product")

	writeFile(t, root, "READY/00_north_star.yaml", template)
	writeFile(t, root, "FIRE/definitions/strategy/sd-copied.yaml", definition)
	writeFile(t, root, "FIRE/definitions/strategy/sd-edited.yaml", append(append([]byte{}, definition...), []byte("\ncompany_policy: decided by us\n")...))
	writeFile(t, root, "FIRE/value_models/product.value_model.yaml", valueModel)
	writeFile(t, root, "READY/01_insight_analyses.yaml", []byte("target_users:\n  - persona: Farm manager\n"))

	res, err := NewContentReadinessChecker(root).Check()
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	ci := res.ContentIntegrity
	if ci == nil {
		t.Fatal("ContentIntegrity is not set")
	}
	if ci.Counts["canonical_reference"] != 1 || ci.CanonicalDefinitions != 1 {
		t.Errorf("an unmodified definition is counted once and an edited one is the company's own: %+v", ci)
	}
	if ci.Counts["unmodified_template"] != 1 || ci.Counts["packaged_default"] != 1 {
		t.Errorf("counts = %v, want one unmodified template and one packaged default", ci.Counts)
	}

	files := map[string]string{}
	for _, f := range ci.Files {
		files[f.File] = f.Rule
		if f.Ref == "" {
			t.Errorf("%s has no canonical reference", f.File)
		}
	}
	if files["READY/00_north_star.yaml"] != "integrity.unmodified_template" {
		t.Errorf("files = %v", files)
	}
	if files["FIRE/value_models/product.value_model.yaml"] != "integrity.packaged_default" {
		t.Errorf("files = %v", files)
	}
	if _, listed := files["FIRE/definitions/strategy/sd-copied.yaml"]; listed {
		t.Error("canonical definitions are counted, not listed")
	}
	if _, listed := files["READY/01_insight_analyses.yaml"]; listed {
		t.Error("an authored file must not be flagged")
	}
	if ci.Source == "" {
		t.Error("the report must say what it matched against")
	}

	strict := ci.StrictFailures()
	if len(strict) != 1 || strict[0].File != "READY/00_north_star.yaml" {
		t.Errorf("strict failures = %+v, want only the unmodified template", strict)
	}
}

func TestContentReadiness_IntegrityIsAdditive(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "READY/00_north_star.yaml", []byte("north_star:\n  organization: Acme\n"))

	res, err := NewContentReadinessChecker(root).Check()
	if err != nil {
		t.Fatal(err)
	}
	if res.Score != 100 {
		t.Errorf("score = %d, an authored clean instance must still score 100", res.Score)
	}
	if res.ContentIntegrity == nil || len(res.ContentIntegrity.Counts) != 0 || len(res.ContentIntegrity.StrictFailures()) != 0 {
		t.Errorf("a clean instance must report nothing: %+v", res.ContentIntegrity)
	}
}

func TestEveryEmbeddedTemplateAndDefinitionIsRecognisedByTheChecker(t *testing.T) {
	cl := embeddedClassifier()
	if cl == nil || cl.FallbackUsed() {
		t.Fatalf("the embedded manifest must be usable: %v", cl)
	}
	files, err := currentEmbeddedCanonical()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) < 100 {
		t.Fatalf("only %d embedded files", len(files))
	}
	for p, data := range files {
		if _, ok := cl.ClassifyYAML(data); !ok {
			t.Errorf("%s is not recognised as canonical content", p)
		}
	}
}

func TestPlaceholderPatterns_IncludeTheSharedAdditionalMarkers(t *testing.T) {
	detected := func(line string) bool {
		for _, p := range PlaceholderPatterns {
			if p.MatchString(line) {
				return true
			}
		}
		return false
	}
	for _, line := range []string{"statement: '[FILL IN]'", "date: 20XX", "organization: Your Organization Name", "name: Product Name Here", "objective: Example Product Objective"} {
		if !detected(line) {
			t.Errorf("%q is not detected as a placeholder", line)
		}
	}
	if detected("statement: We sell traceability to cocoa buyers") {
		t.Error("authored content flagged")
	}
}

func completenessMessage(t *testing.T, root string) string {
	t.Helper()
	summary := NewInstanceChecker(root).Check()
	for _, r := range summary.Results {
		if r.Check == "canonical_completeness" {
			return r.Message
		}
	}
	return ""
}

func TestCanonicalCompleteness_RespectsAnOmittedDefinitionsAnchor(t *testing.T) {
	for _, tc := range []struct {
		name        string
		anchorExtra string
		wantMissing bool
	}{
		{"definitions omitted on purpose", "canonical_definitions: omitted\n", false},
		{"definitions installed but deleted", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			for _, d := range []string{"READY", "FIRE/definitions/product", "FIRE/value_models", "AIM"} {
				if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
					t.Fatal(err)
				}
			}
			writeFile(t, root, "_epf.yaml", []byte("epf_anchor: true\nversion: 1.0.0\ninstance_id: 11111111-1111-1111-1111-111111111111\ncreated_at: 2026-01-01T00:00:00Z\n"+tc.anchorExtra))

			msg := completenessMessage(t, root)
			if msg == "" {
				t.Fatal("no canonical_completeness result")
			}
			noneMissing := strings.Contains(msg, "(0 definitions,")
			if tc.wantMissing && noneMissing {
				t.Errorf("deleted definitions should still be reported missing: %q", msg)
			}
			if !tc.wantMissing && !noneMissing {
				t.Errorf("an instance that omitted definitions on purpose must not be told they are missing: %q", msg)
			}
		})
	}
}
