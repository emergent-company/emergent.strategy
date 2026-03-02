package strategy

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/source"
)

// SourceBackedStore implements StrategyStore using any source.Source.
//
// Unlike FileSystemSource (which creates its own source.FileSystemSource
// internally and supports filesystem watching), SourceBackedStore accepts
// an externally-configured Source. This is the integration point for
// GitHub-backed, cached, or any other non-filesystem source.
//
// Cache invalidation is the caller's responsibility (e.g., via
// source.CachedSource TTL or explicit Reload calls).
type SourceBackedStore struct {
	src source.Source

	mu     sync.RWMutex
	model  *StrategyModel
	loaded bool
}

// NewSourceBackedStore creates a strategy store backed by the given source.
//
// The source must be fully configured (e.g., with authentication and caching)
// before being passed here. Call Load() before querying.
func NewSourceBackedStore(src source.Source) *SourceBackedStore {
	return &SourceBackedStore{
		src: src,
	}
}

// Load initializes the store by parsing all strategy data from the source.
func (s *SourceBackedStore) Load(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	parser := NewParser(s.src)
	model, err := parser.ParseAll()
	if err != nil {
		return fmt.Errorf("parsing EPF instance from %s: %w", s.src.Root(), err)
	}

	model.LastLoaded = time.Now()
	s.model = model
	s.loaded = true
	return nil
}

// Reload refreshes the strategy data from the source.
func (s *SourceBackedStore) Reload(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	parser := NewParser(s.src)
	model, err := parser.ParseAll()
	if err != nil {
		return fmt.Errorf("parsing EPF instance from %s: %w", s.src.Root(), err)
	}

	model.LastLoaded = time.Now()
	s.model = model
	return nil
}

// Close releases any resources. For SourceBackedStore this is a no-op
// since the source lifecycle is managed externally.
func (s *SourceBackedStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.model = nil
	s.loaded = false
	return nil
}

// ensureLoaded returns an error if the store hasn't been loaded.
func (s *SourceBackedStore) ensureLoaded() error {
	if !s.loaded || s.model == nil {
		return fmt.Errorf("store not loaded: call Load() first")
	}
	return nil
}

// GetProductVision returns the product's vision, mission, and purpose.
func (s *SourceBackedStore) GetProductVision() (*NorthStar, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}
	if s.model.NorthStar == nil {
		return nil, fmt.Errorf("north star not found in instance")
	}
	return s.model.NorthStar, nil
}

// GetPersonas returns all personas from insight analyses and feature definitions.
func (s *SourceBackedStore) GetPersonas() ([]PersonaSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}

	var personas []PersonaSummary
	seen := make(map[string]bool)

	if s.model.InsightAnalyses != nil {
		for _, tu := range s.model.InsightAnalyses.TargetUsers {
			if !seen[tu.Name] {
				personas = append(personas, PersonaSummary{
					ID:          tu.ID,
					Name:        tu.Name,
					Role:        tu.Role,
					Description: tu.Description,
				})
				seen[tu.Name] = true
			}
		}
	}

	for _, feature := range s.model.Features {
		for _, p := range feature.Definition.Personas {
			if !seen[p.Name] {
				personas = append(personas, PersonaSummary{
					ID:          p.ID,
					Name:        p.Name,
					Role:        p.Role,
					Description: p.Description,
				})
				seen[p.Name] = true
			}
		}
	}

	return personas, nil
}

