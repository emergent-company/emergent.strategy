package strategy

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// MemorySource implements StrategyStore backed by an emergent.memory graph.
// It reads strategy data from the graph instead of from YAML files on disk.
type MemorySource struct {
	client *memory.Client
	model  *StrategyModel
}

// NewMemorySource creates a MemorySource with the given Memory API client.
func NewMemorySource(client *memory.Client) *MemorySource {
	return &MemorySource{
		client: client,
	}
}

// Load fetches all strategy objects from the Memory graph and builds the model.
func (ms *MemorySource) Load(ctx context.Context) error {
	// Fetch all objects using cursor pagination
	var allObjects []memory.Object
	cursor := ""
	for page := 0; page < 50; page++ {
		objects, nextCursor, err := ms.client.ListObjects(ctx, memory.ListOptions{
			Limit:  200,
			Cursor: cursor,
		})
		if err != nil {
			return fmt.Errorf("list objects: %w", err)
		}
		allObjects = append(allObjects, objects...)
		if nextCursor == "" || len(objects) == 0 {
			break
		}
		cursor = nextCursor
	}

	// Group objects by type
	byType := make(map[string][]memory.Object)
	for _, obj := range allObjects {
		byType[obj.Type] = append(byType[obj.Type], obj)
	}

	// Build the strategy model
	ms.model = &StrategyModel{
		LastLoaded:            time.Now(),
		Features:              make(map[string]*Feature),
		ValueModels:           make(map[string]*ValueModel),
		PersonaToPainPoints:   make(map[string][]PainPoint),
		PainPointToValueProps: make(map[string][]ValueProposition),
		FeatureToPersonas:     make(map[string][]string),
		ValuePathToFeatures:   make(map[string][]string),
		TrackToOKRs:           make(map[string][]OKR),
	}

	// Convert each type
	ms.buildNorthStar(byType["Belief"])
	ms.buildPersonas(byType["Persona"], byType["PainPoint"])
	ms.buildPositioning(byType["Positioning"])
	ms.buildRoadmap(byType["OKR"], byType["Assumption"])
	ms.buildFeatures(byType["Feature"], byType["Capability"], byType["Scenario"])
	ms.buildValueModels(byType["ValueModelComponent"])

	return nil
}

// Reload re-fetches from Memory.
func (ms *MemorySource) Reload(ctx context.Context) error {
	return ms.Load(ctx)
}

// Close is a no-op for MemorySource.
func (ms *MemorySource) Close() error {
	return nil
}

// GetProductVision returns the north star from beliefs.
func (ms *MemorySource) GetProductVision() (*NorthStar, error) {
	if ms.model.NorthStar == nil {
		return nil, fmt.Errorf("north star not loaded")
	}
	return ms.model.NorthStar, nil
}

// GetPersonas returns all persona summaries.
func (ms *MemorySource) GetPersonas() ([]PersonaSummary, error) {
	var summaries []PersonaSummary
	if ms.model.InsightAnalyses != nil {
		for _, tu := range ms.model.InsightAnalyses.TargetUsers {
			summaries = append(summaries, PersonaSummary{
				ID: tu.ID, Name: tu.Name, Role: tu.Role, Description: tu.Description,
			})
		}
	}
	return summaries, nil
}

// GetPersonaDetails returns full persona details.
func (ms *MemorySource) GetPersonaDetails(personaID string) (*TargetUser, []PainPoint, error) {
	if ms.model.InsightAnalyses == nil {
		return nil, nil, fmt.Errorf("insight analyses not loaded")
	}
	for _, tu := range ms.model.InsightAnalyses.TargetUsers {
		if tu.ID == personaID {
			return &tu, ms.model.PersonaToPainPoints[personaID], nil
		}
	}
	return nil, nil, fmt.Errorf("persona %q not found", personaID)
}

