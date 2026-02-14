package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/lra"
	"github.com/spf13/cobra"
)

var aimStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current Living Reality Assessment summary",
	Long: `Display a comprehensive summary of your current Living Reality Assessment (LRA).

The LRA is the foundational baseline for your EPF instance. It captures:
- Organizational context (team size, funding stage)
- Track maturity baselines (Product, Strategy, OrgOps, Commercial)
- Current focus and objectives
- Existing assets and constraints
- Evolution history

Use this command to quickly understand your current reality baseline.`,
	RunE: runAimStatus,
}

var (
	statusJSON bool
)

func init() {
	aimStatusCmd.Flags().BoolVar(&statusJSON, "json", false, "Output as JSON")
}

func runAimStatus(cmd *cobra.Command, args []string) error {
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		return fmt.Errorf("failed to get instance path: %w", err)
	}

	// Load LRA
	lraPath := lra.GetLRAPath(instancePath)
	if !lra.LRAExists(instancePath) {
		return fmt.Errorf("Living Reality Assessment not found at: %s\n\nRun 'epf-cli aim bootstrap' to create your baseline.", lraPath)
	}

	assessment, err := lra.LoadLRA(instancePath)
	if err != nil {
		return fmt.Errorf("failed to load LRA: %w", err)
	}

	if statusJSON {
		return outputStatusJSON(assessment)
	}

	printStatusSummary(assessment)
	return nil
}