// GetPersonaDetails returns full details for a specific persona by ID or name.
func (s *SourceBackedStore) GetPersonaDetails(personaID string) (*TargetUser, []PainPoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, nil, err
	}

	if s.model.InsightAnalyses != nil {
		for _, tu := range s.model.InsightAnalyses.TargetUsers {
			if matchesPersona(tu, personaID) {
				painPoints := s.model.PersonaToPainPoints[tu.ID]
				if painPoints == nil {
					painPoints = s.model.PersonaToPainPoints[tu.Name]
				}
				return &tu, painPoints, nil
			}
		}
	}

	for _, feature := range s.model.Features {
		for _, p := range feature.Definition.Personas {
			if matchesFeaturePersona(p, personaID) {
				tu := &TargetUser{
					ID:                   p.ID,
					Name:                 p.Name,
					Role:                 p.Role,
					Description:          p.Description,
					Goals:                p.Goals,
					PainPoints:           p.PainPoints,
					UsageContext:         p.UsageContext,
					TechnicalProficiency: p.TechnicalProficiency,
				}
				var painPoints []PainPoint
				for _, pp := range p.PainPoints {
					painPoints = append(painPoints, PainPoint{
						PersonaID:   p.ID,
						PersonaName: p.Name,
						Description: pp,
					})
				}
				return tu, painPoints, nil
			}
		}
	}

	return nil, nil, fmt.Errorf("persona not found: %s", personaID)
}

// GetValuePropositions returns all value propositions.
func (s *SourceBackedStore) GetValuePropositions(personaID string) ([]ValueProposition, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}

	var props []ValueProposition
	if s.model.StrategyFormula != nil {
		pos := s.model.StrategyFormula.Positioning
		if pos.UniqueValueProp != "" {
			props = append(props, ValueProposition{
				ID:        "main-uvp",
				Statement: pos.UniqueValueProp,
			})
		}
		if pos.Statement != "" {
			props = append(props, ValueProposition{
				ID:        "positioning",
				Statement: pos.Statement,
			})
		}
	}
	return props, nil
}

// GetCompetitivePosition returns competitive analysis and positioning.
func (s *SourceBackedStore) GetCompetitivePosition() (*CompetitiveMoat, *Positioning, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, nil, err
	}
	if s.model.StrategyFormula == nil {
		return nil, nil, fmt.Errorf("strategy formula not found in instance")
	}
	return &s.model.StrategyFormula.CompetitiveMoat, &s.model.StrategyFormula.Positioning, nil
}

// GetRoadmapSummary returns a summary of the roadmap.
func (s *SourceBackedStore) GetRoadmapSummary(trackName string, cycle int) (*Roadmap, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}
	if s.model.Roadmap == nil {
		return nil, fmt.Errorf("roadmap not found in instance")
	}

	if trackName == "" && cycle == 0 {
		return s.model.Roadmap, nil
	}

	if cycle > 0 && s.model.Roadmap.Cycle != cycle {
		return nil, fmt.Errorf("roadmap cycle %d not found (current cycle: %d)", cycle, s.model.Roadmap.Cycle)
	}

	if trackName != "" {
		trackNameLower := strings.ToLower(trackName)
		filteredRoadmap := &Roadmap{
			ID:         s.model.Roadmap.ID,
			StrategyID: s.model.Roadmap.StrategyID,
			Cycle:      s.model.Roadmap.Cycle,
			Timeframe:  s.model.Roadmap.Timeframe,
			Tracks:     make(map[string]*Track),
		}
		for name, track := range s.model.Roadmap.Tracks {
			if strings.ToLower(name) == trackNameLower {
				filteredRoadmap.Tracks[name] = track
				break
			}
		}
		if len(filteredRoadmap.Tracks) == 0 {
			return nil, fmt.Errorf("track %q not found in roadmap", trackName)
		}
		return filteredRoadmap, nil
	}

	return s.model.Roadmap, nil
}

// GetFeatures returns all features, optionally filtered by status.
func (s *SourceBackedStore) GetFeatures(status string) ([]FeatureSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}

	var features []FeatureSummary
	statusLower := strings.ToLower(status)

	for _, f := range s.model.Features {
		if status != "" && strings.ToLower(f.Status) != statusLower {
			continue
		}
		features = append(features, FeatureSummary{
			ID:            f.ID,
			Name:          f.Name,
			Status:        f.Status,
			ContributesTo: f.StrategicContext.ContributesTo,
		})
	}

	return features, nil
}

