package aim

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
	"gopkg.in/yaml.v3"
)

// GenerateSRC creates a Strategic Reality Check by running mechanical checks
// against the EPF instance. Subjective sections are left with TODO placeholders.
func GenerateSRC(instancePath string, cycle int) (*StrategicRealityCheck, error) {
	now := time.Now()
	src := &StrategicRealityCheck{
		Cycle:          cycle,
		AssessmentDate: now.Format("2006-01-02"),
	}

	// Run all mechanical checks
	mcFindings := checkMarketCurrency(instancePath, now)
	saFindings := checkStrategicAlignment(instancePath)
	erFindings := checkExecutionReality(instancePath)
	bvFindings := generateBeliefPlaceholders(instancePath)

	src.BeliefValidity = bvFindings
	src.MarketCurrency = mcFindings
	src.StrategicAlignment = saFindings
	src.ExecutionReality = erFindings

	// Build recalibration plan from findings
	src.RecalibrationPlan = buildRecalibrationPlan(mcFindings, saFindings, erFindings)

	// Calculate summary
	src.Summary = calculateSummary(src, now)

	src.Meta.EPFVersion = "2.0.0"
	src.Meta.LastUpdated = now.Format(time.RFC3339)

	return src, nil
}

// checkMarketCurrency evaluates freshness of market-facing artifacts.
func checkMarketCurrency(instancePath string, now time.Time) []MarketCurrencyFinding {
	var findings []MarketCurrencyFinding
	counter := 0

	// Check each READY artifact that has review dates
	type reviewCheck struct {
		artifact string
		field    string
		cadence  int // expected review cadence in days
	}

	checks := []reviewCheck{
		{"READY/00_north_star.yaml", "last_reviewed", 365},
		{"READY/01_insight_analyses.yaml", "next_review_date", 180},
		{"READY/03_insight_opportunity.yaml", "last_reviewed", 90},
	}

	for _, check := range checks {
		path := filepath.Join(instancePath, check.artifact)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			continue
		}

		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var raw map[string]interface{}
		if err := yaml.Unmarshal(data, &raw); err != nil {
			continue
		}

		// Try to find the review date field
		dateStr := findDateField(raw, check.field)
		if dateStr == "" {
			// No review date found — that itself is a finding
			counter++
			findings = append(findings, MarketCurrencyFinding{
				ID:                fmt.Sprintf("src-mc-%03d", counter),
				SourceArtifact:    check.artifact,
				FieldPath:         check.field,
				StalenessLevel:    "medium",
				DaysSinceReview:   0,
				MarketChanges:     "",
				RecommendedAction: fmt.Sprintf("Add %s field to track review freshness", check.field),
			})
			continue
		}

		reviewDate, err := parseDate(dateStr)
		if err != nil {
			continue
		}

		days := int(math.Floor(now.Sub(reviewDate).Hours() / 24))
		if days < 0 {
			days = 0 // Future dates (e.g., next_review_date) clamp to 0
		}
		staleness := classifyStaleness(days, check.cadence)

		counter++
		action := ""
		switch staleness {
		case "low":
			action = "No action needed, within review window"
		case "medium":
			action = "Schedule review within next 2 weeks"
		case "high":
			action = fmt.Sprintf("Past review date by %d days, review soon", days-check.cadence)
		case "critical":
			action = fmt.Sprintf("Significantly overdue (%d days), review immediately", days)
		}

		findings = append(findings, MarketCurrencyFinding{
			ID:                fmt.Sprintf("src-mc-%03d", counter),
			SourceArtifact:    check.artifact,
			FieldPath:         check.field,
			StalenessLevel:    staleness,
			DaysSinceReview:   days,
			MarketChanges:     "",
			RecommendedAction: action,
		})
	}

	// Check feature definition assessment dates
	fdDir := filepath.Join(instancePath, "FIRE", "feature_definitions")
	if entries, err := os.ReadDir(fdDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
				continue
			}
			if strings.HasPrefix(entry.Name(), "_") {
				continue
			}

			fdPath := filepath.Join(fdDir, entry.Name())
			data, err := os.ReadFile(fdPath)
			if err != nil {
				continue
			}

			var fd map[string]interface{}
			if err := yaml.Unmarshal(data, &fd); err != nil {
				continue
			}

			dateStr := findDateField(fd, "last_assessment_date")
			if dateStr == "" {
				continue
			}

			reviewDate, err := parseDate(dateStr)
			if err != nil {
				continue
			}

			days := int(math.Floor(now.Sub(reviewDate).Hours() / 24))
			if days < 0 {
				days = 0 // Future dates clamp to 0
			}
			if days < 60 {
				continue // Only report features overdue (>60 days toward 90-day cadence)
			}

			staleness := classifyStaleness(days, 90)
			counter++

			relPath := filepath.Join("FIRE", "feature_definitions", entry.Name())
			findings = append(findings, MarketCurrencyFinding{
				ID:                fmt.Sprintf("src-mc-%03d", counter),
				SourceArtifact:    relPath,
				FieldPath:         "last_assessment_date",
				StalenessLevel:    staleness,
				DaysSinceReview:   days,
				MarketChanges:     "",
				RecommendedAction: fmt.Sprintf("Feature assessment overdue by %d days (90-day cadence)", days-90),
			})
		}
	}

	return findings
}

