// MCP OAuth Authorization Server endpoints.
//
// The EPF server acts as an OAuth 2.1 authorization server for MCP clients
// (Claude Cowork, OpenCode, Cursor) using the "Third-Party Authorization Flow"
// from the MCP spec (2025-06-18). It is also an OAuth client to GitHub.
//
// Flow:
//  1. MCP client hits POST /mcp → 401 with WWW-Authenticate header
//  2. Client discovers GET /.well-known/oauth-protected-resource (RFC 9728)
//  3. Client discovers GET /.well-known/oauth-authorization-server (RFC 8414)
//  4. Client registers via POST /register (RFC 7591)
//  5. Client redirects user to GET /authorize with PKCE
//  6. Server redirects to GitHub OAuth, user authorizes
//  7. GitHub callback at GET /authorize/callback → server issues auth code
//  8. Client exchanges code via POST /token → gets access token (JWT)
//
// These endpoints are SEPARATE from the existing /auth/github/* endpoints.
// They share OAuthConfig and SessionManager but have different flow logic.
package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// MCPOAuthHandler implements the MCP OAuth 2.1 authorization server endpoints.
type MCPOAuthHandler struct {
	oauth     *OAuthConfig
	session   *SessionManager
	codes     *AuthCodeStore
	clients   *DCRStore
	serverURL string // External base URL of this server (e.g., "https://epf.example.com")

	// pendingMu protects pendingAuths.
	pendingMu    sync.Mutex
	pendingAuths map[string]*pendingAuth
}

// NewMCPOAuthHandler creates a new MCP OAuth authorization server handler.
//
// serverURL is the external base URL used in metadata responses and redirects.
// It should not have a trailing slash.
func NewMCPOAuthHandler(oauth *OAuthConfig, session *SessionManager, serverURL string) *MCPOAuthHandler {
	serverURL = strings.TrimRight(serverURL, "/")
	return &MCPOAuthHandler{
		oauth:        oauth,
		session:      session,
		codes:        NewAuthCodeStore(),
		clients:      NewDCRStore(),
		serverURL:    serverURL,
		pendingAuths: make(map[string]*pendingAuth),
	}
}

// RegisterRoutes registers the MCP OAuth routes on the given mux.
func (h *MCPOAuthHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /.well-known/oauth-protected-resource", h.HandleProtectedResourceMetadata)
	mux.HandleFunc("GET /.well-known/oauth-authorization-server", h.HandleAuthorizationServerMetadata)
	mux.HandleFunc("POST /register", h.HandleRegister)
	mux.HandleFunc("GET /authorize", h.HandleAuthorize)
	mux.HandleFunc("GET /authorize/callback", h.HandleAuthorizeCallback)
	mux.HandleFunc("POST /token", h.HandleToken)
}

// --- Metadata Endpoints ---

// ProtectedResourceMetadata is the response for /.well-known/oauth-protected-resource (RFC 9728).
type ProtectedResourceMetadata struct {
	Resource               string   `json:"resource"`
	AuthorizationServers   []string `json:"authorization_servers"`
	BearerMethodsSupported []string `json:"bearer_methods_supported"`
	ScopesSupported        []string `json:"scopes_supported"`
}

