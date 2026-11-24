package strategy

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
)

// An instance started from the embedded READY templates, as `epf init` does, is
// read by the parser. Before canonical 2.37.0 the insight analyses template held
// strings where the schema has objects, and the typed readers refused it.
func TestParserReadsTheEmbeddedReadyTemplates(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "READY"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"01_insight_analyses.yaml", "04_strategy_formula.yaml"} {
		raw, err := embedded.GetTemplate("READY/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "READY", name), raw, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	p := newTestParser(t, dir)

	ia, err := p.ParseInsightAnalyses()
	if err != nil {
		t.Fatalf("insight analyses template: %v", err)
	}
	if len(ia.KeyInsights) == 0 || len(ia.TargetUsers) == 0 {
		t.Errorf("the insight analyses template was read as empty: %d key insights, %d target users", len(ia.KeyInsights), len(ia.TargetUsers))
	}
	if _, err := p.ParseStrategyFormula(); err != nil {
		t.Fatalf("strategy formula template: %v", err)
	}
}

// A competitive advantage may be a plain string or an object, as the schema allows.
func TestParseStrategyFormulaReadsBothAdvantageForms(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "READY"), 0o755); err != nil {
		t.Fatal(err)
	}
	doc := `strategy:
  id: sf-001
  title: T
  competitive_moat:
    advantages:
      - "a plain advantage"
      - name: "an object advantage"
        description: "its description"
        defensibility: "its defensibility"
`
	if err := os.WriteFile(filepath.Join(dir, "READY", "04_strategy_formula.yaml"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	sf, err := newTestParser(t, dir).ParseStrategyFormula()
	if err != nil {
		t.Fatal(err)
	}
	adv := sf.CompetitiveMoat.Advantages
	if len(adv) != 2 || adv[0].Name != "a plain advantage" || adv[1].Name != "an object advantage" ||
		adv[1].Description != "its description" || adv[1].Defensibility != "its defensibility" {
		t.Errorf("advantages read as %+v", adv)
	}
}
