// Package semantic provides domain logic for semantic graph integration
// via emergent.memory. It is optional: if Memory is not configured, all
// operations return apperror.ErrSemanticUnavailable.
package semantic

import (
	"context"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Config holds the emergent.memory connection settings.
type Config struct {
	URL     string
	Project string
	Token   string
}

// IsConfigured returns true when all required Memory fields are set.
func (c Config) IsConfigured() bool {
	return c.URL != "" && c.Project != "" && c.Token != ""
}

// SearchResult is a single semantic search hit.
type SearchResult struct {
	ArtifactType string  `json:"artifact_type"`
	ArtifactKey  string  `json:"artifact_key"`
	Snippet      string  `json:"snippet"`
	Score        float64 `json:"score"`
}

// Neighbor represents a connected graph node.
type Neighbor struct {
	NodeKey  string `json:"node_key"`
	NodeType string `json:"node_type"`
	EdgeType string `json:"edge_type"`
	EdgeDir  string `json:"edge_direction"` // "outbound" | "inbound"
}

// Contradiction describes a structural inconsistency in the strategy graph.
type Contradiction struct {
	Description string `json:"description"`
	FixWith     string `json:"fix_with"`
}

// Service wraps the emergent.memory client with strategy-server domain operations.
// All methods return ErrSemanticUnavailable when Memory is not configured.
type Service struct {
	cfg Config
	// memClient would be *memory.Client from epf-cli/internal/memory once wired.
	// Left as interface{} here to avoid the import until the Memory URL is configured.
}

// NewService creates a semantic Service. If cfg is not configured, all methods
// will return ErrSemanticUnavailable — the rest of the server continues normally.
func NewService(cfg Config) *Service {
	return &Service{cfg: cfg}
}

// SearchStrategy performs semantic search over the strategy graph.
func (s *Service) SearchStrategy(ctx context.Context, instanceID, query string, limit int) ([]*SearchResult, error) {
	if !s.cfg.IsConfigured() {
		return nil, apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	// TODO(Phase 2+): proxy to memory client when wired.
	// For now return an empty result set so the endpoint is callable.
	_ = ctx
	_ = instanceID
	_ = query
	_ = limit
	return []*SearchResult{}, nil
}

// GetNeighbors returns the semantic graph neighbourhood of a node.
func (s *Service) GetNeighbors(ctx context.Context, instanceID, nodeKey string) ([]*Neighbor, error) {
	if !s.cfg.IsConfigured() {
		return nil, apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	_ = ctx
	_ = instanceID
	_ = nodeKey
	return []*Neighbor{}, nil
}

// DetectContradictions runs a contradiction scan on the strategy graph.
func (s *Service) DetectContradictions(ctx context.Context, instanceID string) ([]*Contradiction, error) {
	if !s.cfg.IsConfigured() {
		return nil, apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	_ = ctx
	_ = instanceID
	return []*Contradiction{}, nil
}

// RunScenario creates a what-if graph branch. Returns a scenario ID.
func (s *Service) RunScenario(ctx context.Context, instanceID, description, anchorNode string) (string, error) {
	if !s.cfg.IsConfigured() {
		return "", apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	_ = ctx
	_ = instanceID
	_ = description
	_ = anchorNode
	// TODO(Phase 2+): create branch in Memory, return scenario ID.
	return fmt.Sprintf("scenario-%s", instanceID), nil
}
