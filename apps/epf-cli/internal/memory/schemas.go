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

// ListInstalledSchemas returns schemas installed in the project.
func (c *Client) ListInstalledSchemas(ctx context.Context) ([]InstalledSchema, error) {
	var result []InstalledSchema
	if err := c.do(ctx, "GET", "/api/template-packs/installed", nil, &result); err != nil {
		return nil, fmt.Errorf("list installed schemas: %w", err)
	}
	return result, nil
}

// InstallSchemaFromJSON installs a schema from a JSON pack definition.
// If merge is true, it additively merges types into the project.
func (c *Client) InstallSchemaFromJSON(ctx context.Context, packJSON []byte, merge bool) error {
	endpoint := "/api/template-packs/install"
	if merge {
		endpoint += "?merge=true"
	}
	// Use raw JSON — the pack is already serialized
	var pack json.RawMessage = packJSON
	if err := c.do(ctx, "POST", endpoint, &pack, nil); err != nil {
		return fmt.Errorf("install schema: %w", err)
	}
	return nil
}

// UninstallSchema removes a schema assignment from the project.
func (c *Client) UninstallSchema(ctx context.Context, assignmentID string) error {
	if err := c.do(ctx, "DELETE", "/api/template-packs/installed/"+url.PathEscape(assignmentID), nil, nil); err != nil {
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
	if err := c.do(ctx, "GET", "/api/template-packs/compiled-types", nil, &result); err != nil {
		return nil, fmt.Errorf("get compiled types: %w", err)
	}
	return &result, nil
}
