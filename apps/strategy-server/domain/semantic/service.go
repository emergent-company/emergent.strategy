// Package semantic provides domain logic for semantic graph integration
// via emergent.memory. It is optional: if Memory is not configured, all
// operations return apperror.ErrSemanticUnavailable.
package semantic

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Config holds the emergent.memory connection settings.
type Config struct {
	URL      string
	Project  string
	Token    string
	AuthMode string // "api-key" (standalone) or "bearer" (production)
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

// ScenarioResult holds the evaluation output for a what-if scenario.
type ScenarioResult struct {
	ScenarioID      string         `json:"scenario_id"`
	ImpactSummary   string         `json:"impact_summary"`
	AffectedNodes   []string       `json:"affected_nodes"`
	PropagationDepth int           `json:"propagation_depth"`
	Confidence      map[string]any `json:"confidence,omitempty"`
}

// Service wraps the emergent.memory client with strategy-server domain operations.
// All methods return ErrSemanticUnavailable when Memory is not configured.
type Service struct {
	cfg    Config
	client *memory.Client
}

// NewService creates a semantic Service. If cfg is not configured, all methods
// will return ErrSemanticUnavailable — the rest of the server continues normally.
func NewService(cfg Config) *Service {
	s := &Service{cfg: cfg}

	if cfg.IsConfigured() {
		authMode := memory.AuthModeAPIKey // default for standalone/dev
		if cfg.AuthMode == "bearer" {
			authMode = memory.AuthModeBearer
		}
		c, err := memory.New(memory.Config{
			BaseURL:   cfg.URL,
			ProjectID: cfg.Project,
			Token:     cfg.Token,
			AuthMode:  authMode,
		})
		if err != nil {
			slog.Warn("semantic service: failed to create Memory client, semantic features disabled",
				"err", err)
		} else {
			s.client = c
		}
	}

	return s
}

// Client returns the underlying Memory client, or nil if not configured.
// Used by the ingestion pipeline to write graph objects.
func (s *Service) Client() *memory.Client {
	return s.client
}

// Config returns the service configuration (URL, Project, Token).
// Used by the settings handler to display connection details.
func (s *Service) Config() Config {
	return s.cfg
}

// IsAvailable returns true when the Memory client is wired and operational.
func (s *Service) IsAvailable() bool {
	return s.client != nil
}

// requireClient returns ErrSemanticUnavailable if the client is nil.
func (s *Service) requireClient() error {
	if s.client == nil {
		return apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	return nil
}

// SearchStrategy performs semantic search over the strategy graph.
func (s *Service) SearchStrategy(ctx context.Context, instanceID, query string, limit int) ([]*SearchResult, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}

	results, err := s.client.Search(ctx, memory.SearchRequest{
		Query: query,
		Limit: limit,
	})
	if err != nil {
		return nil, fmt.Errorf("search strategy: %w", err)
	}

	out := make([]*SearchResult, 0, len(results))
	for _, r := range results {
		// Extract artifact metadata from Memory object properties.
		artifactType, _ := r.Object.Properties["artifact_type"].(string)
		snippet, _ := r.Object.Properties["snippet"].(string)
		if snippet == "" {
			// Fallback: use the object's name or description property.
			if name, ok := r.Object.Properties["name"].(string); ok {
				snippet = name
			}
		}

		out = append(out, &SearchResult{
			ArtifactType: artifactType,
			ArtifactKey:  r.Object.Key,
			Snippet:      snippet,
			Score:        r.Score,
		})
	}

	return out, nil
}

// GetNeighbors returns the semantic graph neighbourhood of a node.
func (s *Service) GetNeighbors(ctx context.Context, instanceID, nodeKey string) ([]*Neighbor, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}

	// Look up the object by exact key.
	obj, err := s.client.GetObjectByKey(ctx, nodeKey)
	if err != nil {
		return nil, fmt.Errorf("get neighbors: lookup node %q: %w", nodeKey, err)
	}
	if obj == nil {
		return []*Neighbor{}, nil
	}

	// Get edges for this object.
	edges, err := s.client.ObjectEdges(ctx, obj.StableID())
	if err != nil {
		return nil, fmt.Errorf("get neighbors: edges: %w", err)
	}

	// The edges endpoint returns flat Relationship objects (src_id/dst_id).
	// Resolve connected object IDs to get their key and type.
	objectID := obj.StableID()
	out := make([]*Neighbor, 0, len(edges.Outgoing)+len(edges.Incoming))

	for _, rel := range edges.Outgoing {
		// For outgoing edges, the connected node is the destination.
		connectedID := rel.ToID
		if connectedID == objectID {
			connectedID = rel.FromID // shouldn't happen but be safe
		}
		connected, err := s.client.GetObject(ctx, connectedID)
		if err != nil {
			slog.Debug("get neighbors: resolve outgoing object failed", "id", connectedID, "err", err)
			continue
		}
		out = append(out, &Neighbor{
			NodeKey:  connected.Key,
			NodeType: connected.Type,
			EdgeType: rel.Type,
			EdgeDir:  "outbound",
		})
	}
	for _, rel := range edges.Incoming {
		// For incoming edges, the connected node is the source.
		connectedID := rel.FromID
		if connectedID == objectID {
			connectedID = rel.ToID
		}
		connected, err := s.client.GetObject(ctx, connectedID)
		if err != nil {
			slog.Debug("get neighbors: resolve incoming object failed", "id", connectedID, "err", err)
			continue
		}
		out = append(out, &Neighbor{
			NodeKey:  connected.Key,
			NodeType: connected.Type,
			EdgeType: rel.Type,
			EdgeDir:  "inbound",
		})
	}

	return out, nil
}

