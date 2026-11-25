package mcpserver_test

import (
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// linkValueModel is a one-layer model of a track whose components are all active.
func linkValueModel(track string, components ...string) map[string]any {
	cs := make([]any, len(components))
	for i, c := range components {
		cs[i] = map[string]any{"id": c, "name": c, "active": true}
	}
	return map[string]any{
		"track_name": track,
		"layers":     []any{map[string]any{"id": "core", "name": "Core", "components": cs}},
	}
}

// The canonical schemas allow a definition's contributes_to path to name any of
// the four tracks, so a path is resolved against the model of the track it
// names, not of the track the definition belongs to.
func TestMCP_ValidateValueModelLinks_ResolvesAPathInTheTrackItNames(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	_, instID := seedInstance(t, svc, "vml-owner-"+uuid.New().String()[:8], map[string]any{
		"value_model_product":    linkValueModel("Product", "search"),
		"value_model_commercial": linkValueModel("Commercial", "pricing", "channels"),
		"value_model_strategy":   linkValueModel("Strategy", "patents"),
		"fd-001_cross": fitnessFeature("fd-001", "in-progress",
			"Product.Core.search",
			"Commercial.Core.pricing",
			"Strategy.Core.patents",
			"Commercial.Core.nowhere",
			"OrgOps.Core.hiring",
		),
		"FIRE/definitions/strategy/sd-001_cross": map[string]any{
			"id": "sd-001", "name": "Definition sd-001",
			"contributes_to": []any{"Commercial.Core.channels"},
		},
	})

	structured, text, isErr := rawToolCall(t, c, 1, "validate_value_model_links", map[string]any{"instance_id": instID.String()})
	if isErr {
		t.Fatalf("the call must be answered: %s", text)
	}
	assertValidatesAgainstPublishedSchema(t, "validate_value_model_links", structured)

	var v struct {
		Findings []struct {
			Key     string `json:"key"`
			Rule    string `json:"rule"`
			Path    string `json:"path"`
			Message string `json:"message"`
		} `json:"findings"`
	}
	if err := json.Unmarshal(structured, &v); err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, f := range v.Findings {
		got = append(got, f.Rule+" "+f.Key+" "+f.Path)
	}
	sort.Strings(got)
	want := []string{
		"value_model.unresolvable_path fd-001_cross /contributes_to/Commercial.Core.nowhere",
		"value_model.unresolvable_path fd-001_cross /contributes_to/OrgOps.Core.hiring",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("findings = %q\nwant       %q", got, want)
	}

	// A broken path is reported against the track it names.
	for _, f := range v.Findings {
		wantIn := "in any commercial value model"
		if strings.HasSuffix(f.Path, "OrgOps.Core.hiring") {
			wantIn = "no value model for this track"
		}
		if !strings.Contains(f.Message, wantIn) {
			t.Errorf("message for %s = %q, want it to contain %q", f.Path, f.Message, wantIn)
		}
	}

	var detail struct {
		PathsFound       int `json:"paths_found"`
		PathsResolved    int `json:"paths_resolved"`
		ActiveComponents int `json:"active_components"`
		ActiveServed     int `json:"active_components_served"`
	}
	if err := json.Unmarshal([]byte(text), &detail); err != nil {
		t.Fatalf("decode detail: %v\n%s", err, text)
	}
	if detail.PathsFound != 6 || detail.PathsResolved != 4 {
		t.Errorf("paths = %d of %d resolved, want 4 of 6", detail.PathsResolved, detail.PathsFound)
	}
	if detail.ActiveServed != 4 || detail.ActiveComponents != 4 {
		t.Errorf("components = %d of %d served, want 4 of 4", detail.ActiveServed, detail.ActiveComponents)
	}
}
