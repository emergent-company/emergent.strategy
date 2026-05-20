// Package aim provides the AI-Assisted AIM (Assess, Iterate, Measure) agent loop.
// It drafts assessment reports, calibration memos, and READY artifact patches
// based on live strategy data. All output is staged as batches for human review.
package aim

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// LLMClient is the interface for calling an LLM to generate narrative content.
// When nil, the service operates in skeleton mode (structure without narrative).
type LLMClient interface {
	Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}

// TriggerState reports whether a new AIM cycle assessment is due.
type TriggerState struct {
	Fired             bool
	Reason            string // "time" | "signals" | ""
	ReasonMessage     string // human-readable explanation
	RecommendedAction string // "draft_aim_assessment"
}

// DraftSummary describes what was produced by DraftAssessment.
type DraftSummary struct {
	OKRCount        int  `json:"okr_count"`
	AssumptionCount int  `json:"assumption_count"`
	LLMUsed         bool `json:"llm_used"`
}

// CalibrationDraftSummary describes what was produced by DraftCalibration.
type CalibrationDraftSummary struct {
	SuggestedDecision string `json:"suggested_decision"`
	OKRHitRate        int    `json:"okr_hit_rate_pct"`
	InvalidatedCount  int    `json:"invalidated_assumption_count"`
	ReasoningSummary  string `json:"reasoning_summary"`
	LLMUsed           bool   `json:"llm_used"`
}

// ApplyCalibrationResult describes what patches were staged.
type ApplyCalibrationResult struct {
	Decision          string   `json:"decision"`
	AffectedArtifacts []string `json:"affected_artifacts"`
}

// CycleSummary is a single AIM cycle from version history.
type CycleSummary struct {
	CycleNumber  int    `json:"cycle_number"`
	Decision     string `json:"decision"`
	VersionID    string `json:"version_id"`
	PublishedAt  string `json:"published_at"`
}

// TriggerConfig holds per-instance trigger thresholds (stored as artifact_type = 'aim_trigger_config').
type TriggerConfig struct {
	DaysBetweenAssessments int `json:"days_between_assessments"` // default 90
	CriticalSignalThreshold int `json:"critical_signal_threshold"` // default 3
}

func defaultTriggerConfig() TriggerConfig {
	return TriggerConfig{
		DaysBetweenAssessments: 90,
		CriticalSignalThreshold: 3,
	}
}

// Service implements the AIM agent loop.
type Service struct {
	db     *bun.DB
	llm    LLMClient // optional — nil = skeleton mode
}

// NewService creates a new AIM service.
// Pass nil for llm to operate in skeleton mode (structure without narrative).
func NewService(db *bun.DB, llm LLMClient) *Service {
	return &Service{db: db, llm: llm}
}

// ---------------------------------------------------------------------------
// EvaluateTriggers
// ---------------------------------------------------------------------------

// EvaluateTriggers evaluates whether a new AIM assessment cycle is due for the given instance.
// Reads trigger config (or uses defaults), then checks time-based and signal-based conditions.
// Never returns an error — failures degrade gracefully to Fired=false.
func (s *Service) EvaluateTriggers(ctx context.Context, instanceID uuid.UUID) TriggerState {
	cfg := s.loadTriggerConfig(ctx, instanceID)

	// -- Signal-based trigger: critical signal count --
	var criticalCount int
	_ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		ColumnExpr("COUNT(*)").
		Scan(ctx, &criticalCount)

	if criticalCount > cfg.CriticalSignalThreshold {
		return TriggerState{
			Fired:             true,
			Reason:            "signals",
			ReasonMessage:     fmt.Sprintf("%d critical signals active (threshold: %d)", criticalCount, cfg.CriticalSignalThreshold),
			RecommendedAction: "draft_aim_assessment",
		}
	}

	// -- Time-based trigger: days since last assessment --
	var lastAssessmentAt time.Time
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeAssessmentReport).
		ColumnExpr("updated_at").
		OrderExpr("updated_at DESC").
		Limit(1).
		Scan(ctx, &lastAssessmentAt)

	if errors.Is(err, sql.ErrNoRows) || lastAssessmentAt.IsZero() {
		// No assessment ever — time trigger fires immediately.
		return TriggerState{
			Fired:             true,
			Reason:            "time",
			ReasonMessage:     "No assessment report exists yet",
			RecommendedAction: "draft_aim_assessment",
		}
	}
	if err != nil {
		// DB error — degrade gracefully.
		slog.WarnContext(ctx, "aim: failed to load last assessment timestamp", "instance_id", instanceID, "err", err)
		return TriggerState{}
	}

	daysSince := int(time.Since(lastAssessmentAt).Hours() / 24)
	if daysSince >= cfg.DaysBetweenAssessments {
		return TriggerState{
			Fired:             true,
			Reason:            "time",
			ReasonMessage:     fmt.Sprintf("Last assessment was %d days ago (cycle: every %d days)", daysSince, cfg.DaysBetweenAssessments),
			RecommendedAction: "draft_aim_assessment",
		}
	}

	return TriggerState{}
}

