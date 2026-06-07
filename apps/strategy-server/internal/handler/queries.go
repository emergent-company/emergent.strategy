package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillrun"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// loadInstanceSummaries loads non-test instances for sidebar navigation,
// joined with org names for grouping.
func (s *Server) loadInstanceSummaries(ctx context.Context) ([]ui.InstanceSummary, error) {
	var rows []struct {
		ID      string `bun:"id"`
		Name    string `bun:"name"`
		OrgID   string `bun:"org_id"`
		OrgName string `bun:"org_name"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name").
		ColumnExpr("o.id AS org_id, o.name AS org_name").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Join("JOIN orgs AS o ON o.id = w.org_id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		Where("w.github_owner NOT LIKE ?", "ripple-%").
		Where("w.github_owner NOT LIKE ?", "aim-ripple-%").
		OrderExpr("o.name ASC, si.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("load instances: %w", err)
	}

	summaries := make([]ui.InstanceSummary, len(rows))
	for i, r := range rows {
		summaries[i] = ui.InstanceSummary{
			ID:      r.ID,
			Name:    r.Name,
			OrgID:   r.OrgID,
			OrgName: r.OrgName,
		}
	}
	return summaries, nil
}

// loadInstance loads a single strategy instance by ID.
func (s *Server) loadInstance(ctx context.Context, id string) (*domain.StrategyInstance, error) {
	var inst domain.StrategyInstance
	err := s.db.NewSelect().
		Model(&inst).
		Where("id = ? AND deleted_at IS NULL", id).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load instance %s: %w", id, err)
	}
	return &inst, nil
}

// hasArtifactType returns true if an artifact of the given type exists.
func (s *Server) hasArtifactType(ctx context.Context, instanceID, artifactType string) bool {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Count(ctx)
	return count > 0
}

// loadAllInstances loads non-test, non-archived instances with enriched data for the global dashboard.
func (s *Server) loadAllInstances(ctx context.Context) ([]ui.InstanceInfo, error) {
	var rows []struct {
		ID          string `bun:"id"`
		Name        string `bun:"name"`
		Status      string `bun:"status"`
		WorkspaceID string `bun:"workspace_id"`
		OrgName     string `bun:"org_name"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name, si.status, si.workspace_id").
		ColumnExpr("o.name AS org_name").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Join("JOIN orgs AS o ON o.id = w.org_id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		Where("w.github_owner NOT LIKE ?", "ripple-%").
		Where("w.github_owner NOT LIKE ?", "aim-ripple-%").
		OrderExpr("o.name ASC, si.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("load instances: %w", err)
	}

	infos := make([]ui.InstanceInfo, len(rows))
	for i, r := range rows {
		infos[i] = s.loadInstanceInfo(ctx, r.ID, r.Name, r.Status, r.WorkspaceID, r.OrgName)
	}
	return infos, nil
}

// loadInstanceInfo loads the enriched data for a single instance card.
func (s *Server) loadInstanceInfo(ctx context.Context, id, name, status, workspaceID, orgName string) ui.InstanceInfo {
	info := ui.InstanceInfo{
		ID:          id,
		Name:        name,
		Status:      status,
		WorkspaceID: workspaceID,
		OrgName:     orgName,
	}

	// Feature and artifact counts
	featureCount, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", id).
		Where("artifact_type = ?", domain.ArtifactTypeFeature).
		Count(ctx)
	info.FeatureCount = int(featureCount)

	artifactCount, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", id).
		Count(ctx)
	info.ArtifactCount = int(artifactCount)

	// North star vision snippet
	var northStarPayload string
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", id).
		Where("artifact_type = ?", domain.ArtifactTypeNorthStar).
		Limit(1).
		Scan(ctx, &northStarPayload)
	if northStarPayload != "" {
		info.NorthStarVision = extractNorthStarVision(northStarPayload, 120)
	}

	// Roadmap timeframe + cycle
	var roadmapPayload string
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", id).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &roadmapPayload)
	if roadmapPayload != "" {
		info.Timeframe, info.Cycle = extractRoadmapMeta(roadmapPayload)
	}

	// Signal severity counts
	info.CriticalSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", id).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		Count(ctx)
	info.WarningSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", id).
		Where("status = ?", "active").
		Where("severity = ?", "warning").
		Count(ctx)

	// Coherence score
	info.CoherenceScore = s.loadCoherenceScore(ctx, id)

	// Evidence count
	evidenceCount, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", id).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Count(ctx)
	info.EvidenceCount = int(evidenceCount)

	// Version count and last version date
	info.VersionCount, info.LastVersionAt = s.loadVersionSummary(ctx, id)

	// Assumption risk profile
	info.AssumptionCount, info.TestedAssumptionCount = s.loadAssumptionSummary(ctx, id)

	return info
}

// extractNorthStarVision extracts and truncates the vision from a north star payload.
// The vision field can be either a string or an object with a vision_statement/statement key.
func extractNorthStarVision(payloadStr string, maxLen int) string {
	var p map[string]any
	if json.Unmarshal([]byte(payloadStr), &p) != nil {
		return ""
	}
	ns, _ := p["north_star"].(map[string]any)
	if ns == nil {
		ns = p // fall back to top-level keys
	}
	return extractVisionText(ns, maxLen)
}

// extractVisionText tries multiple paths to find a vision string.
func extractVisionText(m map[string]any, maxLen int) string {
	// Try vision as a string
	if v, ok := m["vision"].(string); ok && v != "" {
		return truncateString(v, maxLen)
	}
	// Try vision as an object with vision_statement or statement
	if vObj, ok := m["vision"].(map[string]any); ok {
		if v, ok := vObj["vision_statement"].(string); ok && v != "" {
			return truncateString(v, maxLen)
		}
		if v, ok := vObj["statement"].(string); ok && v != "" {
			return truncateString(v, maxLen)
		}
	}
	// Try vision_statement at current level
	if v, ok := m["vision_statement"].(string); ok && v != "" {
		return truncateString(v, maxLen)
	}
	return ""
}

// extractRoadmapMeta extracts timeframe and cycle from a roadmap payload.
func extractRoadmapMeta(payloadStr string) (string, string) {
	var root map[string]any
	if json.Unmarshal([]byte(payloadStr), &root) != nil {
		return "", ""
	}
	roadmap, _ := root["roadmap"].(map[string]any)
	if roadmap == nil {
		return "", ""
	}
	tf, _ := roadmap["timeframe"].(string)
	cycle := ""
	if c, ok := roadmap["cycle"].(float64); ok {
		cycle = fmt.Sprintf("Cycle %d", int(c))
	}
	return tf, cycle
}

// loadCoherenceScore loads the latest coherence/equilibrium score for an instance.
func (s *Server) loadCoherenceScore(ctx context.Context, instanceID string) string {
	var score float64
	err := s.db.NewSelect().
		TableExpr("ripple_convergence_runs").
		ColumnExpr("equilibrium_score").
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx, &score)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%.2f", score)
}

// loadVersionSummary loads version count and last published date.
func (s *Server) loadVersionSummary(ctx context.Context, instanceID string) (int, string) {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_versions").
		Where("instance_id = ?", instanceID).
		Count(ctx)

	var publishedAt time.Time
	_ = s.db.NewSelect().
		TableExpr("strategy_versions").
		ColumnExpr("published_at").
		Where("instance_id = ?", instanceID).
		OrderExpr("published_at DESC").
		Limit(1).
		Scan(ctx, &publishedAt)

	lastVersion := ""
	if !publishedAt.IsZero() {
		lastVersion = publishedAt.Format("2 Jan 15:04")
	}
	return int(count), lastVersion
}

// loadAssumptionSummary counts total assumptions and how many have testing features.
func (s *Server) loadAssumptionSummary(ctx context.Context, instanceID string) (int, int) {
	// Load roadmap to count assumptions
	var payloadStr string
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &payloadStr)
	if payloadStr == "" {
		return 0, 0
	}

	var root map[string]any
	if json.Unmarshal([]byte(payloadStr), &root) != nil {
		return 0, 0
	}
	roadmap, _ := root["roadmap"].(map[string]any)
	if roadmap == nil {
		return 0, 0
	}

	// Count all assumptions across all tracks
	assumptions := make(map[string]bool)
	tracks, _ := roadmap["tracks"].(map[string]any)
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
				assumptions[id] = true
			}
		}
	}

	total := len(assumptions)
	if total == 0 {
		return 0, 0
	}

	// Count how many assumptions have tests_assumption edges
	var tested int
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("COUNT(DISTINCT target_key)").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		Scan(ctx, &tested)

	return total, tested
}

