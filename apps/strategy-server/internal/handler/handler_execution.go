package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleExecutionDashboard renders the execution-focused strategy dashboard.
// This is the default view when navigating to a strategy — shows current KRs,
// linked features, and inline AIM data.
func (s *Server) handleExecutionDashboard(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, langs.T(ctx, "error.instance_not_found"))
	}

	stats := s.loadInstanceStats(ctx, instance)
	ctx = ui.WithInstanceStats(ctx, stats)
	c.SetRequest(c.Request().WithContext(ctx))

	data := s.loadExecutionData(ctx, instanceID, instance.Name)
	tabs := s.strategyTabs(ctx, instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)

	content := ui.ExecutionDashboardContent(data)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(instance.Name+" — Strategy", currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		ui.InstanceTabContent(tabs, currentPath, content),
	)
	return nil
}

// loadExecutionData loads the full execution dashboard data:
// roadmap OKRs → linked features → assumption confidence → AIM assessment outcomes.
func (s *Server) loadExecutionData(ctx context.Context, instanceID, instanceName string) ui.ExecutionData {
	data := ui.ExecutionData{
		InstanceID:   instanceID,
		InstanceName: instanceName,
	}

	// Load roadmap payload — scan as string since bun can't scan JSONB into []byte via TableExpr.
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return data
	}

	var roadmapRoot map[string]any
	if json.Unmarshal([]byte(payloadStr), &roadmapRoot) != nil {
		return data
	}

	roadmap, _ := roadmapRoot["roadmap"].(map[string]any)
	if roadmap == nil {
		s.log.Warn("execution: no 'roadmap' key in payload", "keys", fmt.Sprintf("%v", mapKeys(roadmapRoot)))
		return data
	}

	if tf, ok := roadmap["timeframe"].(string); ok {
		data.Timeframe = tf
	}
	if c, ok := roadmap["cycle"].(float64); ok {
		data.Cycle = fmt.Sprintf("Cycle %d", int(c))
	}
	if st, ok := roadmap["status"].(string); ok {
		data.Status = st
	}

	// Load all features for this instance (for linking to KRs)
	features := s.loadFeatureMap(ctx, instanceID)

	// Load assumption map from roadmap
	assumptions := s.extractAssumptions(roadmap)

	// Load feature → assumption test edges
	featureAssumptions := s.loadFeatureAssumptionEdges(ctx, instanceID)

	// Load AIM assessment outcomes: map[krID] → {status, actual}
	krOutcomes, strategicInsights := s.loadAssessmentKROutcomes(ctx, instanceID)
	data.HasAssessmentData = len(krOutcomes) > 0
	data.StrategicInsights = strategicInsights

	// Signal severity breakdown
	data.ActiveSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Count(ctx)
	data.CriticalSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		Count(ctx)
	data.WarningSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Where("severity = ?", "warning").
		Count(ctx)

	// Build tracks
	tracks, _ := roadmap["tracks"].(map[string]any)
	if tracks == nil {
		return data
	}

	trackMeta := []struct {
		key  string
		name string
		icon string
	}{
		{"strategy", "Strategy", "lucide--navigation"},
		{"org_ops", "Org & Ops", "lucide--container"},
		{"product", "Product", "lucide--code-2"},
		{"commercial", "Commercial", "lucide--briefcase"},
	}

	// Load definitions per track. Product uses features as its definition equivalent.
	defArtifactType := map[string]string{
		"strategy":   "strategy_def",
		"org_ops":    "org_ops_def",
		"commercial": "commercial_def",
		"product":    "feature",
	}
	trackDefs := make(map[string][]ui.ExecutionDefinition)
	for trackKey, artifactType := range defArtifactType {
		trackDefs[trackKey] = s.loadExecutionDefinitions(ctx, instanceID, trackKey, artifactType)
	}

	// Strategy loop widget data
	s.loadStrategyLoopWidget(ctx, instanceID, &data)

	// Strategic focus — north star, bets, coherence, evidence, versions
	s.loadStrategicFocus(ctx, instanceID, &data)

	for _, tm := range trackMeta {
		trackData, ok := tracks[tm.key].(map[string]any)
		if !ok {
			continue
		}
		okrsRaw, ok := trackData["okrs"].([]any)
		if !ok || len(okrsRaw) == 0 {
			continue
		}

		track := ui.ExecutionTrack{Name: tm.name, Icon: tm.icon, Definitions: trackDefs[tm.key]}

		for _, okrRaw := range okrsRaw {
			okrMap, ok := okrRaw.(map[string]any)
			if !ok {
				continue
			}

			okr := ui.ExecutionOKR{
				ID:        strVal(okrMap, "id"),
				Objective: strVal(okrMap, "objective"),
			}
			data.TotalOKRs++

			krsRaw, _ := okrMap["key_results"].([]any)
			for _, krRaw := range krsRaw {
				krMap, ok := krRaw.(map[string]any)
				if !ok {
					continue
				}

				krID := strVal(krMap, "id")
				kr := ui.ExecutionKR{
					ID:          krID,
					Description: strVal(krMap, "description"),
					Target:      strVal(krMap, "target"),
					Baseline:    strVal(krMap, "baseline"),
					TRLStart:    payloadIntAsStr(krMap, "trl_start"),
					TRLTarget:   payloadIntAsStr(krMap, "trl_target"),
				}
				// Attach AIM assessment outcome if available
				if outcome, ok := krOutcomes[krID]; ok {
					kr.AssessmentStatus = outcome.status
					kr.AssessmentActual = outcome.actual
				}
				data.TotalKRs++

				// Find features that contribute to this KR's value paths
				// Features are linked via contributes_to value model paths
				// and via linked_to_kr relationships
				krFeatures := s.findFeaturesForKR(ctx, instanceID, krID, features)
				for _, f := range krFeatures {
					kr.Features = append(kr.Features, ui.ExecutionFeature{
						Key:    f.key,
						Name:   f.name,
						Status: f.status,
						Href:   "/strategies/" + instanceID + "/fire/features/" + f.key,
					})
					switch f.status {
					case "in-progress":
						data.ActiveFeatures++
					case "draft":
						data.DraftFeatures++
					}
				}

				// Find assumptions linked to this KR
				if linkedAsm, ok := krMap["linked_to_kr"]; ok {
					// Some KRs have direct assumption links
					_ = linkedAsm
				}
				// Check assumption map for assumptions that reference this KR
				for asmID, asm := range assumptions {
					if linkedKRs, ok := asm["linked_to_kr"].([]any); ok {
						for _, lkr := range linkedKRs {
							if lkrStr, ok := lkr.(string); ok && lkrStr == krID {
								kr.Assumptions = append(kr.Assumptions, ui.ExecutionAssumption{
									ID:          asmID,
									Description: strVal(asm, "description"),
									Confidence:  strVal(asm, "confidence"),
									Criticality: strVal(asm, "criticality"),
								})
								data.Assumptions++
							}
						}
					}
				}

				// Also find assumptions via feature edges
				for _, f := range krFeatures {
					if asmIDs, ok := featureAssumptions[f.key]; ok {
						for _, asmID := range asmIDs {
							if asm, ok := assumptions[asmID]; ok {
								// Avoid duplicates
								found := false
								for _, existing := range kr.Assumptions {
									if existing.ID == asmID {
										found = true
										break
									}
								}
								if !found {
									kr.Assumptions = append(kr.Assumptions, ui.ExecutionAssumption{
										ID:          asmID,
										Description: strVal(asm, "description"),
										Confidence:  strVal(asm, "confidence"),
										Criticality: strVal(asm, "criticality"),
									})
								}
							}
						}
					}
				}

				okr.KRs = append(okr.KRs, kr)
			}

			track.OKRs = append(track.OKRs, okr)
		}

		data.Tracks = append(data.Tracks, track)
	}

	return data
}

