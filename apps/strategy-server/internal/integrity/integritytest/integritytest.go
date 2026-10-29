// Package integritytest provides fixtures of canonical content for tests.
package integritytest

import (
	"encoding/json"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// Payload returns the first embedded canonical file whose path contains the
// fragment, parsed into the generic payload shape the importer stores.
func Payload(t *testing.T, fragment string) map[string]any {
	t.Helper()
	paths, err := embedded.ListTemplates()
	if err != nil {
		t.Fatalf("ListTemplates: %v", err)
	}
	for _, p := range paths {
		if !strings.Contains(p, fragment) {
			continue
		}
		data, err := embedded.GetTemplate(p)
		if err != nil {
			t.Fatalf("GetTemplate %s: %v", p, err)
		}
		var doc map[string]any
		if err := yaml.Unmarshal(data, &doc); err != nil {
			t.Fatalf("yaml %s: %v", p, err)
		}
		raw, err := json.Marshal(doc)
		if err != nil {
			t.Fatalf("marshal %s: %v", p, err)
		}
		var out map[string]any
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("round trip %s: %v", p, err)
		}
		return out
	}
	t.Fatalf("no embedded template contains %q", fragment)
	return nil
}