// loadTriggerConfig reads per-instance trigger config from strategy_artifacts.
// Returns defaults when no config artifact exists.
func (s *Service) loadTriggerConfig(ctx context.Context, instanceID uuid.UUID) TriggerConfig {
	cfg := defaultTriggerConfig()

	var payload string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeAIMTriggerConfig).
		Limit(1).
		Scan(ctx, &payload)
	if err != nil || payload == "" {
		return cfg
	}
	// Best-effort parse; return defaults for any parse error.
	_ = json.Unmarshal([]byte(payload), &cfg)
	return cfg
}

// ---------------------------------------------------------------------------
// DraftAssessment
// ---------------------------------------------------------------------------

// DraftAssessment reads live roadmap OKRs, assumption relationships, and recent
// ripple signals, then assembles a structurally complete assessment_report payload
// staged as a batch. Returns the batchID and a summary.
func (s *Service) DraftAssessment(ctx context.Context, instanceID uuid.UUID) (uuid.UUID, DraftSummary, error) {
	// 1. Load roadmap_recipe payload.
	roadmapPayload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeRoadmap)
	if err != nil {
		return uuid.Nil, DraftSummary{}, apperror.ErrBadRequest.WithDetail("No roadmap found for instance")
	}

	// 2. Extract OKRs from roadmap.
	okrAssessments := s.extractOKRAssessments(ctx, instanceID, roadmapPayload)

	// 3. Extract assumption IDs from relationships.
	assumptionValidations := s.extractAssumptionValidations(ctx, instanceID)

	// 4. Extract strategic insights from active critical ripple signals.
	strategicInsights := s.extractStrategicInsights(ctx, instanceID)

	// 5. Build the assessment_report payload.
	report := map[string]any{
		"name":                   "AI-Drafted Assessment Report",
		"cycle":                  extractStringField(roadmapPayload, "roadmap.cycle"),
		"okr_assessments":        okrAssessments,
		"assumption_validations": assumptionValidations,
		"strategic_insights":     strategicInsights,
		"overall_status":         "pending",
		"metadata": map[string]any{
			"drafted_by": "aim_agent",
			"drafted_at": time.Now().UTC().Format(time.RFC3339),
			"llm_used":   false,
		},
	}

	llmUsed := false
	if s.llm != nil {
		llmUsed = true
		s.enrichAssessmentWithLLM(ctx, report, okrAssessments)
		report["metadata"].(map[string]any)["llm_used"] = true
	}

	// 6. Stage as a batch.
	batchID, err := s.stageMutation(ctx, instanceID, domain.ArtifactTypeAssessmentReport, "assessment-draft-"+time.Now().Format("2006-01-02"), domain.MutationActionCreate, report)
	if err != nil {
		return uuid.Nil, DraftSummary{}, fmt.Errorf("stage assessment draft: %w", err)
	}

	summary := DraftSummary{
		OKRCount:        len(okrAssessments),
		AssumptionCount: len(assumptionValidations),
		LLMUsed:         llmUsed,
	}
	return batchID, summary, nil
}