func outputStatusJSON(assessment *lra.LivingRealityAssessment) error {
	data, err := json.MarshalIndent(assessment, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

func printStatusSummary(a *lra.LivingRealityAssessment) {
	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("🌱 Living Reality Assessment - Current Baseline")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	// Metadata
	fmt.Printf("📊 Lifecycle Stage: %s\n", a.Metadata.LifecycleStage)
	fmt.Printf("🔄 Cycles Completed: %d\n", a.Metadata.CyclesCompleted)
	fmt.Printf("📈 Adoption Level: %d\n", a.Metadata.AdoptionLevel)
	fmt.Println()

	// Adoption Context
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("🏢 Organizational Context")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Printf("  Organization Type: %s\n", a.AdoptionContext.OrganizationType)
	fmt.Printf("  Team Size: %d people\n", a.AdoptionContext.TeamSize)
	fmt.Printf("  Funding Stage: %s\n", a.AdoptionContext.FundingStage)
	if a.AdoptionContext.AICapabilityLevel != "" {
		fmt.Printf("  AI Capability: %s\n", a.AdoptionContext.AICapabilityLevel)
	}
	if a.AdoptionContext.PrimaryBottleneck != "" {
		fmt.Printf("  Primary Bottleneck: %s\n", a.AdoptionContext.PrimaryBottleneck)
	}
	if a.AdoptionContext.RunwayMonths != nil {
		fmt.Printf("  Runway: %.1f months\n", *a.AdoptionContext.RunwayMonths)
	}
	fmt.Println()

	// Track Baselines
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("📊 Track Maturity Baselines")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	trackNames := []string{"product", "strategy", "org_ops", "commercial"}
	trackDisplayNames := map[string]string{
		"product":    "Product",
		"strategy":   "Strategy",
		"org_ops":    "OrgOps",
		"commercial": "Commercial",
	}

	for _, trackName := range trackNames {
		if baseline, ok := a.TrackBaselines[trackName]; ok {
			maturityBar := getMaturityBar(baseline.Maturity)
			statusIcon := getStatusIcon(baseline.Status)
			fmt.Printf("  %s %-12s %s %s\n", statusIcon, trackDisplayNames[trackName]+":", maturityBar, baseline.Maturity)
		}
	}
	fmt.Println()

	// Existing Assets Summary
	if a.ExistingAssets != nil {
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("📁 Existing Assets")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println()

		if a.ExistingAssets.CodeAssets != nil {
			fmt.Printf("  Has Code: %s", yesNoIcon(a.ExistingAssets.CodeAssets.Exists))
			if a.ExistingAssets.CodeAssets.Maturity != "" {
				fmt.Printf(" (%s)", a.ExistingAssets.CodeAssets.Maturity)
			}
			fmt.Println()
		}

		if a.ExistingAssets.DocumentationAssets != nil {
			fmt.Printf("  Has Documentation: %s\n", yesNoIcon(a.ExistingAssets.DocumentationAssets.Exists))
		}

		if a.ExistingAssets.CustomerAssets != nil {
			fmt.Printf("  Has Users: %s", yesNoIcon(a.ExistingAssets.CustomerAssets.HasUsers))
			if a.ExistingAssets.CustomerAssets.UserCountEstimate != "" {
				fmt.Printf(" (%s)", a.ExistingAssets.CustomerAssets.UserCountEstimate)
			}
			fmt.Println()
			fmt.Printf("  Paying Customers: %s\n", yesNoIcon(a.ExistingAssets.CustomerAssets.PayingCustomers))
		}
		fmt.Println()
	}

	// Current Focus
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("🎯 Current Focus")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Printf("  Cycle: %s\n", a.CurrentFocus.CycleReference)
	if a.CurrentFocus.PrimaryTrack != "" {
		fmt.Printf("  Primary Track: %s\n", a.CurrentFocus.PrimaryTrack)
	}
	fmt.Printf("  Primary Objective: %s\n", a.CurrentFocus.PrimaryObjective)
	fmt.Println()

	if len(a.CurrentFocus.AttentionAllocation) > 0 {
		fmt.Println("  Attention Allocation:")
		for track, percentage := range a.CurrentFocus.AttentionAllocation {
			bar := getProgressBar(percentage, 40)
			fmt.Printf("    %-12s %s %3d%%\n", track+":", bar, percentage)
		}
		fmt.Println()
	}

	// Constraints
	if a.ConstraintsAndAssumptions != nil && len(a.ConstraintsAndAssumptions.HardConstraints) > 0 {
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("⚠️  Hard Constraints")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println()
		for _, constraint := range a.ConstraintsAndAssumptions.HardConstraints {
			fmt.Printf("  • %s\n", constraint.Constraint)
		}
		fmt.Println()
	}

	// Warnings/Recommendations
	printWarnings(a)

	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
}

func printWarnings(a *lra.LivingRealityAssessment) {
	warnings := []string{}

	// Check for low maturity across all tracks
	lowMaturityTracks := []string{}
	for name, baseline := range a.TrackBaselines {
		if baseline.Maturity == "absent" || baseline.Maturity == "implicit" {
			lowMaturityTracks = append(lowMaturityTracks, name)
		}
	}
	if len(lowMaturityTracks) >= 3 {
		warnings = append(warnings, fmt.Sprintf("Low maturity across multiple tracks: %s", strings.Join(lowMaturityTracks, ", ")))
	}

	// Check runway
	if a.AdoptionContext.RunwayMonths != nil && *a.AdoptionContext.RunwayMonths < 6 {
		warnings = append(warnings, fmt.Sprintf("Low runway: %.1f months remaining", *a.AdoptionContext.RunwayMonths))
	}

	// Check attention allocation balance
	if len(a.CurrentFocus.AttentionAllocation) > 0 {
		total := 0
		for _, pct := range a.CurrentFocus.AttentionAllocation {
			total += pct
		}
		if total != 100 {
			warnings = append(warnings, fmt.Sprintf("Attention allocation doesn't sum to 100%% (currently %d%%)", total))
		}
	}

	if len(warnings) > 0 {
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("⚠️  Warnings")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println()
		for _, warning := range warnings {
			fmt.Printf("  ⚠️  %s\n", warning)
		}
		fmt.Println()
	}
}

// Helper functions for visual formatting
func getMaturityBar(level string) string {
	maturityLevels := map[string]int{
		"absent":    0,
		"implicit":  1,
		"explicit":  2,
		"measured":  3,
		"optimized": 4,
	}

	value, ok := maturityLevels[level]
	if !ok {
		value = 0
	}
	return getProgressBar(value*25, 20)
}

func getProgressBar(percentage, width int) string {
	filled := (percentage * width) / 100
	if filled > width {
		filled = width
	}
	empty := width - filled

	bar := strings.Repeat("█", filled) + strings.Repeat("░", empty)
	return bar
}

func yesNoIcon(value bool) string {
	if value {
		return "✅ Yes"
	}
	return "❌ No"
}
