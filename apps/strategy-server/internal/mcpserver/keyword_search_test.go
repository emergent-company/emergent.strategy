package mcpserver_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

type searchHit struct {
	ArtifactKey      string   `json:"artifact_key"`
	Artifact         string   `json:"artifact"`
	Path             string   `json:"path"`
	Snippet          string   `json:"snippet"`
	Score            float64  `json:"score"`
	SectionSizeChars int      `json:"section_size_chars"`
	ReadWith         string   `json:"read_with"`
	Match            string   `json:"match"`
	MatchedTerms     []string `json:"matched_terms"`
	MissingTerms     []string `json:"missing_terms"`
}

// keywordClient serves an instance with the bounded-reads fixture. mem is the
// fake Memory behind the semantic service; nil means Memory is not configured.
// setup runs after the instance exists and may fill Memory and its manifest.
func keywordClient(t *testing.T, mem *memtest.Server, setup func(svc mcpserver.Services, inst uuid.UUID)) (c *mcpClient, instID string) {
	t.Helper()
	svc := fencedSvc(t, mem)
	_, id := seedInstance(t, svc, "kw-owner", brPayloads(t))
	if setup != nil {
		setup(svc, id)
	}
	return newMCPClient(t, svc), id.String()
}

func requireKeywordHit(t *testing.T, c *mcpClient, instID string, hits []searchHit) {
	t.Helper()
	if len(hits) == 0 {
		t.Fatal("no hits")
	}
	h := hits[0]
	if h.Match != "keyword" {
		t.Errorf("match = %q, want keyword", h.Match)
	}
	if h.Artifact != "strategy_formula" || h.Path != "competitive_moat.vs_competitors[0]" {
		t.Errorf("best hit = %s %s", h.Artifact, h.Path)
	}
	if h.SectionSizeChars <= 0 || h.Snippet == "" || !strings.Contains(h.ReadWith, "get_section") {
		t.Errorf("hit does not point at its read: %+v", h)
	}
	var sec struct {
		Defined bool `json:"defined"`
	}
	c.call(2, "get_section", map[string]any{"instance_id": instID, "artifact": h.Artifact, "path": h.Path}).assertOK().decode(&sec)
	if !sec.Defined {
		t.Errorf("get_section does not read the path the hit names: %s", h.Path)
	}
}

