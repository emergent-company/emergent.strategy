package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// loadReadyPhaseData loads data for the READY phase dashboard.
func (s *Server) loadReadyPhaseData(ctx context.Context, instanceID string) ui.ReadyPhaseData {
	data := ui.ReadyPhaseData{
		InstanceID:     instanceID,
		TotalArtifacts: 7, // north_star, insight_analyses, strategy_foundations, insight_opportunity, strategy_formula, roadmap_recipe, product_portfolio
	}

	// North Star — org name + vision + purpose statement
	data.NorthStarExists, data.NorthStarOrg, data.NorthStarVision = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeNorthStar, "north_star.organization", "north_star.vision.vision_statement")
	data.NorthStarPurpose = firstSentence(s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeNorthStar, "north_star.purpose.statement"))
	if data.NorthStarExists {
		data.NorthStarGaps = s.loadArtifactGaps(ctx, instanceID, domain.ArtifactTypeNorthStar, checkNorthStarGaps)
	}

	// Insight Analyses — name + first trend title + at-a-glance counts
	data.InsightExists, data.InsightTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeInsightAnalyses, "name", "")
	data.InsightFirstTrend, data.InsightTrendCount, data.InsightPersonaCount,
		data.InsightCompetitorCount, data.InsightKeyInsightCount, data.InsightWhiteSpaceCount =
		s.extractInsightCounts(ctx, instanceID)
	if data.InsightExists {
		data.InsightGaps = s.loadInsightGaps(ctx, instanceID)
	}

	// Insight Opportunity — title + urgency (first sentence)
	data.OpportunityExists, data.OpportunityTitle, _ = s.loadArtifactSummary(ctx, instanceID, "insight_opportunity", "opportunity.title", "")
	data.OpportunityUrgency = firstSentence(s.extractPayloadField(ctx, instanceID, "insight_opportunity", "opportunity.context.urgency"))
	if data.OpportunityExists {
		data.OpportunityGaps = s.loadArtifactGaps(ctx, instanceID, "insight_opportunity", checkOpportunityGaps)
	}

	// Strategy Formula — title + UVP (first sentence) + category position
	data.FormulaExists, data.FormulaTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeStrategyFormula, "strategy.title", "")
	data.FormulaUVP = firstSentence(s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeStrategyFormula, "strategy.positioning.unique_value_proposition"))
	data.FormulaCategory = s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeStrategyFormula, "strategy.positioning.category_position")
	if data.FormulaExists {
		data.FormulaGaps = s.loadArtifactGaps(ctx, instanceID, domain.ArtifactTypeStrategyFormula, checkFormulaGaps)
	}

	// Strategy Foundations — value prop headline + product vision (first sentence)
	data.FoundationExists, data.FoundationTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeStrategyFoundations, "name", "")
	data.FoundationValueProp = s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeStrategyFoundations, "strategy_foundations.value_proposition.headline")
	data.FoundationVision = firstSentence(s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeStrategyFoundations, "strategy_foundations.product_vision.vision_statement"))
	if data.FoundationExists {
		data.FoundationGaps = s.loadArtifactGaps(ctx, instanceID, domain.ArtifactTypeStrategyFoundations, checkFoundationGaps)
	}

	// Roadmap Recipe — title + cycle name
	data.RoadmapExists, data.RoadmapTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeRoadmap, "name", "")
	data.RoadmapCycle = s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeRoadmap, "roadmap.cycle")
	if data.RoadmapExists {
		data.RoadmapGaps = s.loadArtifactGaps(ctx, instanceID, domain.ArtifactTypeRoadmap, checkRoadmapGaps)
	}

	// Count completed
	for _, exists := range []bool{data.NorthStarExists, data.InsightExists, data.FoundationExists, data.FormulaExists, data.RoadmapExists, data.OpportunityExists} {
		if exists {
			data.CompletedArtifacts++
		}
	}
	// Check product_portfolio too
	if s.hasArtifactType(ctx, instanceID, "product_portfolio") {
		data.CompletedArtifacts++
	}

	// Load roadmap OKR summary from payload
	data.TrackOKRs = s.loadRoadmapOKRs(ctx, instanceID)

	return data
}

// loadFirePhaseData loads data for the FIRE phase dashboard.
func (s *Server) loadFirePhaseData(ctx context.Context, instanceID string) ui.FirePhaseData {
	data := ui.FirePhaseData{InstanceID: instanceID}

	// Features by status
	data.DeliveredCount = s.countArtifactsByStatus(ctx, instanceID, domain.ArtifactTypeFeature, "delivered")
	data.InProgressCount = s.countArtifactsByStatus(ctx, instanceID, domain.ArtifactTypeFeature, "in-progress")
	data.DraftCount = s.countArtifactsByStatus(ctx, instanceID, domain.ArtifactTypeFeature, "draft")
	data.TotalFeatures = data.DeliveredCount + data.InProgressCount + data.DraftCount

	// Per-track circular traceability data (ordered: Strategy, OrgOps, Product, Commercial)
	data.FireTracks = s.loadFireTracks(ctx, instanceID)

	// Legacy track summaries (for trackCard if still used)
	data.Tracks = []ui.TrackSummary{
		{Name: "Product", Icon: "lucide--code-2", Count: s.countByType(ctx, instanceID, domain.ArtifactTypeFeature), Track: "product"},
		{Name: "Commercial", Icon: "lucide--briefcase", Count: s.countByType(ctx, instanceID, "commercial_def"), Track: "commercial"},
		{Name: "Strategy", Icon: "lucide--navigation", Count: s.countByType(ctx, instanceID, "strategy_def"), Track: "strategy"},
		{Name: "Org & Ops", Icon: "lucide--container", Count: s.countByType(ctx, instanceID, "org_ops_def"), Track: "org-ops"},
	}

	// Value models
	data.ValueModels = s.loadValueModels(ctx, instanceID)

	// Features
	data.RecentFeatures = s.loadFeatures(ctx, instanceID)

	return data
}

