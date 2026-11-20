package mcpserver

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// syncToolNames are the tools that exist only when the GitHub App is configured.
var syncToolNames = []string{
	"import_from_github", "get_sync_state", "sync_to_github",
	"list_github_installations", "scan_github_repos", "get_sync_status",
}

// githubSyncAvailability is what the server knows about GitHub sync. A server
// wired without a recorded state is read from the service it has: with a Sync
// service it is enabled, without one it is disabled.
func githubSyncAvailability(svc Services) syncdom.Availability {
	a := svc.GithubSync
	if a.State != "" {
		return a
	}
	if svc.Sync != nil {
		a.State = syncdom.AvailabilityEnabled
		return a
	}
	a.State = syncdom.AvailabilityDisabled
	a.Reason = "GitHub sync is not configured on this server (the GitHub App settings are missing)"
	return a
}

// importRoutes lists the ways to bring an instance's artifacts in, and which of
// them work on this server.
func importRoutes(svc Services) []string {
	routes := []string{"CLI: `strategy-server import --instance-path <dir> --workspace <owner>` (always available; add --dry-run to preview)"}
	if svc.Sync != nil {
		return append(routes, "MCP import_from_github: available")
	}
	return append(routes, "MCP import_from_github: not available (the GitHub App is not configured; see get_sync_info)")
}

// githubSyncHealth is the github_sync block of health_check and get_sync_info.
func githubSyncHealth(svc Services) map[string]any {
	a := githubSyncAvailability(svc)
	block := map[string]any{
		"state":                 a.State,
		"sync_tools_registered": svc.Sync != nil,
		"import_routes":         importRoutes(svc),
	}
	if a.Reason != "" {
		block["reason"] = a.Reason
	}
	if !a.CheckedAt.IsZero() {
		block["checked_at"] = a.CheckedAt
	}
	return block
}

// instanceWithSync is get_instance's answer: the instance, and whether GitHub
// sync can be used on this server.
type instanceWithSync struct {
	*domain.StrategyInstance
	GithubSyncAvailable bool   `json:"github_sync_available"`
	GithubSyncState     string `json:"github_sync_state"`
	GithubSyncReason    string `json:"github_sync_reason,omitempty"`
}

func withGithubSync(inst *domain.StrategyInstance, svc Services) instanceWithSync {
	a := githubSyncAvailability(svc)
	return instanceWithSync{
		StrategyInstance:    inst,
		GithubSyncAvailable: a.State != syncdom.AvailabilityDisabled,
		GithubSyncState:     a.State,
		GithubSyncReason:    a.Reason,
	}
}

// registerGetSyncInfoTool registers get_sync_info, which answers on every server:
// the sync tools exist only when the GitHub App is configured, and a client that
// looks for one on a server without it would otherwise get "Unknown tool" and
// nothing to act on.
func registerGetSyncInfoTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("get_sync_info",
		mcp.WithDescription("USE WHEN a GitHub sync tool is missing or fails, or before you plan to sync or import through GitHub. Says whether GitHub sync works on this server (enabled, disabled or degraded), why when it does not, which tools are affected, and what to use instead."),
	), func(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		block := githubSyncHealth(svc)
		if svc.Sync == nil {
			block["unavailable_tools"] = syncToolNames
			block["alternatives"] = []string{
				"Bring artifacts in: CLI `strategy-server import --instance-path <dir> --workspace <owner>` (add --dry-run to preview what it would change).",
				"Get artifacts out: export_instance_yaml returns the instance as EPF YAML.",
				"To enable GitHub sync, an operator sets GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH (or GITHUB_APP_PRIVATE_KEY) and restarts the server.",
			}
		} else if githubSyncAvailability(svc).State == syncdom.AvailabilityDegraded {
			block["unavailable_tools"] = []string{}
			block["alternatives"] = []string{
				"The tools are registered but may fail until the reason above is fixed. export_instance_yaml returns the instance as EPF YAML in the meantime.",
			}
		} else {
			block["unavailable_tools"] = []string{}
		}
		return mustJSON(block)
	})
}
