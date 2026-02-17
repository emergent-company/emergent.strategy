package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
)

var (
	archiveCycleNumber int
	archiveCycleJSON   bool
)

var aimArchiveCycleCmd = &cobra.Command{
	Use:   "archive-cycle [instance-path]",
	Short: "Archive current cycle's AIM artifacts to cycles/cycle-N/",
	Long: `Save the current cycle's AIM artifacts as a snapshot in the cycles directory.

This command copies the following files (if they exist) to AIM/cycles/cycle-N/:
  - assessment_report.yaml
  - calibration_memo.yaml
  - living_reality_assessment.yaml (LRA snapshot at cycle end)

The original files are NOT removed — use init-cycle to start a fresh cycle.

Examples:
  epf-cli aim archive-cycle --cycle 1
  epf-cli aim archive-cycle /path/to/instance --cycle 2`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimArchiveCycle,
}

func init() {
	aimCmd.AddCommand(aimArchiveCycleCmd)
	aimArchiveCycleCmd.Flags().IntVar(&archiveCycleNumber, "cycle", 0, "Cycle number to archive (required)")
	aimArchiveCycleCmd.Flags().BoolVar(&archiveCycleJSON, "json", false, "Output result as JSON")
	_ = aimArchiveCycleCmd.MarkFlagRequired("cycle")
}

func runAimArchiveCycle(cmd *cobra.Command, args []string) error {
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

	if archiveCycleNumber < 1 {
		return fmt.Errorf("--cycle must be a positive integer (got %d)", archiveCycleNumber)
	}

	// Archive the cycle
	archiveDir, err := aim.ArchiveCycle(instancePath, archiveCycleNumber)
	if err != nil {
		return fmt.Errorf("failed to archive cycle %d: %w", archiveCycleNumber, err)
	}

	// Output result
	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"cycle":         archiveCycleNumber,
		"archive_dir":   archiveDir,
		"message":       fmt.Sprintf("Cycle %d archived successfully", archiveCycleNumber),
	}

	if archiveCycleJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Printf("Cycle %d archived to: %s\n", archiveCycleNumber, archiveDir)
	}

	return nil
}
