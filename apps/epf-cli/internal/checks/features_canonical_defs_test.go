package checks

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/embedded"
)

// The feature quality check judges product features. A canonical strategy,
// org_ops or commercial definition has another shape (purpose, outcome,
// practitioner scenarios) and must not be reported as a failed feature.
func TestFeatureQualityPassesEveryCanonicalTrackDefinition(t *testing.T) {
	infos, err := embedded.ListCanonicalDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	if len(infos) < 100 {
		t.Fatalf("only %d canonical definitions are embedded; expected the full set (run make sync-embedded)", len(infos))
	}

	dir := t.TempDir()
	for _, info := range infos {
		data, err := embedded.GetCanonicalDefinition(info.Filename)
		if err != nil {
			t.Fatal(err)
		}
		p := filepath.Join(dir, "FIRE", "definitions", info.Track, info.Category, info.Filename)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, data, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	summary, err := NewFeatureQualityChecker(dir).Check()
	if err != nil {
		t.Fatal(err)
	}
	var failed []string
	for _, r := range summary.Results {
		if r.Passed {
			continue
		}
		var why []string
		for _, is := range r.Issues {
			if is.Severity == SeverityCritical || is.Severity == SeverityError {
				why = append(why, fmt.Sprintf("%s: %s", is.Field, is.Message))
			}
		}
		failed = append(failed, fmt.Sprintf("%s -> %s", r.FeatureID, strings.Join(why, "; ")))
	}
	sort.Strings(failed)
	t.Logf("checked %d, passed %d, failed %d", summary.TotalFeatures, summary.PassedCount, summary.FailedCount)
	if len(failed) > 0 {
		t.Errorf("%d of %d canonical track definitions are reported as failed features:\n%s", len(failed), summary.TotalFeatures, strings.Join(failed, "\n"))
	}
}

// A product feature without personas is still a failed feature, even when its
// definition carries a purpose or an outcome: only the strategy, org_ops and
// commercial definitions are judged by the track definition shape.
func TestFeatureQualityStillRequiresPersonasForProductFeatures(t *testing.T) {
	dir := t.TempDir()
	fdDir := filepath.Join(dir, "FIRE", "definitions", "product")
	if err := os.MkdirAll(fdDir, 0o755); err != nil {
		t.Fatal(err)
	}
	feature := `id: fd-050
name: Quote Calculator
slug: quote-calculator
status: draft
definition:
  purpose: "Let a buyer price a job without calling anyone."
  outcome: "Buyers get a price in under five minutes."
`
	if err := os.WriteFile(filepath.Join(fdDir, "fd-050-quote-calculator.yaml"), []byte(feature), 0o644); err != nil {
		t.Fatal(err)
	}

	summary, err := NewFeatureQualityChecker(dir).Check()
	if err != nil {
		t.Fatal(err)
	}
	if summary.TotalFeatures != 1 || summary.PassedCount != 0 {
		t.Fatalf("total=%d passed=%d, want the feature counted and failed", summary.TotalFeatures, summary.PassedCount)
	}
	found := false
	for _, is := range summary.Results[0].Issues {
		if is.Field == "definition.personas" && is.Severity == SeverityCritical {
			found = true
		}
	}
	if !found {
		t.Errorf("a product feature with no personas must still get the critical personas issue, got %v", summary.Results[0].Issues)
	}
}

// Passing the track definition shape is not passing by default: a definition
// with no real purpose or outcome still fails.
func TestFeatureQualityFailsATrackDefinitionWithoutPurposeAndOutcome(t *testing.T) {
	dir := t.TempDir()
	pdDir := filepath.Join(dir, "FIRE", "definitions", "org_ops", "financial-legal")
	if err := os.MkdirAll(pdDir, 0o755); err != nil {
		t.Fatal(err)
	}
	pd := `id: pd-900
name: Empty Definition
slug: empty-definition
track: org_ops
status: draft
definition:
  purpose: "TBD"
  outcome: ""
practitioner_scenarios:
  - id: ps-001
    scenario: Something
`
	if err := os.WriteFile(filepath.Join(pdDir, "pd-900-empty-definition.yaml"), []byte(pd), 0o644); err != nil {
		t.Fatal(err)
	}
	summary, err := NewFeatureQualityChecker(dir).Check()
	if err != nil {
		t.Fatal(err)
	}
	if summary.TotalFeatures != 1 || summary.PassedCount != 0 {
		t.Fatalf("total=%d passed=%d, want the definition counted and failed", summary.TotalFeatures, summary.PassedCount)
	}
	fields := map[string]bool{}
	for _, is := range summary.Results[0].Issues {
		fields[is.Field] = true
	}
	if !fields["definition.purpose"] || !fields["definition.outcome"] {
		t.Errorf("want issues on definition.purpose and definition.outcome, got %v", summary.Results[0].Issues)
	}
}

// An instance's own track definitions need not use the canonical id prefixes;
// their track field says which kind they are.
func TestFeatureQualityKnowsATrackDefinitionByItsTrackField(t *testing.T) {
	dir := t.TempDir()
	cdDir := filepath.Join(dir, "FIRE", "definitions", "commercial")
	if err := os.MkdirAll(cdDir, 0o755); err != nil {
		t.Fatal(err)
	}
	def := `id: partner-onboarding
name: Partner Onboarding
slug: partner-onboarding
track: commercial
status: ready
definition:
  purpose: "Bring a new channel partner to its first closed deal."
  outcome: "A partner that can sell without help from us within a quarter."
`
	if err := os.WriteFile(filepath.Join(cdDir, "partner-onboarding.yaml"), []byte(def), 0o644); err != nil {
		t.Fatal(err)
	}
	summary, err := NewFeatureQualityChecker(dir).Check()
	if err != nil {
		t.Fatal(err)
	}
	if summary.TotalFeatures != 1 || summary.PassedCount != 1 {
		t.Errorf("total=%d passed=%d issues=%v, want the definition counted and passing", summary.TotalFeatures, summary.PassedCount, summary.Results[0].Issues)
	}
}

// A definition whose id has a track prefix is a track definition even when an
// older file lacks the track field.
func TestFeatureQualityKnowsATrackDefinitionByItsIDPrefix(t *testing.T) {
	dir := t.TempDir()
	sdDir := filepath.Join(dir, "FIRE", "definitions", "strategy")
	if err := os.MkdirAll(sdDir, 0o755); err != nil {
		t.Fatal(err)
	}
	def := `id: sd-901
name: Market Sensing
status: ready
definition:
  purpose: "Keep a current picture of the market the strategy depends on."
  outcome: "Leadership sees shifts early enough to act on them."
`
	if err := os.WriteFile(filepath.Join(sdDir, "sd-901-market-sensing.yaml"), []byte(def), 0o644); err != nil {
		t.Fatal(err)
	}
	summary, err := NewFeatureQualityChecker(dir).Check()
	if err != nil {
		t.Fatal(err)
	}
	if summary.TotalFeatures != 1 || summary.PassedCount != 1 {
		t.Errorf("total=%d passed=%d issues=%v, want the definition counted and passing", summary.TotalFeatures, summary.PassedCount, summary.Results[0].Issues)
	}
}
