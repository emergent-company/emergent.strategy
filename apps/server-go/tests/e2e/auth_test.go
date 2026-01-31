package e2e

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
	"github.com/emergent/emergent-core/pkg/auth"
)

// AuthTestSuite tests authentication and authorization
type AuthTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestAuthSuite(t *testing.T) {
	suite.Run(t, new(AuthTestSuite))
}

func (s *AuthTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "auth")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *AuthTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *AuthTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)
}

// =============================================================================
// Test: Missing Authentication
// =============================================================================

func (s *AuthTestSuite) TestMissingAuth() {
	// Request without Authorization header should fail
	resp := s.server.GET("/api/v2/test/me")

	s.Equal(http.StatusUnauthorized, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	// Check error format matches NestJS
	errObj, ok := body["error"].(map[string]any)
	s.True(ok, "Expected error object in response")
	s.Equal("missing_token", errObj["code"])
}

// =============================================================================
// Test: Static Test Tokens (Development Mode)
// =============================================================================

func (s *AuthTestSuite) TestE2ETokenPattern() {
	// e2e-test-user maps to the AdminUser fixture (test-admin-user)
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth("e2e-test-user"))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	// Check user info - e2e-test-user maps to test-admin-user
	s.Equal("test-admin-user", body["sub"])
	s.Equal(testutil.AdminUser.ID, body["id"])

	// Should have all scopes
	scopes, ok := body["scopes"].([]any)
	s.True(ok)
	s.GreaterOrEqual(len(scopes), 10, "e2e token should have many scopes")
}

func (s *AuthTestSuite) TestWithScopeToken() {
	// "with-scope" token should have specific scopes
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth("with-scope"))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	s.Equal("test-user-with-scope", body["sub"])

	// Check specific scopes are present
	scopes, ok := body["scopes"].([]any)
	s.True(ok)
	scopeSet := make(map[string]bool)
	for _, sc := range scopes {
		scopeSet[sc.(string)] = true
	}
	s.True(scopeSet["documents:read"], "Should have documents:read")
	s.True(scopeSet["documents:write"], "Should have documents:write")
	s.True(scopeSet["project:read"], "Should have project:read")
}

func (s *AuthTestSuite) TestNoScopeToken() {
	// "no-scope" token should work but have no scopes
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth("no-scope"))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	s.Equal("test-user-no-scope", body["sub"])

	// Should have empty scopes
	scopes, ok := body["scopes"].([]any)
	s.True(ok)
	s.Len(scopes, 0, "no-scope token should have no scopes")
}

func (s *AuthTestSuite) TestAllScopesToken() {
	// "all-scopes" token should have all available scopes
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth("all-scopes"))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	s.Equal("test-user-all-scopes", body["sub"])

	// Should have all scopes
	scopes, ok := body["scopes"].([]any)
	s.True(ok)
	allScopes := auth.GetAllScopes()
	s.Len(scopes, len(allScopes), "all-scopes token should have all scopes")
}

// =============================================================================
// Test: Scope Validation
// =============================================================================

func (s *AuthTestSuite) TestScopeRequired_HasScope() {
	// User with documents:read scope should access /scoped endpoint
	resp := s.server.GET("/api/v2/test/scoped", testutil.WithAuth("with-scope"))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)
	s.Equal("You have documents:read scope", body["message"])
}

func (s *AuthTestSuite) TestScopeRequired_MissingScope() {
	// User without documents:read scope should be forbidden
	resp := s.server.GET("/api/v2/test/scoped", testutil.WithAuth("no-scope"))

	s.Equal(http.StatusForbidden, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
	s.Equal("Insufficient permissions", errObj["message"])

	// Check missing scopes in details
	details, ok := errObj["details"].(map[string]any)
	s.True(ok)
	missing, ok := details["missing"].([]any)
	s.True(ok)
	s.Contains(missing, "documents:read")
}

// =============================================================================
// Test: Project ID Header
// =============================================================================

func (s *AuthTestSuite) TestProjectIDRequired_HasProjectID() {
	// Request with X-Project-ID should work
	resp := s.server.GET("/api/v2/test/project",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID("test-project-123"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)
	s.Equal("test-project-123", body["projectId"])
}

func (s *AuthTestSuite) TestProjectIDRequired_MissingProjectID() {
	// Request without X-Project-ID should fail with 400
	resp := s.server.GET("/api/v2/test/project",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *AuthTestSuite) TestHeaderExtraction() {
	// Both X-Project-ID and X-Org-ID should be extracted
	resp := s.server.GET("/api/v2/test/me",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID("project-123"),
		testutil.WithOrgID("org-456"),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	s.Equal("project-123", body["projectId"])
	s.Equal("org-456", body["orgId"])
}

// =============================================================================
// Test: API Tokens (emt_* prefix)
// =============================================================================

func (s *AuthTestSuite) TestAPIToken_Valid() {
	// Create test user first
	err := testutil.CreateTestUser(s.ctx, s.testDB.DB, testutil.AdminUser)
	s.Require().NoError(err)

	// Create test project (required for API token FK)
	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.DefaultTestProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create API token
	token := "emt_test_token_12345"
	scopes := []string{"documents:read", "documents:write"}
	err = testutil.CreateTestAPIToken(s.ctx, s.testDB.DB, testutil.AdminUser.ID, token, scopes, testutil.DefaultTestProject.ID)
	s.Require().NoError(err)

	// Use the API token
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth(token))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	// Should have the token's scopes
	scopesArr, ok := body["scopes"].([]any)
	s.True(ok)
	s.Len(scopesArr, 2)
}

func (s *AuthTestSuite) TestAPIToken_Expired() {
	// Create test user
	err := testutil.CreateTestUser(s.ctx, s.testDB.DB, testutil.AdminUser)
	s.Require().NoError(err)

	// Create test project
	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.DefaultTestProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create expired (revoked) API token
	token := "emt_expired_token_12345"
	err = testutil.CreateExpiredAPIToken(s.ctx, s.testDB.DB, testutil.AdminUser.ID, token, testutil.DefaultTestProject.ID)
	s.Require().NoError(err)

	// Use the expired token
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth(token))

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *AuthTestSuite) TestAPIToken_Deleted() {
	// Create test user
	err := testutil.CreateTestUser(s.ctx, s.testDB.DB, testutil.AdminUser)
	s.Require().NoError(err)

	// Create test project
	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.DefaultTestProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create deleted (revoked) API token
	token := "emt_deleted_token_12345"
	err = testutil.CreateDeletedAPIToken(s.ctx, s.testDB.DB, testutil.AdminUser.ID, token, testutil.DefaultTestProject.ID)
	s.Require().NoError(err)

	// Use the deleted token
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth(token))

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *AuthTestSuite) TestAPIToken_Invalid() {
	// Use a token that doesn't exist
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth("emt_nonexistent_token"))

	s.Equal(http.StatusUnauthorized, resp.Code)
}