type featureInfo struct {
	key    string
	name   string
	status string
}

// loadFeatureMap loads all features into a map keyed by artifact_key.
func (s *Server) loadFeatureMap(ctx context.Context, instanceID string) map[string]featureInfo {
	var rows []struct {
		Key    string `bun:"artifact_key"`
		Name   string `bun:"name"`
		Status string `bun:"status"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, status").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeFeature).
		Scan(ctx, &rows)

	m := make(map[string]featureInfo, len(rows))
	for _, r := range rows {
		m[r.Key] = featureInfo{key: r.Key, name: r.Name, status: r.Status}
	}
	return m
}

// extractAssumptions pulls all riskiest_assumptions from across all tracks.
func (s *Server) extractAssumptions(roadmap map[string]any) map[string]map[string]any {
	result := make(map[string]map[string]any)
	tracks, _ := roadmap["tracks"].(map[string]any)
	if tracks == nil {
		return result
	}
	for _, trackData := range tracks {
		td, ok := trackData.(map[string]any)
		if !ok {
			continue
		}
		asms, ok := td["riskiest_assumptions"].([]any)
		if !ok {
			continue
		}
		for _, a := range asms {
			aMap, ok := a.(map[string]any)
			if !ok {
				continue
			}
			if id, ok := aMap["id"].(string); ok {
				result[id] = aMap
			}
		}
	}
	return result
}

// loadFeatureAssumptionEdges loads the tests_assumption relationship edges.
func (s *Server) loadFeatureAssumptionEdges(ctx context.Context, instanceID string) map[string][]string {
	var rows []struct {
		Source string `bun:"source_key"`
		Target string `bun:"target_key"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("source_key, target_key").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		Scan(ctx, &rows)

	m := make(map[string][]string)
	for _, r := range rows {
		m[r.Source] = append(m[r.Source], r.Target)
	}
	return m
}

// findFeaturesForKR finds features linked to a KR.
// Currently uses the relationship graph (linked_to_kr, delivered_by_kr edges).
func (s *Server) findFeaturesForKR(ctx context.Context, instanceID, krID string, features map[string]featureInfo) []featureInfo {
	// Look for delivered_by_kr or linked_to_kr relationships
	var keys []string
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("source_key").
		Where("instance_id = ?", instanceID).
		Where("target_key = ?", krID).
		Where("relationship_type IN (?)", "delivered_by_kr", "linked_to_kr").
		Scan(ctx, &keys)

	var result []featureInfo
	seen := make(map[string]bool)
	for _, k := range keys {
		if f, ok := features[k]; ok && !seen[k] {
			result = append(result, f)
			seen[k] = true
		}
	}
	return result
}

func strVal(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func mapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// loadExecutionDefinitions loads definitions (or features for product track) for a track,
// sorted by current tier / status, capped at 8 entries to keep the strip scannable.
func (s *Server) loadExecutionDefinitions(ctx context.Context, instanceID, trackKey, artifactType string) []ui.ExecutionDefinition {
	var rows []struct {
		Key     string `bun:"artifact_key"`
		Name    string `bun:"name"`
		Payload []byte `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		OrderExpr("name ASC").
		Scan(ctx, &rows)

	var defs []ui.ExecutionDefinition
	for _, r := range rows {
		var p map[string]any
		if json.Unmarshal(r.Payload, &p) != nil {
			continue
		}

		tier := 0
		status, _ := p["status"].(string)

		if artifactType == "feature" {
			// Features use status as primary sort signal: in-progress first, then draft
			switch status {
			case "in-progress":
				tier = 1
			case "draft":
				tier = 2
			default:
				tier = 3
			}
		} else {
			if mat, ok := p["maturity"].(map[string]any); ok {
				if t, ok := mat["current_tier"].(float64); ok {
					tier = int(t)
				}
			}
		}

		// Use the correct URL prefix per artifact type
		var defURL string
		if artifactType == "feature" {
			defURL = "/strategies/" + instanceID + "/fire/features/" + r.Key
		} else {
			defURL = "/strategies/" + instanceID + "/fire/definitions/" + r.Key
		}

		defs = append(defs, ui.ExecutionDefinition{
			Name:        r.Name,
			CurrentTier: tier,
			Status:      status,
			Href:        defURL,
		})
	}

	// Sort by tier (in-progress first for features, T1 first for definitions), then name
	sort.Slice(defs, func(i, j int) bool {
		if defs[i].CurrentTier != defs[j].CurrentTier {
			return defs[i].CurrentTier < defs[j].CurrentTier
		}
		return defs[i].Name < defs[j].Name
	})

	// Cap at 8 to keep the strip compact
	if len(defs) > 8 {
		defs = defs[:8]
	}
	return defs
}

type krOutcome struct {
	status string // met, missed, partial_met, exceeded
	actual string // actual value achieved
}

// loadAssessmentKROutcomes parses the latest assessment_report and returns
// a map of KR ID → outcome, plus top-level strategic insights.
// loadStrategyLoopWidget populates the strategy loop widget fields on ExecutionData.
func (s *Server) loadStrategyLoopWidget(ctx context.Context, instanceID string, data *ui.ExecutionData) {
	// Active AIM cycle
	if s.orchestrationEngine != nil {
		activeRun, err := s.orchestrationEngine.ActiveRun(ctx, "aim_cycle", instanceID)
		if err == nil && activeRun != nil {
			data.LoopCycleRunning = true
			data.LoopCycleStep = pipelineStepLabel(activeRun.CurrentStep)
		}
	}

	// Pending review batches (distinct batch count)
	_ = s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("COUNT(DISTINCT batch_id) AS cnt").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "staged").
		Scan(ctx, &data.LoopPendingCount)

	// Last version published
	var lastVersion struct {
		ID          string    `bun:"id"`
		Label       *string   `bun:"label"`
		Description *string   `bun:"description"`
		PublishedAt time.Time `bun:"published_at"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_versions").
		ColumnExpr("id, label, description, published_at").
		Where("instance_id = ?", instanceID).
		OrderExpr("published_at DESC").
		Limit(1).
		Scan(ctx, &lastVersion)
	if !lastVersion.PublishedAt.IsZero() {
		data.LoopLastVersion = lastVersion.PublishedAt.Format("2 Jan 15:04")
		data.LoopLastVersionID = lastVersion.ID
		if lastVersion.Label != nil && *lastVersion.Label != "" {
			data.LoopLastVersionLabel = *lastVersion.Label
		}

		// Try to build a rich tooltip from the calibration memo.
		data.LoopLastVersionDesc = s.loadCalibrationTooltip(ctx, instanceID)
		if data.LoopLastVersionDesc == "" {
			// Fall back to version description.
			if lastVersion.Description != nil && *lastVersion.Description != "" {
				data.LoopLastVersionDesc = *lastVersion.Description
			}
		}
	}
}

// loadCalibrationTooltip builds a tooltip string from the latest calibration memo.
// Returns "" if no calibration memo exists.
func (s *Server) loadCalibrationTooltip(ctx context.Context, instanceID string) string {
	var payload struct {
		Decision   string `json:"decision"`
		Reasoning  string `json:"reasoning"`
		OKRHitRate *int   `json:"okr_hit_rate_pct"`
	}

	var raw string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload::text").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "calibration_memo").
		Where("artifact_key = ?", "calibration-memo").
		Scan(ctx, &raw)
	if err != nil || raw == "" {
		return ""
	}

	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return ""
	}
	if payload.Decision == "" {
		return ""
	}

	var b strings.Builder
	b.WriteString("Calibration: ")
	b.WriteString(payload.Decision)
	if payload.OKRHitRate != nil {
		_, _ = fmt.Fprintf(&b, " · OKR hit rate: %d%%", *payload.OKRHitRate)
	}
	if payload.Reasoning != "" {
		reasoning := payload.Reasoning
		// Truncate long reasoning for tooltip readability.
		if len(reasoning) > 200 {
			reasoning = reasoning[:197] + "..."
		}
		b.WriteString(" — ")
		b.WriteString(reasoning)
	}
	return b.String()
}

func (s *Server) loadAssessmentKROutcomes(ctx context.Context, instanceID string) (map[string]krOutcome, []string) {
	outcomes := make(map[string]krOutcome)
	var insights []string

	var raw string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeAssessmentReport).
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx, &raw)
	if err != nil || raw == "" {
		return outcomes, insights
	}

	var payload map[string]any
	if json.Unmarshal([]byte(raw), &payload) != nil {
		return outcomes, insights
	}

	// OKR assessments → KR outcomes
	if okrs, ok := payload["okr_assessments"].([]any); ok {
		for _, item := range okrs {
			om, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if krs, ok := om["key_results"].([]any); ok {
				for _, krItem := range krs {
					km, ok := krItem.(map[string]any)
					if !ok {
						continue
					}
					id := strVal(km, "kr_id")
					if id == "" {
						continue
					}
					outcomes[id] = krOutcome{
						status: strVal(km, "status"),
						actual: strVal(km, "actual"),
					}
				}
			}
		}
	}

	// Strategic insights
	if si, ok := payload["strategic_insights"].([]any); ok {
		for _, v := range si {
			if s, ok := v.(string); ok && s != "" {
				insights = append(insights, s)
			}
		}
	}

	return outcomes, insights
}

