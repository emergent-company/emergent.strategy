// Package semantic provides domain logic for semantic graph integration
// via emergent.memory. It is optional: if Memory is not configured, all
// operations return apperror.ErrSemanticUnavailable.
package semantic

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/epfimport"
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
//
// A hit is discovery, not the authoritative text. Artifact and Path name the
// stored section it came from, when that can be derived, so a client can read
// the whole section with get_section before answering.
type SearchResult struct {
	ArtifactType string  `json:"artifact_type"`
	ArtifactKey  string  `json:"artifact_key"`
	Snippet      string  `json:"snippet"`
	Score        float64 `json:"score"`
	// Artifact and Path locate the section in the instance's strategy.
	Artifact string `json:"artifact,omitempty"`
	Path     string `json:"path,omitempty"`
	// SectionSizeChars and ReadWith are filled in by the caller that can read
	// the section.
	SectionSizeChars int    `json:"section_size_chars,omitempty"`
	ReadWith         string `json:"read_with,omitempty"`
	// Match says how the hit was found: "semantic" or "keyword".
	Match string `json:"match,omitempty"`
	// InstanceID, Layer and SourceArtifact say where the hit comes from.
	InstanceID     string `json:"instance_id,omitempty"`
	Layer          string `json:"layer,omitempty"`
	SourceArtifact string `json:"source_artifact,omitempty"`
}

// SearchOutcome is a search result with what was filtered out, so the filtering
// is visible.
type SearchOutcome struct {
	Results []*SearchResult `json:"results"`
	// ExcludedFramework counts hits on unmodified framework content.
	ExcludedFramework int `json:"excluded_framework,omitempty"`
	// ExcludedOtherInstance counts hits whose instance_id property names another
	// instance. Memory does not scope the search by instance; the fence change
	// does that at the source. This is a second line of defence.
	ExcludedOtherInstance int `json:"excluded_other_instance,omitempty"`
	ExcludedNotInGraph    int `json:"excluded_not_in_graph,omitempty"`
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
	ScenarioID       string         `json:"scenario_id"`
	ImpactSummary    string         `json:"impact_summary"`
	AffectedNodes    []string       `json:"affected_nodes"`
	PropagationDepth int            `json:"propagation_depth"`
	Confidence       map[string]any `json:"confidence,omitempty"`
}

