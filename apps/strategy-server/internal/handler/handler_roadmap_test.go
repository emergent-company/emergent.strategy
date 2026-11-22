package handler

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

const roadmapWithParkedAndFuture = `{
  "tracks": {"commercial": {
    "objective": "Win first customers",
    "okrs": [{"id": "okr-c-001", "objective": "Land three pilots", "key_results": [
      {"id": "kr-c-001", "description": "Three signed pilots", "target": "3"},
      {"id": "kr-c-002", "description": "Pilot NPS above 40", "status": "parked", "parked_reason": "Waiting for the first pilot to go live"}]}],
    "future_okrs_q3_2026": [{"id": "okr-c-010", "objective": "Expand to ten accounts", "key_results": [
      {"id": "kr-c-010", "description": "Ten paying accounts", "status": "parked", "parked_reason": "Deferred until the pilots report"},
      {"id": "kr-c-011", "description": "Two reference customers", "target": "2"}]}]
  }}}`

func TestExtractRoadmapTrackKeepsParkedKeyResultsApartAndReadsFutureGroups(t *testing.T) {
	root := decodePayload(t, roadmapWithParkedAndFuture)
	tm := root["tracks"].(map[string]any)["commercial"].(map[string]any)
	track := extractRoadmapTrack("commercial", tm)

	if len(track.OKRs) != 2 {
		t.Fatalf("OKRs = %d, want the okrs objective and the future_okrs_q3_2026 one", len(track.OKRs))
	}
	current, future := track.OKRs[0], track.OKRs[1]
	if len(current.KeyResults) != 1 || current.KeyResults[0].ID != "kr-c-001" {
		t.Errorf("active key results = %+v, want only kr-c-001", current.KeyResults)
	}
	if len(current.ParkedKeyResults) != 1 || current.ParkedKeyResults[0].ID != "kr-c-002" ||
		current.ParkedKeyResults[0].ParkedReason != "Waiting for the first pilot to go live" {
		t.Errorf("parked key results = %+v", current.ParkedKeyResults)
	}
	if current.Group != "" {
		t.Errorf("the current okrs group is not labelled, got %q", current.Group)
	}
	if future.Group != "future_okrs_q3_2026" || len(future.KeyResults) != 1 || len(future.ParkedKeyResults) != 1 {
		t.Errorf("future group = %+v", future)
	}
}

func TestRoadmapPageRendersParkedKeyResultsSeparatelyWithTheirReason(t *testing.T) {
	root := decodePayload(t, roadmapWithParkedAndFuture)
	tm := root["tracks"].(map[string]any)["commercial"].(map[string]any)
	data := ui.RoadmapRecipeData{Tracks: []ui.RoadmapTrack{extractRoadmapTrack("commercial", tm)}}

	var buf bytes.Buffer
	if err := ui.RoadmapRecipeContent(data).Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	html := buf.String()
	for _, want := range []string{
		"Parked", "Pilot NPS above 40", "Waiting for the first pilot to go live",
		"Deferred until the pilots report", "Ten paying accounts", "Expand to ten accounts",
	} {
		if !strings.Contains(html, want) {
			t.Errorf("the Roadmap page is missing %q", want)
		}
	}
	parkedAt := strings.Index(html, "Parked")
	if i := strings.Index(html, "Three signed pilots"); i < 0 || i > parkedAt {
		t.Errorf("an active key result must be listed before the parked section (active at %d, parked at %d)", i, parkedAt)
	}
}
