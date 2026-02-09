package strategy

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// FileSystemSource implements StrategyStore using the local filesystem.
// It provides thread-safe read access to EPF strategy data.
type FileSystemSource struct {
	instancePath string
	options      storeOptions

	mu      sync.RWMutex
	model   *StrategyModel
	loaded  bool
	watcher *Watcher
}

// NewFileSystemSource creates a new filesystem-backed strategy store.
func NewFileSystemSource(instancePath string, opts ...StoreOption) *FileSystemSource {
	options := storeOptions{
		debounceMs: 200,
	}
	for _, opt := range opts {
		opt(&options)
	}

	return &FileSystemSource{
		instancePath: instancePath,
		options:      options,
	}
}

// Load initializes the store by loading all strategy data from disk.
// If file watching is enabled, it also starts the watcher.
func (fs *FileSystemSource) Load(ctx context.Context) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	parser := NewParser(fs.instancePath)
	model, err := parser.ParseAll()
	if err != nil {
		return fmt.Errorf("parsing EPF instance: %w", err)
	}

	model.LastLoaded = time.Now()
	fs.model = model
	fs.loaded = true

	// Start file watcher if enabled
	if fs.options.watchChanges && fs.watcher == nil {
		fs.watcher = NewWatcher(fs, fs.instancePath, fs.options.debounceMs, fs.options.onReload)
		// Start watching in a separate goroutine to avoid holding the lock
		go func() {
			fs.watcher.Start(context.Background())
		}()
	}

	return nil
}

// Reload refreshes the strategy data from disk.
func (fs *FileSystemSource) Reload(ctx context.Context) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	parser := NewParser(fs.instancePath)
	model, err := parser.ParseAll()
	if err != nil {
		return fmt.Errorf("parsing EPF instance: %w", err)
	}

	model.LastLoaded = time.Now()
	fs.model = model

	// Call the onReload callback if provided
	if fs.options.onReload != nil {
		fs.options.onReload()
	}

	return nil
}

// Close releases any resources held by the store.
func (fs *FileSystemSource) Close() error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	// Stop the watcher if running
	if fs.watcher != nil {
		fs.watcher.Stop()
		fs.watcher = nil
	}

	fs.model = nil
	fs.loaded = false
	return nil
}

// ensureLoaded returns an error if the store hasn't been loaded.
func (fs *FileSystemSource) ensureLoaded() error {
	if !fs.loaded || fs.model == nil {
		return fmt.Errorf("store not loaded: call Load() first")
	}
	return nil
}

// GetProductVision returns the product's vision, mission, and purpose.
func (fs *FileSystemSource) GetProductVision() (*NorthStar, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	if fs.model.NorthStar == nil {
		return nil, fmt.Errorf("north star not found in instance")
	}

	return fs.model.NorthStar, nil
}

