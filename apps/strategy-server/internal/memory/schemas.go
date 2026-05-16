package memory

import (
	"context"
	"fmt"
	"net/http"
)

// ListInstalledSchemas returns the schemas installed in the current project.
func (c *Client) ListInstalledSchemas(ctx context.Context) ([]InstalledSchema, error) {
	path := fmt.Sprintf("/api/template-packs/projects/%s/installed", c.cfg.ProjectID)
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, fmt.Errorf("list installed schemas: %w", err)
	}
	return decodeJSON[[]InstalledSchema](data)
}

// InstallSchemaRequest is the payload for creating a schema in the org registry.
type InstallSchemaRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Version     string `json:"version,omitempty"`
	Schema      any    `json:"schema"` // the full schema definition
}

// InstallSchema creates a schema in the org registry and assigns it to the project.
// This is a two-step operation: create in registry, then assign to project.
func (c *Client) InstallSchema(ctx context.Context, req InstallSchemaRequest) error {
	// Step 1: Create schema in org registry.
	data, err := c.do(ctx, http.MethodPost, "/api/template-packs", req)
	if err != nil {
		return fmt.Errorf("create schema in registry: %w", err)
	}

	// Extract the schema ID from the response.
	created, err := decodeJSON[map[string]any](data)
	if err != nil {
		return fmt.Errorf("decode schema creation response: %w", err)
	}
	schemaID, ok := created["id"].(string)
	if !ok {
		return fmt.Errorf("schema creation response missing id")
	}

	// Step 2: Assign to project with merge=true.
	assignPath := fmt.Sprintf("/api/template-packs/projects/%s/assign?merge=true", c.cfg.ProjectID)
	assignReq := map[string]string{"template_pack_id": schemaID}
	_, err = c.do(ctx, http.MethodPost, assignPath, assignReq)
	if err != nil {
		return fmt.Errorf("assign schema to project: %w", err)
	}

	return nil
}

// UninstallSchema removes a schema assignment from the project.
func (c *Client) UninstallSchema(ctx context.Context, assignmentID string) error {
	path := fmt.Sprintf("/api/template-packs/projects/%s/assignments/%s", c.cfg.ProjectID, assignmentID)
	_, err := c.do(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return fmt.Errorf("uninstall schema %s: %w", assignmentID, err)
	}
	return nil
}

// GetEmbeddingProgress returns the status of the embedding queue.
func (c *Client) GetEmbeddingProgress(ctx context.Context) (*EmbeddingProgress, error) {
	data, err := c.do(ctx, http.MethodGet, "/api/embeddings/progress", nil)
	if err != nil {
		return nil, fmt.Errorf("get embedding progress: %w", err)
	}
	return decodeJSON[*EmbeddingProgress](data)
}