// loadFireTracks builds the per-track circular traceability data:
// Roadmap KRs → Value Model layers → Definition count.
// Order is always: Strategy, Org & Ops, Product, Commercial.
func (s *Server) loadFireTracks(ctx context.Context, instanceID string) []ui.FireTrackData {
	// Track metadata in canonical order
	trackMeta := []struct {
		name    string
		icon    string
		track   string // roadmap payload key
		dbTrack string // artifact_type for definitions
		vmName  string // value_model name in DB
		color   string
		defURL  string
	}{
		{"Strategy", "lucide--navigation", "strategy", "strategy_def", "Strategy", "secondary", "/fire/strategy"},
		{"Org & Ops", "lucide--container", "org_ops", "org_ops_def", "OrgOps", "accent", "/fire/org-ops"},
		{"Product", "lucide--code-2", "product", domain.ArtifactTypeFeature, "Product", "primary", "/fire/product"},
		{"Commercial", "lucide--briefcase", "commercial", "commercial_def", "Commercial", "info", "/fire/commercial"},
	}

	// Load roadmap payload once
	roadmapOKRs := s.loadRoadmapOKRsByTrack(ctx, instanceID)

	// Load value model layers per track name
	vmLayers := s.loadValueModelLayersByTrack(ctx, instanceID)

	// Load value model counts per track name
	vmCounts := s.loadValueModelCountsByTrack(ctx, instanceID)

	// Load product line summaries for the Product column in the overview
	productLineSummaries := s.loadProductLineSummaries(ctx, instanceID)

	tracks := make([]ui.FireTrackData, 0, len(trackMeta))
	for _, tm := range trackMeta {
		defCount := s.countByType(ctx, instanceID, tm.dbTrack)
		t := ui.FireTrackData{
			Name:             tm.name,
			Icon:             tm.icon,
			Track:            tm.track,
			Color:            tm.color,
			Objectives:       roadmapOKRs[tm.track],
			ValueModelExists: vmCounts[tm.vmName] > 0,
			ValueModelLayers: vmLayers[tm.vmName],
			ValueModelCount:  vmCounts[tm.vmName],
			DefinitionCount:  defCount,
			DefinitionURL:    "/strategies/" + instanceID + tm.defURL,
		}
		if tm.track == "product" {
			t.ProductLines = productLineSummaries
		}
		tracks = append(tracks, t)
	}
	return tracks
}

// loadRoadmapOKRsByTrack extracts objectives + key results per track from the roadmap payload.
func (s *Server) loadRoadmapOKRsByTrack(ctx context.Context, instanceID string) map[string][]ui.FireOKRObjective {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return nil
	}
	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return nil
	}
	roadmap, ok := m["roadmap"].(map[string]any)
	if !ok {
		return nil
	}
	tracks, ok := roadmap["tracks"].(map[string]any)
	if !ok {
		return nil
	}

	result := make(map[string][]ui.FireOKRObjective)
	for trackKey, trackVal := range tracks {
		trackMap, ok := trackVal.(map[string]any)
		if !ok {
			continue
		}
		okrs, ok := trackMap["okrs"].([]any)
		if !ok {
			continue
		}
		var objectives []ui.FireOKRObjective
		for _, okrAny := range okrs {
			okrMap, ok := okrAny.(map[string]any)
			if !ok {
				continue
			}
			obj, _ := okrMap["objective"].(string)
			if obj == "" {
				continue
			}
			var krs []ui.FireOKRKeyResult
			if krList, ok := okrMap["key_results"].([]any); ok {
				for _, kr := range krList {
					krMap, ok := kr.(map[string]any)
					if !ok {
						continue
					}
					desc, _ := krMap["description"].(string)
					if desc == "" {
						desc, _ = krMap["target"].(string)
					}
					if desc == "" {
						continue
					}
					kr := ui.FireOKRKeyResult{Description: desc}
					if v, ok := krMap["trl_start"].(float64); ok {
						kr.TRLStart = int(v)
					}
					if v, ok := krMap["trl_target"].(float64); ok {
						kr.TRLTarget = int(v)
					}
					kr.TRLProgression, _ = krMap["trl_progression"].(string)
					krs = append(krs, kr)
				}
			}
			objectives = append(objectives, ui.FireOKRObjective{
				Objective:  obj,
				KeyResults: krs,
			})
		}
		result[trackKey] = objectives
	}
	return result
}

