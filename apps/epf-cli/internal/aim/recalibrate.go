package aim

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// GenerateRecalibrationChangeset builds a changeset from the calibration memo
// and/or SRC. At least one must be provided.
func GenerateRecalibrationChangeset(instancePath string, memo *CalibrationMemo, src *StrategicRealityCheck) (*RecalibrationChangeset, error) {
	if memo == nil && src == nil {
		return nil, fmt.Errorf("at least one of calibration memo or SRC must be provided")
	}

	now := time.Now()
	cs := &RecalibrationChangeset{}
	cs.Meta.GeneratedAt = now.Format(time.RFC3339)
	cs.Meta.SourceMemo = memo != nil
	cs.Meta.SourceSRC = src != nil

	if memo != nil {
		cs.Meta.Cycle = memo.Cycle
		cs.Meta.Decision = memo.Decision
		cs.Meta.Confidence = memo.Confidence
	} else if src != nil {
		cs.Meta.Cycle = src.Cycle
		cs.Meta.Decision = "pending_assessment"
	}

	var changes []RecalibrationChange
	counter := 0

	// ── Phase A: Extract changes from calibration memo ──
	if memo != nil {
		memoChanges := extractMemoChanges(memo, &counter)
		changes = append(changes, memoChanges...)
	}

	// ── Phase B: Extract changes from SRC recalibration_plan ──
	if src != nil {
		srcChanges := extractSRCChanges(src, &counter)
		changes = append(changes, srcChanges...)
	}

	// ── Phase C: Deduplicate and merge ──
	changes = deduplicateChanges(changes)

	// ── Phase D: Sort by priority ──
	sortChangesByPriority(changes)

	cs.Changes = changes

	// ── Phase E: Build LRA update recommendations ──
	if memo != nil {
		cs.LRAUpdates = buildLRAUpdates(memo)
	}

	// ── Phase F: Calculate summary ──
	cs.Summary = calculateRecalibrationSummary(changes)

	return cs, nil
}

// extractMemoChanges maps calibration memo fields to artifact changes.
func extractMemoChanges(memo *CalibrationMemo, counter *int) []RecalibrationChange {
	var changes []RecalibrationChange

	// Decision-level changes
	switch memo.Decision {
	case "pivot":
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/04_strategy_formula.yaml",
			TargetSection:  "strategy_formula",
			Operation:      "rewrite",
			Priority:       "critical",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "decision",
			},
			ContentHint: fmt.Sprintf("Pivot decision: %s", memo.Reasoning),
		})
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/00_north_star.yaml",
			TargetSection:  "north_star.belief_challenges",
			Operation:      "review",
			Priority:       "critical",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "decision",
			},
			ContentHint: "Pivot decision requires reviewing North Star beliefs for continued validity.",
		})
	case "pull_the_plug":
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/00_north_star.yaml",
			TargetSection:  "north_star",
			Operation:      "rewrite",
			Priority:       "critical",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "decision",
			},
			ContentHint: fmt.Sprintf("Pull-the-plug decision: %s. All READY artifacts need fundamental revision.", memo.Reasoning),
		})
	}

	// NextReadyInputs → specific READY artifacts
	if memo.NextReadyInputs.OpportunityUpdate != "" {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/03_insight_opportunity.yaml",
			TargetSection:  "insight_opportunity",
			Operation:      "update",
			Priority:       "high",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "next_ready_inputs.opportunity_update",
			},
			ContentHint: memo.NextReadyInputs.OpportunityUpdate,
		})
	}

	if memo.NextReadyInputs.StrategyUpdate != "" {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/04_strategy_formula.yaml",
			TargetSection:  "strategy_formula",
			Operation:      "update",
			Priority:       "high",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "next_ready_inputs.strategy_update",
			},
			ContentHint: memo.NextReadyInputs.StrategyUpdate,
		})
	}

	// New assumptions → roadmap recipe
	for _, assumption := range memo.NextReadyInputs.NewAssumptions {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/05_roadmap_recipe.yaml",
			TargetSection:  "roadmap.tracks.*.riskiest_assumptions",
			Operation:      "append",
			Priority:       "high",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "next_ready_inputs.new_assumptions",
			},
			ContentHint: fmt.Sprintf("New assumption to add: %s", assumption),
		})
	}

	// Invalidated assumptions → roadmap recipe
	for _, assumption := range memo.Learnings.InvalidatedAssumptions {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/05_roadmap_recipe.yaml",
			TargetSection:  "roadmap.tracks.*.riskiest_assumptions",
			Operation:      "update",
			Priority:       "high",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "learnings.invalidated_assumptions",
			},
			ContentHint: fmt.Sprintf("Mark as invalidated and update risk assessment: %s", assumption),
		})
	}

	// Stop building → feature definitions
	for _, item := range memo.NextCycleFocus.StopBuilding {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "FIRE/feature_definitions/",
			TargetSection:  "feature_maturity.overall_stage",
			Operation:      "review",
			Priority:       "medium",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "next_cycle_focus.stop_building",
			},
			ContentHint: fmt.Sprintf("Deprioritize or archive feature: %s", item),
		})
	}

	// Start exploring → new features or roadmap items
	for _, item := range memo.NextCycleFocus.StartExploring {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "FIRE/feature_definitions/",
			TargetSection:  "",
			Operation:      "review",
			Priority:       "medium",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "next_cycle_focus.start_exploring",
			},
			ContentHint: fmt.Sprintf("Consider creating new feature definition for: %s", item),
		})
	}

	// Continue building → next cycle roadmap
	for _, item := range memo.NextCycleFocus.ContinueBuilding {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: "READY/05_roadmap_recipe.yaml",
			TargetSection:  "roadmap.tracks",
			Operation:      "review",
			Priority:       "low",
			AutoApplicable: false,
			Source: ChangeSource{
				Type:  "calibration_memo",
				Field: "next_cycle_focus.continue_building",
			},
			ContentHint: fmt.Sprintf("Carry into next cycle with updated KRs: %s", item),
		})
	}

	return changes
}