// checkStrategicAlignment validates cross-references across artifacts.
func checkStrategicAlignment(instancePath string) []AlignmentFinding {
	var findings []AlignmentFinding
	counter := 0

	// Load value model paths for validation using the canonical loader
	var valueModelPaths []string
	loader := valuemodel.NewLoader(instancePath)
	if vmSet, err := loader.Load(); err == nil {
		valueModelPaths = vmSet.GetAllPaths()
	}

	// Load feature IDs for dependency validation
	featureIDs := loadFeatureIDs(instancePath)

	// Check feature contributes_to paths
	fdDir := filepath.Join(instancePath, "FIRE", "feature_definitions")
	if entries, err := os.ReadDir(fdDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") || strings.HasPrefix(entry.Name(), "_") {
				continue
			}

			fdPath := filepath.Join(fdDir, entry.Name())
			data, err := os.ReadFile(fdPath)
			if err != nil {
				continue
			}

			var fd map[string]interface{}
			if err := yaml.Unmarshal(data, &fd); err != nil {
				continue
			}

			relPath := filepath.Join("FIRE", "feature_definitions", entry.Name())

			// Check contributes_to paths
			if sc, ok := fd["strategic_context"].(map[string]interface{}); ok {
				if ct, ok := sc["contributes_to"].([]interface{}); ok {
					for i, path := range ct {
						pathStr, ok := path.(string)
						if !ok {
							continue
						}
						status := "valid"
						details := fmt.Sprintf("Path %s resolves correctly", pathStr)
						suggestedFix := ""

						if len(valueModelPaths) > 0 && !containsPath(valueModelPaths, pathStr) {
							status = "broken"
							details = fmt.Sprintf("contributes_to path %s not found in value model", pathStr)
							suggestedFix = suggestSimilarPath(pathStr, valueModelPaths)
						}

						if status != "valid" {
							counter++
							findings = append(findings, AlignmentFinding{
								ID:             fmt.Sprintf("src-sa-%03d", counter),
								CheckType:      "value_model_path",
								SourceArtifact: relPath,
								FieldPath:      fmt.Sprintf("strategic_context.contributes_to[%d]", i),
								Status:         status,
								Details:        details,
								SuggestedFix:   suggestedFix,
							})
						}
					}
				}
			}

			// Check feature dependencies
			if deps, ok := fd["dependencies"].([]interface{}); ok {
				for i, dep := range deps {
					depMap, ok := dep.(map[string]interface{})
					if !ok {
						continue
					}
					depID, ok := depMap["feature_id"].(string)
					if !ok {
						continue
					}

					if !containsString(featureIDs, depID) {
						counter++
						findings = append(findings, AlignmentFinding{
							ID:             fmt.Sprintf("src-sa-%03d", counter),
							CheckType:      "feature_dependency",
							SourceArtifact: relPath,
							FieldPath:      fmt.Sprintf("dependencies[%d].feature_id", i),
							Status:         "broken",
							Details:        fmt.Sprintf("Dependency feature_id %s not found", depID),
						})
					}
				}
			}
		}
	}

	return findings
}

