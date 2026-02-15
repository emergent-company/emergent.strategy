package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/discovery"
	"github.com/spf13/cobra"
)

// LocateOutput represents the JSON output for locate command
type LocateOutput struct {
	SearchPath string                       `json:"search_path"`
	Instances  []*discovery.DiscoveryResult `json:"instances"`
	Summary    LocateSummary                `json:"summary"`
}

// LocateSummary summarizes locate results
type LocateSummary struct {
	Total  int `json:"total"`
	Valid  int `json:"valid"`
	Legacy int `json:"legacy"`
	Broken int `json:"broken"`
}

var locateCmd = &cobra.Command{
	Use:   "locate [path]",
	Short: "Find EPF instances in the directory tree",
	Long: `Search for EPF instances starting from the specified path (or current directory).

Returns all discovered EPF instances with confidence scoring:
  - high:   Has valid anchor file (_epf.yaml) - definitely EPF
  - medium: Has EPF markers (READY/FIRE/AIM) but no anchor - legacy instance
  - low:    Has partial EPF structure - may be incomplete

Status indicates instance health:
  - valid:      Ready for use
  - legacy:     Works but needs anchor file
  - broken:     Has issues that need fixing
  - not-found:  No EPF instance found`,
	RunE: runLocate,
}

var (
	locateJSON          bool
	locateRequireAnchor bool
	locateMaxDepth      int
	locateVerbose       bool
)

func init() {
	rootCmd.AddCommand(locateCmd)
	locateCmd.Flags().BoolVar(&locateJSON, "json", false, "output as JSON")
	locateCmd.Flags().BoolVar(&locateRequireAnchor, "require-anchor", false, "only show instances with anchor files")
	locateCmd.Flags().IntVar(&locateMaxDepth, "max-depth", 5, "maximum directory depth to search")
	locateCmd.Flags().BoolVarP(&locateVerbose, "verbose", "v", false, "show detailed information")
}

func runLocate(cmd *cobra.Command, args []string) error {
	searchPath := "."
	if len(args) > 0 {
		searchPath = args[0]
	}

	absPath, err := filepath.Abs(searchPath)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}

	opts := &discovery.DiscoveryOptions{
		MaxDepth:      locateMaxDepth,
		IncludeLegacy: !locateRequireAnchor,
		RequireAnchor: locateRequireAnchor,
	}

	results, err := discovery.Discover(absPath, opts)
	if err != nil {
		return fmt.Errorf("discovery failed: %w", err)
	}

	// Build output
	output := &LocateOutput{
		SearchPath: absPath,
		Instances:  results,
	}

	// Calculate summary
	for _, r := range results {
		output.Summary.Total++
		switch r.Status {
		case discovery.StatusValid:
			output.Summary.Valid++
		case discovery.StatusLegacy:
			output.Summary.Legacy++
		case discovery.StatusBroken:
			output.Summary.Broken++
		}
	}

	if locateJSON {
		return outputLocateJSON(output)
	}

	return outputLocateHuman(output, locateVerbose)
}

func outputLocateJSON(output *LocateOutput) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(output)
}