// GetFeatureDetails returns full details for a feature by ID or slug.
func (s *SourceBackedStore) GetFeatureDetails(featureIDOrSlug string) (*Feature, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}

	idOrSlugLower := strings.ToLower(featureIDOrSlug)

	if f, ok := s.model.Features[featureIDOrSlug]; ok {
		return f, nil
	}

	for _, f := range s.model.Features {
		if strings.ToLower(f.ID) == idOrSlugLower ||
			strings.ToLower(f.Slug) == idOrSlugLower {
			return f, nil
		}
	}

	return nil, fmt.Errorf("feature not found: %s", featureIDOrSlug)
}

// Search performs full-text search across all strategy content.
func (s *SourceBackedStore) Search(query string, limit int) ([]SearchResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 20
	}

	queryLower := strings.ToLower(query)
	var results []SearchResult

	// Search in north star
	if s.model.NorthStar != nil {
		ns := s.model.NorthStar
		if containsQuery(ns.Purpose.Statement, queryLower) {
			results = append(results, SearchResult{
				Type: "purpose", ID: "north-star-purpose", Title: "Purpose Statement",
				Content: ns.Purpose.Statement, Snippet: extractSnippet(ns.Purpose.Statement, queryLower),
				Score: 1.0, Source: "READY/00_north_star.yaml",
			})
		}
		if containsQuery(ns.Vision.Statement, queryLower) {
			results = append(results, SearchResult{
				Type: "vision", ID: "north-star-vision", Title: "Vision Statement",
				Content: ns.Vision.Statement, Snippet: extractSnippet(ns.Vision.Statement, queryLower),
				Score: 1.0, Source: "READY/00_north_star.yaml",
			})
		}
		if containsQuery(ns.Mission.Statement, queryLower) {
			results = append(results, SearchResult{
				Type: "mission", ID: "north-star-mission", Title: "Mission Statement",
				Content: ns.Mission.Statement, Snippet: extractSnippet(ns.Mission.Statement, queryLower),
				Score: 1.0, Source: "READY/00_north_star.yaml",
			})
		}
	}

	// Search in insight analyses
	if s.model.InsightAnalyses != nil {
		for _, insight := range s.model.InsightAnalyses.KeyInsights {
			if containsQuery(insight.Insight, queryLower) {
				results = append(results, SearchResult{
					Type: "insight", ID: "insight-" + sanitizeID(insight.Insight[:min(20, len(insight.Insight))]),
					Title: "Key Insight", Content: insight.Insight,
					Snippet: extractSnippet(insight.Insight, queryLower),
					Score:   0.9, Source: "READY/01_insight_analyses.yaml",
				})
			}
		}
		for _, tu := range s.model.InsightAnalyses.TargetUsers {
			if containsQuery(tu.Name, queryLower) || containsQuery(tu.Description, queryLower) {
				results = append(results, SearchResult{
					Type: "persona", ID: tu.ID, Title: tu.Name, Content: tu.Description,
					Snippet: extractSnippet(tu.Description, queryLower),
					Score:   0.85, Source: "READY/01_insight_analyses.yaml",
				})
			}
		}
	}

	// Search in features
	for _, f := range s.model.Features {
		matchScore := 0.0
		matchContent := ""
		if containsQuery(f.Name, queryLower) {
			matchScore = 0.95
			matchContent = f.Name
		} else if containsQuery(f.Definition.JobToBeDone, queryLower) {
			matchScore = 0.9
			matchContent = f.Definition.JobToBeDone
		} else if containsQuery(f.Definition.SolutionApproach, queryLower) {
			matchScore = 0.85
			matchContent = f.Definition.SolutionApproach
		}
		if matchScore > 0 {
			results = append(results, SearchResult{
				Type: "feature", ID: f.ID, Title: f.Name, Content: matchContent,
				Snippet: extractSnippet(matchContent, queryLower),
				Score:   matchScore, Source: fmt.Sprintf("FIRE/definitions/product/%s.yaml", f.Slug),
				Context: map[string]string{"status": f.Status},
			})
		}
	}

	// Search in roadmap OKRs
	if s.model.Roadmap != nil {
		for trackName, track := range s.model.Roadmap.Tracks {
			for _, okr := range track.OKRs {
				if containsQuery(okr.Objective, queryLower) {
					results = append(results, SearchResult{
						Type: "okr", ID: okr.ID, Title: okr.Objective, Content: okr.Objective,
						Snippet: extractSnippet(okr.Objective, queryLower),
						Score:   0.8, Source: "READY/05_roadmap_recipe.yaml",
						Context: map[string]string{"track": trackName},
					})
				}
				for _, kr := range okr.KeyResults {
					if containsQuery(kr.Description, queryLower) {
						results = append(results, SearchResult{
							Type: "key_result", ID: kr.ID, Title: kr.Description, Content: kr.Description,
							Snippet: extractSnippet(kr.Description, queryLower),
							Score:   0.75, Source: "READY/05_roadmap_recipe.yaml",
							Context: map[string]string{"track": trackName, "okr_id": okr.ID},
						})
					}
				}
			}
		}
	}

	sortResultsByScore(results)
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

