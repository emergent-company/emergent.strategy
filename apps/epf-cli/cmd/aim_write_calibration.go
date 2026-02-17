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
	writeCalibrationFile string
	writeCalibrationJSON bool
)

var aimWriteCalibrationCmd = &cobra.Command{
	Use:   "write-calibration [instance-path]",
	Short: "Write a calibration memo to the AIM directory",
	Long: `Write or update a calibration memo from a YAML file or stdin.

The calibration memo captures the persevere/pivot/pull-the-plug decision after
assessment, along with learnings, next-cycle focus areas, and inputs for READY
artifact updates. This command reads structured YAML input and writes it to
AIM/calibration_memo.yaml.

Input sources (in priority order):
  --file <path>    Read calibration YAML from a file
  stdin            Read from stdin if no --file specified and stdin is piped

Examples:
  epf-cli aim write-calibration --file calibration_draft.yaml
  cat memo.yaml | epf-cli aim write-calibration
  epf-cli aim write-calibration /path/to/instance --file memo.yaml`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimWriteCalibration,
}

func init() {
	aimCmd.AddCommand(aimWriteCalibrationCmd)
	aimWriteCalibrationCmd.Flags().StringVar(&writeCalibrationFile, "file", "", "Path to calibration YAML file")
	aimWriteCalibrationCmd.Flags().BoolVar(&writeCalibrationJSON, "json", false, "Output result as JSON")
}

func runAimWriteCalibration(cmd *cobra.Command, args []string) error {
	// Resolve instance path
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
	if writeCalibrationFile != "" {
		inputData, err = os.ReadFile(writeCalibrationFile)
		if err != nil {
			return fmt.Errorf("failed to read file %s: %w", writeCalibrationFile, err)
		}
	} else {
		// Try stdin
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

	// Parse YAML into CalibrationMemo
	var memo aim.CalibrationMemo
	if err := yaml.Unmarshal(inputData, &memo); err != nil {
		return fmt.Errorf("failed to parse calibration YAML: %w", err)
	}

	// Write to AIM directory
	outputPath, err := aim.WriteCalibrationMemo(instancePath, &memo)
	if err != nil {
		return fmt.Errorf("failed to write calibration memo: %w", err)
	}

	// Output result
	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"output_path":   outputPath,
		"roadmap_id":    memo.RoadmapID,
		"cycle":         memo.Cycle,
		"decision":      memo.Decision,
		"message":       "Calibration memo written successfully",
	}

	if writeCalibrationJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Printf("Calibration memo written to: %s\n", outputPath)
		if memo.Decision != "" {
			fmt.Printf("  Decision: %s\n", memo.Decision)
		}
	}

	return nil
}
