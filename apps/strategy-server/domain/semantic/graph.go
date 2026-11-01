package semantic

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// GraphStats are the instance's graph-based maturity signals. Everything is
// computed over the instance's projection: another instance's objects, objects
// without an owner and leftovers of earlier ingests are not counted.
type GraphStats struct {
	NodeCount int
	EdgeCount int

	ContributesToEdges   int
	TestsAssumptionEdges int
	DependsOnEdges       int

	PersonaCount    int
	CapabilityCount int
	AssumptionCount int

	// VisionConnected is true when the instance has a north star in its graph.
	// The north star is found by artifact type, not by a guessed key, because
	// its key is "north_star" in a scaffolded instance and may be a path in an
	// imported one.
	VisionConnected         bool
	VisionReachableFeatures int

	// Orphans are found among a sample of the instance's artifact-layer objects.
	OrphanedNodeCount int
	OrphanedNodes     []string
}

const (
	statsOrphanSample = 50
	statsVisionDepth  = 4
	statsVisionNodes  = 200
)

// GraphStats returns the maturity signals of one instance. Counts of nodes and
// edges come from the manifest, which is exactly what the last complete ingest
// wrote; the north star, the typed counts and the orphan sample come from Memory
// through the scope helper.
func (s *Service) GraphStats(ctx context.Context, instanceID string) (*GraphStats, error) {
	sc, err := s.scope(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	objects, relsByType, err := s.manifest.ProjectionCounts(ctx, sc.id)
	if err != nil {
		return nil, err
	}
	st := &GraphStats{
		NodeCount:            objects,
		ContributesToEdges:   relsByType["contributes_to"],
		TestsAssumptionEdges: relsByType["tests_assumption"],
		DependsOnEdges:       relsByType["depends_on"],
	}
	for _, n := range relsByType {
		st.EdgeCount += n
	}

	for _, t := range []struct {
		typ    string
		target *int
	}{
		{"Persona", &st.PersonaCount},
		{"Capability", &st.CapabilityCount},
		{"Assumption", &st.AssumptionCount},
	} {
		objs, err := sc.list(ctx, t.typ)
		if err != nil {
			return nil, fmt.Errorf("graph stats: list %s: %w", t.typ, err)
		}
		*t.target = len(objs)
	}

	stars, err := sc.list(ctx, "north_star")
	if err != nil {
		return nil, fmt.Errorf("graph stats: find north star: %w", err)
	}
	for i := range stars {
		if layerOf(&stars[i]) != layerArtifact {
			continue
		}
		st.VisionConnected = true
		reached, _, err := sc.neighborhood(ctx, &stars[i], statsVisionDepth, statsVisionNodes)
		if err == nil {
			for _, o := range reached {
				if o.Type == "Feature" || o.Type == "feature" {
					st.VisionReachableFeatures++
				}
			}
		}
		break
	}

	all, err := sc.list(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("graph stats: list objects: %w", err)
	}
	var sample []memory.Object
	for _, o := range all {
		if layerOf(&o) == layerArtifact && len(sample) < statsOrphanSample {
			sample = append(sample, o)
		}
	}
	if len(sample) > 0 {
		_, rels, err := sc.expand(ctx, sample, 1, 500)
		if err == nil {
			connected := make(map[string]bool, len(rels)*2)
			for _, r := range rels {
				connected[r.FromID], connected[r.ToID] = true, true
			}
			for i := range sample {
				if connected[sample[i].StableID()] {
					continue
				}
				st.OrphanedNodeCount++
				if len(st.OrphanedNodes) < 5 {
					st.OrphanedNodes = append(st.OrphanedNodes, sc.originalKey(&sample[i]))
				}
			}
		}
	}
	return st, nil
}

// GraphHit is one search hit as ripple sees it: the artifact's own key (not the
// key Memory stores it under), its type and the similarity score.
type GraphHit struct {
	Key   string
	Type  string
	Score float64
}

// GraphNode is one object of a neighbourhood, by its own key.
type GraphNode struct {
	Key  string
	Type string
}

// ScopedGraph is the read access ripple has to the Memory graph, bound to one
// instance. It takes and returns the keys the strategy tables use; the instance
// prefix of the Memory keys never shows. Every call goes through the same scope
// helper as the MCP reads, so ripple cannot see another instance's objects.
type ScopedGraph struct {
	svc *Service
	id  uuid.UUID
}

// ScopedGraph returns the graph facade for one instance.
func (s *Service) ScopedGraph(instanceID uuid.UUID) *ScopedGraph {
	return &ScopedGraph{svc: s, id: instanceID}
}

// Search returns up to limit visible hits for the query, best first, optionally
// restricted to object types. It returns ErrGraphNotReady for an instance that
// has not been ingested.
func (g *ScopedGraph) Search(ctx context.Context, query string, limit int, types []string) ([]GraphHit, error) {
	sc, err := g.svc.scopeFor(ctx, g.id)
	if err != nil {
		return nil, err
	}
	hits, err := sc.search(ctx, query, limit, types)
	if err != nil {
		return nil, fmt.Errorf("graph search: %w", err)
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].score > hits[j].score })
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	out := make([]GraphHit, 0, len(hits))
	for _, h := range hits {
		out = append(out, GraphHit{Key: h.key, Type: h.obj.Type, Score: h.score})
	}
	return out, nil
}

// Neighborhood returns the objects within depth of the object with the given
// key, itself included. ok is false when the key is not part of the instance's
// projection.
func (g *ScopedGraph) Neighborhood(ctx context.Context, key string, depth, maxNodes int) (nodes []GraphNode, ok bool, err error) {
	sc, err := g.svc.scopeFor(ctx, g.id)
	if err != nil {
		return nil, false, err
	}
	root, err := sc.lookup(ctx, key)
	if err != nil || root == nil {
		return nil, false, err
	}
	objs, _, err := sc.neighborhood(ctx, root, depth, maxNodes)
	if err != nil {
		return nil, false, err
	}
	out := make([]GraphNode, 0, len(objs))
	for i := range objs {
		out = append(out, GraphNode{Key: sc.originalKey(&objs[i]), Type: objs[i].Type})
	}
	return out, true, nil
}
