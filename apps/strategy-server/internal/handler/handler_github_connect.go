package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/emergent-company/go-daisy/render"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

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

	// Check if results (or an error) are ready in the cache.
	state := s.syncSvc.GetCachedScanState(githubToken)
	if state.Ready {
		data := ui.GithubConnectData{
			AppInstallURL: s.githubAppInstallURL,
			ReposLoaded:   true,
			PartialScan:   state.Partial,
			Workspaces:    s.loadWorkspacesForAssignment(ctx),
		}
		if state.Err != nil {
			// Distinguish rate limit from other errors.
			var rle *syncdom.RateLimitError
			if errors.As(state.Err, &rle) {
				data.RateLimited = true
				data.RetryAfter = rle.RetryAfter
			} else {
				data.ScanError = langs.T(ctx, "error.github_scan_failed")
			}
		} else {
			repos := toUIRepoItems(state.Results)
			s.annotateConnectedInstances(ctx, repos)
			data.Repos = repos
		}
		// When partial, keep polling to pick up full scan results.
		if state.Partial {
			render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectRepoListPartialFragment(data))
		} else {
			render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectRepoListFragment(data))
		}
		return nil
	}

	// Not cached — run quick scan synchronously (returns repo list immediately),
	// then kick off full EPF detection in background.
	state = s.syncSvc.StartScanUserRepos(ctx, githubToken)
	if !state.Ready {
		// Another goroutine just started (race) — return skeleton, next poll will get results.
		render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectRepoPollingSkeleton())
		return nil
	}

	data := ui.GithubConnectData{
		AppInstallURL: s.githubAppInstallURL,
		ReposLoaded:   true,
		PartialScan:   state.Partial,
		Workspaces:    s.loadWorkspacesForAssignment(ctx),
	}
	if state.Err != nil {
		var rle *syncdom.RateLimitError
		if errors.As(state.Err, &rle) {
			data.RateLimited = true
			data.RetryAfter = rle.RetryAfter
		} else {
			data.ScanError = langs.T(ctx, "error.github_scan_failed")
		}
	} else {
		repos := toUIRepoItems(state.Results)
		s.annotateConnectedInstances(ctx, repos)
		data.Repos = repos
	}
	render.RenderPartial(c.Response().Writer, c.Request(), ui.GithubConnectRepoListFragment(data))
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

// annotateConnectedInstances queries the DB for existing strategy instances linked
// to any of the scanned repos and annotates matching GithubDetectedInstance entries.
// A single query loads all instances; matching is done in-memory by repo+basePath key.
func (s *Server) annotateConnectedInstances(ctx context.Context, repos []ui.GithubRepoScanItem) {
	type row struct {
		ID               string  `bun:"id"`
		Name             string  `bun:"name"`
		GithubRepo       string  `bun:"github_repo"`
		GithubBasePath   *string `bun:"github_base_path"`
		GithubCommitSHA  *string `bun:"github_commit_sha"`
		MemorySyncStatus *string `bun:"memory_sync_status"`
		WorkspaceName    string  `bun:"workspace_name"`
		OrgName          string  `bun:"org_name"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name, si.github_repo, si.github_base_path, si.github_commit_sha, si.memory_sync_status").
		ColumnExpr("w.display_name AS workspace_name, o.name AS org_name").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Join("JOIN orgs AS o ON o.id = w.org_id").
		Where("si.deleted_at IS NULL").
		Where("si.github_repo IS NOT NULL").
		Scan(ctx, &rows)
	if err != nil {
		s.log.Warn("annotateConnectedInstances: query failed", "err", err)
		return
	}

	// Build lookup: "github_repo|github_base_path" → row
	type connInfo struct {
		ID            string
		Name          string
		WorkspaceName string
		CommitSHA     string
		MemoryStatus  string
		LastSyncedAt  time.Time // from github_sync_log latest entry
	}
	lookup := make(map[string]connInfo, len(rows))
	for _, r := range rows {
		basePath := ""
		if r.GithubBasePath != nil {
			basePath = *r.GithubBasePath
		}
		key := r.GithubRepo + "|" + basePath
		info := connInfo{ID: r.ID, Name: r.Name, WorkspaceName: r.OrgName + " / " + r.WorkspaceName}
		if r.GithubCommitSHA != nil && len(*r.GithubCommitSHA) >= 7 {
			info.CommitSHA = (*r.GithubCommitSHA)[:7]
		}
		if r.MemorySyncStatus != nil {
			info.MemoryStatus = *r.MemorySyncStatus
		}
		lookup[key] = info
	}

	// Load last sync timestamps from github_sync_log per instance.
	if len(lookup) > 0 {
		instanceIDs := make([]string, 0, len(lookup))
		for _, info := range lookup {
			instanceIDs = append(instanceIDs, info.ID)
		}
		var syncRows []struct {
			InstanceID string    `bun:"instance_id"`
			LastSync   time.Time `bun:"last_sync"`
		}
		_ = s.db.NewSelect().
			TableExpr("github_sync_log").
			ColumnExpr("instance_id::text, MAX(created_at) AS last_sync").
			Where("instance_id IN (?)", bun.In(instanceIDs)).
			GroupExpr("instance_id").
			Scan(ctx, &syncRows)
		// Build id→lastSync map and update lookup entries.
		syncMap := make(map[string]time.Time, len(syncRows))
		for _, sr := range syncRows {
			syncMap[sr.InstanceID] = sr.LastSync
		}
		for key, info := range lookup {
			if t, ok := syncMap[info.ID]; ok {
				info.LastSyncedAt = t
				lookup[key] = info
			}
		}
	}

	// Annotate each detected instance.
	for i := range repos {
		for j := range repos[i].DetectedInstances {
			key := repos[i].FullName + "|" + repos[i].DetectedInstances[j].BasePath
			if info, ok := lookup[key]; ok {
				repos[i].DetectedInstances[j].ConnectedInstanceID = info.ID
				repos[i].DetectedInstances[j].ConnectedInstanceName = info.Name
				repos[i].DetectedInstances[j].ConnectedWorkspaceName = info.WorkspaceName
				repos[i].DetectedInstances[j].ConnectedCommitSHA = info.CommitSHA
				repos[i].DetectedInstances[j].ConnectedMemorySyncStatus = info.MemoryStatus
				repos[i].DetectedInstances[j].ConnectedLastSyncedAt = info.LastSyncedAt
				// Flag as changed when repo was pushed after the last import/sync.
				if !info.LastSyncedAt.IsZero() && !repos[i].PushedAt.IsZero() {
					repos[i].DetectedInstances[j].ChangedSinceSync = repos[i].PushedAt.After(info.LastSyncedAt)
				}
			}
		}
	}
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
