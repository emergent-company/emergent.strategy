package handler

import (
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// templatePages says which page an embedded canonical template is shown by. A
// fresh instance starts from a template, so a field the template writes that the
// page drops is dropped on every new instance. Templates for schemas that have no
// artifact page (the navigation graph) are left out.
var templatePages = map[string]string{
	"READY/00_north_star.yaml":                      "north_star",
	"READY/01_insight_analyses.yaml":                "insight_analyses",
	"READY/02_strategy_foundations.yaml":            "strategy_foundations",
	"READY/03_insight_opportunity.yaml":             "insight_opportunity",
	"READY/04_strategy_formula.yaml":                "strategy_formula",
	"READY/05_roadmap_recipe.yaml":                  "roadmap_recipe",
	"READY/product_portfolio.yaml":                  "product_portfolio",
	"READY/work_package.template.yaml":              "work_package",
	"AIM/aim_trigger_config.yaml":                   "aim_trigger_config",
	"AIM/assessment_report.yaml":                    "assessment_report",
	"AIM/calibration_memo.yaml":                     "calibration_memo",
	"AIM/living_reality_assessment.yaml":            "living_reality_assessment",
	"AIM/strategic_reality_check.yaml":              "strategic_reality_check",
	"AIM/track_health_signals.yaml":                 "track_health_assessment",
	"FIRE/mappings.yaml":                            "mappings",
	"FIRE/value_models/product.value_model.yaml":    "value_model",
	"FIRE/value_models/strategy.value_model.yaml":   "value_model",
	"FIRE/value_models/commercial.value_model.yaml": "value_model",
	"FIRE/value_models/org_ops.value_model.yaml":    "value_model",
}

// templateStringsNotShown names strings of a template that its page does not show.
// Each needs a reason; an entry that is no longer needed fails the test.
var templateStringsNotShown = map[string]map[string]string{}

// Every string a canonical template writes reaches the page of its artifact.
func TestEveryTemplateReachesItsPage(t *testing.T) {
	var paths []string
	for p := range templatePages {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			raw, err := embedded.GetTemplate(path)
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]any
			if err := yaml.Unmarshal(raw, &payload); err != nil {
				t.Fatal(err)
			}
			want := leafStrings(payload)
			if len(want) == 0 {
				t.Fatalf("%s holds no strings; the test would prove nothing", path)
			}
			// A status such as "pending_assessment" is shown as a label, so case and
			// underscores are not compared.
			page := labelForm(renderPageOfType(t, templatePages[path], payload))
			stillNeeded := map[string]bool{}
			for _, m := range missingFromPage(page, labelForms(want), false) {
				if _, ok := templateStringsNotShown[path][m]; ok {
					stillNeeded[m] = true
					continue
				}
				t.Errorf("the page of %s drops %q", templatePages[path], m)
			}
			for m, reason := range templateStringsNotShown[path] {
				if strings.TrimSpace(reason) == "" {
					t.Errorf("entry %q has no reason", m)
				}
				if !stillNeeded[m] {
					t.Errorf("entry %q is not needed: the page shows it", m)
				}
			}
		})
	}
}

// Every embedded template with an artifact page is listed in templatePages.
func TestEveryTemplateWithAPageIsListed(t *testing.T) {
	all, err := embedded.ListTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range all {
		if !strings.HasSuffix(p, ".yaml") || strings.HasPrefix(p, "FIRE/definitions/") {
			continue
		}
		if _, ok := templatePages[p]; ok {
			continue
		}
		t.Logf("template not in templatePages: %s", p)
	}
}

// labelForm lower-cases text and turns underscores into spaces, so a stored
// status and the label a page shows for it compare equal.
func labelForm(s string) string {
	return strings.ReplaceAll(strings.ToLower(s), "_", " ")
}

func labelForms(in []string) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = labelForm(s)
	}
	return out
}
