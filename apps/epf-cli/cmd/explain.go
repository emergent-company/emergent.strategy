package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/relationships"
	"github.com/spf13/cobra"
)

var (
	explainJSON    bool
	explainVerbose bool
)

var explainCmd = &cobra.Command{
	Use:   "explain <path>",
	Short: "Explain a value model path",
	Long: `Explain what a value model path means and show its strategic context.

This command helps you understand:
  - Which layer (L1) and component (L2/L3) a path resolves to
  - Current maturity level at that path
  - Features that contribute to this path
  - Key Results (KRs) that target this path

Value model paths follow the format: Track.Layer.Component[.SubComponent]
Examples:
  - Product.Discovery.KnowledgeExploration
  - Strategy.StrategicFramework.SystemOfWork
  - OrgOps.FinancialServices.FinanceOperations

The command auto-detects the EPF instance from your current directory.
Use --instance to specify a particular instance when multiple exist.

Examples:
  epf-cli explain Product.Discovery.KnowledgeExploration
  epf-cli explain Strategy.StrategicFramework --verbose
  epf-cli explain Product.Discovery --json`,
	Args: cobra.ExactArgs(1),
	Run:  runExplain,
}

// ExplainResult is the JSON output structure for explain command
type ExplainResult struct {
	Path          string              `json:"path"`
	CanonicalPath string              `json:"canonical_path,omitempty"`
	IsValid       bool                `json:"is_valid"`
	Error         string              `json:"error,omitempty"`
	Track         string              `json:"track,omitempty"`
	Depth         int                 `json:"depth,omitempty"`
	Layer         *ExplainLayerInfo   `json:"layer,omitempty"`
	Component     *ExplainCompInfo    `json:"component,omitempty"`
	SubComponent  *ExplainSubCompInfo `json:"sub_component,omitempty"`
	Features      []string            `json:"contributing_features,omitempty"`
	KeyResults    []string            `json:"targeting_krs,omitempty"`
	Guidance      *ExplainGuidance    `json:"guidance,omitempty"`
}

type ExplainLayerInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type ExplainCompInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Maturity    string `json:"maturity,omitempty"`
}

type ExplainSubCompInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Active   bool   `json:"active"`
	Maturity string `json:"maturity,omitempty"`
}

type ExplainGuidance struct {
	NextSteps []string `json:"next_steps,omitempty"`
	Tips      []string `json:"tips,omitempty"`
}

