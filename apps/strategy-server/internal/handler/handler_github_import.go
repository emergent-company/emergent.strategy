package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	domain "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// handleGithubImportNew handles POST /github/connect/import — creates a new strategy
// instance in the chosen workspace, links it to the GitHub repo, then imports.
// Called from the connect flow repo list.
func (s *Server) handleGithubImportNew(c echo.Context) error {
	ctx := c.Request().Context()

	if s.syncSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.github_sync_not_configured"))
	}

	// Get the user's GitHub OAuth token — required for user-initiated imports.
	user := web.UserFromContext(ctx)
	githubToken := s.loadUserGithubToken(ctx, user.ID)
	if githubToken == "" {
		return c.String(http.StatusUnauthorized, langs.T(ctx, "error.github_not_connected"))
	}

	// Read form values.
	githubRepo := c.FormValue("github_repo")      // "owner/repo"
	basePath := c.FormValue("github_base_path")   // may be empty
	workspaceIDStr := c.FormValue("workspace_id") // empty when creating a new workspace inline
	newWorkspaceName := strings.TrimSpace(c.FormValue("new_workspace_name"))
	action := c.FormValue("action") // "import" or "link"
	branch := c.FormValue("branch")

	if githubRepo == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.github_repo_required"))
	}

	// Derive repo owner and name.
	parts := strings.SplitN(githubRepo, "/", 2)
	repoOwner, repoName := "", githubRepo
	if len(parts) == 2 {
		repoOwner, repoName = parts[0], parts[1]
	}
	instanceName := repoNameToTitle(repoName)

	// Decide where the import may write. This is the tenant boundary of the
	// connect flow: the workspace must belong to an organisation the caller
	// administers, an inline workspace is always a new organisation, and an
	// instance of another organisation is never reused or moved.
	target, err := s.resolveImportTarget(ctx, importTargetRequest{
		WorkspaceID:  workspaceIDStr,
		NewName:      newWorkspaceName,
		GithubRepo:   githubRepo,
		BasePath:     basePath,
		RepoOwner:    repoOwner,
		InstanceName: instanceName,
	})
	if err != nil {
		return s.importRefusal(c, err)
	}

	instSvc := instancedom.NewService(s.db)
	var inst *domain.StrategyInstance
	if target.Existing != nil {
		// Reuse the instance already linked to this repository, so a re-import or
		// relink does not create a duplicate.
		if target.NeedsMove {
			if moveErr := instSvc.MoveInstance(ctx, target.Existing.ID, target.WorkspaceID); moveErr != nil {
				s.log.Error("move existing instance to new workspace", "instance_id", target.Existing.ID, "err", moveErr)
				return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
			}
		}
		inst = target.Existing
	} else {
		var createErr error
		inst, createErr = instSvc.ImportInstance(ctx, instancedom.ImportParams{
			WorkspaceID: target.WorkspaceID,
			Name:        instanceName,
			GithubRepo:  &githubRepo,
		})
		if createErr != nil {
			s.log.Error("create instance for github import", "repo", githubRepo, "err", createErr)
			return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
		}
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

	// Import artifacts from GitHub using the user's OAuth token.
	// This works without the GitHub App being installed on the target org.
	_, importErr := s.syncSvc.ImportFromGithubWithUserToken(ctx, inst.ID, branch, githubToken)
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

// importRefusal answers a refused import with the status of the app error and a
// message that says nothing about other tenants' data.
func (s *Server) importRefusal(c echo.Context, err error) error {
	ctx := c.Request().Context()
	ae := apperror.AsAppError(err)
	if ae == nil {
		s.log.Error("resolve github import target", "err", err)
		return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
	}
	switch ae.HTTPStatus {
	case http.StatusNotFound:
		return c.String(http.StatusNotFound, langs.T(ctx, "error.not_found"))
	case http.StatusForbidden:
		return c.String(http.StatusForbidden, langs.T(ctx, "error.github_import_forbidden"))
	case http.StatusConflict:
		return c.String(http.StatusConflict, langs.T(ctx, "error.github_import_conflict"))
	case http.StatusBadRequest:
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_workspace_id"))
	}
	s.log.Error("resolve github import target", "err", err)
	return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
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
