package strategy_test

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

func productModel(key string) strategy.FitnessModel {
	return strategy.FitnessModel{Key: key, Model: valuemodel.ParseModel(map[string]any{
		"track_name": "Product",
		"layers": []any{
			map[string]any{"id": "core", "name": "Core", "components": []any{
				map[string]any{"id": "search", "name": "Search", "sub_components": []any{
					map[string]any{"id": "fuzzy", "name": "Fuzzy"},
					map[string]any{"id": "exact", "name": "Exact"},
				}},
				map[string]any{"id": "index", "name": "Index"},
			}},
			map[string]any{"id": "edge", "name": "Edge", "components": []any{
				map[string]any{"id": "api", "name": "Api"},
			}},
		},
	})}
}

func roadmapWith(krs ...map[string]any) map[string]any {
	items := make([]any, len(krs))
	for i, k := range krs {
		items[i] = k
	}
	return map[string]any{"roadmap": map[string]any{"tracks": map[string]any{
		"product": map[string]any{
			"okrs": []any{map[string]any{"id": "okr-p-1", "key_results": items}},
		},
	}}}
}

func kr(id, path string) map[string]any {
	out := map[string]any{"id": id, "description": "desc " + id}
	if path != "" {
		out["value_model_target"] = map[string]any{"track": "product", "component_path": path}
	}
	return out
}

func feature(key, status string, paths ...string) strategy.FitnessContributor {
	ps := make([]any, len(paths))
	for i, p := range paths {
		ps[i] = p
	}
	return strategy.FitnessContributor{
		Key: key, Type: "feature", Status: status,
		Payload: map[string]any{"strategic_context": map[string]any{"contributes_to": ps}},
	}
}

// ruleCounts tallies findings as "rule/severity".
func ruleCounts(rep strategy.FitnessReport) map[string]int {
	out := map[string]int{}
	for _, f := range rep.Findings {
		out[f.Rule+"/"+f.Severity]++
	}
	return out
}

func wantRules(t *testing.T, rep strategy.FitnessReport, want map[string]int) {
	t.Helper()
	got := ruleCounts(rep)
	if len(got) != len(want) {
		t.Fatalf("findings = %v, want %v\n%+v", got, want, rep.Findings)
	}
	for k, n := range want {
		if got[k] != n {
			t.Fatalf("findings = %v, want %v\n%+v", got, want, rep.Findings)
		}
	}
}

func TestFitness_KRWithoutAComponentPathIsAWarning(t *testing.T) {
	rep := strategy.AnalyzeKRFitness(roadmapWith(kr("kr-1", "")), []strategy.FitnessModel{productModel("vm")}, nil)
	wantRules(t, rep, map[string]int{"kr.no_component_path/warning": 1})
	if rep.KRsTotal != 1 || rep.KRsWithPath != 0 {
		t.Errorf("counts = %+v, want 1 KR, none with a path", rep)
	}
}

func TestFitness_KRPathNamingNothingIsAnError(t *testing.T) {
	rep := strategy.AnalyzeKRFitness(roadmapWith(kr("kr-1", "Product.Core.Nowhere")), []strategy.FitnessModel{productModel("vm")}, nil)
	wantRules(t, rep, map[string]int{"kr.path_not_in_value_model/error": 1})
	if rep.KRsWithPath != 1 || rep.KRsResolved != 0 {
		t.Errorf("counts = %+v, want one path, none resolved", rep)
	}
}

func TestFitness_KRPathInTheWrongTrackIsNotInTheModel(t *testing.T) {
	rep := strategy.AnalyzeKRFitness(roadmapWith(kr("kr-1", "Commercial.Core.Search")), []strategy.FitnessModel{productModel("vm")}, nil)
	wantRules(t, rep, map[string]int{"kr.path_not_in_value_model/error": 1})
}

