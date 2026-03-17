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
func (c *Client) ListRelationships(ctx context.Context, opts ListOptions) ([]Relationship, error) {
	params := url.Values{}
	if opts.Limit > 0 {
		params.Set("limit", strconv.Itoa(opts.Limit))
	}
	if opts.Offset > 0 {
		params.Set("offset", strconv.Itoa(opts.Offset))
	}
	if opts.Type != "" {
		params.Set("type", opts.Type)
	}

	var rels []Relationship
	if err := c.doWithQuery(ctx, "/api/graph/relationships/search", params, &rels); err != nil {
		return nil, err
	}
	return rels, nil
}

// BulkCreateRelationships creates multiple relationships in a single API call.
func (c *Client) BulkCreateRelationships(ctx context.Context, rels []CreateRelationshipRequest) ([]Relationship, error) {
	var result []Relationship
	if err := c.do(ctx, "POST", "/api/graph/relationships/bulk", rels, &result); err != nil {
		return nil, err
	}
	return result, nil
}
