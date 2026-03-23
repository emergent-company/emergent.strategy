package memory

import (
	"context"
)

// Search performs hybrid search (text + vector) across graph objects.
func (c *Client) Search(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	var wrapper struct {
		Data []SearchResult `json:"data"`
	}
	if err := c.do(ctx, "POST", "/api/graph/search", req, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Data, nil
}

// SearchWithNeighbors performs hybrid search and includes graph neighbors
// of each result for context.
func (c *Client) SearchWithNeighbors(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	// The API returns {"primaryResults": [...]}
	var wrapper struct {
		PrimaryResults []SearchResult `json:"primaryResults"`
	}
	if err := c.do(ctx, "POST", "/api/graph/search-with-neighbors", req, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.PrimaryResults, nil
}
