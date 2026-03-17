package memory

import (
	"context"
	"net/url"
)

// CreateBranch creates a new graph branch for scenario exploration.
func (c *Client) CreateBranch(ctx context.Context, req CreateBranchRequest) (*Branch, error) {
	var branch Branch
	if err := c.do(ctx, "POST", "/api/graph/branches", req, &branch); err != nil {
		return nil, err
	}
	return &branch, nil
}

// GetBranch retrieves a branch by ID.
func (c *Client) GetBranch(ctx context.Context, id string) (*Branch, error) {
	var branch Branch
	if err := c.do(ctx, "GET", "/api/graph/branches/"+id, nil, &branch); err != nil {
		return nil, err
	}
	return &branch, nil
}

// ListBranches lists all branches, optionally filtered by project.
func (c *Client) ListBranches(ctx context.Context) ([]Branch, error) {
	params := url.Values{}
	params.Set("project_id", c.projectID)

	var branches []Branch
	if err := c.doWithQuery(ctx, "/api/graph/branches", params, &branches); err != nil {
		return nil, err
	}
	return branches, nil
}

// MergeBranch merges a source branch into a target branch.
// Set dryRun to true to preview the merge without applying.
func (c *Client) MergeBranch(ctx context.Context, targetBranchID string, sourceBranchID string, dryRun bool) error {
	req := MergeBranchRequest{
		SourceBranchID: sourceBranchID,
		DryRun:         dryRun,
	}
	return c.do(ctx, "POST", "/api/graph/branches/"+targetBranchID+"/merge", req, nil)
}

// DeleteBranch deletes a branch.
func (c *Client) DeleteBranch(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/graph/branches/"+id, nil, nil)
}
