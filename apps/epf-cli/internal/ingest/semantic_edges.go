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
	"strings"
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

	// For each source node, find semantically similar objects.
	//
	// UPGRADE PATH: When Memory's /objects/{id}/similar API is fixed (issue #97),
	// replace the search-with-neighbors workaround below with:
	//
	//   results, err := ing.client.FindSimilar(ctx, obj.ID, memory.SimilarOptions{
	//       Limit: config.SearchLimit,
	//   })
	//
	// This uses the object's actual embedding vector for direct vector-to-vector
	// comparison — more accurate than re-embedding a text query, no truncation
	// issues, and the buildQueryText function can be deleted entirely.
	for _, obj := range allObjects {
		if !sourceTypes[obj.Type] {
			continue
		}

		// WORKAROUND: Use search-with-neighbors with a text query constructed
		// from the object's properties. This re-embeds the query text on each call
		// instead of using the object's existing embedding. Remove when #97 is fixed.
		queryText := buildQueryText(obj)
		if queryText == "" {
			continue
		}

		stats.NodesSearched++

		results, err := ing.client.SearchWithNeighbors(ctx, memory.SearchRequest{
			Query: queryText,
			Limit: config.SearchLimit,
		})
		if err != nil {
			stats.SearchErrors++
			log.Printf("[semantic-edges] search error for %s: %v", obj.Key, err)
			continue
		}

		if len(results) > 0 {
			log.Printf("[semantic-edges] %s: %d results (top: %.3f %s)", obj.Key, len(results), results[0].Score, results[0].Object.Key)
		} else {
			log.Printf("[semantic-edges] %s: 0 results for query: %s", obj.Key, queryText[:min(60, len(queryText))])
		}

		edgesForNode := 0
		for _, r := range results {
			// Skip self
			if r.Object.ID == obj.ID || r.Object.Key == obj.Key {
				continue
			}

			// Skip below threshold
			if r.Score < config.MinScore {
				stats.EdgesSkipped++
				continue
			}

			// Skip if structural edge already exists
			edgeKey := edgePairKey(obj.ID, r.Object.ID)
			if existingEdges[edgeKey] {
				stats.EdgesSkipped++
				continue
			}

			// Skip if we've hit the per-node limit
			if edgesForNode >= config.MaxEdgesPerNode {
				break
			}

			// Classify the semantic relationship
			relType := classifySemanticRelation(obj, r.Object)

			if !config.DryRun {
				_, err := ing.client.CreateRelationship(ctx, memory.CreateRelationshipRequest{
					Type:   relType,
					FromID: obj.ID,
					ToID:   r.Object.ID,
					Properties: map[string]any{
						"weight":      fmt.Sprintf("%.3f", r.Score),
						"edge_source": "semantic",
						"confidence":  fmt.Sprintf("%.3f", r.Score),
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
			existingEdges[edgePairKey(r.Object.ID, obj.ID)] = true
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

// buildQueryText extracts meaningful text from an object for similarity search.
// Uses a short, concept-focused query to get broader semantic matches rather than
// exact matches of the source text.
//
// DELETE THIS FUNCTION when Memory's /objects/{id}/similar API is fixed (#97).
// The similarity API uses the object's actual embedding vector directly —
// no text query construction needed.
func buildQueryText(obj memory.Object) string {
	// Use just the name for the query — it captures the concept without
	// being so specific that only the source object matches.
	name, _ := obj.Properties["name"].(string)
	if name == "" {
		return ""
	}

	// For types with very short names, add context from description
	if len(name) < 20 {
		if desc, ok := obj.Properties["description"].(string); ok && desc != "" {
			// Take just the first sentence
			if idx := strings.IndexAny(desc, ".!?"); idx > 0 && idx < 100 {
				name = name + ". " + desc[:idx]
			} else if len(desc) < 100 {
				name = name + ". " + desc
			}
		} else if stmt, ok := obj.Properties["statement"].(string); ok && stmt != "" {
			if idx := strings.IndexAny(stmt, ".!?"); idx > 0 && idx < 100 {
				name = name + ". " + stmt[:idx]
			}
		}
	}

	// Keep query short to get broader matches
	if len(name) > 120 {
		name = name[:120]
	}

	return name
}

// classifySemanticRelation determines the semantic edge type between two objects.
func classifySemanticRelation(from, to memory.Object) string {
	// Default to "supports" — the most common semantic relationship
	// More sophisticated classification would use LLM reasoning
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
