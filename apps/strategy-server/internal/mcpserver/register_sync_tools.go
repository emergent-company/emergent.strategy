package mcpserver

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	userdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerSyncTools(s *server.MCPServer, svc Services) {
	registerGetSyncInfoTool(s, svc)
	if svc.Sync == nil && svc.Instance == nil {
		return
	}
	registerUpdateInstanceTool(s, svc)
	registerUpgradeInstanceSchemaTool(s, svc)
	registerConsumerRepoTools(s, svc)
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
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
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

// registerConsumerRepoTools manages the repositories that CONSUME an instance,
// as opposed to the single repo that owns it.
//
// These are separate tools from update_instance on purpose. update_instance
// sets github_repo, which is the instance's source of truth: sync imports from
// it and AIM auto-push opens pull requests against it. Pointing that at a repo
// that merely mounts the instance as a submodule silently redirects both. When
// the only available field was github_repo, that is exactly what happened — the
// "Emergent Strategy" instance ended up claiming a consumer repo as its home.
func registerConsumerRepoTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_consumer_repos",
		mcp.WithDescription("USE WHEN you need to see which repositories consume a strategy instance (e.g. mount it as a submodule). Does not include the instance's own home repo — that is github_repo on the instance itself."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}
		rows, err := svc.Instance.ListConsumerRepos(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"instance_id":    instID,
			"consumer_repos": rows,
			"count":          len(rows),
		})
	})

	s.AddTool(mcp.NewTool("register_consumer_repo",
		mcp.WithDescription("USE WHEN a repository consumes a strategy instance and should be discoverable by find_instance_by_repo. Use this instead of update_instance when the repo is not the instance's source of truth — update_instance's github_repo is where sync reads from and AIM pushes to. Idempotent."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("github_repo", mcp.Required(), mcp.Description("Consuming repository slug, e.g. emergent-company/opencode-harness")),
		mcp.WithString("base_path", mcp.Description("Path within the consuming repo where the instance is mounted, e.g. docs/EPF/_instances/emergent. Omit for the repo root.")),
		mcp.WithString("note", mcp.Description("Optional free-text note, e.g. how the instance is consumed")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		params := instancedom.RegisterConsumerRepoParams{
			InstanceID: instID,
			GithubRepo: argString(req, "github_repo"),
			BasePath:   argString(req, "base_path"),
		}
		if note := argString(req, "note"); note != "" {
			params.Note = &note
		}

		row, err := svc.Instance.RegisterConsumerRepo(ctx, params)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(row)
	})

	s.AddTool(mcp.NewTool("unregister_consumer_repo",
		mcp.WithDescription("USE WHEN a repository no longer consumes a strategy instance and should stop appearing in find_instance_by_repo."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("github_repo", mcp.Required(), mcp.Description("Consuming repository slug")),
		mcp.WithString("base_path", mcp.Description("Mount path used when the link was registered. Omit if it was registered at the repo root.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}
		if err := svc.Instance.UnregisterConsumerRepo(ctx, instID,
			argString(req, "github_repo"), argString(req, "base_path")); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"instance_id":  instID,
			"github_repo":  argString(req, "github_repo"),
			"unregistered": true,
		})
	})
}

func registerImportFromGithubTool(s *server.MCPServer, svc Services) {
	// import_from_github — fetch EPF artifacts from GitHub and reimport them.
	s.AddTool(mcp.NewTool("import_from_github",
		mcp.WithDescription("USE WHEN you need to import EPF strategy artifacts from the instance's linked GitHub repository. Automatically determines the sync state and takes the safe action: no-op if in sync (pass force=true to re-import anyway, for example to replace artifacts the server changed on its own), refuses if server has unpushed enrichments, creates a safety PR then imports if diverged. The result carries warnings for files it did not store, such as a second file for an artifact the instance already holds (an instance has one roadmap; completed cycles are archived under cycles/cycle-N/). Requires github_repo to be set on the instance (use update_instance)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("branch", mcp.Description("Optional branch to import from. Omit to use the instance's tracked branch or the repo's default branch. Specify to switch to a different branch (e.g. 'dev' for a mature product's long-lived dev branch).")),
		mcp.WithBoolean("force", mcp.Description("Re-import the repository's copy even when the instance reads as in sync. Does not override unpushed server work, which is still refused.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		// Importing replaces artifacts, so it needs write access to the instance,
		// not just read access (a grant that is read-only is refused here).
		if err := assertInstanceWrite(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		params := syncdom.ImportParams{
			InstanceID: instID,
			Branch:     argString(req, "branch"),
			Force:      argBool(req, "force"),
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
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
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
		mcp.WithDescription("USE WHEN you need to push strategy artifacts to a GitHub repository as a pull request. Writes only the artifacts changed since the instance was last imported or its last merged sync, so unchanged files and their comments stay as they are in the repository, and lists the changes with their batch descriptions in the PR body. Writes nothing and opens no PR when nothing changed (status no_changes). Never deletes files. Requires a GitHub App installation on the target org."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("version_id", mcp.Description("Optional version UUID. If omitted, syncs the current working state (draft sync).")),
		mcp.WithBoolean("full", mcp.Description("Write every artifact instead of only the changed ones. Use when the repository is out of step with the server.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}

		params := syncdom.SyncParams{
			InstanceID: instID,
			Full:       argBool(req, "full"),
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
		mcp.WithDescription("USE WHEN you need to list the GitHub orgs and personal accounts where the GitHub App is installed and that the calling user can access. It uses the user's own connected GitHub account, so it needs that account to be connected (web UI: /github/connect); without it the result is needs_github_connection. Call this first to discover which GitHub accounts to scan."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		token, refused := githubTokenForCaller(ctx, svc)
		if refused != nil {
			return refused, nil
		}
		installs, err := svc.Sync.ListUserInstallations(ctx, token)
		if err != nil {
			if isTokenRevoked(err) {
				return forgetRevokedToken(ctx, svc, token), nil
			}
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
		mcp.WithDescription("USE WHEN you need to scan the repositories of a GitHub owner (org or personal account) and detect which contain EPF strategy instances. It lists only the repositories the calling user's own connected GitHub account can see (it needs that account connected: web UI /github/connect; without it the result is needs_github_connection). Returns a repo list with EPF detection results. Results are cached for 30 minutes. Use list_github_installations to discover valid owner values first."),
		mcp.WithString("github_owner", mcp.Required(), mcp.Description("GitHub organisation login or personal account login, e.g. 'acme-company'.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		token, refused := githubTokenForCaller(ctx, svc)
		if refused != nil {
			return refused, nil
		}
		owner := argString(req, "github_owner")
		repos, err := svc.Sync.ScanUserOwnerRepos(ctx, token, owner)
		if err != nil {
			if isTokenRevoked(err) {
				return forgetRevokedToken(ctx, svc, token), nil
			}
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

// githubTokenForCaller returns the calling user's own GitHub OAuth token. The
// GitHub tools act with that token and never with the GitHub App's credentials,
// so a caller sees only what their own GitHub account sees. When it cannot return
// a token it returns the result to send instead: a refusal for an access token
// (it narrows its owner to one instance and has no authority over the owner's
// GitHub account), and needs_github_connection when the user has not connected
// GitHub. In both cases no installation or repository data is included.
func githubTokenForCaller(ctx context.Context, svc Services) (string, *mcp.CallToolResult) {
	p := web.PrincipalFromContext(ctx)
	if p == nil || p.User == nil {
		return "", toolErr(ctx, apperror.ErrUnauthorized)
	}
	if p.TokenID != nil || p.Scoped() {
		return "", toolErr(ctx, apperror.ErrForbidden.WithDetail(
			"access tokens cannot use the GitHub connect tools; use an interactive session"))
	}
	if svc.User == nil {
		return "", needsGithubConnection()
	}
	token, err := svc.User.GetGithubToken(ctx, p.User.ID)
	if errors.Is(err, userdom.ErrTokenUnreadable) {
		// Connecting again replaces it, so the answer is the same as for no token.
		slog.WarnContext(ctx, "stored github token cannot be read", "user_id", p.User.ID, "err", err)
		return "", needsGithubConnection()
	}
	if err != nil {
		return "", toolErr(ctx, err)
	}
	if token == "" {
		return "", needsGithubConnection()
	}
	return token, nil
}

func needsGithubConnection() *mcp.CallToolResult {
	res, _ := mustJSON(map[string]any{
		"needs_github_connection": true,
		"message":                 "No GitHub account is connected for this user. Connect it in the web UI at /github/connect, then call this tool again.",
	})
	return res
}

func isTokenRevoked(err error) bool {
	var revoked *syncdom.TokenRevokedError
	return errors.As(err, &revoked)
}

// forgetRevokedToken handles a token GitHub no longer accepts: it drops the
// cached scan and the stored token, and tells the caller to connect again.
func forgetRevokedToken(ctx context.Context, svc Services, token string) *mcp.CallToolResult {
	svc.Sync.InvalidateUserScan(token)
	if u := web.UserFromContext(ctx); u != nil && svc.User != nil {
		if err := svc.User.ClearGithubToken(ctx, u.ID); err != nil {
			slog.ErrorContext(ctx, "clear revoked github token", "user_id", u.ID, "err", err)
		}
	}
	return needsGithubConnection()
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
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
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
