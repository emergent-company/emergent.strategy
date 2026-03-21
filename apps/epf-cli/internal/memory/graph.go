package memory

import (
	"context"
)

// Expand performs breadth-first expansion from root nodes.
// Returns the subgraph discovered within the depth and node limits.
func (c *Client) Expand(ctx context.Context, req ExpandRequest) (*ExpandResult, error) {
	var result ExpandResult
	if err := c.do(ctx, "POST", "/api/graph/expand", req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// Traverse performs directed graph traversal from root nodes.
func (c *Client) Traverse(ctx context.Context, req TraverseRequest) (*TraverseResult, error) {
	var result TraverseResult
	if err := c.do(ctx, "POST", "/api/graph/traverse", req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// SubgraphObject is an object in a subgraph batch request.
// It extends CreateObjectRequest with a _ref placeholder for relationship wiring.
type SubgraphObject struct {
	Ref        string         `json:"_ref,omitempty"` // placeholder for relationship src_ref/dst_ref
	Type       string         `json:"type"`
	Key        string         `json:"key,omitempty"`
	Name       string         `json:"name,omitempty"`
	Status     string         `json:"status,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// SubgraphRelationship is a relationship in a subgraph batch request.
// Uses src_ref/dst_ref for objects created in the same call, or src_id/dst_id for existing objects.
type SubgraphRelationship struct {
	Type       string         `json:"type"`
	SrcRef     string         `json:"src_ref,omitempty"` // reference to _ref in this batch
	DstRef     string         `json:"dst_ref,omitempty"` // reference to _ref in this batch
	SrcID      string         `json:"src_id,omitempty"`  // existing object ID
	DstID      string         `json:"dst_id,omitempty"`  // existing object ID
	Properties map[string]any `json:"properties,omitempty"`
}

// SubgraphRequest is the batch request for creating objects and relationships atomically.
type SubgraphRequest struct {
	Objects       []SubgraphObject       `json:"objects"`
	Relationships []SubgraphRelationship `json:"relationships"`
}

// SubgraphResult holds the IDs of created objects and relationships.
type SubgraphResult struct {
	Objects       []Object          `json:"objects"`
	Relationships []Relationship    `json:"relationships"`
	RefMap        map[string]string `json:"ref_map,omitempty"` // _ref → object ID
}

// CreateSubgraph atomically creates objects and relationships in one call.
// Supports _ref placeholders for wiring objects in the same batch.
// Max 500 objects and 500 relationships per call — larger batches are auto-chunked.
func (c *Client) CreateSubgraph(ctx context.Context, req SubgraphRequest) (*SubgraphResult, error) {
	var result SubgraphResult
	if err := c.do(ctx, "POST", "/api/graph/subgraph", req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