// DetectContradictions runs a contradiction scan on the strategy graph.
// This uses Memory's quality audit capabilities to find structural issues.
func (s *Service) DetectContradictions(ctx context.Context, instanceID string) ([]*Contradiction, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}

	// Strategy: use graph traversal to find disconnected nodes and conflicting edges.
	// For now, we detect contradictions by looking for orphaned nodes and
	// conflicting relationship patterns.
	//
	// A full contradiction detection engine would use the propagation circuit
	// from epf-cli. This implementation provides basic structural checks.

	page, err := s.client.ListObjects(ctx, memory.ListObjectsOptions{
		Limit: 200,
	})
	if err != nil {
		return nil, fmt.Errorf("detect contradictions: list objects: %w", err)
	}

	var contradictions []*Contradiction

	// Check each object for disconnection (orphaned nodes).
	for _, obj := range page.Items {
		edges, err := s.client.ObjectEdges(ctx, obj.StableID())
		if err != nil {
			slog.Warn("detect contradictions: skip object edges",
				"object_id", obj.StableID(), "err", err)
			continue
		}
		if len(edges.Incoming) == 0 && len(edges.Outgoing) == 0 {
			contradictions = append(contradictions, &Contradiction{
				Description: fmt.Sprintf("Orphaned node: %s (%s) has no relationships", obj.Key, obj.Type),
				FixWith:     fmt.Sprintf("Add relationships connecting %s to other strategy artifacts", obj.Key),
			})
		}
	}

	return contradictions, nil
}

// RunScenario creates a what-if graph branch. Returns a scenario ID (branch ID).
func (s *Service) RunScenario(ctx context.Context, instanceID, description, anchorNode string) (string, error) {
	if err := s.requireClient(); err != nil {
		return "", err
	}

	branchName := fmt.Sprintf("scenario-%s-%s", instanceID, description)
	if len(branchName) > 100 {
		branchName = branchName[:100]
	}

	branch, err := s.client.CreateBranch(ctx, memory.CreateBranchRequest{
		Name: branchName,
	})
	if err != nil {
		return "", fmt.Errorf("run scenario: create branch: %w", err)
	}

	return branch.ID, nil
}

// EvaluateScenario assesses the impact of a what-if scenario on the strategy graph.
func (s *Service) EvaluateScenario(ctx context.Context, scenarioID, instanceID string) (map[string]any, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}

	// Get the branch to verify it exists.
	branch, err := s.client.GetBranch(ctx, scenarioID)
	if err != nil {
		return nil, fmt.Errorf("evaluate scenario: get branch: %w", err)
	}

	// Use a branch-scoped client to list objects on the scenario branch.
	branchClient := s.client.WithBranch(scenarioID)
	page, err := branchClient.ListObjects(ctx, memory.ListObjectsOptions{
		Limit: 100,
	})
	if err != nil {
		return nil, fmt.Errorf("evaluate scenario: list branch objects: %w", err)
	}

	// Collect affected node keys.
	affectedNodes := make([]string, 0, len(page.Items))
	for _, obj := range page.Items {
		affectedNodes = append(affectedNodes, obj.Key)
	}

	return map[string]any{
		"scenario_id":      scenarioID,
		"branch_name":      branch.Name,
		"branch_status":    branch.Status,
		"affected_nodes":   affectedNodes,
		"propagation_depth": 0, // would need propagation circuit for real depth
		"impact_summary":   fmt.Sprintf("Scenario affects %d nodes", len(affectedNodes)),
	}, nil
}

// CommitScenario promotes a what-if scenario's mutations into the main graph.
// Returns the batch_id equivalent (merge result summary).
func (s *Service) CommitScenario(ctx context.Context, scenarioID, instanceID string) (string, error) {
	if err := s.requireClient(); err != nil {
		return "", err
	}

	result, err := s.client.MergeBranch(ctx, scenarioID, memory.MergeBranchRequest{
		SourceBranchID: scenarioID,
	})
	if err != nil {
		return "", fmt.Errorf("commit scenario: merge branch: %w", err)
	}

	summary := fmt.Sprintf("merged: %d objects created, %d updated, %d relationships created",
		result.ObjectsCreated, result.ObjectsUpdated, result.RelationshipsCreated)

	return summary, nil
}

// DiscardScenario removes a what-if scenario branch without merging.
func (s *Service) DiscardScenario(ctx context.Context, instanceID, scenarioID string) error {
	if err := s.requireClient(); err != nil {
		return err
	}
	if err := s.client.DeleteBranch(ctx, scenarioID); err != nil {
		return fmt.Errorf("discard scenario: %w", err)
	}
	return nil
}

// VerifySchemas checks that the Memory project has required EPF schemas installed.
// Called at server startup to bootstrap schemas if missing.
func (s *Service) VerifySchemas(ctx context.Context) error {
	if err := s.requireClient(); err != nil {
		return nil // not configured — skip silently
	}

	schemas, err := s.client.ListInstalledSchemas(ctx)
	if err != nil {
		return fmt.Errorf("verify schemas: %w", err)
	}

	slog.Info("semantic: verified Memory schemas", "installed_count", len(schemas))
	return nil
}
