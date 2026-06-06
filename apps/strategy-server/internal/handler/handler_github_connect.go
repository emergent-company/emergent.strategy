package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/emergent-company/go-daisy/render"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// handleGithubConnect renders the GitHub connect flow page.
// Returns immediately — the repo list is loaded asynchronously via GET /github/connect/repos.
// GET /github/connect
func (s *Server) handleGithubConnect(c echo.Context) error {
	ctx := c.Request().Context()
	user := web.UserFromContext(ctx)

	data := ui.GithubConnectData{
		AppConfigured:   s.syncSvc != nil,
		AppInstallURL:   s.githubAppInstallURL,
		OAuthConfigured: s.githubOAuth != nil,
	}

	if !data.AppConfigured {
		return s.renderConnectPage(c, data)
	}

	githubToken := s.loadUserGithubToken(ctx, user.ID)
	if githubToken == "" {
		data.NeedsGithubAuth = true
		return s.renderConnectPage(c, data)
	}

	// Page renders immediately with a loading skeleton.
	// The actual scan runs async via GET /github/connect/repos.
	data.ReposLoaded = false
	return s.renderConnectPage(c, data)
}

// handleGithubConnectRepos is the HTMX polling endpoint for the repo scan.
// GET /github/connect/repos
//
// On first call: starts the background scan and returns a polling skeleton.
// On subsequent calls: returns cached results when ready, or another polling skeleton.
// This avoids holding the HTTP connection open for the full scan duration.
func (s *Server) handleGithubConnectRepos(c echo.Context) error {
	ctx := c.Request().Context()
	user := web.UserFromContext(ctx)

	githubToken := s.loadUserGithubToken(ctx, user.ID)
	if githubToken == "" {
		return c.Redirect(http.StatusFound, "/github/connect")
	}

	// Check if results are already cached.
	if repos, ok := s.syncSvc.GetCachedUserRepos(githubToken); ok {
		data := ui.GithubConnectData{
			AppInstallURL: s.githubAppInstallURL,
			ReposLoaded:   true,
			Workspaces:    s.loadWorkspacesForAssignment(ctx),
			Repos:         toUIRepoItems(repos),
		}
		render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectRepoListFragment(data))
		return nil
	}

	// Not cached yet — kick off the background scan (no-op if already running)
	// and return a polling skeleton. HTMX will retry in 3 seconds.
	s.syncSvc.StartScanUserRepos(githubToken)
	render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectRepoPollingSkeleton())
	return nil
}

// handleGithubConnectAuthorize starts the GitHub OAuth dance.
// GET /github/connect/authorize
func (s *Server) handleGithubConnectAuthorize(c echo.Context) error {
	if s.githubOAuth == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(c.Request().Context(), "error.github_oauth_not_configured"))
	}

	state, err := ghclient.GenerateState()
	if err != nil {
		s.log.Error("generate oauth state", "err", err)
		return echo.ErrInternalServerError
	}

	signed := ghclient.SignState(state, s.githubOAuth.StateSecret)

	// Store signed state in a short-lived cookie.
	cookie := &http.Cookie{
		Name:     "github_oauth_state",
		Value:    signed,
		Path:     "/",
		MaxAge:   600, // 10 minutes
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
	c.SetCookie(cookie)

	return c.Redirect(http.StatusFound, s.githubOAuth.AuthorizeURL(state))
}