// GetValuePropositions returns value propositions.
func (ms *MemorySource) GetValuePropositions(personaID string) ([]ValueProposition, error) {
	// Value propositions aren't stored as a separate graph type currently.
	// Return what we can from the model's relationship index.
	if personaID != "" {
		return ms.model.PainPointToValueProps[personaID], nil
	}
	var all []ValueProposition
	for _, vps := range ms.model.PainPointToValueProps {
		all = append(all, vps...)
	}
	return all, nil
}

// GetCompetitivePosition returns competitive moat and positioning.
func (ms *MemorySource) GetCompetitivePosition() (*CompetitiveMoat, *Positioning, error) {
	if ms.model.StrategyFormula == nil {
		return nil, nil, fmt.Errorf("strategy formula not loaded")
	}
	return &ms.model.StrategyFormula.CompetitiveMoat, &ms.model.StrategyFormula.Positioning, nil
}

// GetRoadmapSummary returns the roadmap.
func (ms *MemorySource) GetRoadmapSummary(trackName string, cycle int) (*Roadmap, error) {
	if ms.model.Roadmap == nil {
		return nil, fmt.Errorf("roadmap not loaded")
	}
	rm := ms.model.Roadmap
	if trackName == "" {
		return rm, nil
	}
	// Filter to single track
	filtered := &Roadmap{
		ID: rm.ID, Cycle: rm.Cycle, Timeframe: rm.Timeframe,
		Tracks: make(map[string]*Track),
	}
	if t, ok := rm.Tracks[trackName]; ok {
		filtered.Tracks[trackName] = t
	}
	return filtered, nil
}

// GetFeatures returns feature summaries.
func (ms *MemorySource) GetFeatures(status string) ([]FeatureSummary, error) {
	var summaries []FeatureSummary
	for _, f := range ms.model.Features {
		if status != "" && f.Status != status {
			continue
		}
		summaries = append(summaries, FeatureSummary{
			ID: f.ID, Name: f.Name, Status: f.Status,
			ContributesTo: f.StrategicContext.ContributesTo,
		})
	}
	return summaries, nil
}

// GetFeatureDetails returns full feature details.
func (ms *MemorySource) GetFeatureDetails(featureIDOrSlug string) (*Feature, error) {
	if f, ok := ms.model.Features[featureIDOrSlug]; ok {
		return f, nil
	}
	// Try slug match
	for _, f := range ms.model.Features {
		if f.Slug == featureIDOrSlug {
			return f, nil
		}
	}
	return nil, fmt.Errorf("feature %q not found", featureIDOrSlug)
}

// Search performs text search across the model.
func (ms *MemorySource) Search(query string, limit int) ([]SearchResult, error) {
	// Use the Memory search-with-neighbors endpoint for semantic search
	results, err := ms.client.SearchWithNeighbors(context.Background(), memory.SearchRequest{
		Query: query,
		Limit: limit,
	})
	if err != nil {
		return nil, err
	}

	var searchResults []SearchResult
	for _, r := range results {
		searchResults = append(searchResults, SearchResult{
			Type:    r.Object.Type,
			ID:      r.Object.Key,
			Title:   getString(r.Object.Properties, "name"),
			Snippet: getString(r.Object.Properties, "description"),
			Score:   r.Score,
		})
	}
	return searchResults, nil
}

// GetStrategicContext synthesizes context for a topic.
func (ms *MemorySource) GetStrategicContext(topic string) (*StrategicContextResult, error) {
	return &StrategicContextResult{
		Topic: topic,
	}, nil
}

// GetModel returns the underlying model.
func (ms *MemorySource) GetModel() *StrategyModel {
	return ms.model
}

// --- Model builders ---