// loadValueModelLayersByTrack returns the L1 layer names per track value model name.
func (s *Server) loadValueModelLayersByTrack(ctx context.Context, instanceID string) map[string][]string {
	var rows []struct {
		Name    string `bun:"name"`
		Payload string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("name, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		Scan(ctx, &rows)

	// For each track we want the canonical single value model (Strategy/OrgOps/Commercial/Product).
	// Where multiple Product models exist, concatenate all unique layer names.
	result := make(map[string][]string)
	seen := make(map[string]map[string]bool) // track name → layer name → exists
	for _, r := range rows {
		var m map[string]any
		if json.Unmarshal([]byte(r.Payload), &m) != nil {
			continue
		}
		layers, ok := m["layers"].([]any)
		if !ok {
			continue
		}
		if seen[r.Name] == nil {
			seen[r.Name] = make(map[string]bool)
		}
		for _, layerAny := range layers {
			layerMap, ok := layerAny.(map[string]any)
			if !ok {
				continue
			}
			name, _ := layerMap["name"].(string)
			if name != "" && !seen[r.Name][name] {
				seen[r.Name][name] = true
				result[r.Name] = append(result[r.Name], toTitleCase(name))
			}
		}
	}
	return result
}

// loadValueModelCountsByTrack counts value models per track name.
func (s *Server) loadValueModelCountsByTrack(ctx context.Context, instanceID string) map[string]int {
	var rows []struct {
		Name  string `bun:"name"`
		Count int    `bun:"count"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("name, COUNT(*) as count").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		GroupExpr("name").
		Scan(ctx, &rows)

	result := make(map[string]int)
	for _, r := range rows {
		result[r.Name] += r.Count
	}
	return result
}

// loadCanonicalLayerGroups builds the Layer → Component → Definitions grouping for
// canonical tracks (strategy, org_ops, commercial). It reads the value model to get
// the ordered layer/component hierarchy, then assigns each definition to its component
// by matching the second segment of its contributes_to path against component names.
//
// vmName is the value_model.name in DB ("Strategy", "OrgOps", "Commercial").
// dbType is the artifact_type for definitions ("strategy_def", etc.).
// defURL builds the view URL for each definition.
func (s *Server) loadCanonicalLayerGroups(
	ctx context.Context,
	instanceID, vmName, dbType string,
	defURL func(instanceID, key string) string,
) []ui.FireLayerGroup {
	// 1. Load the value model — one row expected for canonical tracks.
	var vmPayload string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload::text").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		Where("name = ?", vmName).
		Limit(1).
		Scan(ctx, &vmPayload)
	if err != nil || vmPayload == "" {
		return nil
	}
	var vm map[string]any
	if json.Unmarshal([]byte(vmPayload), &vm) != nil {
		return nil
	}
	rawLayers, _ := vm["layers"].([]any)
	if len(rawLayers) == 0 {
		return nil
	}

	// Build ordered layer + component structure; keep a lookup by comp name (lowercased) for matching.
	type compMeta struct {
		id   string
		name string
		idx  int // position within layer
	}
	type layerMeta struct {
		id         string
		name       string
		comps      []compMeta
		compByName map[string]int // lowercased comp name → index in comps
	}

	layers := make([]layerMeta, 0, len(rawLayers))
	for _, lAny := range rawLayers {
		lm, ok := lAny.(map[string]any)
		if !ok {
			continue
		}
		lid, _ := lm["id"].(string)
		lname, _ := lm["name"].(string)
		if lid == "" {
			continue
		}
		meta := layerMeta{
			id:         lid,
			name:       toTitleCase(lname),
			compByName: make(map[string]int),
		}
		rawComps, _ := lm["components"].([]any)
		for _, cAny := range rawComps {
			cm, ok := cAny.(map[string]any)
			if !ok {
				continue
			}
			cid, _ := cm["id"].(string)
			cname, _ := cm["name"].(string)
			if cid == "" {
				continue
			}
			idx := len(meta.comps)
			meta.comps = append(meta.comps, compMeta{id: cid, name: cname, idx: idx})
			meta.compByName[strings.ToLower(cname)] = idx
		}
		layers = append(layers, meta)
	}

	// 2. Load all definitions for this track.
	var rows []struct {
		ArtifactKey string `bun:"artifact_key"`
		Name        string `bun:"name"`
		Status      string `bun:"status"`
		Payload     string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, status, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", dbType).
		OrderExpr("name ASC").
		Scan(ctx, &rows)

	// 3. Assign each definition to its component(s).
	// groups[layerIdx][compIdx] = []FireTrackDefinition
	groups := make([][][]ui.FireTrackDefinition, len(layers))
	for i, l := range layers {
		groups[i] = make([][]ui.FireTrackDefinition, len(l.comps))
		for j := range groups[i] {
			groups[i][j] = []ui.FireTrackDefinition{}
		}
	}

	for _, r := range rows {
		name := r.Name
		if name == "" {
			name = r.ArtifactKey
		}
		tier := 0
		var tierDesc, effort, owner string
		var p map[string]any
		if json.Unmarshal([]byte(r.Payload), &p) == nil {
			if mat, ok := p["maturity"].(map[string]any); ok {
				if t, ok := mat["current_tier"].(float64); ok {
					tier = int(t)
					// Pull description + effort from the current tier block.
					var tierKey string
					switch tier {
					case 2:
						tierKey = "tier_2_intermediate"
					case 3:
						tierKey = "tier_3_advanced"
					default:
						tierKey = fmt.Sprintf("tier_%d_basic", tier)
					}
					if tb, ok := mat[tierKey].(map[string]any); ok {
						tierDesc, _ = tb["description"].(string)
						effort, _ = tb["effort"].(string)
					}
				}
			}
			if def, ok := p["definition"].(map[string]any); ok {
				owner, _ = def["owner"].(string)
			}
		}
		// Extract contributes_to paths first so MissingValueModelLink can be set accurately.
		// Each path is "Track.ComponentName.def-slug"
		var paths []string
		if ct, ok := p["contributes_to"].([]any); ok {
			for _, v := range ct {
				if s, ok := v.(string); ok {
					paths = append(paths, s)
				}
			}
		}

		def := ui.FireTrackDefinition{
			Key:                   r.ArtifactKey,
			Name:                  name,
			Status:                r.Status,
			MaturityTier:          tier,
			MaturityDescription:   tierDesc,
			Effort:                effort,
			Owner:                 owner,
			ViewURL:               defURL(instanceID, r.ArtifactKey),
			MissingValueModelLink: len(paths) == 0,
		}

		placed := make(map[string]bool) // prevent placing same def in same comp twice
		for _, path := range paths {
			parts := strings.SplitN(path, ".", 3)
			if len(parts) < 2 {
				continue
			}
			compNameRaw := parts[1] // e.g. "Vision & mission", "Competitor Analysis"
			compKey := strings.ToLower(compNameRaw)
			// Find which layer contains this component
			for li, layer := range layers {
				if ci, ok := layer.compByName[compKey]; ok {
					placeKey := r.ArtifactKey + "|" + layer.comps[ci].id
					if !placed[placeKey] {
						placed[placeKey] = true
						groups[li][ci] = append(groups[li][ci], def)
					}
					break
				}
			}
		}
	}

	// 4. Build result, skipping empty layers.
	result := make([]ui.FireLayerGroup, 0, len(layers))
	for li, layer := range layers {
		lg := ui.FireLayerGroup{
			LayerID:   layer.id,
			LayerName: layer.name,
		}
		for ci, comp := range layer.comps {
			lg.Components = append(lg.Components, ui.FireComponentGroup{
				ComponentID:   comp.id,
				ComponentName: comp.name,
				Definitions:   groups[li][ci],
			})
		}
		result = append(result, lg)
	}
	return result
}

// loadProductLineSummaries returns a compact per-product-line summary for the FIRE overview column.
// It reads each Product value model in canonical order and extracts the display name + layer names.
func (s *Server) loadProductLineSummaries(ctx context.Context, instanceID string) []ui.FireProductLineSummary {
	var rows []struct {
		ArtifactKey string `bun:"artifact_key"`
		Payload     string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		Where("name = ?", "Product").
		OrderExpr("artifact_key ASC").
		Scan(ctx, &rows)

	result := make([]ui.FireProductLineSummary, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		if json.Unmarshal([]byte(r.Payload), &m) != nil {
			continue
		}
		displayName := productLineDisplayName(r.ArtifactKey, m)
		var layers []string
		if ls, ok := m["layers"].([]any); ok {
			for _, lAny := range ls {
				if lm, ok := lAny.(map[string]any); ok {
					if name, ok := lm["name"].(string); ok && name != "" {
						layers = append(layers, toTitleCase(name))
					}
				}
			}
		}
		result = append(result, ui.FireProductLineSummary{
			Name:   displayName,
			Layers: layers,
		})
	}
	return result
}

// loadProductLineGroups returns features grouped by product line → layer → component
// for the Product track dashboard.
// Each group corresponds to one Product value model. Features are assigned to
// layers and components by matching their contributes_to path segments:
//
//	"Product.LayerCamelCase.ComponentCamelCase"
//
// Layer matching: kebabToCamelCaseVariants(layerID) includes the path segment.
// Component matching: strip hyphens and lowercase both component ID and path segment.
func (s *Server) loadProductLineGroups(ctx context.Context, instanceID string, defURL func(string, string) string) []ui.FireProductLineGroup {
	// Load all Product value models in order.
	var vmRows []struct {
		ArtifactKey string `bun:"artifact_key"`
		Payload     string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		Where("name = ?", "Product").
		OrderExpr("artifact_key ASC").
		Scan(ctx, &vmRows)

	// Internal types for building the hierarchy.
	type compMeta struct {
		id        string // kebab-case, e.g. "knowledge-graph"
		name      string // display name, e.g. "Knowledge Graph"
		normalKey string // lowercase, no hyphens — for matching
	}
	type layerMeta struct {
		id        string
		name      string          // display name
		layerKeys map[string]bool // camelCase variants from kebabToCamelCaseVariants
		comps     []compMeta
		compByKey map[string]int // normalKey → index in comps
	}
	type vmMeta struct {
		key    string
		name   string
		layers []layerMeta
		// fast lookup: camelCase layer key → layer index
		layerIdx map[string]int
	}

	vms := make([]vmMeta, 0, len(vmRows))
	for _, r := range vmRows {
		var m map[string]any
		if json.Unmarshal([]byte(r.Payload), &m) != nil {
			continue
		}
		displayName := productLineDisplayName(r.ArtifactKey, m)
		vm := vmMeta{
			key:      r.ArtifactKey,
			name:     displayName,
			layerIdx: make(map[string]int),
		}
		if ls, ok := m["layers"].([]any); ok {
			for _, lAny := range ls {
				lm, ok := lAny.(map[string]any)
				if !ok {
					continue
				}
				layerID, _ := lm["id"].(string)
				layerName, _ := lm["name"].(string)
				if layerID == "" {
					continue
				}
				lMeta := layerMeta{
					id:        layerID,
					name:      toTitleCase(layerName),
					layerKeys: make(map[string]bool),
					compByKey: make(map[string]int),
				}
				for _, v := range kebabToCamelCaseVariants(layerID) {
					lMeta.layerKeys[v] = true
				}
				// Parse components within this layer.
				if rawComps, ok := lm["components"].([]any); ok {
					for _, cAny := range rawComps {
						cm, ok := cAny.(map[string]any)
						if !ok {
							continue
						}
						cid, _ := cm["id"].(string)
						cname, _ := cm["name"].(string)
						if cid == "" {
							continue
						}
						normalKey := strings.ToLower(strings.ReplaceAll(cid, "-", ""))
						idx := len(lMeta.comps)
						lMeta.comps = append(lMeta.comps, compMeta{
							id:        cid,
							name:      cname,
							normalKey: normalKey,
						})
						lMeta.compByKey[normalKey] = idx
					}
				}
				// Register all camelCase layer keys → layer index in this VM.
				lIdx := len(vm.layers)
				for k := range lMeta.layerKeys {
					vm.layerIdx[k] = lIdx
				}
				vm.layers = append(vm.layers, lMeta)
			}
		}
		vms = append(vms, vm)
	}

	if len(vms) == 0 {
		return nil
	}

	// Load all features with their contributes_to paths.
	var featureRows []struct {
		ArtifactKey string `bun:"artifact_key"`
		Name        string `bun:"name"`
		Status      string `bun:"status"`
		Payload     string `bun:"payload"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, status, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "feature").
		OrderExpr("name ASC").
		Scan(ctx, &featureRows)

	// groups[vmIdx][layerIdx][compIdx] = []FireTrackDefinition
	type key3 struct{ vm, layer, comp int }
	buckets := make(map[key3][]ui.FireTrackDefinition)
	assigned := make(map[string]bool)

	for _, fr := range featureRows {
		var p map[string]any
		_ = json.Unmarshal([]byte(fr.Payload), &p)
		var paths []string
		if sc, ok := p["strategic_context"].(map[string]any); ok {
			if ct, ok := sc["contributes_to"].([]any); ok {
				for _, v := range ct {
					if sv, ok := v.(string); ok {
						paths = append(paths, sv)
					}
				}
			}
		}
		maturityStage, capCount, implLinks := extractFeatureDefFields([]byte(fr.Payload))
		name := fr.Name
		if name == "" {
			name = fr.ArtifactKey
		}
		def := ui.FireTrackDefinition{
			Key:                   fr.ArtifactKey,
			Name:                  name,
			Status:                fr.Status,
			ViewURL:               defURL(instanceID, fr.ArtifactKey),
			MaturityStage:         maturityStage,
			CapabilityCount:       capCount,
			ImplLinks:             implLinks,
			MissingValueModelLink: len(paths) == 0,
		}

		placed := make(map[key3]bool)
		for _, path := range paths {
			// path format: "Product.LayerCamelCase.ComponentCamelCase"
			parts := strings.SplitN(path, ".", 3)
			if len(parts) < 2 {
				continue
			}
			layerSeg := parts[1] // e.g. "MemoryReasoningEngine"
			compSeg := ""
			if len(parts) == 3 {
				compSeg = strings.ToLower(parts[2]) // e.g. "knowledgegraph"
			}

			for vi, vm := range vms {
				lIdx, ok := vm.layerIdx[layerSeg]
				if !ok {
					continue
				}
				layer := vm.layers[lIdx]
				// Try to match component.
				cIdx := -1
				if compSeg != "" {
					if ci, ok := layer.compByKey[compSeg]; ok {
						cIdx = ci
					}
				}
				if cIdx == -1 {
					// Fallback: place in first component of the layer (or skip if none).
					if len(layer.comps) > 0 {
						cIdx = 0
					} else {
						continue
					}
				}
				k := key3{vi, lIdx, cIdx}
				if !placed[k] {
					placed[k] = true
					buckets[k] = append(buckets[k], def)
				}
				assigned[fr.ArtifactKey] = true
				break // first VM match wins
			}
		}
	}

	// Build result with full hierarchy.
	result := make([]ui.FireProductLineGroup, 0, len(vms))
	for vi, vm := range vms {
		var layerChips []string
		var layerGroups []ui.FireLayerGroup
		for li, layer := range vm.layers {
			layerChips = append(layerChips, layer.name)
			lg := ui.FireLayerGroup{
				LayerID:   layer.id,
				LayerName: layer.name,
			}
			for ci, comp := range layer.comps {
				k := key3{vi, li, ci}
				lg.Components = append(lg.Components, ui.FireComponentGroup{
					ComponentID:   comp.id,
					ComponentName: comp.name,
					Definitions:   buckets[k],
				})
			}
			layerGroups = append(layerGroups, lg)
		}
		result = append(result, ui.FireProductLineGroup{
			Name:       vm.name,
			VMKey:      vm.key,
			VMViewURL:  "/strategies/" + instanceID + "/fire/value-models/" + vm.key,
			LayerChips: layerChips,
			Layers:     layerGroups,
		})
	}
	_ = assigned // used for deduplication tracking
	return result
}

// extractFeatureDefFields pulls the product-track-specific display fields out of a
// raw feature payload: maturity stage, capability count, and implementation links.
func extractFeatureDefFields(payload []byte) (maturityStage string, capCount int, implLinks []ui.FireImplLink) {
	var p map[string]any
	if json.Unmarshal(payload, &p) != nil {
		return
	}

	// feature_maturity.overall_stage
	if fm, ok := p["feature_maturity"].(map[string]any); ok {
		maturityStage, _ = fm["overall_stage"].(string)
		// Capability count from feature_maturity.capabilities (object keyed by cap-id)
		if caps, ok := fm["capabilities"].(map[string]any); ok {
			capCount = len(caps)
		}
	}
	// If no capability_maturity count, fall back to definition.capabilities array
	if capCount == 0 {
		if def, ok := p["definition"].(map[string]any); ok {
			if caps, ok := def["capabilities"].([]any); ok {
				capCount = len(caps)
			}
		}
	}

	// implementation_references: object with optional "specs" array
	if ir, ok := p["implementation_references"].(map[string]any); ok {
		toolName, _ := ir["tool_name"].(string)
		if specs, ok := ir["specs"].([]any); ok {
			for _, specAny := range specs {
				spec, ok := specAny.(map[string]any)
				if !ok {
					continue
				}
				id, _ := spec["id"].(string)
				if id == "" {
					continue
				}
				url, _ := spec["url"].(string)
				// Build a short label: use id but strip common prefixes for brevity
				label := id
				implLinks = append(implLinks, ui.FireImplLink{
					ID:       id,
					Label:    label,
					URL:      url,
					ToolName: toolName,
				})
			}
		}
	}
	return
}

// productLineDisplayName extracts a display name for a Product value model.
// It tries the payload field "product_line_name", then falls back to the artifact key slug.
func productLineDisplayName(artifactKey string, m map[string]any) string {
	if pln, ok := m["product_line_name"].(string); ok && pln != "" {
		return pln
	}
	// Key format: "value_model_product.<slug>.value_model"
	parts := strings.Split(artifactKey, ".")
	if len(parts) >= 2 {
		return slugToTitle(parts[len(parts)-2])
	}
	return artifactKey
}

// kebabToCamelCaseVariants returns CamelCase variants of a kebab-case layer ID.
// It strips common prefixes like "layer-" and generates the CamelCase form.
// Returns all variants so that multiple contributes_to spellings can match.
func kebabToCamelCaseVariants(layerID string) []string {
	variants := []string{}
	bases := []string{layerID}
	// Also try without "layer-" prefix
	if strings.HasPrefix(layerID, "layer-") {
		bases = append(bases, strings.TrimPrefix(layerID, "layer-"))
	}
	for _, base := range bases {
		parts := strings.Split(base, "-")
		var b strings.Builder
		for _, p := range parts {
			if len(p) == 0 {
				continue
			}
			b.WriteString(strings.ToUpper(p[:1]) + p[1:])
		}
		cc := b.String()
		// Also try all-uppercase acronym handling: "Ai" → "AI", "Aim" → "AIM", "Mcp" → "MCP"
		cc = fixAcronyms(cc)
		if cc != "" {
			variants = append(variants, cc)
		}
		// Also add the un-fixed version so we get both
		if b.String() != cc {
			variants = append(variants, b.String())
		}
	}
	return variants
}

// fixAcronyms corrects known acronyms that get mangled by simple CamelCase conversion.
var acronymReplacer = strings.NewReplacer(
	"Ai", "AI",
	"Aim", "AIM",
	"Mcp", "MCP",
	"Epf", "EPF",
	"Api", "API",
)

func fixAcronyms(s string) string {
	return acronymReplacer.Replace(s)
}

// loadAimPhaseData loads data for the AIM phase dashboard.
func (s *Server) loadAimPhaseData(ctx context.Context, instanceID string) ui.AimPhaseData {
	data := ui.AimPhaseData{InstanceID: instanceID}

	// Assumptions
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		ColumnExpr("COUNT(DISTINCT target_key)").
		Scan(ctx, &data.TotalAssumptions)

	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		ColumnExpr("COUNT(DISTINCT source_key)").
		Scan(ctx, &data.TestedAssumptions)

	// Signal counts
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

	// Recent signals feed (up to 5, most critical first, then newest)
	type signalRow struct {
		ID          string    `bun:"id"`
		SignalType  string    `bun:"signal_type"`
		Severity    string    `bun:"severity"`
		SourceKey   string    `bun:"source_key"`
		TargetKey   string    `bun:"target_key"`
		Description string    `bun:"description"`
		CreatedAt   time.Time `bun:"created_at"`
	}
	var rawSignals []signalRow
	_ = s.db.NewSelect().
		TableExpr("ripple_signals").
		ColumnExpr("id, signal_type, severity, source_key, target_key, description, created_at").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		OrderExpr("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC").
		Limit(5).
		Scan(ctx, &rawSignals)

	data.RecentSignals = make([]ui.AimSignalRow, 0, len(rawSignals))
	for _, r := range rawSignals {
		data.RecentSignals = append(data.RecentSignals, ui.AimSignalRow{
			ID:          r.ID,
			SignalType:  r.SignalType,
			Severity:    r.Severity,
			SourceKey:   r.SourceKey,
			TargetKey:   r.TargetKey,
			Description: r.Description,
			CreatedAt:   r.CreatedAt.Format("2 Jan 15:04"),
		})
	}

	// AIM artifacts
	data.HasLRA = s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeLRA)
	data.HasAssessmentReport = s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeAssessmentReport)
	data.HasTriggerConfig = s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeAIMTriggerConfig)
	data.HasCalibration = s.hasArtifactType(ctx, instanceID, "calibration_memo")
	data.HasRealityCheck = s.hasArtifactType(ctx, instanceID, "strategic_reality_check")

	// LRA lifecycle stage
	if data.HasLRA {
		data.LRALifecycleStage = s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeLRA, "metadata.lifecycle_stage")
	}

	// Latest calibration decision
	if data.HasCalibration {
		data.LatestCalibrationDecision = s.extractPayloadField(ctx, instanceID, "calibration_memo", "decision")
	}

	// Versions
	data.VersionCount, _ = s.db.NewSelect().
		TableExpr("strategy_versions").
		Where("instance_id = ?", instanceID).
		Count(ctx)

	// Trigger evaluation (lazy — evaluated at render time, no background job)
	if s.aimSvc != nil {
		id, err := uuid.Parse(instanceID)
		if err == nil {
			trigger := s.aimSvc.EvaluateTriggers(ctx, id)
			data.TriggerFired = trigger.Fired
			data.TriggerReason = trigger.Reason
			data.TriggerReasonMessage = trigger.ReasonMessage
		}
	}

	// Active orchestrated run (if any)
	if s.orchestrationEngine != nil {
		activeRun, err := s.orchestrationEngine.ActiveRun(ctx, "aim_cycle", instanceID)
		if err == nil && activeRun != nil {
			data.ActiveRunID = activeRun.ID.String()
			data.ActiveRunStatus = string(activeRun.Status)
			data.ActiveRunStep = activeRun.CurrentStep
		}
	}

	return data
}