// extractSRCChanges maps SRC recalibration_plan actions to changeset entries.
func extractSRCChanges(src *StrategicRealityCheck, counter *int) []RecalibrationChange {
	var changes []RecalibrationChange

	for _, action := range src.RecalibrationPlan {
		*counter++
		changes = append(changes, RecalibrationChange{
			ID:             fmt.Sprintf("rc-%03d", *counter),
			TargetArtifact: action.TargetArtifact,
			TargetSection:  action.TargetSection,
			Operation:      action.Action,
			Priority:       action.Priority,
			AutoApplicable: false, // SRC actions always need human/AI review
			Source: ChangeSource{
				Type:      "src",
				FindingID: action.ID,
			},
			ContentHint:    action.Rationale,
			EffortEstimate: action.EffortEstimate,
		})
	}

	return changes
}

// deduplicateChanges merges changes that target the same artifact+section.
// When a calibration memo change and SRC change overlap, they're merged with
// the higher priority kept and the source marked as "merged".
func deduplicateChanges(changes []RecalibrationChange) []RecalibrationChange {
	type key struct {
		artifact string
		section  string
	}

	seen := make(map[key]int) // key → index in result
	var result []RecalibrationChange

	for _, change := range changes {
		k := key{artifact: change.TargetArtifact, section: change.TargetSection}
		if idx, exists := seen[k]; exists {
			existing := result[idx]
			// Keep the higher priority (lower ordinal)
			if priorityOrd(change.Priority) < priorityOrd(existing.Priority) {
				result[idx].Priority = change.Priority
			}
			// Keep the stronger operation
			if operationStrength(change.Operation) > operationStrength(existing.Operation) {
				result[idx].Operation = change.Operation
			}
			// Merge source
			result[idx].Source.Type = "merged"
			if change.Source.FindingID != "" && result[idx].Source.FindingID == "" {
				result[idx].Source.FindingID = change.Source.FindingID
			}
			if change.Source.Field != "" && result[idx].Source.Field == "" {
				result[idx].Source.Field = change.Source.Field
			}
			// Append content hint
			if change.ContentHint != "" {
				if result[idx].ContentHint != "" {
					result[idx].ContentHint += " | " + change.ContentHint
				} else {
					result[idx].ContentHint = change.ContentHint
				}
			}
		} else {
			seen[k] = len(result)
			result = append(result, change)
		}
	}

	return result
}

