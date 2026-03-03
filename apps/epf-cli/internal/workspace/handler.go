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

// Handler creates an http.Handler for the /workspaces endpoint.
//
// The handler extracts the authenticated user from the request context
// (injected by auth middleware), retrieves their OAuth token from the
// session manager, and calls the discoverer to list accessible EPF workspaces.
func Handler(discoverer *Discoverer, sessionMgr *auth.SessionManager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		// Get the user's OAuth token from the session manager.
		token, ok := sessionMgr.GetAccessToken(user.SessionID)
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "session expired or invalid")
			return
		}

		workspaces, err := discoverer.Discover(user.UserID, token)
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