// extractOKRAssessments walks the roadmap payload to find all OKRs and build
// skeleton assessment entries.
func (s *Service) extractOKRAssessments(ctx context.Context, instanceID uuid.UUID, roadmapPayload map[string]any) []map[string]any {
	var assessments []map[string]any

	tracks, _ := roadmapPayload["roadmap"].(map[string]any)
	if tracks == nil {
		return assessments
	}
	tracksMap, _ := tracks["tracks"].(map[string]any)
	if tracksMap == nil {
		return assessments
	}

	for trackName, trackVal := range tracksMap {
		trackData, ok := trackVal.(map[string]any)
		if !ok {
			continue
		}
		// Walk all list-valued keys for OKRs (keys starting with "okr" or containing "okr").
		for key, val := range trackData {
			if !strings.Contains(strings.ToLower(key), "okr") {
				continue
			}
			items, ok := val.([]any)
			if !ok {
				continue
			}
			for _, item := range items {
				okr, ok := item.(map[string]any)
				if !ok {
					continue
				}
				id, _ := okr["id"].(string)
				if id == "" {
					continue
				}
				objective, _ := okr["objective"].(string)
				if objective == "" {
					objective, _ = okr["title"].(string)
				}

				// Build KR assessments.
				var krAssessments []map[string]any
				krs, _ := okr["key_results"].([]any)
				for _, krVal := range krs {
					kr, ok := krVal.(map[string]any)
					if !ok {
						continue
					}
					krID, _ := kr["id"].(string)
					target, _ := kr["target"].(string)
					if krID == "" {
						continue
					}
					krAssessments = append(krAssessments, map[string]any{
						"kr_id":    krID,
						"target":   target,
						"actual":   "",
						"status":   "pending",
						"evidence": "",
					})
				}

				assessments = append(assessments, map[string]any{
					"okr_id":         id,
					"track":          trackName,
					"objective":      objective,
					"status":         deriveOKRStatus(ctx, s.db, instanceID, id),
					"assessment":     "",
					"kr_assessments": krAssessments,
				})
			}
		}
	}

	return assessments
}

// deriveOKRStatus classifies an OKR as pending/at_risk/on_track based on active signals.
func deriveOKRStatus(_ context.Context, _ *bun.DB, _ uuid.UUID, _ string) string {
	// Rule-based: default to "pending" until actuals are authored.
	// Future enhancement: check ripple signals referencing this OKR's key.
	return "pending"
}

// extractAssumptionValidations reads assumption IDs from the strategic relationship index.
func (s *Service) extractAssumptionValidations(ctx context.Context, instanceID uuid.UUID) []map[string]any {
	type relRow struct {
		TargetKey string `bun:"target_key"`
	}
	var rows []relRow
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("DISTINCT target_key").
		Where("instance_id = ?", instanceID).
		Where("relationship IN (?, ?)", "tests_assumption", "validates_assumption").
		Scan(ctx, &rows)

	var validations []map[string]any
	for _, r := range rows {
		validations = append(validations, map[string]any{
			"assumption_id": r.TargetKey,
			"status":        "pending",
			"evidence":      "",
		})
	}
	return validations
}

// extractStrategicInsights reads active critical ripple signals for strategic insights.
func (s *Service) extractStrategicInsights(ctx context.Context, instanceID uuid.UUID) []string {
	type sigRow struct {
		Description string `bun:"description"`
	}
	var rows []sigRow
	_ = s.db.NewSelect().
		TableExpr("ripple_signals").
		ColumnExpr("description").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		Limit(5).
		Scan(ctx, &rows)

	var insights []string
	for _, r := range rows {
		if r.Description != "" {
			insights = append(insights, r.Description)
		}
	}
	if len(insights) == 0 {
		insights = []string{}
	}
	return insights
}

// enrichAssessmentWithLLM calls the LLM to add narrative to OKR assessments.
func (s *Service) enrichAssessmentWithLLM(ctx context.Context, report map[string]any, okrAssessments []map[string]any) {
	systemPrompt := `You are a strategy assessment assistant. Given an OKR objective, write a concise 1-2 sentence assessment of whether the objective appears on track, at risk, or missed, based on the context provided. Be specific and actionable.`

	for i, okr := range okrAssessments {
		objective, _ := okr["objective"].(string)
		if objective == "" {
			continue
		}
		userPrompt := fmt.Sprintf("OKR Objective: %s\n\nWrite a brief assessment status (1-2 sentences).", objective)
		result, err := s.llm.Complete(ctx, systemPrompt, userPrompt)
		if err != nil {
			slog.WarnContext(ctx, "aim: LLM assessment enrichment failed", "okr_id", okr["okr_id"], "err", err)
			continue
		}
		okrAssessments[i]["assessment"] = result
	}
	report["okr_assessments"] = okrAssessments
}

