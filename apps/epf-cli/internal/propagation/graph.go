package propagation

import (
	"context"
	"fmt"
	"strconv"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// GraphSnapshot is an in-memory representation of the strategy graph.
// Loaded once from Memory, traversed in microseconds by the circuit.
type GraphSnapshot struct {
	// Nodes indexed by key.
	Nodes map[string]*GraphNode

	// nodesByID maps Memory object IDs to keys (for resolving relationship endpoints).
	nodesByID map[string]string
}

// GraphNode is a single node in the in-memory graph.
type GraphNode struct {
	Key         string
	ID          string // Memory object ID
	Type        string
	InertiaTier int
	Properties  map[string]any

	// Edges to other nodes.
	Outgoing []GraphEdge
	Incoming []GraphEdge
}

// GraphEdge is a directed edge in the in-memory graph.
type GraphEdge struct {
	Type       string
	TargetKey  string // key of the node on the other end
	Weight     float64
	EdgeSource string // "structural", "semantic", "causal"
}

// Neighbors returns all nodes connected to this node (both directions), deduplicated.
func (n *GraphNode) Neighbors(graph *GraphSnapshot) []*GraphNode {
	seen := make(map[string]bool)
	var neighbors []*GraphNode

	for _, e := range n.Outgoing {
		if !seen[e.TargetKey] {
			seen[e.TargetKey] = true
			if node, ok := graph.Nodes[e.TargetKey]; ok {
				neighbors = append(neighbors, node)
			}
		}
	}
	for _, e := range n.Incoming {
		if !seen[e.TargetKey] {
			seen[e.TargetKey] = true
			if node, ok := graph.Nodes[e.TargetKey]; ok {
				neighbors = append(neighbors, node)
			}
		}
	}

	return neighbors
}

// EdgeTypesTo returns the relationship types connecting this node to the target.
func (n *GraphNode) EdgeTypesTo(targetKey string) []string {
	var types []string
	for _, e := range n.Outgoing {
		if e.TargetKey == targetKey {
			types = append(types, e.Type)
		}
	}
	for _, e := range n.Incoming {
		if e.TargetKey == targetKey {
			types = append(types, e.Type)
		}
	}
	return types
}

// ToReasoningNode converts a GraphNode into a reasoning.Node for evaluation.
func (n *GraphNode) ToReasoningNode(graph *GraphSnapshot, perspectiveKey string) reasoning.Node {
	return reasoning.Node{
		Key:         n.Key,
		Type:        n.Type,
		InertiaTier: n.InertiaTier,
		Properties:  n.Properties,
		EdgeTypes:   n.EdgeTypesTo(perspectiveKey),
	}
}

// LoadGraphSnapshot loads the full graph from Memory into an in-memory snapshot.
// This fetches all objects and relationships in bulk, then builds the adjacency structure.
func LoadGraphSnapshot(ctx context.Context, client *memory.Client) (*GraphSnapshot, error) {
	snap := &GraphSnapshot{
		Nodes:     make(map[string]*GraphNode),
		nodesByID: make(map[string]string),
	}

	// Load all objects using cursor-based pagination
	batchSize := 200
	cursor := ""
	for page := 0; page < 50; page++ { // safety limit
		objects, nextCursor, err := client.ListObjects(ctx, memory.ListOptions{
			Limit:  batchSize,
			Cursor: cursor,
		})
		if err != nil {
			return nil, fmt.Errorf("list objects (page %d): %w", page, err)
		}

		for _, obj := range objects {
			// Use StableID (entity_id) for edge resolution — relationships
			// reference entity IDs, not version IDs.
			stableID := obj.StableID()
			node := &GraphNode{
				Key:        obj.Key,
				ID:         stableID,
				Type:       obj.Type,
				Properties: obj.Properties,
			}
			node.InertiaTier = parseInertiaTier(obj.Properties)
			snap.Nodes[obj.Key] = node
			snap.nodesByID[stableID] = obj.Key
		}

		if nextCursor == "" || len(objects) == 0 {
			break
		}
		cursor = nextCursor
	}

	// Load all relationships using cursor-based pagination
	cursor = ""
	for page := 0; page < 50; page++ {
		rels, nextCursor, err := client.ListRelationships(ctx, memory.ListOptions{
			Limit:  batchSize,
			Cursor: cursor,
		})
		if err != nil {
			return nil, fmt.Errorf("list relationships (page %d): %w", page, err)
		}

		for _, rel := range rels {
			fromKey, fromOK := snap.nodesByID[rel.FromID]
			toKey, toOK := snap.nodesByID[rel.ToID]
			if !fromOK || !toOK {
				continue // skip orphaned relationships
			}

			weight := parseWeight(rel.Properties)
			edgeSource := parseString(rel.Properties, "edge_source", "structural")

			fromNode := snap.Nodes[fromKey]
			toNode := snap.Nodes[toKey]

			if fromNode != nil {
				fromNode.Outgoing = append(fromNode.Outgoing, GraphEdge{
					Type: rel.Type, TargetKey: toKey,
					Weight: weight, EdgeSource: edgeSource,
				})
			}
			if toNode != nil {
				toNode.Incoming = append(toNode.Incoming, GraphEdge{
					Type: rel.Type, TargetKey: fromKey,
					Weight: weight, EdgeSource: edgeSource,
				})
			}
		}

		if nextCursor == "" || len(rels) == 0 {
			break
		}
		cursor = nextCursor
	}

	return snap, nil
}

// NewGraphSnapshotFromData builds a snapshot from pre-loaded objects and relationships.
// Used in tests to avoid API calls.
func NewGraphSnapshotFromData(objects []memory.Object, relationships []memory.Relationship) *GraphSnapshot {
	snap := &GraphSnapshot{
		Nodes:     make(map[string]*GraphNode),
		nodesByID: make(map[string]string),
	}

	for _, obj := range objects {
		stableID := obj.StableID()
		node := &GraphNode{
			Key:        obj.Key,
			ID:         stableID,
			Type:       obj.Type,
			Properties: obj.Properties,
		}
		node.InertiaTier = parseInertiaTier(obj.Properties)
		snap.Nodes[obj.Key] = node
		snap.nodesByID[stableID] = obj.Key
	}

	for _, rel := range relationships {
		fromKey, fromOK := snap.nodesByID[rel.FromID]
		toKey, toOK := snap.nodesByID[rel.ToID]
		if !fromOK || !toOK {
			continue
		}

		weight := parseWeight(rel.Properties)
		edgeSource := parseString(rel.Properties, "edge_source", "structural")

		if n := snap.Nodes[fromKey]; n != nil {
			n.Outgoing = append(n.Outgoing, GraphEdge{
				Type: rel.Type, TargetKey: toKey,
				Weight: weight, EdgeSource: edgeSource,
			})
		}
		if n := snap.Nodes[toKey]; n != nil {
			n.Incoming = append(n.Incoming, GraphEdge{
				Type: rel.Type, TargetKey: fromKey,
				Weight: weight, EdgeSource: edgeSource,
			})
		}
	}

	return snap
}

// --- Helpers ---

func parseInertiaTier(props map[string]any) int {
	v, ok := props["inertia_tier"]
	if !ok {
		return 7 // default to lowest inertia
	}
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case string:
		n, err := strconv.Atoi(t)
		if err != nil {
			return 7
		}
		return n
	default:
		return 7
	}
}

func parseWeight(props map[string]any) float64 {
	v, ok := props["weight"]
	if !ok {
		return 1.0
	}
	switch t := v.(type) {
	case float64:
		return t
	case string:
		f, err := strconv.ParseFloat(t, 64)
		if err != nil {
			return 1.0
		}
		return f
	default:
		return 1.0
	}
}

func parseString(props map[string]any, key, defaultVal string) string {
	v, ok := props[key]
	if !ok {
		return defaultVal
	}
	if s, ok := v.(string); ok {
		return s
	}
	return defaultVal
}
