package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// --- Test helpers ---

// newTestMCPOAuthHandler creates a MCPOAuthHandler backed by a mock GitHub server.
func newTestMCPOAuthHandler(t *testing.T, ghServer *httptest.Server) (*MCPOAuthHandler, *SessionManager) {
	t.Helper()
	sm := newTestSessionManager(t)
	oauth := testOAuthConfig(ghServer)
	serverURL := "https://epf.example.com"
	handler := NewMCPOAuthHandler(oauth, sm, serverURL)
	return handler, sm
}

// newTestMux creates a mux with MCP OAuth routes registered.
func newTestMux(t *testing.T, ghServer *httptest.Server) (*http.ServeMux, *MCPOAuthHandler, *SessionManager) {
	t.Helper()
	handler, sm := newTestMCPOAuthHandler(t, ghServer)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)
	return mux, handler, sm
}

// registerTestClient registers a test client via DCR and returns the client_id.
func registerTestClient(t *testing.T, mux *http.ServeMux, redirectURI string) string {
	t.Helper()
	body := `{"client_name":"test-client","redirect_uris":["` + redirectURI + `"]}`
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("DCR register: status = %d, want %d, body: %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp DCRResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode DCR response: %v", err)
	}
	return resp.ClientID
}

// generatePKCE generates a code_verifier and code_challenge pair for testing.
func generatePKCE() (verifier, challenge string) {
	verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" // RFC 7636 test vector
	h := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(h[:])
	return
}

// --- Protected Resource Metadata tests ---

