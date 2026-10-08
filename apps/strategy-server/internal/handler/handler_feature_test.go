package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// schemaShapedFeature follows feature_definition_schema.json: scenarios and
// contexts under `implementation`, boundaries as non_goals / constraints.
// The view used to read scenarios from `definition` and boundaries from
// in_scope / out_of_scope, so schema-valid features rendered without
// scenarios, boundaries, personas or contexts and nothing reported it.
const schemaShapedFeature = `{
  "id": "fd-001", "name": "Price Calculator", "slug": "price-calculator", "status": "draft",
  "strategic_context": {"contributes_to": ["Product.Public.Pricing"], "tracks": ["product"]},
  "definition": {
    "job_to_be_done": "Know the price", "solution_approach": "Self-service page",
    "capabilities": [{"id": "cap-001", "name": "Lookup", "description": "Register lookup"}],
    "personas": [{
      "id": "kari", "name": "Kari Nordby", "role": "Owner", "description": "Owns an AS",
      "goals": ["Clear price"], "pain_points": ["Surprise invoices"],
      "usage_context": "Evenings", "technical_proficiency": "intermediate",
      "current_situation": "First paragraph.\n\nSecond paragraph.\r\n\r\nThird paragraph.",
      "transformation_moment": "One block only.",
      "emotional_resolution": "Relief."
    }]
  },
  "implementation": {
    "contexts": [{"id": "ctx-1", "type": "ui", "name": "Calculator page", "description": "Public page",
                  "key_interactions": ["Enter org number"], "data_displayed": ["Itemised price"]}],
    "scenarios": [{"id": "sc-1", "name": "Owner checks price", "actor": "Kari", "context": "Evening",
                   "trigger": "Reads article", "action": "Enters org number", "outcome": "Sees price",
                   "acceptance_criteria": ["Result in under five minutes"]}],
    "external_integrations": [{"name": "Company register", "purpose": "Pre-fill facts", "direction": "inbound"}]
  },
  "dependencies": {"enables": [{"id": "fd-002", "name": "Onboarding", "reason": "Starts from a saved quote"}]},
  "boundaries": {"non_goals": ["No negotiation"], "constraints": ["Prices illustrative"]}
}`

func decodePayload(t *testing.T, raw string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatalf("bad fixture: %v", err)
	}
	return m
}

func TestBuildFeatureViewDataReadsSchemaLocations(t *testing.T) {
	data := buildFeatureViewData(ui.NavContext{}, "fd-001", "", "draft", decodePayload(t, schemaShapedFeature))

	checks := []struct {
		name string
		got  int
		want int
	}{
		{"capabilities", len(data.Capabilities), 1},
		{"personas", len(data.Personas), 1},
		{"scenarios from implementation", len(data.Scenarios), 1},
		{"scenario acceptance criteria", len(data.Scenarios[0].AcceptanceCriteria), 1},
		{"contexts", len(data.Contexts), 1},
		{"integrations", len(data.Integrations), 1},
		{"enables", len(data.Enables), 1},
		{"non_goals", len(data.NonGoals), 1},
		{"constraints", len(data.Constraints), 1},
		{"current_situation paragraphs", len(data.Personas[0].CurrentSituation), 3},
		{"single-block narrative", len(data.Personas[0].TransformationMoment), 1},
	}
	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			if c.got != c.want {
				t.Errorf("got %d, want %d", c.got, c.want)
			}
		})
	}
	if data.Name != "Price Calculator" {
		t.Errorf("name fallback: got %q", data.Name)
	}
}

func TestBuildFeatureViewDataKeepsLegacyLocations(t *testing.T) {
	legacy := `{
	  "name": "Legacy",
	  "definition": {"scenarios": [{"id": "sc-1", "name": "Old placement"}]},
	  "boundaries": {"in_scope": ["A"], "out_of_scope": ["B"]}
	}`
	data := buildFeatureViewData(ui.NavContext{}, "fd-x", "", "", decodePayload(t, legacy))
	if len(data.Scenarios) != 1 {
		t.Errorf("legacy definition.scenarios: got %d, want 1", len(data.Scenarios))
	}
	if len(data.InScope) != 1 || len(data.OutOfScope) != 1 {
		t.Errorf("legacy in/out of scope: got %d/%d, want 1/1", len(data.InScope), len(data.OutOfScope))
	}
}

func TestFeatureViewRendersSchemaSections(t *testing.T) {
	data := buildFeatureViewData(ui.NavContext{}, "fd-001", "", "draft", decodePayload(t, schemaShapedFeature))
	var buf bytes.Buffer
	if err := ui.FeatureViewContent(data).Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	html := buf.String()
	for _, want := range []string{
		"Personas", "Kari Nordby", "Third paragraph.",
		"Scenarios", "Owner checks price", "Result in under five minutes",
		"Contexts &amp; Integrations", "Calculator page", "Company register",
		"Non-goals", "No negotiation", "Constraints", "Prices illustrative",
	} {
		if !strings.Contains(html, want) {
			t.Errorf("rendered feature view is missing %q", want)
		}
	}
}
