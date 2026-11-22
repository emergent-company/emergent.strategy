package embeddedclassifier_test

import (
	"encoding/json"
	"os"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity/embeddedclassifier"
)

func asPayload(t *testing.T, yamlBytes []byte) []byte {
	t.Helper()
	var doc any
	if err := yaml.Unmarshal(yamlBytes, &doc); err != nil {
		t.Fatalf("parse: %v", err)
	}
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return out
}

// A canonical release that changes a template changes its hash. An instance that
// was seeded from the previous release and never edited holds the old bytes; the
// regenerated manifest must still call it an unmodified template, and say it is
// not the current release, so it is not mistaken for something the company wrote.
func TestEmbeddedManifest_KnowsTheTemplatesOfThePreviousRelease(t *testing.T) {
	cl := embeddedclassifier.Default()
	if cl == nil {
		t.Fatal("no classifier is built from the embedded manifest")
	}
	for _, name := range []string{"assessment_report", "strategic_reality_check"} {
		t.Run(name, func(t *testing.T) {
			old, err := os.ReadFile("testdata/" + name + "_2.33.0.yaml")
			if err != nil {
				t.Fatal(err)
			}
			got, ok := cl.Classify(asPayload(t, old))
			if !ok || got.Class != integrity.ClassUnmodifiedTemplate {
				t.Fatalf("previous-release %s: %+v ok=%v, want unmodified_template", name, got, ok)
			}
			if got.Current {
				t.Errorf("previous-release %s is reported as the current release (%s)", name, got.Release)
			}

			current, err := embedded.GetTemplate("AIM/" + name + ".yaml")
			if err != nil {
				t.Fatal(err)
			}
			now, ok := cl.Classify(asPayload(t, current))
			if !ok || now.Class != integrity.ClassUnmodifiedTemplate || !now.Current {
				t.Errorf("current %s: %+v ok=%v, want unmodified_template of the current release", name, now, ok)
			}
		})
	}
}
