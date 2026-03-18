package memory

import (
	"context"
	"net/url"
	"strconv"
)

// CreateRelationship creates a directed relationship between two objects.
func (c *Client) CreateRelationship(ctx context.Context, req CreateRelationshipRequest) (*Relationship, error) {
	var rel Relationship
	if err := c.do(ctx, "POST", "/api/graph/relationships", req, &rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

// GetRelationship retrieves a relationship by ID.
func (c *Client) GetRelationship(ctx context.Context, id string) (*Relationship, error) {
	var rel Relationship
	if err := c.do(ctx, "GET", "/api/graph/relationships/"+id, nil, &rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

// DeleteRelationship soft-deletes a relationship.
func (c *Client) DeleteRelationship(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/graph/relationships/"+id, nil, nil)
}

// ListRelationships lists relationships with optional filters.
// Returns items and a next cursor for pagination.
func (c *Client) ListRelationships(ctx context.Context, opts ListOptions) ([]Relationship, string, error) {
	params := url.Values{}
	if opts.Limit > 0 {
		params.Set("limit", strconv.Itoa(opts.Limit))
	}
	if opts.Cursor != "" {
		params.Set("cursor", opts.Cursor)
	}
	if opts.Type != "" {
		params.Set("type", opts.Type)
	}

	// The API returns {"items": [...], "next_cursor": "...", "total": N}
	var page ListPage[Relationship]
	if err := c.doWithQuery(ctx, "/api/graph/relationships/search", params, &page); err != nil {
		return nil, "", err
	}
	return page.Items, page.NextCursor, nil
}

// BulkCreateRelationships creates multiple relationships in a single API call.
func (c *Client) BulkCreateRelationships(ctx context.Context, rels []CreateRelationshipRequest) ([]Relationship, error) {
	var result []Relationship
	if err := c.do(ctx, "POST", "/api/graph/relationships/bulk", rels, &result); err != nil {
		return nil, err
	}
	return result, nil
}