// truncateString truncates a string to maxLen, adding "..." if truncated.
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	// Try to break at a word boundary
	truncated := s[:maxLen]
	for i := len(truncated) - 1; i > maxLen-20; i-- {
		if truncated[i] == ' ' {
			return truncated[:i] + "..."
		}
	}
	return truncated + "..."
}

// loadWorkspaces loads non-test workspaces for the global dashboard.
func (s *Server) loadWorkspaces(ctx context.Context) ([]ui.WorkspaceInfo, error) {
	var workspaces []domain.Workspace
	err := s.db.NewSelect().
		Model(&workspaces).
		Where("deleted_at IS NULL").
		Where("github_owner NOT LIKE ?", "e2e-%").
		Where("github_owner NOT LIKE ?", "ripple-%").
		Where("github_owner NOT LIKE ?", "aim-ripple-%").
		OrderExpr("display_name ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load workspaces: %w", err)
	}

	infos := make([]ui.WorkspaceInfo, len(workspaces))
	for i, ws := range workspaces {
		name := ws.GithubOwner
		if ws.DisplayName != nil {
			name = *ws.DisplayName
		}
		infos[i] = ui.WorkspaceInfo{
			ID:          ws.ID.String(),
			DisplayName: name,
			GithubOwner: ws.GithubOwner,
		}
	}
	return infos, nil
}

