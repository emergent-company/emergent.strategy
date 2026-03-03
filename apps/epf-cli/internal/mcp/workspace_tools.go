// Workspace discovery MCP tool handler.
//
// Provides the epf_list_workspaces tool that enables AI agents to discover
// EPF instances accessible to the authenticated user in multi-tenant mode.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/workspace"
	mcpgo "github.com/mark3labs/mcp-go/mcp"
)

// SetDiscoverer configures workspace discovery on the server.
// Call this after creating the server when running in multi-tenant mode.
func (s *Server) SetDiscoverer(d *workspace.Discoverer) {
	s.discoverer = d
}

// GetDiscoverer returns the configured workspace discoverer (for testing/wiring).
func (s *Server) GetDiscoverer() *workspace.Discoverer {
	return s.discoverer
}

// handleListWorkspaces handles the epf_list_workspaces tool.
//
// In multi-tenant mode, it extracts the authenticated user from the request
// context, retrieves their OAuth token, and discovers EPF workspaces from
// their accessible GitHub repos.
//
// In local/single-tenant mode, it returns an error explaining the tool
// is only available in multi-tenant mode.
func (s *Server) handleListWorkspaces(ctx context.Context, request mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
	// Anti-loop check.
	if warning := s.checkToolCallLoop("epf_list_workspaces", nil); warning != nil {
		data, _ := json.Marshal(warning)
		return mcpgo.NewToolResultText(string(data)), nil
	}

	// This tool only works in multi-tenant mode.
	if s.serverMode != auth.ModeMultiTenant {
		return mcpgo.NewToolResultError(
			"epf_list_workspaces is only available in multi-tenant mode. " +
				"In local mode, use epf_locate_instance to find EPF instances on the filesystem."), nil
	}

	if s.discoverer == nil {
		return mcpgo.NewToolResultError("workspace discoverer not configured"), nil
	}
	if s.sessionManager == nil {
		return mcpgo.NewToolResultError("session manager not configured"), nil
	}

	// Extract authenticated user from context.
	user := auth.UserFromContext(ctx)
	if user == nil {
		return mcpgo.NewToolResultError("authentication required: no user in context"), nil
	}

	// Get the user's OAuth token.
	token, ok := s.sessionManager.GetAccessToken(user.SessionID)
	if !ok || token == "" {
		return mcpgo.NewToolResultError("session expired or invalid — re-authenticate via /auth/github/login"), nil
	}

	// Discover workspaces.
	workspaces, err := s.discoverer.Discover(user.UserID, token)
	if err != nil {
		return mcpgo.NewToolResultError(fmt.Sprintf("workspace discovery failed: %v", err)), nil
	}

	// Ensure empty slice for consistent JSON.
	if workspaces == nil {
		workspaces = []workspace.Workspace{}
	}

	result := map[string]interface{}{
		"workspaces": workspaces,
		"count":      len(workspaces),
		"user":       user.Username,
		"usage_hint": "Use the instance_path value from a workspace as the instance_path parameter in other EPF tools (e.g., epf_health_check, epf_get_product_vision).",
	}

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return mcpgo.NewToolResultError(fmt.Sprintf("marshal result: %v", err)), nil
	}

	return mcpgo.NewToolResultText(string(data)), nil
}
