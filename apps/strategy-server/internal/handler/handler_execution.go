package handler

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
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
		return echo.NewHTTPError(404, "Instance not found")
	}

	data := s.loadExecutionData(ctx, instanceID, instance.Name)
	tabs := s.strategyTabs(instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)

	content := ui.ExecutionDashboardContent(data)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(instance.Name+" — Strategy", currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		content,
	)
	return nil
}

// loadExecutionData loads the full execution dashboard data:
// roadmap OKRs → linked features → assumption confidence.
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
	s.log.Info("execution: roadmap parsed", "timeframe", roadmap["timeframe"], "tracks_exist", roadmap["tracks"] != nil)

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
		{"product", "Product", "lucide--code-2"},
		{"strategy", "Strategy", "lucide--navigation"},
		{"org_ops", "Org & Ops", "lucide--container"},
		{"commercial", "Commercial", "lucide--briefcase"},
	}

	for _, tm := range trackMeta {
		trackData, ok := tracks[tm.key].(map[string]any)
		if !ok {
			continue
		}
		okrsRaw, ok := trackData["okrs"].([]any)
		if !ok || len(okrsRaw) == 0 {
			continue
		}

		track := ui.ExecutionTrack{Name: tm.name, Icon: tm.icon}

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
						Href:   "/strategies/" + instanceID + "/artifacts/" + f.key,
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

	// Count active signals
	data.ActiveSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Count(ctx)

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
