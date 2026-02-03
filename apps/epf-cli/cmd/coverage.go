package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/relationships"
	"github.com/spf13/cobra"
)

var (
	coverageJSON    bool
	coverageVerbose bool
	coverageTrack   string
)

var coverageCmd = &cobra.Command{
	Use:   "coverage",
	Short: "Analyze feature coverage of the value model",
	Long: `Analyze how well features cover the value model components.

This command shows:
  - Overall coverage percentage (L2 components with contributing features)
  - Coverage breakdown by track and layer
  - Uncovered components (gaps)
  - Orphan features (features with no contributes_to)
  - KR-targeted paths that lack feature coverage (strategic gaps)

Value model coverage measures how many components have at least one feature
contributing to them. High coverage indicates comprehensive feature planning.

Use --track to focus on a specific track (Product, Strategy, OrgOps, Commercial).

The command auto-detects the EPF instance from your current directory.
Use --instance to specify a particular instance when multiple exist.

Examples:
  epf-cli coverage                    # Analyze all tracks
  epf-cli coverage --track Product    # Analyze Product track only
  epf-cli coverage --verbose          # Show detailed gaps and suggestions
  epf-cli coverage --json             # Output as JSON`,
	Run: runCoverage,
}

// CoverageResult is the JSON output structure for coverage command
type CoverageResult struct {
	Track                    string                 `json:"track"`
	CoveragePercent          float64                `json:"coverage_percent"`
	TotalL2Components        int                    `json:"total_l2_components"`
	CoveredL2Components      int                    `json:"covered_l2_components"`
	UncoveredL2Components    []string               `json:"uncovered_l2_components,omitempty"`
	ByLayer                  []*CoverageLayerResult `json:"by_layer,omitempty"`
	OrphanFeatures           []string               `json:"orphan_features,omitempty"`
	MostContributed          []*CoveragePathResult  `json:"most_contributed,omitempty"`
	KRTargetsWithoutFeatures []string               `json:"kr_targets_without_features,omitempty"`
	Guidance                 *CoverageGuidance      `json:"guidance,omitempty"`
	Error                    string                 `json:"error,omitempty"`
}

type CoverageLayerResult struct {
	LayerPath       string   `json:"layer_path"`
	LayerName       string   `json:"layer_name"`
	TotalComponents int      `json:"total_components"`
	CoveredCount    int      `json:"covered_count"`
	CoveragePercent float64  `json:"coverage_percent"`
	UncoveredPaths  []string `json:"uncovered_paths,omitempty"`
}

type CoveragePathResult struct {
	Path          string   `json:"path"`
	FeatureCount  int      `json:"feature_count"`
	FeatureIDs    []string `json:"feature_ids,omitempty"`
	HasKRTargeted bool     `json:"has_kr_targeted"`
}

type CoverageGuidance struct {
	NextSteps []string `json:"next_steps,omitempty"`
	Warnings  []string `json:"warnings,omitempty"`
	Tips      []string `json:"tips,omitempty"`
}