// checkExecutionReality assesses whether stated status matches actual state.
func checkExecutionReality(instancePath string) []ExecutionRealityFinding {
	var findings []ExecutionRealityFinding
	counter := 0

	// Check feature definitions for status/maturity mismatches
	fdDir := filepath.Join(instancePath, "FIRE", "feature_definitions")
	if entries, err := os.ReadDir(fdDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") || strings.HasPrefix(entry.Name(), "_") {
				continue
			}

			fdPath := filepath.Join(fdDir, entry.Name())
			data, err := os.ReadFile(fdPath)
			if err != nil {
				continue
			}

			var fd map[string]interface{}
			if err := yaml.Unmarshal(data, &fd); err != nil {
				continue
			}

			relPath := filepath.Join("FIRE", "feature_definitions", entry.Name())
			status, _ := fd["status"].(string)

			// Check: status "delivered" but maturity "hypothetical"
			if fm, ok := fd["feature_maturity"].(map[string]interface{}); ok {
				overallStage, _ := fm["overall_stage"].(string)
				if status == "delivered" && (overallStage == "hypothetical" || overallStage == "") {
					counter++
					findings = append(findings, ExecutionRealityFinding{
						ID:             fmt.Sprintf("src-er-%03d", counter),
						SourceArtifact: relPath,
						FieldPath:      "feature_maturity.overall_stage",
						ExpectedState:  fmt.Sprintf("Maturity should be at least 'emerging' for status '%s'", status),
						ActualState:    fmt.Sprintf("overall_stage: %s", overallStage),
						GapDescription: fmt.Sprintf("Feature claims '%s' status but maturity is '%s' — maturity should be updated to reflect delivery", status, overallStage),
						Severity:       "warning",
					})
				}
			}

			// Check: status "in-progress" but no implementation references
			if status == "in-progress" || status == "delivered" {
				implRefs, _ := fd["implementation_references"].([]interface{})
				if len(implRefs) == 0 {
					counter++
					severity := "info"
					if status == "delivered" {
						severity = "warning"
					}
					findings = append(findings, ExecutionRealityFinding{
						ID:             fmt.Sprintf("src-er-%03d", counter),
						SourceArtifact: relPath,
						FieldPath:      "implementation_references",
						ExpectedState:  fmt.Sprintf("At least one implementation reference for '%s' status", status),
						ActualState:    "No implementation references found",
						GapDescription: fmt.Sprintf("Feature has status '%s' but no implementation references, making delivery unverifiable", status),
						Severity:       severity,
					})
				}
			}
		}
	}

	return findings
}

