package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
)

var (
	recalibrateApply    bool
	recalibrateJSON     bool
	recalibrateNoSRC    bool
	recalibrateMemoOnly bool
)

// =============================================================================
// RECALIBRATE COMMAND
// =============================================================================

var aimRecalibrateCmd = &cobra.Command{
	Use:   "recalibrate [instance-path]",
	Short: "Generate a recalibration changeset from calibration memo and SRC",
	Long: `Generate a recalibration changeset that maps calibration decisions and SRC findings
to specific READY and FIRE artifact changes.

By default, this command reads both the calibration memo and SRC from the AIM directory.
If only one exists, it uses what's available (at least one is required).

The changeset identifies:
  - Which artifacts need changes (READY/FIRE files)
  - What kind of change (review, update, rewrite, archive, append)
  - Priority (critical, high, medium, low)
  - Source traceability (calibration memo field or SRC finding ID)
  - Content hints (guidance on what to change)

Modes:
  --dry-run (default)  Print the changeset report without making changes
  --apply              Apply auto-applicable changes (LRA updates) and log the event

Examples:
  epf-cli aim recalibrate                    # dry-run from current directory
  epf-cli aim recalibrate --apply            # apply LRA updates
  epf-cli aim recalibrate --no-src           # only use calibration memo
  epf-cli aim recalibrate /path/to/instance --json`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimRecalibrate,
}

func init() {
	aimCmd.AddCommand(aimRecalibrateCmd)
	aimRecalibrateCmd.Flags().BoolVar(&recalibrateApply, "apply", false, "Apply auto-applicable changes and log recalibration event")
	aimRecalibrateCmd.Flags().BoolVar(&recalibrateJSON, "json", false, "Output result as JSON")
	aimRecalibrateCmd.Flags().BoolVar(&recalibrateNoSRC, "no-src", false, "Only use calibration memo, skip SRC")
	aimRecalibrateCmd.Flags().BoolVar(&recalibrateMemoOnly, "memo-only", false, "Alias for --no-src")
}

func runAimRecalibrate(cmd *cobra.Command, args []string) error {
	var instancePath string
	var err error
	if len(args) > 0 {
		instancePath = args[0]
	} else {
		instancePath, err = GetInstancePath(nil)
		if err != nil {
			return fmt.Errorf("could not detect instance path: %w", err)
		}
	}

	// Load calibration memo
	var memo *aim.CalibrationMemo
	memo, err = aim.LoadCalibrationMemo(instancePath)
	if err != nil {
		memo = nil // Not fatal — SRC might exist
	}

	// Load SRC (unless --no-src or --memo-only)
	var src *aim.StrategicRealityCheck
	if !recalibrateNoSRC && !recalibrateMemoOnly {
		src, err = aim.LoadStrategicRealityCheck(instancePath)
		if err != nil {
			src = nil // Not fatal — memo might exist
		}
	}

	if memo == nil && src == nil {
		return fmt.Errorf("no calibration memo or SRC found in %s/AIM/. At least one is required.\nRun 'aim write-calibration' or 'aim generate-src' first", instancePath)
	}

	// Generate changeset
	changeset, err := aim.GenerateRecalibrationChangeset(instancePath, memo, src)
	if err != nil {
		return fmt.Errorf("failed to generate changeset: %w", err)
	}

	// Apply mode
	if recalibrateApply {
		if err := aim.ApplyRecalibration(instancePath, changeset, "epf-cli"); err != nil {
			return fmt.Errorf("failed to apply recalibration: %w", err)
		}
		if !recalibrateJSON {
			fmt.Fprintf(cmd.OutOrStdout(), "Recalibration applied. LRA evolution log updated.\n\n")
		}
	}

	// Output
	if recalibrateJSON {
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "  ")
		return enc.Encode(changeset)
	}

	report := aim.FormatChangesetReport(changeset)
	fmt.Fprint(cmd.OutOrStdout(), report)

	if !recalibrateApply && changeset.Summary.TotalChanges > 0 {
		fmt.Fprintf(cmd.OutOrStdout(), "\nRun with --apply to apply LRA updates and log the recalibration event.\n")
		fmt.Fprintf(cmd.OutOrStdout(), "Manual changes listed above should be reviewed and applied by a human or AI agent.\n")
	}

	return nil
}