// ---------------------------------------------------------------------------
// Cascade tracker queries
// ---------------------------------------------------------------------------

// loadCascadeData assembles the operational state for the cascade tracker panel.
// It reads active skill runs, pending staged batches, and recent completed runs.
// A nil skillRunSvc produces an empty but valid CascadeData.
func (s *Server) loadCascadeData(ctx context.Context, instanceID string) ui.CascadeData {
	data := ui.CascadeData{InstanceID: instanceID}
	instUUID, err := uuid.Parse(instanceID)
	if err != nil {
		return data
	}
	s.loadCascadeSkillRuns(ctx, instUUID, &data)
	s.loadCascadeAIMRun(ctx, instanceID, &data)
	s.loadCascadePendingBatches(ctx, instanceID, &data)
	return data
}

// loadCascadeSkillRuns populates ActiveSkillRuns and RecentRuns.
func (s *Server) loadCascadeSkillRuns(ctx context.Context, instUUID uuid.UUID, data *ui.CascadeData) {
	if s.skillRunSvc == nil {
		return
	}
	activeRuns, err := s.skillRunSvc.ListByInstance(ctx, instUUID, skillrun.ListParams{
		Status: skillrun.StatusRunning,
		Limit:  10,
	})
	if err == nil {
		for _, r := range activeRuns {
			truncated, dropped := cascadeChunkStats(r.ChunkLog)
			data.ActiveSkillRuns = append(data.ActiveSkillRuns, ui.CascadeSkillRun{
				RunID:             r.ID.String(),
				SkillName:         r.SkillName,
				Status:            r.Status,
				Trigger:           r.Trigger,
				ChunksCompleted:   r.ChunksCompleted,
				ChunkCount:        r.ChunkCount,
				TotalInputTokens:  r.TotalInputTokens,
				TotalOutputTokens: r.TotalOutputTokens,
				DurationSec:       r.DurationSeconds(),
				HasTruncation:     truncated,
				DroppedFeatures:   dropped,
				ArtifactTypes:     cascadeArtifactTypes(r.ChunkLog),
			})
		}
	}
	// Recent completed/failed runs (shown when no active runs + no AIM cycle).
	recentRuns, err := s.skillRunSvc.ListByInstance(ctx, instUUID, skillrun.ListParams{Limit: 5})
	if err == nil {
		for _, r := range recentRuns {
			if r.Status == skillrun.StatusRunning {
				continue // already in ActiveSkillRuns
			}
			data.RecentRuns = append(data.RecentRuns, cascadeSkillRunFromRecord(r))
		}
	}
}

// cascadeSkillRunFromRecord converts a skillrun.Run into a ui.CascadeSkillRun.
func cascadeSkillRunFromRecord(r skillrun.Run) ui.CascadeSkillRun {
	truncated, dropped := cascadeChunkStats(r.ChunkLog)
	row := ui.CascadeSkillRun{
		RunID:             r.ID.String(),
		SkillName:         r.SkillName,
		Status:            r.Status,
		Trigger:           r.Trigger,
		ChunksCompleted:   r.ChunksCompleted,
		ChunkCount:        r.ChunkCount,
		TotalInputTokens:  r.TotalInputTokens,
		TotalOutputTokens: r.TotalOutputTokens,
		DurationSec:       r.DurationSeconds(),
		HasTruncation:     truncated,
		DroppedFeatures:   dropped,
		ArtifactTypes:     cascadeArtifactTypes(r.ChunkLog),
	}
	if r.BatchID != nil {
		row.BatchID = r.BatchID.String()
	}
	if r.Error != nil {
		row.Error = *r.Error
	}
	return row
}