func TestHandleProtectedResourceMetadata(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	req := httptest.NewRequest(http.MethodGet, "/.well-known/oauth-protected-resource", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var resp ProtectedResourceMetadata
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if resp.Resource != "https://epf.example.com" {
		t.Errorf("resource = %q, want https://epf.example.com", resp.Resource)
	}
	if len(resp.AuthorizationServers) != 1 || resp.AuthorizationServers[0] != "https://epf.example.com" {
		t.Errorf("authorization_servers = %v, want [https://epf.example.com]", resp.AuthorizationServers)
	}
	if len(resp.BearerMethodsSupported) != 1 || resp.BearerMethodsSupported[0] != "header" {
		t.Errorf("bearer_methods_supported = %v, want [header]", resp.BearerMethodsSupported)
	}
}

// --- Authorization Server Metadata tests ---

func TestHandleAuthorizationServerMetadata(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	req := httptest.NewRequest(http.MethodGet, "/.well-known/oauth-authorization-server", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp AuthorizationServerMetadata
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if resp.Issuer != "https://epf.example.com" {
		t.Errorf("issuer = %q", resp.Issuer)
	}
	if resp.AuthorizationEndpoint != "https://epf.example.com/authorize" {
		t.Errorf("authorization_endpoint = %q", resp.AuthorizationEndpoint)
	}
	if resp.TokenEndpoint != "https://epf.example.com/token" {
		t.Errorf("token_endpoint = %q", resp.TokenEndpoint)
	}
	if resp.RegistrationEndpoint != "https://epf.example.com/register" {
		t.Errorf("registration_endpoint = %q", resp.RegistrationEndpoint)
	}
	if len(resp.CodeChallengeMethodsSupported) != 1 || resp.CodeChallengeMethodsSupported[0] != "S256" {
		t.Errorf("code_challenge_methods_supported = %v, want [S256]", resp.CodeChallengeMethodsSupported)
	}
}

// --- Dynamic Client Registration tests ---

func TestHandleRegister_Success(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, handler, _ := newTestMux(t, ghServer)

	body := `{"client_name":"Claude Desktop","redirect_uris":["http://localhost:3000/callback"]}`
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var resp DCRResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if resp.ClientID == "" {
		t.Error("client_id should not be empty")
	}
	if !strings.HasPrefix(resp.ClientID, "epf-") {
		t.Errorf("client_id should start with 'epf-', got %q", resp.ClientID)
	}
	if resp.ClientName != "Claude Desktop" {
		t.Errorf("client_name = %q, want 'Claude Desktop'", resp.ClientName)
	}
	if resp.TokenEndpointAuthMethod != "none" {
		t.Errorf("token_endpoint_auth_method = %q, want 'none'", resp.TokenEndpointAuthMethod)
	}
	if handler.RegisteredClientCount() != 1 {
		t.Errorf("RegisteredClientCount() = %d, want 1", handler.RegisteredClientCount())
	}
}

func TestHandleRegister_MissingRedirectURIs(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	body := `{"client_name":"test"}`
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleRegister_InvalidRedirectURI(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	body := `{"redirect_uris":["not-a-url"]}`
	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleRegister_InvalidJSON(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

// --- Authorization Endpoint tests ---

func TestHandleAuthorize_RedirectsToGitHub(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, handler, _ := newTestMux(t, ghServer)

	// First register a client.
	redirectURI := "http://localhost:3000/callback"
	clientID := registerTestClient(t, mux, redirectURI)
	_, challenge := generatePKCE()

	// Build authorize URL.
	params := url.Values{
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
		"response_type":         {"code"},
		"state":                 {"client-state-123"},
	}
	req := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusFound, rec.Body.String())
	}

	location := rec.Header().Get("Location")
	if !strings.Contains(location, "/login/oauth/authorize") {
		t.Errorf("Location should redirect to GitHub, got: %s", location)
	}
	if !strings.Contains(location, "client_id=test-client-id") {
		t.Errorf("Location should contain GitHub OAuth client_id, got: %s", location)
	}
	if !strings.Contains(location, "redirect_uri=") {
		t.Errorf("Location should contain redirect_uri to /authorize/callback, got: %s", location)
	}

	// Should have a pending authorization.
	if handler.PendingAuthCount() != 1 {
		t.Errorf("PendingAuthCount() = %d, want 1", handler.PendingAuthCount())
	}
}

func TestHandleAuthorize_MissingClientID(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	req := httptest.NewRequest(http.MethodGet, "/authorize?redirect_uri=http://x.com/cb&code_challenge=abc&code_challenge_method=S256&response_type=code", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleAuthorize_MissingPKCE(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	redirectURI := "http://localhost:3000/callback"
	clientID := registerTestClient(t, mux, redirectURI)

	params := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {redirectURI},
		"response_type": {"code"},
	}
	req := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleAuthorize_UnregisteredClient(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)
	_, challenge := generatePKCE()

	params := url.Values{
		"client_id":             {"nonexistent-client"},
		"redirect_uri":          {"http://localhost:3000/callback"},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
		"response_type":         {"code"},
	}
	req := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

// --- Full Authorization Code Flow tests ---

func TestFullAuthorizationCodeFlow(t *testing.T) {
	mockUser := &GitHubUser{
		ID:    42,
		Login: "octocat",
		Name:  "The Octocat",
	}
	ghServer := mockOAuthServer(t, "gho_test_token", mockUser)
	defer ghServer.Close()

	handler, sm := newTestMCPOAuthHandler(t, ghServer)
	// Override server URL to use the mock server URL for token exchange.
	handler.oauth.BaseURL = ghServer.URL
	handler.oauth.APIBaseURL = ghServer.URL
	handler.serverURL = "https://epf.example.com"

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Step 1: Register a client.
	redirectURI := "http://localhost:3000/callback"
	clientID := registerTestClient(t, mux, redirectURI)

	// Step 2: Start authorization.
	verifier, challenge := generatePKCE()
	params := url.Values{
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
		"response_type":         {"code"},
		"state":                 {"my-state"},
	}
	authReq := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	authRec := httptest.NewRecorder()
	mux.ServeHTTP(authRec, authReq)

	if authRec.Code != http.StatusFound {
		t.Fatalf("authorize: status = %d, want %d", authRec.Code, http.StatusFound)
	}

	// Extract the internal state from the GitHub redirect URL.
	githubRedirect := authRec.Header().Get("Location")
	internalState := extractQueryParam(t, githubRedirect, "state")

	// Step 3: Simulate GitHub callback to /authorize/callback.
	callbackReq := httptest.NewRequest(http.MethodGet,
		"/authorize/callback?code=gh-auth-code&state="+internalState, nil)
	callbackRec := httptest.NewRecorder()
	mux.ServeHTTP(callbackRec, callbackReq)

	if callbackRec.Code != http.StatusFound {
		t.Fatalf("authorize/callback: status = %d, want %d, body: %s",
			callbackRec.Code, http.StatusFound, callbackRec.Body.String())
	}

	// The redirect should go to the client's redirect_uri with code and state.
	clientRedirect := callbackRec.Header().Get("Location")
	if !strings.HasPrefix(clientRedirect, redirectURI) {
		t.Fatalf("callback redirect should go to client redirect URI, got: %s", clientRedirect)
	}

	authCode := extractQueryParam(t, clientRedirect, "code")
	if authCode == "" {
		t.Fatal("missing authorization code in redirect")
	}

	returnedState := extractQueryParam(t, clientRedirect, "state")
	if returnedState != "my-state" {
		t.Errorf("state = %q, want 'my-state'", returnedState)
	}

	// Step 4: Exchange the authorization code for an access token.
	tokenBody := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {authCode},
		"redirect_uri":  {redirectURI},
		"client_id":     {clientID},
		"code_verifier": {verifier},
	}
	tokenReq := httptest.NewRequest(http.MethodPost, "/token",
		strings.NewReader(tokenBody.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec := httptest.NewRecorder()
	mux.ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("token: status = %d, want %d, body: %s",
			tokenRec.Code, http.StatusOK, tokenRec.Body.String())
	}

	var tokenResp TokenResponse
	if err := json.NewDecoder(tokenRec.Body).Decode(&tokenResp); err != nil {
		t.Fatalf("decode token response: %v", err)
	}

	if tokenResp.AccessToken == "" {
		t.Error("access_token should not be empty")
	}
	if tokenResp.TokenType != "Bearer" {
		t.Errorf("token_type = %q, want 'Bearer'", tokenResp.TokenType)
	}
	if tokenResp.ExpiresIn <= 0 {
		t.Errorf("expires_in = %d, want > 0", tokenResp.ExpiresIn)
	}

	// Step 5: Validate the access token.
	user, err := sm.ValidateToken(tokenResp.AccessToken)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if user.UserID != 42 {
		t.Errorf("user.UserID = %d, want 42", user.UserID)
	}
	if user.Username != "octocat" {
		t.Errorf("user.Username = %q, want 'octocat'", user.Username)
	}
}

// --- Token Endpoint tests ---

func TestHandleToken_InvalidGrantType(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	body := url.Values{"grant_type": {"client_credentials"}}
	req := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(body.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] != "unsupported_grant_type" {
		t.Errorf("error = %q, want 'unsupported_grant_type'", resp["error"])
	}
}

func TestHandleToken_MissingCode(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	body := url.Values{
		"grant_type":    {"authorization_code"},
		"code_verifier": {"verifier"},
	}
	req := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(body.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleToken_InvalidCode(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	body := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {"nonexistent-code"},
		"code_verifier": {"verifier"},
	}
	req := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(body.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] != "invalid_grant" {
		t.Errorf("error = %q, want 'invalid_grant'", resp["error"])
	}
}

func TestHandleToken_WrongCodeVerifier(t *testing.T) {
	mockUser := &GitHubUser{ID: 42, Login: "octocat"}
	ghServer := mockOAuthServer(t, "gho_test", mockUser)
	defer ghServer.Close()

	handler, _ := newTestMCPOAuthHandler(t, ghServer)
	handler.oauth.BaseURL = ghServer.URL
	handler.oauth.APIBaseURL = ghServer.URL

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	redirectURI := "http://localhost:3000/callback"
	clientID := registerTestClient(t, mux, redirectURI)
	_, challenge := generatePKCE()

	// Authorize.
	params := url.Values{
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
		"response_type":         {"code"},
	}
	authReq := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	authRec := httptest.NewRecorder()
	mux.ServeHTTP(authRec, authReq)

	githubRedirect := authRec.Header().Get("Location")
	internalState := extractQueryParam(t, githubRedirect, "state")

	// Callback.
	cbReq := httptest.NewRequest(http.MethodGet, "/authorize/callback?code=gh-code&state="+internalState, nil)
	cbRec := httptest.NewRecorder()
	mux.ServeHTTP(cbRec, cbReq)

	clientRedirect := cbRec.Header().Get("Location")
	authCode := extractQueryParam(t, clientRedirect, "code")

	// Token exchange with WRONG verifier.
	tokenBody := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {authCode},
		"code_verifier": {"wrong-verifier-that-does-not-match"},
	}
	tokenReq := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(tokenBody.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec := httptest.NewRecorder()
	mux.ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", tokenRec.Code, http.StatusBadRequest)
	}

	var resp map[string]string
	json.NewDecoder(tokenRec.Body).Decode(&resp)
	if resp["error"] != "invalid_grant" {
		t.Errorf("error = %q, want 'invalid_grant'", resp["error"])
	}
}

func TestHandleToken_CodeSingleUse(t *testing.T) {
	mockUser := &GitHubUser{ID: 42, Login: "octocat"}
	ghServer := mockOAuthServer(t, "gho_test", mockUser)
	defer ghServer.Close()

	handler, _ := newTestMCPOAuthHandler(t, ghServer)
	handler.oauth.BaseURL = ghServer.URL
	handler.oauth.APIBaseURL = ghServer.URL

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	redirectURI := "http://localhost:3000/callback"
	clientID := registerTestClient(t, mux, redirectURI)
	verifier, challenge := generatePKCE()

	// Authorize + callback.
	params := url.Values{
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
		"response_type":         {"code"},
	}
	authReq := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	authRec := httptest.NewRecorder()
	mux.ServeHTTP(authRec, authReq)

	githubRedirect := authRec.Header().Get("Location")
	internalState := extractQueryParam(t, githubRedirect, "state")

	cbReq := httptest.NewRequest(http.MethodGet, "/authorize/callback?code=gh-code&state="+internalState, nil)
	cbRec := httptest.NewRecorder()
	mux.ServeHTTP(cbRec, cbReq)

	clientRedirect := cbRec.Header().Get("Location")
	authCode := extractQueryParam(t, clientRedirect, "code")

	// First token exchange should succeed.
	tokenBody := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {authCode},
		"code_verifier": {verifier},
	}
	tokenReq := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(tokenBody.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec := httptest.NewRecorder()
	mux.ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("first exchange: status = %d, want %d, body: %s",
			tokenRec.Code, http.StatusOK, tokenRec.Body.String())
	}

	// Second exchange with same code should fail (single-use).
	tokenReq2 := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(tokenBody.Encode()))
	tokenReq2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec2 := httptest.NewRecorder()
	mux.ServeHTTP(tokenRec2, tokenReq2)

	if tokenRec2.Code != http.StatusBadRequest {
		t.Fatalf("second exchange: status = %d, want %d (single-use)", tokenRec2.Code, http.StatusBadRequest)
	}
}

func TestHandleToken_JSONContentType(t *testing.T) {
	mockUser := &GitHubUser{ID: 42, Login: "octocat"}
	ghServer := mockOAuthServer(t, "gho_test", mockUser)
	defer ghServer.Close()

	handler, _ := newTestMCPOAuthHandler(t, ghServer)
	handler.oauth.BaseURL = ghServer.URL
	handler.oauth.APIBaseURL = ghServer.URL

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	redirectURI := "http://localhost:3000/callback"
	clientID := registerTestClient(t, mux, redirectURI)
	verifier, challenge := generatePKCE()

	// Authorize + callback.
	params := url.Values{
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
		"response_type":         {"code"},
	}
	authReq := httptest.NewRequest(http.MethodGet, "/authorize?"+params.Encode(), nil)
	authRec := httptest.NewRecorder()
	mux.ServeHTTP(authRec, authReq)

	githubRedirect := authRec.Header().Get("Location")
	internalState := extractQueryParam(t, githubRedirect, "state")

	cbReq := httptest.NewRequest(http.MethodGet, "/authorize/callback?code=gh-code&state="+internalState, nil)
	cbRec := httptest.NewRecorder()
	mux.ServeHTTP(cbRec, cbReq)

	clientRedirect := cbRec.Header().Get("Location")
	authCode := extractQueryParam(t, clientRedirect, "code")

	// Exchange with JSON body.
	jsonBody := `{"grant_type":"authorization_code","code":"` + authCode + `","code_verifier":"` + verifier + `","client_id":"` + clientID + `"}`
	tokenReq := httptest.NewRequest(http.MethodPost, "/token", strings.NewReader(jsonBody))
	tokenReq.Header.Set("Content-Type", "application/json")
	tokenRec := httptest.NewRecorder()
	mux.ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", tokenRec.Code, http.StatusOK, tokenRec.Body.String())
	}
}

// --- Authorization code store tests ---

func TestAuthCodeStore_IssueAndConsume(t *testing.T) {
	store := NewAuthCodeStore()

	code, err := store.Issue(AuthCodeEntry{
		ClientID:  "client-1",
		SessionID: "session-1",
		UserID:    42,
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	entry := store.Consume(code)
	if entry == nil {
		t.Fatal("Consume returned nil for valid code")
	}
	if entry.ClientID != "client-1" {
		t.Errorf("ClientID = %q, want 'client-1'", entry.ClientID)
	}
	if entry.UserID != 42 {
		t.Errorf("UserID = %d, want 42", entry.UserID)
	}
}

func TestAuthCodeStore_SingleUse(t *testing.T) {
	store := NewAuthCodeStore()

	code, _ := store.Issue(AuthCodeEntry{ClientID: "test"})

	// First consume succeeds.
	if store.Consume(code) == nil {
		t.Fatal("first Consume should succeed")
	}

	// Second consume fails.
	if store.Consume(code) != nil {
		t.Error("second Consume should return nil (single-use)")
	}
}

func TestAuthCodeStore_NonexistentCode(t *testing.T) {
	store := NewAuthCodeStore()

	if store.Consume("nonexistent") != nil {
		t.Error("Consume should return nil for nonexistent code")
	}
}

// --- DCR store tests ---

func TestDCRStore_RegisterAndLookup(t *testing.T) {
	store := NewDCRStore()

	client, err := store.Register("Test Client", []string{"http://localhost/cb"})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	if client.ClientID == "" {
		t.Error("client_id should not be empty")
	}

	looked := store.Lookup(client.ClientID)
	if looked == nil {
		t.Fatal("Lookup returned nil for registered client")
	}
	if looked.ClientName != "Test Client" {
		t.Errorf("ClientName = %q, want 'Test Client'", looked.ClientName)
	}
}

func TestDCRStore_ValidateRedirectURI(t *testing.T) {
	store := NewDCRStore()

	client, _ := store.Register("test", []string{"http://localhost/cb", "http://other/cb"})

	if !store.ValidateRedirectURI(client.ClientID, "http://localhost/cb") {
		t.Error("should validate registered redirect URI")
	}
	if !store.ValidateRedirectURI(client.ClientID, "http://other/cb") {
		t.Error("should validate second registered redirect URI")
	}
	if store.ValidateRedirectURI(client.ClientID, "http://evil.com/cb") {
		t.Error("should reject unregistered redirect URI")
	}
	if store.ValidateRedirectURI("nonexistent", "http://localhost/cb") {
		t.Error("should reject nonexistent client")
	}
}

// --- PKCE tests ---

func TestVerifyCodeChallenge_Success(t *testing.T) {
	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	h := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(h[:])

	if !VerifyCodeChallenge(verifier, challenge) {
		t.Error("VerifyCodeChallenge should return true for matching pair")
	}
}

func TestVerifyCodeChallenge_Failure(t *testing.T) {
	if VerifyCodeChallenge("wrong-verifier", "wrong-challenge") {
		t.Error("VerifyCodeChallenge should return false for mismatched pair")
	}
}

func TestVerifyCodeChallenge_EmptyInputs(t *testing.T) {
	if VerifyCodeChallenge("", "challenge") {
		t.Error("should reject empty verifier")
	}
	if VerifyCodeChallenge("verifier", "") {
		t.Error("should reject empty challenge")
	}
	if VerifyCodeChallenge("", "") {
		t.Error("should reject both empty")
	}
}

// --- WWW-Authenticate header tests ---

func TestMiddleware_WWWAuthenticateHeader_WithServerURL(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "https://epf.example.com")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}

	wwwAuth := rec.Header().Get("WWW-Authenticate")
	if wwwAuth == "" {
		t.Fatal("missing WWW-Authenticate header")
	}

	expected := `Bearer resource_metadata="https://epf.example.com/.well-known/oauth-protected-resource"`
	if wwwAuth != expected {
		t.Errorf("WWW-Authenticate = %q, want %q", wwwAuth, expected)
	}
}

func TestMiddleware_WWWAuthenticateHeader_WithoutServerURL(t *testing.T) {
	sm := newTestSessionManager(t)
	mw := NewAuthMiddleware(sm, ModeMultiTenant, "")
	handler := mw.Wrap(echoHandler)

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}

	// No WWW-Authenticate header when serverURL is empty.
	wwwAuth := rec.Header().Get("WWW-Authenticate")
	if wwwAuth != "" {
		t.Errorf("WWW-Authenticate should be empty when serverURL is empty, got: %q", wwwAuth)
	}
}

// --- Route registration tests ---

func TestMCPOAuthRegisterRoutes(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	mux, _, _ := newTestMux(t, ghServer)

	// All metadata endpoints should be reachable.
	tests := []struct {
		method string
		path   string
		want   int
	}{
		{http.MethodGet, "/.well-known/oauth-protected-resource", http.StatusOK},
		{http.MethodGet, "/.well-known/oauth-authorization-server", http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d", rec.Code, tt.want)
			}
		})
	}
}

// --- Pending auth expiry test ---

func TestPendingAuth_Expiry(t *testing.T) {
	ghServer := mockOAuthServer(t, "gho_test", &GitHubUser{ID: 1, Login: "test"})
	defer ghServer.Close()

	handler, _ := newTestMCPOAuthHandler(t, ghServer)

	// Store a pending auth that's already expired.
	handler.storePendingAuth("expired-state", pendingAuth{
		clientID:  "test",
		expiresAt: time.Now().Add(-1 * time.Minute),
	})

	// Consume should return nil.
	if handler.consumePendingAuth("expired-state") != nil {
		t.Error("consumePendingAuth should return nil for expired state")
	}
}
