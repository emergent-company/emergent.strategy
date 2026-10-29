package strategy_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func searchAuthored(t *testing.T, svc *strategy.Service, inst uuid.UUID, q string, limit int) []strategy.KeywordHit {
	t.Helper()
	hits, err := svc.SearchAuthored(context.Background(), inst, q, limit)
	if err != nil {
		t.Fatalf("SearchAuthored(%q): %v", q, err)
	}
	return hits
}

func TestSearchAuthored_FindsSectionsAcrossArtifactsAndPointsAtTheRead(t *testing.T) {
	svc, _, inst := seedRead(t)

	hits := searchAuthored(t, svc, inst, "Rivalco offline", 0)
	if len(hits) < 2 {
		t.Fatalf("hits = %+v, want the formula entry and the insights entry", hits)
	}
	best := hits[0]
	if best.ArtifactKey != "strategy_formula" || best.Path != "competitive_moat.vs_competitors[0]" {
		t.Errorf("best hit = %s %s, want the formula's Rivalco entry first", best.ArtifactKey, best.Path)
	}
	if best.ArtifactType != "strategy_formula" || best.SizeChars <= 0 || best.Snippet == "" || best.Score <= 0 {
		t.Errorf("incomplete hit: %+v", best)
	}
	if !strings.Contains(best.ReadWith, "get_section") || !strings.Contains(best.ReadWith, "strategy_formula") || !strings.Contains(best.ReadWith, best.Path) {
		t.Errorf("read_with = %q", best.ReadWith)
	}
	sec, err := svc.ReadSection(context.Background(), inst, best.ArtifactKey, best.Path, 0)
	if err != nil || !sec.Defined {
		t.Fatalf("the hit does not read: err=%v defined=%v", err, sec != nil && sec.Defined)
	}
	var keys []string
	for _, h := range hits {
		keys = append(keys, h.ArtifactKey)
	}
	if !strings.Contains(strings.Join(keys, ","), "insight_analyses") {
		t.Errorf("the insights entry is missing: %v", keys)
	}
}

func TestSearchAuthored_NeverReturnsFrameworkContent(t *testing.T) {
	svc, _, inst := seedRead(t)
	commitAuto(t, svc, inst, "definition", "sd-001", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate, embeddedPayload(t, "READY/00_north_star"))

	term := ""
	for _, cand := range []string{"mission", "vision", "belief", "purpose", "example", "strategy"} {
		if len(strategyread.Search("north_star", embeddedPayload(t, "READY/00_north_star"), cand)) > 0 {
			term = cand
			break
		}
	}
	if term == "" {
		t.Fatal("precondition: the unmodified north star template contains none of the candidate words, so this test would prove nothing")
	}

	for _, h := range searchAuthored(t, svc, inst, term, 25) {
		if h.ArtifactKey == "north_star" || h.ArtifactKey == "sd-001" {
			t.Errorf("framework content returned as a hit: %+v", h)
		}
	}
}

func TestSearchAuthored_OnlyTheRequestedInstance(t *testing.T) {
	svc, db, a := seedRead(t)
	b := seedIntegrityInstance(t, db)
	commitAuto(t, svc, b, "strategy_formula", "strategy_formula", domain.MutationActionCreate,
		jsonPayload(t, `{"strategy":{"id":"sf-b","title":"Zanzibar expansion"}}`))

	if got := searchAuthored(t, svc, a, "zanzibar", 10); len(got) != 0 {
		t.Errorf("another instance's content was returned: %+v", got)
	}
	if got := searchAuthored(t, svc, b, "zanzibar", 10); len(got) != 1 {
		t.Errorf("the owning instance finds %d hits, want 1", len(got))
	}
}

func TestSearchAuthored_SkipsEvidenceAndArchivedArtifacts(t *testing.T) {
	svc, _, inst := seedRead(t)
	commitAuto(t, svc, inst, "evidence", "ev-1", domain.MutationActionCreate,
		jsonPayload(t, `{"summary":"Interview about Zanzibar logistics"}`))
	commitAuto(t, svc, inst, "insight_opportunity", "insight_opportunity", domain.MutationActionCreate,
		jsonPayload(t, `{"opportunity":{"id":"op-1","title":"Quokka market"}}`))
	if got := searchAuthored(t, svc, inst, "quokka", 10); len(got) != 1 {
		t.Fatalf("precondition: want 1 hit before archiving, got %+v", got)
	}
	commitAuto(t, svc, inst, "insight_opportunity", "insight_opportunity", domain.MutationActionArchive,
		jsonPayload(t, `{"opportunity":{"id":"op-1","title":"Quokka market"}}`))

	if got := searchAuthored(t, svc, inst, "zanzibar", 10); len(got) != 0 {
		t.Errorf("evidence was searched: %+v", got)
	}
	if got := searchAuthored(t, svc, inst, "quokka", 10); len(got) != 0 {
		t.Errorf("an archived artifact was searched: %+v", got)
	}
}

func TestSearchAuthored_LimitDefaultAndCap(t *testing.T) {
	svc, _, inst := seedRead(t)
	var items []string
	for i := 0; i < 40; i++ {
		items = append(items, fmt.Sprintf(`{"id":"i%d","text":"aardvark item %d"}`, i, i))
	}
	commitAuto(t, svc, inst, "insight_opportunity", "insight_opportunity", domain.MutationActionCreate,
		jsonPayload(t, `{"opportunity":{"id":"op","items":[`+strings.Join(items, ",")+`]}}`))

	if got := searchAuthored(t, svc, inst, "aardvark", 0); len(got) != 10 {
		t.Errorf("default limit: %d hits, want 10", len(got))
	}
	if got := searchAuthored(t, svc, inst, "aardvark", 100); len(got) != 25 {
		t.Errorf("capped limit: %d hits, want 25", len(got))
	}
	if got := searchAuthored(t, svc, inst, "aardvark", 3); len(got) != 3 {
		t.Errorf("explicit limit: %d hits, want 3", len(got))
	}
}

func TestSearchAuthored_NothingToFindIsEmptyNotAnError(t *testing.T) {
	svc, _, inst := seedRead(t)
	for _, q := range []string{"", "what is the", "zzzznotthere"} {
		if got := searchAuthored(t, svc, inst, q, 10); len(got) != 0 {
			t.Errorf("%q: %+v", q, got)
		}
	}
}