func TestMCP_SearchStrategy_NoMemoryUsesKeywordSearch(t *testing.T) {
	c, instID := keywordClient(t, nil, nil)
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_MemoryErrorFallsBackToKeyword(t *testing.T) {
	mem := memtest.New(t)
	mem.FailSearch = true
	c, instID := keywordClient(t, mem, func(svc mcpserver.Services, inst uuid.UUID) { markReady(t, svc, inst) })
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	if searchCalls(mem) == 0 {
		t.Error("auto mode did not try Memory first")
	}
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_OnlyFrameworkAndForeignHitsFallBackToKeyword(t *testing.T) {
	mem := memtest.New(t)
	other := uuid.New()
	c, instID := keywordClient(t, mem, func(svc mcpserver.Services, inst uuid.UUID) {
		markReady(t, svc, inst)
		putObject(t, svc, mem, inst, "definition", "sd-001", "artifact", map[string]any{
			"artifact_type": "definition", "integrity_class": "canonical_reference", "snippet": "framework text"})
		putForeign(mem, other, "strategy_formula", "strategy_formula", map[string]any{"artifact_type": "strategy_formula", "snippet": "foreign text"})
	})
	var hits []searchHit
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	if searchCalls(mem) == 0 {
		t.Fatal("Memory was never asked; the fallback below would prove nothing")
	}
	if strings.Contains(r.text, "framework text") || strings.Contains(r.text, "foreign text") {
		t.Error("a framework or foreign hit leaked")
	}
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_KeywordModeNeverCallsMemory(t *testing.T) {
	mem := memtest.New(t)
	c, instID := keywordClient(t, mem, func(svc mcpserver.Services, inst uuid.UUID) { markReady(t, svc, inst) })
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline", "mode": "keyword"}).assertOK().decode(&hits)
	if n := len(mem.Requests()); n != 0 {
		t.Errorf("Memory was called %d times in keyword mode", n)
	}
	requireKeywordHit(t, c, instID, hits)
}

// 9.14 through the tool: an instance whose graph is not built is not an error,
// and in auto mode the keyword search still answers without touching Memory.
func TestMCP_SearchStrategy_GraphNotBuiltFallsBackToKeywordWithoutAskingMemory(t *testing.T) {
	mem := memtest.New(t)
	other := uuid.New()
	c, instID := keywordClient(t, mem, func(mcpserver.Services, uuid.UUID) {
		putForeign(mem, other, "strategy_formula", "strategy_formula", map[string]any{"artifact_type": "strategy_formula", "snippet": "foreign text"})
	})
	var hits []searchHit
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	if searchCalls(mem) != 0 {
		t.Error("Memory was searched for an instance that has no graph")
	}
	if strings.Contains(r.text, "foreign text") {
		t.Error("another instance's data was returned")
	}
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SemanticReads_GraphNotBuiltIsAnEmptyResultWithAHint(t *testing.T) {
	mem := memtest.New(t)
	c, instID := keywordClient(t, mem, nil)
	for _, call := range []struct {
		tool string
		args map[string]any
	}{
		{"search_strategy", map[string]any{"instance_id": instID, "query": "x", "mode": "semantic"}},
		{"get_neighbors", map[string]any{"instance_id": instID, "node_key": "strategy_formula"}},
		{"detect_contradictions", map[string]any{"instance_id": instID}},
	} {
		var out struct {
			Results       []any  `json:"results"`
			GraphNotReady bool   `json:"graph_not_ready"`
			Hint          string `json:"hint"`
		}
		c.call(1, call.tool, call.args).assertOK().decode(&out)
		if !out.GraphNotReady || out.Results == nil || len(out.Results) != 0 || !strings.Contains(out.Hint, "graph_not_ready") {
			t.Errorf("%s: %+v, want an empty result with graph_not_ready and a hint", call.tool, out)
		}
	}
	if n := len(mem.Requests()); n != 0 {
		t.Errorf("%d calls reached Memory for an instance with no graph", n)
	}
}

func TestMCP_SearchStrategy_SemanticModeStillErrorsWithoutMemoryAndSaysWhatToDo(t *testing.T) {
	c, instID := keywordClient(t, nil, nil)
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco", "mode": "semantic"}).assertError()
	if !strings.Contains(r.text, "not configured") {
		t.Errorf("the reason was lost: %q", r.text)
	}
	if !strings.Contains(r.text, "keyword") {
		t.Errorf("the error does not point at keyword search: %q", r.text)
	}
}

func TestMCP_SearchStrategy_UnknownModeNamesTheValidOnes(t *testing.T) {
	c, instID := keywordClient(t, nil, nil)
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "x", "mode": "fuzzy"}).assertError()
	for _, want := range []string{"auto", "semantic", "keyword"} {
		if !strings.Contains(r.text, want) {
			t.Errorf("the error does not name %q: %q", want, r.text)
		}
	}
}

func TestMCP_SearchStrategy_NothingMatchingIsAnEmptyArray(t *testing.T) {
	c, instID := keywordClient(t, nil, nil)
	var hits []searchHit
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "zzzznotthere"}).assertOK().decode(&hits)
	if len(hits) != 0 || !strings.HasPrefix(strings.TrimSpace(r.text), "[") {
		t.Errorf("want an empty array, got %q", r.text)
	}
}

// What the client sees: a hit that matched two of three words says which word
// found nothing, so a query about something the strategy does not contain does
// not read as an answer.
func TestMCP_SearchStrategy_KeywordHitsNameTheWordsThatFoundNothing(t *testing.T) {
	c, instID := keywordClient(t, nil, nil)
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "zzqqxx Rivalco offline"}).assertOK().decode(&hits)
	if len(hits) == 0 {
		t.Fatal("no hits")
	}
	if got := strings.Join(hits[0].MissingTerms, ","); got != "zzqqxx" {
		t.Errorf("missing_terms = %q, want zzqqxx", got)
	}
	if len(hits[0].MatchedTerms) != 2 {
		t.Errorf("matched_terms = %v, want rivalco and offline", hits[0].MatchedTerms)
	}
}