func TestFitness_KRReachedOnlyByAParent(t *testing.T) {
	models := []strategy.FitnessModel{productModel("vm")}
	// The KR is about the Fuzzy sub-component; the only contributor serves Search as a whole.
	rep := strategy.AnalyzeKRFitness(
		roadmapWith(kr("kr-1", "Product.Core.Search.Fuzzy")), models,
		[]strategy.FitnessContributor{feature("fd-001", "ready", "Product.Core.Search")})
	wantRules(t, rep, map[string]int{"kr.reached_only_by_parent/warning": 1})
	if rep.KRsServed != 0 {
		t.Errorf("KRsServed = %d, want 0", rep.KRsServed)
	}
	if rep.FeaturesReaching != 1 {
		t.Errorf("a feature serving the parent of a KR target still reaches it, got %d reaching", rep.FeaturesReaching)
	}
}

func TestFitness_AContributorAtTheTargetOrBelowServesIt(t *testing.T) {
	models := []strategy.FitnessModel{productModel("vm")}
	for name, tc := range map[string]struct{ krPath, featurePath string }{
		"same sub-component":         {"Product.Core.Search.Fuzzy", "Product.Core.Search.Fuzzy"},
		"sub-component under target": {"Product.Core.Search", "Product.Core.Search.Fuzzy"},
		"same component":             {"Product.Core.Index", "Product.Core.Index"},
		"component under layer KR":   {"Product.Core", "Product.Core.Index"},
	} {
		t.Run(name, func(t *testing.T) {
			rep := strategy.AnalyzeKRFitness(roadmapWith(kr("kr-1", tc.krPath)), models,
				[]strategy.FitnessContributor{feature("fd-001", "in-progress", tc.featurePath)})
			wantRules(t, rep, map[string]int{})
			if rep.KRsServed != 1 || rep.FeaturesReaching != 1 {
				t.Errorf("counts = %+v, want the KR served and the feature reaching", rep)
			}
		})
	}
}

func TestFitness_ASiblingDoesNotServeTheTarget(t *testing.T) {
	rep := strategy.AnalyzeKRFitness(
		roadmapWith(kr("kr-1", "Product.Core.Search.Fuzzy")), []strategy.FitnessModel{productModel("vm")},
		[]strategy.FitnessContributor{feature("fd-001", "draft", "Product.Core.Search.Exact")})
	// Nothing serves the KR (not a finding: see the package comment), and the feature reaches none.
	wantRules(t, rep, map[string]int{"feature.reaches_no_kr/warning": 1})
}

func TestFitness_FeatureSeverityFollowsItsStatus(t *testing.T) {
	models := []strategy.FitnessModel{productModel("vm")}
	road := roadmapWith(kr("kr-1", "Product.Edge.Api"))
	for status, want := range map[string]string{
		"in-progress": "error",
		"draft":       "warning",
		"ready":       "warning",
		"":            "warning",
		"delivered":   "info",
	} {
		rep := strategy.AnalyzeKRFitness(road, models,
			[]strategy.FitnessContributor{feature("fd-001", status, "Product.Core.Index")})
		wantRules(t, rep, map[string]int{"feature.reaches_no_kr/" + want: 1})
	}
}

func TestFitness_FeatureWithNoUsablePathSaysWhy(t *testing.T) {
	models := []strategy.FitnessModel{productModel("vm")}
	road := roadmapWith(kr("kr-1", "Product.Edge.Api"))

	none := strategy.AnalyzeKRFitness(road, models, []strategy.FitnessContributor{feature("fd-001", "in-progress")})
	if len(none.Findings) != 1 || !strings.Contains(none.Findings[0].Message, "declares no contributes_to") {
		t.Errorf("a feature with no paths: %+v", none.Findings)
	}
	broken := strategy.AnalyzeKRFitness(road, models, []strategy.FitnessContributor{feature("fd-001", "in-progress", "Product.Core.Nowhere")})
	if len(broken.Findings) != 1 || !strings.Contains(broken.Findings[0].Message, "none of its 1 contributes_to paths resolves") {
		t.Errorf("a feature whose path resolves nowhere: %+v", broken.Findings)
	}
}

func TestFitness_WhenNoKeyResultHasATargetTheFeatureFindingNamesThatRootCause(t *testing.T) {
	rep := strategy.AnalyzeKRFitness(roadmapWith(kr("kr-1", "")), []strategy.FitnessModel{productModel("vm")},
		[]strategy.FitnessContributor{feature("fd-001", "in-progress", "Product.Core.Index")})
	wantRules(t, rep, map[string]int{"kr.no_component_path/warning": 1, "feature.reaches_no_kr/error": 1})
	for _, f := range rep.Findings {
		if f.Rule == "feature.reaches_no_kr" && !strings.Contains(f.Message, "no Key Result in the roadmap resolves") {
			t.Errorf("message %q should point at the Key Result targets, not blame the feature", f.Message)
		}
	}
}