// generateBeliefPlaceholders creates TODO entries for belief validity findings.
func generateBeliefPlaceholders(instancePath string) []BeliefValidityFinding {
	var findings []BeliefValidityFinding
	counter := 0

	// Check North Star for belief_challenges
	nsPath := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if data, err := os.ReadFile(nsPath); err == nil {
		var ns map[string]interface{}
		if err := yaml.Unmarshal(data, &ns); err == nil {
			if bc, ok := ns["belief_challenges"].([]interface{}); ok {
				for i, challenge := range bc {
					cm, ok := challenge.(map[string]interface{})
					if !ok {
						continue
					}
					belief, _ := cm["challenge"].(string)
					if belief == "" {
						belief, _ = cm["description"].(string)
					}
					if belief == "" {
						continue
					}

					counter++
					findings = append(findings, BeliefValidityFinding{
						ID:              fmt.Sprintf("src-bv-%03d", counter),
						SourceArtifact:  "READY/00_north_star.yaml",
						FieldPath:       fmt.Sprintf("belief_challenges[%d]", i),
						OriginalBelief:  truncate(belief, 500),
						CurrentEvidence: "TODO - evaluate current evidence for or against this belief",
						Signal:          "holding",
						ConfidenceDelta: "no_change",
					})
				}
			}
		}
	}

	// Check Strategy Formula for risks
	sfPath := filepath.Join(instancePath, "READY", "04_strategy_formula.yaml")
	if data, err := os.ReadFile(sfPath); err == nil {
		var sf map[string]interface{}
		if err := yaml.Unmarshal(data, &sf); err == nil {
			if risks, ok := sf["risks"].([]interface{}); ok {
				for i, risk := range risks {
					rm, ok := risk.(map[string]interface{})
					if !ok {
						continue
					}
					riskStr, _ := rm["risk"].(string)
					if riskStr == "" {
						riskStr, _ = rm["description"].(string)
					}
					if riskStr == "" {
						continue
					}

					counter++
					findings = append(findings, BeliefValidityFinding{
						ID:              fmt.Sprintf("src-bv-%03d", counter),
						SourceArtifact:  "READY/04_strategy_formula.yaml",
						FieldPath:       fmt.Sprintf("risks[%d]", i),
						OriginalBelief:  truncate(riskStr, 500),
						CurrentEvidence: "TODO - evaluate current evidence regarding this risk",
						Signal:          "holding",
						ConfidenceDelta: "no_change",
					})
				}
			}
		}
	}

	return findings
}

// buildRecalibrationPlan creates prioritized actions from findings.
func buildRecalibrationPlan(mc []MarketCurrencyFinding, sa []AlignmentFinding, er []ExecutionRealityFinding) []RecalibrationAction {
	var plan []RecalibrationAction
	counter := 0

	// Add actions for high/critical market currency findings
	for _, f := range mc {
		if f.StalenessLevel == "high" || f.StalenessLevel == "critical" {
			counter++
			priority := "medium"
			action := "review"
			effort := "30 minutes"
			if f.StalenessLevel == "critical" {
				priority = "high"
				action = "update"
				effort = "1-2 hours"
			}
			plan = append(plan, RecalibrationAction{
				ID:             fmt.Sprintf("rp-%03d", counter),
				TargetArtifact: f.SourceArtifact,
				TargetSection:  f.FieldPath,
				Action:         action,
				Priority:       priority,
				EffortEstimate: effort,
				Rationale:      fmt.Sprintf("Staleness level: %s, %d days since review", f.StalenessLevel, f.DaysSinceReview),
				LinkedFindings: []string{f.ID},
			})
		}
	}

	// Add actions for broken alignment findings
	for _, f := range sa {
		if f.Status == "broken" {
			counter++
			plan = append(plan, RecalibrationAction{
				ID:             fmt.Sprintf("rp-%03d", counter),
				TargetArtifact: f.SourceArtifact,
				TargetSection:  f.FieldPath,
				Action:         "update",
				Priority:       "high",
				EffortEstimate: "15 minutes",
				Rationale:      fmt.Sprintf("Broken %s: %s", f.CheckType, f.Details),
				LinkedFindings: []string{f.ID},
			})
		}
	}

	// Add actions for warning/critical execution reality findings
	for _, f := range er {
		if f.Severity == "warning" || f.Severity == "critical" {
			counter++
			priority := "medium"
			if f.Severity == "critical" {
				priority = "critical"
			}
			plan = append(plan, RecalibrationAction{
				ID:             fmt.Sprintf("rp-%03d", counter),
				TargetArtifact: f.SourceArtifact,
				TargetSection:  f.FieldPath,
				Action:         "update",
				Priority:       priority,
				EffortEstimate: "15 minutes",
				Rationale:      f.GapDescription,
				LinkedFindings: []string{f.ID},
			})
		}
	}

	return plan
}

