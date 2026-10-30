package mcpserver_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

func TestMCP_SearchStrategy_FiltersFrameworkAndPointsAtTheRead(t *testing.T) {
	mem := memtest.New(t)
	svc := fencedSvc(t, mem)
	_, id := seedInstance(t, svc, "search-owner", brPayloads(t))
	markReady(t, svc, id)
	putObject(t, svc, mem, id, "definition", "sd-001", "artifact", map[string]any{
		"artifact_type": "definition", "integrity_class": "canonical_reference", "snippet": "framework text"})
	putObject(t, svc, mem, id, "strategy_formula", "strategy_formula", "artifact", map[string]any{
		"artifact_type": "strategy_formula", "snippet": "our formula"})
	putForeign(mem, uuid.New(), "strategy_formula", "strategy_formula", map[string]any{
		"artifact_type": "strategy_formula", "snippet": "foreign text"})
	mem.Scores[ingest.ScopedKey(id, "sd-001")] = 0.99
	mem.Scores[ingest.ScopedKey(id, "strategy_formula")] = 0.9
	c := newMCPClient(t, svc)

	var hits []struct {
		ArtifactKey      string `json:"artifact_key"`
		Artifact         string `json:"artifact"`
		InstanceID       string `json:"instance_id"`
		Layer            string `json:"layer"`
		SectionSizeChars int    `json:"section_size_chars"`
		ReadWith         string `json:"read_with"`
		Match            string `json:"match"`
	}
	r := c.call(1, "search_strategy", map[string]any{"instance_id": id.String(), "query": "trade-offs"}).assertOK().decode(&hits)

	if len(hits) != 1 || hits[0].ArtifactKey != "strategy_formula" {
		t.Fatalf("hits = %+v, want only the instance's own authored hit", hits)
	}
	if strings.Contains(r.text, "framework text") || strings.Contains(r.text, "foreign text") {
		t.Error("a framework or foreign hit leaked into the response")
	}
	if hits[0].Match != "semantic" {
		t.Errorf("match = %q, want semantic", hits[0].Match)
	}
	if hits[0].InstanceID != id.String() || hits[0].Layer != "artifact" {
		t.Errorf("hit does not say where it comes from: %+v", hits[0])
	}
	if hits[0].Artifact != "strategy_formula" || hits[0].SectionSizeChars <= 0 {
		t.Errorf("hit does not point at its section: %+v", hits[0])
	}
	if !strings.Contains(hits[0].ReadWith, "get_section") || !strings.Contains(hits[0].ReadWith, "strategy_formula") {
		t.Errorf("read_with = %q", hits[0].ReadWith)
	}
}
