package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lra"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	aimJSON      bool
	aimVerbose   bool
	aimTrack     string
	aimCycle     int
	aimAllCycles bool
)

var aimCmd = &cobra.Command{
	Use:   "aim",
	Short: "AIM phase assessment and calibration tools",
	Long: `Tools for the AIM (Assessment & Calibration) phase of EPF.

The AIM phase helps you learn from execution and calibrate strategy based on evidence.
It provides structured assessment of OKR progress, assumption validation, and decision
support for persevere/pivot/pull-the-plug choices.

Available subcommands:
  bootstrap            Create Living Reality Assessment baseline (foundational)
  status               Show current Living Reality Assessment summary
  migrate-baseline     Migrate legacy EPF instance to include LRA
  assess               Pre-populate assessment_report.yaml from roadmap data
  validate-assumptions Check assumption validation status
  okr-progress         Calculate OKR/KR completion rates
  update-lra           Apply field-level updates to the LRA
  write-assessment     Write assessment report from structured YAML
  write-calibration    Write calibration memo from structured YAML
  generate-src         Generate Strategic Reality Check with mechanical checks
  write-src            Write/update Strategic Reality Check from YAML
  init-cycle           Bootstrap a new cycle (archive previous, reset AIM)
  archive-cycle        Archive current cycle's AIM artifacts

Examples:
  epf-cli aim bootstrap
  epf-cli aim status
  epf-cli aim migrate-baseline
  epf-cli aim assess roadmap-mvp-launch-q1
  epf-cli aim validate-assumptions
  epf-cli aim okr-progress --track product
  epf-cli aim update-lra --primary-objective "Ship MVP" --trigger aim_signals --summary "Focus shift"
  epf-cli aim write-assessment --file assessment_draft.yaml
  epf-cli aim write-calibration --file calibration.yaml
  epf-cli aim init-cycle --cycle 2 --archive
  epf-cli aim archive-cycle --cycle 1`,
}

// =============================================================================
// ASSESS COMMAND
// =============================================================================

var aimAssessCmd = &cobra.Command{
	Use:   "assess [roadmap-id]",
	Short: "Pre-populate assessment_report.yaml from roadmap data",
	Long: `Generate an assessment report template pre-filled with OKRs and KRs from a roadmap.

This command reads your roadmap_recipe.yaml and creates an assessment_report.yaml
template with:
  - All OKRs and Key Results from the roadmap
  - Placeholder sections for targets, actuals, and evidence
  - Assumption references for validation tracking

The command auto-detects the EPF instance from your current directory.

Examples:
  epf-cli aim assess roadmap-mvp-launch-q1
  epf-cli aim assess roadmap-mvp-launch-q1 --json
  epf-cli aim assess roadmap-mvp-launch-q1 --verbose`,
	Args: cobra.MaximumNArgs(1),
	Run:  runAimAssess,
}

// =============================================================================
// VALIDATE-ASSUMPTIONS COMMAND
// =============================================================================

var aimValidateAssumptionsCmd = &cobra.Command{
	Use:   "validate-assumptions",
	Short: "Check assumption validation status from assessments",
	Long: `Show assumption validation status by cross-referencing roadmap assumptions
with assessment report evidence.

Displays:
  - Validated assumptions (with supporting evidence)
  - Invalidated assumptions (with contradicting evidence)
  - Inconclusive assumptions (insufficient evidence)
  - Pending assumptions (not yet tested)

The command auto-detects the EPF instance from your current directory.

Examples:
  epf-cli aim validate-assumptions
  epf-cli aim validate-assumptions --json
  epf-cli aim validate-assumptions --verbose`,
	Run: runAimValidateAssumptions,
}

// =============================================================================
// OKR-PROGRESS COMMAND
// =============================================================================

var aimOkrProgressCmd = &cobra.Command{
	Use:   "okr-progress",
	Short: "Calculate OKR/KR completion rates from assessments",
	Long: `Analyze OKR and Key Result achievement rates from assessment reports.

Displays:
  - Overall KR achievement rate (exceeded/met/partially_met/missed breakdown)
  - Achievement rates by track (product/strategy/org_ops/commercial)
  - Trend analysis (if multiple cycles exist)
  - Variance from targets

The command auto-detects the EPF instance from your current directory.
Use --track to filter results to a specific track.
Use --cycle to analyze a specific cycle, or --all-cycles for trend analysis.

Examples:
  epf-cli aim okr-progress
  epf-cli aim okr-progress --cycle 1
  epf-cli aim okr-progress --all-cycles
  epf-cli aim okr-progress --track product --cycle 1
  epf-cli aim okr-progress --json
  epf-cli aim okr-progress --verbose`,
	Run: runAimOkrProgress,
}

// =============================================================================
// ASSESS IMPLEMENTATION
// =============================================================================

type RoadmapData struct {
	Roadmap struct {
		ID         string `yaml:"id"`
		StrategyID string `yaml:"strategy_id"`
		Cycle      int    `yaml:"cycle"`
		Timeframe  string `yaml:"timeframe"`
		Tracks     struct {
			Product    TrackData `yaml:"product"`
			Strategy   TrackData `yaml:"strategy"`
			OrgOps     TrackData `yaml:"org_ops"`
			Commercial TrackData `yaml:"commercial"`
		} `yaml:"tracks"`
	} `yaml:"roadmap"`
}

