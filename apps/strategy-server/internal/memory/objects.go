package memory

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// CreateObjectRequest is the payload for creating a graph object.
type CreateObjectRequest struct {
	Type       string         `json:"type"`
	Key        string         `json:"key,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// UpsertObjectRequest creates or updates an object by (type, key).
type UpsertObjectRequest struct {
	Type       string         `json:"type"`
	Key        string         `json:"key"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// UpdateObjectRequest is the payload for patching an existing object.
type UpdateObjectRequest struct {
	Properties map[string]any `json:"properties,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
}

// CreateObject creates a single object in the graph.
func (c *Client) CreateObject(ctx context.Context, req CreateObjectRequest) (*Object, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/objects", req)
	if err != nil {
		return nil, fmt.Errorf("create object: %w", err)
	}
	return decodeJSON[*Object](data)
}

// UpsertObject creates or updates an object by (type, key).
func (c *Client) UpsertObject(ctx context.Context, req UpsertObjectRequest) (*Object, error) {
	data, err := c.do(ctx, http.MethodPut, "/api/graph/objects/upsert", req)
	if err != nil {
		return nil, fmt.Errorf("upsert object: %w", err)
	}
	return decodeJSON[*Object](data)
}

// GetObject retrieves an object by ID.
func (c *Client) GetObject(ctx context.Context, id string) (*Object, error) {
	data, err := c.do(ctx, http.MethodGet, "/api/graph/objects/"+id, nil)
	if err != nil {
		return nil, fmt.Errorf("get object %s: %w", id, err)
	}
	return decodeJSON[*Object](data)
}

// UpdateObject patches an existing object, creating a new version.
func (c *Client) UpdateObject(ctx context.Context, id string, req UpdateObjectRequest) (*Object, error) {
	data, err := c.do(ctx, http.MethodPatch, "/api/graph/objects/"+id, req)
	if err != nil {
		return nil, fmt.Errorf("update object %s: %w", id, err)
	}
	return decodeJSON[*Object](data)
}

// DeleteObject soft-deletes an object.
func (c *Client) DeleteObject(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/graph/objects/"+id, nil)
	if err != nil {
		return fmt.Errorf("delete object %s: %w", id, err)
	}
	return nil
}

// ObjectEdges returns the incoming and outgoing edges for an object.
func (c *Client) ObjectEdges(ctx context.Context, id string) (*Edges, error) {
	data, err := c.do(ctx, http.MethodGet, "/api/graph/objects/"+id+"/edges", nil)
	if err != nil {
		return nil, fmt.Errorf("object edges %s: %w", id, err)
	}
	return decodeJSON[*Edges](data)
}

// ListObjectsOptions configures object listing.
type ListObjectsOptions struct {
	Type   string
	Key    string
	Status string
	Cursor string
	Limit  int
}

// ListObjects lists objects with optional filters and cursor pagination.
func (c *Client) ListObjects(ctx context.Context, opts ListObjectsOptions) (*ListPage[Object], error) {
	params := url.Values{}
	if opts.Type != "" {
		params.Set("type", opts.Type)
	}
	if opts.Key != "" {
		params.Set("key", opts.Key)
	}
	if opts.Status != "" {
		params.Set("status", opts.Status)
	}
	if opts.Cursor != "" {
		params.Set("cursor", opts.Cursor)
	}
	if opts.Limit > 0 {
		params.Set("limit", strconv.Itoa(opts.Limit))
	}
	path := "/api/graph/objects/search"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, fmt.Errorf("list objects: %w", err)
	}
	return decodeJSON[*ListPage[Object]](data)
}

// GetObjectByKey looks up a single object by its exact key.
// Returns nil, nil if no object with that key exists.
func (c *Client) GetObjectByKey(ctx context.Context, key string) (*Object, error) {
	page, err := c.ListObjects(ctx, ListObjectsOptions{
		Key:   key,
		Limit: 1,
	})
	if err != nil {
		return nil, fmt.Errorf("get object by key %q: %w", key, err)
	}
	if len(page.Items) == 0 {
		return nil, nil
	}
	return &page.Items[0], nil
}

// BulkCreateObjects creates multiple objects in a single request.
func (c *Client) BulkCreateObjects(ctx context.Context, objects []CreateObjectRequest) ([]Object, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/objects/bulk", objects)
	if err != nil {
		return nil, fmt.Errorf("bulk create objects: %w", err)
	}
	return decodeJSON[[]Object](data)
}

// CountArtifactObjects returns the total number of artifact-layer graph objects
// in the project. Used as a quick health signal on the settings page.
func (c *Client) CountArtifactObjects(ctx context.Context) (int, error) {
	params := url.Values{}
	params.Set("limit", "1")
	params.Set("label", "layer:artifact")
	path := "/api/graph/objects/search?" + params.Encode()
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return 0, fmt.Errorf("count artifact objects: %w", err)
	}
	page, err := decodeJSON[*ListPage[Object]](data)
	if err != nil {
		return 0, err
	}
	return page.Total, nil
}
