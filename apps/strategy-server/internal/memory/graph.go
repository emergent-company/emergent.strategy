package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// SubgraphObject is an object in a subgraph creation request.
// Ref is a local reference ID used for wiring relationships before IDs are assigned.
type SubgraphObject struct {
	Ref        string         `json:"_ref,omitempty"`
	Type       string         `json:"type"`
	Key        string         `json:"key,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// SubgraphRelationship is a relationship in a subgraph creation request.
// FromRef/ToRef reference SubgraphObject._ref values.
type SubgraphRelationship struct {
	Type       string         `json:"type"`
	FromRef    string         `json:"src_ref,omitempty"`
	ToRef      string         `json:"dst_ref,omitempty"`
	FromID     string         `json:"src_id,omitempty"`
	ToID       string         `json:"dst_id,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// SubgraphRequest is the payload for atomic subgraph creation.
type SubgraphRequest struct {
	Objects       []SubgraphObject       `json:"objects"`
	Relationships []SubgraphRelationship `json:"relationships"`
}

// CreateSubgraph atomically creates objects and relationships with _ref wiring.
// Max 500 objects and 500 relationships per call.
func (c *Client) CreateSubgraph(ctx context.Context, req SubgraphRequest) (*SubgraphResult, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/subgraph", req)
	if err != nil {
		return nil, fmt.Errorf("create subgraph: %w", err)
	}
	return decodeJSON[*SubgraphResult](data)
}

// ExpandRequest configures BFS expansion from root nodes.
type ExpandRequest struct {
	RootIDs           []string `json:"root_ids"`
	MaxDepth          int      `json:"max_depth,omitempty"`
	MaxNodes          int      `json:"max_nodes,omitempty"`
	RelationshipTypes []string `json:"relationship_types,omitempty"`
}

// ExpandResult contains objects and relationships from a BFS expansion.
type ExpandResult struct {
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
}

// UnmarshalJSON reads the answer of a graph walk. Memory v0.87 names the two
// lists "nodes" and "edges"; an answer that names them "objects" and
// "relationships" is read too. Without this the lists decode to nothing and no
// error, and every walk looks like an object with no neighbours.
func (r *ExpandResult) UnmarshalJSON(data []byte) error {
	objs, rels, err := decodeWalk(data)
	r.Objects, r.Relationships = objs, rels
	return err
}

type walkAnswer struct {
	Nodes         []Object       `json:"nodes"`
	Edges         []Relationship `json:"edges"`
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
}

func decodeWalk(data []byte) ([]Object, []Relationship, error) {
	var a walkAnswer
	if err := json.Unmarshal(data, &a); err != nil {
		return nil, nil, err
	}
	objs, rels := a.Nodes, a.Edges
	if len(objs) == 0 {
		objs = a.Objects
	}
	if len(rels) == 0 {
		rels = a.Relationships
	}
	return objs, rels, nil
}

// Expand performs BFS expansion from root nodes.
func (c *Client) Expand(ctx context.Context, req ExpandRequest) (*ExpandResult, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/expand", req)
	if err != nil {
		return nil, fmt.Errorf("expand: %w", err)
	}
	return decodeJSON[*ExpandResult](data)
}

// TraverseRequest configures directed traversal from root nodes.
type TraverseRequest struct {
	RootIDs           []string `json:"root_ids"`
	MaxDepth          int      `json:"max_depth,omitempty"`
	MaxNodes          int      `json:"max_nodes,omitempty"`
	Direction         string   `json:"direction,omitempty"` // "outgoing", "incoming", "both"
	RelationshipTypes []string `json:"relationship_types,omitempty"`
}

// TraverseResult contains objects and relationships from a directed traversal.
type TraverseResult struct {
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
}

// UnmarshalJSON reads a traversal answer the way ExpandResult does.
func (r *TraverseResult) UnmarshalJSON(data []byte) error {
	objs, rels, err := decodeWalk(data)
	r.Objects, r.Relationships = objs, rels
	return err
}

// Traverse performs directed graph traversal from root nodes.
func (c *Client) Traverse(ctx context.Context, req TraverseRequest) (*TraverseResult, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/traverse", req)
	if err != nil {
		return nil, fmt.Errorf("traverse: %w", err)
	}
	return decodeJSON[*TraverseResult](data)
}