type TrackData struct {
	OKRs        []OKRData        `yaml:"okrs"`
	Assumptions []AssumptionData `yaml:"riskiest_assumptions"`
}

type OKRData struct {
	ID          string   `yaml:"id"`
	Objective   string   `yaml:"objective"`
	KeyResults  []KRData `yaml:"key_results"`
	Description string   `yaml:"description,omitempty"`
}

type KRData struct {
	ID          string `yaml:"id"`
	Description string `yaml:"description"`
	Target      string `yaml:"target,omitempty"`
}

type AssumptionData struct {
	ID         string `yaml:"id"`
	Statement  string `yaml:"statement"`
	Risk       string `yaml:"risk,omitempty"`
	Validation string `yaml:"validation_approach,omitempty"`
}

type AssessmentReport struct {
	Meta struct {
		EPFVersion  string `yaml:"epf_version"`
		LastUpdated string `yaml:"last_updated"`
	} `yaml:"meta"`
	RoadmapID      string            `yaml:"roadmap_id"`
	Cycle          int               `yaml:"cycle"`
	OKRAssessments []OKRAssessment   `yaml:"okr_assessments"`
	Assumptions    []AssumptionCheck `yaml:"assumption_validations"`
}

type OKRAssessment struct {
	OKRID             string          `yaml:"okr_id"`
	Assessment        string          `yaml:"assessment"`
	KeyResultOutcomes []KROutcome     `yaml:"key_result_outcomes"`
	DataSummary       DataSummary     `yaml:"data_summary"`
	CrossFunctional   CrossFunctional `yaml:"cross_functional"`
}

type KROutcome struct {
	KRID      string   `yaml:"kr_id"`
	Target    string   `yaml:"target"`
	Actual    string   `yaml:"actual"`
	Status    string   `yaml:"status"`
	Learnings []string `yaml:"learnings,omitempty"`
}

type DataSummary struct {
	Quantitative []QuantitativeMetric `yaml:"quantitative,omitempty"`
	Qualitative  []QualitativeInsight `yaml:"qualitative,omitempty"`
}

type QuantitativeMetric struct {
	Metric   string `yaml:"metric"`
	Target   string `yaml:"target"`
	Actual   string `yaml:"actual"`
	Variance string `yaml:"variance"`
}

type QualitativeInsight struct {
	Source  string `yaml:"source"`
	Insight string `yaml:"insight"`
}

type CrossFunctional struct {
	EngineeringInsights []string `yaml:"engineering,omitempty"`
	DesignInsights      []string `yaml:"design,omitempty"`
	DataInsights        []string `yaml:"data,omitempty"`
	OpsInsights         []string `yaml:"ops,omitempty"`
}

type AssumptionCheck struct {
	AssumptionID string `yaml:"assumption_id"`
	Status       string `yaml:"status"`
	Evidence     string `yaml:"evidence"`
}

