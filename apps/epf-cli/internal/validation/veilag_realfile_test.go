package validation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/context"
	"gopkg.in/yaml.v3"
)

// TestVeilagRealFile tests validation context using the actual corrected
// Veilag north_star.yaml file from the veilag repository
func TestVeilagRealFile(t *testing.T) {
	// Path to actual Veilag file
	veilagPath := "/Users/nikolaifasting/code/veilag/docs/EPF/_instances/veilag"
	northStarPath := filepath.Join(veilagPath, "READY", "00_north_star.yaml")

	// Check if file exists (test might run in CI without veilag repo)
	if _, err := os.Stat(northStarPath); os.IsNotExist(err) {
		t.Skip("Veilag repository not found, skipping real file test")
	}

	// Load instance context
	ctx := context.LoadInstanceContext(veilagPath)

	// Verify context loaded correctly
	if ctx.ProductName != "Veilag" {
		t.Errorf("Expected product name 'Veilag', got '%s'", ctx.ProductName)
	}

	expectedKeywords := []string{"norwegian", "road", "cost", "allocation", "volunteer"}
	keywords := ctx.GetKeywords()
	for _, expected := range expectedKeywords {
		found := false
		for _, kw := range keywords {
			if kw == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected keyword '%s' in context, got: %v", expected, keywords)
		}
	}

	// Read north_star file
	data, err := os.ReadFile(northStarPath)
	if err != nil {
		t.Fatalf("Failed to read north_star file: %v", err)
	}

	// Parse YAML
	var doc struct {
		NorthStar struct {
			Purpose struct {
				Statement      string `yaml:"statement"`
				ProblemWeSolve string `yaml:"problem_we_solve"`
			} `yaml:"purpose"`
			Vision struct {
				VisionStatement string `yaml:"vision_statement"`
			} `yaml:"vision"`
			Mission struct {
				MissionStatement string `yaml:"mission_statement"`
			} `yaml:"mission"`
			Values []struct {
				Value      string `yaml:"value"`
				Definition string `yaml:"definition"`
			} `yaml:"values"`
		} `yaml:"north_star"`
	}

	if err := yaml.Unmarshal(data, &doc); err != nil {
		t.Fatalf("Failed to parse YAML: %v", err)
	}

	// Test semantic alignment for corrected content
	t.Run("Purpose statement should pass validation", func(t *testing.T) {
		result := CheckContentAlignment(ctx, "purpose.statement", doc.NorthStar.Purpose.Statement)
		if result != nil {
			t.Errorf("Purpose statement should not have alignment issues: %s (confidence: %s)",
				result.Issue, result.Confidence)
			t.Logf("  Mismatched keywords: %v", result.Keywords)
		}
	})

	t.Run("Mission statement should pass validation", func(t *testing.T) {
		result := CheckContentAlignment(ctx, "mission.mission_statement", doc.NorthStar.Mission.MissionStatement)
		if result != nil {
			t.Errorf("Mission statement should not have alignment issues: %s (confidence: %s)",
				result.Issue, result.Confidence)
			t.Logf("  Mismatched keywords: %v", result.Keywords)
		}
	})

	t.Run("Vision should pass validation", func(t *testing.T) {
		result := CheckContentAlignment(ctx, "vision.vision_statement", doc.NorthStar.Vision.VisionStatement)
		if result != nil {
			t.Errorf("Vision should not have alignment issues: %s (confidence: %s)",
				result.Issue, result.Confidence)
			t.Logf("  Mismatched keywords: %v", result.Keywords)
		}
	})

	// Check that correct Veilag keywords are present
	t.Run("Content should contain Veilag-specific terms", func(t *testing.T) {
		fullContent := doc.NorthStar.Purpose.Statement + " " +
			doc.NorthStar.Vision.VisionStatement + " " +
			doc.NorthStar.Mission.MissionStatement

		veilagTerms := []string{
			"road",
			"norwegian",
			"association",
			"cost",
			"allocation",
		}

		for _, term := range veilagTerms {
			if !contains(fullContent, term) {
				t.Errorf("Expected Veilag content to contain '%s'", term)
			}
		}
	})

	// Check that wrong content (planning frameworks) is NOT present
	t.Run("Content should NOT contain planning framework terms", func(t *testing.T) {
		fullContent := doc.NorthStar.Purpose.Statement + " " +
			doc.NorthStar.Mission.MissionStatement

		wrongTerms := []string{
			"planning framework",
			"product organization",
			"strategic proposal",
			"EPF artifacts",
		}

		for _, term := range wrongTerms {
			if contains(fullContent, term) {
				t.Errorf("Veilag content should NOT contain '%s' (generic planning framework language)", term)
			}
		}
	})
}

func contains(text, substr string) bool {
	return strings.Contains(strings.ToLower(text), strings.ToLower(substr))
}