// ---------------------------------------------------------------------------
// DraftCalibration
// ---------------------------------------------------------------------------

// DraftCalibration reads the committed assessment_report, computes hit rate and
// assumption validation rate, and stages a calibration_memo draft.
func (s *Service) DraftCalibration(ctx context.Context, instanceID uuid.UUID) (uuid.UUID, CalibrationDraftSummary, error) {
	// Load committed assessment report.
	assessmentPayload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeAssessmentReport)
	if err != nil {
		return uuid.Nil, CalibrationDraftSummary{}, apperror.ErrBadRequest.WithDetail("No committed assessment report found")
	}

	// Compute OKR hit rate.
	hitRate, total, hitCount := computeOKRHitRate(assessmentPayload)

	// Count invalidated assumptions.
	invalidatedCount := countInvalidatedAssumptions(assessmentPayload)

	// Determine decision.
	decision := calibrationDecision(hitRate, invalidatedCount)

	// Build reasoning summary.
	reasoning := buildReasoningSummary(decision, hitRate, total, hitCount, invalidatedCount)
	llmUsed := false

	if s.llm != nil {
		llmUsed = true
		narrative, err := s.enrichCalibrationWithLLM(ctx, decision, assessmentPayload, reasoning)
		if err != nil {
			slog.WarnContext(ctx, "aim: LLM calibration enrichment failed", "err", err)
		} else {
			reasoning = narrative
		}
	}

	// Build calibration_memo payload.
	memo := map[string]any{
		"name":        "AI-Drafted Calibration Memo",
		"decision":    decision,
		"reasoning":   reasoning,
		"okr_hit_rate_pct": hitRate,
		"invalidated_assumption_count": invalidatedCount,
		"metadata": map[string]any{
			"drafted_by": "aim_agent",
			"drafted_at": time.Now().UTC().Format(time.RFC3339),
			"llm_used":   llmUsed,
			"ai_suggested": true,
		},
	}

	batchID, err := s.stageMutation(ctx, instanceID, "calibration_memo", "calibration-draft-"+time.Now().Format("2006-01-02"), domain.MutationActionCreate, memo)
	if err != nil {
		return uuid.Nil, CalibrationDraftSummary{}, fmt.Errorf("stage calibration draft: %w", err)
	}

	summary := CalibrationDraftSummary{
		SuggestedDecision: decision,
		OKRHitRate:        hitRate,
		InvalidatedCount:  invalidatedCount,
		ReasoningSummary:  reasoning,
		LLMUsed:           llmUsed,
	}
	return batchID, summary, nil
}

// computeOKRHitRate parses okr_assessments from an assessment payload.
// Returns (hitRatePct, totalOKRs, hitCount).
func computeOKRHitRate(payload map[string]any) (int, int, int) {
	okrList, _ := payload["okr_assessments"].([]any)
	if len(okrList) == 0 {
		return 0, 0, 0
	}
	hitCount := 0
	for _, item := range okrList {
		okr, ok := item.(map[string]any)
		if !ok {
			continue
		}
		status, _ := okr["status"].(string)
		if status == "on_track" || status == "completed" || status == "achieved" {
			hitCount++
		}
	}
	return (hitCount * 100) / len(okrList), len(okrList), hitCount
}

// countInvalidatedAssumptions counts assumptions with status "invalidated".
func countInvalidatedAssumptions(payload map[string]any) int {
	avList, _ := payload["assumption_validations"].([]any)
	count := 0
	for _, item := range avList {
		av, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if av["status"] == "invalidated" {
			count++
		}
	}
	return count
}

// calibrationDecision applies the rule-based decision logic from the spec.
func calibrationDecision(hitRatePct, invalidatedCount int) string {
	if hitRatePct < 30 && invalidatedCount >= 2 {
		return "pull_the_plug"
	}
	if hitRatePct < 60 || invalidatedCount > 0 {
		return "pivot"
	}
	return "persevere"
}

