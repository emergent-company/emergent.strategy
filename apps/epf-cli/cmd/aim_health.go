package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
)

var (
	aimHealthJSON bool
)

// =============================================================================
// HEALTH COMMAND
// =============================================================================

var aimHealthCmd = &cobra.Command{
	Use:   "health [instance-path]",
	Short: "Run AIM-specific health diagnostics",
	Long: `Run comprehensive AIM phase health diagnostics on an EPF instance.

Checks for:
  - LRA staleness (last updated >90 days, track signal dates >90 days)
  - Missing assessment reports (calibration without assessment)
  - Overdue trigger evaluation (calendar trigger past due)
  - Delivery drift (features delivered without maturity updates)
  - Evidence gaps (KRs without assessment outcomes)
  - SRC findings (surfaces critical/high priority recalibration actions)

This is complementary to 'epf-cli health' — it focuses specifically on the AIM
phase and provides actionable suggestions for each diagnostic.

Examples:
  epf-cli aim health
  epf-cli aim health /path/to/instance
  epf-cli aim health --json`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimHealth,
}

func init() {
	aimCmd.AddCommand(aimHealthCmd)
	aimHealthCmd.Flags().BoolVar(&aimHealthJSON, "json", false, "Output result as JSON")
}

func runAimHealth(cmd *cobra.Command, args []string) error {
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

	report, err := aim.RunHealthDiagnostics(instancePath)
	if err != nil {
		return fmt.Errorf("failed to run health diagnostics: %w", err)
	}

	if aimHealthJSON {
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	}

	formatted := aim.FormatHealthReport(report)
	fmt.Fprint(cmd.OutOrStdout(), formatted)

	return nil
}
