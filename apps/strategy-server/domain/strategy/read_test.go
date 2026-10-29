package strategy_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func jsonPayload(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	return m
}

const readFormula = `{"strategy":{"id":"sf-1","title":"Win with farmers",
 "trade_offs":[{"decision":"Depth over breadth","cost":"Fewer regions"},{"decision":"Own the data layer","cost":"Slower start"}],
 "competitive_moat":{"vs_competitors":[
   {"competitor":"Rivalco","category":"Traceability","wedge":"Offline first","our_angle":"Works without signal","their_strength":"Scale"},
   {"competitor":"Other","category":"ERP","wedge":"x","our_angle":"y","their_strength":"z"}]}}}`

const readRoadmap = `{"roadmap":{"id":"rm-1","tracks":{"commercial":{"okrs":[
 {"id":"okr-c-001","objective":"Land three pilots","key_results":[{"id":"kr-c-001","description":"Three signed pilots","target":"3"}]}]}}}}`

const readInsights = `{"target_users":[{"persona":"Farm manager","problems":["paper records"],"description":"Runs a cooperative"}],
 "competitive_landscape":{"direct_competitors":[{"name":"Rivalco","positioning":"Large traceability vendor","strengths":["scale"],"weaknesses":["cost"]}]}}`

func seedRead(t *testing.T) (*strategy.Service, *bun.DB, uuid.UUID) {
	t.Helper()
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)
	commitAuto(t, svc, inst, "strategy_formula", "strategy_formula", domain.MutationActionCreate, jsonPayload(t, readFormula))
	commitAuto(t, svc, inst, "roadmap_recipe", "roadmap_recipe", domain.MutationActionCreate, jsonPayload(t, readRoadmap))
	commitAuto(t, svc, inst, "insight_analyses", "insight_analyses", domain.MutationActionCreate, jsonPayload(t, readInsights))
	return svc, db, inst
}

func TestReadOutline_ListsAuthoredArtifactsAndSaysWhatIsNotDefined(t *testing.T) {
	svc, _, inst := seedRead(t)
	ctx := context.Background()

	// Framework content must not appear as strategy.
	commitAuto(t, svc, inst, "definition", "sd-001", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate, embeddedPayload(t, "READY/00_north_star"))

	out, err := svc.ReadOutline(ctx, inst, "")
	if err != nil {
		t.Fatalf("ReadOutline: %v", err)
	}

	byKey := map[string]strategy.ArtifactOutline{}
	for _, a := range out.Artifacts {
		byKey[a.Artifact] = a
	}
	for _, k := range []string{"strategy_formula", "roadmap_recipe", "insight_analyses"} {
		a, ok := byKey[k]
		if !ok {
			t.Errorf("%s is authored but not in the outline", k)
			continue
		}
		if a.SizeChars <= 0 || len(a.Sections) == 0 {
			t.Errorf("%s: size=%d sections=%v", k, a.SizeChars, a.Sections)
		}
	}
	if _, ok := byKey["strategy_formula"].Sections["trade_offs"]; !ok {
		t.Errorf("formula sections = %v, want trade_offs", byKey["strategy_formula"].Sections)
	}
	if _, listed := byKey["north_star"]; listed {
		t.Error("an unmodified template must not be listed as a defined artifact")
	}

	nd := map[string]string{}
	for _, n := range out.NotDefined {
		nd[n.Artifact] = n.Reason
	}
	if !strings.Contains(nd["north_star"], "template") {
		t.Errorf("north_star reason = %q, want it to say it is an unmodified template", nd["north_star"])
	}
	if _, ok := nd["strategy_foundations"]; !ok {
		t.Error("a READY artifact the instance lacks must be reported as not defined")
	}
	if out.FrameworkContent["canonical_reference"] != 1 {
		t.Errorf("framework_content = %v, want one canonical_reference counted, not listed", out.FrameworkContent)
	}
	if raw, _ := json.Marshal(out); len(raw) > 6000 {
		t.Errorf("outline is %d characters, want a few KB", len(raw))
	}
}

func TestReadOutline_ArtifactDescendsOneLevelWithGists(t *testing.T) {
	svc, _, inst := seedRead(t)
	out, err := svc.ReadOutline(context.Background(), inst, "strategy_formula")
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Artifacts) != 1 || len(out.Artifacts[0].Children) == 0 {
		t.Fatalf("want one artifact with children, got %+v", out.Artifacts)
	}
	var title string
	for _, c := range out.Artifacts[0].Children {
		if c.Key == "title" {
			title = c.Gist
		}
	}
	if title != "Win with farmers" {
		t.Errorf("title gist = %q", title)
	}
}

func TestReadSection_ReturnsTheSliceWithProvenance(t *testing.T) {
	svc, _, inst := seedRead(t)
	res, err := svc.ReadSection(context.Background(), inst, "strategy_formula", "trade_offs", 0)
	if err != nil {
		t.Fatalf("ReadSection: %v", err)
	}
	if !res.Defined || res.Truncated {
		t.Fatalf("defined=%v truncated=%v", res.Defined, res.Truncated)
	}
	if res.Source.ArtifactType != "strategy_formula" || res.Source.ArtifactKey != "strategy_formula" || res.Source.Path != "trade_offs" {
		t.Errorf("source = %+v", res.Source)
	}
	if res.CiteAs != "Strategy formula › trade offs" {
		t.Errorf("cite_as = %q", res.CiteAs)
	}
	if !strings.Contains(mustMarshal(t, res.Content), "Depth over breadth") {
		t.Errorf("content = %s", mustMarshal(t, res.Content))
	}
}

func TestReadSection_LabelsComeFromTheSameInstance(t *testing.T) {
	svc, _, inst := seedRead(t)
	res, err := svc.ReadSection(context.Background(), inst, "roadmap_recipe", "tracks.commercial.okrs[id=okr-c-001]", 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Labels["kr-c-001"] != "Three signed pilots" || res.Labels["okr-c-001"] != "Land three pilots" {
		t.Errorf("labels = %v", res.Labels)
	}
}

func TestReadSection_MissingArtifactAndTemplatesAreNotDefined(t *testing.T) {
	svc, _, inst := seedRead(t)
	ctx := context.Background()
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate, embeddedPayload(t, "READY/00_north_star"))

	missing, err := svc.ReadSection(ctx, inst, "strategy_foundations", "product_vision", 0)
	if err != nil {
		t.Fatal(err)
	}
	if missing.Defined || missing.Reason == "" || missing.Content != nil {
		t.Errorf("missing artifact: %+v", missing)
	}
	if len(missing.Available) == 0 {
		t.Error("a missing artifact should list what is available")
	}

	tmpl, err := svc.ReadSection(ctx, inst, "north_star", "vision", 0)
	if err != nil {
		t.Fatal(err)
	}
	if tmpl.Defined || tmpl.Content != nil {
		t.Fatalf("the template's content must never be returned as the company's strategy: %+v", tmpl)
	}
	if !strings.Contains(tmpl.Reason, "unmodified_template") {
		t.Errorf("reason = %q, want the class named", tmpl.Reason)
	}
	if tmpl.Integrity == nil || tmpl.Integrity.Class != "unmodified_template" {
		t.Errorf("integrity = %+v", tmpl.Integrity)
	}
}

func TestReadSection_MalformedPathIsAnError(t *testing.T) {
	svc, _, inst := seedRead(t)
	if _, err := svc.ReadSection(context.Background(), inst, "strategy_formula", "a[", 0); err == nil {
		t.Error("a malformed path must be reported to the caller")
	}
}

func mustMarshal(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