// sortChangesByPriority sorts changes by priority (critical first) then by operation strength.
func sortChangesByPriority(changes []RecalibrationChange) {
	sort.SliceStable(changes, func(i, j int) bool {
		pi := priorityOrd(changes[i].Priority)
		pj := priorityOrd(changes[j].Priority)
		if pi != pj {
			return pi < pj
		}
		return operationStrength(changes[i].Operation) > operationStrength(changes[j].Operation)
	})
}

func priorityOrd(p string) int {
	if v, ok := priorityOrder[p]; ok {
		return v
	}
	return 99
}

func operationStrength(op string) int {
	switch op {
	case "rewrite":
		return 4
	case "archive":
		return 3
	case "update":
		return 2
	case "append":
		return 1
	case "review":
		return 0
	default:
		return -1
	}
}

// buildLRAUpdates derives LRA changes from the calibration memo decision.
func buildLRAUpdates(memo *CalibrationMemo) *LRARecalibrationUpdate {
	update := &LRARecalibrationUpdate{}
	hasUpdates := false

	// If there are next steps mentioning focus areas, derive primary objective
	if len(memo.NextSteps) > 0 {
		objective := strings.Join(memo.NextSteps, "; ")
		if len(objective) > 200 {
			objective = objective[:197] + "..."
		}
		update.PrimaryObjective = &objective
		hasUpdates = true
	}

	// Decision-based lifecycle stage changes
	switch memo.Decision {
	case "pivot":
		stage := "bootstrap"
		update.LifecycleStage = &stage
		hasUpdates = true
	case "pull_the_plug":
		stage := "bootstrap"
		update.LifecycleStage = &stage
		hasUpdates = true
	}

	if !hasUpdates {
		return nil
	}
	return update
}

// calculateRecalibrationSummary computes aggregate stats for the changeset.
func calculateRecalibrationSummary(changes []RecalibrationChange) RecalibrationSummary {
	s := RecalibrationSummary{
		TotalChanges: len(changes),
	}

	artifactSet := make(map[string]bool)
	for _, c := range changes {
		switch c.Priority {
		case "critical":
			s.CriticalChanges++
		case "high":
			s.HighChanges++
		case "medium":
			s.MediumChanges++
		case "low":
			s.LowChanges++
		}
		if c.AutoApplicable {
			s.AutoApplicable++
		} else {
			s.ManualReview++
		}
		switch c.Source.Type {
		case "calibration_memo":
			s.FromCalibMemo++
		case "src":
			s.FromSRC++
		case "merged":
			s.FromCalibMemo++
			s.FromSRC++
		}
		artifactSet[c.TargetArtifact] = true
	}
	s.AffectedArtifacts = len(artifactSet)

	return s
}

// ApplyRecalibration applies the auto-applicable changes from a changeset
// and records the recalibration in the LRA evolution log.
func ApplyRecalibration(instancePath string, changeset *RecalibrationChangeset, updatedBy string) error {
	// Apply LRA updates if present
	if changeset.LRAUpdates != nil {
		update := &LRAUpdate{
			PrimaryObjective: changeset.LRAUpdates.PrimaryObjective,
			LifecycleStage:   changeset.LRAUpdates.LifecycleStage,
			PrimaryTrack:     changeset.LRAUpdates.PrimaryTrack,
			SecondaryTrack:   changeset.LRAUpdates.SecondaryTrack,
			Trigger:          "cycle_transition",
			Summary:          fmt.Sprintf("Recalibration applied (decision: %s, cycle: %d): %d changes identified, %d auto-applied", changeset.Meta.Decision, changeset.Meta.Cycle, changeset.Summary.TotalChanges, changeset.Summary.AutoApplicable),
		}

		if err := ApplyLRAUpdate(instancePath, update, updatedBy); err != nil {
			return fmt.Errorf("failed to apply LRA updates: %w", err)
		}
	} else {
		// Even without LRA field changes, log the recalibration event
		update := &LRAUpdate{
			Trigger: "cycle_transition",
			Summary: fmt.Sprintf("Recalibration reviewed (decision: %s, cycle: %d): %d changes identified for manual review", changeset.Meta.Decision, changeset.Meta.Cycle, changeset.Summary.TotalChanges),
		}
		if err := ApplyLRAUpdate(instancePath, update, updatedBy); err != nil {
			return fmt.Errorf("failed to log recalibration event: %w", err)
		}
	}

	return nil
}

