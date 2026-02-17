package aim

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// RunHealthDiagnostics performs AIM-specific health checks on an EPF instance.
// It checks for staleness, missing artifacts, relationship drift, and surfaces
// SRC findings when available.
func RunHealthDiagnostics(instancePath string) (*HealthReport, error) {
	now := time.Now()
	report := &HealthReport{
		GeneratedAt:  now.Format(time.RFC3339),
		InstancePath: instancePath,
	}

	var diagnostics []HealthDiagnostic

	// Check 1: LRA existence and staleness
	lraDiags := checkLRAStaleness(instancePath, now)
	diagnostics = append(diagnostics, lraDiags...)

	// Check 2: Missing assessment for completed cycle
	assessDiags := checkMissingAssessment(instancePath)
	diagnostics = append(diagnostics, assessDiags...)

	// Check 3: Overdue trigger evaluation
	triggerDiags := checkOverdueTriggers(instancePath, now)
	diagnostics = append(diagnostics, triggerDiags...)

	// Check 4: Delivery drift — features delivered without maturity updates
	deliveryDiags := checkDeliveryDrift(instancePath)
	diagnostics = append(diagnostics, deliveryDiags...)

	// Check 5: Evidence gaps — KRs completed without assessment evidence
	evidenceDiags := checkEvidenceGaps(instancePath)
	diagnostics = append(diagnostics, evidenceDiags...)

	// Check 6: Surface SRC findings summary if available
	srcDiags := surfaceSRCFindings(instancePath)
	diagnostics = append(diagnostics, srcDiags...)

	report.Diagnostics = diagnostics
	report.Summary = calculateHealthSummary(diagnostics)
	report.OverallStatus = deriveOverallStatus(report.Summary)

	return report, nil
}

// checkLRAStaleness checks if the LRA exists and if its signals are recent.
func checkLRAStaleness(instancePath string, now time.Time) []HealthDiagnostic {
	var diags []HealthDiagnostic

	lraPath := filepath.Join(instancePath, "AIM", "living_reality_assessment.yaml")
	data, err := os.ReadFile(lraPath)
	if err != nil {
		diags = append(diags, HealthDiagnostic{
			ID:          "aim-lra-missing",
			Category:    "lra_staleness",
			Severity:    "critical",
			Title:       "Living Reality Assessment missing",
			Description: "No LRA found. Run 'aim bootstrap' to create one.",
			Artifact:    "AIM/living_reality_assessment.yaml",
			Suggestion:  "Run: epf-cli aim bootstrap",
		})
		return diags
	}

	// Parse LRA to check last_updated
	var lra map[string]interface{}
	if err := yaml.Unmarshal(data, &lra); err != nil {
		diags = append(diags, HealthDiagnostic{
			ID:          "aim-lra-corrupt",
			Category:    "lra_staleness",
			Severity:    "critical",
			Title:       "Living Reality Assessment is corrupt",
			Description: fmt.Sprintf("Failed to parse LRA: %s", err),
			Artifact:    "AIM/living_reality_assessment.yaml",
			Suggestion:  "Fix YAML syntax errors or recreate with 'aim bootstrap --force'",
		})
		return diags
	}

	// Check metadata.last_updated
	if meta, ok := lra["metadata"].(map[string]interface{}); ok {
		lastUpdatedStr := extractDateString(meta["last_updated"])
		if lastUpdatedStr != "" {
			parsed, err := time.Parse("2006-01-02", lastUpdatedStr)
			if err != nil {
				// Try RFC3339
				parsed, err = time.Parse(time.RFC3339, lastUpdatedStr)
			}
			if err == nil {
				daysSince := int(now.Sub(parsed).Hours() / 24)
				if daysSince > 90 {
					diags = append(diags, HealthDiagnostic{
						ID:          "aim-lra-stale",
						Category:    "lra_staleness",
						Severity:    "warning",
						Title:       "Living Reality Assessment is stale",
						Description: fmt.Sprintf("LRA was last updated %d days ago (threshold: 90 days).", daysSince),
						Artifact:    "AIM/living_reality_assessment.yaml",
						FieldPath:   "metadata.last_updated",
						Suggestion:  "Run: epf-cli aim update-lra to refresh track baselines and focus",
					})
				}
			}
		}
	}

	// Check track baseline signal dates
	if baselines, ok := lra["track_baselines"].(map[string]interface{}); ok {
		for trackName, trackData := range baselines {
			if track, ok := trackData.(map[string]interface{}); ok {
				checkTrackSignalDate(trackName, track, now, &diags)
			}
		}
	}

	return diags
}

