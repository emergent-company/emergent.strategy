package memory

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
)

// CreateObject creates a new graph object.
func (c *Client) CreateObject(ctx context.Context, req CreateObjectRequest) (*Object, error) {
	var obj Object
	if err := c.do(ctx, "POST", "/api/graph/objects", req, &obj); err != nil {
		return nil, err
	}
	return &obj, nil
}

// UpsertObject creates or updates a graph object by (type, key) combination.
// If an object with the same type and key exists, it is updated; otherwise created.
func (c *Client) UpsertObject(ctx context.Context, req UpsertObjectRequest) (*Object, error) {
	var obj Object
	if err := c.do(ctx, "PUT", "/api/graph/objects/upsert", req, &obj); err != nil {
		return nil, err
	}
	return &obj, nil
}

// GetObject retrieves a graph object by ID.
func (c *Client) GetObject(ctx context.Context, id string) (*Object, error) {
	var obj Object
	if err := c.do(ctx, "GET", "/api/graph/objects/"+id, nil, &obj); err != nil {
		return nil, err
	}
	return &obj, nil
}

// UpdateObject updates an object's properties (creates a new version).
func (c *Client) UpdateObject(ctx context.Context, id string, req UpdateObjectRequest) (*Object, error) {
	var obj Object
	if err := c.do(ctx, "PATCH", "/api/graph/objects/"+id, req, &obj); err != nil {
		return nil, err
	}
	return &obj, nil
}

// DeleteObject soft-deletes a graph object.
func (c *Client) DeleteObject(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/graph/objects/"+id, nil, nil)
}

// ListObjects lists graph objects with optional filters.
func (c *Client) ListObjects(ctx context.Context, opts ListOptions) ([]Object, error) {
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
	if opts.Status != "" {
		params.Set("status", opts.Status)
	}

	var objects []Object
	if err := c.doWithQuery(ctx, "/api/graph/objects/search", params, &objects); err != nil {
		return nil, err
	}
	return objects, nil
}

// BulkCreateObjects creates multiple objects in a single API call.
func (c *Client) BulkCreateObjects(ctx context.Context, objects []CreateObjectRequest) ([]Object, error) {
	var result []Object
	if err := c.do(ctx, "POST", "/api/graph/objects/bulk", objects, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ObjectEdges returns the incoming and outgoing relationships for an object.
func (c *Client) ObjectEdges(ctx context.Context, id string) (*Edges, error) {
	var edges Edges
	if err := c.do(ctx, "GET", "/api/graph/objects/"+id+"/edges", nil, &edges); err != nil {
		return nil, err
	}
	return &edges, nil
}

// FindSimilar finds objects similar to the given object using vector similarity.
func (c *Client) FindSimilar(ctx context.Context, id string, opts SimilarOptions) ([]SimilarResult, error) {
	params := url.Values{}
	if opts.Limit > 0 {
		params.Set("limit", strconv.Itoa(opts.Limit))
	}
	if opts.MinScore > 0 {
		params.Set("minScore", fmt.Sprintf("%.2f", opts.MinScore))
	}
	if opts.Type != "" {
		params.Set("type", opts.Type)
	}

	var results []SimilarResult
	if err := c.doWithQuery(ctx, "/api/graph/objects/"+id+"/similar", params, &results); err != nil {
		return nil, err
	}
	return results, nil
}

// ObjectHistory returns the version history for an object.
func (c *Client) ObjectHistory(ctx context.Context, id string) ([]Object, error) {
	var history []Object
	if err := c.do(ctx, "GET", "/api/graph/objects/"+id+"/history", nil, &history); err != nil {
		return nil, err
	}
	return history, nil
}

// RestoreObject restores a soft-deleted object.
func (c *Client) RestoreObject(ctx context.Context, id string) (*Object, error) {
	var obj Object
	if err := c.do(ctx, "POST", "/api/graph/objects/"+id+"/restore", nil, &obj); err != nil {
		return nil, err
	}
	return &obj, nil
}
