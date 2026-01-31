package e2e

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// EventsTestSuite tests the events API endpoints
type EventsTestSuite struct {
	testutil.BaseSuite
}

func TestEventsSuite(t *testing.T) {
	suite.Run(t, new(EventsTestSuite))
}

func (s *EventsTestSuite) SetupSuite() {
	s.SetDBSuffix("events")
	s.BaseSuite.SetupSuite()
}

// =============================================================================
// Test: Get Connections Count
// =============================================================================

func (s *EventsTestSuite) TestGetConnectionsCount_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.Client.GET("/events/connections/count")

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EventsTestSuite) TestGetConnectionsCount_ReturnsZeroInitially() {
	// With no active SSE connections, should return 0
	resp := s.Client.GET("/events/connections/count",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	var result map[string]int
	err := json.Unmarshal(resp.Body, &result)
	s.NoError(err)

	s.Equal(0, result["count"], "Should return 0 when no connections")
}

func (s *EventsTestSuite) TestGetConnectionsCount_ReturnsValidJSON() {
	resp := s.Client.GET("/events/connections/count",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusOK, resp.StatusCode)

	// Verify response is valid JSON with count field
	var result map[string]any
	err := json.Unmarshal(resp.Body, &result)
	s.NoError(err)

	_, hasCount := result["count"]
	s.True(hasCount, "Response should have 'count' field")
}

func (s *EventsTestSuite) TestGetConnectionsCount_AcceptsAllTokens() {
	// Test with different token types
	tokens := []string{
		"e2e-test-user",
		"all-scopes",
		"read-only",
	}

	for _, token := range tokens {
		resp := s.Client.GET("/events/connections/count",
			testutil.WithAuth(token),
		)

		s.Equal(http.StatusOK, resp.StatusCode, "Token %s should be accepted", token)
	}
}

// =============================================================================
// Test: SSE Stream Endpoint
// =============================================================================

func (s *EventsTestSuite) TestStream_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.Client.GET("/events/stream")

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *EventsTestSuite) TestStream_RequiresProjectID() {
	// Request without projectId query param should fail
	resp := s.Client.GET("/events/stream",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var result map[string]string
	err := json.Unmarshal(resp.Body, &result)
	s.NoError(err)

	s.Contains(result["error"], "projectId", "Error should mention missing projectId")
}

// Note: We cannot easily test SSE streaming with httptest as the connection stays open.
// The actual SSE streaming functionality would need integration tests with a real HTTP client.
