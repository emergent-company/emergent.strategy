package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	workspacedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	domain "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
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

	// Resolve workspace ID — either from the picker or by creating one inline.
	// "__new__" = create a new workspace inline.
	// "__existing__" = re-import into the existing instance's workspace (GetByGithubRepo will find it).
	if workspaceIDStr == "__new__" {
		workspaceIDStr = ""
	}
	if workspaceIDStr == "__existing__" {
		workspaceIDStr = ""
	}

	var workspaceID uuid.UUID
	if workspaceIDStr != "" {
		var err error
		workspaceID, err = uuid.Parse(workspaceIDStr)
		if err != nil {
			return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_workspace_id"))
		}
	} else {
		// No existing workspaces — create an org + workspace on the fly.
		if newWorkspaceName == "" {
			newWorkspaceName = repoNameToTitle(repoOwner)
			if newWorkspaceName == "" {
				newWorkspaceName = instanceName
			}
		}
		user := web.UserFromContext(ctx)
		actorID := audit.ActorFromContext(ctx)

		orgSvc := orgdom.NewService(s.db)
		callerID := uuid.Nil
		if actorID != nil {
			callerID = *actorID
		}
		newOrg, orgErr := orgSvc.GetOrCreate(ctx, newWorkspaceName, callerID)
		if orgErr != nil {
			s.log.Error("create org for github import", "name", newWorkspaceName, "err", orgErr)
			return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
		}
		// Ensure the user is a member of the new org.
		_, _ = orgSvc.AddMember(ctx, newOrg.ID, user.ID, "owner")

		wsSvc := workspacedom.NewService(s.db)
		wsName := newWorkspaceName
		ws, wsErr := wsSvc.CreateWorkspace(ctx, repoOwner, &wsName, newOrg.ID)
		if wsErr != nil {
			// Workspace may already exist for this github_owner — look it up.
			ws, wsErr = wsSvc.GetWorkspaceByOwner(ctx, repoOwner)
			if wsErr != nil {
				s.log.Error("create workspace for github import", "owner", repoOwner, "err", wsErr)
				return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
			}
		}
		workspaceID = ws.ID
	}

	instSvc := instancedom.NewService(s.db)

	// Check for an existing instance already linked to this repo+path.
	// If found, reuse it — move it to the chosen workspace if different,
	// update settings, and proceed. This prevents duplicate instances when
	// the user re-imports or relinks a repo they already connected.
	existing, lookupErr := instSvc.GetByGithubRepo(ctx, githubRepo, basePath)
	if lookupErr != nil {
		s.log.Warn("lookup existing instance by repo", "repo", githubRepo, "err", lookupErr)
	}

	var inst *domain.StrategyInstance
	if existing != nil {
		// Reuse the existing instance.
		// Move to the chosen workspace if it differs.
		if existing.WorkspaceID != workspaceID {
			if moveErr := instSvc.MoveInstance(ctx, existing.ID, workspaceID); moveErr != nil {
				s.log.Error("move existing instance to new workspace", "instance_id", existing.ID, "err", moveErr)
				return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
			}
		}
		inst = existing
	} else {
		// No existing instance — create a new one.
		var createErr error
		inst, createErr = instSvc.ImportInstance(ctx, instancedom.ImportParams{
			WorkspaceID: workspaceID,
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