func runCoverage(cmd *cobra.Command, args []string) {
	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if coverageJSON {
			outputCoverageJSON(&CoverageResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Show instance being used
	if !coverageJSON {
		ctx := GetContext()
		if ctx != nil && ctx.CurrentInstance != "" {
			fmt.Printf("Using instance: %s\n\n", ctx.CurrentInstance)
		}
	}

	// Create and load analyzer
	analyzer := relationships.NewAnalyzer(instancePath)
	if err := analyzer.Load(); err != nil {
		if coverageJSON {
			outputCoverageJSON(&CoverageResult{Error: fmt.Sprintf("Failed to load instance: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading instance: %v\n", err)
		}
		os.Exit(1)
	}

	// Get coverage analysis
	analysis := analyzer.AnalyzeCoverage(coverageTrack)
	result := buildCoverageResult(analysis)

	if coverageJSON {
		outputCoverageJSON(result)
	} else {
		printCoverageResult(result)
	}
}

func buildCoverageResult(analysis *relationships.CoverageAnalysis) *CoverageResult {
	result := &CoverageResult{
		Track:               analysis.Track,
		CoveragePercent:     analysis.CoveragePercent,
		TotalL2Components:   analysis.TotalL2Components,
		CoveredL2Components: analysis.CoveredL2Components,
		Guidance:            &CoverageGuidance{},
	}

	// Include uncovered components (limit in non-verbose)
	if coverageVerbose {
		result.UncoveredL2Components = analysis.UncoveredL2Components
	} else if len(analysis.UncoveredL2Components) > 5 {
		result.UncoveredL2Components = analysis.UncoveredL2Components[:5]
	} else {
		result.UncoveredL2Components = analysis.UncoveredL2Components
	}

	// Convert layer coverage
	layerPaths := make([]string, 0, len(analysis.ByLayer))
	for path := range analysis.ByLayer {
		layerPaths = append(layerPaths, path)
	}
	sort.Strings(layerPaths)

	for _, path := range layerPaths {
		layer := analysis.ByLayer[path]
		layerResult := &CoverageLayerResult{
			LayerPath:       layer.LayerPath,
			LayerName:       layer.LayerName,
			TotalComponents: layer.TotalComponents,
			CoveredCount:    layer.CoveredCount,
			CoveragePercent: layer.CoveragePercent,
		}
		if coverageVerbose {
			layerResult.UncoveredPaths = layer.UncoveredPaths
		}
		result.ByLayer = append(result.ByLayer, layerResult)
	}

	// Orphan features
	for _, f := range analysis.OrphanFeatures {
		result.OrphanFeatures = append(result.OrphanFeatures, f.ID)
	}

	// Most contributed paths (verbose only)
	if coverageVerbose {
		for _, c := range analysis.MostContributed {
			result.MostContributed = append(result.MostContributed, &CoveragePathResult{
				Path:          c.Path,
				FeatureCount:  c.FeatureCount,
				FeatureIDs:    c.FeatureIDs,
				HasKRTargeted: c.HasKRTargeted,
			})
		}
	}

	// KR targets without features
	result.KRTargetsWithoutFeatures = analysis.KRTargetsWithoutFeatures

	// Build guidance
	result.Guidance = buildCoverageGuidance(result, analysis)

	return result
}

func buildCoverageGuidance(result *CoverageResult, analysis *relationships.CoverageAnalysis) *CoverageGuidance {
	guidance := &CoverageGuidance{}

	// Warnings
	if len(result.KRTargetsWithoutFeatures) > 0 {
		guidance.Warnings = append(guidance.Warnings,
			fmt.Sprintf("%d KR-targeted paths have no feature coverage - these are strategic gaps", len(result.KRTargetsWithoutFeatures)))
	}

	if len(result.OrphanFeatures) > 0 {
		guidance.Warnings = append(guidance.Warnings,
			fmt.Sprintf("%d features have no contributes_to paths - consider adding strategic context", len(result.OrphanFeatures)))
	}

	// Next steps based on coverage
	if result.CoveragePercent < 30 {
		guidance.NextSteps = append(guidance.NextSteps,
			"Low coverage - prioritize defining features for core components")
	} else if result.CoveragePercent < 60 {
		guidance.NextSteps = append(guidance.NextSteps,
			"Moderate coverage - focus on uncovered areas aligned with KR targets")
	} else if result.CoveragePercent < 80 {
		guidance.NextSteps = append(guidance.NextSteps,
			"Good coverage - consider filling remaining gaps or deepening existing coverage")
	}

	// Tips
	if len(analysis.UncoveredL2Components) > 0 {
		guidance.Tips = append(guidance.Tips,
			"Use 'epf-cli explain <path>' to understand uncovered components")
	}

	if len(result.OrphanFeatures) > 0 {
		guidance.Tips = append(guidance.Tips,
			"Use 'epf-cli context <feature_id>' to see how to add strategic context to orphan features")
	}

	return guidance
}

func printCoverageResult(result *CoverageResult) {
	if result.Error != "" {
		fmt.Fprintf(os.Stderr, "Error: %s\n", result.Error)
		return
	}

	trackStr := result.Track
	if trackStr == "all" {
		trackStr = "All Tracks"
	}

	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Printf("║  Value Model Coverage: %-36s║\n", trackStr)
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Overall stats
	coverageIcon := coverageRatingIcon(result.CoveragePercent)
	fmt.Printf("%s Coverage: %.1f%%  (%d/%d L2 components)\n",
		coverageIcon, result.CoveragePercent, result.CoveredL2Components, result.TotalL2Components)
	fmt.Println()

	// Coverage by layer
	fmt.Println("📊 Coverage by Layer:")
	fmt.Println("   ─────────────────────────────────────────────────")
	for _, layer := range result.ByLayer {
		icon := coverageRatingIcon(layer.CoveragePercent)
		fmt.Printf("   %s %-35s %5.1f%%  (%d/%d)\n",
			icon, truncateString(layer.LayerName, 35), layer.CoveragePercent, layer.CoveredCount, layer.TotalComponents)

		if coverageVerbose && len(layer.UncoveredPaths) > 0 {
			for _, path := range layer.UncoveredPaths {
				fmt.Printf("      └─ ⬜ %s\n", path)
			}
		}
	}
	fmt.Println()

	// Uncovered components (if any)
	if len(result.UncoveredL2Components) > 0 {
		fmt.Println("🔴 Uncovered Components:")
		displayCount := len(result.UncoveredL2Components)
		for i, path := range result.UncoveredL2Components {
			if !coverageVerbose && i >= 5 {
				break
			}
			fmt.Printf("   • %s\n", path)
		}
		if !coverageVerbose && displayCount > 5 {
			fmt.Printf("   ... and %d more (use --verbose to see all)\n", displayCount-5)
		}
		fmt.Println()
	}

	// KR targets without features (strategic gaps)
	if len(result.KRTargetsWithoutFeatures) > 0 {
		fmt.Println("⚠️  Strategic Gaps (KR targets without features):")
		for _, path := range result.KRTargetsWithoutFeatures {
			fmt.Printf("   • %s\n", path)
		}
		fmt.Println()
	}

	// Orphan features
	if len(result.OrphanFeatures) > 0 {
		fmt.Println("👻 Orphan Features (no contributes_to):")
		for _, id := range result.OrphanFeatures {
			fmt.Printf("   • %s\n", id)
		}
		fmt.Println()
	}

	// Most contributed (verbose only)
	if coverageVerbose && len(result.MostContributed) > 0 {
		fmt.Println("🏆 Most Contributed Paths:")
		for _, c := range result.MostContributed {
			krMarker := ""
			if c.HasKRTargeted {
				krMarker = " [KR-targeted]"
			}
			fmt.Printf("   • %s (%d features)%s\n", c.Path, c.FeatureCount, krMarker)
			if len(c.FeatureIDs) > 0 {
				fmt.Printf("     Features: %s\n", strings.Join(c.FeatureIDs, ", "))
			}
		}
		fmt.Println()
	}

	// Guidance
	if result.Guidance != nil {
		if len(result.Guidance.Warnings) > 0 {
			fmt.Println("⚠️  Warnings:")
			for _, w := range result.Guidance.Warnings {
				fmt.Printf("   %s\n", w)
			}
			fmt.Println()
		}
		if len(result.Guidance.NextSteps) > 0 {
			fmt.Println("📋 Suggested Next Steps:")
			for _, step := range result.Guidance.NextSteps {
				fmt.Printf("   → %s\n", step)
			}
			fmt.Println()
		}
		if coverageVerbose && len(result.Guidance.Tips) > 0 {
			fmt.Println("💡 Tips:")
			for _, tip := range result.Guidance.Tips {
				fmt.Printf("   • %s\n", tip)
			}
		}
	}
}

func coverageRatingIcon(percent float64) string {
	if percent >= 80 {
		return "🟢"
	} else if percent >= 60 {
		return "🟡"
	} else if percent >= 40 {
		return "🟠"
	}
	return "🔴"
}

func outputCoverageJSON(result *CoverageResult) {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}

func init() {
	rootCmd.AddCommand(coverageCmd)
	coverageCmd.Flags().BoolVar(&coverageJSON, "json", false, "Output as JSON")
	coverageCmd.Flags().BoolVarP(&coverageVerbose, "verbose", "v", false, "Show detailed output including all gaps")
	coverageCmd.Flags().StringVar(&coverageTrack, "track", "", "Analyze a specific track (Product, Strategy, OrgOps, Commercial)")
}
