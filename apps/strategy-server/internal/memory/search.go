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
// The Memory API returns results under "data", not "results".
type SearchResponse struct {
	Data    []SearchResult `json:"data"`
	Results []SearchResult `json:"results"` // fallback for compatibility
	Total   int            `json:"total"`
	HasMore bool           `json:"hasMore"`
}

// Items returns the search results from whichever field is populated.
func (r SearchResponse) Items() []SearchResult {
	if len(r.Data) > 0 {
		return r.Data
	}
	return r.Results
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
	return resp.Items(), nil
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
	return resp.Items(), nil
}
