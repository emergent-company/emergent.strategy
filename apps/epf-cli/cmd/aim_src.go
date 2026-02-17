package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	generateSRCCycle int
	generateSRCJSON  bool
	writeSRCFile     string
	writeSRCJSON     bool
)

// =============================================================================
// GENERATE-SRC COMMAND
// =============================================================================

var aimGenerateSRCCmd = &cobra.Command{
	Use:   "generate-src [instance-path]",
	Short: "Generate a Strategic Reality Check with mechanical checks",
	Long: `Generate a Strategic Reality Check (SRC) by running automated mechanical checks
against the EPF instance. The SRC evaluates all READY and FIRE artifacts against
current reality, organized by detection type:

  belief_validity     - Placeholder entries for North Star beliefs and Strategy Formula risks
  market_currency     - Freshness checks on review dates (auto-populated)
  strategic_alignment - Cross-reference integrity (contributes_to, dependencies) (auto-populated)
  execution_reality   - Status/maturity mismatches (auto-populated)
  recalibration_plan  - Prioritized actions derived from findings (auto-populated)

Subjective sections (belief validity evidence, market changes) are left as TODOs
for human or AI agent input. Use 'aim write-src' to update these sections.

Examples:
  epf-cli aim generate-src --cycle 2
  epf-cli aim generate-src /path/to/instance --cycle 1 --json`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimGenerateSRC,
}

func init() {
	aimCmd.AddCommand(aimGenerateSRCCmd)
	aimGenerateSRCCmd.Flags().IntVar(&generateSRCCycle, "cycle", 1, "Cycle number for this SRC")
	aimGenerateSRCCmd.Flags().BoolVar(&generateSRCJSON, "json", false, "Output result as JSON")
}

func runAimGenerateSRC(cmd *cobra.Command, args []string) error {
	var instancePath string
	var err error
	if len(args) > 0 {
		instancePath = args[0]
	} else {
		instancePath, err = GetInstancePath(nil)
		if err != nil {
			return fmt.Errorf("failed to get instance path: %w", err)
		}
	}

	src, err := aim.GenerateSRC(instancePath, generateSRCCycle)
	if err != nil {
		return fmt.Errorf("failed to generate SRC: %w", err)
	}

	// Write to AIM directory
	outputPath, err := aim.WriteStrategicRealityCheck(instancePath, src)
	if err != nil {
		return fmt.Errorf("failed to write SRC: %w", err)
	}

	result := map[string]interface{}{
		"success":             true,
		"instance_path":       instancePath,
		"output_path":         outputPath,
		"cycle":               src.Cycle,
		"overall_health":      src.Summary.OverallHealth,
		"finding_counts":      src.Summary.FindingCounts,
		"mechanical_checks":   "complete",
		"subjective_sections": "TODO — use 'aim write-src' to fill in belief validity evidence and market changes",
	}

	if generateSRCJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Printf("Strategic Reality Check generated: %s\n", outputPath)
		fmt.Printf("  Cycle: %d\n", src.Cycle)
		fmt.Printf("  Overall health: %s\n", src.Summary.OverallHealth)
		if src.Summary.FindingCounts != nil {
			fc := src.Summary.FindingCounts
			fmt.Printf("  Findings: belief_validity=%d, market_currency=%d, strategic_alignment=%d, execution_reality=%d\n",
				fc.BeliefValidity, fc.MarketCurrency, fc.StrategicAlignment, fc.ExecutionReality)
			fmt.Printf("  Recalibration actions: %d\n", fc.RecalibrationActions)
		}
		fmt.Println("\nMechanical checks complete. Subjective sections have TODO placeholders.")
		fmt.Println("Use 'aim write-src' to fill in belief validity evidence and market changes.")
	}

	return nil
}

// =============================================================================
// WRITE-SRC COMMAND
// =============================================================================

var aimWriteSRCCmd = &cobra.Command{
	Use:   "write-src [instance-path]",
	Short: "Write a Strategic Reality Check to the AIM directory",
	Long: `Write or update a Strategic Reality Check from a YAML file or stdin.

The SRC captures cross-artifact health evaluation organized by detection type.
This command reads structured YAML input and writes it to
AIM/strategic_reality_check.yaml.

Input sources (in priority order):
  --file <path>    Read SRC YAML from a file
  stdin            Read from stdin if no --file specified and stdin is piped

Examples:
  epf-cli aim write-src --file src_updated.yaml
  cat src.yaml | epf-cli aim write-src
  epf-cli aim write-src /path/to/instance --file src.yaml`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimWriteSRC,
}

func init() {
	aimCmd.AddCommand(aimWriteSRCCmd)
	aimWriteSRCCmd.Flags().StringVar(&writeSRCFile, "file", "", "Path to SRC YAML file")
	aimWriteSRCCmd.Flags().BoolVar(&writeSRCJSON, "json", false, "Output result as JSON")
}

func runAimWriteSRC(cmd *cobra.Command, args []string) error {
	var instancePath string
	var err error
	if len(args) > 0 {
		instancePath = args[0]
	} else {
		instancePath, err = GetInstancePath(nil)
		if err != nil {
			return fmt.Errorf("failed to get instance path: %w", err)
		}
	}

	// Read input YAML
	var inputData []byte
	if writeSRCFile != "" {
		inputData, err = os.ReadFile(writeSRCFile)
		if err != nil {
			return fmt.Errorf("failed to read file %s: %w", writeSRCFile, err)
		}
	} else {
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			inputData, err = io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read from stdin: %w", err)
			}
		} else {
			return fmt.Errorf("no input provided; use --file <path> or pipe YAML via stdin")
		}
	}

	// Parse YAML into StrategicRealityCheck
	var src aim.StrategicRealityCheck
	if err := yaml.Unmarshal(inputData, &src); err != nil {
		return fmt.Errorf("failed to parse SRC YAML: %w", err)
	}

	// Write to AIM directory
	outputPath, err := aim.WriteStrategicRealityCheck(instancePath, &src)
	if err != nil {
		return fmt.Errorf("failed to write SRC: %w", err)
	}

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"output_path":   outputPath,
		"cycle":         src.Cycle,
		"message":       "Strategic Reality Check written successfully",
	}

	if writeSRCJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Printf("Strategic Reality Check written to: %s\n", outputPath)
	}

	return nil
}
