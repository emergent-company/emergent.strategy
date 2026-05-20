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
	db         *bun.DB
	llm        LLMClient        // optional — nil = skeleton mode
	versionPub VersionPublisher // optional — nil = snapshot is no-op
}

// NewService creates a new AIM service.
// Pass nil for llm to operate in skeleton mode (structure without narrative).
func NewService(db *bun.DB, llm LLMClient) *Service {
	return &Service{db: db, llm: llm}
}

// WithVersionPublisher wires the version publisher so SnapshotCycle can publish
// AIM cycle versions. Must be called after NewService if cycle snapshots are needed.
func (s *Service) WithVersionPublisher(vp VersionPublisher) *Service {
	s.versionPub = vp
	return s
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

// DraftAssessment assembles a new assessment_report draft using:
//  1. The roadmap OKRs and KR targets (structure)
//  2. The last committed assessment report (prior actuals + assumption statuses)
//  3. The LRA evolution log (narrative of what happened since the last cycle)
//  4. Active ripple signals (system-detected misalignments)
//
// If an LLM is configured, it enriches each OKR assessment using the above as
// evidence. Otherwise it produces a skeleton with prior actuals carried forward.
func (s *Service) DraftAssessment(ctx context.Context, instanceID uuid.UUID) (uuid.UUID, DraftSummary, error) {
	// 1. Load roadmap_recipe payload (required — defines OKR structure).
	roadmapPayload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeRoadmap)
	if err != nil {
		return uuid.Nil, DraftSummary{}, apperror.ErrBadRequest.WithDetail("No roadmap found for instance")
	}

	// 2. Load the last committed assessment report (optional — provides prior actuals).
	priorAssessment, _ := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeAssessmentReport)

	// 3. Load the LRA (optional — evolution log carries narrative progress).
	lraPayload, _ := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeLRA)

	// 4. Extract OKR skeleton from roadmap, seeded with prior actuals where available.
	okrAssessments := s.extractOKRAssessments(ctx, instanceID, roadmapPayload)
	if priorAssessment != nil {
		seedFromPriorAssessment(okrAssessments, priorAssessment)
	}

	// 5. Extract assumption validations, seeded from prior assessment.
	assumptionValidations := s.extractAssumptionValidations(ctx, instanceID)
	if priorAssessment != nil {
		seedAssumptionsFromPrior(assumptionValidations, priorAssessment)
	}

	// 6. Extract strategic insights from active critical ripple signals.
	strategicInsights := s.extractStrategicInsights(ctx, instanceID)

	// 7. Build the assessment_report payload.
	report := map[string]any{
		"name":                   "AI-Drafted Assessment Report",
		"cycle":                  extractStringField(roadmapPayload, "roadmap.cycle"),
		"okr_assessments":        okrAssessments,
		"assumption_validations": assumptionValidations,
		"strategic_insights":     strategicInsights,
		"overall_status":         "pending",
		"metadata": map[string]any{
			"drafted_by":  "aim_agent",
			"drafted_at":  time.Now().UTC().Format(time.RFC3339),
			"llm_used":    false,
			"instance_id": instanceID.String(),
		},
	}

	llmUsed := false
	if s.llm != nil {
		llmUsed = true
		s.enrichAssessmentWithLLM(ctx, report, okrAssessments, priorAssessment, lraPayload)
		report["metadata"].(map[string]any)["llm_used"] = true
	}

	// 8. Stage as a batch.
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

// extractAssumptionValidations reads assumption IDs from the strategic relationship
// index and cross-references with the roadmap to ensure only assumptions that have
// a known description are included. Orphaned IDs (referenced in feature relationships
// but with no description in the roadmap) are excluded — they add no value to the
// assessment and cannot be assessed meaningfully.
func (s *Service) extractAssumptionValidations(ctx context.Context, instanceID uuid.UUID) []map[string]any {
	// Load the set of assumption IDs that have descriptions in the roadmap.
	knownAssumptions := s.loadRoadmapAssumptions(ctx, instanceID)

	type relRow struct {
		TargetKey string `bun:"target_key"`
	}
	var rows []relRow
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("DISTINCT target_key").
		Where("instance_id = ?", instanceID).
		Where("relationship IN (?, ?)", "tests_assumption", "validates_assumption").
		OrderExpr("target_key").
		Scan(ctx, &rows)

	seen := make(map[string]bool)
	var validations []map[string]any
	for _, r := range rows {
		if seen[r.TargetKey] {
			continue
		}
		seen[r.TargetKey] = true
		// Only include assumptions we have a description for.
		if _, known := knownAssumptions[r.TargetKey]; !known {
			continue
		}
		validations = append(validations, map[string]any{
			"assumption_id": r.TargetKey,
			"status":        "pending",
			"evidence":      "",
		})
	}
	return validations
}

