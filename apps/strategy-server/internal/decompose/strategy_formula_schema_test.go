package decompose

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// conformantFormula is a strategy formula written to the canonical schema
// (embedded strategy_formula_schema.json): constraints are constraint / impact /
// response, trade-offs are decision / over / rationale, the pricing text is
// pricing_strategy, and the success metrics are leading and lagging indicators.
// Several arrays also hold a plain string, which the schema allows.
const conformantFormula = `strategy:
  id: acme-strategy
  constraints:
    - constraint: "Funding is not assumed"
      impact: "The base case is paid for from operating cash."
      response: "Plan inside the cash the business generates."
    - "Plain string constraint"
  trade_offs:
    - decision: "Focus on traders first"
      over: "Serving every segment at once"
      rationale: "Depth beats breadth in year one."
  business_model:
    revenue_model: "Subscription"
    pricing_strategy: "Price on value delivered, not on seats."
    pricing_tiers:
      - tier: "Core"
        target: "Single-site traders"
        price: "EUR 500 per month"
        features: ["Offline capture", "Plot mapping"]
    growth_engines:
      - engine: "Accounts we hold"
        mechanism: "Expand inside an account"
        timeline: "2027"
      - "Referral loop"
  value_creation:
    key_capabilities:
      - capability: "Offline capture"
        description: "Works without a network"
        status: "strong"
      - "Plain capability"
    value_drivers:
      - driver: "Traceability"
        mechanism: "Every purchase is recorded"
      - "Plain driver"
  success_metrics:
    leading_indicators:
      - metric: "Weekly active sites"
        target: "300"
        rationale: "Shows adoption"
    lagging_indicators:
      - metric: "Net revenue retention"
        target: "100%"
        rationale: "Shows lasting value"
`

func decomposeFormula(t *testing.T, yamlText string) *Result {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "READY"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "READY", "04_strategy_formula.yaml"), []byte(yamlText), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := New(dir).DecomposeInstance()
	if err != nil {
		t.Fatalf("decompose: %v", err)
	}
	return res
}

func byKey(res *Result, key string) *GraphObject {
	for i := range res.Objects {
		if res.Objects[i].Key == key {
			return &res.Objects[i]
		}
	}
	return nil
}

func prop(o *GraphObject, name string) string {
	if o == nil {
		return "<missing object>"
	}
	s, _ := o.Properties[name].(string)
	return s
}

func wantContains(t *testing.T, what, got string, parts ...string) {
	t.Helper()
	for _, p := range parts {
		if !strings.Contains(got, p) {
			t.Errorf("%s = %q, missing %q", what, got, p)
		}
	}
}

// A constraint written to the schema has impact and response. They were read as
// implication and strategy, so the projected constraint kept its name and lost
// the two fields that say what it means.
func TestStrategyFormula_ConstraintKeepsTheSchemasImpactAndResponse(t *testing.T) {
	res := decomposeFormula(t, conformantFormula)
	c := byKey(res, "Constraint:strategy_formula:constraints[0]")
	wantContains(t, "constraint description", prop(c, "description"),
		"Funding is not assumed", "paid for from operating cash", "Plan inside the cash")
}

// The schema allows a constraint to be a plain string. Such an entry is a
// constraint, and it must not take the rest of the file down with it.
func TestStrategyFormula_AStringConstraintIsAConstraintAndDropsNothing(t *testing.T) {
	res := decomposeFormula(t, conformantFormula)
	c := byKey(res, "Constraint:strategy_formula:constraints[1]")
	if c == nil {
		t.Fatal("the plain string constraint has no object")
	}
	if got := prop(c, "description"); got != "Plain string constraint" {
		t.Errorf("description = %q", got)
	}
	if byKey(res, "Constraint:strategy_formula:constraints[0]") == nil || byKey(res, "ValueDriver:strategy_formula:value_creation.value_drivers[0]") == nil {
		t.Error("objects of the same file are missing")
	}
}

func TestStrategyFormula_TradeOffKeepsWhatItWasChosenOver(t *testing.T) {
	res := decomposeFormula(t, conformantFormula)
	k := byKey(res, "KeyInsight:strategy_formula:trade_offs[0]")
	wantContains(t, "trade-off insight", prop(k, "insight"), "Focus on traders first", "Serving every segment at once")
	wantContains(t, "trade-off implication", prop(k, "strategic_implication"), "Depth beats breadth")
}

func TestStrategyFormula_BusinessModelKeepsThePricingStrategyAndTiers(t *testing.T) {
	res := decomposeFormula(t, conformantFormula)
	b := byKey(res, "Positioning:strategy_formula:business_model")
	wantContains(t, "business model claim", prop(b, "claim"), "Price on value delivered")
	wantContains(t, "pricing tiers", prop(b, "pricing_tiers"), "Core", "EUR 500 per month", "Single-site traders")
}

