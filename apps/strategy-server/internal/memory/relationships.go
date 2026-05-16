package memory

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// CreateRelationshipRequest is the payload for creating a directed edge.
type CreateRelationshipRequest struct {
	Type       string         `json:"type"`
	FromID     string         `json:"src_id"`
	ToID       string         `json:"dst_id"`
	Properties map[string]any `json:"properties,omitempty"`
}

// CreateRelationship creates a directed edge between two objects.
func (c *Client) CreateRelationship(ctx context.Context, req CreateRelationshipRequest) (*Relationship, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/relationships", req)
	if err != nil {
		return nil, fmt.Errorf("create relationship: %w", err)
	}
	return decodeJSON[*Relationship](data)
}

// GetRelationship retrieves a relationship by ID.
func (c *Client) GetRelationship(ctx context.Context, id string) (*Relationship, error) {
	data, err := c.do(ctx, http.MethodGet, "/api/graph/relationships/"+id, nil)
	if err != nil {
		return nil, fmt.Errorf("get relationship %s: %w", id, err)
	}
	return decodeJSON[*Relationship](data)
}

// DeleteRelationship soft-deletes a relationship.
func (c *Client) DeleteRelationship(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/graph/relationships/"+id, nil)
	if err != nil {
		return fmt.Errorf("delete relationship %s: %w", id, err)
	}
	return nil
}

// ListRelationshipsOptions configures relationship listing.
type ListRelationshipsOptions struct {
	Type   string
	Cursor string
	Limit  int
}

// ListRelationships lists relationships with optional filters.
func (c *Client) ListRelationships(ctx context.Context, opts ListRelationshipsOptions) (*ListPage[Relationship], error) {
	params := url.Values{}
	if opts.Type != "" {
		params.Set("type", opts.Type)
	}
	if opts.Cursor != "" {
		params.Set("cursor", opts.Cursor)
	}
	if opts.Limit > 0 {
		params.Set("limit", strconv.Itoa(opts.Limit))
	}
	path := "/api/graph/relationships/search"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, fmt.Errorf("list relationships: %w", err)
	}
	return decodeJSON[*ListPage[Relationship]](data)
}

// BulkCreateRelationships creates multiple relationships in a single request.
func (c *Client) BulkCreateRelationships(ctx context.Context, rels []CreateRelationshipRequest) ([]Relationship, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/relationships/bulk", rels)
	if err != nil {
		return nil, fmt.Errorf("bulk create relationships: %w", err)
	}
	return decodeJSON[[]Relationship](data)
}
