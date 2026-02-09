package strategy

import "context"

// StrategyStore defines the interface for accessing EPF product strategy data.
// Implementations may load from filesystem, git, or other sources.
type StrategyStore interface {
	// Load initializes the store by loading all strategy data.
	// This should be called before any query methods.
	Load(ctx context.Context) error

	// Reload refreshes the strategy data from the source.
	Reload(ctx context.Context) error

	// Close releases any resources held by the store.
	Close() error

	// --- Product Vision & Identity ---

	// GetProductVision returns the product's vision, mission, and purpose.
	// This comes from 00_north_star.yaml.
	GetProductVision() (*NorthStar, error)

	// --- Personas ---

	// GetPersonas returns all personas from insight analyses and feature definitions.
	GetPersonas() ([]PersonaSummary, error)

	// GetPersonaDetails returns full details for a specific persona by ID.
	GetPersonaDetails(personaID string) (*TargetUser, []PainPoint, error)

	// --- Value Propositions ---

	// GetValuePropositions returns all value propositions.
	// If personaID is provided, filters to those relevant to that persona.
	GetValuePropositions(personaID string) ([]ValueProposition, error)

	// --- Competitive Position ---

	// GetCompetitivePosition returns competitive analysis and positioning.
	GetCompetitivePosition() (*CompetitiveMoat, *Positioning, error)

	// --- Roadmap ---

	// GetRoadmapSummary returns a summary of the roadmap.
	// If trackName is provided, filters to that track.
	// If cycle is > 0, filters to that cycle.
	GetRoadmapSummary(trackName string, cycle int) (*Roadmap, error)

	// --- Features ---

	// GetFeatures returns all features, optionally filtered by status.
	GetFeatures(status string) ([]FeatureSummary, error)

	// GetFeatureDetails returns full details for a feature by ID or slug.
	GetFeatureDetails(featureIDOrSlug string) (*Feature, error)

	// --- Search ---

	// Search performs full-text search across all strategy content.
	// Returns results sorted by relevance.
	Search(query string, limit int) ([]SearchResult, error)

	// --- Context Synthesis ---

	// GetStrategicContext synthesizes relevant context for a topic.
	// This traverses relationships to gather vision, personas, features, OKRs, etc.
	GetStrategicContext(topic string) (*StrategicContextResult, error)

	// --- Model Access ---

	// GetModel returns the underlying strategy model for advanced queries.
	GetModel() *StrategyModel
}

// StoreOption configures a StrategyStore.
type StoreOption func(*storeOptions)

type storeOptions struct {
	watchChanges bool
	debounceMs   int
	onReload     func()
}

// WithWatchChanges enables file watching for automatic reload.
func WithWatchChanges(watch bool) StoreOption {
	return func(o *storeOptions) {
		o.watchChanges = watch
	}
}

// WithDebounce sets the debounce time for file change detection.
func WithDebounce(ms int) StoreOption {
	return func(o *storeOptions) {
		o.debounceMs = ms
	}
}

// WithOnReload sets a callback that's invoked after successful reload.
func WithOnReload(fn func()) StoreOption {
	return func(o *storeOptions) {
		o.onReload = fn
	}
}
