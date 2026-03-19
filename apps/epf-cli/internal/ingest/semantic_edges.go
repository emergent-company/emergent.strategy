// semantic_edges.go computes semantic relationships between strategy graph nodes
// by using the search-with-neighbors API to find semantically similar objects.
//
// For each high-value node (Beliefs, Features, OKRs, Positioning), we query
// the graph for semantically similar objects and create edges where the
// similarity score exceeds a threshold. This connects nodes that are
// related by meaning even when no structural reference exists.
//
// When the Memory similarity API (/objects/{id}/similar) is fixed (#97),
// this can be upgraded to use direct vector-to-vector comparison.
package ingest

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// SemanticEdgeConfig controls semantic edge discovery.
type SemanticEdgeConfig struct {
	// MinScore is the minimum similarity score for creating an edge (default 0.4).
	MinScore float64

	// MaxEdgesPerNode limits edges per source node (default 5).
	MaxEdgesPerNode int

	// SearchLimit is how many candidates to retrieve per search (default 20).
	SearchLimit int

	// SourceTypes are the node types to compute edges FROM (high-value strategy nodes).
	// Default: Belief, Positioning, OKR, Feature
	SourceTypes []string

	// DryRun reports what edges would be created without creating them.
	DryRun bool
}

// DefaultSemanticEdgeConfig returns conservative defaults.
func DefaultSemanticEdgeConfig() SemanticEdgeConfig {
	return SemanticEdgeConfig{
		MinScore:        0.4,
		MaxEdgesPerNode: 5,
		SearchLimit:     20,
		SourceTypes:     []string{"Belief", "Positioning", "OKR", "Feature"},
	}
}

// SemanticEdgeStats tracks edge computation metrics.
type SemanticEdgeStats struct {
	NodesSearched int
	EdgesCreated  int
	EdgesSkipped  int // below threshold or self-reference
	SearchErrors  int
	Duration      time.Duration
}

// ComputeSemanticEdges discovers semantic relationships between strategy nodes.
func (ing *Ingester) ComputeSemanticEdges(ctx context.Context, config SemanticEdgeConfig) (*SemanticEdgeStats, error) {
	stats := &SemanticEdgeStats{}
	start := time.Now()

	// Build set of source types
	sourceTypes := make(map[string]bool)
	for _, t := range config.SourceTypes {
		sourceTypes[t] = true
	}

	// Load all objects to get source nodes and build an existing-edges index
	allObjects, existingEdges, err := ing.loadObjectsAndEdges(ctx)
	if err != nil {
		return nil, fmt.Errorf("load objects: %w", err)
	}

	log.Printf("[semantic-edges] Loaded %d objects, %d existing edges", len(allObjects), len(existingEdges))

	// For each source node, find semantically similar objects using
	// the Memory similarity API (direct vector-to-vector comparison).
	for _, obj := range allObjects {
		if !sourceTypes[obj.Type] {
			continue
		}

		stats.NodesSearched++

		results, err := ing.client.FindSimilar(ctx, obj.ID, memory.SimilarOptions{
			Limit: config.SearchLimit,
		})
		if err != nil {
			stats.SearchErrors++
			log.Printf("[semantic-edges] similarity error for %s: %v", obj.Key, err)
			continue
		}

		if len(results) > 0 {
			log.Printf("[semantic-edges] %s: %d results (top: %.4f distance %s)", obj.Key, len(results), results[0].Distance, results[0].Key)
		} else {
			log.Printf("[semantic-edges] %s: 0 similar objects found", obj.Key)
		}

		edgesForNode := 0
		for _, r := range results {
			// Skip self
			if r.ID == obj.ID || r.Key == obj.Key {
				continue
			}

			// Skip below threshold (convert distance to score for comparison)
			score := r.Score()
			if score < config.MinScore {
				stats.EdgesSkipped++
				continue
			}

			// Skip if structural edge already exists
			edgeKey := edgePairKey(obj.ID, r.ID)
			if existingEdges[edgeKey] {
				stats.EdgesSkipped++
				continue
			}

			// Skip if we've hit the per-node limit
			if edgesForNode >= config.MaxEdgesPerNode {
				break
			}

			// Classify the semantic relationship
			relType := classifySemanticRelationFromResult(obj, r)

			if !config.DryRun {
				_, err := ing.client.CreateRelationship(ctx, memory.CreateRelationshipRequest{
					Type:   relType,
					FromID: obj.ID,
					ToID:   r.ID,
					Properties: map[string]any{
						"weight":      fmt.Sprintf("%.3f", score),
						"edge_source": "semantic",
						"confidence":  fmt.Sprintf("%.3f", score),
					},
				})
				if err != nil {
					stats.SearchErrors++
					continue
				}
			}

			stats.EdgesCreated++
			edgesForNode++

			// Add to existing edges to avoid duplicates within this run
			existingEdges[edgeKey] = true
			existingEdges[edgePairKey(r.ID, obj.ID)] = true
		}
	}

	stats.Duration = time.Since(start)
	return stats, nil
}

// loadObjectsAndEdges fetches all objects and builds an existing-edge index.
func (ing *Ingester) loadObjectsAndEdges(ctx context.Context) ([]memory.Object, map[string]bool, error) {
	var allObjects []memory.Object
	cursor := ""
	for page := 0; page < 50; page++ {
		objects, nextCursor, err := ing.client.ListObjects(ctx, memory.ListOptions{Limit: 200, Cursor: cursor})
		if err != nil {
			return nil, nil, err
		}
		allObjects = append(allObjects, objects...)
		if nextCursor == "" || len(objects) == 0 {
			break
		}
		cursor = nextCursor
	}

	// Load existing relationships to avoid duplicates
	existingEdges := make(map[string]bool)
	cursor = ""
	for page := 0; page < 50; page++ {
		rels, nextCursor, err := ing.client.ListRelationships(ctx, memory.ListOptions{Limit: 200, Cursor: cursor})
		if err != nil {
			return nil, nil, err
		}
		for _, rel := range rels {
			existingEdges[edgePairKey(rel.FromID, rel.ToID)] = true
			existingEdges[edgePairKey(rel.ToID, rel.FromID)] = true
		}
		if nextCursor == "" || len(rels) == 0 {
			break
		}
		cursor = nextCursor
	}

	return allObjects, existingEdges, nil
}

// classifySemanticRelationFromResult determines the semantic edge type
// between a source object and a similar result.
func classifySemanticRelationFromResult(from memory.Object, to memory.SimilarResult) string {
	fromTier := parseTier(from.Properties)
	toTier := parseTier(to.Properties)

	// Higher tier informing lower tier → "informs"
	if fromTier < toTier {
		return "informs"
	}

	// Same tier → "parallels" (related concepts at same level)
	if fromTier == toTier {
		return "parallels"
	}

	// Lower tier supporting higher tier → "supports"
	return "supports"
}

func parseTier(props map[string]any) int {
	v, ok := props["inertia_tier"]
	if !ok {
		return 7
	}
	switch t := v.(type) {
	case string:
		var n int
		fmt.Sscanf(t, "%d", &n)
		if n > 0 {
			return n
		}
	case float64:
		return int(t)
	}
	return 7
}

func edgePairKey(fromID, toID string) string {
	return fromID + "→" + toID
}