func runAimAssess(cmd *cobra.Command, args []string) {
	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if aimJSON {
			outputAimJSON(map[string]interface{}{"error": err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Ensure LRA exists
	if err := ensureLivingRealityAssessment(instancePath); err != nil {
		if aimJSON {
			outputAimJSON(map[string]interface{}{"error": err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Load roadmap
	roadmapPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	roadmapData, err := loadRoadmap(roadmapPath)
	if err != nil {
		if aimJSON {
			outputAimJSON(map[string]interface{}{"error": fmt.Sprintf("Failed to load roadmap: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading roadmap: %v\n", err)
		}
		os.Exit(1)
	}

	// Extract roadmap ID from args or use roadmap data
	var roadmapID string
	if len(args) > 0 {
		roadmapID = args[0]
	} else {
		roadmapID = roadmapData.Roadmap.ID
	}

	// Generate assessment report
	assessment := generateAssessmentReport(roadmapData, roadmapID)

	// Output
	if aimJSON {
		outputAimJSON(assessment)
	} else {
		printAssessmentReport(assessment, roadmapData)
	}
}

func loadRoadmap(path string) (*RoadmapData, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read roadmap file: %w", err)
	}

	var roadmap RoadmapData
	if err := yaml.Unmarshal(data, &roadmap); err != nil {
		return nil, fmt.Errorf("failed to parse roadmap YAML: %w", err)
	}

	return &roadmap, nil
}

func generateAssessmentReport(roadmap *RoadmapData, roadmapID string) *AssessmentReport {
	assessment := &AssessmentReport{
		RoadmapID: roadmapID,
		Cycle:     roadmap.Roadmap.Cycle,
	}
	assessment.Meta.EPFVersion = "1.13.0"
	assessment.Meta.LastUpdated = "TODO: Add current date"

	// Generate OKR assessments from all tracks
	tracks := map[string]TrackData{
		"product":    roadmap.Roadmap.Tracks.Product,
		"strategy":   roadmap.Roadmap.Tracks.Strategy,
		"org_ops":    roadmap.Roadmap.Tracks.OrgOps,
		"commercial": roadmap.Roadmap.Tracks.Commercial,
	}

	for trackName, track := range tracks {
		for _, okr := range track.OKRs {
			okrAssessment := OKRAssessment{
				OKRID:      okr.ID,
				Assessment: fmt.Sprintf("TODO: Provide narrative assessment of %s (%s track)\n\nObjective: %s\n\nProvide 100-2000 character assessment covering:\n1. Context - What was the objective and why?\n2. Outcomes - What did we achieve? Reference specific KR statuses below.\n3. Evidence - What data supports these outcomes?\n4. Insights - What did we learn? What surprised us?\n5. Implications - What does this mean for next cycle?", okr.ID, trackName, okr.Objective),
			}

			// Add KR outcomes
			for _, kr := range okr.KeyResults {
				krOutcome := KROutcome{
					KRID:   kr.ID,
					Target: getTargetFromKR(kr),
					Actual: "TODO: Provide actual outcome (same format as target)",
					Status: "TODO: Set status (exceeded/met/partially_met/missed)",
					Learnings: []string{
						"TODO: Add key learning from this KR (30-300 chars)",
					},
				}
				okrAssessment.KeyResultOutcomes = append(okrAssessment.KeyResultOutcomes, krOutcome)
			}

			// Add placeholder data summary
			okrAssessment.DataSummary = DataSummary{
				Quantitative: []QuantitativeMetric{
					{
						Metric:   "TODO: Metric name",
						Target:   "TODO: Target value",
						Actual:   "TODO: Actual value",
						Variance: "TODO: Variance (+/- with units)",
					},
				},
				Qualitative: []QualitativeInsight{
					{
						Source:  "TODO: Source (e.g., 'User interviews (n=15)')",
						Insight: "TODO: Qualitative insight (50-300 chars)",
					},
				},
			}

			// Add placeholder cross-functional insights
			okrAssessment.CrossFunctional = CrossFunctional{
				EngineeringInsights: []string{"TODO: Engineering insight (optional)"},
				DesignInsights:      []string{"TODO: Design insight (optional)"},
				DataInsights:        []string{"TODO: Data insight (optional)"},
				OpsInsights:         []string{"TODO: Ops insight (optional)"},
			}

			assessment.OKRAssessments = append(assessment.OKRAssessments, okrAssessment)
		}

		// Add assumption checks
		for _, assumption := range track.Assumptions {
			assumptionCheck := AssumptionCheck{
				AssumptionID: assumption.ID,
				Status:       "TODO: Set status (validated/invalidated/inconclusive/pending)",
				Evidence:     fmt.Sprintf("TODO: Provide evidence for assumption: %s\n\nValidation approach: %s", assumption.Statement, assumption.Validation),
			}
			assessment.Assumptions = append(assessment.Assumptions, assumptionCheck)
		}
	}

	return assessment
}

func getTargetFromKR(kr KRData) string {
	if kr.Target != "" {
		return kr.Target
	}
	// Try to extract target from description
	if strings.Contains(kr.Description, "target:") || strings.Contains(kr.Description, "Target:") {
		// This is a simplified extraction - could be enhanced
		return "TODO: Extract target from description or add explicit target"
	}
	return "TODO: Define measurable target for this KR"
}

func printAssessmentReport(assessment *AssessmentReport, roadmap *RoadmapData) {
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Printf("║  Assessment Report Template Generated                     ║\n")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	fmt.Printf("📋 Roadmap ID: %s\n", assessment.RoadmapID)
	fmt.Printf("   Cycle:      %d (%s)\n", assessment.Cycle, roadmap.Roadmap.Timeframe)
	fmt.Printf("   OKRs:       %d\n", len(assessment.OKRAssessments))
	fmt.Printf("   Assumptions: %d\n", len(assessment.Assumptions))
	fmt.Println()

	fmt.Println("📊 OKR Assessments:")
	for i, okrAssess := range assessment.OKRAssessments {
		fmt.Printf("   %d. %s\n", i+1, okrAssess.OKRID)
		fmt.Printf("      Key Results: %d\n", len(okrAssess.KeyResultOutcomes))
		if aimVerbose {
			for _, kr := range okrAssess.KeyResultOutcomes {
				fmt.Printf("        • %s: %s\n", kr.KRID, kr.Target)
			}
		}
	}
	fmt.Println()

	fmt.Println("🔍 Assumptions to Validate:")
	for i, assumption := range assessment.Assumptions {
		fmt.Printf("   %d. %s\n", i+1, assumption.AssumptionID)
	}
	fmt.Println()

	fmt.Println("💡 Next Steps:")
	fmt.Println("   1. Review the generated template")
	fmt.Println("   2. Fill in 'TODO' sections with actual data")
	fmt.Println("   3. Gather quantitative metrics from your analytics")
	fmt.Println("   4. Collect qualitative insights from user research, support tickets, etc.")
	fmt.Println("   5. Assess KR status (exceeded/met/partially_met/missed)")
	fmt.Println("   6. Document assumption validation evidence")
	fmt.Println("   7. Validate the completed file: epf-cli validate assessment_report.yaml")
	fmt.Println()

	// Print YAML output if verbose
	if aimVerbose {
		fmt.Println("═══════════════════════════════════════════════════════════")
		fmt.Println("YAML Output:")
		fmt.Println("═══════════════════════════════════════════════════════════")
		yamlData, _ := yaml.Marshal(assessment)
		fmt.Println(string(yamlData))
	}
}

// =============================================================================
// VALIDATE-ASSUMPTIONS IMPLEMENTATION
// =============================================================================

type AssumptionValidationResult struct {
	Summary AssumptionSummary            `json:"summary"`
	Details []AssumptionValidationDetail `json:"details"`
	Error   string                       `json:"error,omitempty"`
}

type AssumptionSummary struct {
	Total        int `json:"total"`
	Validated    int `json:"validated"`
	Invalidated  int `json:"invalidated"`
	Inconclusive int `json:"inconclusive"`
	Pending      int `json:"pending"`
}

type AssumptionValidationDetail struct {
	ID         string `json:"id"`
	Statement  string `json:"statement"`
	Track      string `json:"track"`
	Risk       string `json:"risk,omitempty"`
	Status     string `json:"status"`
	Evidence   string `json:"evidence,omitempty"`
	Validation string `json:"validation_approach,omitempty"`
}

func runAimValidateAssumptions(cmd *cobra.Command, args []string) {
	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if aimJSON {
			outputAimJSON(&AssumptionValidationResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Ensure LRA exists
	if err := ensureLivingRealityAssessment(instancePath); err != nil {
		if aimJSON {
			outputAimJSON(&AssumptionValidationResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Load roadmap
	roadmapPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	roadmapData, err := loadRoadmap(roadmapPath)
	if err != nil {
		if aimJSON {
			outputAimJSON(&AssumptionValidationResult{Error: fmt.Sprintf("Failed to load roadmap: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading roadmap: %v\n", err)
		}
		os.Exit(1)
	}

	// Find assessment reports
	aimDir := filepath.Join(instancePath, "AIM")
	assessments, err := loadAssessmentReports(aimDir)
	if err != nil {
		if aimJSON {
			outputAimJSON(&AssumptionValidationResult{Error: fmt.Sprintf("Failed to load assessments: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Warning: No assessment reports found in AIM directory: %v\n", err)
			fmt.Println("Showing assumptions from roadmap (not yet validated)...")
		}
		assessments = []AssessmentReport{} // Empty list, continue with roadmap data
	}

	// Validate assumptions
	result := validateAssumptions(roadmapData, assessments)

	// Output
	if aimJSON {
		outputAimJSON(result)
	} else {
		printAssumptionValidation(result)
	}
}

func loadAssessmentReports(aimDir string) ([]AssessmentReport, error) {
	// Check if AIM directory exists
	if _, err := os.Stat(aimDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("AIM directory not found")
	}

	// Look for assessment_report.yaml files (could be multiple cycles)
	files, err := filepath.Glob(filepath.Join(aimDir, "*assessment_report*.yaml"))
	if err != nil {
		return nil, err
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no assessment report files found")
	}

	var assessments []AssessmentReport
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue // Skip files we can't read
		}

		var assessment AssessmentReport
		if err := yaml.Unmarshal(data, &assessment); err != nil {
			continue // Skip invalid YAML
		}

		assessments = append(assessments, assessment)
	}

	if len(assessments) == 0 {
		return nil, fmt.Errorf("no valid assessment reports found")
	}

	return assessments, nil
}

func validateAssumptions(roadmap *RoadmapData, assessments []AssessmentReport) *AssumptionValidationResult {
	result := &AssumptionValidationResult{
		Details: []AssumptionValidationDetail{},
	}

	// Collect all assumptions from roadmap by track
	tracks := map[string]TrackData{
		"product":    roadmap.Roadmap.Tracks.Product,
		"strategy":   roadmap.Roadmap.Tracks.Strategy,
		"org_ops":    roadmap.Roadmap.Tracks.OrgOps,
		"commercial": roadmap.Roadmap.Tracks.Commercial,
	}

	// Build evidence map from assessments
	evidenceMap := make(map[string]AssumptionCheck)
	for _, assessment := range assessments {
		for _, assumptionCheck := range assessment.Assumptions {
			evidenceMap[assumptionCheck.AssumptionID] = assumptionCheck
		}
	}

	// Process each assumption
	for trackName, track := range tracks {
		for _, assumption := range track.Assumptions {
			detail := AssumptionValidationDetail{
				ID:         assumption.ID,
				Statement:  assumption.Statement,
				Track:      trackName,
				Risk:       assumption.Risk,
				Validation: assumption.Validation,
			}

			// Check if we have evidence
			if evidence, found := evidenceMap[assumption.ID]; found {
				detail.Status = evidence.Status
				detail.Evidence = evidence.Evidence

				// Update summary counts
				switch strings.ToLower(evidence.Status) {
				case "validated":
					result.Summary.Validated++
				case "invalidated":
					result.Summary.Invalidated++
				case "inconclusive":
					result.Summary.Inconclusive++
				case "pending":
					result.Summary.Pending++
				default:
					// Unknown status, treat as pending
					detail.Status = "pending"
					result.Summary.Pending++
				}
			} else {
				// No evidence found, mark as pending
				detail.Status = "pending"
				detail.Evidence = "No assessment evidence available yet"
				result.Summary.Pending++
			}

			result.Summary.Total++
			result.Details = append(result.Details, detail)
		}
	}

	return result
}

func printAssumptionValidation(result *AssumptionValidationResult) {
	if result.Error != "" {
		fmt.Fprintf(os.Stderr, "Error: %s\n", result.Error)
		return
	}

	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Printf("║  Assumption Validation Status                              ║\n")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Summary
	fmt.Println("📊 Summary:")
	fmt.Printf("   Total:        %d\n", result.Summary.Total)
	fmt.Printf("   ✅ Validated:    %d (%d%%)\n", result.Summary.Validated,
		percentage(result.Summary.Validated, result.Summary.Total))
	fmt.Printf("   ❌ Invalidated:  %d (%d%%)\n", result.Summary.Invalidated,
		percentage(result.Summary.Invalidated, result.Summary.Total))
	fmt.Printf("   ⚠️  Inconclusive: %d (%d%%)\n", result.Summary.Inconclusive,
		percentage(result.Summary.Inconclusive, result.Summary.Total))
	fmt.Printf("   ⏳ Pending:      %d (%d%%)\n", result.Summary.Pending,
		percentage(result.Summary.Pending, result.Summary.Total))
	fmt.Println()

	// Details by status
	if aimVerbose {
		printAssumptionsByStatus(result.Details, "validated", "✅ Validated Assumptions")
		printAssumptionsByStatus(result.Details, "invalidated", "❌ Invalidated Assumptions")
		printAssumptionsByStatus(result.Details, "inconclusive", "⚠️  Inconclusive Assumptions")
		printAssumptionsByStatus(result.Details, "pending", "⏳ Pending Assumptions")
	} else {
		// Just show counts by track in non-verbose mode
		fmt.Println("📋 By Track:")
		trackCounts := make(map[string]AssumptionSummary)
		for _, detail := range result.Details {
			summary := trackCounts[detail.Track]
			summary.Total++
			switch detail.Status {
			case "validated":
				summary.Validated++
			case "invalidated":
				summary.Invalidated++
			case "inconclusive":
				summary.Inconclusive++
			case "pending":
				summary.Pending++
			}
			trackCounts[detail.Track] = summary
		}

		for _, trackName := range []string{"product", "strategy", "org_ops", "commercial"} {
			if summary, ok := trackCounts[trackName]; ok {
				fmt.Printf("   %s: %d total (✅ %d, ❌ %d, ⚠️  %d, ⏳ %d)\n",
					trackName, summary.Total, summary.Validated, summary.Invalidated,
					summary.Inconclusive, summary.Pending)
			}
		}
		fmt.Println()
		fmt.Println("💡 Use --verbose to see detailed evidence for each assumption")
	}
}

func printAssumptionsByStatus(details []AssumptionValidationDetail, status, header string) {
	filtered := []AssumptionValidationDetail{}
	for _, detail := range details {
		if strings.ToLower(detail.Status) == status {
			filtered = append(filtered, detail)
		}
	}

	if len(filtered) == 0 {
		return
	}

	fmt.Println(header + ":")
	for i, detail := range filtered {
		fmt.Printf("   %d. %s (%s track)\n", i+1, detail.ID, detail.Track)
		fmt.Printf("      Statement: %s\n", detail.Statement)
		if detail.Risk != "" {
			fmt.Printf("      Risk: %s\n", detail.Risk)
		}
		if detail.Evidence != "" && detail.Evidence != "No assessment evidence available yet" {
			evidenceLines := strings.Split(detail.Evidence, "\n")
			fmt.Printf("      Evidence: %s\n", evidenceLines[0])
			if len(evidenceLines) > 1 {
				for _, line := range evidenceLines[1:] {
					if strings.TrimSpace(line) != "" {
						fmt.Printf("                %s\n", line)
					}
				}
			}
		}
		fmt.Println()
	}
}

func percentage(part, total int) int {
	if total == 0 {
		return 0
	}
	return (part * 100) / total
}

// =============================================================================
// OKR-PROGRESS IMPLEMENTATION
// =============================================================================

type OKRProgressResult struct {
	Cycles  []CycleProgress          `json:"cycles"`
	ByTrack map[string]TrackProgress `json:"by_track,omitempty"`
	Overall ProgressSummary          `json:"overall"`
	Error   string                   `json:"error,omitempty"`
}

type CycleProgress struct {
	Cycle     int             `json:"cycle"`
	Timeframe string          `json:"timeframe,omitempty"`
	Summary   ProgressSummary `json:"summary"`
	OKRs      []OKRProgress   `json:"okrs,omitempty"`
}

type ProgressSummary struct {
	TotalKRs        int     `json:"total_krs"`
	Exceeded        int     `json:"exceeded"`
	Met             int     `json:"met"`
	PartiallyMet    int     `json:"partially_met"`
	Missed          int     `json:"missed"`
	AchievementRate float64 `json:"achievement_rate"` // (exceeded + met) / total
}

type OKRProgress struct {
	OKRID      string          `json:"okr_id"`
	Track      string          `json:"track"`
	Objective  string          `json:"objective,omitempty"`
	Summary    ProgressSummary `json:"summary"`
	KeyResults []KRProgress    `json:"key_results,omitempty"`
}

type KRProgress struct {
	KRID   string `json:"kr_id"`
	Target string `json:"target,omitempty"`
	Actual string `json:"actual,omitempty"`
	Status string `json:"status"`
}

type TrackProgress struct {
	Track   string          `json:"track"`
	Summary ProgressSummary `json:"summary"`
	Cycles  []int           `json:"cycles,omitempty"`
}

func runAimOkrProgress(cmd *cobra.Command, args []string) {
	// Get instance path
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		if aimJSON {
			outputAimJSON(&OKRProgressResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Ensure LRA exists
	if err := ensureLivingRealityAssessment(instancePath); err != nil {
		if aimJSON {
			outputAimJSON(&OKRProgressResult{Error: err.Error()})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	// Load roadmap for OKR metadata
	roadmapPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	roadmapData, err := loadRoadmap(roadmapPath)
	if err != nil {
		if aimJSON {
			outputAimJSON(&OKRProgressResult{Error: fmt.Sprintf("Failed to load roadmap: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading roadmap: %v\n", err)
		}
		os.Exit(1)
	}

	// Load assessment reports
	aimDir := filepath.Join(instancePath, "AIM")
	assessments, err := loadAssessmentReports(aimDir)
	if err != nil {
		if aimJSON {
			outputAimJSON(&OKRProgressResult{Error: fmt.Sprintf("Failed to load assessments: %v", err)})
		} else {
			fmt.Fprintf(os.Stderr, "Error loading assessments: %v\n", err)
			fmt.Println("\n💡 To use this command:")
			fmt.Println("   1. First run: epf-cli aim assess")
			fmt.Println("   2. Fill in the assessment_report.yaml with actual KR statuses")
			fmt.Println("   3. Save it to the AIM/ directory")
			fmt.Println("   4. Then run: epf-cli aim okr-progress")
		}
		os.Exit(1)
	}

	// Calculate progress
	result := calculateOKRProgress(roadmapData, assessments, aimCycle, aimAllCycles, aimTrack)

	// Output
	if aimJSON {
		outputAimJSON(result)
	} else {
		printOKRProgress(result)
	}
}

func calculateOKRProgress(roadmap *RoadmapData, assessments []AssessmentReport,
	cycleFilter int, allCycles bool, trackFilter string) *OKRProgressResult {

	result := &OKRProgressResult{
		Cycles:  []CycleProgress{},
		ByTrack: make(map[string]TrackProgress),
	}

	// Build OKR metadata map from roadmap
	okrMetadata := buildOKRMetadata(roadmap)

	// Process each assessment
	for _, assessment := range assessments {
		// Apply cycle filter
		if cycleFilter > 0 && assessment.Cycle != cycleFilter {
			continue
		}

		cycleProgress := CycleProgress{
			Cycle: assessment.Cycle,
			OKRs:  []OKRProgress{},
		}

		// Process each OKR assessment
		for _, okrAssessment := range assessment.OKRAssessments {
			// Get track from OKR ID (kr-p-001 = product, kr-s-001 = strategy, etc.)
			track := getTrackFromOKRID(okrAssessment.OKRID)

			// Apply track filter
			if trackFilter != "" && track != trackFilter {
				continue
			}

			okrProg := OKRProgress{
				OKRID:      okrAssessment.OKRID,
				Track:      track,
				Objective:  okrMetadata[okrAssessment.OKRID],
				KeyResults: []KRProgress{},
			}

			// Process each KR outcome
			for _, krOutcome := range okrAssessment.KeyResultOutcomes {
				krProg := KRProgress{
					KRID:   krOutcome.KRID,
					Target: krOutcome.Target,
					Actual: krOutcome.Actual,
					Status: krOutcome.Status,
				}

				// Count status
				switch strings.ToLower(krOutcome.Status) {
				case "exceeded":
					okrProg.Summary.Exceeded++
					cycleProgress.Summary.Exceeded++
					result.Overall.Exceeded++
				case "met":
					okrProg.Summary.Met++
					cycleProgress.Summary.Met++
					result.Overall.Met++
				case "partially_met", "partially met":
					okrProg.Summary.PartiallyMet++
					cycleProgress.Summary.PartiallyMet++
					result.Overall.PartiallyMet++
				case "missed":
					okrProg.Summary.Missed++
					cycleProgress.Summary.Missed++
					result.Overall.Missed++
				default:
					// Skip TODO or invalid statuses
					continue
				}

				okrProg.Summary.TotalKRs++
				cycleProgress.Summary.TotalKRs++
				result.Overall.TotalKRs++

				if aimVerbose {
					okrProg.KeyResults = append(okrProg.KeyResults, krProg)
				}
			}

			// Calculate OKR achievement rate
			if okrProg.Summary.TotalKRs > 0 {
				okrProg.Summary.AchievementRate = float64(okrProg.Summary.Exceeded+okrProg.Summary.Met) /
					float64(okrProg.Summary.TotalKRs) * 100
			}

			cycleProgress.OKRs = append(cycleProgress.OKRs, okrProg)

			// Update track summary
			trackSummary := result.ByTrack[track]
			trackSummary.Track = track
			trackSummary.Summary.TotalKRs += okrProg.Summary.TotalKRs
			trackSummary.Summary.Exceeded += okrProg.Summary.Exceeded
			trackSummary.Summary.Met += okrProg.Summary.Met
			trackSummary.Summary.PartiallyMet += okrProg.Summary.PartiallyMet
			trackSummary.Summary.Missed += okrProg.Summary.Missed
			if !contains(trackSummary.Cycles, assessment.Cycle) {
				trackSummary.Cycles = append(trackSummary.Cycles, assessment.Cycle)
			}
			result.ByTrack[track] = trackSummary
		}

		// Calculate cycle achievement rate
		if cycleProgress.Summary.TotalKRs > 0 {
			cycleProgress.Summary.AchievementRate = float64(cycleProgress.Summary.Exceeded+cycleProgress.Summary.Met) /
				float64(cycleProgress.Summary.TotalKRs) * 100
		}

		result.Cycles = append(result.Cycles, cycleProgress)
	}

	// Calculate overall achievement rate
	if result.Overall.TotalKRs > 0 {
		result.Overall.AchievementRate = float64(result.Overall.Exceeded+result.Overall.Met) /
			float64(result.Overall.TotalKRs) * 100
	}

	// Calculate track achievement rates
	for track, summary := range result.ByTrack {
		if summary.Summary.TotalKRs > 0 {
			summary.Summary.AchievementRate = float64(summary.Summary.Exceeded+summary.Summary.Met) /
				float64(summary.Summary.TotalKRs) * 100
			result.ByTrack[track] = summary
		}
	}

	return result
}

func buildOKRMetadata(roadmap *RoadmapData) map[string]string {
	metadata := make(map[string]string)

	tracks := map[string]TrackData{
		"product":    roadmap.Roadmap.Tracks.Product,
		"strategy":   roadmap.Roadmap.Tracks.Strategy,
		"org_ops":    roadmap.Roadmap.Tracks.OrgOps,
		"commercial": roadmap.Roadmap.Tracks.Commercial,
	}

	for _, track := range tracks {
		for _, okr := range track.OKRs {
			metadata[okr.ID] = okr.Objective
		}
	}

	return metadata
}

func getTrackFromOKRID(okrID string) string {
	// OKR IDs follow pattern: okr-{track-prefix}-{number}
	// kr-p-001 = product, kr-s-001 = strategy, kr-o-001 = org_ops, kr-c-001 = commercial
	parts := strings.Split(okrID, "-")
	if len(parts) < 3 {
		return "unknown"
	}

	switch parts[1] {
	case "p":
		return "product"
	case "s":
		return "strategy"
	case "o":
		return "org_ops"
	case "c":
		return "commercial"
	default:
		return "unknown"
	}
}

func contains(slice []int, val int) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}

func printOKRProgress(result *OKRProgressResult) {
	if result.Error != "" {
		fmt.Fprintf(os.Stderr, "Error: %s\n", result.Error)
		return
	}

	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Printf("║  OKR Progress Analysis                                     ║\n")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Overall summary
	fmt.Println("📊 Overall Summary:")
	printProgressSummary(&result.Overall, "   ")
	fmt.Println()

	// By track
	if len(result.ByTrack) > 0 && (aimTrack == "" || aimVerbose) {
		fmt.Println("📈 By Track:")
		for _, trackName := range []string{"product", "strategy", "org_ops", "commercial"} {
			if summary, ok := result.ByTrack[trackName]; ok {
				fmt.Printf("   %s:\n", trackName)
				printProgressSummary(&summary.Summary, "      ")
			}
		}
		fmt.Println()
	}

	// By cycle
	if len(result.Cycles) > 1 || aimAllCycles {
		fmt.Println("📅 By Cycle:")
		for _, cycle := range result.Cycles {
			fmt.Printf("   Cycle %d:\n", cycle.Cycle)
			printProgressSummary(&cycle.Summary, "      ")

			if aimVerbose {
				fmt.Printf("      OKRs: %d\n", len(cycle.OKRs))
				for _, okr := range cycle.OKRs {
					fmt.Printf("         • %s (%s): %.0f%% achievement\n",
						okr.OKRID, okr.Track, okr.Summary.AchievementRate)
				}
			}
		}
		fmt.Println()
	}

	// Detailed OKR breakdown if verbose
	if aimVerbose && len(result.Cycles) > 0 {
		fmt.Println("📋 Detailed OKR Breakdown:")
		for _, cycle := range result.Cycles {
			if len(result.Cycles) > 1 {
				fmt.Printf("\n   Cycle %d:\n", cycle.Cycle)
			}
			for _, okr := range cycle.OKRs {
				fmt.Printf("   %s (%s track)\n", okr.OKRID, okr.Track)
				if okr.Objective != "" {
					fmt.Printf("      Objective: %s\n", okr.Objective)
				}
				printProgressSummary(&okr.Summary, "      ")

				if len(okr.KeyResults) > 0 {
					fmt.Println("      Key Results:")
					for _, kr := range okr.KeyResults {
						statusIcon := getStatusIcon(kr.Status)
						fmt.Printf("         %s %s: %s\n", statusIcon, kr.KRID, kr.Status)
						if kr.Target != "" && kr.Actual != "" {
							fmt.Printf("            Target: %s | Actual: %s\n", kr.Target, kr.Actual)
						}
					}
				}
				fmt.Println()
			}
		}
	}

	// Guidance
	fmt.Println("💡 Insights:")
	if result.Overall.AchievementRate >= 80 {
		fmt.Println("   ✅ Strong execution - achieving most Key Results")
	} else if result.Overall.AchievementRate >= 60 {
		fmt.Println("   ⚠️  Moderate execution - some improvement needed")
	} else if result.Overall.AchievementRate >= 40 {
		fmt.Println("   ⚠️  Below target - review strategy and execution capacity")
	} else {
		fmt.Println("   🚨 Low achievement rate - consider strategic pivot or scope reduction")
	}

	if !aimVerbose {
		fmt.Println()
		fmt.Println("💡 Use --verbose for detailed OKR and KR breakdown")
	}
}

func printProgressSummary(summary *ProgressSummary, indent string) {
	fmt.Printf("%sTotal KRs:       %d\n", indent, summary.TotalKRs)
	fmt.Printf("%s✅ Exceeded:      %d (%d%%)\n", indent, summary.Exceeded,
		percentage(summary.Exceeded, summary.TotalKRs))
	fmt.Printf("%s✅ Met:           %d (%d%%)\n", indent, summary.Met,
		percentage(summary.Met, summary.TotalKRs))
	fmt.Printf("%s⚠️  Partially Met: %d (%d%%)\n", indent, summary.PartiallyMet,
		percentage(summary.PartiallyMet, summary.TotalKRs))
	fmt.Printf("%s❌ Missed:        %d (%d%%)\n", indent, summary.Missed,
		percentage(summary.Missed, summary.TotalKRs))
	fmt.Printf("%s📈 Achievement:   %.1f%%\n", indent, summary.AchievementRate)
}

func getStatusIcon(status string) string {
	switch strings.ToLower(status) {
	case "exceeded":
		return "✅"
	case "met":
		return "✅"
	case "partially_met", "partially met":
		return "⚠️"
	case "missed":
		return "❌"
	default:
		return "❓"
	}
}

// =============================================================================
// UTILITIES
// =============================================================================

// ensureLivingRealityAssessment checks if LRA exists and offers guidance if not
func ensureLivingRealityAssessment(instancePath string) error {
	if !lra.LRAExists(instancePath) {
		lraPath := lra.GetLRAPath(instancePath)
		return fmt.Errorf(`Living Reality Assessment not found at: %s

The Living Reality Assessment (LRA) is the foundational baseline for EPF.
It must exist before using other AIM commands.

To create your LRA, run:
  epf-cli aim bootstrap

This interactive wizard takes 5-30 minutes depending on your adoption level.`, lraPath)
	}
	return nil
}

func outputAimJSON(data interface{}) {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(jsonData))
}

func init() {
	// Register aim command
	rootCmd.AddCommand(aimCmd)

	// Register subcommands
	aimCmd.AddCommand(aimBootstrapCmd)
	aimCmd.AddCommand(aimStatusCmd)
	aimCmd.AddCommand(aimMigrateCmd)
	aimCmd.AddCommand(aimAssessCmd)
	aimCmd.AddCommand(aimValidateAssumptionsCmd)
	aimCmd.AddCommand(aimOkrProgressCmd)

	// Flags for assess command
	aimAssessCmd.Flags().BoolVar(&aimJSON, "json", false, "Output as JSON")
	aimAssessCmd.Flags().BoolVarP(&aimVerbose, "verbose", "v", false, "Show verbose output including YAML")

	// Flags for validate-assumptions command
	aimValidateAssumptionsCmd.Flags().BoolVar(&aimJSON, "json", false, "Output as JSON")
	aimValidateAssumptionsCmd.Flags().BoolVarP(&aimVerbose, "verbose", "v", false, "Show detailed validation evidence")

	// Flags for okr-progress command
	aimOkrProgressCmd.Flags().BoolVar(&aimJSON, "json", false, "Output as JSON")
	aimOkrProgressCmd.Flags().BoolVarP(&aimVerbose, "verbose", "v", false, "Show detailed progress breakdown")
	aimOkrProgressCmd.Flags().StringVar(&aimTrack, "track", "", "Filter by track (product/strategy/org_ops/commercial)")
	aimOkrProgressCmd.Flags().IntVar(&aimCycle, "cycle", 0, "Analyze specific cycle (default: most recent)")
	aimOkrProgressCmd.Flags().BoolVar(&aimAllCycles, "all-cycles", false, "Show trend analysis across all cycles")
}
