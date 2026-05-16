package memory

import (
	"context"
	"fmt"
	"net/http"
)

// CreateBranchRequest is the payload for creating a graph branch.
type CreateBranchRequest struct {
	Name string `json:"name"`
}

// MergeBranchRequest is the payload for merging a branch.
type MergeBranchRequest struct {
	SourceBranchID string `json:"source_branch_id"`
	DryRun         bool   `json:"dry_run,omitempty"`
}

// CreateBranch creates a new graph branch for what-if exploration.
func (c *Client) CreateBranch(ctx context.Context, req CreateBranchRequest) (*Branch, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/branches", req)
	if err != nil {
		return nil, fmt.Errorf("create branch: %w", err)
	}
	return decodeJSON[*Branch](data)
}

// GetBranch retrieves a branch by ID.
func (c *Client) GetBranch(ctx context.Context, id string) (*Branch, error) {
	data, err := c.do(ctx, http.MethodGet, "/api/graph/branches/"+id, nil)
	if err != nil {
		return nil, fmt.Errorf("get branch %s: %w", id, err)
	}
	return decodeJSON[*Branch](data)
}

// ListBranches lists all branches for the current project.
func (c *Client) ListBranches(ctx context.Context) ([]Branch, error) {
	data, err := c.do(ctx, http.MethodGet, "/api/graph/branches", nil)
	if err != nil {
		return nil, fmt.Errorf("list branches: %w", err)
	}
	return decodeJSON[[]Branch](data)
}

// MergeBranch merges a source branch into the target (main graph or another branch).
func (c *Client) MergeBranch(ctx context.Context, branchID string, req MergeBranchRequest) (*MergeResult, error) {
	data, err := c.do(ctx, http.MethodPost, "/api/graph/branches/"+branchID+"/merge", req)
	if err != nil {
		return nil, fmt.Errorf("merge branch %s: %w", branchID, err)
	}
	return decodeJSON[*MergeResult](data)
}

// DeleteBranch deletes a graph branch.
func (c *Client) DeleteBranch(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/graph/branches/"+id, nil)
	if err != nil {
		return fmt.Errorf("delete branch %s: %w", id, err)
	}
	return nil
}