func TestStrategyFormula_SuccessMetricsComeFromLeadingAndLaggingIndicators(t *testing.T) {
	res := decomposeFormula(t, conformantFormula)
	k := byKey(res, "KeyInsight:strategy_formula:success_metrics.north_star")
	wantContains(t, "success metrics", prop(k, "insight"),
		"Weekly active sites", "300", "Net revenue retention", "100%")
}

// Instances written to the older field names keep their projection.
func TestStrategyFormula_LegacyFieldNamesStillWork(t *testing.T) {
	res := decomposeFormula(t, `strategy:
  constraints:
    - constraint: "Small team"
      implication: "Must focus"
      strategy: "Win on depth"
  trade_offs:
    - decision: "Depth"
      what_we_gain: "Quality"
      what_we_give_up: "Breadth"
      rationale: "Niche first"
  business_model:
    revenue_model: "Subscription"
    pricing_philosophy: "Value based"
  success_metrics:
    north_star_metric: "Active sites"
    supporting_metrics:
      - metric: "Retention"
        target_phase_1: "90%"
        why: "Stickiness"
`)
	wantContains(t, "legacy constraint", prop(byKey(res, "Constraint:strategy_formula:constraints[0]"), "description"), "Must focus", "Win on depth")
	wantContains(t, "legacy trade-off", prop(byKey(res, "KeyInsight:strategy_formula:trade_offs[0]"), "insight"), "Quality", "Breadth")
	wantContains(t, "legacy claim", prop(byKey(res, "Positioning:strategy_formula:business_model"), "claim"), "Value based")
	wantContains(t, "legacy metrics", prop(byKey(res, "KeyInsight:strategy_formula:success_metrics.north_star"), "insight"), "Active sites", "Retention", "90%")
}

// A field of the wrong shape makes the decode fail, and every caller then
// produces no objects for the file. That used to happen without a word. It is
// logged now. It stays an error, not a partial read, because yaml.v3 removes the
// element it cannot decode, so the ones after it would shift down and carry a
// section_path that points at the wrong stored element.
func TestDecompose_AFileOfTheWrongShapeIsLoggedAndNeverMisnumbersItsObjects(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	res := decomposeFormula(t, `strategy:
  risks:
    - "a bare string where a mapping is expected"
    - risk: "Key customer leaves"
      impact: "Revenue falls"
`)
	if !strings.Contains(logs.String(), "04_strategy_formula.yaml") {
		t.Errorf("nothing was logged about the file:\n%s", logs.String())
	}
	for _, o := range res.Objects {
		if o.Type == "StrategicRisk" && prop(&o, "risk") == "Key customer leaves" && prop(&o, "section_path") != "strategy.risks[1]" {
			t.Errorf("the risk is at stored index 1 but carries %q", prop(&o, "section_path"))
		}
	}
}

// The schema allows a competitive advantage to be a plain string.
func TestStrategyFormula_AStringAdvantageDropsNothing(t *testing.T) {
	res := decomposeFormula(t, `strategy:
  competitive_moat:
    advantages:
      - "Offline-first capture"
      - name: "Traceability"
        description: "Every purchase is recorded"
`)
	a0 := byKey(res, "Positioning:strategy_formula:advantages[0]")
	a1 := byKey(res, "Positioning:strategy_formula:advantages[1]")
	if a0 == nil || a1 == nil {
		t.Fatalf("advantages missing: %v %v", a0, a1)
	}
	if got := prop(a0, "name"); got != "Offline-first capture" {
		t.Errorf("plain advantage name = %q", got)
	}
	if got := prop(a1, "section_path"); got != "strategy.competitive_moat.advantages[1]" {
		t.Errorf("second advantage section_path = %q", got)
	}
}