// --- helper queries ---

// loadArtifactSummary checks if an artifact type exists and extracts fields from its payload.
func (s *Server) loadArtifactSummary(ctx context.Context, instanceID, artifactType, field1, field2 string) (bool, string, string) {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return false, "", ""
	}

	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return true, "", ""
	}

	v1 := extractNestedField(m, field1)
	v2 := extractNestedField(m, field2)
	return true, v1, v2
}

// extractPayloadField extracts a single nested field from an artifact payload.
func (s *Server) extractPayloadField(ctx context.Context, instanceID, artifactType, field string) string {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return ""
	}

	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return ""
	}
	return extractNestedField(m, field)
}

// extractNestedField traverses a dot-separated path in a map.
func extractNestedField(m map[string]any, path string) string {
	if path == "" {
		return ""
	}
	parts := splitDot(path)
	var current any = m
	for _, p := range parts {
		cm, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current, ok = cm[p]
		if !ok {
			return ""
		}
	}
	if s, ok := current.(string); ok {
		return s
	}
	return ""
}

// toTitleCase converts an ALL-CAPS string like "BRAND & POSITIONING" to "Brand & Positioning".
// It also handles slash-separated tokens ("STAFFING/TALENT" → "Staffing/Talent") and
// preserves known acronyms ("IT" → "IT", "AI" → "AI", "MCP" → "MCP", "EPF" → "EPF").
func toTitleCase(s string) string {
	// Acronyms that should stay fully uppercase
	acronyms := map[string]bool{
		"it": true, "ai": true, "mcp": true, "epf": true,
		"api": true, "ui": true, "ux": true, "ceo": true,
		"cto": true, "cfo": true, "hr": true, "ip": true,
	}
	titleWord := func(w string) string {
		lower := strings.ToLower(w)
		if acronyms[lower] {
			return strings.ToUpper(w)
		}
		if len(w) == 0 {
			return w
		}
		return strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
	}

	words := strings.Fields(s)
	for i, word := range words {
		// Handle slash-separated tokens like "STAFFING/TALENT"
		if strings.Contains(word, "/") {
			parts := strings.Split(word, "/")
			for j, p := range parts {
				parts[j] = titleWord(p)
			}
			words[i] = strings.Join(parts, "/")
		} else {
			words[i] = titleWord(word)
		}
	}
	return strings.Join(words, " ")
}

