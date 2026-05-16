package mcpserver

import (
	"context"

	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerSyncTools(s *server.MCPServer, svc Services) {
	if svc.Sync == nil {
		return
	}

	// sync_to_github — export current or versioned state and create a PR.
	s.AddTool(mcp.NewTool("sync_to_github",
		mcp.WithDescription("USE WHEN you need to push strategy artifacts to a GitHub repository as a pull request. Exports all artifacts as YAML files and creates a PR for review. Requires a GitHub App installation on the target org."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("version_id", mcp.Description("Optional version UUID. If omitted, syncs the current working state (draft sync).")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		params := syncdom.SyncParams{
			InstanceID: instID,
		}
		if verStr := argString(req, "version_id"); verStr != "" {
			verID, err := parseUUID(verStr)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			params.VersionID = &verID
		}

		result, err := svc.Sync.SyncToGithub(ctx, params)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	// get_sync_status — show last sync status, open PRs, sync history for an instance.
	s.AddTool(mcp.NewTool("get_sync_status",
		mcp.WithDescription("USE WHEN you need to check the GitHub sync status for a strategy instance — shows sync history, open PRs, and last sync result."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		logs, err := svc.Sync.GetSyncHistory(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"instance_id":  instID,
			"sync_history": logs,
			"total_syncs":  len(logs),
			"configured":   svc.Sync.IsConfigured(),
		})
	})
}