// checkTrackSignalDate checks if a track's last signal date is stale.
func checkTrackSignalDate(trackName string, track map[string]interface{}, now time.Time, diags *[]HealthDiagnostic) {
	dateStr := extractDateString(track["last_signal_date"])
	if dateStr == "" {
		dateStr = extractDateString(track["signal_date"])
	}

	if dateStr == "" {
		return
	}

	parsed, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return
	}

	daysSince := int(now.Sub(parsed).Hours() / 24)
	if daysSince > 90 {
		*diags = append(*diags, HealthDiagnostic{
			ID:          fmt.Sprintf("aim-track-stale-%s", trackName),
			Category:    "lra_staleness",
			Severity:    "warning",
			Title:       fmt.Sprintf("%s track signal is stale", trackName),
			Description: fmt.Sprintf("Last signal date for %s track was %d days ago.", trackName, daysSince),
			Artifact:    "AIM/living_reality_assessment.yaml",
			FieldPath:   fmt.Sprintf("track_baselines.%s.last_signal_date", trackName),
			Suggestion:  fmt.Sprintf("Update %s track baseline with current signals", trackName),
		})
	}
}

// checkMissingAssessment checks if a calibration memo exists without a corresponding assessment.
func checkMissingAssessment(instancePath string) []HealthDiagnostic {
	var diags []HealthDiagnostic

	// Check if calibration memo exists
	calibPath := filepath.Join(instancePath, "AIM", "calibration_memo.yaml")
	if _, err := os.Stat(calibPath); err == nil {
		// Calibration exists — check if assessment also exists
		assessPath := filepath.Join(instancePath, "AIM", "assessment_report.yaml")
		if _, err := os.Stat(assessPath); os.IsNotExist(err) {
			diags = append(diags, HealthDiagnostic{
				ID:          "aim-missing-assessment",
				Category:    "missing_assessment",
				Severity:    "warning",
				Title:       "Calibration memo exists without assessment report",
				Description: "A calibration memo was written but no assessment report exists. Calibration decisions should be based on assessment evidence.",
				Artifact:    "AIM/assessment_report.yaml",
				Suggestion:  "Run: epf-cli aim assess to generate an assessment report template",
			})
		}
	}

	// Check if roadmap exists but no AIM artifacts at all
	roadmapPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	if _, err := os.Stat(roadmapPath); err == nil {
		aimDir := filepath.Join(instancePath, "AIM")
		if _, err := os.Stat(aimDir); os.IsNotExist(err) {
			diags = append(diags, HealthDiagnostic{
				ID:          "aim-no-aim-dir",
				Category:    "missing_assessment",
				Severity:    "warning",
				Title:       "Roadmap exists but no AIM directory",
				Description: "A roadmap recipe exists but the AIM directory is missing. Start the AIM phase to evaluate execution.",
				Artifact:    "AIM/",
				Suggestion:  "Run: epf-cli aim bootstrap to initialize AIM",
			})
		}
	}

	return diags
}

// checkOverdueTriggers checks if trigger evaluation is overdue.
func checkOverdueTriggers(instancePath string, now time.Time) []HealthDiagnostic {
	var diags []HealthDiagnostic

	triggerPath := filepath.Join(instancePath, "AIM", "aim_trigger_config.yaml")
	data, err := os.ReadFile(triggerPath)
	if err != nil {
		return diags // No trigger config → not an error
	}

	var config map[string]interface{}
	if err := yaml.Unmarshal(data, &config); err != nil {
		return diags
	}

	// Check calendar trigger
	if calendar, ok := config["calendar_trigger"].(map[string]interface{}); ok {
		if nextDate, ok := calendar["next_scheduled"].(string); ok {
			parsed, err := time.Parse("2006-01-02", nextDate)
			if err == nil && now.After(parsed) {
				daysPast := int(now.Sub(parsed).Hours() / 24)
				diags = append(diags, HealthDiagnostic{
					ID:          "aim-trigger-overdue",
					Category:    "overdue_trigger",
					Severity:    "warning",
					Title:       "Scheduled AIM trigger is overdue",
					Description: fmt.Sprintf("Calendar trigger was scheduled for %s (%d days ago).", nextDate, daysPast),
					Artifact:    "AIM/aim_trigger_config.yaml",
					FieldPath:   "calendar_trigger.next_scheduled",
					Suggestion:  "Run an AIM session: generate-src, write assessment, write calibration",
				})
			}
		}
	}

	return diags
}