// loadStrategicFocus populates north star, strategic bets, coherence, evidence,
// and version counts for the execution dashboard's strategic focus section.
func (s *Server) loadStrategicFocus(ctx context.Context, instanceID string, data *ui.ExecutionData) {
	// North star vision + mission
	var northStarPayload string
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeNorthStar).
		Limit(1).
		Scan(ctx, &northStarPayload)
	if northStarPayload != "" {
		data.NorthStarVision = extractNorthStarVision(northStarPayload, 200)
		data.NorthStarMission = extractNorthStarMission(northStarPayload, 200)
	}

	// Strategic bets from strategy formula
	var formulaPayload string
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeStrategyFormula).
		Limit(1).
		Scan(ctx, &formulaPayload)
	if formulaPayload != "" {
		data.StrategicBets = extractStrategicBets(formulaPayload)
	}

	// Coherence score
	data.CoherenceScore = s.loadCoherenceScore(ctx, instanceID)

	// Evidence count
	evidenceCount, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Count(ctx)
	data.EvidenceCount = int(evidenceCount)

	// Untested assumption count
	total, tested := s.loadAssumptionSummary(ctx, instanceID)
	data.UntestedCount = total - tested

	// AIM cycle count
	aimCycleCount, _ := s.db.NewSelect().
		TableExpr("strategy_versions").
		Where("instance_id = ?", instanceID).
		Where("source = ?", "aim_cycle").
		Count(ctx)
	data.AIMCycleCount = int(aimCycleCount)

	// Version count
	versionCount, _ := s.db.NewSelect().
		TableExpr("strategy_versions").
		Where("instance_id = ?", instanceID).
		Count(ctx)
	data.VersionCount = int(versionCount)
}

