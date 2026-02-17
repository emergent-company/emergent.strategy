package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
)

var (
	initCycleNumber    int
	initCycleArchive   bool
	initCycleUpdatedBy string
	initCycleJSON      bool
)

var aimInitCycleCmd = &cobra.Command{
	Use:   "init-cycle [instance-path]",
	Short: "Bootstrap a new cycle by archiving previous and resetting AIM artifacts",
	Long: `Initialize a new cycle for the EPF instance.

This command:
  1. Optionally archives the previous cycle's AIM artifacts to cycles/cycle-N/
  2. Removes the old assessment_report.yaml and calibration_memo.yaml
  3. Updates the LRA cycle_reference to the new cycle
  4. Appends a cycle_transition evolution log entry

Use --archive to automatically archive the previous cycle before starting the new one.

Examples:
  epf-cli aim init-cycle --cycle 2
  epf-cli aim init-cycle --cycle 3 --archive
  epf-cli aim init-cycle /path/to/instance --cycle 2 --updated-by "nikolai"`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimInitCycle,
}

func init() {
	aimCmd.AddCommand(aimInitCycleCmd)
	aimInitCycleCmd.Flags().IntVar(&initCycleNumber, "cycle", 0, "New cycle number (required)")
	aimInitCycleCmd.Flags().BoolVar(&initCycleArchive, "archive", false, "Archive the previous cycle before starting")
	aimInitCycleCmd.Flags().StringVar(&initCycleUpdatedBy, "updated-by", "epf-cli", "Attribution for the update")
	aimInitCycleCmd.Flags().BoolVar(&initCycleJSON, "json", false, "Output result as JSON")
	_ = aimInitCycleCmd.MarkFlagRequired("cycle")
}

func runAimInitCycle(cmd *cobra.Command, args []string) error {
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

	if initCycleNumber < 1 {
		return fmt.Errorf("--cycle must be a positive integer (got %d)", initCycleNumber)
	}

	// Initialize the new cycle
	if err := aim.InitCycle(instancePath, initCycleNumber, initCycleArchive, initCycleUpdatedBy); err != nil {
		return fmt.Errorf("failed to initialize cycle %d: %w", initCycleNumber, err)
	}

	// Output result
	result := map[string]interface{}{
		"success":         true,
		"instance_path":   instancePath,
		"new_cycle":       initCycleNumber,
		"archived":        initCycleArchive,
		"updated_by":      initCycleUpdatedBy,
		"cycle_reference": fmt.Sprintf("C%d", initCycleNumber),
		"message":         fmt.Sprintf("Cycle %d initialized successfully", initCycleNumber),
	}

	if initCycleJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Printf("Cycle %d initialized successfully.\n", initCycleNumber)
		fmt.Printf("  Cycle reference: C%d\n", initCycleNumber)
		if initCycleArchive {
			fmt.Printf("  Previous cycle archived: cycle-%d\n", initCycleNumber-1)
		}
		fmt.Println("  Old assessment report and calibration memo removed.")
		fmt.Println("  LRA updated with new cycle reference.")
	}

	return nil
}
