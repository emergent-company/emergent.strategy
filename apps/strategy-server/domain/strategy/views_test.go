package strategy_test

import (
	"context"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestReadView_CompetitorComposesBothFilesAndReportsMissingParts(t *testing.T) {
	svc, _, inst := seedRead(t)
	res, err := svc.ReadView(context.Background(), inst, "competitor", map[string]string{"name": "Koltiva"}, 0)
	if err != nil {
		t.Fatalf("ReadView: %v", err)
	}
	if res.View != "competitor" || len(res.Parts) != 3 {
		t.Fatalf("view=%q parts=%d, want the three parts", res.View, len(res.Parts))
	}
	parts := map[string]bool{}
	for _, p := range res.Parts {
		parts[p.Name] = p.Defined
	}
	if !parts["positioning_vs_competitor"] || !parts["landscape_entry"] {
		t.Errorf("parts defined = %v, want both competitor sources defined", parts)
	}
	if parts["positioning_statement"] {
		t.Error("the fixture has no positioning statement; the part must be reported as not defined, not skipped")
	}
	for _, p := range res.Parts {
		if p.Name == "positioning_vs_competitor" {
			if !strings.Contains(mustMarshal(t, p.Content), "Offline first") {
				t.Errorf("content = %s", mustMarshal(t, p.Content))
			}
			if p.Source.ArtifactType != "strategy_formula" || p.CiteAs == "" {
				t.Errorf("source = %+v cite = %q", p.Source, p.CiteAs)
			}
		}
		if p.Name == "positioning_statement" && p.Reason == "" {
			t.Error("a missing part must say why")
		}
	}
}

func TestReadView_CompetitorRequiresAName(t *testing.T) {
	svc, _, inst := seedRead(t)
	if _, err := svc.ReadView(context.Background(), inst, "competitor", nil, 0); err == nil {
		t.Error("the competitor view needs a name")
	}
}

func TestReadView_UnknownViewListsTheValidOnes(t *testing.T) {
	svc, _, inst := seedRead(t)
	_, err := svc.ReadView(context.Background(), inst, "nonsense", nil, 0)
	if err == nil || !strings.Contains(err.Error(), "competitor") {
		t.Errorf("err = %v, want the valid views named", err)
	}
}

func TestReadView_ObjectivesAndKeyResult(t *testing.T) {
	svc, _, inst := seedRead(t)
	ctx := context.Background()

	obj, err := svc.ReadView(ctx, inst, "objectives", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(obj.Parts) != 1 || !obj.Parts[0].Defined || !strings.Contains(mustMarshal(t, obj.Parts[0].Content), "Land three pilots") {
		t.Fatalf("objectives = %+v", obj.Parts)
	}
	if !strings.Contains(mustMarshal(t, obj.Parts[0].Content), "kr-c-001") {
		t.Error("objectives must list key result ids")
	}
	if obj.Labels["kr-c-001"] != "Three signed pilots" {
		t.Errorf("labels = %v", obj.Labels)
	}

	kr, err := svc.ReadView(ctx, inst, "key_result", map[string]string{"id": "kr-c-001"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !kr.Parts[0].Defined || !strings.Contains(mustMarshal(t, kr.Parts[0].Content), "Land three pilots") {
		t.Errorf("key_result = %s", mustMarshal(t, kr.Parts))
	}

	none, err := svc.ReadView(ctx, inst, "key_result", map[string]string{"id": "kr-zzz"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if none.Parts[0].Defined || none.Parts[0].Reason == "" {
		t.Errorf("an unknown key result must be reported as not defined: %+v", none.Parts[0])
	}
}

func TestReadView_PersonasReadTheInsightsFile(t *testing.T) {
	svc, _, inst := seedRead(t)
	res, err := svc.ReadView(context.Background(), inst, "personas", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Parts) != 1 || !res.Parts[0].Defined {
		t.Fatalf("personas = %+v", res.Parts)
	}
	if res.Parts[0].Source.ArtifactType != "insight_analyses" || !strings.Contains(mustMarshal(t, res.Parts[0].Content), "Farm manager") {
		t.Errorf("personas must come from insight_analyses.target_users: %+v", res.Parts[0])
	}
}

func TestReadView_TemplatesAreNeverContent(t *testing.T) {
	svc, _, inst := seedRead(t)
	commitAuto(t, svc, inst, "roadmap_recipe", "roadmap_recipe", domain.MutationActionUpdate, embeddedPayload(t, "READY/05_roadmap_recipe"))

	res, err := svc.ReadView(context.Background(), inst, "objectives", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Parts[0].Defined || res.Parts[0].Content != nil {
		t.Errorf("an unmodified roadmap template must not be reported as the objectives: %+v", res.Parts[0])
	}
}

func TestReadView_SharesOneBudget(t *testing.T) {
	svc, _, inst := seedRead(t)
	res, err := svc.ReadView(context.Background(), inst, "competitor", map[string]string{"name": "Koltiva"}, 150)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Truncated {
		t.Error("a view that does not fit its budget must say so")
	}
	total := 0
	for _, p := range res.Parts {
		if p.Content != nil {
			total += len(mustMarshal(t, p.Content))
		}
	}
	if total > 150 {
		t.Errorf("parts returned %d characters of content, over the shared budget of 150", total)
	}
}