// firstSentence returns the first sentence (up to the first period or newline) from s,
// trimmed of whitespace. Returns the whole string (trimmed) if no sentence boundary found.
func firstSentence(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	for i, ch := range s {
		if ch == '.' || ch == '\n' {
			return strings.TrimSpace(s[:i+1])
		}
	}
	return s
}

// --- section completeness gap checkers ---

// gap returns a ReadyGap. present=true → section is filled, false → it is missing.
func gap(label string, present bool, hint string) ui.ReadyGap {
	return ui.ReadyGap{Label: label, Present: present, Hint: hint}
}

// anyNonEmpty returns true if any candidate path in m resolves to a non-empty string or non-empty array.
func anyNonEmpty(m map[string]any, paths ...string) bool {
	for _, path := range paths {
		parts := splitDot(path)
		var cur any = m
		ok := true
		for _, p := range parts {
			cm, isMap := cur.(map[string]any)
			if !isMap {
				ok = false
				break
			}
			cur, ok = cm[p]
			if !ok {
				break
			}
		}
		if !ok {
			continue
		}
		switch v := cur.(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return true
			}
		case []any:
			if len(v) > 0 {
				return true
			}
		case map[string]any:
			if len(v) > 0 {
				return true
			}
		}
	}
	return false
}

// checkInsightGaps evaluates section completeness for an insight_analyses payload.
func checkInsightGaps(m map[string]any) []ui.ReadyGap {
	// Trends: any sub-array under "trends" or "trend_analysis"
	hasTrends := false
	for _, trendsKey := range []string{"trends", "trend_analysis"} {
		if t, ok := m[trendsKey].(map[string]any); ok {
			for _, v := range t {
				if arr, ok := v.([]any); ok && len(arr) > 0 {
					hasTrends = true
					break
				}
			}
		}
		if hasTrends {
			break
		}
	}

	// Market sizing: any of the common market definition fields
	hasMarket := anyNonEmpty(m,
		"market_definition.tam", "market_definition.market_stage",
		"market_landscape.market_size", "market_landscape.tam",
		"market_structure.segments",
	)

	// Competitive landscape: object with at least one non-empty sub-array
	hasCompetitors := false
	for _, clKey := range []string{"competitive_landscape", "competitors"} {
		switch v := m[clKey].(type) {
		case map[string]any:
			for _, sv := range v {
				if arr, ok := sv.([]any); ok && len(arr) > 0 {
					hasCompetitors = true
				}
			}
		case []any:
			hasCompetitors = len(v) > 0
		}
		if hasCompetitors {
			break
		}
	}

	// User / persona research
	hasPersonas := anyNonEmpty(m,
		"target_users", "primary_users", "personas", "customer_insights",
	)

	// Key insights synthesis
	hasInsights := anyNonEmpty(m,
		"key_insights", "key_insights_summary", "key_strategic_implications",
		"strategic_implications", "opportunity_convergence",
	)

	// SWOT or equivalent internal analysis
	hasSWOT := anyNonEmpty(m,
		"strengths", "weaknesses", "swot_analysis",
		"swot_analysis.strengths", "customer_insights.key_pain_points",
	)

	// White spaces / gaps / opportunities
	hasGaps := anyNonEmpty(m,
		"white_spaces", "opportunities", "confidence_gaps",
	)

	return []ui.ReadyGap{
		gap("Trends", hasTrends, "Add market, technology & regulatory trends"),
		gap("Market sizing", hasMarket, "Define TAM/SAM and market stage"),
		gap("Competitors", hasCompetitors, "List direct and indirect competitors"),
		gap("User research", hasPersonas, "Document target personas and pain points"),
		gap("Key insights", hasInsights, "Synthesise 3–5 key strategic insights"),
		gap("SWOT", hasSWOT, "Complete strengths, weaknesses, and threats"),
		gap("White spaces", hasGaps, "Identify underserved segments and gaps"),
	}
}