// GetPersonas returns all personas from insight analyses and feature definitions.
func (fs *FileSystemSource) GetPersonas() ([]PersonaSummary, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	var personas []PersonaSummary
	seen := make(map[string]bool)

	// Gather from insight analyses target users
	if fs.model.InsightAnalyses != nil {
		for _, tu := range fs.model.InsightAnalyses.TargetUsers {
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

	// Gather unique personas from feature definitions
	for _, feature := range fs.model.Features {
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
func (fs *FileSystemSource) GetPersonaDetails(personaID string) (*TargetUser, []PainPoint, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, nil, err
	}

	// Search in insight analyses first
	if fs.model.InsightAnalyses != nil {
		for _, tu := range fs.model.InsightAnalyses.TargetUsers {
			if matchesPersona(tu, personaID) {
				painPoints := fs.model.PersonaToPainPoints[tu.ID]
				if painPoints == nil {
					painPoints = fs.model.PersonaToPainPoints[tu.Name]
				}
				return &tu, painPoints, nil
			}
		}
	}

	// Search in feature definitions
	for _, feature := range fs.model.Features {
		for _, p := range feature.Definition.Personas {
			if matchesFeaturePersona(p, personaID) {
				// Convert FeaturePersona to TargetUser
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

				// Build pain points
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

// matchesPersona checks if a TargetUser matches the given ID or name.
func matchesPersona(tu TargetUser, idOrName string) bool {
	idOrNameLower := strings.ToLower(idOrName)
	return strings.ToLower(tu.ID) == idOrNameLower ||
		strings.ToLower(tu.Name) == idOrNameLower ||
		strings.Contains(strings.ToLower(tu.Name), idOrNameLower)
}

// matchesFeaturePersona checks if a FeaturePersona matches the given ID or name.
func matchesFeaturePersona(p FeaturePersona, idOrName string) bool {
	idOrNameLower := strings.ToLower(idOrName)
	return strings.ToLower(p.ID) == idOrNameLower ||
		strings.ToLower(p.Name) == idOrNameLower ||
		strings.Contains(strings.ToLower(p.Name), idOrNameLower)
}

// GetValuePropositions returns all value propositions.
// If personaID is provided, filters to those relevant to that persona.
func (fs *FileSystemSource) GetValuePropositions(personaID string) ([]ValueProposition, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	// Value propositions come from strategy formula positioning
	var props []ValueProposition

	if fs.model.StrategyFormula != nil {
		pos := fs.model.StrategyFormula.Positioning

		// Main value proposition
		if pos.UniqueValueProp != "" {
			props = append(props, ValueProposition{
				ID:        "main-uvp",
				Statement: pos.UniqueValueProp,
			})
		}

		// Positioning statement as another value proposition
		if pos.Statement != "" {
			props = append(props, ValueProposition{
				ID:        "positioning",
				Statement: pos.Statement,
			})
		}
	}

	// If personaID is provided, filter (though we don't have persona-specific VP mapping yet)
	// For now, return all value propositions
	return props, nil
}

// GetCompetitivePosition returns competitive analysis and positioning.
func (fs *FileSystemSource) GetCompetitivePosition() (*CompetitiveMoat, *Positioning, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, nil, err
	}

	if fs.model.StrategyFormula == nil {
		return nil, nil, fmt.Errorf("strategy formula not found in instance")
	}

	return &fs.model.StrategyFormula.CompetitiveMoat, &fs.model.StrategyFormula.Positioning, nil
}

// GetRoadmapSummary returns a summary of the roadmap.
// If trackName is provided, filters to that track.
// If cycle is > 0, filters to that cycle.
func (fs *FileSystemSource) GetRoadmapSummary(trackName string, cycle int) (*Roadmap, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	if fs.model.Roadmap == nil {
		return nil, fmt.Errorf("roadmap not found in instance")
	}

	// If no filter, return the whole roadmap
	if trackName == "" && cycle == 0 {
		return fs.model.Roadmap, nil
	}

	// Filter by cycle first
	if cycle > 0 && fs.model.Roadmap.Cycle != cycle {
		return nil, fmt.Errorf("roadmap cycle %d not found (current cycle: %d)", cycle, fs.model.Roadmap.Cycle)
	}

	// Filter by track if specified
	if trackName != "" {
		trackNameLower := strings.ToLower(trackName)
		filteredRoadmap := &Roadmap{
			ID:         fs.model.Roadmap.ID,
			StrategyID: fs.model.Roadmap.StrategyID,
			Cycle:      fs.model.Roadmap.Cycle,
			Timeframe:  fs.model.Roadmap.Timeframe,
			Tracks:     make(map[string]*Track),
		}

		for name, track := range fs.model.Roadmap.Tracks {
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

	return fs.model.Roadmap, nil
}

// GetFeatures returns all features, optionally filtered by status.
func (fs *FileSystemSource) GetFeatures(status string) ([]FeatureSummary, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	var features []FeatureSummary
	statusLower := strings.ToLower(status)

	for _, f := range fs.model.Features {
		// Filter by status if provided
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
func (fs *FileSystemSource) GetFeatureDetails(featureIDOrSlug string) (*Feature, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	idOrSlugLower := strings.ToLower(featureIDOrSlug)

	// Try direct ID lookup first
	if f, ok := fs.model.Features[featureIDOrSlug]; ok {
		return f, nil
	}

	// Search by ID or slug (case-insensitive)
	for _, f := range fs.model.Features {
		if strings.ToLower(f.ID) == idOrSlugLower ||
			strings.ToLower(f.Slug) == idOrSlugLower {
			return f, nil
		}
	}

	return nil, fmt.Errorf("feature not found: %s", featureIDOrSlug)
}

// Search performs full-text search across all strategy content.
// This is a simple implementation - will be enhanced in search.go.
func (fs *FileSystemSource) Search(query string, limit int) ([]SearchResult, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 20
	}

	queryLower := strings.ToLower(query)
	var results []SearchResult

	// Search in north star
	if fs.model.NorthStar != nil {
		ns := fs.model.NorthStar

		if containsQuery(ns.Purpose.Statement, queryLower) {
			results = append(results, SearchResult{
				Type:    "purpose",
				ID:      "north-star-purpose",
				Title:   "Purpose Statement",
				Content: ns.Purpose.Statement,
				Snippet: extractSnippet(ns.Purpose.Statement, queryLower),
				Score:   1.0,
				Source:  "READY/00_north_star.yaml",
			})
		}

		if containsQuery(ns.Vision.Statement, queryLower) {
			results = append(results, SearchResult{
				Type:    "vision",
				ID:      "north-star-vision",
				Title:   "Vision Statement",
				Content: ns.Vision.Statement,
				Snippet: extractSnippet(ns.Vision.Statement, queryLower),
				Score:   1.0,
				Source:  "READY/00_north_star.yaml",
			})
		}

		if containsQuery(ns.Mission.Statement, queryLower) {
			results = append(results, SearchResult{
				Type:    "mission",
				ID:      "north-star-mission",
				Title:   "Mission Statement",
				Content: ns.Mission.Statement,
				Snippet: extractSnippet(ns.Mission.Statement, queryLower),
				Score:   1.0,
				Source:  "READY/00_north_star.yaml",
			})
		}
	}

	// Search in insight analyses
	if fs.model.InsightAnalyses != nil {
		for _, insight := range fs.model.InsightAnalyses.KeyInsights {
			if containsQuery(insight.Insight, queryLower) {
				results = append(results, SearchResult{
					Type:    "insight",
					ID:      "insight-" + sanitizeID(insight.Insight[:min(20, len(insight.Insight))]),
					Title:   "Key Insight",
					Content: insight.Insight,
					Snippet: extractSnippet(insight.Insight, queryLower),
					Score:   0.9,
					Source:  "READY/01_insight_analyses.yaml",
				})
			}
		}

		for _, tu := range fs.model.InsightAnalyses.TargetUsers {
			if containsQuery(tu.Name, queryLower) || containsQuery(tu.Description, queryLower) {
				results = append(results, SearchResult{
					Type:    "persona",
					ID:      tu.ID,
					Title:   tu.Name,
					Content: tu.Description,
					Snippet: extractSnippet(tu.Description, queryLower),
					Score:   0.85,
					Source:  "READY/01_insight_analyses.yaml",
				})
			}
		}
	}

	// Search in features
	for _, f := range fs.model.Features {
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
				Type:    "feature",
				ID:      f.ID,
				Title:   f.Name,
				Content: matchContent,
				Snippet: extractSnippet(matchContent, queryLower),
				Score:   matchScore,
				Source:  fmt.Sprintf("FIRE/feature_definitions/%s.yaml", f.Slug),
				Context: map[string]string{
					"status": f.Status,
				},
			})
		}
	}

	// Search in roadmap OKRs
	if fs.model.Roadmap != nil {
		for trackName, track := range fs.model.Roadmap.Tracks {
			for _, okr := range track.OKRs {
				if containsQuery(okr.Objective, queryLower) {
					results = append(results, SearchResult{
						Type:    "okr",
						ID:      okr.ID,
						Title:   okr.Objective,
						Content: okr.Objective,
						Snippet: extractSnippet(okr.Objective, queryLower),
						Score:   0.8,
						Source:  "READY/05_roadmap_recipe.yaml",
						Context: map[string]string{
							"track": trackName,
						},
					})
				}

				for _, kr := range okr.KeyResults {
					if containsQuery(kr.Description, queryLower) {
						results = append(results, SearchResult{
							Type:    "key_result",
							ID:      kr.ID,
							Title:   kr.Description,
							Content: kr.Description,
							Snippet: extractSnippet(kr.Description, queryLower),
							Score:   0.75,
							Source:  "READY/05_roadmap_recipe.yaml",
							Context: map[string]string{
								"track":  trackName,
								"okr_id": okr.ID,
							},
						})
					}
				}
			}
		}
	}

	// Sort by score (highest first) and limit
	sortResultsByScore(results)
	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// GetStrategicContext synthesizes relevant context for a topic.
func (fs *FileSystemSource) GetStrategicContext(topic string) (*StrategicContextResult, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	if err := fs.ensureLoaded(); err != nil {
		return nil, err
	}

	result := &StrategicContextResult{
		Topic: topic,
	}
	topicLower := strings.ToLower(topic)

	// Get vision context
	if fs.model.NorthStar != nil {
		result.Vision = fs.model.NorthStar.Vision.Statement
	}

	// Find relevant personas
	if fs.model.InsightAnalyses != nil {
		for _, tu := range fs.model.InsightAnalyses.TargetUsers {
			if containsQuery(tu.Name, topicLower) ||
				containsQuery(tu.Description, topicLower) ||
				containsAnyQuery(tu.PainPoints, topicLower) {
				result.RelevantPersonas = append(result.RelevantPersonas, PersonaSummary{
					ID:          tu.ID,
					Name:        tu.Name,
					Role:        tu.Role,
					Description: tu.Description,
				})

				// Add their pain points
				for _, pp := range tu.PainPoints {
					result.RelevantPainPoints = append(result.RelevantPainPoints, PainPoint{
						PersonaID:   tu.ID,
						PersonaName: tu.Name,
						Description: pp,
					})
				}
			}
		}
	}

	// Find relevant features
	for _, f := range fs.model.Features {
		if containsQuery(f.Name, topicLower) ||
			containsQuery(f.Definition.JobToBeDone, topicLower) ||
			containsAnyQuery(f.StrategicContext.ContributesTo, topicLower) {
			result.RelevantFeatures = append(result.RelevantFeatures, FeatureSummary{
				ID:            f.ID,
				Name:          f.Name,
				Status:        f.Status,
				ContributesTo: f.StrategicContext.ContributesTo,
			})
		}
	}

	// Find relevant OKRs
	if fs.model.Roadmap != nil {
		for trackName, track := range fs.model.Roadmap.Tracks {
			for _, okr := range track.OKRs {
				if containsQuery(okr.Objective, topicLower) {
					var krDescriptions []string
					for _, kr := range okr.KeyResults {
						krDescriptions = append(krDescriptions, kr.Description)
					}

					result.RelevantOKRs = append(result.RelevantOKRs, OKRSummary{
						ID:         okr.ID,
						Track:      trackName,
						Objective:  okr.Objective,
						KeyResults: krDescriptions,
					})
				}
			}
		}
	}

	// Get competitive context
	if fs.model.StrategyFormula != nil {
		result.CompetitiveContext = fs.model.StrategyFormula.CompetitiveMoat.Differentiation
	}

	// Get key insights
	if fs.model.InsightAnalyses != nil {
		for _, insight := range fs.model.InsightAnalyses.KeyInsights {
			if containsQuery(insight.Insight, topicLower) ||
				containsQuery(insight.StrategicImplication, topicLower) {
				result.KeyInsights = append(result.KeyInsights, insight.Insight)
			}
		}
	}

	return result, nil
}

// GetModel returns the underlying strategy model for advanced queries.
func (fs *FileSystemSource) GetModel() *StrategyModel {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	return fs.model
}

// --- Helper functions ---

func containsQuery(text, queryLower string) bool {
	return strings.Contains(strings.ToLower(text), queryLower)
}

func containsAnyQuery(texts []string, queryLower string) bool {
	for _, text := range texts {
		if containsQuery(text, queryLower) {
			return true
		}
	}
	return false
}

func extractSnippet(text, queryLower string) string {
	textLower := strings.ToLower(text)
	idx := strings.Index(textLower, queryLower)
	if idx == -1 {
		// Return first 100 chars if query not found
		if len(text) > 100 {
			return text[:100] + "..."
		}
		return text
	}

	// Extract surrounding context
	start := max(0, idx-50)
	end := min(len(text), idx+len(queryLower)+50)

	snippet := text[start:end]
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(text) {
		snippet = snippet + "..."
	}

	return snippet
}

func sanitizeID(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, " ", "-")
	return s
}

func sortResultsByScore(results []SearchResult) {
	// Simple bubble sort for now (usually small result sets)
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Score > results[i].Score {
				results[i], results[j] = results[j], results[i]
			}
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