// Service wraps the emergent.memory client with strategy-server domain operations.
// All methods return ErrSemanticUnavailable when Memory is not configured.
type Service struct {
	cfg      Config
	client   *memory.Client
	manifest ManifestSource
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

// Ping performs a live health check against the Memory server.
// Returns an error if Memory is not configured or not reachable.
func (s *Service) Ping(ctx context.Context) error {
	if s.client == nil {
		return apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	return s.client.Healthy(ctx)
}

// HealthDetailed returns the Memory server's version and subsystem health.
func (s *Service) HealthDetailed(ctx context.Context) (memory.HealthDetail, error) {
	if err := s.requireClient(); err != nil {
		return memory.HealthDetail{}, err
	}
	return s.client.HealthDetailed(ctx)
}

// requireClient returns ErrSemanticUnavailable if the client is nil.
func (s *Service) requireClient() error {
	if s.client == nil {
		return apperror.ErrSemanticUnavailable.WithDetail("emergent.memory not configured")
	}
	return nil
}

// searchOverFetch is how many hits are requested per hit wanted, up to
// searchFetchCap, so that dropping framework hits and leftover objects of the
// same instance does not leave the page short.
const (
	searchOverFetch = 2
	searchFetchCap  = 100
)

func fetchLimit(limit int) int {
	return min(limit*searchOverFetch, searchFetchCap)
}

// SearchStrategy performs semantic search over the strategy graph and returns
// the hits that survive filtering. See SearchStrategyScoped for the counts.
func (s *Service) SearchStrategy(ctx context.Context, instanceID, query string, limit int) ([]*SearchResult, error) {
	out, err := s.SearchStrategyScoped(ctx, instanceID, query, limit)
	if err != nil {
		return nil, err
	}
	return out.Results, nil
}

// SearchStrategyScoped searches the instance's part of the graph. Memory is
// asked for exactly one label, instance:<id>; what comes back is checked again
// against the instance's owner stamp and manifest, hits on unmodified framework
// content are dropped, and the counts of what was dropped are reported. It
// returns ErrGraphNotReady for an instance that has not been ingested.
func (s *Service) SearchStrategyScoped(ctx context.Context, instanceID, query string, limit int) (*SearchOutcome, error) {
	sc, err := s.scope(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 10
	}

	hits, err := sc.search(ctx, query, limit, nil)
	if err != nil {
		return nil, fmt.Errorf("search strategy: %w", err)
	}

	out := &SearchOutcome{Results: make([]*SearchResult, 0, limit)}
	out.ExcludedOtherInstance, out.ExcludedNotInGraph = sc.notOwned, sc.notInGraph
	for _, h := range hits {
		props := h.obj.Properties
		if isFrameworkObject(&h.obj) {
			out.ExcludedFramework++
			continue
		}
		if len(out.Results) >= limit {
			continue
		}
		artifactType, _ := props["artifact_type"].(string)
		snippet, _ := props["snippet"].(string)
		if snippet == "" {
			if name, ok := props["name"].(string); ok {
				snippet = name
			}
		}
		layer := layerOf(&h.obj)
		artifact, path := sectionOf(layer, h.key, props)
		out.Results = append(out.Results, &SearchResult{
			ArtifactType:   artifactType,
			ArtifactKey:    h.key,
			Snippet:        snippet,
			Score:          h.score,
			Artifact:       artifact,
			Path:           path,
			InstanceID:     sc.id.String(),
			Layer:          layer,
			SourceArtifact: sourceFile(props),
		})
	}
	return out, nil
}

type scopedHit struct {
	obj   memory.Object
	key   string // the original, unscoped key
	score float64
}

// search runs one Memory search labelled with the instance and returns the
// visible hits best first, at most fetchLimit(limit) before filtering. Hits that
// are not the instance's are counted in the scope, not returned.
func (sc *scope) search(ctx context.Context, query string, limit int, types []string) ([]scopedHit, error) {
	results, err := sc.svc.client.Search(ctx, memory.SearchRequest{
		Query:  query,
		Limit:  fetchLimit(limit),
		Types:  types,
		Labels: []string{sc.label},
	})
	if err != nil {
		return nil, err
	}
	objs := make([]memory.Object, len(results))
	for i, r := range results {
		objs[i] = r.Object
	}
	vis, err := sc.filter(ctx, objs)
	if err != nil {
		return nil, err
	}
	score := make(map[string]float64, len(results))
	for _, r := range results {
		score[r.Object.StableID()] = r.Score
	}
	out := make([]scopedHit, 0, len(vis))
	for _, o := range vis {
		out = append(out, scopedHit{obj: o, key: sc.originalKey(&o), score: score[o.StableID()]})
	}
	return out, nil
}

// isFrameworkObject reports whether a graph object was derived from unmodified
// framework content (a canonical definition, a template, a packaged default).
// Both layers carry the class of their source artifact. Such an object is in the
// graph because the instance holds the file, not because the company wrote it,
// so no read presents it, or a relationship to it, as the company's strategy.
func isFrameworkObject(o *memory.Object) bool {
	class, _ := o.Properties["integrity_class"].(string)
	return isFrameworkClass(class)
}

// isFrameworkClass reports whether an integrity class marks framework content.
func isFrameworkClass(class string) bool {
	switch class {
	case "canonical_reference", "unmodified_template", "packaged_default":
		return true
	}
	return false
}

// sourceFile names the file a graph object was derived from: the decomposer's
// source_artifact, or file_path on the artifact nodes it creates.
func sourceFile(props map[string]any) string {
	if src, _ := props["source_artifact"].(string); src != "" {
		return src
	}
	src, _ := props["file_path"].(string)
	return src
}

// sectionOf derives the stored section a hit came from: a decomposed object
// names its source file and section path; an artifact-layer object is the
// artifact itself (key is the original, unscoped key). It returns empty values
// when neither can be established.
func sectionOf(layer, key string, props map[string]any) (artifact, path string) {
	if src := sourceFile(props); src != "" && layer != layerArtifact {
		path, _ = props["section_path"].(string)
		return epfimport.ArtifactKey(src, filepath.Base(src)), path
	}
	if layer == layerArtifact {
		return key, ""
	}
	return "", ""
}

// GetNeighbors returns the neighbourhood of a node of the instance. nodeKey is
// the artifact key as the caller knows it. A key that is not part of the
// instance's projection, including one that only another instance has, reads as
// a node that does not exist.
func (s *Service) GetNeighbors(ctx context.Context, instanceID, nodeKey string) ([]*Neighbor, error) {
	sc, err := s.scope(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	root, err := sc.lookup(ctx, nodeKey)
	if err != nil {
		return nil, fmt.Errorf("get neighbors: %w", err)
	}
	if root == nil || isFrameworkObject(root) {
		return []*Neighbor{}, nil
	}
	objs, rels, err := sc.neighborhood(ctx, root, 1, 500)
	if err != nil {
		return nil, fmt.Errorf("get neighbors: %w", err)
	}
	byID := indexByID(objs)
	rootID := root.StableID()

	out := make([]*Neighbor, 0, len(rels))
	for _, rel := range rels {
		var connectedID, dir string
		switch rootID {
		case rel.FromID:
			connectedID, dir = rel.ToID, "outbound"
		case rel.ToID:
			connectedID, dir = rel.FromID, "inbound"
		default:
			continue
		}
		connected, ok := byID[connectedID]
		if !ok || isFrameworkObject(connected) {
			continue
		}
		out = append(out, &Neighbor{
			NodeKey:  sc.originalKey(connected),
			NodeType: connected.Type,
			EdgeType: rel.Type,
			EdgeDir:  dir,
		})
	}
	return out, nil
}

// DetectContradictions reports artifact-layer objects of the instance that have
// no relationship in its projection. The graph also holds a decomposed layer
// where relationship-free nodes are normal, so only the artifact layer is
// scanned. Framework content (see isFrameworkObject) is neither reported nor
// counted as a connection: an instance scaffolded from the framework holds
// hundreds of definitions with no relationships, and none of them is a defect in
// the company's strategy.
//
// Connectivity comes from the per-object edges endpoint, one call per object,
// so every edge is attributed to the object it was asked about. Edges count only
// when they are in the manifest.
func (s *Service) DetectContradictions(ctx context.Context, instanceID string) ([]*Contradiction, error) {
	sc, err := s.scope(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	all, err := sc.list(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("detect contradictions: list objects: %w", err)
	}
	var artifacts []memory.Object
	for i := range all {
		if layerOf(&all[i]) == layerArtifact && !isFrameworkObject(&all[i]) {
			artifacts = append(artifacts, all[i])
		}
	}
	if len(artifacts) == 0 {
		return []*Contradiction{}, nil
	}
	byID := indexByID(artifacts)

	var candidates []memory.Relationship
	for _, o := range artifacts {
		edges, err := s.client.ObjectEdges(ctx, o.StableID())
		if err != nil {
			return nil, fmt.Errorf("detect contradictions: object edges: %w", err)
		}
		candidates = append(candidates, edges.Incoming...)
		candidates = append(candidates, edges.Outgoing...)
	}
	rels, err := sc.filterRelationships(ctx, candidates, byID)
	if err != nil {
		return nil, fmt.Errorf("detect contradictions: %w", err)
	}
	connected := make(map[string]bool, len(rels)*2)
	for _, r := range rels {
		connected[r.FromID], connected[r.ToID] = true, true
	}

	contradictions := []*Contradiction{}
	for _, o := range artifacts {
		if connected[o.StableID()] {
			continue
		}
		key := sc.originalKey(&o)
		contradictions = append(contradictions, &Contradiction{
			Description: fmt.Sprintf("Orphaned node: %s (%s) has no relationships", key, o.Type),
			FixWith:     fmt.Sprintf("Add relationships connecting %s to other strategy artifacts", key),
		})
	}
	return contradictions, nil
}

// RunScenario creates a what-if graph branch. Returns a scenario ID (branch ID).
func (s *Service) RunScenario(ctx context.Context, instanceID, description, anchorNode string) (string, error) {
	if err := s.requireClient(); err != nil {
		return "", err
	}

	// The name carries the owner. Every other scenario operation checks it.
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

// ownedBranch loads a scenario branch and returns it only if it belongs to the
// instance, judged by the branch name prefix RunScenario gives it. A branch that
// does not exist, is not a scenario branch, or belongs to another instance all
// produce the same ErrScenarioNotFound, so callers learn nothing about other
// instances' branches.
func (s *Service) ownedBranch(ctx context.Context, instanceID, scenarioID string) (*memory.Branch, error) {
	id, err := uuid.Parse(instanceID)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail("invalid instance id")
	}
	branch, err := s.client.GetBranch(ctx, scenarioID)
	if err != nil {
		var apiErr *memory.APIError
		if errors.As(err, &apiErr) && (apiErr.StatusCode == http.StatusNotFound || apiErr.StatusCode == http.StatusBadRequest) {
			return nil, apperror.ErrScenarioNotFound
		}
		return nil, fmt.Errorf("get scenario branch: %w", err)
	}
	if !strings.HasPrefix(branch.Name, memory.ScenarioBranchPrefix(id)) {
		return nil, apperror.ErrScenarioNotFound
	}
	return branch, nil
}

// EvaluateScenario assesses the impact of a what-if scenario on the strategy graph.
func (s *Service) EvaluateScenario(ctx context.Context, scenarioID, instanceID string) (map[string]any, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}

	branch, err := s.ownedBranch(ctx, instanceID, scenarioID)
	if err != nil {
		return nil, err
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
		"scenario_id":       scenarioID,
		"branch_name":       branch.Name,
		"branch_status":     branch.Status,
		"affected_nodes":    affectedNodes,
		"propagation_depth": 0, // would need propagation circuit for real depth
		"impact_summary":    fmt.Sprintf("Scenario affects %d nodes", len(affectedNodes)),
	}, nil
}

// CommitScenario reports what merging a what-if scenario into the main graph
// would change. It is a dry run: MergeBranchRequest has no execute flag, and
// Memory only merges for real when the request says execute:true. A real
// merge would copy objects of every instance into main, so it stays disabled
// until a commit exists that merges only the instance's own objects.
// Returns the merge result summary.
func (s *Service) CommitScenario(ctx context.Context, scenarioID, instanceID string) (string, error) {
	if err := s.requireClient(); err != nil {
		return "", err
	}
	if _, err := s.ownedBranch(ctx, instanceID, scenarioID); err != nil {
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
	if _, err := s.ownedBranch(ctx, instanceID, scenarioID); err != nil {
		return err
	}
	if err := s.client.DeleteBranch(ctx, scenarioID); err != nil {
		return fmt.Errorf("discard scenario: %w", err)
	}
	return nil
}

// VerifySchemas checks that the Memory project has required EPF schemas installed.
// Called at server startup to bootstrap schemas if missing.
// If Memory is not configured (client == nil), returns nil without error —
// Memory is optional and its absence must not prevent server startup.
func (s *Service) VerifySchemas(ctx context.Context) error {
	if err := s.requireClient(); err != nil {
		return nil //nolint:nilerr // Memory not configured — skip silently, it is optional
	}

	schemas, err := s.client.ListInstalledSchemas(ctx)
	if err != nil {
		return fmt.Errorf("verify schemas: %w", err)
	}

	slog.Info("semantic: verified Memory schemas", "installed_count", len(schemas))
	return nil
}