// checkNorthStarGaps evaluates section completeness for a north_star payload.
func checkNorthStarGaps(m map[string]any) []ui.ReadyGap {
	ns := m
	if inner, ok := m["north_star"].(map[string]any); ok {
		ns = inner
	}
	hasPurpose := anyNonEmpty(ns, "purpose.statement", "purpose", "mission.statement", "mission")
	hasVision := anyNonEmpty(ns, "vision.vision_statement", "vision.statement", "vision")
	hasValues := anyNonEmpty(ns, "values", "core_beliefs", "core_values")
	return []ui.ReadyGap{
		gap("Purpose", hasPurpose, "Write a purpose / mission statement"),
		gap("Vision", hasVision, "Write the long-term vision statement"),
		gap("Values", hasValues, "List core values or beliefs"),
	}
}

// checkOpportunityGaps evaluates section completeness for an insight_opportunity payload.
func checkOpportunityGaps(m map[string]any) []ui.ReadyGap {
	opp := m
	if inner, ok := m["opportunity"].(map[string]any); ok {
		opp = inner
	}
	hasTitle := anyNonEmpty(opp, "title", "opportunity.title")
	hasWhyNow := anyNonEmpty(opp, "context.urgency", "why_now", "context.why_now", "timing")
	hasEvidence := anyNonEmpty(opp, "evidence", "value_hypothesis", "evidence_base", "context.evidence")
	hasFit := anyNonEmpty(opp, "strategic_fit", "opportunity_type", "value_hypothesis")
	return []ui.ReadyGap{
		gap("Title", hasTitle, "Name the core opportunity"),
		gap("Why now", hasWhyNow, "Explain the timing and urgency"),
		gap("Evidence", hasEvidence, "Ground the opportunity in evidence"),
		gap("Strategic fit", hasFit, "Link to North Star and strategic bets"),
	}
}

