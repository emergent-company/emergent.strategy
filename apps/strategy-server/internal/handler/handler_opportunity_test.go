package handler

import (
	"bytes"
	"context"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func renderOpportunity(t *testing.T, payload map[string]any) string {
	t.Helper()
	c := (&Server{}).insightOpportunityContent(ui.NavContext{}, "insight_opportunity", "Opportunity", "draft", payload)
	var buf bytes.Buffer
	if err := c.Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

// Every string property of the insight_opportunity schema has a dedicated view:
// it is declared as shown and it is on the page.
func TestOpportunityViewShowsEveryFieldOfTheSchema(t *testing.T) {
	payload, markers := sampleOfSchema(t, "insight_opportunity_schema.json", 0, 20)

	if left := opportunityUnshown(payload); left != nil {
		var keys []string
		for k := range left {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Errorf("schema properties with no dedicated view, under: %s", strings.Join(keys, ", "))
	}
	page := renderOpportunity(t, payload)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d of %d schema fields are not on the page:\n  %s", len(missing), len(markers), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// The canonical template, as stored, is on the page with nothing under the notice.
func TestOpportunityViewShowsTheCanonicalTemplate(t *testing.T) {
	raw, err := embedded.GetTemplate("READY/03_insight_opportunity.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := yaml.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	page := renderOpportunity(t, payload)
	for _, want := range []string{"Example Big Opportunity", "How will we know this opportunity is real?", "01_insight_analyses.yaml", "identified"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the canonical template got the 'stored but not shown' notice")
	}
}

// An enum, a null date and a number carry no marker in the schema sample.
func TestOpportunityViewShowsEnumsAndDates(t *testing.T) {
	payload := map[string]any{"opportunity": map[string]any{
		"id": "opp-042", "status": "validated", "confidence_level": "high", "validation_date": "2026-03-01",
	}}
	page := renderOpportunity(t, payload)
	for _, want := range []string{"opp-042", "validated", "high confidence", "2026-03-01"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the notice")
	}
}

// A success indicator with the older `indicator` key is still read; the schema
// key is `metric`.
func TestOpportunityViewReadsBothIndicatorKeys(t *testing.T) {
	payload := map[string]any{"opportunity": map[string]any{"success_indicators": []any{
		map[string]any{"metric": "schema-metric-text", "target": "t1"},
		map[string]any{"indicator": "older-indicator-text", "target": "t2"},
	}}}
	page := renderOpportunity(t, payload)
	for _, want := range []string{"schema-metric-text", "older-indicator-text", "t1", "t2"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("success indicators got the notice")
	}
}

// Keys the schema does not define are shown as stored, at every level and beside
// the opportunity block, under the notice; lone strings and plain-string list
// items are tolerated.
func TestOpportunityViewShowsUnknownKeysUnderTheNotice(t *testing.T) {
	payload := map[string]any{
		"unknown_top": "top-level-extra-text",
		"opportunity": map[string]any{
			"unknown_mid": "mid-level-extra-text",
			"context":     map[string]any{"pain_points": "lone-pain-point", "unknown_ctx": "context-extra-text"},
			"evidence": map[string]any{
				"qualitative": []any{"plain-string-evidence", map[string]any{"source": "s", "insight": "i", "unknown_ev": "evidence-extra-text"}},
			},
		},
	}
	page := renderOpportunity(t, payload)
	for _, want := range []string{"top-level-extra-text", "mid-level-extra-text", "lone-pain-point", "context-extra-text", "plain-string-evidence", "evidence-extra-text"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if !strings.Contains(page, "no dedicated view") {
		t.Error("stored content with no view got no notice")
	}
}

// Content stored without the opportunity wrapper is read the same way.
func TestOpportunityViewReadsAnUnwrappedPayload(t *testing.T) {
	page := renderOpportunity(t, map[string]any{
		"title": "flat-title", "value_hypothesis": map[string]any{"user_value": "flat-user-value"},
	})
	for _, want := range []string{"flat-title", "flat-user-value"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("an unwrapped opportunity got the notice")
	}
}

// The three links to the analyses the opportunity was drawn from are each on the
// page, with values that can be told apart.
func TestOpportunityViewShowsTheAnalysesLinks(t *testing.T) {
	page := renderOpportunity(t, map[string]any{
		"analyses_source": "source-file-a.yaml", "based_on_analyses": "based-on-file-b.yaml", "analyses_last_updated": "2026-02-02",
		"opportunity": map[string]any{"id": "opp-1"},
	})
	for _, want := range []string{"source-file-a.yaml", "based-on-file-b.yaml", "2026-02-02"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the analyses links got the notice")
	}
}