func runExplain(cmd *cobra.Command, args []string) {
	path := args[0]

	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if explainJSON {
			outputJSON(ExplainResult{Path: path, IsValid: false, Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Show instance being used
	if !explainJSON {
		ctx := GetContext()
		if ctx != nil && ctx.CurrentInstance != "" {
			fmt.Printf("Using instance: %s\n\n", ctx.CurrentInstance)
		}
	}

	// Create and load analyzer
	analyzer := relationships.NewAnalyzer(instancePath)
	if err := analyzer.Load(); err != nil {
		if explainJSON {
			outputJSON(ExplainResult{Path: path, IsValid: false, Error: fmt.Sprintf("Failed to load instance: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading instance: %v\n", err)
		}
		os.Exit(1)
	}

	// Get explanation
	explanation, err := analyzer.ExplainPath(path)

	result := buildExplainResult(path, explanation, err)

	if explainJSON {
		outputJSON(result)
	} else {
		printExplainResult(result)
	}

	if !result.IsValid {
		os.Exit(1)
	}
}

func buildExplainResult(path string, explanation *relationships.PathExplanation, err error) *ExplainResult {
	result := &ExplainResult{
		Path:    path,
		IsValid: err == nil && explanation != nil && explanation.IsValid,
	}

	if err != nil {
		result.Error = err.Error()
		result.Guidance = &ExplainGuidance{
			Tips: []string{
				"Value model paths follow the format: Track.Layer.Component",
				"Valid tracks are: Product, Strategy, OrgOps, Commercial",
				"Use 'epf-cli coverage' to see all available paths",
			},
		}
		return result
	}

	if explanation == nil {
		result.Error = "No explanation returned"
		return result
	}

	if !explanation.IsValid {
		result.Error = explanation.ErrorMsg
		return result
	}

	result.CanonicalPath = explanation.CanonicalPath
	result.Track = explanation.Track
	result.Depth = explanation.Depth

	if explanation.Layer != nil {
		result.Layer = &ExplainLayerInfo{
			ID:          explanation.Layer.ID,
			Name:        explanation.Layer.Name,
			Description: explanation.Layer.Description,
		}
	}

	if explanation.Component != nil {
		result.Component = &ExplainCompInfo{
			ID:          explanation.Component.ID,
			Name:        explanation.Component.Name,
			Description: explanation.Component.Description,
			Maturity:    explanation.Component.Maturity,
		}
	}

	if explanation.SubComponent != nil {
		result.SubComponent = &ExplainSubCompInfo{
			ID:       explanation.SubComponent.ID,
			Name:     explanation.SubComponent.Name,
			Active:   explanation.SubComponent.Active,
			Maturity: explanation.SubComponent.Maturity,
		}
	}

	result.Features = explanation.ContributingFeatures
	result.KeyResults = explanation.TargetingKRs

	// Build guidance
	result.Guidance = buildExplainGuidance(result)

	return result
}

func buildExplainGuidance(result *ExplainResult) *ExplainGuidance {
	guidance := &ExplainGuidance{}

	// Next steps based on coverage
	if len(result.Features) == 0 {
		guidance.NextSteps = append(guidance.NextSteps,
			fmt.Sprintf("No features contribute to %s - consider adding features with contributes_to targeting this path", result.CanonicalPath))
	}

	if len(result.KeyResults) == 0 && result.Depth <= 2 {
		guidance.NextSteps = append(guidance.NextSteps,
			"No KRs target this path - consider adding key results in roadmap_recipe.yaml")
	}

	// Tips based on depth
	if result.Depth == 1 {
		guidance.Tips = append(guidance.Tips,
			"This is an L1 (Layer) path - consider drilling down to L2 components for more specific targeting")
	} else if result.Depth == 2 && result.Component != nil {
		if result.Component.Maturity != "" {
			guidance.Tips = append(guidance.Tips,
				fmt.Sprintf("Current maturity: %s - features can help advance this component", result.Component.Maturity))
		}
	}

	return guidance
}

func printExplainResult(result *ExplainResult) {
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Printf("║  Value Model Path: %-40s║\n", truncateString(result.Path, 40))
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	if !result.IsValid {
		fmt.Printf("❌ Invalid path: %s\n", result.Error)
		fmt.Println()
		if result.Guidance != nil && len(result.Guidance.Tips) > 0 {
			fmt.Println("💡 Tips:")
			for _, tip := range result.Guidance.Tips {
				fmt.Printf("   • %s\n", tip)
			}
		}
		return
	}

	// Path info
	fmt.Printf("✓ Valid path (Track: %s, Depth: L%d)\n", result.Track, result.Depth)
	if result.CanonicalPath != result.Path {
		fmt.Printf("  Canonical: %s\n", result.CanonicalPath)
	}
	fmt.Println()

	// Layer info
	if result.Layer != nil {
		fmt.Println("📦 Layer (L1):")
		fmt.Printf("   ID:   %s\n", result.Layer.ID)
		fmt.Printf("   Name: %s\n", result.Layer.Name)
		if explainVerbose && result.Layer.Description != "" {
			fmt.Printf("   Desc: %s\n", wrapText(result.Layer.Description, 55, "         "))
		}
		fmt.Println()
	}

	// Component info
	if result.Component != nil {
		fmt.Println("🔧 Component (L2):")
		fmt.Printf("   ID:   %s\n", result.Component.ID)
		fmt.Printf("   Name: %s\n", result.Component.Name)
		if result.Component.Maturity != "" {
			fmt.Printf("   Maturity: %s\n", maturityIcon(result.Component.Maturity))
		}
		if explainVerbose && result.Component.Description != "" {
			fmt.Printf("   Desc: %s\n", wrapText(result.Component.Description, 55, "         "))
		}
		fmt.Println()
	}

	// Sub-component info
	if result.SubComponent != nil {
		fmt.Println("⚙️  Sub-Component (L3):")
		fmt.Printf("   ID:   %s\n", result.SubComponent.ID)
		fmt.Printf("   Name: %s\n", result.SubComponent.Name)
		activeStr := "No"
		if result.SubComponent.Active {
			activeStr = "Yes"
		}
		fmt.Printf("   Active: %s\n", activeStr)
		if result.SubComponent.Maturity != "" {
			fmt.Printf("   Maturity: %s\n", maturityIcon(result.SubComponent.Maturity))
		}
		fmt.Println()
	}

	// Contributing features
	fmt.Println("🎯 Contributing Features:")
	if len(result.Features) == 0 {
		fmt.Println("   (none)")
	} else {
		for _, f := range result.Features {
			fmt.Printf("   • %s\n", f)
		}
	}
	fmt.Println()

	// Targeting KRs
	fmt.Println("📊 Targeting Key Results:")
	if len(result.KeyResults) == 0 {
		fmt.Println("   (none)")
	} else {
		for _, kr := range result.KeyResults {
			fmt.Printf("   • %s\n", kr)
		}
	}
	fmt.Println()

	// Guidance
	if result.Guidance != nil {
		if len(result.Guidance.NextSteps) > 0 {
			fmt.Println("📋 Suggested Next Steps:")
			for _, step := range result.Guidance.NextSteps {
				fmt.Printf("   → %s\n", step)
			}
			fmt.Println()
		}
		if explainVerbose && len(result.Guidance.Tips) > 0 {
			fmt.Println("💡 Tips:")
			for _, tip := range result.Guidance.Tips {
				fmt.Printf("   • %s\n", tip)
			}
		}
	}
}

func maturityIcon(maturity string) string {
	switch strings.ToLower(maturity) {
	case "none", "":
		return "⬜ None"
	case "emerging":
		return "🟡 Emerging"
	case "developing":
		return "🟠 Developing"
	case "mature":
		return "🟢 Mature"
	case "leading":
		return "🔵 Leading"
	default:
		return maturity
	}
}

func wrapText(text string, width int, indent string) string {
	if len(text) <= width {
		return text
	}

	var result strings.Builder
	words := strings.Fields(text)
	lineLen := 0
	first := true

	for _, word := range words {
		if lineLen+len(word)+1 > width && lineLen > 0 {
			result.WriteString("\n")
			result.WriteString(indent)
			lineLen = 0
			first = true
		}
		if !first {
			result.WriteString(" ")
			lineLen++
		}
		result.WriteString(word)
		lineLen += len(word)
		first = false
	}

	return result.String()
}

func outputJSON(v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}

func init() {
	rootCmd.AddCommand(explainCmd)
	explainCmd.Flags().BoolVar(&explainJSON, "json", false, "Output as JSON")
	explainCmd.Flags().BoolVarP(&explainVerbose, "verbose", "v", false, "Show detailed output including descriptions")
}