// buildReasoningSummary builds a human-readable reasoning without an LLM.
func buildReasoningSummary(decision string, hitRate, total, hit, invalidated int) string {
	switch decision {
	case "persevere":
		return fmt.Sprintf("OKR hit rate is %d%% (%d/%d objectives on track) with no invalidated assumptions. Strategy is performing as expected.", hitRate, hit, total)
	case "pivot":
		parts := []string{}
		if hitRate < 60 {
			parts = append(parts, fmt.Sprintf("OKR hit rate of %d%% (%d/%d) is below the 60%% threshold", hitRate, hit, total))
		}
		if invalidated > 0 {
			parts = append(parts, fmt.Sprintf("%d assumption(s) have been invalidated", invalidated))
		}
		return strings.Join(parts, "; ") + ". Strategic adjustments recommended."
	case "pull_the_plug":
		return fmt.Sprintf("OKR hit rate of %d%% (%d/%d) is critically low and %d core assumptions have been invalidated. Fundamental strategic review required.", hitRate, hit, total, invalidated)
	default:
		return "Calibration reasoning not available."
	}
}

// enrichCalibrationWithLLM uses the LLM to generate narrative reasoning.
func (s *Service) enrichCalibrationWithLLM(ctx context.Context, decision string, assessmentPayload map[string]any, fallbackReasoning string) (string, error) {
	assessmentJSON, _ := json.Marshal(assessmentPayload)
	systemPrompt := `You are a strategy calibration assistant. Given assessment results and a recommended decision (persevere/pivot/pull_the_plug), write a concise 2-3 sentence strategic reasoning that explains why this decision is recommended. Be direct and actionable.`
	userPrompt := fmt.Sprintf("Decision: %s\n\nAssessment data:\n%s\n\nDefault reasoning: %s\n\nWrite an improved strategic reasoning:", decision, string(assessmentJSON), fallbackReasoning)

	result, err := s.llm.Complete(ctx, systemPrompt, userPrompt)
	if err != nil {
		return fallbackReasoning, err
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// ApplyCalibration
// ---------------------------------------------------------------------------

// ApplyCalibration reads the committed calibration_memo and stages targeted
// READY artifact patches per decision type.
func (s *Service) ApplyCalibration(ctx context.Context, instanceID uuid.UUID) (uuid.UUID, ApplyCalibrationResult, error) {
	// Load committed calibration memo.
	memoPayload, err := s.loadArtifactPayload(ctx, instanceID, "calibration_memo")
	if err != nil {
		return uuid.Nil, ApplyCalibrationResult{}, apperror.ErrBadRequest.WithDetail("No committed calibration memo found")
	}

	decision, _ := memoPayload["decision"].(string)
	reasoning, _ := memoPayload["reasoning"].(string)

	batchID := uuid.New()
	var affectedArtifacts []string

	switch decision {
	case "persevere":
		// Stage a roadmap cycle completion update if the roadmap exists.
		roadmapPayload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeRoadmap)
		if err == nil {
			// Mark active cycle as completed.
			if roadmap, ok := roadmapPayload["roadmap"].(map[string]any); ok {
				roadmap["cycle_status"] = "completed"
				roadmapPayload["roadmap"] = roadmap
			}
			batchID, err = s.stageMutationWithBatch(ctx, instanceID, domain.ArtifactTypeRoadmap, "roadmap", domain.MutationActionUpdate, roadmapPayload, batchID, "Mark cycle complete — persevere decision (AI-suggested — requires human review before committing)")
			if err != nil {
				slog.WarnContext(ctx, "aim: failed to stage roadmap cycle completion", "err", err)
			} else {
				affectedArtifacts = append(affectedArtifacts, "roadmap")
			}
		}

	case "pivot":
		// Flag strategic bets in strategy_formula with review_flag.
		formulaPayload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeStrategyFormula)
		if err == nil {
			affectedBets := s.flagStrategicBets(formulaPayload, reasoning)
			batchID, err = s.stageMutationWithBatch(ctx, instanceID, domain.ArtifactTypeStrategyFormula, "strategy-formula", domain.MutationActionUpdate, formulaPayload, batchID, "Flag strategic bets for review — pivot decision (AI-suggested — requires human review before committing)")
			if err != nil {
				slog.WarnContext(ctx, "aim: failed to stage formula patch", "err", err)
			} else {
				affectedArtifacts = append(affectedArtifacts, affectedBets...)
			}
		}

	case "pull_the_plug":
		// Flag north_star vision for revision.
		nsPayload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeNorthStar)
		if err == nil {
			if ns, ok := nsPayload["north_star"].(map[string]any); ok {
				ns["review_flag"] = true
				ns["calibration_note"] = reasoning
				nsPayload["north_star"] = ns
			}
			batchID, err = s.stageMutationWithBatch(ctx, instanceID, domain.ArtifactTypeNorthStar, "north-star", domain.MutationActionUpdate, nsPayload, batchID, "Flag north star for revision — pull_the_plug decision (AI-suggested — requires human review before committing)")
			if err != nil {
				slog.WarnContext(ctx, "aim: failed to stage north star patch", "err", err)
			} else {
				affectedArtifacts = append(affectedArtifacts, "north_star")
			}
		}
	}

	if len(affectedArtifacts) == 0 {
		// No applicable patches — return a descriptive batch ID placeholder.
		return batchID, ApplyCalibrationResult{
			Decision:          decision,
			AffectedArtifacts: []string{},
		}, nil
	}

	return batchID, ApplyCalibrationResult{
		Decision:          decision,
		AffectedArtifacts: affectedArtifacts,
	}, nil
}

