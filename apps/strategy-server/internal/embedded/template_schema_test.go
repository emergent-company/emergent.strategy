package embedded

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
	"gopkg.in/yaml.v3"
)

// templatePairs mirrors TEMPLATE_PAIRS in epf-canonical's scripts/validate-schemas.sh
// (from 2.37.0). An enforced template must match its schema: every key documented,
// every shape, required field and enum value right. A known-gap template still
// differs; canonical moves it to enforced when it is fixed, and so does this list.
var templatePairs = []struct {
	template, schema string
	enforced         bool
}{
	{"READY/01_insight_analyses.yaml", "insight_analyses_schema.json", true},
	{"READY/02_strategy_foundations.yaml", "strategy_foundations_schema.json", true},
	{"READY/04_strategy_formula.yaml", "strategy_formula_schema.json", true},
	{"READY/work_package.template.yaml", "work_package_schema.json", true},
	{"AIM/aim_trigger_config.yaml", "aim_trigger_config_schema.json", true},
	{"AIM/assessment_report.yaml", "assessment_report_schema.json", true},
	{"AIM/calibration_memo.yaml", "calibration_memo_schema.json", true},
	{"AIM/strategic_reality_check.yaml", "strategic_reality_check_schema.json", true},
	{"FIRE/value_models/product.value_model.yaml", "value_model_schema.json", true},
	{"READY/00_north_star.yaml", "north_star_schema.json", false},
	{"READY/03_insight_opportunity.yaml", "insight_opportunity_schema.json", false},
	{"READY/05_roadmap_recipe.yaml", "roadmap_recipe_schema.json", false},
	{"READY/product_portfolio.yaml", "product_portfolio_schema.json", false},
	{"AIM/living_reality_assessment.yaml", "living_reality_assessment_schema.json", false},
	{"AIM/track_health_signals.yaml", "track_health_assessment_schema.json", false},
	{"FIRE/navigation/navigation_graph.yaml", "navigation_graph_schema.json", false},
	{"FIRE/mappings.yaml", "mappings_schema.json", false},
	{"FIRE/value_models/strategy.value_model.yaml", "value_model_schema.json", false},
	{"FIRE/value_models/commercial.value_model.yaml", "value_model_schema.json", false},
	{"FIRE/value_models/org_ops.value_model.yaml", "value_model_schema.json", false},
}

// strictSchema returns the schema with additionalProperties:false added to every
// object that lists properties and does not say otherwise, so a key the schema does
// not document is an error. The schemas allow extra properties, so a plain
// validation would not notice.
func strictSchema(n any) any {
	switch t := n.(type) {
	case map[string]any:
		for k, v := range t {
			t[k] = strictSchema(v)
		}
		if _, has := t["properties"]; has {
			if _, set := t["additionalProperties"]; !set {
				t["additionalProperties"] = false
			}
		}
		return t
	case []any:
		for i, v := range t {
			t[i] = strictSchema(v)
		}
	}
	return n
}

// templateDifferences validates a template against its schema and returns what
// differs, leaving out size-only errors: sample values in a template are shape only.
func templateDifferences(t *testing.T, templatePath, schemaFile string) []string {
	t.Helper()
	rawSchema, err := GetSchema(schemaFile)
	if err != nil {
		t.Fatalf("schema %s: %v", schemaFile, err)
	}
	var schemaDoc any
	if err := json.Unmarshal(rawSchema, &schemaDoc); err != nil {
		t.Fatalf("schema %s: %v", schemaFile, err)
	}
	strict, err := json.Marshal(strictSchema(schemaDoc))
	if err != nil {
		t.Fatal(err)
	}

	rawTemplate, err := GetTemplate(templatePath)
	if err != nil {
		t.Fatalf("template %s: %v", templatePath, err)
	}
	var tmpl any
	if err := yaml.Unmarshal(rawTemplate, &tmpl); err != nil {
		t.Fatalf("template %s: %v", templatePath, err)
	}
	instanceJSON, err := json.Marshal(tmpl)
	if err != nil {
		t.Fatalf("template %s: %v", templatePath, err)
	}

	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(strict))
	if err != nil {
		t.Fatal(err)
	}
	c := jsonschema.NewCompiler()
	url := "mem:///" + schemaFile
	if err := c.AddResource(url, doc); err != nil {
		t.Fatal(err)
	}
	sch, err := c.Compile(url)
	if err != nil {
		t.Fatalf("schema %s: %v", schemaFile, err)
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(instanceJSON))
	if err != nil {
		t.Fatal(err)
	}

	verr := sch.Validate(instance)
	if verr == nil {
		return nil
	}
	var ve *jsonschema.ValidationError
	if !errors.As(verr, &ve) {
		t.Fatalf("validate %s: %v", templatePath, verr)
	}
	printer := message.NewPrinter(language.English)
	var diffs []string
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) > 0 {
			for _, c := range e.Causes {
				walk(c)
			}
			return
		}
		kw := e.ErrorKind.KeywordPath()
		if len(kw) > 0 {
			switch kw[len(kw)-1] {
			case "minLength", "maxLength", "minItems", "maxItems", "format":
				// Sample values are shape only, and canonical's gate does not assert formats.
				return
			}
		}
		diffs = append(diffs, fmt.Sprintf("/%s: %v", strings.Join(e.InstanceLocation, "/"), e.ErrorKind.LocalizedString(printer)))
	}
	walk(ve)
	sort.Strings(diffs)
	return diffs
}

// An embedded READY, AIM or FIRE template that canonical enforces must match its
// embedded schema, so that a fresh instance copied from it is valid and every field
// of it is documented. A pair canonical still lists as a known gap is counted; when
// it reaches zero, move it to enforced.
func TestEmbeddedTemplatesMatchTheirSchemas(t *testing.T) {
	for _, p := range templatePairs {
		t.Run(p.template, func(t *testing.T) {
			diffs := templateDifferences(t, p.template, p.schema)
			switch {
			case p.enforced && len(diffs) > 0:
				t.Errorf("%s does not match %s (%d differences):\n  %s", p.template, p.schema, len(diffs), strings.Join(firstN(diffs, 15), "\n  "))
			case !p.enforced && len(diffs) == 0:
				t.Errorf("%s now matches %s: mark it enforced in templatePairs", p.template, p.schema)
			case !p.enforced:
				t.Logf("known gap: %s differs from %s in %d places", p.template, p.schema, len(diffs))
			}
		})
	}
}

// Every template and schema named above exists, and every READY/AIM template the
// canonical gate lists is on the list here, so a template added to canonical is not
// silently left out.
func TestTemplatePairsNameEmbeddedFiles(t *testing.T) {
	for _, p := range templatePairs {
		if _, err := GetTemplate(p.template); err != nil {
			t.Errorf("template %s: %v", p.template, err)
		}
		if _, err := GetSchema(p.schema); err != nil {
			t.Errorf("schema %s: %v", p.schema, err)
		}
	}
}

func firstN(s []string, n int) []string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