func outputLocateHuman(output *LocateOutput, verbose bool) error {
	fmt.Printf("Searching: %s\n", output.SearchPath)
	fmt.Println()

	if len(output.Instances) == 0 {
		fmt.Println("No EPF instances found.")
		fmt.Println()
		fmt.Println("To create a new EPF instance:")
		fmt.Println("  epf-cli init [path]")
		fmt.Println()
		fmt.Println("Or search a different location:")
		fmt.Println("  epf-cli locate /path/to/search")
		return nil
	}

	// Group by status
	valid := []*discovery.DiscoveryResult{}
	legacy := []*discovery.DiscoveryResult{}
	broken := []*discovery.DiscoveryResult{}

	for _, r := range output.Instances {
		switch r.Status {
		case discovery.StatusValid:
			valid = append(valid, r)
		case discovery.StatusLegacy:
			legacy = append(legacy, r)
		case discovery.StatusBroken:
			broken = append(broken, r)
		}
	}

	// Print valid instances
	if len(valid) > 0 {
		fmt.Printf("VALID INSTANCES (%d)\n", len(valid))
		fmt.Println(strings.Repeat("-", 60))
		for _, r := range valid {
			printInstance(r, output.SearchPath, verbose)
		}
		fmt.Println()
	}

	// Print legacy instances
	if len(legacy) > 0 {
		fmt.Printf("LEGACY INSTANCES (%d) - need anchor file\n", len(legacy))
		fmt.Println(strings.Repeat("-", 60))
		for _, r := range legacy {
			printInstance(r, output.SearchPath, verbose)
		}
		fmt.Println()
	}

	// Print broken instances
	if len(broken) > 0 {
		fmt.Printf("BROKEN INSTANCES (%d) - need repair\n", len(broken))
		fmt.Println(strings.Repeat("-", 60))
		for _, r := range broken {
			printInstance(r, output.SearchPath, verbose)
		}
		fmt.Println()
	}

	// Summary
	fmt.Println("SUMMARY")
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("  Total:   %d\n", output.Summary.Total)
	fmt.Printf("  Valid:   %d\n", output.Summary.Valid)
	fmt.Printf("  Legacy:  %d\n", output.Summary.Legacy)
	fmt.Printf("  Broken:  %d\n", output.Summary.Broken)
	fmt.Println()

	// Recommendations
	if output.Summary.Legacy > 0 {
		fmt.Println("RECOMMENDATION")
		fmt.Println(strings.Repeat("-", 60))
		fmt.Println("  Run 'epf-cli migrate-anchor <path>' to add anchor files")
		fmt.Println("  to legacy instances for better discovery and validation.")
		fmt.Println()
	}

	return nil
}

func printInstance(r *discovery.DiscoveryResult, searchPath string, verbose bool) {
	// Get relative path if possible
	relPath, err := filepath.Rel(searchPath, r.Path)
	if err != nil {
		relPath = r.Path
	}

	// Status icon
	var icon string
	switch r.Status {
	case discovery.StatusValid:
		icon = "✓"
	case discovery.StatusLegacy:
		icon = "⚠"
	case discovery.StatusBroken:
		icon = "✗"
	default:
		icon = "?"
	}

	// Print main line
	if relPath == "." {
		fmt.Printf("  %s  %s (current directory)\n", icon, r.Path)
	} else {
		fmt.Printf("  %s  %s\n", icon, relPath)
	}

	// Print product name if available
	if r.Anchor != nil && r.Anchor.ProductName != "" {
		fmt.Printf("       Product: %s\n", r.Anchor.ProductName)
	}

	// Print confidence
	fmt.Printf("       Confidence: %s\n", r.Confidence)

	// Print submodule indicator
	if discovery.IsSubmodule(r.Path) {
		fmt.Printf("       Submodule: yes\n")
	} else if uninit, hint := discovery.IsUninitializedSubmodule(r.Path); uninit {
		fmt.Printf("       Submodule: uninitialized\n")
		fmt.Printf("       Hint: %s\n", hint)
	}

	// Print markers
	if len(r.Markers) > 0 {
		fmt.Printf("       Markers: %s\n", strings.Join(r.Markers, ", "))
	}

	// Print issues if verbose or broken
	if verbose || r.Status == discovery.StatusBroken {
		if len(r.Issues) > 0 {
			fmt.Println("       Issues:")
			for _, issue := range r.Issues {
				fmt.Printf("         - %s\n", issue)
			}
		}
	}

	// Print suggestions if verbose or has issues
	if verbose && len(r.Suggestions) > 0 {
		fmt.Println("       Fix:")
		for _, sug := range r.Suggestions {
			fmt.Printf("         - %s\n", sug)
		}
	}

	fmt.Println()
}