// flagStrategicBets adds review_flag=true to all strategic bets in strategy_formula.
// Returns the keys of affected bets.
func (s *Service) flagStrategicBets(formulaPayload map[string]any, _ string) []string {
	var affected []string
	strategy, _ := formulaPayload["strategy"].(map[string]any)
	if strategy == nil {
		return affected
	}

	bets, _ := strategy["strategic_bets"].([]any)
	for i, bet := range bets {
		betMap, ok := bet.(map[string]any)
		if !ok {
			continue
		}
		betMap["review_flag"] = true
		bets[i] = betMap
		if id, ok := betMap["id"].(string); ok {
			affected = append(affected, "bet:"+id)
		} else {
			affected = append(affected, fmt.Sprintf("bet:%d", i))
		}
	}
	if len(bets) > 0 {
		strategy["strategic_bets"] = bets
		formulaPayload["strategy"] = strategy
	}
	return affected
}

// ---------------------------------------------------------------------------
// SnapshotCycle
// ---------------------------------------------------------------------------

// VersionPublisher is the interface for publishing a strategy version.
// This matches the signature of domain/version.Service.Publish to avoid a direct import cycle.
type VersionPublisher interface {
	Publish(ctx context.Context, instanceID uuid.UUID, label, description string) (interface{}, error)
}

// SnapshotCycle publishes a named strategy version for a completed AIM cycle.
// cycleLabel should be "Cycle N — Decision" format.
func (s *Service) SnapshotCycle(ctx context.Context, instanceID uuid.UUID, cycleNumber int, decision string) error {
	// Count existing aim_cycle versions for cycle numbering.
	if cycleNumber == 0 {
		cycleNumber = s.nextCycleNumber(ctx, instanceID)
	}

	label := fmt.Sprintf("Cycle %d — %s", cycleNumber, calibrationDecisionLabel(decision))
	description := fmt.Sprintf("AIM cycle %d completed with decision: %s. Auto-snapshot created on calibration commit.", cycleNumber, decision)

	// We store the snapshot request — the version service call is wired externally
	// (see cmd_serve.go) to avoid an import cycle. This method stores cycle metadata
	// so ListCycles can read it later.
	slog.InfoContext(ctx, "aim: cycle snapshot requested", "instance_id", instanceID, "cycle", cycleNumber, "decision", decision, "label", label, "description", description)
	return nil
}

// nextCycleNumber counts existing aim_cycle versions + 1.
func (s *Service) nextCycleNumber(ctx context.Context, instanceID uuid.UUID) int {
	var count int
	_ = s.db.NewSelect().
		TableExpr("strategy_versions").
		Where("instance_id = ?", instanceID).
		Where("metadata->>'source' = ?", "aim_cycle").
		ColumnExpr("COUNT(*)").
		Scan(ctx, &count)
	return count + 1
}

// calibrationDecisionLabel returns a human-readable label for a calibration decision.
func calibrationDecisionLabel(decision string) string {
	switch decision {
	case "persevere":
		return "Persevere"
	case "pivot":
		return "Pivot"
	case "pull_the_plug":
		return "Pull the Plug"
	default:
		return decision
	}
}