// checkFormulaGaps evaluates section completeness for a strategy_formula payload.
func checkFormulaGaps(m map[string]any) []ui.ReadyGap {
	s := m
	if inner, ok := m["strategy"].(map[string]any); ok {
		s = inner
	}
	hasPositioning := anyNonEmpty(s,
		"positioning.unique_value_proposition", "positioning.category_position",
		"positioning.target_customer", "positioning",
	)
	hasMoat := anyNonEmpty(s, "competitive_moat", "moat", "differentiation")
	hasBizModel := anyNonEmpty(s, "business_model", "business_model.revenue_streams", "revenue_model")
	hasValue := anyNonEmpty(s, "value_creation", "value_creation.primary_value_drivers")
	return []ui.ReadyGap{
		gap("Positioning", hasPositioning, "Define UVP and category position"),
		gap("Moat", hasMoat, "Articulate the competitive moat"),
		gap("Business model", hasBizModel, "Describe how value is monetised"),
		gap("Value creation", hasValue, "Explain the primary value drivers"),
	}
}

// checkFoundationGaps evaluates section completeness for a strategy_foundations payload.
func checkFoundationGaps(m map[string]any) []ui.ReadyGap {
	sf := m
	if inner, ok := m["strategy_foundations"].(map[string]any); ok {
		sf = inner
	}
	hasVP := anyNonEmpty(sf,
		"value_proposition.headline", "value_proposition.primary_benefit", "value_proposition",
	)
	hasVision := anyNonEmpty(sf,
		"product_vision.vision_statement", "product_vision.statement", "product_vision",
	)
	hasPersona := anyNonEmpty(sf,
		"primary_persona", "personas", "target_persona", "icp",
		"information_architecture",
	)
	hasSequencing := anyNonEmpty(sf,
		"strategic_sequencing", "sequencing", "sequencing_logic",
	)
	return []ui.ReadyGap{
		gap("Value proposition", hasVP, "Write the value proposition headline"),
		gap("Product vision", hasVision, "Write the product vision statement"),
		gap("Target persona", hasPersona, "Define the primary target persona"),
		gap("Sequencing", hasSequencing, "Describe the strategic sequencing logic"),
	}
}

// checkRoadmapGaps evaluates section completeness for a roadmap_recipe payload.
func checkRoadmapGaps(m map[string]any) []ui.ReadyGap {
	roadmap := m
	if inner, ok := m["roadmap"].(map[string]any); ok {
		roadmap = inner
	}
	tracks, _ := roadmap["tracks"].(map[string]any)
	trackHasOKRs := func(key string) bool {
		if t, ok := tracks[key].(map[string]any); ok {
			if okrs, ok := t["okrs"].([]any); ok && len(okrs) > 0 {
				return true
			}
		}
		return false
	}
	hasStrategy := trackHasOKRs("strategy")
	hasOrgOps := trackHasOKRs("org_ops")
	hasProduct := trackHasOKRs("product")
	hasCommercial := trackHasOKRs("commercial")
	return []ui.ReadyGap{
		gap("Strategy OKRs", hasStrategy, "Add objectives for the Strategy track"),
		gap("Org & Ops OKRs", hasOrgOps, "Add objectives for the Org & Ops track"),
		gap("Product OKRs", hasProduct, "Add objectives for the Product track"),
		gap("Commercial OKRs", hasCommercial, "Add objectives for the Commercial track"),
	}
}

// loadInsightGaps loads and checks section completeness for insight_analyses.
func (s *Server) loadInsightGaps(ctx context.Context, instanceID string) []ui.ReadyGap {
	var payloadStr string
	if err := s.db.NewSelect().TableExpr("strategy_artifacts").Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeInsightAnalyses).
		Limit(1).Scan(ctx, &payloadStr); err != nil || payloadStr == "" {
		return nil
	}
	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return nil
	}
	return checkInsightGaps(m)
}

// loadArtifactGaps loads an artifact payload and runs the provided checker.
func (s *Server) loadArtifactGaps(ctx context.Context, instanceID, artifactType string, checker func(map[string]any) []ui.ReadyGap) []ui.ReadyGap {
	var payloadStr string
	if err := s.db.NewSelect().TableExpr("strategy_artifacts").Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Limit(1).Scan(ctx, &payloadStr); err != nil || payloadStr == "" {
		return nil
	}
	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return nil
	}
	return checker(m)
}

