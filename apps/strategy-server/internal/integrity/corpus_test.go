package integrity

import (
	"encoding/json"
	"os"
	"testing"

	"gopkg.in/yaml.v3"
)

type corpus struct {
	CurrentRelease string   `json:"current_release"`
	Releases       []string `json:"releases"`
	Canonical      []struct {
		Kind     string   `json:"kind"`
		Ref      string   `json:"ref"`
		Releases []string `json:"releases"`
		YAML     string   `json:"yaml"`
	} `json:"canonical"`
	Cases []struct {
		Name    string `json:"name"`
		YAML    string `json:"yaml"`
		Class   string `json:"class"`
		Rule    string `json:"rule"`
		Current bool   `json:"current"`
		Ref     string `json:"ref"`
	} `json:"cases"`
}

// classification-cases.json is identical in epf-cli and strategy-server. Both
// build a manifest from it with their own hash function and must classify every
// case the same way, so the two apps cannot disagree about what is framework
// content. Here a case is classified as the server sees it: a stored JSON
// payload parsed from the YAML.
func TestClassificationCorpus(t *testing.T) {
	raw, err := os.ReadFile("testdata/classification-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var c corpus
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatal(err)
	}

	entries := map[string]any{}
	for _, d := range c.Canonical {
		h, err := HashYAML([]byte(d.YAML))
		if err != nil {
			t.Fatalf("hash %s: %v", d.Ref, err)
		}
		entries[h] = map[string]any{"kind": d.Kind, "refs": []string{d.Ref}, "releases": d.Releases}
	}
	manifest, _ := json.Marshal(map[string]any{
		"manifest_version": 1, "normalisation": NormalisationVersion,
		"current_release": c.CurrentRelease, "releases": c.Releases, "entries": entries,
	})
	cl, err := NewClassifier(manifest, func() (map[string][]byte, error) { return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	if cl.FallbackUsed() {
		t.Fatal("the corpus manifest must be usable")
	}

	for _, tc := range c.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			var doc any
			if err := yaml.Unmarshal([]byte(tc.YAML), &doc); err != nil || doc == nil {
				if tc.Class != "" {
					t.Fatalf("case is meant to classify but does not parse: %v", err)
				}
				return
			}
			payload, err := json.Marshal(normaliseYAML(doc))
			if err != nil {
				t.Fatal(err)
			}
			res, ok := cl.Classify(payload)
			if tc.Class == "" {
				if ok {
					t.Fatalf("classified as %+v, want authored", res)
				}
				return
			}
			if !ok {
				t.Fatal("not classified")
			}
			if string(res.Class) != tc.Class || res.Class.RuleID() != tc.Rule || res.Current != tc.Current || res.Ref != tc.Ref {
				t.Errorf("got class=%s rule=%s current=%v ref=%s; want class=%s rule=%s current=%v ref=%s",
					res.Class, res.Class.RuleID(), res.Current, res.Ref, tc.Class, tc.Rule, tc.Current, tc.Ref)
			}
		})
	}
}