// HandleProtectedResourceMetadata responds with Protected Resource Metadata (RFC 9728).
//
// GET /.well-known/oauth-protected-resource
//
// This is the entry point for MCP OAuth discovery. The MCP client fetches
// this after receiving a 401 from /mcp to learn which authorization server
// to use.
//
// Note: When using GitHub App auth, actual permissions come from the App manifest
// (contents:read, metadata:read), not OAuth scopes. The scopes_supported field
// reflects the EPF server's own scope model, not GitHub's.
func (h *MCPOAuthHandler) HandleProtectedResourceMetadata(w http.ResponseWriter, r *http.Request) {
	resp := ProtectedResourceMetadata{
		Resource:               h.serverURL,
		AuthorizationServers:   []string{h.serverURL},
		BearerMethodsSupported: []string{"header"},
		ScopesSupported:        []string{"epf:read"},
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	json.NewEncoder(w).Encode(resp)
}

// AuthorizationServerMetadata is the response for /.well-known/oauth-authorization-server (RFC 8414).
type AuthorizationServerMetadata struct {
	Issuer                        string   `json:"issuer"`
	AuthorizationEndpoint         string   `json:"authorization_endpoint"`
	TokenEndpoint                 string   `json:"token_endpoint"`
	RegistrationEndpoint          string   `json:"registration_endpoint"`
	ResponseTypesSupported        []string `json:"response_types_supported"`
	GrantTypesSupported           []string `json:"grant_types_supported"`
	CodeChallengeMethodsSupported []string `json:"code_challenge_methods_supported"`
	ScopesSupported               []string `json:"scopes_supported"`
}

// HandleAuthorizationServerMetadata responds with Authorization Server Metadata (RFC 8414).
//
// GET /.well-known/oauth-authorization-server
//
// Tells the MCP client where to register, authorize, and exchange tokens.
func (h *MCPOAuthHandler) HandleAuthorizationServerMetadata(w http.ResponseWriter, r *http.Request) {
	resp := AuthorizationServerMetadata{
		Issuer:                        h.serverURL,
		AuthorizationEndpoint:         h.serverURL + "/authorize",
		TokenEndpoint:                 h.serverURL + "/token",
		RegistrationEndpoint:          h.serverURL + "/register",
		ResponseTypesSupported:        []string{"code"},
		GrantTypesSupported:           []string{"authorization_code"},
		CodeChallengeMethodsSupported: []string{"S256"},
		ScopesSupported:               []string{"epf:read"},
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	json.NewEncoder(w).Encode(resp)
}

// --- Dynamic Client Registration ---

// DCRRequest is the request body for POST /register (RFC 7591).
type DCRRequest struct {
	ClientName   string   `json:"client_name,omitempty"`
	RedirectURIs []string `json:"redirect_uris"`
}

// DCRResponse is the response body for POST /register.
type DCRResponse struct {
	ClientID                string   `json:"client_id"`
	ClientName              string   `json:"client_name,omitempty"`
	RedirectURIs            []string `json:"redirect_uris"`
	ClientIDIssuedAt        int64    `json:"client_id_issued_at"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
}

// HandleRegister handles Dynamic Client Registration (RFC 7591).
//
// POST /register
//
// Request body:
//
//	{
//	  "client_name": "Claude Desktop",
//	  "redirect_uris": ["http://localhost:12345/callback"]
//	}
//
// Response (201):
//
//	{
//	  "client_id": "epf-abc123...",
//	  "client_name": "Claude Desktop",
//	  "redirect_uris": ["http://localhost:12345/callback"],
//	  "client_id_issued_at": 1709500000,
//	  "token_endpoint_auth_method": "none"
//	}
func (h *MCPOAuthHandler) HandleRegister(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16)) // 64KB max
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	var req DCRRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON in request body")
		return
	}

	if len(req.RedirectURIs) == 0 {
		writeJSONError(w, http.StatusBadRequest, "redirect_uris is required and must be non-empty")
		return
	}

	// Validate redirect URIs — they must be valid URLs.
	for _, uri := range req.RedirectURIs {
		parsed, err := url.Parse(uri)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid redirect_uri: %s", uri))
			return
		}
	}

	client, err := h.clients.Register(req.ClientName, req.RedirectURIs)
	if err != nil {
		log.Printf("mcpoauth: register client: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to register client")
		return
	}

	resp := DCRResponse{
		ClientID:                client.ClientID,
		ClientName:              client.ClientName,
		RedirectURIs:            client.RedirectURIs,
		ClientIDIssuedAt:        client.CreatedAt.Unix(),
		TokenEndpointAuthMethod: "none", // Public client, no secret.
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// --- Authorization Endpoint ---

// pendingAuth stores the state needed between /authorize and /authorize/callback.
type pendingAuth struct {
	clientID      string
	redirectURI   string
	codeChallenge string
	state         string
	expiresAt     time.Time
}

// HandleAuthorize initiates the OAuth authorization code flow.
//
// GET /authorize?client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256&response_type=code&state=...
//
// Validates the request parameters, stores the pending authorization state,
// then redirects the user to GitHub OAuth for authentication.
func (h *MCPOAuthHandler) HandleAuthorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	clientID := q.Get("client_id")
	redirectURI := q.Get("redirect_uri")
	codeChallenge := q.Get("code_challenge")
	codeChallengeMethod := q.Get("code_challenge_method")
	responseType := q.Get("response_type")
	state := q.Get("state")

	// Validate required parameters.
	if clientID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing client_id parameter")
		return
	}
	if redirectURI == "" {
		writeJSONError(w, http.StatusBadRequest, "missing redirect_uri parameter")
		return
	}
	if codeChallenge == "" {
		writeJSONError(w, http.StatusBadRequest, "missing code_challenge parameter (PKCE is required)")
		return
	}
	if codeChallengeMethod != "S256" {
		writeJSONError(w, http.StatusBadRequest, "code_challenge_method must be S256")
		return
	}
	if responseType != "code" {
		writeJSONError(w, http.StatusBadRequest, "response_type must be code")
		return
	}

	// Validate the client is registered and the redirect URI matches.
	if !h.clients.ValidateRedirectURI(clientID, redirectURI) {
		writeJSONError(w, http.StatusBadRequest, "invalid client_id or redirect_uri not registered")
		return
	}

	// Generate an internal state token that maps back to this authorization request.
	// We store the MCP client's parameters keyed by our internal state, then use
	// our internal state as the `state` for GitHub OAuth.
	internalState, err := GenerateStateToken()
	if err != nil {
		log.Printf("mcpoauth: generate internal state: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Store the pending authorization.
	h.storePendingAuth(internalState, pendingAuth{
		clientID:      clientID,
		redirectURI:   redirectURI,
		codeChallenge: codeChallenge,
		state:         state,
		expiresAt:     time.Now().Add(stateTimeout),
	})

	// Build the GitHub OAuth URL, but override the callback to our /authorize/callback.
	params := url.Values{
		"client_id":    {h.oauth.ClientID},
		"state":        {internalState},
		"scope":        {strings.Join(h.oauth.Scopes, " ")},
		"redirect_uri": {h.serverURL + "/authorize/callback"},
		"allow_signup": {"false"},
	}
	githubAuthorizeURL := h.oauth.BaseURL + "/login/oauth/authorize?" + params.Encode()

	http.Redirect(w, r, githubAuthorizeURL, http.StatusFound)
}

// HandleAuthorizeCallback handles the GitHub OAuth callback for MCP authorization.
//
// GET /authorize/callback?code=...&state=...
//
// This is the internal callback from GitHub (different from /auth/github/callback).
// It:
//  1. Validates the internal state
//  2. Exchanges the GitHub code for a GitHub access token
//  3. Fetches the user profile from GitHub
//  4. Creates a server session
//  5. Generates an authorization code
//  6. Redirects to the MCP client's redirect_uri with the code
func (h *MCPOAuthHandler) HandleAuthorizeCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	internalState := r.URL.Query().Get("state")

	if code == "" || internalState == "" {
		writeJSONError(w, http.StatusBadRequest, "missing code or state parameter")
		return
	}

	// Look up and consume the pending authorization.
	pending := h.consumePendingAuth(internalState)
	if pending == nil {
		writeJSONError(w, http.StatusBadRequest, "invalid or expired state parameter")
		return
	}

	// Exchange the GitHub authorization code for an access token.
	// We need to pass our /authorize/callback as the redirect_uri for consistency.
	tokenResp, err := h.exchangeCodeWithRedirect(code, h.serverURL+"/authorize/callback")
	if err != nil {
		log.Printf("mcpoauth: exchange GitHub code: %v", err)
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("GitHub token exchange failed: %v", err))
		return
	}

	// Fetch the user profile from GitHub.
	user, err := h.oauth.FetchUser(tokenResp.AccessToken)
	if err != nil {
		log.Printf("mcpoauth: fetch GitHub user: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to fetch GitHub user profile")
		return
	}

	// Determine auth method and create session with appropriate options.
	opts := SessionOptions{AuthMethod: AuthMethodOAuth}
	if strings.HasPrefix(tokenResp.AccessToken, "ghu_") {
		opts.AuthMethod = AuthMethodGitHubApp
		opts.RefreshToken = tokenResp.RefreshToken
		if tokenResp.ExpiresIn > 0 {
			opts.TokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
		}
	}

	// Create a server session (stores the GitHub token server-side).
	jwt, err := h.session.CreateSessionWithOptions(user, tokenResp.AccessToken, opts)
	if err != nil {
		log.Printf("mcpoauth: create session: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Extract the session ID from the JWT for the auth code entry.
	sessionUser, err := h.session.ValidateToken(jwt)
	if err != nil {
		log.Printf("mcpoauth: validate new session JWT: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Generate an authorization code bound to the client and PKCE challenge.
	authCode, err := h.codes.Issue(AuthCodeEntry{
		ClientID:      pending.clientID,
		RedirectURI:   pending.redirectURI,
		CodeChallenge: pending.codeChallenge,
		State:         pending.state,
		SessionID:     sessionUser.SessionID,
		UserID:        user.ID,
		Username:      user.Login,
	})
	if err != nil {
		log.Printf("mcpoauth: issue auth code: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to generate authorization code")
		return
	}

	// Redirect to the MCP client's callback URL with the authorization code.
	redirectURL, err := url.Parse(pending.redirectURI)
	if err != nil {
		log.Printf("mcpoauth: parse redirect URI: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "invalid redirect URI")
		return
	}

	q := redirectURL.Query()
	q.Set("code", authCode)
	if pending.state != "" {
		q.Set("state", pending.state)
	}
	redirectURL.RawQuery = q.Encode()

	http.Redirect(w, r, redirectURL.String(), http.StatusFound)
}

// --- Token Endpoint ---

// TokenRequest is the request body for POST /token.
type TokenRequest struct {
	GrantType    string `json:"grant_type"`
	Code         string `json:"code"`
	RedirectURI  string `json:"redirect_uri"`
	ClientID     string `json:"client_id"`
	CodeVerifier string `json:"code_verifier"`
}

// TokenResponse is the response body for POST /token.
type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

// HandleToken exchanges an authorization code for an access token.
//
// POST /token
//
// Accepts both application/x-www-form-urlencoded and application/json.
//
// Parameters:
//   - grant_type: must be "authorization_code"
//   - code: the authorization code from /authorize/callback
//   - redirect_uri: must match the original redirect_uri
//   - client_id: must match the original client_id
//   - code_verifier: PKCE code verifier (plain text, verified against stored S256 challenge)
//
// Response (200):
//
//	{
//	  "access_token": "eyJ...",
//	  "token_type": "Bearer",
//	  "expires_in": 86400
//	}
func (h *MCPOAuthHandler) HandleToken(w http.ResponseWriter, r *http.Request) {
	var grantType, code, redirectURI, clientID, codeVerifier string

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "application/json") {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
		if err != nil {
			writeOAuthError(w, http.StatusBadRequest, "invalid_request", "failed to read request body")
			return
		}
		var req TokenRequest
		if err := json.Unmarshal(body, &req); err != nil {
			writeOAuthError(w, http.StatusBadRequest, "invalid_request", "invalid JSON")
			return
		}
		grantType = req.GrantType
		code = req.Code
		redirectURI = req.RedirectURI
		clientID = req.ClientID
		codeVerifier = req.CodeVerifier
	} else {
		// application/x-www-form-urlencoded (default per OAuth spec)
		if err := r.ParseForm(); err != nil {
			writeOAuthError(w, http.StatusBadRequest, "invalid_request", "failed to parse form body")
			return
		}
		grantType = r.FormValue("grant_type")
		code = r.FormValue("code")
		redirectURI = r.FormValue("redirect_uri")
		clientID = r.FormValue("client_id")
		codeVerifier = r.FormValue("code_verifier")
	}

	if grantType != "authorization_code" {
		writeOAuthError(w, http.StatusBadRequest, "unsupported_grant_type", "grant_type must be authorization_code")
		return
	}

	if code == "" {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "missing code parameter")
		return
	}

	if codeVerifier == "" {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "missing code_verifier parameter (PKCE is required)")
		return
	}

	// Consume the authorization code (single-use).
	entry := h.codes.Consume(code)
	if entry == nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_grant", "invalid, expired, or already-used authorization code")
		return
	}

	// Validate client_id matches.
	if clientID != "" && clientID != entry.ClientID {
		writeOAuthError(w, http.StatusBadRequest, "invalid_grant", "client_id does not match the authorization request")
		return
	}

	// Validate redirect_uri matches.
	if redirectURI != "" && redirectURI != entry.RedirectURI {
		writeOAuthError(w, http.StatusBadRequest, "invalid_grant", "redirect_uri does not match the authorization request")
		return
	}

	// Verify PKCE code_verifier against stored code_challenge.
	if !VerifyCodeChallenge(codeVerifier, entry.CodeChallenge) {
		writeOAuthError(w, http.StatusBadRequest, "invalid_grant", "code_verifier does not match code_challenge")
		return
	}

	// Issue a JWT access token using the session created during authorization.
	// We create a new JWT (the session already exists from the authorize/callback step).
	now := time.Now()
	jwt, err := h.session.signSessionJWT(entry.SessionID, entry.UserID, entry.Username, now)
	if err != nil {
		log.Printf("mcpoauth: sign JWT: %v", err)
		writeOAuthError(w, http.StatusInternalServerError, "server_error", "failed to issue access token")
		return
	}

	resp := TokenResponse{
		AccessToken: jwt,
		TokenType:   "Bearer",
		ExpiresIn:   int(h.session.ttl.Seconds()),
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	json.NewEncoder(w).Encode(resp)
}

// --- Internal helpers ---

// storePendingAuth stores a pending authorization keyed by internal state.
func (h *MCPOAuthHandler) storePendingAuth(internalState string, auth pendingAuth) {
	h.pendingMu.Lock()
	defer h.pendingMu.Unlock()

	// Clean expired entries.
	now := time.Now()
	for k, v := range h.pendingAuths {
		if now.After(v.expiresAt) {
			delete(h.pendingAuths, k)
		}
	}

	h.pendingAuths[internalState] = &auth
}

// consumePendingAuth retrieves and removes a pending authorization by internal state.
// Returns nil if not found or expired.
func (h *MCPOAuthHandler) consumePendingAuth(internalState string) *pendingAuth {
	h.pendingMu.Lock()
	defer h.pendingMu.Unlock()

	auth, exists := h.pendingAuths[internalState]
	if !exists {
		return nil
	}

	delete(h.pendingAuths, internalState)

	if time.Now().After(auth.expiresAt) {
		return nil
	}

	return auth
}

// exchangeCodeWithRedirect exchanges a GitHub authorization code for an access token,
// passing the redirect_uri parameter that was used in the authorize request.
func (h *MCPOAuthHandler) exchangeCodeWithRedirect(code, redirectURI string) (*OAuthTokenResponse, error) {
	data := url.Values{
		"client_id":     {h.oauth.ClientID},
		"client_secret": {h.oauth.ClientSecret},
		"code":          {code},
		"redirect_uri":  {redirectURI},
	}

	tokenURL := h.oauth.BaseURL + "/login/oauth/access_token"
	req, err := http.NewRequest(http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := h.oauth.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp OAuthTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		var errResp struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		if err := json.Unmarshal(body, &errResp); err == nil && errResp.Error != "" {
			return nil, fmt.Errorf("token exchange failed: %s — %s", errResp.Error, errResp.ErrorDescription)
		}
		return nil, fmt.Errorf("empty access token in response")
	}

	return &tokenResp, nil
}

// writeOAuthError writes an OAuth 2.0 error response per RFC 6749 Section 5.2.
func writeOAuthError(w http.ResponseWriter, status int, errorCode, description string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":             errorCode,
		"error_description": description,
	})
}

// PendingAuthCount returns the number of pending authorization requests (for testing).
func (h *MCPOAuthHandler) PendingAuthCount() int {
	h.pendingMu.Lock()
	defer h.pendingMu.Unlock()
	return len(h.pendingAuths)
}

// PendingCodeCount returns the number of pending authorization codes (for testing).
func (h *MCPOAuthHandler) PendingCodeCount() int {
	return h.codes.PendingCount()
}

// RegisteredClientCount returns the number of registered DCR clients (for testing).
func (h *MCPOAuthHandler) RegisteredClientCount() int {
	return h.clients.ClientCount()
}