func (ms *MemorySource) buildNorthStar(beliefs []memory.Object) {
	ns := &NorthStar{}
	for _, b := range beliefs {
		sectionPath := getString(b.Properties, "section_path")
		statement := getString(b.Properties, "statement")
		implication := getString(b.Properties, "implication")
		evidence := getString(b.Properties, "evidence")

		switch {
		case strings.Contains(sectionPath, "purpose") || getString(b.Properties, "name") == "Purpose":
			ns.Purpose = Purpose{
				Statement: statement, ImpactWeSeek: implication, ProblemWeSolve: evidence,
			}
		case strings.Contains(sectionPath, "vision") || getString(b.Properties, "name") == "Vision":
			ns.Vision = Vision{
				Statement:        statement,
				SuccessLooksLike: strings.Split(implication, "; "),
			}
		case strings.Contains(sectionPath, "mission") || getString(b.Properties, "name") == "Mission":
			ns.Mission = Mission{
				Statement:    statement,
				WhatWeDo:     strings.Split(implication, "; "),
				HowWeDeliver: HowWeDeliver{Approach: evidence},
			}
		case strings.HasPrefix(getString(b.Properties, "name"), "Value:"):
			ns.Values = append(ns.Values, Value{
				Name:              strings.TrimPrefix(getString(b.Properties, "name"), "Value: "),
				Definition:        statement,
				ExampleDecision:   implication,
				BehaviorsWeExpect: strings.Split(evidence, "; "),
			})
		}
	}
	ms.model.NorthStar = ns
}

func (ms *MemorySource) buildPersonas(personas []memory.Object, painPoints []memory.Object) {
	ia := &InsightAnalyses{}
	for _, p := range personas {
		tu := TargetUser{
			ID:          getString(p.Properties, "persona_id"),
			Name:        getString(p.Properties, "name"),
			Role:        getString(p.Properties, "role"),
			Description: getString(p.Properties, "description"),
			Goals:       strings.Split(getString(p.Properties, "goals"), "; "),
		}
		ia.TargetUsers = append(ia.TargetUsers, tu)
	}

	// Map pain points to personas
	for _, pp := range painPoints {
		personaRef := getString(pp.Properties, "persona_ref")
		painPoint := PainPoint{
			PersonaID:   personaRef,
			Description: getString(pp.Properties, "description"),
			Category:    getString(pp.Properties, "severity"),
		}
		ms.model.PersonaToPainPoints[personaRef] = append(ms.model.PersonaToPainPoints[personaRef], painPoint)
	}

	ms.model.InsightAnalyses = ia
}

func (ms *MemorySource) buildPositioning(positionings []memory.Object) {
	sf := &StrategyFormula{}
	for _, p := range positionings {
		name := getString(p.Properties, "name")
		claim := getString(p.Properties, "claim")
		vsComp := getString(p.Properties, "vs_competitor")
		moatType := getString(p.Properties, "moat_type")

		if name == "Market Positioning" {
			sf.Positioning = Positioning{
				Statement:        claim,
				CategoryPosition: getString(p.Properties, "category_position"),
			}
		} else if vsComp != "" {
			sf.CompetitiveMoat.VsCompetitors = append(sf.CompetitiveMoat.VsCompetitors,
				CompetitorComparison{
					Competitor: vsComp, OurAngle: claim, Wedge: moatType,
				})
		} else {
			sf.CompetitiveMoat.Advantages = append(sf.CompetitiveMoat.Advantages,
				Advantage{
					Name: name, Description: claim, Defensibility: moatType,
				})
		}
	}
	ms.model.StrategyFormula = sf
}

