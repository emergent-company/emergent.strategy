package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
)

var (
	updateLRAPrimaryTrack     string
	updateLRASecondaryTrack   string
	updateLRAPrimaryObjective string
	updateLRACycleReference   string
	updateLRALifecycleStage   string
	updateLRATrigger          string
	updateLRASummary          string
	updateLRAUpdatedBy        string
	updateLRAJSON             bool
)

var aimUpdateLRACmd = &cobra.Command{
	Use:   "update-lra [instance-path]",
	Short: "Apply field-level updates to the Living Reality Assessment",
	Long: `Update the LRA with structured field-level changes and append an evolution log entry.

This command implements the "structured input, not freeform YAML" design pattern.
Instead of editing the LRA file directly, you provide specific field values to update.
An evolution log entry is automatically appended when --trigger and --summary are provided.

Updatable fields:
  --primary-track        Primary focus track (product|strategy|org_ops|commercial)
  --secondary-track      Secondary focus track
  --primary-objective    Current primary objective text
  --cycle-reference      Cycle reference (e.g., C1, C2)
  --lifecycle-stage      Lifecycle stage (bootstrap|maturing|evolved)

Evolution log (both required together):
  --trigger              What triggered this update (e.g., aim_signals, external_change)
  --summary              Brief summary of changes (max 200 chars)

Examples:
  epf-cli aim update-lra --primary-objective "Ship cloud server MVP" --trigger aim_signals --summary "Updated focus after Q1 assessment"
  epf-cli aim update-lra --lifecycle-stage maturing --trigger cycle_transition --summary "Completing first full cycle"
  epf-cli aim update-lra --cycle-reference C2 --trigger cycle_transition --summary "Starting cycle 2"`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimUpdateLRA,
}

func init() {
	aimCmd.AddCommand(aimUpdateLRACmd)
	aimUpdateLRACmd.Flags().StringVar(&updateLRAPrimaryTrack, "primary-track", "", "Primary focus track")
	aimUpdateLRACmd.Flags().StringVar(&updateLRASecondaryTrack, "secondary-track", "", "Secondary focus track")
	aimUpdateLRACmd.Flags().StringVar(&updateLRAPrimaryObjective, "primary-objective", "", "Primary objective text")
	aimUpdateLRACmd.Flags().StringVar(&updateLRACycleReference, "cycle-reference", "", "Cycle reference (e.g., C1, C2)")
	aimUpdateLRACmd.Flags().StringVar(&updateLRALifecycleStage, "lifecycle-stage", "", "Lifecycle stage (bootstrap|maturing|evolved)")
	aimUpdateLRACmd.Flags().StringVar(&updateLRATrigger, "trigger", "", "Evolution log trigger (required with --summary)")
	aimUpdateLRACmd.Flags().StringVar(&updateLRASummary, "summary", "", "Evolution log summary (required with --trigger)")
	aimUpdateLRACmd.Flags().StringVar(&updateLRAUpdatedBy, "updated-by", "epf-cli", "Attribution for the update")
	aimUpdateLRACmd.Flags().BoolVar(&updateLRAJSON, "json", false, "Output result as JSON")
}

func runAimUpdateLRA(cmd *cobra.Command, args []string) error {
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

	// Build the update from flags
	update := &aim.LRAUpdate{}
	hasUpdate := false

	if cmd.Flags().Changed("primary-track") {
		update.PrimaryTrack = &updateLRAPrimaryTrack
		hasUpdate = true
	}
	if cmd.Flags().Changed("secondary-track") {
		update.SecondaryTrack = &updateLRASecondaryTrack
		hasUpdate = true
	}
	if cmd.Flags().Changed("primary-objective") {
		update.PrimaryObjective = &updateLRAPrimaryObjective
		hasUpdate = true
	}
	if cmd.Flags().Changed("cycle-reference") {
		update.CycleReference = &updateLRACycleReference
		hasUpdate = true
	}
	if cmd.Flags().Changed("lifecycle-stage") {
		update.LifecycleStage = &updateLRALifecycleStage
		hasUpdate = true
	}

	// Evolution log entry
	if updateLRATrigger != "" || updateLRASummary != "" {
		if updateLRATrigger == "" || updateLRASummary == "" {
			return fmt.Errorf("both --trigger and --summary must be provided together for evolution log entry")
		}
		update.Trigger = updateLRATrigger
		update.Summary = updateLRASummary
		hasUpdate = true
	}

	if !hasUpdate {
		return fmt.Errorf("no updates specified; use flags like --primary-track, --primary-objective, --trigger/--summary")
	}

	// Apply the update
	if err := aim.ApplyLRAUpdate(instancePath, update, updateLRAUpdatedBy); err != nil {
		return fmt.Errorf("failed to update LRA: %w", err)
	}

	// Output result
	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"updated_by":    updateLRAUpdatedBy,
		"message":       "LRA updated successfully",
	}

	if updateLRAJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Println("LRA updated successfully.")
		if updateLRATrigger != "" {
			fmt.Printf("  Evolution log entry appended (trigger: %s)\n", updateLRATrigger)
		}
	}

	return nil
}