// extractNorthStarMission extracts and truncates the mission/purpose from a north star payload.
// Tries mission and purpose fields, which can be strings or objects with a statement key.
func extractNorthStarMission(payloadStr string, maxLen int) string {
	var p map[string]any
	if json.Unmarshal([]byte(payloadStr), &p) != nil {
		return ""
	}
	ns, _ := p["north_star"].(map[string]any)
	if ns == nil {
		ns = p
	}
	// Try purpose.statement first (most common for mission-like text)
	if pObj, ok := ns["purpose"].(map[string]any); ok {
		if v, ok := pObj["statement"].(string); ok && v != "" {
			return truncateString(v, maxLen)
		}
	}
	if v, ok := ns["purpose"].(string); ok && v != "" {
		return truncateString(v, maxLen)
	}
	// Try mission as string or object
	if v, ok := ns["mission"].(string); ok && v != "" {
		return truncateString(v, maxLen)
	}
	if mObj, ok := ns["mission"].(map[string]any); ok {
		if v, ok := mObj["statement"].(string); ok && v != "" {
			return truncateString(v, maxLen)
		}
		if v, ok := mObj["mission_statement"].(string); ok && v != "" {
			return truncateString(v, maxLen)
		}
	}
	return ""
}

// extractStrategicBets extracts strategic bets/positioning from a strategy formula payload.
// The formula structure varies — tries strategic_bets (array), then falls back to
// title + positioning + trade_offs for strategic context.
func extractStrategicBets(payloadStr string) []ui.StrategicBetInfo {
	var p map[string]any
	if json.Unmarshal([]byte(payloadStr), &p) != nil {
		return nil
	}

	// Resolve the strategy object (could be under "strategy", "formula", or top-level)
	strat, _ := p["strategy"].(map[string]any)
	if strat == nil {
		strat, _ = p["formula"].(map[string]any)
	}
	if strat == nil {
		strat = p
	}

	// Try explicit strategic_bets array first
	if betsRaw, ok := strat["strategic_bets"].([]any); ok && len(betsRaw) > 0 {
		var bets []ui.StrategicBetInfo
		for _, b := range betsRaw {
			bMap, ok := b.(map[string]any)
			if !ok {
				continue
			}
			name, _ := bMap["name"].(string)
			if name == "" {
				name, _ = bMap["title"].(string)
			}
			hypothesis, _ := bMap["hypothesis"].(string)
			track, _ := bMap["track"].(string)
			if name != "" {
				bets = append(bets, ui.StrategicBetInfo{
					Name:       name,
					Hypothesis: truncateString(hypothesis, 120),
					Track:      track,
				})
			}
		}
		if len(bets) > 0 {
			return bets
		}
	}

	// Fallback: synthesize from trade_offs (each is a strategic bet in essence)
	if tradeOffs, ok := strat["trade_offs"].([]any); ok && len(tradeOffs) > 0 {
		var bets []ui.StrategicBetInfo
		for _, to := range tradeOffs {
			toMap, ok := to.(map[string]any)
			if !ok {
				continue
			}
			chosen, _ := toMap["decision"].(string)
			if chosen == "" {
				chosen, _ = toMap["chosen"].(string)
			}
			if chosen == "" {
				chosen, _ = toMap["choice"].(string)
			}
			if chosen == "" {
				chosen, _ = toMap["trade_off"].(string)
			}
			rationale, _ := toMap["rationale"].(string)
			if rationale == "" {
				rationale, _ = toMap["why"].(string)
			}
			if chosen != "" {
				bets = append(bets, ui.StrategicBetInfo{
					Name:       truncateString(chosen, 60),
					Hypothesis: truncateString(rationale, 120),
				})
			}
		}
		if len(bets) > 0 {
			return bets
		}
	}

	return nil
}
