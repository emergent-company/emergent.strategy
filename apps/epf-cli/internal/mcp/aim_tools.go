package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lra"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// AIM BOOTSTRAP TOOL
// =============================================================================

// BootstrapParams represents parameters for the epf_aim_bootstrap tool
type BootstrapParams struct {
	InstancePath      string `json:"instance_path"`
	OrganizationType  string `json:"organization_type,omitempty"`
	FundingStage      string `json:"funding_stage,omitempty"`
	TeamSize          int    `json:"team_size,omitempty"`
	ProductStage      string `json:"product_stage,omitempty"`
	PrimaryBottleneck string `json:"primary_bottleneck,omitempty"`
	AICapabilityLevel string `json:"ai_capability_level,omitempty"`
	RunwayMonths      *int   `json:"runway_months,omitempty"`
	PrimaryObjective  string `json:"primary_objective,omitempty"`
	Force             bool   `json:"force,omitempty"`
}

// BootstrapResult represents the result of the bootstrap operation
type BootstrapResult struct {
	Success    bool                         `json:"success"`
	Path       string                       `json:"path"`
	LRA        *lra.LivingRealityAssessment `json:"lra,omitempty"`
	LRAContent string                       `json:"lra_content,omitempty"`
	NextSteps  []string                     `json:"next_steps"`
	Error      string                       `json:"error,omitempty"`
}