// FormatChangesetReport generates a human-readable report from the changeset.
func FormatChangesetReport(cs *RecalibrationChangeset) string {
	var sb strings.Builder

	sb.WriteString("# Recalibration Changeset\n\n")
	sb.WriteString(fmt.Sprintf("Generated: %s\n", cs.Meta.GeneratedAt))
	sb.WriteString(fmt.Sprintf("Cycle: %d\n", cs.Meta.Cycle))
	sb.WriteString(fmt.Sprintf("Decision: %s\n", cs.Meta.Decision))
	if cs.Meta.Confidence != "" {
		sb.WriteString(fmt.Sprintf("Confidence: %s\n", cs.Meta.Confidence))
	}
	sb.WriteString(fmt.Sprintf("Sources: memo=%v, src=%v\n\n", cs.Meta.SourceMemo, cs.Meta.SourceSRC))

	// Summary
	sb.WriteString("## Summary\n\n")
	sb.WriteString(fmt.Sprintf("Total changes: %d\n", cs.Summary.TotalChanges))
	sb.WriteString(fmt.Sprintf("  Critical: %d | High: %d | Medium: %d | Low: %d\n",
		cs.Summary.CriticalChanges, cs.Summary.HighChanges, cs.Summary.MediumChanges, cs.Summary.LowChanges))
	sb.WriteString(fmt.Sprintf("  Auto-applicable: %d | Manual review: %d\n",
		cs.Summary.AutoApplicable, cs.Summary.ManualReview))
	sb.WriteString(fmt.Sprintf("  Affected artifacts: %d\n\n", cs.Summary.AffectedArtifacts))

	// Changes grouped by priority
	if len(cs.Changes) > 0 {
		sb.WriteString("## Changes\n\n")
		for _, c := range cs.Changes {
			icon := priorityIcon(c.Priority)
			sb.WriteString(fmt.Sprintf("%s [%s] %s → %s\n", icon, c.ID, c.TargetArtifact, c.Operation))
			if c.TargetSection != "" {
				sb.WriteString(fmt.Sprintf("   Section: %s\n", c.TargetSection))
			}
			sb.WriteString(fmt.Sprintf("   Source: %s", c.Source.Type))
			if c.Source.Field != "" {
				sb.WriteString(fmt.Sprintf(" (%s)", c.Source.Field))
			}
			if c.Source.FindingID != "" {
				sb.WriteString(fmt.Sprintf(" [%s]", c.Source.FindingID))
			}
			sb.WriteString("\n")
			if c.ContentHint != "" {
				hint := c.ContentHint
				if len(hint) > 120 {
					hint = hint[:117] + "..."
				}
				sb.WriteString(fmt.Sprintf("   Hint: %s\n", hint))
			}
			if c.EffortEstimate != "" {
				sb.WriteString(fmt.Sprintf("   Effort: %s\n", c.EffortEstimate))
			}
			sb.WriteString("\n")
		}
	}

	// LRA updates
	if cs.LRAUpdates != nil {
		sb.WriteString("## LRA Updates (auto-applicable)\n\n")
		if cs.LRAUpdates.PrimaryObjective != nil {
			sb.WriteString(fmt.Sprintf("  Primary Objective → %s\n", *cs.LRAUpdates.PrimaryObjective))
		}
		if cs.LRAUpdates.LifecycleStage != nil {
			sb.WriteString(fmt.Sprintf("  Lifecycle Stage → %s\n", *cs.LRAUpdates.LifecycleStage))
		}
		if cs.LRAUpdates.PrimaryTrack != nil {
			sb.WriteString(fmt.Sprintf("  Primary Track → %s\n", *cs.LRAUpdates.PrimaryTrack))
		}
		if cs.LRAUpdates.SecondaryTrack != nil {
			sb.WriteString(fmt.Sprintf("  Secondary Track → %s\n", *cs.LRAUpdates.SecondaryTrack))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func priorityIcon(p string) string {
	switch p {
	case "critical":
		return "!!!"
	case "high":
		return " !!"
	case "medium":
		return "  !"
	case "low":
		return "  ."
	default:
		return "  ?"
	}
}