// extractInsightCounts reads the insight_analyses payload once and returns:
//   - firstTrend: title of the first trend found across all trend categories
//   - trendCount: total trends summed across all sub-arrays under "trends"
//   - personaCount: personas from target_users, primary_users, or personas arrays
//   - competitorCount: competitors summed from competitive_landscape.direct_competitors
//   - indirect_competitors, or from a top-level competitors array
//   - keyInsightCount: items in key_insights or key_insights_summary arrays
//   - whiteSpaceCount: items in white_spaces or opportunities arrays
//
// The insight_analyses payload is freeform across instances — this function
// tries multiple field names to handle the variation.
func (s *Server) extractInsightCounts(ctx context.Context, instanceID string) (
	firstTrend string, trendCount, personaCount, competitorCount, keyInsightCount, whiteSpaceCount int,
) {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeInsightAnalyses).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return
	}
	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return
	}

	// Trends — "trends" is always an object; sum all sub-arrays.
	// Common keys: technology, market, regulatory, competitive, user_behavior.
	if trends, ok := m["trends"].(map[string]any); ok {
		// Preferred order for grabbing the first trend title.
		preferredOrder := []string{"technology", "market", "regulatory", "competitive", "user_behavior"}
		seen := make(map[string]bool)
		// First pass: preferred order for firstTrend + count
		for _, key := range preferredOrder {
			seen[key] = true
			if arr, ok := trends[key].([]any); ok {
				trendCount += len(arr)
				if firstTrend == "" && len(arr) > 0 {
					if first, ok := arr[0].(map[string]any); ok {
						if t, ok := first["trend"].(string); ok && t != "" {
							firstTrend = firstSentence(t)
						}
					}
				}
			}
		}
		// Second pass: any remaining keys not in preferred list
		for key, val := range trends {
			if !seen[key] {
				if arr, ok := val.([]any); ok {
					trendCount += len(arr)
				}
			}
		}
	}

	// Personas — try: target_users, primary_users, personas, customer_insights
	for _, key := range []string{"target_users", "primary_users", "personas", "customer_insights"} {
		if arr, ok := m[key].([]any); ok && len(arr) > 0 {
			personaCount = len(arr)
			break
		}
	}

	// Competitors — try: competitive_landscape (object with sub-arrays), then top-level competitors array
	if cl, ok := m["competitive_landscape"].(map[string]any); ok {
		for _, key := range []string{"direct_competitors", "indirect_competitors", "substitutes"} {
			if arr, ok := cl[key].([]any); ok {
				competitorCount += len(arr)
			}
		}
	} else if arr, ok := m["competitors"].([]any); ok {
		competitorCount = len(arr)
	}

	// Key insights — try: key_insights, key_insights_summary, key_strategic_implications
	for _, key := range []string{"key_insights", "key_insights_summary", "key_strategic_implications"} {
		if arr, ok := m[key].([]any); ok && len(arr) > 0 {
			keyInsightCount = len(arr)
			break
		}
	}

	// White spaces / gaps — try: white_spaces, opportunities
	for _, key := range []string{"white_spaces", "opportunities"} {
		if arr, ok := m[key].([]any); ok && len(arr) > 0 {
			whiteSpaceCount = len(arr)
			break
		}
	}

	return
}

// splitDot splits a string by dots.
func splitDot(s string) []string {
	var parts []string
	start := 0
	for i := range s {
		if s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

// countArtifactsByStatus counts artifacts of a type with a specific status.
func (s *Server) countArtifactsByStatus(ctx context.Context, instanceID, artifactType, status string) int {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Where("status = ?", status).
		Count(ctx)
	return int(count)
}

// countByType counts all artifacts of a given type.
func (s *Server) countByType(ctx context.Context, instanceID, artifactType string) int {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Count(ctx)
	return int(count)
}

// loadValueModels loads value model summaries.
func (s *Server) loadValueModels(ctx context.Context, instanceID string) []ui.ValueModelSummary {
	var rows []struct {
		Name   string `bun:"name"`
		Status string `bun:"status"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("name, status").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		OrderExpr("name ASC").
		Scan(ctx, &rows)

	vms := make([]ui.ValueModelSummary, len(rows))
	for i, r := range rows {
		icon := "lucide--layers"
		vms[i] = ui.ValueModelSummary{
			Track:  r.Name,
			Status: r.Status,
			Icon:   icon,
		}
	}
	return vms
}

// loadFeatures loads feature summaries ordered by status then name.
func (s *Server) loadFeatures(ctx context.Context, instanceID string) []ui.FeatureSummary {
	var rows []struct {
		Key    string `bun:"artifact_key"`
		Name   string `bun:"name"`
		Status string `bun:"status"`
		Track  string `bun:"track"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, status, track").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeFeature).
		OrderExpr("CASE status WHEN 'in-progress' THEN 0 WHEN 'draft' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END, name ASC").
		Scan(ctx, &rows)

	features := make([]ui.FeatureSummary, len(rows))
	for i, r := range rows {
		features[i] = ui.FeatureSummary{
			Key:    r.Key,
			Name:   r.Name,
			Status: r.Status,
			Track:  r.Track,
		}
	}
	return features
}

// loadRoadmapOKRs extracts OKR counts from the roadmap recipe payload.
func (s *Server) loadRoadmapOKRs(ctx context.Context, instanceID string) []ui.TrackOKRSummary {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return nil
	}

	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return nil
	}

	// Payload is nested under "roadmap" key: {"roadmap": {"tracks": {...}}}
	roadmap, ok := m["roadmap"].(map[string]any)
	if !ok {
		return nil
	}
	tracks, ok := roadmap["tracks"].(map[string]any)
	if !ok {
		return nil
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

	var summaries []ui.TrackOKRSummary
	for _, tm := range trackMeta {
		t, ok := tracks[tm.key].(map[string]any)
		if !ok {
			continue
		}
		okrs, ok := t["okrs"].([]any)
		if !ok {
			continue
		}
		objectives := len(okrs)
		keyResults := 0
		for _, okr := range okrs {
			if okrMap, ok := okr.(map[string]any); ok {
				if krs, ok := okrMap["key_results"].([]any); ok {
					keyResults += len(krs)
				}
			}
		}
		summaries = append(summaries, ui.TrackOKRSummary{
			Track:      tm.name,
			Icon:       tm.icon,
			Objectives: objectives,
			KeyResults: keyResults,
		})
	}
	return summaries
}