// checkDeliveryDrift checks for features marked as delivered without capability maturity updates.
func checkDeliveryDrift(instancePath string) []HealthDiagnostic {
	var diags []HealthDiagnostic

	fdDir := filepath.Join(instancePath, "FIRE", "feature_definitions")
	entries, err := os.ReadDir(fdDir)
	if err != nil {
		return diags
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(fdDir, entry.Name()))
		if err != nil {
			continue
		}

		var fd map[string]interface{}
		if err := yaml.Unmarshal(data, &fd); err != nil {
			continue
		}

		// Check if status is "delivered" or "in-progress"
		status, _ := fd["status"].(string)
		if status != "delivered" && status != "in-progress" {
			continue
		}

		// Check feature_maturity.overall_stage
		if maturity, ok := fd["feature_maturity"].(map[string]interface{}); ok {
			stage, _ := maturity["overall_stage"].(string)
			if status == "delivered" && (stage == "hypothetical" || stage == "") {
				diags = append(diags, HealthDiagnostic{
					ID:          fmt.Sprintf("aim-drift-%s", strings.TrimSuffix(entry.Name(), ".yaml")),
					Category:    "delivery_drift",
					Severity:    "warning",
					Title:       fmt.Sprintf("Feature %s delivered but maturity is '%s'", extractFDID(entry.Name()), stage),
					Description: fmt.Sprintf("Feature status is 'delivered' but feature_maturity.overall_stage is still '%s'. Update maturity to reflect actual state.", stage),
					Artifact:    filepath.Join("FIRE/feature_definitions", entry.Name()),
					FieldPath:   "feature_maturity.overall_stage",
					Suggestion:  "Update feature maturity using: epf_update_capability_maturity",
				})
			}
		}
	}

	return diags
}

// checkEvidenceGaps checks for KRs completed without assessment evidence.
func checkEvidenceGaps(instancePath string) []HealthDiagnostic {
	var diags []HealthDiagnostic

	// Load roadmap
	roadmap, err := LoadRoadmap(instancePath)
	if err != nil {
		return diags
	}

	// Load assessment reports
	reports, err := LoadAssessmentReports(instancePath)
	if err != nil {
		return diags // No reports = can't check evidence
	}

	// Build set of KR IDs that have evidence
	evidencedKRs := make(map[string]bool)
	for _, report := range reports {
		for _, okr := range report.OKRAssessments {
			for _, kr := range okr.KeyResultOutcomes {
				if kr.Status != "" && kr.Status != "TODO" {
					evidencedKRs[kr.KRID] = true
				}
			}
		}
	}

	// Check all KRs from roadmap
	for trackName, track := range GetAllTracks(roadmap) {
		for _, okr := range track.OKRs {
			for _, kr := range okr.KeyResults {
				if !evidencedKRs[kr.ID] {
					diags = append(diags, HealthDiagnostic{
						ID:          fmt.Sprintf("aim-evidence-gap-%s", kr.ID),
						Category:    "evidence_gap",
						Severity:    "info",
						Title:       fmt.Sprintf("KR %s lacks assessment evidence", kr.ID),
						Description: fmt.Sprintf("Key result '%s' (%s track) has no evidence in the assessment report.", kr.Description, trackName),
						Artifact:    "AIM/assessment_report.yaml",
						FieldPath:   fmt.Sprintf("okr_assessments[okr_id=%s].key_result_outcomes[kr_id=%s]", okr.ID, kr.ID),
						Suggestion:  "Fill in the assessment report with actual outcomes for this KR",
					})
				}
			}
		}
	}

	return diags
}