// The decoder may only read fields the canonical schema defines, except the
// legacy names kept as fallbacks. A field read under a name the schema does not
// know is always empty on a schema-conformant instance, which is how a
// constraint lost its impact and response.
func TestStrategyFormulaStruct_ReadsOnlySchemaFieldsOrKnownLegacyAliases(t *testing.T) {
	raw, err := embedded.GetSchema("strategy_formula_schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var schema map[string]any
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	legacy := map[string]bool{
		".strategy.constraints[].implication":                                 true,
		".strategy.constraints[].strategy":                                    true,
		".strategy.trade_offs[].what_we_gain":                                 true,
		".strategy.trade_offs[].what_we_give_up":                              true,
		".strategy.business_model.pricing_philosophy":                         true,
		".strategy.business_model.pricing_tiers[].limits":                     true,
		".strategy.business_model.pricing_tiers[].purpose":                    true,
		".strategy.business_model.growth_engines[].investment":                true,
		".strategy.value_creation.key_capabilities[].why_critical":            true,
		".strategy.value_creation.key_capabilities[].current_state":           true,
		".strategy.value_creation.value_drivers[].flywheel":                   true,
		".strategy.ecosystem_differentiation.ecosystem_components[].metaphor": true,
		".strategy.success_metrics.north_star_metric":                         true,
		".strategy.success_metrics.supporting_metrics":                        true,
		".strategy.success_metrics.supporting_metrics[].metric":               true,
		".strategy.success_metrics.supporting_metrics[].target_phase_1":       true,
		".strategy.success_metrics.supporting_metrics[].why":                  true,
	}
	var unknown []string
	var walk func(rt reflect.Type, prefix string, schemas []map[string]any)
	walk = func(rt reflect.Type, prefix string, schemas []map[string]any) {
		for rt.Kind() == reflect.Slice || rt.Kind() == reflect.Pointer {
			rt = rt.Elem()
		}
		if rt.Kind() != reflect.Struct {
			return
		}
		for i := 0; i < rt.NumField(); i++ {
			tag := strings.Split(rt.Field(i).Tag.Get("yaml"), ",")[0]
			if tag == "" || tag == "-" {
				continue
			}
			path := prefix + "." + tag
			ft := rt.Field(i).Type
			isList := ft.Kind() == reflect.Slice
			if isList {
				path += "[]"
			}
			next := childSchemas(schema, schemas, tag, isList)
			if next == nil {
				if !legacy[path] && !legacy[strings.TrimSuffix(path, "[]")] {
					unknown = append(unknown, path)
				}
				continue
			}
			walk(ft, path, next)
		}
	}
	walk(reflect.TypeOf(rawStrategyFormulaExpanded{}), "", []map[string]any{schema})
	if len(unknown) > 0 {
		t.Errorf("the decoder reads fields the canonical schema does not define (and that are not known legacy aliases):\n  %s", strings.Join(unknown, "\n  "))
	}
}

// childSchemas returns the schemas of a property, looking through oneOf/anyOf
// and, for a list, into items. nil means the property is not defined.
func childSchemas(root map[string]any, parents []map[string]any, name string, list bool) []map[string]any {
	var out []map[string]any
	var expand func(s map[string]any)
	expand = func(s map[string]any) {
		if ref, ok := s["$ref"].(string); ok && strings.HasPrefix(ref, "#/") {
			t := any(root)
			for _, part := range strings.Split(ref[2:], "/") {
				m, _ := t.(map[string]any)
				t = m[part]
			}
			if m, ok := t.(map[string]any); ok {
				expand(m)
			}
			return
		}
		out = append(out, s)
		for _, k := range []string{"oneOf", "anyOf", "allOf"} {
			if arr, ok := s[k].([]any); ok {
				for _, e := range arr {
					if m, ok := e.(map[string]any); ok {
						expand(m)
					}
				}
			}
		}
	}
	for _, p := range parents {
		props, _ := p["properties"].(map[string]any)
		if sub, ok := props[name].(map[string]any); ok {
			expand(sub)
		}
	}
	if len(out) == 0 {
		return nil
	}
	if !list {
		return out
	}
	var items []map[string]any
	var item func(s map[string]any)
	item = func(s map[string]any) {
		if it, ok := s["items"].(map[string]any); ok {
			sub := childSchemasOfItem(root, it)
			items = append(items, sub...)
		}
	}
	for _, s := range out {
		item(s)
	}
	if len(items) == 0 {
		return out
	}
	return items
}

func childSchemasOfItem(root map[string]any, it map[string]any) []map[string]any {
	var out []map[string]any
	var expand func(s map[string]any)
	expand = func(s map[string]any) {
		if ref, ok := s["$ref"].(string); ok && strings.HasPrefix(ref, "#/") {
			t := any(root)
			for _, part := range strings.Split(ref[2:], "/") {
				m, _ := t.(map[string]any)
				t = m[part]
			}
			if m, ok := t.(map[string]any); ok {
				expand(m)
			}
			return
		}
		out = append(out, s)
		for _, k := range []string{"oneOf", "anyOf", "allOf"} {
			if arr, ok := s[k].([]any); ok {
				for _, e := range arr {
					if m, ok := e.(map[string]any); ok {
						expand(m)
					}
				}
			}
		}
	}
	expand(it)
	return out
}
