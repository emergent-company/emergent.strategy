package aim

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lra"
	"gopkg.in/yaml.v3"
)

// WriteAssessmentReport writes an assessment report to the AIM directory.
func WriteAssessmentReport(instancePath string, report *AssessmentReport) (string, error) {
	path := filepath.Join(instancePath, "AIM", "assessment_report.yaml")
	return writeYAML(path, report)
}

// WriteCalibrationMemo writes a calibration memo to the AIM directory.
func WriteCalibrationMemo(instancePath string, memo *CalibrationMemo) (string, error) {
	path := filepath.Join(instancePath, "AIM", "calibration_memo.yaml")
	return writeYAML(path, memo)
}

// UpdateLRA applies field-level updates to the LRA and appends an evolution log entry.
// This implements the "structured input, not freeform YAML" design decision.
type LRAUpdate struct {
	// Which fields to update (nil means skip)
	PrimaryTrack     *string
	SecondaryTrack   *string
	PrimaryObjective *string
	CycleReference   *string
	LifecycleStage   *string

	// Track baseline updates (keyed by track name)
	TrackUpdates map[string]*TrackBaselineUpdate

	// Evolution log entry (always appended)
	Trigger string
	Summary string
	Changes []lra.ChangeDetail
}

// TrackBaselineUpdate holds partial updates for a track baseline.
type TrackBaselineUpdate struct {
	Maturity      *string
	Status        *string
	Description   *string
	KeyActivities []string // replaces whole list if non-nil
	PainPoints    []string
	Strengths     []string
}

// ApplyLRAUpdate loads the current LRA, applies the update, and saves it.
func ApplyLRAUpdate(instancePath string, update *LRAUpdate, updatedBy string) error {
	currentLRA, err := lra.LoadOrError(instancePath)
	if err != nil {
		return err
	}

	now := time.Now()

	// Apply current_focus updates
	if update.PrimaryTrack != nil {
		currentLRA.CurrentFocus.PrimaryTrack = *update.PrimaryTrack
	}
	if update.SecondaryTrack != nil {
		currentLRA.CurrentFocus.SecondaryTrack = *update.SecondaryTrack
	}
	if update.PrimaryObjective != nil {
		currentLRA.CurrentFocus.PrimaryObjective = *update.PrimaryObjective
	}
	if update.CycleReference != nil {
		currentLRA.CurrentFocus.CycleReference = *update.CycleReference
	}

	// Apply metadata updates
	if update.LifecycleStage != nil {
		currentLRA.Metadata.LifecycleStage = *update.LifecycleStage
	}

	// Apply track baseline updates
	for trackName, trackUpdate := range update.TrackUpdates {
		baseline, exists := currentLRA.TrackBaselines[trackName]
		if !exists {
			baseline = lra.TrackBaseline{}
		}

		if trackUpdate.Maturity != nil {
			baseline.Maturity = *trackUpdate.Maturity
		}
		if trackUpdate.Status != nil {
			baseline.Status = *trackUpdate.Status
		}
		if trackUpdate.Description != nil {
			baseline.Description = *trackUpdate.Description
		}
		if trackUpdate.KeyActivities != nil {
			baseline.KeyActivities = trackUpdate.KeyActivities
		}
		if trackUpdate.PainPoints != nil {
			baseline.PainPoints = trackUpdate.PainPoints
		}
		if trackUpdate.Strengths != nil {
			baseline.Strengths = trackUpdate.Strengths
		}

		currentLRA.TrackBaselines[trackName] = baseline
	}

	// Update metadata timestamps
	currentLRA.Metadata.LastUpdated = &now
	currentLRA.Metadata.LastUpdatedBy = updatedBy

	// Append evolution log entry
	if update.Trigger != "" && update.Summary != "" {
		entry := lra.EvolutionEntry{
			CycleReference: currentLRA.CurrentFocus.CycleReference,
			Timestamp:      &now,
			UpdatedBy:      updatedBy,
			Trigger:        update.Trigger,
			Summary:        update.Summary,
			Changes:        update.Changes,
		}
		currentLRA.EvolutionLog = append(currentLRA.EvolutionLog, entry)
	}

	// Save
	path := lra.GetLRAPath(instancePath)
	return lra.SaveLRA(path, currentLRA)
}

// ArchiveCycle copies current AIM artifacts to cycles/cycle-N/.
func ArchiveCycle(instancePath string, cycleNumber int) (string, error) {
	aimDir := filepath.Join(instancePath, "AIM")
	archiveDir := filepath.Join(aimDir, "cycles", fmt.Sprintf("cycle-%d", cycleNumber))

	if err := os.MkdirAll(archiveDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create archive directory: %w", err)
	}

	// Files to archive
	artifacts := []string{
		"assessment_report.yaml",
		"calibration_memo.yaml",
		"living_reality_assessment.yaml", // LRA snapshot at cycle end
	}

	archived := 0
	for _, artifact := range artifacts {
		src := filepath.Join(aimDir, artifact)
		if _, err := os.Stat(src); os.IsNotExist(err) {
			continue // skip missing files
		}

		data, err := os.ReadFile(src)
		if err != nil {
			continue
		}

		dst := filepath.Join(archiveDir, artifact)
		if err := os.WriteFile(dst, data, 0644); err != nil {
			return "", fmt.Errorf("failed to archive %s: %w", artifact, err)
		}
		archived++
	}

	if archived == 0 {
		return "", fmt.Errorf("no AIM artifacts found to archive")
	}

	return archiveDir, nil
}

// InitCycle bootstraps a new cycle by:
// 1. Archiving the previous cycle (if archive=true)
// 2. Removing the old assessment_report and calibration_memo
// 3. Incrementing the cycle counter in the LRA
func InitCycle(instancePath string, newCycleNumber int, archivePrevious bool, updatedBy string) error {
	if archivePrevious {
		prevCycle := newCycleNumber - 1
		if prevCycle > 0 {
			if _, err := ArchiveCycle(instancePath, prevCycle); err != nil {
				// Don't fail — archive is best-effort
				fmt.Fprintf(os.Stderr, "Warning: failed to archive cycle %d: %v\n", prevCycle, err)
			}
		}
	}

	// Remove old assessment and calibration (they belong to the previous cycle)
	aimDir := filepath.Join(instancePath, "AIM")
	for _, f := range []string{"assessment_report.yaml", "calibration_memo.yaml"} {
		path := filepath.Join(aimDir, f)
		if _, err := os.Stat(path); err == nil {
			os.Remove(path) // best-effort
		}
	}

	// Update LRA
	cycleRef := fmt.Sprintf("C%d", newCycleNumber)
	stage := "maturing"
	update := &LRAUpdate{
		CycleReference: &cycleRef,
		LifecycleStage: &stage,
		Trigger:        "cycle_transition",
		Summary:        fmt.Sprintf("Initialized cycle %d", newCycleNumber),
		Changes: []lra.ChangeDetail{
			{
				Section:    "current_focus",
				Field:      "cycle_reference",
				ChangeType: "updated",
				NewValue:   cycleRef,
				Reason:     fmt.Sprintf("Starting cycle %d", newCycleNumber),
			},
		},
	}

	return ApplyLRAUpdate(instancePath, update, updatedBy)
}

// writeYAML marshals data to YAML and writes it to a file.
func writeYAML(path string, data interface{}) (string, error) {
	yamlData, err := yaml.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("failed to marshal YAML: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	if err := os.WriteFile(path, yamlData, 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	return path, nil
}
