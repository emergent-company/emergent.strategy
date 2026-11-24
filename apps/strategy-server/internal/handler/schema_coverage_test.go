package handler

import (
	"bytes"
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// schemaPages says, for every embedded schema, how the web UI shows an artifact
// of that kind. The test below renders a payload built from the schema through
// the same dispatcher the artifact page uses, and fails when a string the schema
// defines does not reach the page. That is the guard behind issue #163: a canonical
// release that adds a property must not be silently dropped by the UI.
//
// A schema that is new to the embedded set fails TestEverySchemaIsClassified
// until it is added here. The canonical sync (scripts/sync-embedded.sh) runs both.
//
// artifactType is what the dispatcher is given. A type with no dedicated view
// falls to the generic renderer, which shows every stored value, so it is
// covered by the same check.
var schemaPages = map[string]string{
	"aim_trigger_config_schema.json":        "aim_trigger_config",
	"assessment_report_schema.json":         "assessment_report",
	"calibration_memo_schema.json":          "calibration_memo",
	"commercial_definition_schema.json":     "commercial_def",
	"feature_definition_schema.json":        "feature_definition",
	"insight_analyses_schema.json":          "insight_analyses",
	"insight_opportunity_schema.json":       "insight_opportunity",
	"living_reality_assessment_schema.json": "living_reality_assessment",
	"mappings_schema.json":                  "mappings",
	"north_star_schema.json":                "north_star",
	"org_ops_definition_schema.json":        "org_ops_def",
	"product_portfolio_schema.json":         "product_portfolio",
	"roadmap_recipe_schema.json":            "roadmap_recipe",
	"strategic_reality_check_schema.json":   "strategic_reality_check",
	"strategy_definition_schema.json":       "strategy_def",
	"strategy_formula_schema.json":          "strategy_formula",
	"strategy_foundations_schema.json":      "strategy_foundations",
	"track_health_assessment_schema.json":   "track_health_assessment",
	"value_model_schema.json":               "value_model",
	"work_package_schema.json":              "work_package",
}

// schemasWithoutAPage are embedded schemas that describe no artifact a person
// opens in the web UI. Each carries the reason.
var schemasWithoutAPage = map[string]string{
	"_epf_anchor_schema.json":           "the instance anchor file, read by the loader, never an artifact page",
	"field-importance-taxonomy.json":    "a classification table, not a schema of stored content",
	"navigation_graph_schema.json":      "the shape of the framework's own navigation graph, not instance content",
	"track_definition_base_schema.json": "the base every track definition extends; each is covered through its own schema",
	"workflow_schema.json":              "describes workflow definitions the framework ships, not instance content",
}

// markersNotShown names strings a schema defines that the page deliberately does
// not show, keyed by schema file and then by marker. Each entry needs a reason.
// An entry that is no longer needed (the page shows the string, or the schema no
// longer defines it) fails the test, so the list cannot go stale.
var markersNotShown = map[string]map[string]string{}

func renderPageOfType(t *testing.T, artifactType string, payload map[string]any) string {
	t.Helper()
	comp := (&Server{}).bespokeContent(context.Background(), "instance", "", ui.NavContext{}, artifactType, artifactType, artifactType, "draft", payload)
	if comp == nil {
		t.Fatalf("%s: no component was built", artifactType)
	}
	var buf bytes.Buffer
	if err := comp.Render(context.Background(), &buf); err != nil {
		t.Fatalf("%s: render: %v", artifactType, err)
	}
	return buf.String()
}

func TestEverySchemaIsClassified(t *testing.T) {
	files, err := embedded.ListSchemas()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		_, page := schemaPages[f]
		_, none := schemasWithoutAPage[f]
		switch {
		case page && none:
			t.Errorf("%s is listed both as a page and as having none", f)
		case !page && !none:
			t.Errorf("%s is a new embedded schema. Add it to schemaPages (and give its artifact a view that shows every property) or to schemasWithoutAPage with the reason.", f)
		}
	}
	have := map[string]bool{}
	for _, f := range files {
		have[f] = true
	}
	for f := range schemaPages {
		if !have[f] {
			t.Errorf("schemaPages names %s, which is not an embedded schema any more", f)
		}
	}
	for f := range schemasWithoutAPage {
		if !have[f] {
			t.Errorf("schemasWithoutAPage names %s, which is not an embedded schema any more", f)
		}
	}
}

// Every string a schema defines reaches the page of its artifact, in both
// variants of every oneOf. A page may show it in a dedicated view or under the
// "stored but not shown" notice; what it may not do is drop it.
func TestEveryPageShowsEveryStringOfItsSchema(t *testing.T) {
	var files []string
	for f := range schemaPages {
		files = append(files, f)
	}
	sort.Strings(files)
	for _, file := range files {
		artifactType := schemaPages[file]
		t.Run(file, func(t *testing.T) {
			stillNeeded := map[string]bool{}
			for pick := 0; pick < 2; pick++ {
				payload, markers := sampleOfSchema(t, file, pick, 1)
				page := renderPageOfType(t, artifactType, payload)
				for _, m := range missingFromPage(page, markers, false) {
					if _, ok := markersNotShown[file][m]; ok {
						stillNeeded[m] = true
						continue
					}
					t.Errorf("pick %d: the page of %s drops %q; show it, or list it in markersNotShown with a reason", pick, artifactType, m)
				}
			}
			for m, reason := range markersNotShown[file] {
				if strings.TrimSpace(reason) == "" {
					t.Errorf("%s: markersNotShown entry %q has no reason", file, m)
				}
				if !stillNeeded[m] {
					t.Errorf("%s: markersNotShown entry %q is not needed: the page shows it, or the schema no longer defines it", file, m)
				}
			}
		})
	}
}

// pagesOnTheGenericRenderer are the artifact types that have no dedicated view.
// The generic renderer shows every stored value, so it needs no notice.
var pagesOnTheGenericRenderer = map[string]bool{
	"aim_trigger_config": true, "commercial_def": true, "mappings": true, "org_ops_def": true,
	"product_portfolio": true, "strategic_reality_check": true, "strategy_def": true,
	"track_health_assessment": true, "work_package": true,
}

// A key no schema defines is never dropped: on every page it is shown as stored,
// and a page with a dedicated view says so under the notice (#163).
func TestEveryPageShowsAnUnknownTopLevelKey(t *testing.T) {
	var files []string
	for f := range schemaPages {
		files = append(files, f)
	}
	sort.Strings(files)
	for _, file := range files {
		artifactType := schemaPages[file]
		t.Run(artifactType, func(t *testing.T) {
			payload, _ := sampleOfSchema(t, file, 0, 1)
			payload["zz_unknown_section"] = map[string]any{"headline": "unknown-marker-text"}
			page := renderPageOfType(t, artifactType, payload)
			if !strings.Contains(page, "unknown-marker-text") {
				t.Errorf("%s: an unknown top-level key is dropped", artifactType)
			}
			notice := strings.Contains(page, "no dedicated view")
			if !pagesOnTheGenericRenderer[artifactType] && !notice {
				t.Errorf("%s: a page with a dedicated view does not say it has no view for the key", artifactType)
			}
			if pagesOnTheGenericRenderer[artifactType] && notice {
				t.Errorf("%s: is listed as generic but shows the notice; remove it from pagesOnTheGenericRenderer", artifactType)
			}
		})
	}
}