// cascadeArtifactTypes extracts deduplicated artifact types from chunk log entries.
func cascadeArtifactTypes(chunkLogRaw json.RawMessage) []string {
	if len(chunkLogRaw) == 0 {
		return nil
	}
	var entries []skillrun.ChunkEntry
	if err := json.Unmarshal(chunkLogRaw, &entries); err != nil {
		return nil
	}
	seen := make(map[string]bool)
	var types []string
	for _, e := range entries {
		if e.ArtifactType != "" && !seen[e.ArtifactType] {
			seen[e.ArtifactType] = true
			types = append(types, e.ArtifactType)
		}
	}
	return types
}

// loadCascadeAIMRun populates ActiveAIMRun when an orchestrated AIM cycle is running.
func (s *Server) loadCascadeAIMRun(ctx context.Context, instanceID string, data *ui.CascadeData) {
	if s.orchestrationEngine == nil {
		return
	}
	activeRun, err := s.orchestrationEngine.ActiveRun(ctx, "aim_cycle", instanceID)
	if err == nil && activeRun != nil {
		data.ActiveAIMRun = &ui.CascadeAIMRun{
			RunID:       activeRun.ID.String(),
			Status:      string(activeRun.Status),
			CurrentStep: activeRun.CurrentStep,
		}
	}
}

// loadCascadePendingBatches populates PendingBatches from staged strategy_mutations.
func (s *Server) loadCascadePendingBatches(ctx context.Context, instanceID string, data *ui.CascadeData) {
	type batchRow struct {
		BatchID          string  `bun:"batch_id"`
		BatchDescription *string `bun:"batch_description"`
		AgentID          *string `bun:"agent_id"`
		MutationCount    int     `bun:"mutation_count"`
		BatchMetadata    []byte  `bun:"batch_metadata"`
	}
	var rows []batchRow
	_ = s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("batch_id::text AS batch_id").
		ColumnExpr("MAX(batch_description) AS batch_description").
		ColumnExpr("MAX(agent_id) AS agent_id").
		ColumnExpr("COUNT(*) AS mutation_count").
		ColumnExpr("MAX(batch_metadata::text)::jsonb AS batch_metadata").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "staged").
		GroupExpr("batch_id").
		OrderExpr("MIN(created_at) ASC").
		Limit(10).
		Scan(ctx, &rows)

	for _, b := range rows {
		if b.BatchID == "" {
			continue
		}
		desc := ""
		if b.BatchDescription != nil {
			desc = *b.BatchDescription
		}
		agentID := ""
		if b.AgentID != nil {
			agentID = *b.AgentID
		}
		data.PendingBatches = append(data.PendingBatches, ui.CascadeBatch{
			BatchID:        b.BatchID,
			Description:    desc,
			AgentID:        agentID,
			MutationCount:  b.MutationCount,
			ReviewURL:      "/strategies/" + instanceID + "/aim/draft-review/" + b.BatchID,
			DownstreamHint: cascadeDownstreamHint(agentID, b.BatchMetadata),
		})
	}
}

// cascadeChunkStats scans a chunk_log JSONB array and returns:
// - truncated: true if any chunk had context_truncated=true
// - dropped: sum of dropped_features across all chunks
func cascadeChunkStats(raw json.RawMessage) (truncated bool, dropped int) {
	if len(raw) == 0 {
		return
	}
	var entries []skillrun.ChunkEntry
	if json.Unmarshal(raw, &entries) != nil {
		return
	}
	for _, e := range entries {
		if e.ContextTruncated {
			truncated = true
		}
		dropped += e.DroppedFeatures
	}
	return
}

// cascadeDownstreamHint returns a hint about what happens after committing a batch,
// based on the agent that produced it and any batch metadata.
func cascadeDownstreamHint(agentID string, metadata json.RawMessage) string {
	// Infer from agent ID.
	switch agentID {
	case "adapt-strategy":
		return "After committing, adapt-foundations will run automatically to keep READY artifacts aligned."
	case "adapt-foundations":
		return "Committing this draft updates North Star, Foundations, Analyses, and Opportunity."
	}
	// Infer from batch_metadata trigger field.
	if len(metadata) > 0 {
		var m map[string]any
		if json.Unmarshal(metadata, &m) == nil {
			if trigger, _ := m["trigger"].(string); trigger == "ripple" {
				return "This batch was triggered automatically by a ripple signal."
			}
		}
	}
	return ""
}