// handleGithubConnectCallback handles the GitHub OAuth callback.
// GET /github/connect/callback?code=XXX&state=YYY
func (s *Server) handleGithubConnectCallback(c echo.Context) error {
	ctx := c.Request().Context()
	user := web.UserFromContext(ctx)

	if s.githubOAuth == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.github_oauth_not_configured"))
	}

	// Verify CSRF state.
	stateCookie, err := c.Cookie("github_oauth_state")
	if err != nil {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.oauth_missing_state_cookie"))
	}
	callbackState := c.QueryParam("state")
	_, ok := ghclient.VerifyState(stateCookie.Value, s.githubOAuth.StateSecret)
	if !ok || callbackState == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.oauth_invalid_state"))
	}
	// Also verify the state param matches what's in the cookie.
	signedFromParam := ghclient.SignState(callbackState, s.githubOAuth.StateSecret)
	if signedFromParam != stateCookie.Value {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.oauth_state_mismatch"))
	}

	// Clear the state cookie.
	c.SetCookie(&http.Cookie{
		Name:    "github_oauth_state",
		Value:   "",
		Path:    "/",
		MaxAge:  -1,
		Expires: time.Unix(0, 0),
	})

	code := c.QueryParam("code")
	if code == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.oauth_missing_code"))
	}

	// Exchange code for access token.
	accessToken, err := s.githubOAuth.ExchangeCode(ctx, code)
	if err != nil {
		s.log.Error("github oauth code exchange failed", "err", err)
		return c.String(http.StatusBadGateway, langs.T(ctx, "error.oauth_exchange_failed"))
	}

	// Fetch GitHub user to log the login.
	ghUser, err := s.githubOAuth.FetchUser(ctx, accessToken)
	if err != nil {
		s.log.Warn("fetch github user failed (non-fatal)", "err", err)
	} else {
		slog.InfoContext(ctx, "github oauth complete", "github_login", ghUser.Login, "user_id", user.ID)
	}

	// Store token against the platform user.
	if s.userSvc != nil {
		if storeErr := s.userSvc.StoreGithubToken(ctx, user.ID, accessToken); storeErr != nil {
			s.log.Error("store github token", "err", storeErr)
			return echo.ErrInternalServerError
		}
	}

	return c.Redirect(http.StatusFound, "/github/connect")
}

// handleGithubConnectScan handles POST /github/connect/scan — invalidates cache and
// returns the loading skeleton so HTMX re-triggers a fresh scan immediately.
// POST /github/connect/scan
func (s *Server) handleGithubConnectScan(c echo.Context) error {
	ctx := c.Request().Context()
	user := web.UserFromContext(ctx)

	if s.syncSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.github_sync_not_configured"))
	}

	githubToken := s.loadUserGithubToken(ctx, user.ID)
	if githubToken == "" {
		return c.Redirect(http.StatusFound, "/github/connect")
	}

	// Invalidate the scan cache so the next /github/connect/repos call does a fresh scan.
	cacheKey := "user:" + githubToken[:min(16, len(githubToken))]
	s.syncSvc.InvalidateScanCache(cacheKey)

	// Return the loading skeleton with hx-trigger="load" pointing at /github/connect/repos.
	// HTMX swaps this into #github-repo-list, which immediately fires the load trigger.
	render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectReposLoadingFragment())
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (s *Server) renderConnectPage(c echo.Context, data ui.GithubConnectData) error {
	sidebarGroups := s.sidebarGroups(c)
	currentPath := "/github/connect"
	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.GithubConnectPage(currentPath, sidebarGroups, data),
		ui.GithubConnectMainContent(data),
		ui.GithubConnectContent(data),
	)
	return nil
}