// surfaceSRCFindings adds diagnostics from the SRC if one exists.
func surfaceSRCFindings(instancePath string) []HealthDiagnostic {
	var diags []HealthDiagnostic

	src, err := LoadStrategicRealityCheck(instancePath)
	if err != nil {
		return diags // No SRC → not an error
	}

	// Surface the overall health status
	if src.Summary.OverallHealth == "critical" || src.Summary.OverallHealth == "at_risk" {
		diags = append(diags, HealthDiagnostic{
			ID:          "aim-src-health",
			Category:    "src_findings",
			Severity:    severityFromHealth(src.Summary.OverallHealth),
			Title:       fmt.Sprintf("Strategic Reality Check: %s", src.Summary.OverallHealth),
			Description: fmt.Sprintf("SRC overall health is '%s'. %d findings across 5 categories.", src.Summary.OverallHealth, countFindings(src)),
			Artifact:    "AIM/strategic_reality_check.yaml",
			Suggestion:  "Review SRC findings and run: epf-cli aim recalibrate",
		})
	}

	// Surface critical/high priority recalibration actions
	for _, action := range src.RecalibrationPlan {
		if action.Priority == "critical" {
			diags = append(diags, HealthDiagnostic{
				ID:          fmt.Sprintf("aim-src-%s", action.ID),
				Category:    "src_findings",
				Severity:    "warning",
				Title:       fmt.Sprintf("SRC: %s %s → %s", action.Action, action.TargetArtifact, action.TargetSection),
				Description: action.Rationale,
				Artifact:    action.TargetArtifact,
				FieldPath:   action.TargetSection,
				Suggestion:  fmt.Sprintf("Action: %s (effort: %s)", action.Action, action.EffortEstimate),
			})
		}
	}

	return diags
}

func severityFromHealth(health string) string {
	switch health {
	case "critical":
		return "critical"
	case "at_risk":
		return "warning"
	default:
		return "info"
	}
}

func countFindings(src *StrategicRealityCheck) int {
	return len(src.BeliefValidity) + len(src.MarketCurrency) +
		len(src.StrategicAlignment) + len(src.ExecutionReality)
}

// extractDateString handles YAML values that may be string or time.Time.
// go-yaml parses unquoted dates like 2025-10-17 as time.Time.
func extractDateString(val interface{}) string {
	if s, ok := val.(string); ok {
		return s
	}
	if t, ok := val.(time.Time); ok {
		return t.Format("2006-01-02")
	}
	return ""
}

func extractFDID(filename string) string {
	// "fd-001_knowledge_graph_engine.yaml" → "fd-001"
	parts := strings.SplitN(filename, "_", 2)
	if len(parts) > 0 {
		return parts[0]
	}
	return filename
}

// calculateHealthSummary computes aggregate counts.
func calculateHealthSummary(diags []HealthDiagnostic) HealthSummary {
	s := HealthSummary{Total: len(diags)}
	for _, d := range diags {
		switch d.Severity {
		case "critical":
			s.Critical++
		case "warning":
			s.Warning++
		case "info":
			s.Info++
		}
	}
	return s
}

// deriveOverallStatus converts summary counts into an overall status.
func deriveOverallStatus(s HealthSummary) string {
	if s.Critical > 0 {
		return "critical"
	}
	if s.Warning > 2 {
		return "at_risk"
	}
	if s.Warning > 0 {
		return "attention_needed"
	}
	return "healthy"
}

// FormatHealthReport generates a human-readable report from health diagnostics.
func FormatHealthReport(report *HealthReport) string {
	var sb strings.Builder

	sb.WriteString("# AIM Health Diagnostics\n\n")
	sb.WriteString(fmt.Sprintf("Instance: %s\n", report.InstancePath))
	sb.WriteString(fmt.Sprintf("Status: %s\n", report.OverallStatus))
	sb.WriteString(fmt.Sprintf("Generated: %s\n\n", report.GeneratedAt))

	sb.WriteString(fmt.Sprintf("Total: %d (Critical: %d, Warning: %d, Info: %d)\n\n",
		report.Summary.Total, report.Summary.Critical, report.Summary.Warning, report.Summary.Info))

	if len(report.Diagnostics) == 0 {
		sb.WriteString("No issues found.\n")
		return sb.String()
	}

	// Group by severity
	for _, severity := range []string{"critical", "warning", "info"} {
		var items []HealthDiagnostic
		for _, d := range report.Diagnostics {
			if d.Severity == severity {
				items = append(items, d)
			}
		}
		if len(items) == 0 {
			continue
		}

		icon := severityIcon(severity)
		sb.WriteString(fmt.Sprintf("## %s %s (%d)\n\n", icon, strings.ToUpper(severity), len(items)))
		for _, d := range items {
			sb.WriteString(fmt.Sprintf("- **%s** [%s]\n", d.Title, d.ID))
			sb.WriteString(fmt.Sprintf("  %s\n", d.Description))
			if d.Suggestion != "" {
				sb.WriteString(fmt.Sprintf("  -> %s\n", d.Suggestion))
			}
			sb.WriteString("\n")
		}
	}

	return sb.String()
}

func severityIcon(s string) string {
	switch s {
	case "critical":
		return "[X]"
	case "warning":
		return "[!]"
	case "info":
		return "[i]"
	default:
		return "[?]"
	}
}