// loadRoadmapAssumptions returns a map of assumption ID → description for all
// assumptions defined under any "assumption"-keyed list in the roadmap tracks.
func (s *Service) loadRoadmapAssumptions(ctx context.Context, instanceID uuid.UUID) map[string]string {
	payload, err := s.loadArtifactPayload(ctx, instanceID, domain.ArtifactTypeRoadmap)
	if err != nil {
		return nil
	}
	roadmap, _ := payload["roadmap"].(map[string]any)
	if roadmap == nil {
		roadmap = payload
	}

	result := make(map[string]string)
	collect := func(list []any) {
		for _, item := range list {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			id, _ := m["id"].(string)
			desc, _ := m["description"].(string)
			if id != "" && desc != "" {
				result[id] = desc
			}
		}
	}

	tracks, _ := roadmap["tracks"].(map[string]any)
	for _, tv := range tracks {
		tm, ok := tv.(map[string]any)
		if !ok {
			continue
		}
		for key, val := range tm {
			if !strings.Contains(strings.ToLower(key), "assumption") {
				continue
			}
			if list, ok := val.([]any); ok {
				collect(list)
			}
		}
	}
	if list, ok := roadmap["assumptions"].([]any); ok {
		collect(list)
	}
	return result
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

// enrichAssessmentWithLLM calls the LLM once per OKR to write a grounded assessment.
// Evidence sources (in priority order):
//  1. priorAssessment — last committed assessment report with real actuals + KR outcomes
//  2. lraPayload — LRA evolution log entries (narrative of what happened this cycle)
//  3. Active ripple signals (system-detected misalignments)
//  4. Strategic context from north star and strategy foundations
func (s *Service) enrichAssessmentWithLLM(ctx context.Context, report map[string]any, okrAssessments []map[string]any, priorAssessment, lraPayload map[string]any) {
	instanceID := s.instanceIDFromReport(report)

	// Build shared context sections — loaded once, reused per OKR call.
	strategicContext := s.loadStrategicContext(ctx, instanceID)
	signals := s.loadSignalContext(ctx, instanceID)
	lraContext := buildLRAContext(lraPayload)

	systemPrompt := `You are a strategy assessment analyst writing a new cycle assessment report.

Your job: for each OKR, write a 2-4 sentence assessment grounded in the evidence provided.

Evidence priority:
1. Prior assessment actuals (most important — real outcomes from the last cycle)
2. LRA evolution log (what happened narratively since last cycle)
3. Ripple signals (system-detected strategy misalignments)
4. Strategic context (mission/vision — background only)

Rules:
- Use prior actuals and LRA narrative as your primary evidence. If both are present, synthesise them.
- Do NOT fabricate numbers. If actual progress on a KR is unknown, say so and name what evidence is needed.
- Reference specific KR IDs when assessing individual key results.
- Set status: on_track | at_risk | missed | partially_met | pending
- Be direct and actionable. No filler phrases like "it's important to note".`

	// Run LLM calls concurrently — one goroutine per OKR.
	type result struct {
		idx        int
		assessment string
	}
	resultCh := make(chan result, len(okrAssessments))

	for i, okr := range okrAssessments {
		objective, _ := okr["objective"].(string)
		if objective == "" {
			resultCh <- result{idx: i}
			continue
		}
		okrID, _ := okr["okr_id"].(string)
		track, _ := okr["track"].(string)

		// Build KR section with targets AND prior actuals if available.
		var krLines []string
		if krs, ok := okr["kr_assessments"].([]map[string]any); ok {
			for _, kr := range krs {
				krID, _ := kr["kr_id"].(string)
				target, _ := kr["target"].(string)
				actual, _ := kr["actual"].(string)
				status, _ := kr["status"].(string)
				if krID == "" {
					continue
				}
				line := fmt.Sprintf("  %s: target=%q", krID, target)
				if actual != "" {
					line += fmt.Sprintf(", actual=%q", actual)
				}
				if status != "" && status != "pending" && status != "not_started" {
					line += fmt.Sprintf(", prior_status=%s", status)
				}
				krLines = append(krLines, line)
			}
		}
		krSection := "  (no key results defined)"
		if len(krLines) > 0 {
			krSection = strings.Join(krLines, "\n")
		}

		userPrompt := fmt.Sprintf(`%s

%s

%s
---
OKR to assess:
Track: %s
ID: %s
Objective: %s
Key Results (with prior actuals where available):
%s

Write 2-4 sentences assessing this OKR. Reference prior actuals and LRA narrative as primary evidence. Set a clear status at the start: [on_track] [at_risk] [missed] [partially_met] [pending]`,
			strategicContext, lraContext, signals, track, okrID, objective, krSection)

		go func(idx int, id, prompt string) {
			res, err := s.llm.Complete(ctx, systemPrompt, prompt)
			if err != nil {
				slog.WarnContext(ctx, "aim: LLM assessment enrichment failed", "okr_id", id, "err", err)
				resultCh <- result{idx: idx}
				return
			}
			resultCh <- result{idx: idx, assessment: strings.TrimSpace(res)}
		}(i, okrID, userPrompt)
	}

	// Collect all results.
	for range okrAssessments {
		r := <-resultCh
		if r.assessment != "" {
			okrAssessments[r.idx]["assessment"] = r.assessment
		}
	}
	report["okr_assessments"] = okrAssessments
}

// seedFromPriorAssessment carries forward actuals and KR outcomes from the last
// committed assessment into the new skeleton so the LLM has them as evidence.
func seedFromPriorAssessment(okrAssessments []map[string]any, prior map[string]any) {
	priorOKRs, _ := prior["okr_assessments"].([]any)
	if len(priorOKRs) == 0 {
		return
	}

	// Index prior OKR entries by okr_id for O(1) lookup.
	priorByID := make(map[string]map[string]any, len(priorOKRs))
	for _, item := range priorOKRs {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if id, _ := m["okr_id"].(string); id != "" {
			priorByID[id] = m
		}
	}

	for i, okr := range okrAssessments {
		okrID, _ := okr["okr_id"].(string)
		priorOKR, ok := priorByID[okrID]
		if !ok {
			continue
		}

		// Carry forward the prior OKR-level assessment as context.
		if priorText, _ := priorOKR["assessment"].(string); priorText != "" {
			okrAssessments[i]["prior_assessment"] = priorText
		}

		// Carry forward KR actuals from prior key_result_outcomes into kr_assessments.
		priorKRs, _ := priorOKR["key_result_outcomes"].([]any)
		if len(priorKRs) == 0 {
			continue
		}
		priorKRByID := make(map[string]map[string]any, len(priorKRs))
		for _, krItem := range priorKRs {
			krm, ok := krItem.(map[string]any)
			if !ok {
				continue
			}
			if id, _ := krm["kr_id"].(string); id != "" {
				priorKRByID[id] = krm
			}
		}

		krs, _ := okr["kr_assessments"].([]map[string]any)
		for j, kr := range krs {
			krID, _ := kr["kr_id"].(string)
			priorKR, ok := priorKRByID[krID]
			if !ok {
				continue
			}
			if actual, _ := priorKR["actual"].(string); actual != "" {
				krs[j]["actual"] = actual
			}
			if status, _ := priorKR["status"].(string); status != "" {
				krs[j]["status"] = status
			}
		}
		okrAssessments[i]["kr_assessments"] = krs
	}
}

// seedAssumptionsFromPrior carries forward prior assumption statuses and evidence.
func seedAssumptionsFromPrior(assumptions []map[string]any, prior map[string]any) {
	priorValidations, _ := prior["assumption_validations"].([]any)
	if len(priorValidations) == 0 {
		return
	}
	priorByID := make(map[string]map[string]any, len(priorValidations))
	for _, item := range priorValidations {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		// prior may use "id" or "assumption_id"
		id, _ := m["id"].(string)
		if id == "" {
			id, _ = m["assumption_id"].(string)
		}
		if id != "" {
			priorByID[id] = m
		}
	}
	for i, av := range assumptions {
		asmID, _ := av["assumption_id"].(string)
		prior, ok := priorByID[asmID]
		if !ok {
			continue
		}
		if status, _ := prior["status"].(string); status != "" {
			assumptions[i]["status"] = status
		}
		if evidence, _ := prior["evidence"].(string); evidence != "" {
			assumptions[i]["evidence"] = evidence
		}
	}
}

// buildLRAContext formats the LRA evolution log into a compact evidence string
// for inclusion in the LLM prompt.
func buildLRAContext(lra map[string]any) string {
	if lra == nil {
		return ""
	}

	var lines []string

	// Current focus.
	if focus, ok := lra["current_focus"].(map[string]any); ok {
		if obj, _ := focus["primary_objective"].(string); obj != "" {
			lines = append(lines, "Current cycle objective: "+obj)
		}
		if track, _ := focus["primary_track"].(string); track != "" {
			lines = append(lines, "Primary track: "+track)
		}
	}

	// Evolution log — last 3 entries, most recent first.
	if log, ok := lra["evolution_log"].([]any); ok {
		lines = append(lines, "\nProgress narrative (LRA evolution log, most recent first):")
		count := 0
		for j := len(log) - 1; j >= 0 && count < 3; j-- {
			entry, ok := log[j].(map[string]any)
			if !ok {
				continue
			}
			summary, _ := entry["summary"].(string)
			ts, _ := entry["timestamp"].(string)
			if summary == "" {
				continue
			}
			if ts != "" && len(ts) >= 10 {
				ts = ts[:10] // date only
				lines = append(lines, fmt.Sprintf("  [%s] %s", ts, summary))
			} else {
				lines = append(lines, "  "+summary)
			}
			count++
		}
	}

	if len(lines) == 0 {
		return ""
	}
	return "LRA context (what happened this cycle):\n" + strings.Join(lines, "\n")
}

// instanceIDFromReport extracts the instance UUID from the metadata section of a report map.
// Returns uuid.Nil if not found — callers must guard against nil context.
func (s *Service) instanceIDFromReport(report map[string]any) uuid.UUID {
	if meta, ok := report["metadata"].(map[string]any); ok {
		if idStr, ok := meta["instance_id"].(string); ok {
			if id, err := uuid.Parse(idStr); err == nil {
				return id
			}
		}
	}
	return uuid.Nil
}

// loadStrategicContext builds a compact strategic context string from the north star
// and strategy foundations artifacts for the given instance.
func (s *Service) loadStrategicContext(ctx context.Context, instanceID uuid.UUID) string {
	if instanceID == uuid.Nil {
		return "(strategic context unavailable — instance ID missing from report metadata)"
	}

	var lines []string

	// North star — mission and vision.
	if ns, err := s.loadArtifactPayload(ctx, instanceID, "north_star"); err == nil {
		if nsInner, ok := ns["north_star"].(map[string]any); ok {
			if purpose, ok := nsInner["purpose"].(map[string]any); ok {
				if prob, _ := purpose["problem_we_solve"].(string); prob != "" {
					lines = append(lines, "Problem we solve: "+prob)
				}
				if who, _ := purpose["who_we_serve"].(string); who != "" {
					lines = append(lines, "Who we serve: "+who)
				}
			}
			if vision, ok := nsInner["vision"].(map[string]any); ok {
				if tf, _ := vision["timeframe"].(string); tf != "" {
					lines = append(lines, "Vision timeframe: "+tf)
				}
			}
		}
	}

	// Strategy foundations — ICP and positioning.
	if sf, err := s.loadArtifactPayload(ctx, instanceID, "strategy_foundations"); err == nil {
		if pos, ok := sf["positioning"].(map[string]any); ok {
			if usp, _ := pos["unique_value_proposition"].(string); usp != "" {
				lines = append(lines, "Value proposition: "+usp)
			}
		}
	}

	if len(lines) == 0 {
		return "(no strategic context artifacts found)"
	}
	return "Strategic context:\n" + strings.Join(lines, "\n")
}

// loadSignalContext returns a compact summary of active critical ripple signals
// to give the LLM awareness of known misalignments in the strategy graph.
func (s *Service) loadSignalContext(ctx context.Context, instanceID uuid.UUID) string {
	if instanceID == uuid.Nil {
		return ""
	}
	type sigRow struct {
		Description string `bun:"description"`
		Severity    string `bun:"severity"`
	}
	var rows []sigRow
	_ = s.db.NewSelect().
		TableExpr("ripple_signals").
		ColumnExpr("description, severity").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		OrderExpr("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END").
		Limit(5).
		Scan(ctx, &rows)

	if len(rows) == 0 {
		return ""
	}
	var lines []string
	lines = append(lines, "\nActive strategy signals (misalignments detected by system):")
	for _, r := range rows {
		lines = append(lines, fmt.Sprintf("  [%s] %s", r.Severity, r.Description))
	}
	return strings.Join(lines, "\n")
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

// VersionPublisher is the interface for publishing an AIM cycle version snapshot.
// Satisfied by *domain/version.Service.
type VersionPublisher interface {
	PublishAIMCycle(ctx context.Context, instanceID uuid.UUID, label, description string) error
	CountAIMCycles(ctx context.Context, instanceID uuid.UUID) (int, error)
}

// SnapshotCycle publishes a named strategy version for a completed AIM cycle.
// cycleNumber 0 means auto-number (count existing + 1).
func (s *Service) SnapshotCycle(ctx context.Context, instanceID uuid.UUID, cycleNumber int, decision string) error {
	if s.versionPub == nil {
		slog.WarnContext(ctx, "aim: SnapshotCycle called but no VersionPublisher wired — skipping")
		return nil
	}

	// Count existing aim_cycle versions for cycle numbering.
	if cycleNumber == 0 {
		cycleNumber = s.nextCycleNumber(ctx, instanceID)
	}

	label := fmt.Sprintf("Cycle %d — %s", cycleNumber, calibrationDecisionLabel(decision))
	description := fmt.Sprintf("AIM cycle %d completed with decision: %s. Auto-snapshot on cycle completion.", cycleNumber, decision)

	if err := s.versionPub.PublishAIMCycle(ctx, instanceID, label, description); err != nil {
		return fmt.Errorf("snapshot aim cycle: %w", err)
	}
	slog.InfoContext(ctx, "aim: cycle snapshot published", "instance_id", instanceID, "cycle", cycleNumber, "decision", decision)
	return nil
}

// nextCycleNumber counts existing aim_cycle versions (source column) + 1.
func (s *Service) nextCycleNumber(ctx context.Context, instanceID uuid.UUID) int {
	if s.versionPub == nil {
		return 1
	}
	count, _ := s.versionPub.CountAIMCycles(ctx, instanceID)
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
		ID          uuid.UUID  `bun:"id"`
		Version     int        `bun:"version"`
		Label       *string    `bun:"label"`
		PublishedAt time.Time  `bun:"published_at"`
	}
	var rows []versionRow

	err := s.db.NewSelect().
		TableExpr("strategy_versions").
		ColumnExpr("id, version, label, published_at").
		Where("instance_id = ?", instanceID).
		Where("source = ?", "aim_cycle").
		OrderExpr("published_at DESC").
		Scan(ctx, &rows)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("list aim cycles: %w", err)
	}

	var cycles []CycleSummary
	for i, r := range rows {
		// Cycle number: newest-first list means cycle N = len-i.
		cycleNum := len(rows) - i
		decision := ""
		if r.Label != nil {
			decision = aimCycleDecisionFromLabel(*r.Label)
		}
		cycles = append(cycles, CycleSummary{
			CycleNumber: cycleNum,
			Decision:    decision,
			VersionID:   r.ID.String(),
			PublishedAt: r.PublishedAt.Format(time.RFC3339),
		})
	}
	return cycles, nil
}

// aimCycleDecisionFromLabel extracts the decision token from a label like "Cycle N — Pivot".
func aimCycleDecisionFromLabel(label string) string {
	suffixes := map[string]string{
		"Persevere":    "persevere",
		"Pivot":        "pivot",
		"Pull the Plug": "pull_the_plug",
	}
	for suffix, token := range suffixes {
		if strings.HasSuffix(label, suffix) {
			return token
		}
	}
	return ""
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
