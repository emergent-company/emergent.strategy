package e2e

import (
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// HealthTestSuite tests the health endpoints.
//
// Environment variables:
//   - TEST_SERVER_URL: External server URL (e.g., "http://localhost:3002")
//   - If not set, uses in-process Go test server (requires DB access)
type HealthTestSuite struct {
	suite.Suite
	client *testutil.HTTPClient

	// For in-process testing only
	testDB *testutil.TestDB
	server *testutil.TestServer
}

func TestHealthSuite(t *testing.T) {
	suite.Run(t, new(HealthTestSuite))
}

func (s *HealthTestSuite) SetupSuite() {
	if serverURL := os.Getenv("TEST_SERVER_URL"); serverURL != "" {
		s.T().Logf("Using external server: %s", serverURL)
		s.client = testutil.NewExternalHTTPClient(serverURL)
	} else {
		s.T().Log("Using in-process test server")

		testDB, err := testutil.SetupTestDB(s.Suite.T().Context(), "health")
		s.Require().NoError(err, "Failed to setup test database")
		s.testDB = testDB

		s.server = testutil.NewTestServer(testDB)
		s.client = testutil.NewHTTPClient(s.server.Echo)
	}
}

func (s *HealthTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *HealthTestSuite) SetupTest() {
	if s.testDB != nil {
		err := testutil.TruncateTables(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)
	}
}

// TestHealthEndpoint tests GET /health returns full health status
func (s *HealthTestSuite) TestHealthEndpoint() {
	resp := s.client.GET("/health")

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	// Check response structure
	s.Equal("healthy", body["status"])
	s.Contains(body, "timestamp")
	s.Contains(body, "uptime")
	s.Contains(body, "version")
	s.Contains(body, "checks")

	// Check database health check
	checks, ok := body["checks"].(map[string]any)
	s.True(ok)
	s.Contains(checks, "database")

	dbCheck, ok := checks["database"].(map[string]any)
	s.True(ok)
	s.Equal("healthy", dbCheck["status"])
}

// TestHealthzEndpoint tests GET /healthz returns simple OK
func (s *HealthTestSuite) TestHealthzEndpoint() {
	resp := s.client.GET("/healthz")

	s.Equal(http.StatusOK, resp.StatusCode)
	s.Equal("OK", resp.String())
}

// TestReadyEndpoint tests GET /ready returns readiness status
func (s *HealthTestSuite) TestReadyEndpoint() {
	resp := s.client.GET("/ready")

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)
	s.Equal("ready", body["status"])
}

// TestDebugEndpoint tests GET /debug returns debug information
func (s *HealthTestSuite) TestDebugEndpoint() {
	resp := s.client.GET("/debug")

	s.Equal(http.StatusOK, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	// Check response contains expected fields
	s.Contains(body, "environment")
	s.Contains(body, "go_version")
	s.Contains(body, "goroutines")
	s.Contains(body, "memory")
	s.Contains(body, "database")

	// Check database stats
	dbStats, ok := body["database"].(map[string]any)
	s.True(ok)
	s.Contains(dbStats, "pool_total")
	s.Contains(dbStats, "pool_idle")
}

// TestHealthNoAuth tests that health endpoints don't require authentication
func (s *HealthTestSuite) TestHealthNoAuth() {
	// Health endpoints should work without any auth headers
	endpoints := []string{"/health", "/healthz", "/ready", "/debug"}

	for _, endpoint := range endpoints {
		resp := s.client.GET(endpoint)
		s.NotEqual(http.StatusUnauthorized, resp.StatusCode, "Endpoint %s should not require auth", endpoint)
		s.NotEqual(http.StatusForbidden, resp.StatusCode, "Endpoint %s should not require auth", endpoint)
	}
}