// GetStrategicContext synthesizes relevant context for a topic.
func (s *SourceBackedStore) GetStrategicContext(topic string) (*StrategicContextResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}

	result := &StrategicContextResult{Topic: topic}
	topicLower := strings.ToLower(topic)

	if s.model.NorthStar != nil {
		result.Vision = s.model.NorthStar.Vision.Statement
	}

	if s.model.InsightAnalyses != nil {
		for _, tu := range s.model.InsightAnalyses.TargetUsers {
			if containsQuery(tu.Name, topicLower) ||
				containsQuery(tu.Description, topicLower) ||
				containsAnyQuery(tu.PainPoints, topicLower) {
				result.RelevantPersonas = append(result.RelevantPersonas, PersonaSummary{
					ID: tu.ID, Name: tu.Name, Role: tu.Role, Description: tu.Description,
				})
				for _, pp := range tu.PainPoints {
					result.RelevantPainPoints = append(result.RelevantPainPoints, PainPoint{
						PersonaID: tu.ID, PersonaName: tu.Name, Description: pp,
					})
				}
			}
		}
	}

	for _, f := range s.model.Features {
		if containsQuery(f.Name, topicLower) ||
			containsQuery(f.Definition.JobToBeDone, topicLower) ||
			containsAnyQuery(f.StrategicContext.ContributesTo, topicLower) {
			result.RelevantFeatures = append(result.RelevantFeatures, FeatureSummary{
				ID: f.ID, Name: f.Name, Status: f.Status,
				ContributesTo: f.StrategicContext.ContributesTo,
			})
		}
	}

	if s.model.Roadmap != nil {
		for trackName, track := range s.model.Roadmap.Tracks {
			for _, okr := range track.OKRs {
				if containsQuery(okr.Objective, topicLower) {
					var krDescriptions []string
					for _, kr := range okr.KeyResults {
						krDescriptions = append(krDescriptions, kr.Description)
					}
					result.RelevantOKRs = append(result.RelevantOKRs, OKRSummary{
						ID: okr.ID, Track: trackName, Objective: okr.Objective,
						KeyResults: krDescriptions,
					})
				}
			}
		}
	}

	if s.model.StrategyFormula != nil {
		result.CompetitiveContext = s.model.StrategyFormula.CompetitiveMoat.Differentiation
	}

	if s.model.InsightAnalyses != nil {
		for _, insight := range s.model.InsightAnalyses.KeyInsights {
			if containsQuery(insight.Insight, topicLower) ||
				containsQuery(insight.StrategicImplication, topicLower) {
				result.KeyInsights = append(result.KeyInsights, insight.Insight)
			}
		}
	}

	return result, nil
}

// GetModel returns the underlying strategy model for advanced queries.
func (s *SourceBackedStore) GetModel() *StrategyModel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.model
}