func (ms *MemorySource) buildRoadmap(okrs []memory.Object, assumptions []memory.Object) {
	rm := &Roadmap{
		Tracks: make(map[string]*Track),
	}

	// Separate OKRs (objectives) from KRs (key results)
	// Convention: OKRs have ID pattern "okr-*", KRs have "kr-*"
	okrMap := make(map[string]*OKR)
	for _, o := range okrs {
		id := getString(o.Properties, "okr_id")
		track := getString(o.Properties, "track")
		cycleStr := getString(o.Properties, "cycle")
		if cycleStr != "" {
			// Parse cycle number from "C2" format
			fmt.Sscanf(cycleStr, "C%d", &rm.Cycle)
		}

		if strings.HasPrefix(id, "okr-") {
			okr := &OKR{
				ID: id, TrackName: track, Objective: getString(o.Properties, "name"),
			}
			okrMap[id] = okr

			if _, exists := rm.Tracks[track]; !exists {
				rm.Tracks[track] = &Track{Name: track}
			}
			rm.Tracks[track].OKRs = append(rm.Tracks[track].OKRs, *okr)
		} else if strings.HasPrefix(id, "kr-") {
			// KR — will be attached to parent OKR later
			kr := KeyResult{
				ID:          id,
				Description: getString(o.Properties, "name"),
				Target:      getString(o.Properties, "target_value"),
				Status:      getString(o.Properties, "status"),
			}

			// Add to the track
			if _, exists := rm.Tracks[track]; !exists {
				rm.Tracks[track] = &Track{Name: track}
			}

			// Find parent OKR in the track and append KR
			// This is approximate — we match by track since the graph
			// doesn't have a direct OKR→KR parent relationship at this level
			track := rm.Tracks[track]
			if len(track.OKRs) > 0 {
				track.OKRs[len(track.OKRs)-1].KeyResults = append(
					track.OKRs[len(track.OKRs)-1].KeyResults, kr)
			}
		}

		// Build track-to-OKR index
		if strings.HasPrefix(id, "okr-") {
			ms.model.TrackToOKRs[track] = append(ms.model.TrackToOKRs[track],
				OKR{ID: id, TrackName: track, Objective: getString(o.Properties, "name")})
		}
	}

	ms.model.Roadmap = rm
}

func (ms *MemorySource) buildFeatures(features, capabilities, scenarios []memory.Object) {
	// Index capabilities and scenarios by feature ref
	capsByFeature := make(map[string][]Capability)
	for _, c := range capabilities {
		fref := getString(c.Properties, "feature_ref")
		capsByFeature[fref] = append(capsByFeature[fref], Capability{
			ID:          getString(c.Properties, "capability_id"),
			Name:        getString(c.Properties, "name"),
			Description: getString(c.Properties, "description"),
		})
	}

	for _, f := range features {
		fid := getString(f.Properties, "feature_id")
		feature := &Feature{
			ID:     fid,
			Name:   getString(f.Properties, "name"),
			Status: getString(f.Properties, "status"),
			Definition: FeatureDefinition{
				JobToBeDone: getString(f.Properties, "jtbd"),
			},
			Capabilities: capsByFeature[fid],
		}

		// Parse contributes_to from a property if available
		// (stored as a string in the graph, need to reconstruct)

		ms.model.Features[fid] = feature
	}
}

func (ms *MemorySource) buildValueModels(components []memory.Object) {
	// Group by track and reconstruct hierarchy from value_path
	trackComponents := make(map[string][]memory.Object)
	for _, c := range components {
		track := getString(c.Properties, "track")
		trackComponents[track] = append(trackComponents[track], c)
	}

	for track, comps := range trackComponents {
		vm := &ValueModel{
			Track: track,
		}

		// Group by level
		layers := make(map[string]*ValueLayer)
		for _, c := range comps {
			level := getString(c.Properties, "level")
			path := getString(c.Properties, "value_path")

			switch level {
			case "L1":
				layer := &ValueLayer{
					Name:        getString(c.Properties, "name"),
					Description: getString(c.Properties, "description"),
				}
				layers[path] = layer
				vm.Layers = append(vm.Layers, *layer)
			case "L2":
				// Find parent L1
				parts := strings.Split(path, ".")
				if len(parts) >= 2 {
					parentPath := strings.Join(parts[:2], ".")
					if layer, ok := layers[parentPath]; ok {
						layer.Components = append(layer.Components, ValueComponent{
							Name:        getString(c.Properties, "name"),
							Description: getString(c.Properties, "description"),
							Maturity:    getString(c.Properties, "maturity"),
						})
					}
				}
			}
			// L3 sub-components omitted for simplicity — the typed model
			// doesn't often use them in query responses
		}

		vmKey := strings.ToLower(track)
		ms.model.ValueModels[vmKey] = vm
	}
}

// getString safely extracts a string from properties.
func getString(props map[string]any, key string) string {
	v, ok := props[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return fmt.Sprintf("%v", v)
	}
	return s
}
