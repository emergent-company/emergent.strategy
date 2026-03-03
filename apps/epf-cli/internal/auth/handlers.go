// HTTP handlers for GitHub OAuth authentication.
//
// AuthHandler implements the two endpoints for the OAuth 2.0 authorization
// code flow:
//
//   - GET /auth/github/login    — redirects user to GitHub's OAuth consent page
//   - GET /auth/github/callback — exchanges auth code for token, creates session
//
// On successful authentication, the callback returns a JSON response containing
// a signed JWT. The client uses this JWT as a bearer token on subsequent
// MCP requests.
package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// AuthHandler holds the dependencies for OAuth HTTP handlers.
type AuthHandler struct {
	oauth   *OAuthConfig
	session *SessionManager

	// states stores pending CSRF state tokens with expiry.
	// Key: state token, Value: expiry time.
	mu     sync.Mutex
	states map[string]time.Time
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(oauth *OAuthConfig, session *SessionManager) *AuthHandler {
	return &AuthHandler{
		oauth:   oauth,
		session: session,
		states:  make(map[string]time.Time),
	}
}

// RegisterRoutes registers the OAuth routes on the given mux.
func (h *AuthHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /auth/github/login", h.HandleLogin)
	mux.HandleFunc("GET /auth/github/callback", h.HandleCallback)
	mux.HandleFunc("POST /auth/token", h.HandleTokenExchange)
}

// stateTimeout is how long a CSRF state token is valid.
const stateTimeout = 10 * time.Minute

// maxPendingStates is the maximum number of pending state tokens.
// If exceeded, oldest states are not cleaned proactively, but they
// expire naturally via the timeout check.
const maxPendingStates = 1000

// HandleLogin redirects the user to GitHub's OAuth authorization page.
//
// It generates a random CSRF state token, stores it with an expiry, and
// redirects to the GitHub authorize URL.
//
// GET /auth/github/login
//
// Response: 302 redirect to GitHub OAuth consent page.
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	state, err := GenerateStateToken()
	if err != nil {
		log.Printf("auth: generate state token: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.mu.Lock()
	h.cleanExpiredStates()
	h.states[state] = time.Now().Add(stateTimeout)
	h.mu.Unlock()

	authorizeURL := h.oauth.AuthorizeURL(state)
	http.Redirect(w, r, authorizeURL, http.StatusFound)
}

// CallbackResponse is the JSON response returned on successful OAuth callback.
type CallbackResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	UserID   int64  `json:"user_id"`
}

// HandleCallback handles the GitHub OAuth callback.
//
// It validates the CSRF state, exchanges the authorization code for an access
// token, fetches the user's GitHub profile, creates a session, and returns
// a signed JWT.
//
// GET /auth/github/callback?code=xxx&state=yyy
//
// Success response (200):
//
//	{
//	  "token": "<JWT>",
//	  "username": "octocat",
//	  "user_id": 1
//	}
//
// Error responses:
//   - 400: missing code/state, invalid state, token exchange failed
//   - 500: internal error (session creation, user fetch)
func (h *AuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	if code == "" || state == "" {
		writeJSONError(w, http.StatusBadRequest, "missing code or state parameter")
		return
	}

	// Validate and consume the CSRF state token.
	if !h.consumeState(state) {
		writeJSONError(w, http.StatusBadRequest, "invalid or expired state parameter")
		return
	}

	// Exchange the authorization code for an access token.
	tokenResp, err := h.oauth.ExchangeCode(code)
	if err != nil {
		log.Printf("auth: exchange code: %v", err)
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("token exchange failed: %v", err))
		return
	}

	// Fetch the user's GitHub profile.
	user, err := h.oauth.FetchUser(tokenResp.AccessToken)
	if err != nil {
		log.Printf("auth: fetch user: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to fetch user profile")
		return
	}

	// Create a session and get a signed JWT.
	jwt, err := h.session.CreateSession(user, tokenResp.AccessToken)
	if err != nil {
		log.Printf("auth: create session: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Return the JWT and basic user info.
	resp := CallbackResponse{
		Token:    jwt,
		Username: user.Login,
		UserID:   user.ID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// consumeState validates and removes a CSRF state token.
// Returns false if the state is invalid, expired, or already consumed.
func (h *AuthHandler) consumeState(state string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	expiry, exists := h.states[state]
	if !exists {
		return false
	}

	delete(h.states, state)

	if time.Now().After(expiry) {
		return false
	}

	return true
}

// cleanExpiredStates removes expired state tokens.
// Must be called with h.mu held.
func (h *AuthHandler) cleanExpiredStates() {
	now := time.Now()
	for state, expiry := range h.states {
		if now.After(expiry) {
			delete(h.states, state)
		}
	}
}

// PendingStates returns the number of pending state tokens (for monitoring/testing).
func (h *AuthHandler) PendingStates() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.states)
}

// TokenExchangeRequest is the JSON body for POST /auth/token.
type TokenExchangeRequest struct {
	GitHubToken string `json:"github_token"`
}

// TokenExchangeResponse is the JSON response for POST /auth/token.
// Same shape as CallbackResponse for consistency.
type TokenExchangeResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	UserID   int64  `json:"user_id"`
}

// HandleTokenExchange accepts a GitHub access token (from Device Flow or PAT),
// validates it against the GitHub API, creates a server session, and returns
// a signed JWT.
//
// POST /auth/token
//
// Request body:
//
//	{"github_token": "gho_xxx..."}
//
// Success response (200):
//
//	{"token": "<JWT>", "username": "octocat", "user_id": 1}
//
// Error responses:
//   - 400: missing or empty github_token, invalid JSON
//   - 401: invalid or expired GitHub token
//   - 500: internal error (session creation)
func (h *AuthHandler) HandleTokenExchange(w http.ResponseWriter, r *http.Request) {
	// Only accept JSON.
	ct := r.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") {
		writeJSONError(w, http.StatusBadRequest, "Content-Type must be application/json")
		return
	}

	var req TokenExchangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.GitHubToken == "" {
		writeJSONError(w, http.StatusBadRequest, "github_token is required")
		return
	}

	// Validate the token by fetching the GitHub user profile.
	user, err := h.oauth.FetchUser(req.GitHubToken)
	if err != nil {
		log.Printf("auth: token exchange: fetch user: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "invalid or expired GitHub token")
		return
	}

	// Create a session (identical to the OAuth callback flow).
	jwt, err := h.session.CreateSession(user, req.GitHubToken)
	if err != nil {
		log.Printf("auth: token exchange: create session: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	resp := TokenExchangeResponse{
		Token:    jwt,
		Username: user.Login,
		UserID:   user.ID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// writeJSONError writes a JSON error response.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