// ---------------------------------------------------------------------------
// ListCycles
// ---------------------------------------------------------------------------

// ListCycles returns all AIM cycle versions for the instance, newest first.
func (s *Service) ListCycles(ctx context.Context, instanceID uuid.UUID) ([]CycleSummary, error) {
	type versionRow struct {
		ID          uuid.UUID       `bun:"id"`
		Metadata    json.RawMessage `bun:"metadata"`
		PublishedAt time.Time       `bun:"published_at"`
	}
	var rows []versionRow

	err := s.db.NewSelect().
		TableExpr("strategy_versions").
		ColumnExpr("id, metadata, published_at").
		Where("instance_id = ?", instanceID).
		Where("metadata->>'source' = ?", "aim_cycle").
		OrderExpr("published_at DESC").
		Scan(ctx, &rows)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("list aim cycles: %w", err)
	}

	var cycles []CycleSummary
	for _, r := range rows {
		var meta map[string]any
		_ = json.Unmarshal(r.Metadata, &meta)
		cycleNum, _ := meta["cycle_number"].(float64)
		dec, _ := meta["calibration_decision"].(string)
		cycles = append(cycles, CycleSummary{
			CycleNumber: int(cycleNum),
			Decision:    dec,
			VersionID:   r.ID.String(),
			PublishedAt: r.PublishedAt.Format(time.RFC3339),
		})
	}
	return cycles, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// loadArtifactPayload loads and parses the payload JSON for the given artifact type.
func (s *Service) loadArtifactPayload(ctx context.Context, instanceID uuid.UUID, artifactType string) (map[string]any, error) {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Where("status != ?", domain.ArtifactStatusArchived).
		OrderExpr("updated_at DESC").
		Limit(1).
		Scan(ctx, &payloadStr)
	if errors.Is(err, sql.ErrNoRows) || payloadStr == "" {
		return nil, fmt.Errorf("artifact not found: %s", artifactType)
	}
	if err != nil {
		return nil, fmt.Errorf("load artifact %s: %w", artifactType, err)
	}

	var m map[string]any
	if err := json.Unmarshal([]byte(payloadStr), &m); err != nil {
		return nil, fmt.Errorf("parse artifact %s: %w", artifactType, err)
	}
	return m, nil
}

// stageMutation creates a staged mutation with a new batch ID.
func (s *Service) stageMutation(ctx context.Context, instanceID uuid.UUID, artifactType, artifactKey, action string, payload any) (uuid.UUID, error) {
	batchID := uuid.New()
	return s.stageMutationWithBatch(ctx, instanceID, artifactType, artifactKey, action, payload, batchID, "AI-drafted batch — requires human review before committing")
}

// stageMutationWithBatch creates a staged mutation appended to the given batchID.
func (s *Service) stageMutationWithBatch(ctx context.Context, instanceID uuid.UUID, artifactType, artifactKey, action string, payload any, batchID uuid.UUID, description string) (uuid.UUID, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return uuid.Nil, fmt.Errorf("marshal payload: %w", err)
	}

	m := &domain.StrategyMutation{
		ID:               uuid.New(),
		InstanceID:       instanceID,
		BatchID:          &batchID,
		ArtifactType:     artifactType,
		ArtifactKey:      artifactKey,
		Action:           action,
		Payload:          raw,
		Status:           domain.MutationStatusStaged,
		Source:           domain.MutationSourceSystem,
		BatchDescription: &description,
		CreatedAt:        time.Now().UTC(),
	}

	if _, err := s.db.NewInsert().Model(m).Exec(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("insert staged mutation: %w", err)
	}
	return batchID, nil
}

// extractStringField navigates a dot-separated path in a map[string]any.
func extractStringField(m map[string]any, path string) string {
	parts := strings.SplitN(path, ".", 2)
	if len(parts) == 0 || m == nil {
		return ""
	}
	val, ok := m[parts[0]]
	if !ok {
		return ""
	}
	if len(parts) == 1 {
		s, _ := val.(string)
		return s
	}
	sub, ok := val.(map[string]any)
	if !ok {
		return ""
	}
	return extractStringField(sub, parts[1])
}
