package mcpserver_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestMCP_SearchStrategy_FiltersFrameworkAndPointsAtTheRead(t *testing.T) {
	var instID string
	memory := http.NewServeMux()
	memory.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		hit := func(key string, props map[string]any, score float64) map[string]any {
			return map[string]any{"object": map[string]any{"id": "o-" + key, "type": "x", "key": key, "properties": props}, "score": score, "source": "vector"}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{
			hit("sd-001", map[string]any{"artifact_type": "definition", "instance_id": instID, "integrity_class": "canonical_reference", "snippet": "framework text"}, 0.99),
			hit("someone-elses", map[string]any{"artifact_type": "strategy_formula", "instance_id": "00000000-0000-0000-0000-00000000dead", "snippet": "foreign text"}, 0.95),
			hit("strategy_formula", map[string]any{"artifact_type": "strategy_formula", "instance_id": instID, "snippet": "our formula"}, 0.9),
		}})
	})
	srv := httptest.NewServer(memory)
	t.Cleanup(srv.Close)

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
		Semantic:  semantic.NewService(semantic.Config{URL: srv.URL, Project: "p", Token: "t"}),
		Org:       orgdom.NewService(db),
	}
	_, id := seedInstance(t, svc, "search-owner", brPayloads(t))
	instID = id.String()
	c := newMCPClient(t, svc)

	var hits []struct {
		ArtifactKey      string `json:"artifact_key"`
		Artifact         string `json:"artifact"`
		SectionSizeChars int    `json:"section_size_chars"`
		ReadWith         string `json:"read_with"`
	}
	r := c.call(1, "search_strategy", map[string]any{"instance_id": instID, "query": "trade-offs"}).assertOK().decode(&hits)

	if len(hits) != 1 || hits[0].ArtifactKey != "strategy_formula" {
		t.Fatalf("hits = %+v, want only the instance's own authored hit", hits)
	}
	if strings.Contains(r.text, "framework text") || strings.Contains(r.text, "foreign text") {
		t.Error("a framework or foreign hit leaked into the response")
	}
	if hits[0].Artifact != "strategy_formula" || hits[0].SectionSizeChars <= 0 {
		t.Errorf("hit does not point at its section: %+v", hits[0])
	}
	if !strings.Contains(hits[0].ReadWith, "get_section") || !strings.Contains(hits[0].ReadWith, "strategy_formula") {
		t.Errorf("read_with = %q", hits[0].ReadWith)
	}
}

func TestMCP_SearchStrategy_WhenUnavailableSaysHowToReadInstead(t *testing.T) {
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
		Semantic:  semantic.NewService(semantic.Config{}),
		Org:       orgdom.NewService(db),
	}
	_, id := seedInstance(t, svc, "search-off", brPayloads(t))
	c := newMCPClient(t, svc)

	r := c.call(1, "search_strategy", map[string]any{"instance_id": id.String(), "query": "anything"}).assertError()

	if !strings.Contains(r.text, "get_outline") || !strings.Contains(r.text, "get_section") {
		t.Errorf("an unavailable search should say how to find the section instead: %q", r.text)
	}
	if !strings.Contains(r.text, "not configured") {
		t.Errorf("the underlying reason was lost: %q", r.text)
	}
}
