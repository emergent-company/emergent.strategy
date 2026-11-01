package mcpserver_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// autoFixture is an instance whose own text has keywordItems sections that
// contain the word "aardvark", and whose graph holds semanticHits objects.
func autoFixture(t *testing.T, keywordItems, semanticHits int) (c *mcpClient, instID string, mem *memtest.Server) {
	t.Helper()
	mem = memtest.New(t)
	svc := fencedSvc(t, mem)
	var items []string
	for i := 0; i < keywordItems; i++ {
		items = append(items, fmt.Sprintf(`{"id":"i%d","text":"aardvark item %d"}`, i, i))
	}
	var opp any
	if err := json.Unmarshal([]byte(`{"opportunity":{"id":"op","items":[`+strings.Join(items, ",")+`]}}`), &opp); err != nil {
		t.Fatal(err)
	}
	_, id := seedInstance(t, svc, "auto-owner", map[string]any{"insight_opportunity": opp})
	markReady(t, svc, id)
	for i := 0; i < semanticHits; i++ {
		key := fmt.Sprintf("fd-%03d_graph", i)
		putObject(t, svc, mem, id, "feature", key, "artifact", map[string]any{"artifact_type": "feature", "snippet": "graph only " + key})
		mem.Scores[ingest.ScopedKey(id, key)] = 0.9
	}
	return newMCPClient(t, svc), id.String(), mem
}

func matches(hits []searchHit) (keyword, semantic int) {
	for _, h := range hits {
		switch h.Match {
		case "keyword":
			keyword++
		case "semantic":
			semantic++
		}
	}
	return
}

// Measured on a real instance with the 59-question bank: semantic search with
// the question as the query rarely returned the sections the bank names (5 of 49
// key results in the top 10, against 26 for keyword search), so auto gives most
// of the limit to keyword hits and keeps a share for semantic hits, which find
// what the words of the query do not.
func TestMCP_SearchStrategy_AutoGivesKeywordHitsMostOfTheLimitAndSemanticTheRest(t *testing.T) {
	c, instID, _ := autoFixture(t, 20, 10)
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "aardvark"}).assertOK().decode(&hits)
	kw, sem := matches(hits)
	if len(hits) != 10 || kw != 8 || sem != 2 {
		t.Errorf("%d hits: %d keyword, %d semantic; want 10 = 8 + 2", len(hits), kw, sem)
	}
	for i, h := range hits {
		if i < 8 && h.Match != "keyword" {
			t.Errorf("hit %d is %q; keyword hits come first", i, h.Match)
		}
	}
}

func TestMCP_SearchStrategy_AutoSplitFollowsTheLimit(t *testing.T) {
	c, instID, _ := autoFixture(t, 40, 20)
	for limit, want := range map[string][2]int{"5": {4, 1}, "20": {16, 4}, "25": {20, 5}} {
		var hits []searchHit
		c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "aardvark", "limit": limit}).assertOK().decode(&hits)
		kw, sem := matches(hits)
		if kw != want[0] || sem != want[1] {
			t.Errorf("limit %s: %d keyword + %d semantic, want %d + %d", limit, kw, sem, want[0], want[1])
		}
	}
}

// A side that has less than its share gives the room to the other, so the
// client always gets as many hits as exist, up to the limit.
func TestMCP_SearchStrategy_AutoBackfillsFromWhicheverSideHasMore(t *testing.T) {
	t.Run("few semantic hits: keyword fills the rest", func(t *testing.T) {
		c, instID, _ := autoFixture(t, 20, 1)
		var hits []searchHit
		c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "aardvark"}).assertOK().decode(&hits)
		if kw, sem := matches(hits); kw != 9 || sem != 1 {
			t.Errorf("%d keyword + %d semantic, want 9 + 1", kw, sem)
		}
	})
	t.Run("few keyword hits: semantic fills the rest", func(t *testing.T) {
		c, instID, _ := autoFixture(t, 3, 10)
		var hits []searchHit
		c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "aardvark"}).assertOK().decode(&hits)
		if kw, sem := matches(hits); kw != 3 || sem != 7 {
			t.Errorf("%d keyword + %d semantic, want 3 + 7", kw, sem)
		}
	})
	t.Run("no keyword hit: semantic hits answer", func(t *testing.T) {
		c, instID, _ := autoFixture(t, 0, 10)
		var hits []searchHit
		c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "zzzznotthere"}).assertOK().decode(&hits)
		if kw, sem := matches(hits); kw != 0 || sem != 10 {
			t.Errorf("%d keyword + %d semantic, want 0 + 10", kw, sem)
		}
	})
}

// The same section found both ways is listed once, as the keyword hit, which
// also says which query words it contains.
func TestMCP_SearchStrategy_AutoListsASectionFoundBothWaysOnce(t *testing.T) {
	mem := memtest.New(t)
	svc := fencedSvc(t, mem)
	_, id := seedInstance(t, svc, "auto-dup", brPayloads(t))
	markReady(t, svc, id)
	putObject(t, svc, mem, id, "Positioning", "Positioning:strategy_formula:moat", "decomposed", map[string]any{
		"source_artifact": "READY/04_strategy_formula.yaml", "section_path": "competitive_moat.vs_competitors[0]",
		"snippet": "Rivalco offline"})
	mem.Scores[ingest.ScopedKey(id, "Positioning:strategy_formula:moat")] = 0.99
	c := newMCPClient(t, svc)

	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": id.String(), "query": "Rivalco offline"}).assertOK().decode(&hits)
	n := 0
	for _, h := range hits {
		if h.Artifact == "strategy_formula" && h.Path == "competitive_moat.vs_competitors[0]" {
			n++
			if h.Match != "keyword" {
				t.Errorf("the duplicate is listed as %q, want the keyword hit", h.Match)
			}
		}
	}
	if n != 1 {
		t.Errorf("the section is listed %d times, want 1", n)
	}
}

// Without Memory, or with the graph not built, auto is keyword search alone, as
// before, and does not call Memory for an instance that has no graph.
func TestMCP_SearchStrategy_AutoWithoutAGraphIsKeywordSearchAlone(t *testing.T) {
	c, instID := keywordClient(t, nil, nil)
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	if kw, sem := matches(hits); kw == 0 || sem != 0 {
		t.Errorf("%d keyword + %d semantic", kw, sem)
	}
}

var _ = uuid.New
var _ mcpserver.Services
