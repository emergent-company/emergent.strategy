package memory

import (
	"context"
	"fmt"
	"net/http"
)

// SearchRequest is the payload for hybrid (text + vector) search.
type SearchRequest struct {
	Query    string   `json:"query"`
	Limit    int      `json:"limit,omitempty"`
	Types    []string `json:"types,omitempty"`
	MinScore float64  `json:"min_score,omitempty"`
}

// SearchResponse wraps the search result list.
type SearchResponse struct {
	Results []SearchResult `json:"results"`
}

// Search performs hybrid text+vector search over graph objects.
func (c *Client) Search(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/search", req)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}
	resp, err := decodeJSON[SearchResponse](data)
	if err != nil {
		return nil, err
	}
	return resp.Results, nil
}

// SearchWithNeighbors performs hybrid search and includes graph neighbor context.
func (c *Client) SearchWithNeighbors(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/search-with-neighbors", req)
	if err != nil {
		return nil, fmt.Errorf("search with neighbors: %w", err)
	}
	resp, err := decodeJSON[SearchResponse](data)
	if err != nil {
		return nil, err
	}
	return resp.Results, nil
}
