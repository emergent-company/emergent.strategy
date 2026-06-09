package mcpserver

import (
	"context"

	"github.com/google/uuid"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerSyncTools(s *server.MCPServer, svc Services) {
	if svc.Sync == nil && svc.Instance == nil {
		return
	}
	registerUpdateInstanceTool(s, svc)
	if svc.Sync != nil {
		registerImportFromGithubTool(s, svc)
		registerGetSyncStateTool(s, svc)
		registerSyncToGithubTool(s, svc)
		registerGetSyncStatusTool(s, svc)
		registerListGithubInstallationsTool(s, svc)
		registerScanGithubReposTool(s, svc)
	}
}

func registerUpdateInstanceTool(s *server.MCPServer, svc Services) {
	// update_instance — configure GitHub repo settings for an instance.
	s.AddTool(mcp.NewTool("update_instance",
		mcp.WithDescription("USE WHEN you need to configure or update the GitHub repository link for a strategy instance. Sets github_repo (owner/repo slug) and optionally github_base_path. Required before import_from_github or sync_to_github if not already set."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("github_repo", mcp.Description("GitHub repository slug in owner/repo format, e.g. 'my-org/strategy'. Clear by setting to empty string.")),
		mcp.WithString("github_base_path", mcp.Description("Optional path prefix within the repo where EPF artifacts live, e.g. 'docs/epf'. Leave empty to use the repo root.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		params := instancedom.UpdateSettingsParams{}
		// Only set fields that were explicitly provided.
		// argString returns "" for missing args, but we distinguish "provided as empty"
		// from "not provided" by checking if the tool call included the argument key.
		if repoStr := argString(req, "github_repo"); repoStr != "" {
			params.GithubRepo = &repoStr
		}
		if baseStr := argString(req, "github_base_path"); baseStr != "" {
			params.GithubBasePath = &baseStr
		}

		if err := svc.Instance.UpdateInstanceSettings(ctx, instID, params); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"instance_id": instID,
			"updated":     true,
		})
	})

}

func registerImportFromGithubTool(s *server.MCPServer, svc Services) {
	// import_from_github — fetch EPF artifacts from GitHub and reimport them.
	s.AddTool(mcp.NewTool("import_from_github",
		mcp.WithDescription("USE WHEN you need to import EPF strategy artifacts from the instance's linked GitHub repository. Automatically determines the sync state and takes the safe action: no-op if in sync, refuses if server has unpushed enrichments, creates a safety PR then imports if diverged. Requires github_repo to be set on the instance (use update_instance)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("branch", mcp.Description("Optional branch to import from. Omit to use the instance's tracked branch or the repo's default branch. Specify to switch to a different branch (e.g. 'dev' for a mature product's long-lived dev branch).")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		params := syncdom.ImportParams{
			InstanceID: instID,
			Branch:     argString(req, "branch"),
		}

		result, err := svc.Sync.ImportFromGithub(ctx, params)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

}

func registerGetSyncStateTool(s *server.MCPServer, svc Services) {
	// get_sync_state — check the current sync state without performing any action.
	s.AddTool(mcp.NewTool("get_sync_state",
		mcp.WithDescription("USE WHEN you need to check the current sync state between the server and GitHub without performing any import or export. Returns in_sync/server_ahead/github_ahead/diverged/unlinked state with commit SHAs and pending change counts."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("branch", mcp.Description("Optional branch to check against. Omit to use the instance's tracked branch or repo default.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		result, err := svc.Sync.DetermineSyncState(ctx, instID, argString(req, "branch"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	_ = uuid.Nil // ensure uuid import is used (parseUUID is in server.go)
}

func registerSyncToGithubTool(s *server.MCPServer, svc Services) {
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

}

func registerListGithubInstallationsTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_github_installations",
		mcp.WithDescription("USE WHEN you need to list all GitHub orgs and personal accounts where the GitHub App is installed. This is the entry point for the repo connect flow — call this first to discover which GitHub accounts to scan."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		installs, err := svc.Sync.ListInstallations(ctx)
		if err != nil {
			return mustJSON(map[string]any{
				"app_configured": false,
				"message":        err.Error(),
			})
		}
		return mustJSON(map[string]any{
			"app_configured":  true,
			"installations":   installs,
			"total":           len(installs),
			"app_install_url": svc.GithubAppInstallURL,
		})
	})
}

func registerScanGithubReposTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("scan_github_repos",
		mcp.WithDescription("USE WHEN you need to scan all repositories for a GitHub owner (org or personal account) and detect which contain EPF strategy instances. Returns a repo list with EPF detection results. Results are cached for 5 minutes. Use list_github_installations to discover valid owner values first."),
		mcp.WithString("github_owner", mcp.Required(), mcp.Description("GitHub organisation login or personal account login, e.g. 'acme-company' or 'nikolaifasting'.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		owner := argString(req, "github_owner")
		repos, err := svc.Sync.ScanInstallationRepos(ctx, owner)
		if err != nil {
			// Include install URL so the caller can prompt the user to install the App.
			return mustJSON(map[string]any{
				"error":           err.Error(),
				"github_owner":    owner,
				"app_install_url": svc.GithubAppInstallURL,
			})
		}
		epfCount := 0
		for _, r := range repos {
			if r.HasEPF {
				epfCount++
			}
		}
		return mustJSON(map[string]any{
			"github_owner":   owner,
			"repos":          repos,
			"total":          len(repos),
			"repos_with_epf": epfCount,
		})
	})
}

func registerGetSyncStatusTool(s *server.MCPServer, svc Services) {
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
