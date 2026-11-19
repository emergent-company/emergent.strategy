package mcpserver_test

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/google/uuid"
)

func fitnessValueModel() map[string]any {
	return map[string]any{
		"track_name": "Product",
		"layers": []any{
			map[string]any{"id": "core", "name": "Core", "components": []any{
				map[string]any{"id": "search", "name": "Search", "sub_components": []any{
					map[string]any{"id": "fuzzy", "name": "Fuzzy"},
				}},
				map[string]any{"id": "index", "name": "Index"},
			}},
			map[string]any{"id": "edge", "name": "Edge", "components": []any{
				map[string]any{"id": "api", "name": "Api"},
			}},
		},
	}
}

func fitnessFeature(id, status string, paths ...string) map[string]any {
	ps := make([]any, len(paths))
	for i, p := range paths {
		ps[i] = p
	}
	return map[string]any{
		"id": id, "name": "Feature " + id, "status": status,
		"strategic_context": map[string]any{"contributes_to": ps},
	}
}

func TestMCP_ValidateKRTargetFitness_ReportsEachRuleOnSeededData(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	target := func(path string) map[string]any {
		return map[string]any{"track": "product", "component_path": path}
	}
	roadmap := map[string]any{"roadmap": map[string]any{"tracks": map[string]any{"product": map[string]any{
		"okrs": []any{map[string]any{"id": "okr-p-1", "key_results": []any{
			map[string]any{"id": "kr-no-path", "description": "no target"},
			map[string]any{"id": "kr-broken", "description": "bad path", "value_model_target": target("Product.Core.Nowhere")},
			map[string]any{"id": "kr-parent", "description": "sub-component", "value_model_target": target("Product.Core.Search.Fuzzy")},
		}}},
		"future_okrs_q3_2026": []any{map[string]any{"id": "okr-p-2", "key_results": []any{
			map[string]any{"id": "kr-future", "description": "served", "value_model_target": target("Product.Edge.Api")},
		}}},
	}}}}

	_, instID := seedInstance(t, svc, "kf-owner-"+uuid.New().String()[:8], map[string]any{
		"roadmap_recipe":      roadmap,
		"value_model_product": fitnessValueModel(),
		"fd-001_serves":       fitnessFeature("fd-001", "in-progress", "Product.Edge.Api"),
		"fd-002_parent":       fitnessFeature("fd-002", "in-progress", "Product.Core.Search"),
		"fd-003_adrift":       fitnessFeature("fd-003", "in-progress"),
		"fd-004_draft":        fitnessFeature("fd-004", "draft", "Product.Core.Index"),
	})

	structured, text, isErr := rawToolCall(t, c, 1, "validate_kr_target_fitness", map[string]any{"instance_id": instID.String()})
	if isErr {
		t.Fatal("a roadmap with fitness gaps must be answered, not rejected: isError means the call could not be performed")
	}
	assertValidatesAgainstPublishedSchema(t, "validate_kr_target_fitness", structured)

	var v struct {
		OK       bool   `json:"ok"`
		Summary  string `json:"summary"`
		Findings []struct {
			Severity string `json:"severity"`
			Key      string `json:"key"`
			Rule     string `json:"rule"`
			Path     string `json:"path"`
		} `json:"findings"`
	}
	if err := json.Unmarshal(structured, &v); err != nil {
		t.Fatal(err)
	}

	var got []string
	for _, f := range v.Findings {
		got = append(got, f.Rule+"/"+f.Severity+"/"+f.Key)
	}
	sort.Strings(got)
	want := []string{
		"feature.reaches_no_kr/error/fd-003_adrift",
		"feature.reaches_no_kr/warning/fd-004_draft",
		"kr.no_component_path/warning/roadmap_recipe",
		"kr.path_not_in_value_model/error/roadmap_recipe",
		"kr.reached_only_by_parent/warning/roadmap_recipe",
	}
	if len(got) != len(want) {
		t.Fatalf("findings = %v\nwant     %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("findings = %v\nwant     %v", got, want)
		}
	}
	if v.OK {
		t.Error("ok must be false while an error finding exists")
	}

	// The Key Result in the future group was counted and is served by fd-001.
	var detail struct {
		KRsTotal         int `json:"krs_total"`
		KRsServed        int `json:"krs_served"`
		FeaturesTotal    int `json:"features_total"`
		FeaturesReaching int `json:"features_reaching_a_kr"`
	}
	if err := json.Unmarshal([]byte(text), &detail); err != nil {
		t.Fatalf("decode detail: %v\n%s", err, text)
	}
	if detail.KRsTotal != 4 || detail.KRsServed != 1 || detail.FeaturesTotal != 4 || detail.FeaturesReaching != 2 {
		t.Errorf("detail = %+v, want 4 KRs of which 1 served, 4 features of which 2 reach a KR (fd-001 serves, fd-002 serves the parent)", detail)
	}
}

func TestMCP_ValidateKRTargetFitness_FailsRatherThanReportingACleanInstanceWithNothingToCheck(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	_, noRoadmap := seedInstance(t, svc, "kf-owner-"+uuid.New().String()[:8], map[string]any{
		"value_model_product": fitnessValueModel(),
	})
	if _, _, isErr := rawToolCall(t, c, 1, "validate_kr_target_fitness", map[string]any{"instance_id": noRoadmap.String()}); !isErr {
		t.Error("an instance with no roadmap has no Key Results to check; that is not a clean result")
	}

	_, noModel := seedInstance(t, svc, "kf-owner-"+uuid.New().String()[:8], map[string]any{
		"roadmap_recipe": map[string]any{"roadmap": map[string]any{"tracks": map[string]any{}}},
	})
	if _, _, isErr := rawToolCall(t, c, 2, "validate_kr_target_fitness", map[string]any{"instance_id": noModel.String()}); !isErr {
		t.Error("an instance with no value model has nothing to resolve targets against; that is not a clean result")
	}
}
