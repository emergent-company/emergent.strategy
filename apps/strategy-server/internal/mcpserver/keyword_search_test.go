package mcpserver_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

type searchHit struct {
	ArtifactKey      string  `json:"artifact_key"`
	Artifact         string  `json:"artifact"`
	Path             string  `json:"path"`
	Snippet          string  `json:"snippet"`
	Score            float64 `json:"score"`
	SectionSizeChars int     `json:"section_size_chars"`
	ReadWith         string  `json:"read_with"`
	Match            string  `json:"match"`
}

// keywordClient serves an instance with the bounded-reads fixture. memory is the
// handler that stands in for Memory; nil means Memory is not configured.
func keywordClient(t *testing.T, memory http.Handler) (c *mcpClient, instID string, memoryCalls *atomic.Int32) {
	t.Helper()
	memoryCalls = &atomic.Int32{}
	cfg := semantic.Config{}
	if memory != nil {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			memoryCalls.Add(1)
			memory.ServeHTTP(w, r)
		}))
		t.Cleanup(srv.Close)
		cfg = semantic.Config{URL: srv.URL, Project: "p", Token: "t"}
	}
	db := database.TestDB(t)
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc)
	svc := mcpserver.Services{
		Workspace: workspace.NewService(db),
		Instance:  instSvc,
		Strategy:  strategy.NewService(db),
		Pack:      packSvc,
		App:       appdom.NewService(db),
		Semantic:  semantic.NewService(cfg),
		Org:       orgdom.NewService(db),
	}
	_, id := seedInstance(t, svc, "kw-owner", brPayloads(t))
	return newMCPClient(t, svc), id.String(), memoryCalls
}

func memoryReturning(results ...map[string]any) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"results": results})
	})
}

func memoryHit(key string, props map[string]any) map[string]any {
	return map[string]any{"object": map[string]any{"id": "o-" + key, "type": "x", "key": key, "properties": props}, "score": 0.9, "source": "vector"}
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
	c, instID, _ := keywordClient(t, nil)
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_MemoryErrorFallsBackToKeyword(t *testing.T) {
	c, instID, calls := keywordClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	if calls.Load() == 0 {
		t.Error("auto mode did not try Memory first")
	}
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_OnlyFrameworkAndForeignHitsFallBackToKeyword(t *testing.T) {
	var instID string
	mem := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		memoryReturning(
			memoryHit("sd-001", map[string]any{"artifact_type": "definition", "instance_id": instID, "integrity_class": "canonical_reference", "snippet": "framework text"}),
			memoryHit("elsewhere", map[string]any{"artifact_type": "strategy_formula", "instance_id": "00000000-0000-0000-0000-00000000dead", "snippet": "foreign text"}),
		).ServeHTTP(w, r)
	})
	c, id, _ := keywordClient(t, mem)
	instID = id
	var hits []searchHit
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline"}).assertOK().decode(&hits)
	if strings.Contains(r.text, "framework text") || strings.Contains(r.text, "foreign text") {
		t.Error("a framework or foreign hit leaked")
	}
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_KeywordModeNeverCallsMemory(t *testing.T) {
	c, instID, calls := keywordClient(t, memoryReturning())
	var hits []searchHit
	c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco offline", "mode": "keyword"}).assertOK().decode(&hits)
	if calls.Load() != 0 {
		t.Errorf("Memory was called %d times in keyword mode", calls.Load())
	}
	requireKeywordHit(t, c, instID, hits)
}

func TestMCP_SearchStrategy_SemanticModeStillErrorsWithoutMemoryAndSaysWhatToDo(t *testing.T) {
	c, instID, _ := keywordClient(t, nil)
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "Rivalco", "mode": "semantic"}).assertError()
	if !strings.Contains(r.text, "not configured") {
		t.Errorf("the reason was lost: %q", r.text)
	}
	if !strings.Contains(r.text, "keyword") {
		t.Errorf("the error does not point at keyword search: %q", r.text)
	}
}

func TestMCP_SearchStrategy_UnknownModeNamesTheValidOnes(t *testing.T) {
	c, instID, _ := keywordClient(t, nil)
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "x", "mode": "fuzzy"}).assertError()
	for _, want := range []string{"auto", "semantic", "keyword"} {
		if !strings.Contains(r.text, want) {
			t.Errorf("the error does not name %q: %q", want, r.text)
		}
	}
}

func TestMCP_SearchStrategy_NothingMatchingIsAnEmptyArray(t *testing.T) {
	c, instID, _ := keywordClient(t, nil)
	var hits []searchHit
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "zzzznotthere"}).assertOK().decode(&hits)
	if len(hits) != 0 || !strings.HasPrefix(strings.TrimSpace(r.text), "[") {
		t.Errorf("want an empty array, got %q", r.text)
	}
}
