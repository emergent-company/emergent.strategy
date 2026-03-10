// HTTP handler for the /workspaces endpoint.
//
// Returns a JSON list of EPF workspaces accessible to the authenticated user.
// Requires the auth middleware to have injected a SessionUser into the request
// context (multi-tenant mode only).
package workspace

import (
	"encoding/json"
	"net/http"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
)

// WorkspacesResponse is the JSON response from GET /workspaces.
type WorkspacesResponse struct {
	Workspaces []Workspace `json:"workspaces"`
	Count      int         `json:"count"`
}

// WorkspacesErrorResponse is the JSON error response from GET /workspaces.
type WorkspacesErrorResponse struct {
	Error string `json:"error"`
}

// HandlerConfig configures the workspace handler.
type HandlerConfig struct {
	// Discoverer performs workspace discovery.
	Discoverer *Discoverer

	// SessionManager retrieves user tokens and auth methods.
	SessionManager *auth.SessionManager

	// InstallationTokenFunc provides installation tokens for GitHub App
	// discovery. Nil when GitHub App is not configured.
	InstallationTokenFunc InstallationTokenFunc

	// AppID is the GitHub App ID for filtering installations.
	// Zero when GitHub App is not configured.
	AppID int64
}

// Handler creates an http.Handler for the /workspaces endpoint.
//
// The handler extracts the authenticated user from the request context
// (injected by auth middleware), retrieves their OAuth token from the
// session manager, and calls the discoverer to list accessible EPF workspaces.
//
// This is the legacy constructor that uses GET /user/repos for all sessions.
// For GitHub App support, use HandlerWithConfig instead.
func Handler(discoverer *Discoverer, sessionMgr *auth.SessionManager) http.Handler {
	return HandlerWithConfig(HandlerConfig{
		Discoverer:     discoverer,
		SessionManager: sessionMgr,
	})
}

// HandlerWithConfig creates an http.Handler for the /workspaces endpoint
// with full auth-method-aware discovery.
//
// For GitHub App sessions, it uses GET /user/installations to discover
// workspaces. For PAT/OAuth sessions, it falls back to GET /user/repos.
func HandlerWithConfig(cfg HandlerConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		// Get the user's token from the session manager.
		token, ok := cfg.SessionManager.GetUserToken(user.SessionID)
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "session expired or invalid")
			return
		}

		// Build discovery options based on the session's auth method.
		opts := DiscoverOptions{}
		method, _ := cfg.SessionManager.GetAuthMethod(user.SessionID)
		if method == auth.AuthMethodGitHubApp && cfg.InstallationTokenFunc != nil {
			opts.AuthMethod = method
			opts.InstallationTokenFunc = cfg.InstallationTokenFunc
			opts.AppID = cfg.AppID
		}

		workspaces, err := cfg.Discoverer.DiscoverWithOptions(user.UserID, token, opts)
		if err != nil {
			writeError(w, http.StatusBadGateway, "workspace discovery failed: "+err.Error())
			return
		}

		// Ensure empty slice rather than null in JSON.
		if workspaces == nil {
			workspaces = []Workspace{}
		}

		resp := WorkspacesResponse{
			Workspaces: workspaces,
			Count:      len(workspaces),
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	})
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(WorkspacesErrorResponse{Error: message})
}