// =============================================================================
// Test: Invalid Auth Header Formats
// =============================================================================

func (s *AuthTestSuite) TestInvalidAuthHeader_NoBearer() {
	// Auth header without "Bearer " prefix
	resp := s.server.GET("/api/v2/test/me", testutil.WithRawAuth("invalid-token"))

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *AuthTestSuite) TestInvalidAuthHeader_EmptyBearer() {
	// Auth header with empty token after Bearer
	resp := s.server.GET("/api/v2/test/me", testutil.WithRawAuth("Bearer "))

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *AuthTestSuite) TestInvalidToken() {
	// Random invalid token (not matching any pattern)
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth("random-invalid-token"))

	s.Equal(http.StatusUnauthorized, resp.Code)
}

// =============================================================================
// Test: Token from Query Parameter
// =============================================================================

func (s *AuthTestSuite) TestTokenFromQueryParam() {
	// Token can be passed via ?token= query parameter (for SSE endpoints)
	// e2e-query-token maps to test-admin-user
	resp := s.server.GET("/api/v2/test/me?token=e2e-query-token")

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)
	s.Equal("test-admin-user", body["sub"])
}

// =============================================================================
// Test: Cached Introspection
// =============================================================================

// =============================================================================
// Test: Auth Errors on Real Endpoints (ported from security.auth-errors.e2e.spec.ts)
// These tests verify auth behavior on actual API endpoints, not test endpoints
// =============================================================================

func (s *AuthTestSuite) TestDocuments_MissingAuth_Returns401() {
	// Request without Authorization header should fail with 401
	resp := s.server.POST("/api/v2/documents",
		testutil.WithProjectID("test-project-id"),
		testutil.WithJSONBody(map[string]any{
			"filename": "test.txt",
			"content":  "test content",
		}),
	)
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *AuthTestSuite) TestDocuments_MalformedToken_Returns401() {
	// Request with malformed token should fail with 401
	resp := s.server.POST("/api/v2/documents",
		testutil.WithRawAuth("Bearer !!!broken!!!"),
		testutil.WithProjectID("test-project-id"),
		testutil.WithJSONBody(map[string]any{
			"filename": "test.txt",
			"content":  "test content",
		}),
	)
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *AuthTestSuite) TestDocuments_NoScopeToken_Returns403() {
	// Request with no-scope token should fail with 403 (scope enforcement)
	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID("test-project-id"),
		testutil.WithJSONBody(map[string]any{
			"filename": "test.txt",
			"content":  "test content",
		}),
	)
	s.Equal(http.StatusForbidden, resp.Code)
}

func (s *AuthTestSuite) TestDocuments_MissingProjectHeader_Returns400() {
	// Request without X-Project-ID should fail with 400
	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("all-scopes"),
		testutil.WithJSONBody(map[string]any{
			"filename": "test.txt",
			"content":  "test content",
		}),
	)
	s.Equal(http.StatusBadRequest, resp.Code)
}

// =============================================================================
// Test: Cached Introspection
// =============================================================================

func (s *AuthTestSuite) TestCachedIntrospection() {
	// Create a test user for the cached introspection result
	cachedUser := testutil.TestUser{
		ID:            "00000000-0000-0000-0000-000000000010",
		ZitadelUserID: "cached-user-sub",
		Email:         "cached@test.local",
		FirstName:     "Cached",
		LastName:      "User",
		Scopes:        []string{"documents:read"},
	}
	err := testutil.CreateTestUser(s.ctx, s.testDB.DB, cachedUser)
	s.Require().NoError(err)

	// Cache an introspection result
	token := "cached-token-12345"
	err = testutil.CacheIntrospectionResult(s.ctx, s.testDB.DB,
		token,
		"cached-user-sub",
		"cached@test.local",
		[]string{"documents:read"},
		5*time.Minute, // 5 minutes
	)
	s.Require().NoError(err)

	// Use the token - should use cached result
	resp := s.server.GET("/api/v2/test/me", testutil.WithAuth(token))

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	s.Equal("cached-user-sub", body["sub"])

	// Check scopes from cache
	scopes, ok := body["scopes"].([]any)
	s.True(ok)
	s.Len(scopes, 1)
	s.Equal("documents:read", scopes[0])
}
