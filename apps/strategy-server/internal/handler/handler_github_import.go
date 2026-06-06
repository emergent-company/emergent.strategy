package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// handleGithubImportNew handles POST /github/connect/import — creates a new strategy
// instance in the chosen workspace, links it to the GitHub repo, then imports.
// Called from the connect flow repo list.
func (s *Server) handleGithubImportNew(c echo.Context) error {
	ctx := c.Request().Context()

	if s.syncSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.github_sync_not_configured"))
	}

	// Read form values.
	githubRepo := c.FormValue("github_repo")    // "owner/repo"
	basePath := c.FormValue("github_base_path") // may be empty
	workspaceIDStr := c.FormValue("workspace_id")
	action := c.FormValue("action") // "import" or "link"
	branch := c.FormValue("branch")

	if githubRepo == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.github_repo_required"))
	}
	if workspaceIDStr == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.workspace_id_required"))
	}
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_workspace_id"))
	}

	// Derive a sensible instance name from the repo name.
	parts := strings.SplitN(githubRepo, "/", 2)
	repoName := githubRepo
	if len(parts) == 2 {
		repoName = parts[1]
	}
	instanceName := repoNameToTitle(repoName)

	// Create the instance in the chosen workspace.
	instSvc := instancedom.NewService(s.db)
	inst, err := instSvc.ImportInstance(ctx, instancedom.ImportParams{
		WorkspaceID: workspaceID,
		Name:        instanceName,
		GithubRepo:  &githubRepo,
	})
	if err != nil {
		s.log.Error("create instance for github import", "repo", githubRepo, "err", err)
		return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
	}

	// Set base path if provided.
	if basePath != "" {
		if updateErr := instSvc.UpdateInstanceSettings(ctx, inst.ID, instancedom.UpdateSettingsParams{
			GithubBasePath: &basePath,
		}); updateErr != nil {
			s.log.Warn("set github base path", "err", updateErr)
		}
	}

	// If action is "link only" — done, redirect to the instance.
	if action == "link" {
		return c.Redirect(http.StatusSeeOther, fmt.Sprintf("/strategies/%s", inst.ID))
	}

	// Import artifacts from GitHub.
	_, importErr := s.syncSvc.ImportFromGithub(ctx, syncdom.ImportParams{
		InstanceID: inst.ID,
		Branch:     branch,
	})
	if importErr != nil {
		s.log.Error("import from github", "instance_id", inst.ID, "repo", githubRepo, "err", importErr)
		// Still redirect to the instance — it exists, just empty.
		return c.Redirect(http.StatusSeeOther, fmt.Sprintf("/strategies/%s", inst.ID))
	}

	// Activate the instance.
	_ = web.UserFromContext(ctx) // ensure user context is present
	if activateErr := instSvc.ActivateInstance(ctx, inst.ID); activateErr != nil {
		s.log.Warn("activate instance after import", "err", activateErr)
	}

	return c.Redirect(http.StatusSeeOther, fmt.Sprintf("/strategies/%s", inst.ID))
}

// repoNameToTitle converts a repo slug like "my-strategy-repo" to "My Strategy Repo".
func repoNameToTitle(name string) string {
	name = strings.ReplaceAll(name, "-", " ")
	name = strings.ReplaceAll(name, "_", " ")
	words := strings.Fields(name)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
