package validation

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/context"
)

// TestVeilagRealWorldBug demonstrates the actual bug that happened:
// AI agent filled Veilag EPF with generic product planning framework content
// instead of Norwegian road cost allocation platform content
func TestVeilagRealWorldBug(t *testing.T) {
	// This is the ACTUAL corrupted content from /Users/nikolaifasting/code/veilag
	// The mission statement talks about "product organizations" and "planning frameworks"
	// but Veilag is a Norwegian private road cost allocation platform!

	// Context will be inferred from directory name "veilag" since _meta.yaml has placeholder
	ctx := &context.InstanceContext{
		ProductName: "Veilag", // From directory name
		Description: "",       // Empty in _meta.yaml
		Found:       true,
	}

	// ACTUAL content from the corrupted file
	corruptedMission := `We create structured planning frameworks and tooling that help product organizations make evidence-based strategic decisions through explicit assumptions, trackable dependencies, and continuous validation.`

	warning := CheckContentAlignment(ctx, "mission.mission_statement", corruptedMission)

	// This SHOULD trigger a warning
	if warning == nil {
		t.Fatal("CRITICAL: Failed to detect Veilag content corruption! Expected alignment warning, got nil")
	}

	t.Logf("✓ Successfully detected Veilag content corruption")
	t.Logf("  Field: %s", warning.Field)
	t.Logf("  Issue: %s", warning.Issue)
	t.Logf("  Confidence: %s", warning.Confidence)
	t.Logf("  Mismatched keywords: %v", warning.Keywords)

	// Should have medium-high confidence
	if warning.Confidence == "low" {
		t.Errorf("Expected medium/high confidence for obvious mismatch, got low")
	}

	// Should identify suspicious keywords
	if len(warning.Keywords) == 0 {
		t.Error("Expected suspicious keywords to be identified")
	}

	// Additional check: verify it catches "planning", "framework", "product" keywords
	hasRelevantKeyword := false
	for _, kw := range warning.Keywords {
		if kw == "planning" || kw == "framework" || kw == "product" {
			hasRelevantKeyword = true
			t.Logf("  ✓ Caught suspicious keyword: %s", kw)
		}
	}

	if !hasRelevantKeyword {
		t.Error("Expected to catch keywords like 'planning', 'framework', 'product'")
	}
}

// TestVeilagCorrectContent shows what CORRECT content would look like
func TestVeilagCorrectContent(t *testing.T) {
	ctx := &context.InstanceContext{
		ProductName: "Veilag",
		Description: "Norwegian private road cost allocation platform",
		Found:       true,
	}

	// This is what the mission SHOULD be about
	correctMission := `We simplify private road cost allocation for Norwegian road associations by providing transparent billing, maintenance tracking, and fair cost distribution among property owners.`

	warning := CheckContentAlignment(ctx, "mission.mission_statement", correctMission)

	if warning != nil {
		t.Errorf("Should NOT warn on correct content about roads/billing/property. Got: %+v", warning)
	} else {
		t.Logf("✓ Correctly accepts content about road cost allocation")
	}
}
