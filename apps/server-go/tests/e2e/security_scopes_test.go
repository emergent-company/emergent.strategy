package e2e

import (
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// SecurityScopesTestSuite tests scope-based authorization enforcement using HTTP-only calls.
// This test suite is portable and can run against either Go or NestJS server implementations.
//
// Environment variables:
//   - TEST_SERVER_URL: External server URL (e.g., "http://localhost:3002" for Go, "http://localhost:3000" for NestJS)
//   - If not set, uses in-process Go test server (requires DB access)
type SecurityScopesTestSuite struct {
	suite.Suite
	client *testutil.HTTPClient

	// For in-process testing only
	testDB *testutil.TestDB
	server *testutil.TestServer

	// Test project (created via API)
	projectID string
	orgID     string
}

func TestSecurityScopesSuite(t *testing.T) {
	suite.Run(t, new(SecurityScopesTestSuite))
}

func (s *SecurityScopesTestSuite) SetupSuite() {
	// Check if we're using external server
	if serverURL := os.Getenv("TEST_SERVER_URL"); serverURL != "" {
		s.T().Logf("Using external server: %s", serverURL)
		s.client = testutil.NewExternalHTTPClient(serverURL)
	} else {
		// Fall back to in-process server (requires DB)
		s.T().Log("Using in-process test server")

		testDB, err := testutil.SetupTestDB(s.Suite.T().Context(), "security_scopes")
		s.Require().NoError(err, "Failed to setup test database")
		s.testDB = testDB

		s.server = testutil.NewTestServer(testDB)
		s.client = testutil.NewHTTPClient(s.server.Echo)
	}
}

func (s *SecurityScopesTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *SecurityScopesTestSuite) SetupTest() {
	// For in-process testing, reset DB state
	if s.testDB != nil {
		err := testutil.TruncateTables(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)

		err = testutil.SetupTestFixtures(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)
	}

	// Create test org and project via API
	var err error

	// Use e2e-test-user which has all scopes for setup
	s.orgID, err = s.client.CreateOrg("Security Test Org", "e2e-test-user")
	s.Require().NoError(err, "Failed to create org")

	s.projectID, err = s.client.CreateProject("Security Test Project", s.orgID, "e2e-test-user")
	s.Require().NoError(err, "Failed to create project")
}

// =============================================================================
// Test: Documents Endpoint Scope Enforcement
// =============================================================================

func (s *SecurityScopesTestSuite) TestDocuments_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.client.GET("/api/v2/documents",
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestDocuments_DeniesNoScopeToken() {
	// Token with no scopes should be forbidden
	resp := s.client.GET("/api/v2/documents",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.projectID),
	)
	// Should be 403 Forbidden (no documents:read scope)
	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestDocuments_AllowsReadScope() {
	// Token with documents:read scope should succeed
	resp := s.client.GET("/api/v2/documents",
		testutil.WithAuth("with-scope"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestDocuments_AllowsAllScopes() {
	// Token with all scopes should succeed
	resp := s.client.GET("/api/v2/documents",
		testutil.WithAuth("all-scopes"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestDocumentsCreate_DeniesReadOnlyToken() {
	// Token without documents:write scope should be forbidden for POST
	resp := s.client.POST("/api/v2/documents",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"filename": "test.txt",
			"content":  "test content",
		}),
	)
	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestDocumentsCreate_AllowsWriteScope() {
	// Token with documents:write scope should succeed (or 400 for validation)
	resp := s.client.POST("/api/v2/documents",
		testutil.WithAuth("with-scope"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{
			"filename": "test.txt",
			"content":  "test content",
		}),
	)
	// Accept 201 (created), 200 (ok), or 400/422 (validation error - auth passed)
	s.Contains([]int{http.StatusOK, http.StatusCreated, http.StatusBadRequest, http.StatusUnprocessableEntity}, resp.StatusCode)
}

// =============================================================================
// Test: Chat Endpoint Scope Enforcement
// =============================================================================

func (s *SecurityScopesTestSuite) TestChat_RequiresAuth() {
	resp := s.client.GET("/api/v2/chat/conversations",
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestChat_DeniesNoScopeToken() {
	resp := s.client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestChat_AllowsChatScope() {
	resp := s.client.GET("/api/v2/chat/conversations",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

// =============================================================================
// Test: Graph Endpoint Scope Enforcement
// Note: Go server uses /api/v2/graph/objects/search for listing objects
// Go server requires auth but not specific scopes for graph endpoints
// =============================================================================

func (s *SecurityScopesTestSuite) TestGraph_RequiresAuth() {
	resp := s.client.GET("/api/v2/graph/objects/search",
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestGraph_AllowsAnyAuthenticatedUser() {
	// Go server doesn't enforce scopes on graph endpoints, just requires auth
	resp := s.client.GET("/api/v2/graph/objects/search",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.projectID),
	)
	// Go server: 200 (no scope enforcement) or NestJS: 403 (scope required)
	s.Contains([]int{http.StatusOK, http.StatusForbidden}, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestGraph_AllowsGraphReadScope() {
	resp := s.client.GET("/api/v2/graph/objects/search",
		testutil.WithAuth("graph-read"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

// =============================================================================
// Test: Search Endpoint Scope Enforcement
// Note: Go server uses /api/v2/search/unified for search
// =============================================================================

func (s *SecurityScopesTestSuite) TestSearch_RequiresAuth() {
	resp := s.client.POST("/api/v2/search/unified",
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{"query": "test"}),
	)
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestSearch_DeniesNoScopeToken() {
	resp := s.client.POST("/api/v2/search/unified",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{"query": "test"}),
	)
	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestSearch_AllowsSearchScope() {
	resp := s.client.POST("/api/v2/search/unified",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.projectID),
		testutil.WithJSONBody(map[string]any{"query": "test"}),
	)
	// Accept 200 (success) or 400 (validation - auth passed)
	s.Contains([]int{http.StatusOK, http.StatusBadRequest}, resp.StatusCode)
}

// =============================================================================
// Test: Chunks Endpoint Scope Enforcement
// =============================================================================

func (s *SecurityScopesTestSuite) TestChunks_RequiresAuth() {
	resp := s.client.GET("/api/v2/chunks",
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestChunks_DeniesNoScopeToken() {
	resp := s.client.GET("/api/v2/chunks",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusForbidden, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestChunks_AllowsReadScope() {
	resp := s.client.GET("/api/v2/chunks",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(s.projectID),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

// =============================================================================
// Test: Projects Endpoint Scope Enforcement
// Note: Go server requires auth but doesn't enforce scopes on projects
// =============================================================================

func (s *SecurityScopesTestSuite) TestProjects_RequiresAuth() {
	resp := s.client.GET("/api/v2/projects")
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestProjects_AllowsAnyAuthenticatedUser() {
	// Go server doesn't enforce scopes on projects endpoint
	resp := s.client.GET("/api/v2/projects",
		testutil.WithAuth("no-scope"),
	)
	// Go server: 200 (no scope enforcement) or NestJS: 403 (scope required)
	s.Contains([]int{http.StatusOK, http.StatusForbidden}, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestProjects_AllowsProjectReadScope() {
	resp := s.client.GET("/api/v2/projects",
		testutil.WithAuth("with-scope"),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

// =============================================================================
// Test: Orgs Endpoint Scope Enforcement
// Note: Go server requires auth but doesn't enforce scopes on orgs
// =============================================================================

func (s *SecurityScopesTestSuite) TestOrgs_RequiresAuth() {
	resp := s.client.GET("/api/v2/orgs")
	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestOrgs_AllowsAnyAuthenticatedUser() {
	// Go server doesn't enforce scopes on orgs endpoint
	resp := s.client.GET("/api/v2/orgs",
		testutil.WithAuth("no-scope"),
	)
	// Go server: 200 (no scope enforcement) or NestJS: 403 (scope required)
	s.Contains([]int{http.StatusOK, http.StatusForbidden}, resp.StatusCode)
}

func (s *SecurityScopesTestSuite) TestOrgs_AllowsOrgReadScope() {
	resp := s.client.GET("/api/v2/orgs",
		testutil.WithAuth("read-only"),
	)
	s.Equal(http.StatusOK, resp.StatusCode)
}

// =============================================================================
// Test: Scope Matrix - Table-Driven Tests
// Note: This tests endpoints that have consistent scope enforcement across
// both Go and NestJS servers. Endpoints with different behavior are tested
// individually above.
// =============================================================================

func (s *SecurityScopesTestSuite) TestScopeMatrix() {
	tests := []struct {
		name           string
		method         string
		path           string
		token          string
		expectedStatus int
		body           map[string]any
	}{
		// Documents - Read (scope enforced on both servers)
		{"docs GET with no-scope", "GET", "/api/v2/documents", "no-scope", http.StatusForbidden, nil},
		{"docs GET with read-only", "GET", "/api/v2/documents", "read-only", http.StatusOK, nil},
		{"docs GET with all-scopes", "GET", "/api/v2/documents", "all-scopes", http.StatusOK, nil},

		// Graph - Read (uses /search path in Go server, no scope enforcement)
		// Go server doesn't require scopes for graph, just auth
		{"graph GET with graph-read", "GET", "/api/v2/graph/objects/search", "graph-read", http.StatusOK, nil},
		{"graph GET with all-scopes", "GET", "/api/v2/graph/objects/search", "all-scopes", http.StatusOK, nil},

		// Chunks - Read (scope enforced on both servers)
		{"chunks GET with no-scope", "GET", "/api/v2/chunks", "no-scope", http.StatusForbidden, nil},
		{"chunks GET with read-only", "GET", "/api/v2/chunks", "read-only", http.StatusOK, nil},

		// Chat - requires chat:use scope (scope enforced on both servers)
		{"chat GET with no-scope", "GET", "/api/v2/chat/conversations", "no-scope", http.StatusForbidden, nil},
		{"chat GET with e2e-test-user", "GET", "/api/v2/chat/conversations", "e2e-test-user", http.StatusOK, nil},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			opts := []testutil.RequestOption{
				testutil.WithAuth(tt.token),
				testutil.WithProjectID(s.projectID),
			}
			if tt.body != nil {
				opts = append(opts, testutil.WithJSONBody(tt.body))
			}

			var resp *testutil.HTTPResponse
			switch tt.method {
			case "GET":
				resp = s.client.GET(tt.path, opts...)
			case "POST":
				resp = s.client.POST(tt.path, opts...)
			case "PUT":
				resp = s.client.PUT(tt.path, opts...)
			case "DELETE":
				resp = s.client.DELETE(tt.path, opts...)
			}

			s.Equal(tt.expectedStatus, resp.StatusCode, "Expected %d for %s %s with token %s, got %d",
				tt.expectedStatus, tt.method, tt.path, tt.token, resp.StatusCode)
		})
	}
}