// calculateSummary builds the SRC summary from findings.
func calculateSummary(src *StrategicRealityCheck, now time.Time) SRCSummary {
	counts := &FindingCounts{
		BeliefValidity:       len(src.BeliefValidity),
		MarketCurrency:       len(src.MarketCurrency),
		StrategicAlignment:   len(src.StrategicAlignment),
		ExecutionReality:     len(src.ExecutionReality),
		RecalibrationActions: len(src.RecalibrationPlan),
	}

	// Count non-info findings
	nonInfoCount := 0
	hasCritical := false
	hasHigh := false

	for _, f := range src.MarketCurrency {
		if f.StalenessLevel == "high" || f.StalenessLevel == "critical" {
			nonInfoCount++
			if f.StalenessLevel == "critical" {
				hasCritical = true
			}
		}
	}
	for _, f := range src.StrategicAlignment {
		if f.Status == "broken" {
			nonInfoCount++
		}
	}
	for _, f := range src.ExecutionReality {
		if f.Severity == "warning" {
			nonInfoCount++
			hasHigh = true
		} else if f.Severity == "critical" {
			nonInfoCount++
			hasCritical = true
		}
	}

	health := "healthy"
	if hasCritical || nonInfoCount >= 6 {
		health = "at_risk"
	} else if hasHigh || nonInfoCount >= 3 {
		health = "attention_needed"
	}

	criticalPlan := 0
	for _, a := range src.RecalibrationPlan {
		if a.Priority == "critical" {
			criticalPlan++
		}
	}
	if criticalPlan >= 2 {
		health = "critical"
	}

	return SRCSummary{
		OverallHealth: health,
		FindingCounts: counts,
		GeneratedAt:   now.Format(time.RFC3339),
	}
}

// --- Helpers ---

func findDateField(data map[string]interface{}, field string) string {
	// Direct field lookup
	if v, ok := data[field]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	// Check nested in meta
	if meta, ok := data["meta"].(map[string]interface{}); ok {
		if v, ok := meta[field]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
	}
	return ""
}

func parseDate(s string) (time.Time, error) {
	// Try common formats
	formats := []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05Z"}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse date: %s", s)
}

func classifyStaleness(daysSinceReview, cadenceDays int) string {
	ratio := float64(daysSinceReview) / float64(cadenceDays)
	switch {
	case ratio < 0.7:
		return "low"
	case ratio < 1.0:
		return "medium"
	case ratio < 1.5:
		return "high"
	default:
		return "critical"
	}
}

func loadFeatureIDs(instancePath string) []string {
	var ids []string
	fdDir := filepath.Join(instancePath, "FIRE", "feature_definitions")
	entries, err := os.ReadDir(fdDir)
	if err != nil {
		return ids
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") || strings.HasPrefix(entry.Name(), "_") {
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
		if id, ok := fd["id"].(string); ok {
			ids = append(ids, id)
		}
		if slug, ok := fd["slug"].(string); ok {
			ids = append(ids, slug)
		}
	}
	return ids
}

func containsPath(paths []string, target string) bool {
	for _, p := range paths {
		if strings.EqualFold(p, target) {
			return true
		}
	}
	return false
}

func containsString(list []string, target string) bool {
	for _, s := range list {
		if s == target {
			return true
		}
	}
	return false
}

func suggestSimilarPath(target string, paths []string) string {
	parts := strings.Split(target, ".")
	if len(parts) < 2 {
		return ""
	}
	lastPart := strings.ToLower(parts[len(parts)-1])

	for _, p := range paths {
		pParts := strings.Split(p, ".")
		pLast := strings.ToLower(pParts[len(pParts)-1])
		if pLast == lastPart {
			return fmt.Sprintf("Did you mean '%s'?", p)
		}
	}
	return ""
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
