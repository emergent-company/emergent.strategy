package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// InstalledSchema represents a schema installed in a Memory project.
type InstalledSchema struct {
	ID          string `json:"id"`
	SchemaID    string `json:"schemaId"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Active      bool   `json:"active"`
	InstalledAt string `json:"installedAt"`
}

// SchemaInfo represents a schema in the org registry.
type SchemaInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Author  string `json:"author"`
}

// schemasProjectPath returns the project-scoped schema API base path.
func (c *Client) schemasProjectPath() string {
	return "/api/schemas/projects/" + url.PathEscape(c.projectID)
}

// ListInstalledSchemas returns schemas installed in the project.
func (c *Client) ListInstalledSchemas(ctx context.Context) ([]InstalledSchema, error) {
	var result []InstalledSchema
	if err := c.do(ctx, "GET", c.schemasProjectPath()+"/installed", nil, &result); err != nil {
		return nil, fmt.Errorf("list installed schemas: %w", err)
	}
	return result, nil
}

// InstallSchemaFromJSON installs a schema from a JSON pack definition.
// If merge is true, it additively merges types into the project.
//
// This is a two-step process:
//  1. Create the schema in the org registry via POST /api/schemas
//  2. Assign it to the project via POST /api/schemas/projects/{pid}/assign
func (c *Client) InstallSchemaFromJSON(ctx context.Context, packJSON []byte, merge bool) error {
	// Step 1: Create the schema in the org registry.
	var pack json.RawMessage = packJSON
	var created SchemaInfo
	if err := c.do(ctx, "POST", "/api/schemas", &pack, &created); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	if created.ID == "" {
		return fmt.Errorf("create schema: API returned empty schema ID")
	}

	// Step 2: Assign the schema to the project.
	assignBody := map[string]any{
		"schema_id": created.ID,
	}
	endpoint := c.schemasProjectPath() + "/assign"
	if merge {
		endpoint += "?merge=true"
	}
	if err := c.do(ctx, "POST", endpoint, assignBody, nil); err != nil {
		return fmt.Errorf("assign schema %s to project: %w", created.ID, err)
	}

	return nil
}

// UninstallSchema removes a schema assignment from the project.
func (c *Client) UninstallSchema(ctx context.Context, assignmentID string) error {
	if err := c.do(ctx, "DELETE", c.schemasProjectPath()+"/assignments/"+url.PathEscape(assignmentID), nil, nil); err != nil {
		return fmt.Errorf("uninstall schema: %w", err)
	}
	return nil
}

// CompiledTypes returns the merged type registry from all installed schemas.
type CompiledTypes struct {
	ObjectTypes       []CompiledObjectType       `json:"objectTypes"`
	RelationshipTypes []CompiledRelationshipType `json:"relationshipTypes"`
}

// CompiledObjectType is an object type from the compiled type registry.
type CompiledObjectType struct {
	Name       string `json:"name"`
	SchemaID   string `json:"schemaId"`
	SchemaName string `json:"schemaName"`
}

// CompiledRelationshipType is a relationship type from the compiled type registry.
type CompiledRelationshipType struct {
	Name       string `json:"name"`
	SchemaID   string `json:"schemaId"`
	SchemaName string `json:"schemaName"`
}

// GetCompiledTypes returns the merged type registry for the project.
func (c *Client) GetCompiledTypes(ctx context.Context) (*CompiledTypes, error) {
	var result CompiledTypes
	if err := c.do(ctx, "GET", c.schemasProjectPath()+"/compiled-types", nil, &result); err != nil {
		return nil, fmt.Errorf("get compiled types: %w", err)
	}
	return &result, nil
}