func (s *Server) handleAimBootstrap(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Parse parameters
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	forceStr, _ := request.RequireString("force")
	force := strings.ToLower(forceStr) == "true"

	// Check if LRA already exists
	if lra.LRAExists(instancePath) && !force {
		return mcp.NewToolResultText(fmt.Sprintf(`{
  "success": false,
  "error": "Living Reality Assessment already exists at: %s. Use force=true to overwrite.",
  "next_steps": [
    "Use force=true parameter to recreate LRA",
    "Or use epf_aim_status to view the existing LRA"
  ]
}`, lra.GetLRAPath(instancePath))), nil
	}

	// Parse optional parameters
	params := BootstrapParams{
		InstancePath: instancePath,
		Force:        force,
	}

	params.OrganizationType, _ = request.RequireString("organization_type")
	params.FundingStage, _ = request.RequireString("funding_stage")

	teamSizeStr, _ := request.RequireString("team_size")
	if teamSizeStr != "" {
		var teamSize int
		fmt.Sscanf(teamSizeStr, "%d", &teamSize)
		params.TeamSize = teamSize
	}

	params.ProductStage, _ = request.RequireString("product_stage")
	params.PrimaryBottleneck, _ = request.RequireString("primary_bottleneck")
	params.AICapabilityLevel, _ = request.RequireString("ai_capability_level")

	runwayStr, _ := request.RequireString("runway_months")
	if runwayStr != "" {
		var runway int
		fmt.Sscanf(runwayStr, "%d", &runway)
		params.RunwayMonths = &runway
	}

	params.PrimaryObjective, _ = request.RequireString("primary_objective")

	// Generate LRA
	newLRA := generateLRAFromParams(params)

	// Save LRA
	path := lra.GetLRAPath(instancePath)
	if err := lra.SaveLRA(path, newLRA); err != nil {
		result := BootstrapResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to save LRA: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Serialize LRA content for review
	lraContent, _ := yaml.Marshal(newLRA)

	result := BootstrapResult{
		Success:    true,
		Path:       path,
		LRA:        newLRA,
		LRAContent: string(lraContent),
		NextSteps: []string{
			"Review the generated LRA with epf_aim_status",
			"Edit the LRA file directly if adjustments needed",
			"Start creating READY phase artifacts",
		},
	}

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

func generateLRAFromParams(params BootstrapParams) *lra.LivingRealityAssessment {
	now := time.Now()

	// Determine adoption level from team size
	adoptionLevel := 0
	if params.TeamSize > 2 && params.TeamSize <= 5 {
		adoptionLevel = 1
	} else if params.TeamSize > 5 && params.TeamSize <= 15 {
		adoptionLevel = 2
	} else if params.TeamSize > 15 {
		adoptionLevel = 3
	}

	// Set defaults
	orgType := params.OrganizationType
	if orgType == "" {
		orgType = "solo_founder"
	}
	fundingStage := params.FundingStage
	if fundingStage == "" {
		fundingStage = "bootstrapped"
	}
	teamSize := params.TeamSize
	if teamSize == 0 {
		teamSize = 1
	}
	objective := params.PrimaryObjective
	if objective == "" {
		objective = "Build and validate core value proposition"
	}

	newLRA := &lra.LivingRealityAssessment{
		Metadata: lra.Metadata{
			CreatedAt:             &now,
			CreatedBy:             "epf-cli-mcp-bootstrap",
			LastUpdated:           &now,
			LastUpdatedBy:         "epf-cli-mcp-bootstrap",
			LifecycleStage:        "bootstrap",
			CyclesCompleted:       0,
			AdoptionLevel:         adoptionLevel,
			BootstrapTimeInvested: "< 1 min",
			BootstrapType:         "initial_adoption",
		},
		AdoptionContext: lra.AdoptionContext{
			OrganizationType:  orgType,
			FundingStage:      fundingStage,
			TeamSize:          teamSize,
			AICapabilityLevel: params.AICapabilityLevel,
			PrimaryBottleneck: params.PrimaryBottleneck,
		},
		TrackBaselines: map[string]lra.TrackBaseline{
			"product": {
				Maturity: "implicit",
				Status:   "emerging",
			},
			"strategy": {
				Maturity: "absent",
				Status:   "not_started",
			},
			"org_ops": {
				Maturity: "absent",
				Status:   "not_applicable",
			},
			"commercial": {
				Maturity: "absent",
				Status:   "not_started",
			},
		},
		CurrentFocus: lra.CurrentFocus{
			CycleReference:   "C0-bootstrap",
			PrimaryTrack:     "product",
			SecondaryTrack:   "none",
			PrimaryObjective: objective,
		},
		EvolutionLog: []lra.EvolutionEntry{
			{
				CycleReference: "bootstrap",
				Timestamp:      &now,
				UpdatedBy:      "epf-cli-mcp-bootstrap",
				Trigger:        "bootstrap_complete",
				Summary:        "Initial reality baseline established via MCP tool",
				Changes: []lra.ChangeDetail{
					{
						Section:    "metadata",
						Field:      "lifecycle_stage",
						ChangeType: "created",
						NewValue:   "bootstrap",
						Reason:     "MCP-driven bootstrap creation",
					},
				},
			},
		},
	}

	// Set optional runway
	if params.RunwayMonths != nil {
		runway := float64(*params.RunwayMonths)
		newLRA.AdoptionContext.RunwayMonths = &runway
	}

	return newLRA
}

// =============================================================================
// AIM STATUS TOOL
// =============================================================================

// StatusResult represents the LRA status summary
type StatusResult struct {
	Exists          bool                    `json:"exists"`
	Path            string                  `json:"path"`
	LifecycleStage  string                  `json:"lifecycle_stage,omitempty"`
	AdoptionLevel   int                     `json:"adoption_level,omitempty"`
	CyclesCompleted int                     `json:"cycles_completed,omitempty"`
	Context         *AdoptionContextSummary `json:"adoption_context,omitempty"`
	TrackBaselines  map[string]TrackStatus  `json:"track_baselines,omitempty"`
	CurrentFocus    *FocusSummary           `json:"current_focus,omitempty"`
	Warnings        []string                `json:"warnings,omitempty"`
	Error           string                  `json:"error,omitempty"`
}

type AdoptionContextSummary struct {
	OrganizationType  string   `json:"organization_type"`
	FundingStage      string   `json:"funding_stage"`
	TeamSize          int      `json:"team_size"`
	AICapabilityLevel string   `json:"ai_capability_level,omitempty"`
	PrimaryBottleneck string   `json:"primary_bottleneck,omitempty"`
	RunwayMonths      *float64 `json:"runway_months,omitempty"`
}

type TrackStatus struct {
	Maturity string `json:"maturity"`
	Status   string `json:"status"`
}

type FocusSummary struct {
	CycleReference   string `json:"cycle_reference"`
	PrimaryTrack     string `json:"primary_track"`
	PrimaryObjective string `json:"primary_objective"`
}

func (s *Server) handleAimStatus(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	path := lra.GetLRAPath(instancePath)

	// Check if LRA exists
	if !lra.LRAExists(instancePath) {
		result := StatusResult{
			Exists: false,
			Path:   path,
			Error:  "Living Reality Assessment not found. Run epf_aim_bootstrap to create one.",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Load LRA
	loadedLRA, err := lra.LoadLRA(path)
	if err != nil {
		result := StatusResult{
			Exists: true,
			Path:   path,
			Error:  fmt.Sprintf("Failed to load LRA: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Build status result
	result := StatusResult{
		Exists:          true,
		Path:            path,
		LifecycleStage:  loadedLRA.Metadata.LifecycleStage,
		AdoptionLevel:   loadedLRA.Metadata.AdoptionLevel,
		CyclesCompleted: loadedLRA.Metadata.CyclesCompleted,
		Context: &AdoptionContextSummary{
			OrganizationType:  loadedLRA.AdoptionContext.OrganizationType,
			FundingStage:      loadedLRA.AdoptionContext.FundingStage,
			TeamSize:          loadedLRA.AdoptionContext.TeamSize,
			AICapabilityLevel: loadedLRA.AdoptionContext.AICapabilityLevel,
			PrimaryBottleneck: loadedLRA.AdoptionContext.PrimaryBottleneck,
			RunwayMonths:      loadedLRA.AdoptionContext.RunwayMonths,
		},
		TrackBaselines: make(map[string]TrackStatus),
		CurrentFocus: &FocusSummary{
			CycleReference:   loadedLRA.CurrentFocus.CycleReference,
			PrimaryTrack:     loadedLRA.CurrentFocus.PrimaryTrack,
			PrimaryObjective: loadedLRA.CurrentFocus.PrimaryObjective,
		},
		Warnings: []string{},
	}

	// Copy track baselines
	for track, baseline := range loadedLRA.TrackBaselines {
		result.TrackBaselines[track] = TrackStatus{
			Maturity: baseline.Maturity,
			Status:   baseline.Status,
		}
	}

	// Add warnings
	if loadedLRA.AdoptionContext.RunwayMonths != nil && *loadedLRA.AdoptionContext.RunwayMonths < 6 {
		result.Warnings = append(result.Warnings, fmt.Sprintf("Low runway: %.1f months", *loadedLRA.AdoptionContext.RunwayMonths))
	}

	for track, baseline := range loadedLRA.TrackBaselines {
		if baseline.Maturity == "absent" && baseline.Status != "not_applicable" {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Track '%s' has absent maturity but is not marked as not_applicable", track))
		}
	}

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

// =============================================================================
// AIM ASSESS TOOL
// =============================================================================

// AssessResult represents the generated assessment template
type AssessResult struct {
	Success         bool     `json:"success"`
	RoadmapID       string   `json:"roadmap_id"`
	Cycle           int      `json:"cycle"`
	OKRCount        int      `json:"okr_count"`
	AssumptionCount int      `json:"assumption_count"`
	Content         string   `json:"content"`
	NextSteps       []string `json:"next_steps"`
	Error           string   `json:"error,omitempty"`
}

func (s *Server) handleAimAssess(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	roadmapID, _ := request.RequireString("roadmap_id")

	// Check LRA exists
	if !lra.LRAExists(instancePath) {
		result := AssessResult{
			Success: false,
			Error:   "Living Reality Assessment not found. Run epf_aim_bootstrap first.",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Load roadmap
	roadmapPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	roadmapData, err := loadRoadmapData(roadmapPath)
	if err != nil {
		result := AssessResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to load roadmap: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Use provided roadmap ID or from file
	if roadmapID == "" {
		roadmapID = roadmapData.Roadmap.ID
	}

	// Generate assessment template
	assessment := generateAssessmentTemplate(roadmapData, roadmapID)

	// Serialize to YAML
	yamlContent, err := yaml.Marshal(assessment)
	if err != nil {
		result := AssessResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to generate YAML: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	result := AssessResult{
		Success:         true,
		RoadmapID:       roadmapID,
		Cycle:           roadmapData.Roadmap.Cycle,
		OKRCount:        len(assessment.OKRAssessments),
		AssumptionCount: len(assessment.Assumptions),
		Content:         string(yamlContent),
		NextSteps: []string{
			"Review the generated template",
			"Fill in TODO sections with actual data",
			"Gather quantitative metrics from analytics",
			"Collect qualitative insights",
			"Assess KR status (exceeded/met/partially_met/missed)",
			"Save to AIM/assessment_report.yaml",
		},
	}

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

// =============================================================================
// AIM VALIDATE-ASSUMPTIONS TOOL
// =============================================================================

// ValidateAssumptionsResult represents assumption validation status
type ValidateAssumptionsResult struct {
	Success bool                         `json:"success"`
	Summary AssumptionsSummary           `json:"summary"`
	Details []AssumptionValidationDetail `json:"details,omitempty"`
	Error   string                       `json:"error,omitempty"`
}

type AssumptionsSummary struct {
	Total        int `json:"total"`
	Validated    int `json:"validated"`
	Invalidated  int `json:"invalidated"`
	Inconclusive int `json:"inconclusive"`
	Pending      int `json:"pending"`
}

type AssumptionValidationDetail struct {
	ID        string `json:"id"`
	Statement string `json:"statement"`
	Track     string `json:"track"`
	Status    string `json:"status"`
	Evidence  string `json:"evidence,omitempty"`
}

func (s *Server) handleAimValidateAssumptions(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	verboseStr, _ := request.RequireString("verbose")
	verbose := strings.ToLower(verboseStr) == "true"

	// Check LRA exists
	if !lra.LRAExists(instancePath) {
		result := ValidateAssumptionsResult{
			Success: false,
			Error:   "Living Reality Assessment not found. Run epf_aim_bootstrap first.",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Load roadmap
	roadmapPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	roadmapData, err := loadRoadmapData(roadmapPath)
	if err != nil {
		result := ValidateAssumptionsResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to load roadmap: %v", err),
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Load assessment reports
	aimDir := filepath.Join(instancePath, "AIM")
	assessments := loadAssessmentFiles(aimDir)

	// Build evidence map
	evidenceMap := make(map[string]AssumptionCheckData)
	for _, assessment := range assessments {
		for _, check := range assessment.Assumptions {
			evidenceMap[check.AssumptionID] = check
		}
	}

	// Validate assumptions
	result := ValidateAssumptionsResult{
		Success: true,
		Summary: AssumptionsSummary{},
		Details: []AssumptionValidationDetail{},
	}

	tracks := map[string]TrackDataForAIM{
		"product":    roadmapData.Roadmap.Tracks.Product,
		"strategy":   roadmapData.Roadmap.Tracks.Strategy,
		"org_ops":    roadmapData.Roadmap.Tracks.OrgOps,
		"commercial": roadmapData.Roadmap.Tracks.Commercial,
	}

	for trackName, track := range tracks {
		for _, assumption := range track.Assumptions {
			detail := AssumptionValidationDetail{
				ID:        assumption.ID,
				Statement: assumption.Statement,
				Track:     trackName,
			}

			if evidence, found := evidenceMap[assumption.ID]; found {
				detail.Status = evidence.Status
				if verbose {
					detail.Evidence = evidence.Evidence
				}

				switch strings.ToLower(evidence.Status) {
				case "validated":
					result.Summary.Validated++
				case "invalidated":
					result.Summary.Invalidated++
				case "inconclusive":
					result.Summary.Inconclusive++
				default:
					detail.Status = "pending"
					result.Summary.Pending++
				}
			} else {
				detail.Status = "pending"
				result.Summary.Pending++
			}

			result.Summary.Total++
			result.Details = append(result.Details, detail)
		}
	}

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

// =============================================================================
// AIM OKR-PROGRESS TOOL
// =============================================================================

// OKRProgressResult represents OKR achievement rates
type OKRProgressResult struct {
	Success  bool                           `json:"success"`
	Overall  ProgressSummaryData            `json:"overall"`
	ByTrack  map[string]ProgressSummaryData `json:"by_track,omitempty"`
	Cycles   []CycleProgressData            `json:"cycles,omitempty"`
	Insights []string                       `json:"insights"`
	Error    string                         `json:"error,omitempty"`
}

type ProgressSummaryData struct {
	TotalKRs        int     `json:"total_krs"`
	Exceeded        int     `json:"exceeded"`
	Met             int     `json:"met"`
	PartiallyMet    int     `json:"partially_met"`
	Missed          int     `json:"missed"`
	AchievementRate float64 `json:"achievement_rate"`
}

type CycleProgressData struct {
	Cycle   int                 `json:"cycle"`
	Summary ProgressSummaryData `json:"summary"`
}

func (s *Server) handleAimOKRProgress(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	trackFilter, _ := request.RequireString("track")

	cycleFilter := 0
	cycleStr, _ := request.RequireString("cycle")
	if cycleStr != "" {
		fmt.Sscanf(cycleStr, "%d", &cycleFilter)
	}

	allCyclesStr, _ := request.RequireString("all_cycles")
	allCycles := strings.ToLower(allCyclesStr) == "true"

	// Check LRA exists
	if !lra.LRAExists(instancePath) {
		result := OKRProgressResult{
			Success: false,
			Error:   "Living Reality Assessment not found. Run epf_aim_bootstrap first.",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Load assessment reports
	aimDir := filepath.Join(instancePath, "AIM")
	assessments := loadAssessmentFiles(aimDir)

	if len(assessments) == 0 {
		result := OKRProgressResult{
			Success: false,
			Error:   "No assessment reports found. Run epf_aim_assess first and fill in KR statuses.",
		}
		jsonData, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(jsonData)), nil
	}

	// Calculate progress
	result := OKRProgressResult{
		Success:  true,
		Overall:  ProgressSummaryData{},
		ByTrack:  make(map[string]ProgressSummaryData),
		Cycles:   []CycleProgressData{},
		Insights: []string{},
	}

	for _, assessment := range assessments {
		if cycleFilter > 0 && assessment.Cycle != cycleFilter {
			continue
		}

		cycleProgress := CycleProgressData{
			Cycle:   assessment.Cycle,
			Summary: ProgressSummaryData{},
		}

		for _, okrAssess := range assessment.OKRAssessments {
			track := getTrackFromID(okrAssess.OKRID)

			if trackFilter != "" && track != trackFilter {
				continue
			}

			for _, krOutcome := range okrAssess.KeyResultOutcomes {
				switch strings.ToLower(krOutcome.Status) {
				case "exceeded":
					result.Overall.Exceeded++
					cycleProgress.Summary.Exceeded++
					trackSummary := result.ByTrack[track]
					trackSummary.Exceeded++
					result.ByTrack[track] = trackSummary
				case "met":
					result.Overall.Met++
					cycleProgress.Summary.Met++
					trackSummary := result.ByTrack[track]
					trackSummary.Met++
					result.ByTrack[track] = trackSummary
				case "partially_met", "partially met":
					result.Overall.PartiallyMet++
					cycleProgress.Summary.PartiallyMet++
					trackSummary := result.ByTrack[track]
					trackSummary.PartiallyMet++
					result.ByTrack[track] = trackSummary
				case "missed":
					result.Overall.Missed++
					cycleProgress.Summary.Missed++
					trackSummary := result.ByTrack[track]
					trackSummary.Missed++
					result.ByTrack[track] = trackSummary
				default:
					continue
				}

				result.Overall.TotalKRs++
				cycleProgress.Summary.TotalKRs++
				trackSummary := result.ByTrack[track]
				trackSummary.TotalKRs++
				result.ByTrack[track] = trackSummary
			}
		}

		// Calculate cycle achievement rate
		if cycleProgress.Summary.TotalKRs > 0 {
			cycleProgress.Summary.AchievementRate = float64(cycleProgress.Summary.Exceeded+cycleProgress.Summary.Met) /
				float64(cycleProgress.Summary.TotalKRs) * 100
		}

		if allCycles || cycleFilter > 0 {
			result.Cycles = append(result.Cycles, cycleProgress)
		}
	}

	// Calculate overall achievement rate
	if result.Overall.TotalKRs > 0 {
		result.Overall.AchievementRate = float64(result.Overall.Exceeded+result.Overall.Met) /
			float64(result.Overall.TotalKRs) * 100
	}

	// Calculate track achievement rates
	for track, summary := range result.ByTrack {
		if summary.TotalKRs > 0 {
			summary.AchievementRate = float64(summary.Exceeded+summary.Met) /
				float64(summary.TotalKRs) * 100
			result.ByTrack[track] = summary
		}
	}

	// Add insights
	if result.Overall.AchievementRate >= 80 {
		result.Insights = append(result.Insights, "Strong execution - achieving most Key Results")
	} else if result.Overall.AchievementRate >= 60 {
		result.Insights = append(result.Insights, "Moderate execution - some improvement needed")
	} else if result.Overall.AchievementRate >= 40 {
		result.Insights = append(result.Insights, "Below target - review strategy and execution capacity")
	} else if result.Overall.TotalKRs > 0 {
		result.Insights = append(result.Insights, "Low achievement rate - consider strategic pivot or scope reduction")
	}

	jsonData, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(jsonData)), nil
}

// =============================================================================
// HELPER TYPES AND FUNCTIONS
// =============================================================================

// RoadmapDataForAIM represents roadmap structure for AIM tools
type RoadmapDataForAIM struct {
	Roadmap struct {
		ID         string `yaml:"id"`
		StrategyID string `yaml:"strategy_id"`
		Cycle      int    `yaml:"cycle"`
		Timeframe  string `yaml:"timeframe"`
		Tracks     struct {
			Product    TrackDataForAIM `yaml:"product"`
			Strategy   TrackDataForAIM `yaml:"strategy"`
			OrgOps     TrackDataForAIM `yaml:"org_ops"`
			Commercial TrackDataForAIM `yaml:"commercial"`
		} `yaml:"tracks"`
	} `yaml:"roadmap"`
}

type TrackDataForAIM struct {
	OKRs        []OKRDataForAIM        `yaml:"okrs"`
	Assumptions []AssumptionDataForAIM `yaml:"riskiest_assumptions"`
}

type OKRDataForAIM struct {
	ID         string         `yaml:"id"`
	Objective  string         `yaml:"objective"`
	KeyResults []KRDataForAIM `yaml:"key_results"`
}

type KRDataForAIM struct {
	ID          string `yaml:"id"`
	Description string `yaml:"description"`
	Target      string `yaml:"target,omitempty"`
}

type AssumptionDataForAIM struct {
	ID         string `yaml:"id"`
	Statement  string `yaml:"statement"`
	Risk       string `yaml:"risk,omitempty"`
	Validation string `yaml:"validation_approach,omitempty"`
}

// AssessmentReportData represents loaded assessment report
type AssessmentReportData struct {
	RoadmapID      string                `yaml:"roadmap_id"`
	Cycle          int                   `yaml:"cycle"`
	OKRAssessments []OKRAssessmentData   `yaml:"okr_assessments"`
	Assumptions    []AssumptionCheckData `yaml:"assumption_validations"`
}

type OKRAssessmentData struct {
	OKRID             string          `yaml:"okr_id"`
	KeyResultOutcomes []KROutcomeData `yaml:"key_result_outcomes"`
}

type KROutcomeData struct {
	KRID   string `yaml:"kr_id"`
	Target string `yaml:"target"`
	Actual string `yaml:"actual"`
	Status string `yaml:"status"`
}

type AssumptionCheckData struct {
	AssumptionID string `yaml:"assumption_id"`
	Status       string `yaml:"status"`
	Evidence     string `yaml:"evidence"`
}

// Assessment template types
type AssessmentTemplateData struct {
	Meta struct {
		EPFVersion  string `yaml:"epf_version"`
		LastUpdated string `yaml:"last_updated"`
	} `yaml:"meta"`
	RoadmapID      string                      `yaml:"roadmap_id"`
	Cycle          int                         `yaml:"cycle"`
	OKRAssessments []OKRAssessmentTemplateData `yaml:"okr_assessments"`
	Assumptions    []AssumptionTemplateData    `yaml:"assumption_validations"`
}

type OKRAssessmentTemplateData struct {
	OKRID             string                  `yaml:"okr_id"`
	Assessment        string                  `yaml:"assessment"`
	KeyResultOutcomes []KROutcomeTemplateData `yaml:"key_result_outcomes"`
}

type KROutcomeTemplateData struct {
	KRID   string `yaml:"kr_id"`
	Target string `yaml:"target"`
	Actual string `yaml:"actual"`
	Status string `yaml:"status"`
}

type AssumptionTemplateData struct {
	AssumptionID string `yaml:"assumption_id"`
	Status       string `yaml:"status"`
	Evidence     string `yaml:"evidence"`
}

func loadRoadmapData(path string) (*RoadmapDataForAIM, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read roadmap file: %w", err)
	}

	var roadmap RoadmapDataForAIM
	if err := yaml.Unmarshal(data, &roadmap); err != nil {
		return nil, fmt.Errorf("failed to parse roadmap YAML: %w", err)
	}

	return &roadmap, nil
}

func loadAssessmentFiles(aimDir string) []AssessmentReportData {
	files, err := filepath.Glob(filepath.Join(aimDir, "*assessment_report*.yaml"))
	if err != nil || len(files) == 0 {
		return []AssessmentReportData{}
	}

	var assessments []AssessmentReportData
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}

		var assessment AssessmentReportData
		if err := yaml.Unmarshal(data, &assessment); err != nil {
			continue
		}

		assessments = append(assessments, assessment)
	}

	return assessments
}

func generateAssessmentTemplate(roadmap *RoadmapDataForAIM, roadmapID string) *AssessmentTemplateData {
	assessment := &AssessmentTemplateData{
		RoadmapID: roadmapID,
		Cycle:     roadmap.Roadmap.Cycle,
	}
	assessment.Meta.EPFVersion = "1.13.0"
	assessment.Meta.LastUpdated = "TODO: Add current date"

	tracks := map[string]TrackDataForAIM{
		"product":    roadmap.Roadmap.Tracks.Product,
		"strategy":   roadmap.Roadmap.Tracks.Strategy,
		"org_ops":    roadmap.Roadmap.Tracks.OrgOps,
		"commercial": roadmap.Roadmap.Tracks.Commercial,
	}

	for trackName, track := range tracks {
		for _, okr := range track.OKRs {
			okrAssess := OKRAssessmentTemplateData{
				OKRID:      okr.ID,
				Assessment: fmt.Sprintf("TODO: Assessment for %s (%s track)", okr.ID, trackName),
			}

			for _, kr := range okr.KeyResults {
				target := kr.Target
				if target == "" {
					target = "TODO: Define target"
				}
				krOutcome := KROutcomeTemplateData{
					KRID:   kr.ID,
					Target: target,
					Actual: "TODO: Actual outcome",
					Status: "TODO: exceeded/met/partially_met/missed",
				}
				okrAssess.KeyResultOutcomes = append(okrAssess.KeyResultOutcomes, krOutcome)
			}

			assessment.OKRAssessments = append(assessment.OKRAssessments, okrAssess)
		}

		for _, assumption := range track.Assumptions {
			assumptionCheck := AssumptionTemplateData{
				AssumptionID: assumption.ID,
				Status:       "TODO: validated/invalidated/inconclusive/pending",
				Evidence:     fmt.Sprintf("TODO: Evidence for: %s", assumption.Statement),
			}
			assessment.Assumptions = append(assessment.Assumptions, assumptionCheck)
		}
	}

	return assessment
}

func getTrackFromID(okrID string) string {
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