func toUIRepoItems(repos []syncdom.RepoScanResult) []ui.GithubRepoScanItem {
	items := make([]ui.GithubRepoScanItem, len(repos))
	for i, r := range repos {
		item := ui.GithubRepoScanItem{
			Name:          r.Name,
			FullName:      r.FullName,
			HTMLURL:       r.HTMLURL,
			DefaultBranch: r.DefaultBranch,
			Private:       r.Private,
			Description:   r.Description,
			PushedAt:      r.PushedAt,
			HeadCommit: ui.GithubRepoCommit{
				SHA:        r.HeadCommit.SHA,
				Message:    r.HeadCommit.Message,
				AuthorName: r.HeadCommit.AuthorName,
				AuthoredAt: r.HeadCommit.AuthoredAt,
			},
			HasEPF:        r.HasEPF,
			InstanceCount: len(r.DetectedInstances),
			ScanTruncated: r.ScanTruncated,
			ScanError:     r.ScanError,
			HasAppInstall: r.HasAppInstall,
			UsedByRepos:   r.UsedByRepos,
		}
		item.DetectedInstances = make([]ui.GithubDetectedInstance, len(r.DetectedInstances))
		for j, d := range r.DetectedInstances {
			item.DetectedInstances[j] = ui.GithubDetectedInstance{
				BasePath:      d.BasePath,
				HasMetaFile:   d.HasMetaFile,
				IsSubmodule:   d.IsSubmodule,
				SubmoduleSlug: d.SubmoduleSlug,
			}
		}
		// Derive EPFViaSubmoduleOf: submodule refs where the repo has EPF instances
		// that are submodule-hosted (i.e. this repo subscribes to EPF via submodule).
		// We use unique submodule slugs from detected submodule instances.
		slugSeen := make(map[string]bool)
		for _, d := range r.DetectedInstances {
			if d.IsSubmodule && d.SubmoduleSlug != "" && !slugSeen[d.SubmoduleSlug] {
				slugSeen[d.SubmoduleSlug] = true
				item.EPFViaSubmoduleOf = append(item.EPFViaSubmoduleOf, d.SubmoduleSlug)
			}
		}
		// Also add any submodule refs from the scan that aren't already captured above.
		// These cover repos that have .gitmodules pointing to EPF repos but where
		// the submodule checkout didn't yield a detected instance (e.g. 21st-captable).
		for _, ref := range r.SubmoduleRefs {
			if ref.RepoSlug != "" && !slugSeen[ref.RepoSlug] {
				// Check if this slug appears as an EPF source in UsedByRepos lookup.
				// For simplicity, include all submodule refs since they were already
				// parsed from .gitmodules and represent intentional dependencies.
				slugSeen[ref.RepoSlug] = true
				item.EPFViaSubmoduleOf = append(item.EPFViaSubmoduleOf, ref.RepoSlug)
			}
		}
		items[i] = item
	}
	return items
}

func (s *Server) loadUserGithubToken(ctx context.Context, userID uuid.UUID) string {
	if s.userSvc == nil {
		return ""
	}
	token, err := s.userSvc.GetGithubToken(ctx, userID)
	if err != nil {
		s.log.Warn("load github token", "user_id", userID, "err", err)
		return ""
	}
	return token
}

func (s *Server) loadGithubUserLogin(ctx context.Context, userID uuid.UUID) string {
	// For now return empty — we could store the login alongside the token in a follow-up.
	// The UI handles empty string gracefully (doesn't show the "Connected as" badge).
	_ = ctx
	_ = userID
	return ""
}

// loadWorkspacesForAssignment loads all active workspaces for the assignment dropdown.
// Web handlers may query the DB directly for read-only view-assembly queries (per constitution).
func (s *Server) loadWorkspacesForAssignment(ctx context.Context) []ui.WorkspaceScanItem {
	type row struct {
		ID      string `bun:"id"`
		Name    string `bun:"display_name"`
		OrgName string `bun:"org_name"`
	}
	var rows []row

	err := s.db.NewSelect().
		TableExpr("workspaces AS w").
		ColumnExpr("w.id, w.display_name, o.name AS org_name").
		Join("JOIN orgs AS o ON o.id = w.org_id").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		OrderExpr("o.name ASC, w.display_name ASC").
		Scan(ctx, &rows)
	if err != nil {
		s.log.Warn("loadWorkspacesForAssignment: scan failed", "err", err)
		return nil
	}

	items := make([]ui.WorkspaceScanItem, len(rows))
	for i, r := range rows {
		items[i] = ui.WorkspaceScanItem{ID: r.ID, Name: r.Name, OrgName: r.OrgName}
	}
	return items
}