func TestFitness_OnlyFeaturesAreCheckedForReachingAKR(t *testing.T) {
	def := strategy.FitnessContributor{Key: "strategy-def-1", Type: "strategy_def", Payload: map[string]any{"contributes_to": []any{"Product.Core.Index"}}}
	rep := strategy.AnalyzeKRFitness(roadmapWith(kr("kr-1", "Product.Edge.Api")), []strategy.FitnessModel{productModel("vm")}, []strategy.FitnessContributor{def})
	wantRules(t, rep, map[string]int{})
	if rep.FeaturesTotal != 0 {
		t.Errorf("FeaturesTotal = %d, want 0: a strategy definition is a contributor, not a feature", rep.FeaturesTotal)
	}
}

func TestFitness_SeesKeyResultsInFutureOKRGroups(t *testing.T) {
	road := map[string]any{"roadmap": map[string]any{"tracks": map[string]any{"product": map[string]any{
		"okrs": []any{},
		"future_okrs_q3_2026": []any{map[string]any{"id": "okr-p-9", "key_results": []any{
			kr("kr-future", ""),
		}}},
	}}}}
	rep := strategy.AnalyzeKRFitness(road, []strategy.FitnessModel{productModel("vm")}, nil)
	if rep.KRsTotal != 1 {
		t.Fatalf("KRsTotal = %d, want the future-group KR counted", rep.KRsTotal)
	}
	wantRules(t, rep, map[string]int{"kr.no_component_path/warning": 1})
	if !strings.Contains(rep.Findings[0].Path, "future_okrs_q3_2026") {
		t.Errorf("finding path %q should name the group the KR was found in", rep.Findings[0].Path)
	}
}

func TestFitness_TwoModelsOfOneTrackAreKeptApart(t *testing.T) {
	hardware := productModel("vm-hardware")
	software := strategy.FitnessModel{Key: "vm-software", Model: valuemodel.ParseModel(map[string]any{
		"track_name": "Product",
		"layers": []any{map[string]any{"id": "app", "name": "App", "components": []any{
			map[string]any{"id": "dash", "name": "Dash"},
		}}},
	})}
	rep := strategy.AnalyzeKRFitness(
		roadmapWith(kr("kr-1", "Product.App.Dash")), []strategy.FitnessModel{hardware, software},
		[]strategy.FitnessContributor{
			feature("fd-hw", "in-progress", "Product.Edge.Api"), // a component of the other model
			feature("fd-sw", "in-progress", "Product.App.Dash"),
		})
	wantRules(t, rep, map[string]int{"feature.reaches_no_kr/error": 1})
	if rep.Findings[0].Key != "fd-hw" {
		t.Errorf("finding is about %q, want fd-hw", rep.Findings[0].Key)
	}
	if rep.KRsServed != 1 || rep.FeaturesReaching != 1 {
		t.Errorf("counts = %+v, want the KR served by fd-sw only", rep)
	}
}

func TestFitness_ReportIsDeterministic(t *testing.T) {
	models := []strategy.FitnessModel{productModel("vm")}
	road := roadmapWith(kr("kr-b", ""), kr("kr-a", ""), kr("kr-c", "Product.Core.Nowhere"))
	feats := []strategy.FitnessContributor{feature("fd-2", "draft"), feature("fd-1", "draft")}
	first := strategy.AnalyzeKRFitness(road, models, feats)
	for i := 0; i < 20; i++ {
		again := strategy.AnalyzeKRFitness(road, models, feats)
		if len(again.Findings) != len(first.Findings) {
			t.Fatal("finding count changed between runs")
		}
		for j := range first.Findings {
			if again.Findings[j] != first.Findings[j] {
				t.Fatalf("finding %d changed between runs: %+v vs %+v", j, again.Findings[j], first.Findings[j])
			}
		}
	}
}
