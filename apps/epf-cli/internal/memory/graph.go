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

// CreateSubgraph atomically creates a set of objects and relationships.
type SubgraphRequest struct {
	Objects       []CreateObjectRequest       `json:"objects"`
	Relationships []CreateRelationshipRequest `json:"relationships"`
}

// SubgraphResult holds the IDs of created objects and relationships.
type SubgraphResult struct {
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
}

// CreateSubgraph atomically creates objects and relationships in one call.
func (c *Client) CreateSubgraph(ctx context.Context, req SubgraphRequest) (*SubgraphResult, error) {
	var result SubgraphResult
	if err := c.do(ctx, "POST", "/api/graph/subgraph", req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
